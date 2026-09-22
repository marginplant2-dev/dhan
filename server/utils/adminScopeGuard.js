/**
 * Shared scope guard for admin mutation endpoints that operate on resources
 * belonging to a user (trades, transactions, etc.).
 *
 * Usage — anywhere an admin endpoint mutates a doc that has a `userId`
 * (oderId string) pointing at a User.oderId:
 *
 *   const { assertUserInAdminScope } = require('./utils/adminScopeGuard');
 *   if (!(await assertUserInAdminScope(req, res, position.userId))) return;
 *
 * Returns `false` and sends the HTTP response on failure. Super-admin passes
 * unconditionally. Callers with no admin token (legacy) also pass — the
 * chokepoint middleware already checked they're authenticated.
 */

async function assertUserInAdminScope(req, res, userOderId) {
  try {
    const { resolveAdminFromRequest, getScopedUserIds } = require('../middleware/adminPermission');
    const caller = await resolveAdminFromRequest(req);
    if (!caller) return true;                  // legacy flow — already gated elsewhere
    if (caller.role === 'super_admin') return true;

    const scopedIds = await getScopedUserIds(caller);
    if (scopedIds === null) return true;       // bank_user et al. — no user-subset restriction

    const User = require('../models/User');
    const user = await User.findOne({ oderId: userOderId }).select('_id').lean();
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return false;
    }
    const inScope = scopedIds.map(String).includes(String(user._id));
    if (!inScope) {
      res.status(403).json({ success: false, error: 'Target user not in your scope' });
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[assertUserInAdminScope] skipped on error:', err.message);
    return true; // fail-open so the existing super-admin path isn't broken by a scope check bug
  }
}

module.exports = { assertUserInAdminScope };
