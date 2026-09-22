/**
 * Scoped audit-log helper (Phase 6).
 *
 * Writes an AdminActivityLog row each time a sub-admin / broker writes or
 * clears a scoped override (segment / reorder / risk). Keeps the payload small
 * — enough to answer "who changed what and when" without mirroring full
 * before/after documents.
 *
 * Never throws — audit failure must not block the user's write.
 */

const AdminActivityLog = require('../models/AdminActivityLog');

function extractRequestInfo(req) {
  const ua = (req && req.headers && req.headers['user-agent']) || '';
  return {
    ipAddress: (req && (req.ip || (req.headers && req.headers['x-forwarded-for']))) || '',
    userAgent: ua,
    device: /Mobile/i.test(ua) ? 'mobile' : /Tablet/i.test(ua) ? 'tablet' : 'desktop',
  };
}

/**
 * @param {Object}  params
 * @param {Object}  params.req      — Express request (for IP / UA).
 * @param {Object}  params.admin    — req.admin resolved by middleware.
 * @param {string}  params.activityType — one of the scoped_* enum values.
 * @param {string}  params.description   — short human-readable summary.
 * @param {Object=} params.metadata      — structured details ({ mode, name, fields, affectedUsers, ... }).
 */
async function logScopedChange({ req, admin, activityType, description, metadata = {} }) {
  try {
    await AdminActivityLog.logActivity({
      adminId: String(admin._id),
      oderId: admin.oderId || String(admin._id),
      role: admin.role,
      activityType,
      description,
      metadata,
      ...extractRequestInfo(req),
      status: 'success',
    });
  } catch (err) {
    // Never let audit failure break the caller.
    console.error('[scopedAuditLog] failed to log:', err.message);
  }
}

module.exports = { logScopedChange };
