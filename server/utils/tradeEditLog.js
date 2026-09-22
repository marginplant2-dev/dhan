const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Admin = require('../models/Admin');

const JWT_SECRET = process.env.JWT_SECRET || 'BharatFundedTrade-secret-key-2024';

/**
 * Who is calling admin trade APIs: platform super-admin (User.role === 'admin' JWT),
 * Admin document (sub_admin / broker / super_admin via admin- token or login-as JWT).
 */
async function resolveTradeEditActor(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  const token = h.split(' ')[1];
  if (!token) return null;

  if (token.startsWith('admin-')) {
    const id = token.slice('admin-'.length);
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const admin = await Admin.findById(id).select('_id name oderId role isActive');
    if (!admin || admin.isActive === false) return null;
    if (!['super_admin', 'sub_admin', 'broker'].includes(admin.role)) return null;
    return {
      adminId: admin._id,
      adminName: admin.name || admin.oderId || 'Staff',
      adminRole: admin.role
    };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return null;
  }

  const rawId = decoded.id || decoded.userId || decoded.sub;
  if (!rawId || !mongoose.Types.ObjectId.isValid(String(rawId))) return null;

  const adminDoc = await Admin.findById(rawId).select('_id name oderId role isActive');
  if (adminDoc && adminDoc.isActive !== false) {
    return {
      adminId: adminDoc._id,
      adminName: adminDoc.name || adminDoc.oderId || 'Admin',
      adminRole: adminDoc.role
    };
  }

  const platformUser = await User.findById(rawId).select('_id name oderId role');
  if (platformUser && platformUser.role === 'admin') {
    return {
      adminId: platformUser._id,
      adminName: platformUser.name || platformUser.oderId || 'Super Admin',
      adminRole: 'super_admin'
    };
  }

  return null;
}

async function resolveTradeOwnerUser(userDoc, tradeUserId) {
  if (userDoc && userDoc._id) return userDoc;
  if (tradeUserId == null || tradeUserId === '') return null;
  const uid = String(tradeUserId);
  const or = [{ oderId: uid }];
  if (mongoose.Types.ObjectId.isValid(uid)) {
    try {
      or.push({ _id: new mongoose.Types.ObjectId(uid) });
    } catch (_) {
      /* ignore */
    }
  }
  return User.findOne({ $or: or });
}

/**
 * Persist audit row for Edited Trades table. actor comes from Authorization (JWT or admin-<id>).
 */
async function saveAdminTradeEditLog(req, { userDoc, tradeUserId, tradeId, action, remark }) {
  const actor = await resolveTradeEditActor(req);
  if (!actor) {
    console.warn('[AdminTradeEditLog] Could not resolve staff from Authorization; log skipped.');
    return;
  }
  const user = await resolveTradeOwnerUser(userDoc, tradeUserId);
  if (!user) {
    console.warn('[AdminTradeEditLog] Could not resolve trade owner user; log skipped.');
    return;
  }
  const AdminTradeEditLog = require('../models/AdminTradeEditLog');
  const roleLabel = String(actor.adminRole || '').replace(/_/g, ' ');
  const prefix = `[${actor.adminName} — ${roleLabel}] `;
  const fullRemark = remark.startsWith(prefix) ? remark : prefix + remark;
  try {
    await new AdminTradeEditLog({
      adminId: actor.adminId,
      adminName: actor.adminName,
      adminRole: actor.adminRole,
      userId: user._id,
      userName: user.name || user.oderId || 'Unknown User',
      tradeId: String(tradeId),
      action,
      remark: fullRemark
    }).save();
  } catch (e) {
    console.error('[AdminTradeEditLog] save failed:', e.message);
  }
}

module.exports = {
  resolveTradeEditActor,
  saveAdminTradeEditLog
};
