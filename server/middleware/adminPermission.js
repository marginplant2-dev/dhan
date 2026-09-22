/**
 * Admin permission + scope middleware (Phase 1).
 *
 * Provides:
 *   - resolveAdminFromRequest(req)  : unifies the two admin auth schemes
 *       (User.role==='admin' JWT  ||  'Bearer admin-<ObjectId>') into a single
 *       Admin document. Super-admin still lives on the User collection today;
 *       we synthesize a virtual Admin view for them until Phase-N migration.
 *
 *   - requirePermission(key)        : Express middleware that rejects the
 *       request with 403 unless the admin has that permission key (or is a
 *       super_admin, which shortcuts to allow).
 *
 *   - getScopedUserIds(adminId)     : returns an array of User._id values
 *       an admin is allowed to affect. Super-admin returns null (meaning
 *       "all users"). Sub-admin returns their full subtree (direct users +
 *       users under brokers they created). Broker returns direct users.
 *       Bank-user returns null (operates on all funds but that's scoped
 *       by the permission itself, not user subset).
 *
 *   - attachScope                   : middleware that populates `req.adminScope`
 *       with { adminId, role, scopedUserIds|null, isAll: boolean } so route
 *       handlers can do `req.adminScope.isAll ? writeGlobal : writeScoped(ids)`.
 *
 * Nothing here decides whether an incoming route uses global vs scoped writes.
 * That's Phase 3's job. This module just provides the primitives.
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const User = require('../models/User');

/**
 * Try every known admin-auth path and return an Admin-shaped object.
 * Returns null if the request isn't authenticated as any kind of admin.
 */
async function resolveAdminFromRequest(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  // Path 1 — sub-admin / broker / bank-user custom token: "admin-<ObjectId>"
  if (token.startsWith('admin-')) {
    const id = token.slice(6);
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const admin = await Admin.findById(id);
    if (!admin || !admin.isActive) return null;
    return admin;
  }

  // Path 2 — JWT. Could be either a User (role:'admin' = legacy super-admin)
  // or an Admin-model user once migrated.
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
  const id = decoded?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;

  // First try Admin model (post-migration path).
  const directAdmin = await Admin.findById(id);
  if (directAdmin && directAdmin.isActive) return directAdmin;

  // Fall back to legacy User-as-admin. Synthesize an Admin-shaped view so
  // downstream code doesn't need to care which collection it came from.
  const user = await User.findById(id);
  if (user && user.role === 'admin' && user.isActive !== false) {
    return _synthesizeSuperAdminView(user);
  }
  return null;
}

/**
 * Legacy super-admin support: the login route still stores super-admins in
 * `User`. Return a minimal Admin-compatible object with permissions=all, role
 * =super_admin, so `requirePermission` + scope resolver work without a DB
 * migration. Phase-N will move the actual doc.
 */
function _synthesizeSuperAdminView(user) {
  const permissions = Object.fromEntries(Admin.PERMISSION_KEYS.map(k => [k, true]));
  return {
    _id: user._id,
    oderId: user.oderId,
    email: user.email,
    name: user.name || 'Super Admin',
    role: 'super_admin',
    isActive: user.isActive !== false,
    permissions,
    parentId: null,
    parentOderId: null,
    hasPermission(_key) { return true; },
    canManage() { return true; },
    _syntheticSuperAdmin: true,
  };
}

/**
 * Route middleware factory. Usage:
 *     app.put('/api/admin/scoped/.../segments/:name',
 *         requirePermission('nettingSegment.edit'),
 *         attachScope,
 *         handler);
 */
function requirePermission(key) {
  return async function permissionMiddleware(req, res, next) {
    try {
      const admin = await resolveAdminFromRequest(req);
      if (!admin) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      // Super-admin always passes. hasPermission handles that shortcut.
      if (!admin.hasPermission(key)) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: permission '${key}' required`,
        });
      }
      req.admin = admin;
      return next();
    } catch (err) {
      console.error('[requirePermission] error:', err);
      return res.status(500).json({ success: false, error: 'Permission check failed' });
    }
  };
}

/**
 * Walks the Admin → Admin parentId graph to collect every admin in the subtree
 * (including the root). Used to answer "which brokers are under this sub-admin".
 */
async function getAdminSubtreeIds(rootAdminId) {
  const all = new Set([String(rootAdminId)]);
  let frontier = [rootAdminId];
  while (frontier.length) {
    const kids = await Admin.find({ parentId: { $in: frontier } }).select('_id').lean();
    frontier = [];
    for (const k of kids) {
      const s = String(k._id);
      if (!all.has(s)) {
        all.add(s);
        frontier.push(k._id);
      }
    }
  }
  return Array.from(all).map(s => new mongoose.Types.ObjectId(s));
}

/**
 * Returns the list of User._id values an admin may affect.
 *   - super_admin  → null (means "all users", caller treats as unscoped)
 *   - sub_admin    → users with parentAdminId in this sub-admin's subtree
 *   - broker       → users with parentAdminId === broker._id (direct only)
 *   - bank_user    → null (bank-user permissions are data-scoped by permission,
 *                    not by user subset — e.g. 'deposits.approve' already
 *                    encodes "all deposits", regardless of user)
 */
async function getScopedUserIds(admin) {
  if (!admin) return [];
  if (admin.role === 'super_admin' || admin.role === 'bank_user') return null;

  if (admin.role === 'broker') {
    const rows = await User.find({ parentAdminId: admin._id }).select('_id').lean();
    return rows.map(r => r._id);
  }

  if (admin.role === 'sub_admin') {
    const subtreeAdminIds = await getAdminSubtreeIds(admin._id);
    const rows = await User.find({ parentAdminId: { $in: subtreeAdminIds } }).select('_id').lean();
    return rows.map(r => r._id);
  }

  return [];
}

/**
 * Populates req.adminScope. Must be placed AFTER requirePermission so req.admin
 * is already resolved.
 */
async function attachScope(req, res, next) {
  try {
    if (!req.admin) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userIds = await getScopedUserIds(req.admin);
    req.adminScope = {
      adminId: req.admin._id,
      role: req.admin.role,
      scopedUserIds: userIds,            // null = all
      isAll: userIds === null,
    };
    return next();
  } catch (err) {
    console.error('[attachScope] error:', err);
    return res.status(500).json({ success: false, error: 'Scope resolution failed' });
  }
}

/** Layer corresponding to the role that's writing. super_admin writes global
 * or user_explicit depending on caller's intent, so we don't default it. */
function layerForWriterRole(role) {
  if (role === 'sub_admin') return 'sub_admin';
  if (role === 'broker') return 'broker';
  if (role === 'super_admin') return 'user_explicit'; // super-admin per-user edits
  return null;
}

/**
 * A filter that matches nothing. An empty scope must return an empty page —
 * never "no filter" (spec §4).
 */
const MATCH_NOTHING = { _id: { $in: [] } };

/**
 * Mongo filter fragment restricting a User query to the rows this admin owns.
 * Merge it into any query that returns or touches users.
 *
 * Trap 5: super-admin owns the PLATFORM POOL (users with no admin), not
 * "everything" — a user parked under an admin belongs to that admin.
 *
 * Prefer this over getScopedUserIds(): it stays one indexed query instead of
 * materialising every id, and it can never degrade into an unfiltered read.
 */
async function scopeUserFilter(admin) {
  if (!admin) return MATCH_NOTHING;
  switch (admin.role) {
    case 'super_admin': return { parentAdminId: null };
    // Funds desk works platform-wide by design — its permissions, not a user
    // subset, are what limit it.
    case 'bank_user':   return {};
    case 'broker':      return { parentAdminId: admin._id };
    case 'sub_admin':   return { parentAdminId: { $in: await getAdminSubtreeIds(admin._id) } };
    default:            return MATCH_NOTHING;
  }
}

/** True when `userId` (ObjectId or oderId) is inside this admin's scope. */
async function userInScope(admin, userId) {
  const id = String(userId || '');
  if (!id) return false;
  const scope = await scopeUserFilter(admin);
  const idMatch = mongoose.Types.ObjectId.isValid(id)
    ? { $or: [{ _id: new mongoose.Types.ObjectId(id) }, { oderId: id }] }
    : { oderId: id };
  return !!(await User.exists({ $and: [scope, idMatch] }));
}

/**
 * Cap rule (§3): nobody grants more than they hold. Returns a copy of `perms`
 * with every key the granter does not hold forced to false, plus the list of
 * keys that were clipped so the caller can report them.
 */
function capPermissions(granter, perms) {
  const out = { ...(perms || {}) };
  const clipped = [];
  for (const key of Object.keys(out)) {
    if (out[key] === true && !granter.hasPermission(key)) {
      out[key] = false;
      clipped.push(key);
    }
  }
  return { permissions: out, clipped };
}

module.exports = {
  resolveAdminFromRequest,
  scopeUserFilter,
  userInScope,
  capPermissions,
  requirePermission,
  attachScope,
  getScopedUserIds,
  getAdminSubtreeIds,
  layerForWriterRole,
};
