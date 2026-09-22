/**
 * Scoped admin routes (Phase 3).
 *
 * Mounted at /api/admin/scoped from server/index.js. Every route is wrapped
 * in `requirePermission(...)` + `attachScope` so handlers get:
 *   - req.admin        — resolved Admin (or synthesized super-admin view)
 *   - req.adminScope   — { adminId, role, scopedUserIds, isAll }
 *
 * Writes go to the LAYERED override tables (UserSegmentSettings, etc.) —
 * never to the global NettingSegment / HedgingSegment docs. Super-admin still
 * edits globals via the existing /api/admin/segments/* routes (unchanged).
 *
 * The "read" endpoints return the global segment defaults PLUS a map of
 * fields currently overridden by this admin, so the UI can show both values.
 */

const express = require('express');
const router = express.Router();

const { requirePermission, attachScope } = require('../middleware/adminPermission');
const NettingSegment = require('../models/NettingSegment');
const HedgingSegment = require('../models/HedgingSegment');
const UserSegmentSettings = require('../models/UserSegmentSettings');
const UserRiskSettings = require('../models/UserRiskSettings');
const ReorderSettings = require('../models/ReorderSettings');
const {
  filterEditableFields,
  resolveSegmentByName,
  applyScopedSegmentOverride,
  clearScopedSegmentOverride,
} = require('../services/scopedSegmentOverride');
const { logScopedChange } = require('../services/scopedAuditLog');

const MODES = { netting: NettingSegment, hedging: HedgingSegment };

/* ═════════════════════════════════════════════════════════════════════════
 * GET  /segments/:mode                  — list segments + admin's overrides
 * GET  /segments/:mode/:name            — segment default + override snapshot
 * PUT  /segments/:mode/:name            — write override for admin's users
 * DELETE /segments/:mode/:name          — clear admin's overrides for segment
 * ═════════════════════════════════════════════════════════════════════════ */

function modeValid(req, res, next) {
  const mode = req.params.mode;
  if (!MODES[mode]) {
    return res.status(400).json({ success: false, error: `Invalid mode '${mode}' — use 'netting' or 'hedging'` });
  }
  req.segmentMode = mode;
  req.segmentPrefix = mode === 'hedging' ? 'hedgingSegment' : 'nettingSegment';
  next();
}

// ─── List segments ──────────────────────────────────────────────────────────
router.get(
  '/segments/:mode',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.view`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      const Model = MODES[req.segmentMode];
      const segments = await Model.find({}).lean();

      // For each segment, count how many of this admin's users are overridden
      // (includes script-specific overrides — matches pre-existing behavior).
      const adminOverrides = await UserSegmentSettings.find({
        setByAdminId: req.admin._id,
        tradeMode: req.segmentMode,
      }).select('segmentId userId').lean();

      const overrideCountBySegment = adminOverrides.reduce((acc, r) => {
        const k = String(r.segmentId);
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});

      // Also pull full segment-wide override rows so we can merge this admin's
      // saved values into each segment in the response. Without this merge the
      // sub-admin/broker inline table always snaps back to the global baseline
      // after save, even though the write DID persist to UserSegmentSettings.
      const segmentWideOverrides = await UserSegmentSettings.find({
        setByAdminId: req.admin._id,
        tradeMode: req.segmentMode,
        symbol: null,
      }).lean();

      // One representative override row per segmentId (all rows for a given
      // segment should carry identical field values — they were written as a
      // bulk fan-out across every user in this admin's scope).
      const overrideBySegment = {};
      for (const ov of segmentWideOverrides) {
        const k = String(ov.segmentId);
        if (!overrideBySegment[k]) overrideBySegment[k] = ov;
      }

      const RESERVED = new Set([
        '_id', '__v', 'userId', 'oderId', 'segmentId', 'segmentName',
        'setByAdminId', 'setByRole', 'tradeMode', 'layer', 'symbol',
        'createdAt', 'updatedAt',
      ]);

      res.json({
        success: true,
        segments: segments.map(s => {
          const out = {
            ...s,
            overriddenUserCount: overrideCountBySegment[String(s._id)] || 0,
          };
          const ov = overrideBySegment[String(s._id)];
          if (ov) {
            for (const [k, v] of Object.entries(ov)) {
              if (RESERVED.has(k)) continue;
              if (v === null || v === undefined) continue;
              out[k] = v;
            }
          }
          return out;
        }),
        scope: {
          role: req.adminScope.role,
          affectedUserCount: req.adminScope.isAll ? null : req.adminScope.scopedUserIds.length,
        },
      });
    } catch (err) {
      console.error('[scoped/segments] list error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── Read one segment + current override values for admin's scope ──────────
router.get(
  '/segments/:mode/:name',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.view`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      const Model = MODES[req.segmentMode];
      const segment = await Model.findOne({ name: req.params.name }).lean();
      if (!segment) {
        return res.status(404).json({ success: false, error: `Segment '${req.params.name}' not found` });
      }

      // Pull any override rows this admin has written for this segment.
      const overrides = await UserSegmentSettings.find({
        setByAdminId: req.admin._id,
        segmentId: segment._id,
        tradeMode: req.segmentMode,
        symbol: null,  // only segment-wide rows for now
      }).lean();

      // Count how many user_explicit overrides (from super-admin) exist for
      // users in this admin's scope — informs the 🔒 lock indicator on the UI.
      let lockedUserExplicitCount = 0;
      if (!req.adminScope.isAll && req.adminScope.scopedUserIds.length) {
        lockedUserExplicitCount = await UserSegmentSettings.countDocuments({
          userId: { $in: req.adminScope.scopedUserIds },
          segmentId: segment._id,
          tradeMode: req.segmentMode,
          layer: 'user_explicit',
        });
      }

      // Pick a representative override (they should be identical across all
      // this admin's users for segment-wide edits). Use the first row to show
      // the current values in the form.
      const current = overrides[0] || null;
      res.json({
        success: true,
        segment,
        currentOverride: current,
        overriddenUserCount: overrides.length,
        lockedByUserExplicitCount: lockedUserExplicitCount,
        scope: {
          role: req.adminScope.role,
          affectedUserCount: req.adminScope.isAll ? null : req.adminScope.scopedUserIds.length,
        },
      });
    } catch (err) {
      console.error('[scoped/segments] read error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── Write override ────────────────────────────────────────────────────────
router.put(
  '/segments/:mode/:name',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.edit`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      if (req.adminScope.isAll) {
        return res.status(400).json({
          success: false,
          error: "Super-admin should edit global segments via /api/admin/segments — scoped endpoints are for sub-admin/broker overrides only.",
        });
      }
      const segment = await resolveSegmentByName(req.segmentMode, req.params.name);
      if (!segment) {
        return res.status(404).json({ success: false, error: `Segment '${req.params.name}' not found` });
      }
      const filtered = filterEditableFields(req.admin, req.segmentMode, req.body || {});
      if (!Object.keys(filtered).length) {
        return res.status(400).json({
          success: false,
          error: 'No editable fields in payload — you may lack the required sub-permissions for these fields',
        });
      }
      const result = await applyScopedSegmentOverride({
        admin: req.admin,
        segmentId: segment._id,
        segmentName: segment.name,
        tradeMode: req.segmentMode,
        symbol: null,
        fields: filtered,
        scopedUserIds: req.adminScope.scopedUserIds,
      });
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_segment_write',
        description: `${req.segmentMode} segment '${segment.name}' override saved (${result.affectedUsers} users)`,
        metadata: {
          mode: req.segmentMode,
          segmentName: segment.name,
          segmentId: String(segment._id),
          fields: filtered,
          fieldsApplied: Object.keys(filtered),
          affectedUsers: result.affectedUsers,
          upsertedCount: result.upsertedCount,
          modifiedCount: result.modifiedCount,
        },
      });
      res.json({
        success: true,
        fieldsApplied: Object.keys(filtered),
        ...result,
      });
    } catch (err) {
      console.error('[scoped/segments] write error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── Clear override (reset to default) ─────────────────────────────────────
router.delete(
  '/segments/:mode/:name',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.edit`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      const segment = await resolveSegmentByName(req.segmentMode, req.params.name);
      if (!segment) {
        return res.status(404).json({ success: false, error: `Segment '${req.params.name}' not found` });
      }
      const result = await clearScopedSegmentOverride({
        admin: req.admin,
        segmentId: segment._id,
        tradeMode: req.segmentMode,
        symbol: null,
        scopedUserIds: req.adminScope.isAll ? null : req.adminScope.scopedUserIds,
      });
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_segment_clear',
        description: `${req.segmentMode} segment '${segment.name}' override cleared (${result.deletedCount} rows)`,
        metadata: {
          mode: req.segmentMode,
          segmentName: segment.name,
          segmentId: String(segment._id),
          deletedCount: result.deletedCount,
        },
      });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[scoped/segments] clear error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* ═════════════════════════════════════════════════════════════════════════
 * SCRIPT overrides — per-symbol within a segment (e.g. 'RELIANCE' inside NSE_EQ).
 * Same shape as segment overrides but UserSegmentSettings.symbol is set to the
 * actual symbol instead of null. Layer + scope rules are identical.
 *
 * GET    /scripts/:mode                                   — list admin's script overrides
 * GET    /scripts/:mode/:segmentName/:symbol              — read single script override
 * PUT    /scripts/:mode/:segmentName/:symbol              — write override for all scoped users
 * DELETE /scripts/:mode/:segmentName/:symbol              — clear script override
 * GET    /users/:userId/script/:mode/:segmentName/:symbol — per-user read
 * PUT    /users/:userId/script/:mode/:segmentName/:symbol — per-user write
 * DELETE /users/:userId/script/:mode/:segmentName/:symbol — per-user clear
 * ═════════════════════════════════════════════════════════════════════════ */

// List all script overrides this admin has authored (across segments).
router.get(
  '/scripts/:mode',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.view`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);
      const filter = {
        setByAdminId: req.admin._id,
        tradeMode: req.segmentMode,
        symbol: { $ne: null },
      };
      if (layer) filter.layer = layer;
      if (req.query.segment) filter.segmentName = req.query.segment;

      // Group by (segmentName, symbol) — show one row per distinct script
      const rows = await UserSegmentSettings.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { segmentName: '$segmentName', symbol: '$symbol' },
            userCount: { $sum: 1 },
            sample: { $first: '$$ROOT' },
          },
        },
        { $sort: { '_id.segmentName': 1, '_id.symbol': 1 } },
      ]);

      res.json({
        success: true,
        scripts: rows.map(r => ({
          segmentName: r._id.segmentName,
          symbol: r._id.symbol,
          userCount: r.userCount,
          values: {
            commission: r.sample.commission,
            commissionType: r.sample.commissionType,
            defaultLeverage: r.sample.defaultLeverage,
            spreadPips: r.sample.spreadPips,
            minLots: r.sample.minLots,
            maxLots: r.sample.maxLots,
          },
        })),
        scope: {
          role: req.adminScope.role,
          affectedUserCount: req.adminScope.isAll ? null : req.adminScope.scopedUserIds.length,
        },
      });
    } catch (err) {
      console.error('[scoped/scripts] list error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Read a single script override (one representative row for the admin + segment).
router.get(
  '/scripts/:mode/:segmentName/:symbol',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.view`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      const segment = await resolveSegmentByName(req.segmentMode, req.params.segmentName);
      if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);
      const override = await UserSegmentSettings.findOne({
        setByAdminId: req.admin._id,
        segmentId: segment._id,
        tradeMode: req.segmentMode,
        symbol: req.params.symbol,
        ...(layer ? { layer } : {}),
      }).lean();

      res.json({
        success: true,
        segment,
        symbol: req.params.symbol,
        currentOverride: override || null,
        overriddenUserCount: override
          ? await UserSegmentSettings.countDocuments({
              setByAdminId: req.admin._id,
              segmentId: segment._id,
              tradeMode: req.segmentMode,
              symbol: req.params.symbol,
              ...(layer ? { layer } : {}),
            })
          : 0,
      });
    } catch (err) {
      console.error('[scoped/scripts] read error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Bulk write script override (all scoped users)
router.put(
  '/scripts/:mode/:segmentName/:symbol',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.edit`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      if (req.adminScope.isAll) {
        return res.status(400).json({ success: false, error: 'Super-admin should use global script endpoints' });
      }
      const segment = await resolveSegmentByName(req.segmentMode, req.params.segmentName);
      if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });
      const filtered = filterEditableFields(req.admin, req.segmentMode, req.body || {});
      if (!Object.keys(filtered).length) {
        return res.status(400).json({ success: false, error: 'No editable fields in payload' });
      }
      const result = await applyScopedSegmentOverride({
        admin: req.admin,
        segmentId: segment._id,
        segmentName: segment.name,
        tradeMode: req.segmentMode,
        symbol: req.params.symbol,
        fields: filtered,
        scopedUserIds: req.adminScope.scopedUserIds,
      });
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_segment_write',
        description: `${req.segmentMode} script '${segment.name}/${req.params.symbol}' override (${result.affectedUsers} users)`,
        metadata: {
          mode: req.segmentMode, segmentName: segment.name, symbol: req.params.symbol,
          fields: filtered, fieldsApplied: Object.keys(filtered),
          affectedUsers: result.affectedUsers,
          scope: 'script-bulk',
        },
      });
      res.json({ success: true, fieldsApplied: Object.keys(filtered), ...result });
    } catch (err) {
      console.error('[scoped/scripts] write error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Clear script override (all scoped users)
router.delete(
  '/scripts/:mode/:segmentName/:symbol',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.edit`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      const segment = await resolveSegmentByName(req.segmentMode, req.params.segmentName);
      if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });
      const result = await clearScopedSegmentOverride({
        admin: req.admin,
        segmentId: segment._id,
        tradeMode: req.segmentMode,
        symbol: req.params.symbol,
        scopedUserIds: req.adminScope.isAll ? null : req.adminScope.scopedUserIds,
      });
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_segment_clear',
        description: `${req.segmentMode} script '${segment.name}/${req.params.symbol}' cleared (${result.deletedCount} rows)`,
        metadata: { mode: req.segmentMode, segmentName: segment.name, symbol: req.params.symbol, deletedCount: result.deletedCount, scope: 'script-bulk' },
      });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[scoped/scripts] clear error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Per-user script read/write/clear
router.get(
  '/users/:userId/script/:mode/:segmentName/:symbol',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.view`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.userId))) return;
      const segment = await resolveSegmentByName(req.segmentMode, req.params.segmentName);
      if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);
      const override = await UserSegmentSettings.findOne({
        userId: req.params.userId,
        segmentId: segment._id,
        symbol: req.params.symbol,
        tradeMode: req.segmentMode,
        layer,
      }).lean();
      res.json({ success: true, segment, symbol: req.params.symbol, currentOverride: override || null, userId: req.params.userId });
    } catch (err) {
      console.error('[scoped/users/script] read error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.put(
  '/users/:userId/script/:mode/:segmentName/:symbol',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.edit`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.userId))) return;
      const segment = await resolveSegmentByName(req.segmentMode, req.params.segmentName);
      if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });
      const filtered = filterEditableFields(req.admin, req.segmentMode, req.body || {});
      if (!Object.keys(filtered).length) {
        return res.status(400).json({ success: false, error: 'No editable fields' });
      }
      const result = await applyScopedSegmentOverride({
        admin: req.admin,
        segmentId: segment._id,
        segmentName: segment.name,
        tradeMode: req.segmentMode,
        symbol: req.params.symbol,
        fields: filtered,
        scopedUserIds: [req.params.userId],
      });
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_segment_write',
        description: `${req.segmentMode} script '${segment.name}/${req.params.symbol}' per-user for ${req.params.userId}`,
        metadata: {
          mode: req.segmentMode, segmentName: segment.name, symbol: req.params.symbol,
          userId: String(req.params.userId),
          fields: filtered, fieldsApplied: Object.keys(filtered),
          scope: 'script-single-user',
        },
      });
      res.json({ success: true, fieldsApplied: Object.keys(filtered), ...result });
    } catch (err) {
      console.error('[scoped/users/script] write error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.delete(
  '/users/:userId/script/:mode/:segmentName/:symbol',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.edit`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.userId))) return;
      const segment = await resolveSegmentByName(req.segmentMode, req.params.segmentName);
      if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });
      const result = await clearScopedSegmentOverride({
        admin: req.admin,
        segmentId: segment._id,
        tradeMode: req.segmentMode,
        symbol: req.params.symbol,
        scopedUserIds: [req.params.userId],
      });
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_segment_clear',
        description: `${req.segmentMode} script '${segment.name}/${req.params.symbol}' cleared for ${req.params.userId}`,
        metadata: { mode: req.segmentMode, segmentName: segment.name, symbol: req.params.symbol, userId: String(req.params.userId), scope: 'script-single-user' },
      });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[scoped/users/script] clear error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* ═════════════════════════════════════════════════════════════════════════
 * REORDER delays — /reorder (view) · PUT /reorder (bulk write scoped users)
 * ═════════════════════════════════════════════════════════════════════════ */

// Read: current reorder globals + any overrides this admin has set
router.get(
  '/reorder',
  requirePermission('reorder.view'),
  attachScope,
  async (req, res) => {
    try {
      const settings = await ReorderSettings.getSettings();
      const myDelays = (settings.userDelays || []).filter(
        d => String(d.setByAdminId || '') === String(req.admin._id)
      );
      res.json({
        success: true,
        global: {
          isEnabled: settings.isEnabled,
          globalDelaySeconds: settings.globalDelaySeconds,
          priceMode: settings.priceMode,
          segmentDelays: settings.segmentDelays,
        },
        myOverrides: myDelays,
        scope: {
          role: req.adminScope.role,
          affectedUserCount: req.adminScope.isAll ? null : req.adminScope.scopedUserIds.length,
        },
      });
    } catch (err) {
      console.error('[scoped/reorder] read error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Write: bulk-apply reorder delay to every user in scope.
// Body: { delaySeconds: number, isEnabled?: boolean, segmentOverrides?: [...] }
router.put(
  '/reorder',
  requirePermission('reorder.edit'),
  attachScope,
  async (req, res) => {
    try {
      if (req.adminScope.isAll) {
        return res.status(400).json({
          success: false,
          error: 'Super-admin should edit global reorder via /api/admin/reorder-settings (existing) — scoped endpoint is sub-admin/broker only.',
        });
      }
      const { delaySeconds, isEnabled, segmentOverrides } = req.body || {};
      if (delaySeconds == null || Number(delaySeconds) < 0) {
        return res.status(400).json({ success: false, error: 'delaySeconds must be >= 0' });
      }
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);
      if (!layer) {
        return res.status(400).json({ success: false, error: `Role '${req.admin.role}' cannot write reorder overrides` });
      }

      const settings = await ReorderSettings.getSettings();
      const scopedUserIds = req.adminScope.scopedUserIds;

      // Remove previous entries for (user, layer) tuples this admin owns,
      // then push fresh rows. Simpler than per-row deltas.
      settings.userDelays = (settings.userDelays || []).filter((d) => {
        const isOwnRow =
          String(d.setByAdminId || '') === String(req.admin._id) &&
          d.layer === layer;
        return !isOwnRow;
      });

      for (const uid of scopedUserIds) {
        settings.userDelays.push({
          userId: uid,
          layer,
          setByAdminId: req.admin._id,
          setByRole: req.admin.role,
          delaySeconds: Number(delaySeconds),
          isEnabled: isEnabled !== false,
          segmentOverrides: Array.isArray(segmentOverrides) ? segmentOverrides : [],
        });
      }
      await settings.save();
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_reorder_write',
        description: `Reorder delay override set (${scopedUserIds.length} users · ${Number(delaySeconds)}s)`,
        metadata: {
          delaySeconds: Number(delaySeconds),
          isEnabled: isEnabled !== false,
          segmentOverrides: Array.isArray(segmentOverrides) ? segmentOverrides : [],
          affectedUsers: scopedUserIds.length,
          layer,
        },
      });
      res.json({
        success: true,
        affectedUsers: scopedUserIds.length,
        layer,
      });
    } catch (err) {
      console.error('[scoped/reorder] write error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Clear: drop every entry this admin has written at the current layer.
router.delete(
  '/reorder',
  requirePermission('reorder.edit'),
  attachScope,
  async (req, res) => {
    try {
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);
      const settings = await ReorderSettings.getSettings();
      const before = settings.userDelays.length;
      settings.userDelays = settings.userDelays.filter(
        (d) => !(String(d.setByAdminId || '') === String(req.admin._id) && d.layer === layer)
      );
      const removed = before - settings.userDelays.length;
      await settings.save();
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_reorder_clear',
        description: `Reorder delay overrides cleared (${removed} rows)`,
        metadata: { removed, layer },
      });
      res.json({ success: true, removed });
    } catch (err) {
      console.error('[scoped/reorder] clear error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* ═════════════════════════════════════════════════════════════════════════
 * RISK settings — /risk (view) · PUT /risk (bulk-apply to scoped users)
 * ═════════════════════════════════════════════════════════════════════════ */

const RISK_FIELDS_BY_PERMISSION = {
  marginCall: ['marginCallLevel'],
  stopOut: ['stopOutLevel'],
  tradeHold: ['profitTradeHoldMinSeconds', 'lossTradeHoldMinSeconds'],
  ledgerClose: ['ledgerBalanceClose'],
  // Any admin with risk.edit can toggle these:
  edit: ['blockLimitAboveBelowHighLow', 'blockLimitBetweenHighLow', 'exitOnlyMode'],
};

function filterRiskFields(admin, payload) {
  const out = {};
  for (const [subKey, fields] of Object.entries(RISK_FIELDS_BY_PERMISSION)) {
    const fullKey = subKey === 'edit' ? 'risk.edit' : `risk.${subKey}`;
    if (!admin.hasPermission(fullKey)) continue;
    for (const f of fields) {
      if (f in payload) out[f] = payload[f];
    }
  }
  return out;
}

router.get(
  '/risk',
  requirePermission('risk.view'),
  attachScope,
  async (req, res) => {
    try {
      const overrides = await UserRiskSettings.find({
        setByAdminId: req.admin._id,
      }).select('userId layer marginCallLevel stopOutLevel profitTradeHoldMinSeconds lossTradeHoldMinSeconds ledgerBalanceClose blockLimitAboveBelowHighLow blockLimitBetweenHighLow exitOnlyMode').lean();

      res.json({
        success: true,
        myOverrides: overrides,
        scope: {
          role: req.adminScope.role,
          affectedUserCount: req.adminScope.isAll ? null : req.adminScope.scopedUserIds.length,
        },
      });
    } catch (err) {
      console.error('[scoped/risk] read error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.put(
  '/risk',
  requirePermission('risk.edit'),
  attachScope,
  async (req, res) => {
    try {
      if (req.adminScope.isAll) {
        return res.status(400).json({
          success: false,
          error: 'Super-admin should edit global risk via /api/admin/risk-settings (existing) — scoped endpoint is sub-admin/broker only.',
        });
      }
      const filtered = filterRiskFields(req.admin, req.body || {});
      if (!Object.keys(filtered).length) {
        return res.status(400).json({
          success: false,
          error: 'No editable fields — check sub-permissions (risk.marginCall / risk.stopOut / risk.tradeHold / risk.ledgerClose / risk.edit)',
        });
      }
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);

      const User = require('../models/User');
      const userRows = await User.find({ _id: { $in: req.adminScope.scopedUserIds } })
        .select('_id oderId').lean();

      const ops = userRows.map((u) => ({
        updateOne: {
          filter: { userId: u._id, layer },
          update: {
            $set: { ...filtered, oderId: u.oderId, setByAdminId: req.admin._id, setByRole: req.admin.role },
            $setOnInsert: { userId: u._id, layer },
          },
          upsert: true,
        },
      }));

      if (!ops.length) {
        return res.json({ success: true, matchedCount: 0, upsertedCount: 0, modifiedCount: 0, affectedUsers: 0 });
      }
      const result = await UserRiskSettings.bulkWrite(ops, { ordered: false });
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_risk_write',
        description: `Risk override saved (${userRows.length} users · fields: ${Object.keys(filtered).join(', ')})`,
        metadata: {
          fields: filtered,
          fieldsApplied: Object.keys(filtered),
          affectedUsers: userRows.length,
          upsertedCount: result.upsertedCount || 0,
          modifiedCount: result.modifiedCount || 0,
          layer,
        },
      });
      res.json({
        success: true,
        fieldsApplied: Object.keys(filtered),
        matchedCount: result.matchedCount || 0,
        upsertedCount: result.upsertedCount || 0,
        modifiedCount: result.modifiedCount || 0,
        affectedUsers: userRows.length,
        layer,
      });
    } catch (err) {
      console.error('[scoped/risk] write error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.delete(
  '/risk',
  requirePermission('risk.edit'),
  attachScope,
  async (req, res) => {
    try {
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);
      const r = await UserRiskSettings.deleteMany({
        setByAdminId: req.admin._id,
        layer,
        ...(Array.isArray(req.adminScope.scopedUserIds) ? { userId: { $in: req.adminScope.scopedUserIds } } : {}),
      });
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_risk_clear',
        description: `Risk overrides cleared (${r.deletedCount || 0} rows)`,
        metadata: { deletedCount: r.deletedCount || 0, layer },
      });
      res.json({ success: true, deletedCount: r.deletedCount || 0 });
    } catch (err) {
      console.error('[scoped/risk] clear error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* ═════════════════════════════════════════════════════════════════════════
 * USER-SCOPED per-user writes (Phase 7)
 *
 * Lets a sub-admin / broker pick a single user from their scope and edit just
 * that user's override. Layer is the same as their bulk write (sub_admin or
 * broker), so the row is stored with the same precedence — just narrower
 * reach (one user instead of all).
 *
 * Every handler first checks the target userId is inside the admin's scope.
 * Super-admin with isAll is rejected here — they should use the global per-user
 * endpoints on /api/admin/user-segment-settings etc.
 * ═════════════════════════════════════════════════════════════════════════ */
const User = require('../models/User');

async function ensureUserInScope(req, res, userId) {
  if (req.adminScope.isAll) {
    res.status(400).json({
      success: false,
      error: 'Super-admin should use /api/admin/user-segment-settings endpoints, not scoped ones.',
    });
    return false;
  }
  const scoped = (req.adminScope.scopedUserIds || []).map(String);
  if (!scoped.includes(String(userId))) {
    res.status(403).json({ success: false, error: 'User not in your scope' });
    return false;
  }
  return true;
}

// ─── Per-user snapshot (segment + script + reorder + risk) — for Copy Settings
router.get(
  '/users/:userId/snapshot',
  requirePermission('users.view'),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.userId))) return;
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);

      const [segmentRows, riskRow, reorderDoc] = await Promise.all([
        UserSegmentSettings.find({
          userId: req.params.userId,
          layer,
          setByAdminId: req.admin._id,
        }).lean(),
        UserRiskSettings.findOne({
          userId: req.params.userId,
          layer,
          setByAdminId: req.admin._id,
        }).lean(),
        ReorderSettings.getSettings(),
      ]);
      const reorderRow = (reorderDoc.userDelays || []).find(
        (d) => String(d.userId) === String(req.params.userId) &&
               d.layer === layer &&
               String(d.setByAdminId || '') === String(req.admin._id)
      );
      res.json({
        success: true,
        userId: req.params.userId,
        segments: segmentRows,  // each row has { segmentName, symbol, ...fields }
        risk: riskRow || null,
        reorder: reorderRow || null,
      });
    } catch (err) {
      console.error('[scoped/users/snapshot] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── User search (scoped) ─────────────────────────────────────────────────
router.get(
  '/users/search',
  requirePermission('users.view'),
  attachScope,
  async (req, res) => {
    try {
      if (req.adminScope.isAll) {
        return res.status(400).json({ success: false, error: 'Super-admin uses /api/admin/users/search' });
      }
      const q = String(req.query.q || '').trim();
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const filter = { _id: { $in: req.adminScope.scopedUserIds } };
      if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ name: rx }, { email: rx }, { oderId: rx }, { phone: rx }];
      }
      const users = await User.find(filter)
        .select('_id oderId name email phone')
        .limit(limit)
        .lean();
      res.json({ success: true, users });
    } catch (err) {
      console.error('[scoped/users/search] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── Per-user SEGMENT override (GET / PUT / DELETE) ───────────────────────
router.get(
  '/users/:userId/segment/:mode/:name',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.view`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.userId))) return;
      const segment = await resolveSegmentByName(req.segmentMode, req.params.name);
      if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });

      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);

      const override = await UserSegmentSettings.findOne({
        userId: req.params.userId,
        segmentId: segment._id,
        symbol: null,
        tradeMode: req.segmentMode,
        layer,
      }).lean();

      res.json({
        success: true,
        segment,
        currentOverride: override || null,
        userId: req.params.userId,
      });
    } catch (err) {
      console.error('[scoped/users/segment] read error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.put(
  '/users/:userId/segment/:mode/:name',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.edit`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.userId))) return;
      const segment = await resolveSegmentByName(req.segmentMode, req.params.name);
      if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });

      const filtered = filterEditableFields(req.admin, req.segmentMode, req.body || {});
      if (!Object.keys(filtered).length) {
        return res.status(400).json({ success: false, error: 'No editable fields in payload' });
      }

      const result = await applyScopedSegmentOverride({
        admin: req.admin,
        segmentId: segment._id,
        segmentName: segment.name,
        tradeMode: req.segmentMode,
        symbol: null,
        fields: filtered,
        scopedUserIds: [req.params.userId], // single user
      });
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_segment_write',
        description: `${req.segmentMode} '${segment.name}' per-user override for ${req.params.userId}`,
        metadata: {
          mode: req.segmentMode, segmentName: segment.name,
          userId: String(req.params.userId),
          fields: filtered, fieldsApplied: Object.keys(filtered),
          scope: 'single-user',
        },
      });
      res.json({ success: true, fieldsApplied: Object.keys(filtered), ...result });
    } catch (err) {
      console.error('[scoped/users/segment] write error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.delete(
  '/users/:userId/segment/:mode/:name',
  modeValid,
  (req, res, next) => requirePermission(`${req.segmentPrefix}.edit`)(req, res, next),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.userId))) return;
      const segment = await resolveSegmentByName(req.segmentMode, req.params.name);
      if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });

      const result = await clearScopedSegmentOverride({
        admin: req.admin,
        segmentId: segment._id,
        tradeMode: req.segmentMode,
        symbol: null,
        scopedUserIds: [req.params.userId],
      });
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_segment_clear',
        description: `${req.segmentMode} '${segment.name}' per-user override cleared for ${req.params.userId}`,
        metadata: {
          mode: req.segmentMode, segmentName: segment.name,
          userId: String(req.params.userId),
          deletedCount: result.deletedCount,
          scope: 'single-user',
        },
      });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[scoped/users/segment] clear error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── Per-user REORDER override (GET / PUT / DELETE) ──────────────────────
router.get(
  '/users/:userId/reorder',
  requirePermission('reorder.view'),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.userId))) return;
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);
      const settings = await ReorderSettings.getSettings();
      const row = (settings.userDelays || []).find(
        (d) => String(d.userId) === String(req.params.userId) &&
               d.layer === layer &&
               String(d.setByAdminId || '') === String(req.admin._id)
      );
      res.json({ success: true, currentOverride: row || null, userId: req.params.userId });
    } catch (err) {
      console.error('[scoped/users/reorder] read error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.put(
  '/users/:userId/reorder',
  requirePermission('reorder.edit'),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.userId))) return;
      const { delaySeconds, isEnabled, segmentOverrides } = req.body || {};
      if (delaySeconds == null || Number(delaySeconds) < 0) {
        return res.status(400).json({ success: false, error: 'delaySeconds must be >= 0' });
      }
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);
      const settings = await ReorderSettings.getSettings();

      // Drop any existing row for this (user, layer) pair owned by me.
      settings.userDelays = (settings.userDelays || []).filter((d) => !(
        String(d.userId) === String(req.params.userId) &&
        d.layer === layer &&
        String(d.setByAdminId || '') === String(req.admin._id)
      ));
      settings.userDelays.push({
        userId: req.params.userId,
        layer,
        setByAdminId: req.admin._id,
        setByRole: req.admin.role,
        delaySeconds: Number(delaySeconds),
        isEnabled: isEnabled !== false,
        segmentOverrides: Array.isArray(segmentOverrides) ? segmentOverrides : [],
      });
      await settings.save();
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_reorder_write',
        description: `Reorder per-user override for ${req.params.userId} (${Number(delaySeconds)}s)`,
        metadata: {
          userId: String(req.params.userId),
          delaySeconds: Number(delaySeconds),
          isEnabled: isEnabled !== false,
          layer,
          scope: 'single-user',
        },
      });
      res.json({ success: true, layer });
    } catch (err) {
      console.error('[scoped/users/reorder] write error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.delete(
  '/users/:userId/reorder',
  requirePermission('reorder.edit'),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.userId))) return;
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);
      const settings = await ReorderSettings.getSettings();
      const before = settings.userDelays.length;
      settings.userDelays = settings.userDelays.filter((d) => !(
        String(d.userId) === String(req.params.userId) &&
        d.layer === layer &&
        String(d.setByAdminId || '') === String(req.admin._id)
      ));
      const removed = before - settings.userDelays.length;
      await settings.save();
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_reorder_clear',
        description: `Reorder per-user override cleared for ${req.params.userId}`,
        metadata: { userId: String(req.params.userId), removed, layer, scope: 'single-user' },
      });
      res.json({ success: true, removed });
    } catch (err) {
      console.error('[scoped/users/reorder] clear error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── Per-user RISK override (GET / PUT / DELETE) ──────────────────────────
router.get(
  '/users/:userId/risk',
  requirePermission('risk.view'),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.userId))) return;
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);
      const row = await UserRiskSettings.findOne({
        userId: req.params.userId,
        layer,
        setByAdminId: req.admin._id,
      }).lean();
      res.json({ success: true, currentOverride: row || null, userId: req.params.userId });
    } catch (err) {
      console.error('[scoped/users/risk] read error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.put(
  '/users/:userId/risk',
  requirePermission('risk.edit'),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.userId))) return;
      const filtered = filterRiskFields(req.admin, req.body || {});
      if (!Object.keys(filtered).length) {
        return res.status(400).json({ success: false, error: 'No editable fields' });
      }
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);
      const user = await User.findById(req.params.userId).select('_id oderId').lean();
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      const result = await UserRiskSettings.updateOne(
        { userId: user._id, layer },
        {
          $set: { ...filtered, oderId: user.oderId, setByAdminId: req.admin._id, setByRole: req.admin.role },
          $setOnInsert: { userId: user._id, layer },
        },
        { upsert: true }
      );
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_risk_write',
        description: `Risk per-user override for ${req.params.userId} (${Object.keys(filtered).join(', ')})`,
        metadata: {
          userId: String(req.params.userId),
          fields: filtered,
          fieldsApplied: Object.keys(filtered),
          layer,
          scope: 'single-user',
        },
      });
      res.json({
        success: true,
        fieldsApplied: Object.keys(filtered),
        matchedCount: result.matchedCount || 0,
        upsertedCount: result.upsertedCount || 0,
        modifiedCount: result.modifiedCount || 0,
        layer,
      });
    } catch (err) {
      console.error('[scoped/users/risk] write error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.delete(
  '/users/:userId/risk',
  requirePermission('risk.edit'),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.userId))) return;
      const { layerForWriterRole } = require('../middleware/adminPermission');
      const layer = layerForWriterRole(req.admin.role);
      const r = await UserRiskSettings.deleteOne({
        userId: req.params.userId,
        layer,
        setByAdminId: req.admin._id,
      });
      await logScopedChange({
        req, admin: req.admin,
        activityType: 'scoped_risk_clear',
        description: `Risk per-user override cleared for ${req.params.userId}`,
        metadata: { userId: String(req.params.userId), deletedCount: r.deletedCount || 0, layer, scope: 'single-user' },
      });
      res.json({ success: true, deletedCount: r.deletedCount || 0 });
    } catch (err) {
      console.error('[scoped/users/risk] clear error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* ═════════════════════════════════════════════════════════════════════════
 * USER MANAGEMENT (Phase 9) — scoped mirrors of the super-admin /users/* endpoints.
 *
 * List, filter, view, block/unblock, wallet adjust — all constrained to
 * req.adminScope.scopedUserIds. Super-admin still uses the original /users
 * endpoints; this is exclusively for sub-admin/broker.
 * ═════════════════════════════════════════════════════════════════════════ */

// Scoped list — mirrors GET /api/admin/users but filtered to the admin's subtree
router.get(
  '/users-list',
  requirePermission('users.view'),
  attachScope,
  async (req, res) => {
    try {
      if (req.adminScope.isAll) {
        return res.status(400).json({ success: false, error: 'Super-admin uses /api/admin/users' });
      }
      const { status, search, page = 1, limit = 20 } = req.query;
      const filter = { _id: { $in: req.adminScope.scopedUserIds } };
      if (status && status !== 'all') {
        if (status === 'active') filter.isActive = { $ne: false };
        else if (status === 'blocked') filter.isActive = false;
      }
      if (search) {
        const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ name: rx }, { email: rx }, { oderId: rx }, { phone: rx }];
      }
      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
      const skip     = (pageNum - 1) * pageSize;

      const [users, total] = await Promise.all([
        User.find(filter)
          .select('_id oderId name email phone isActive createdAt parentAdminId wallet kycStatus')
          .sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
        User.countDocuments(filter),
      ]);
      res.json({
        success: true,
        users,
        pagination: {
          total, page: pageNum, limit: pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } catch (err) {
      console.error('[scoped/users-list] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// View one scoped user (fuller detail)
router.get(
  '/users-list/:id',
  requirePermission('users.view'),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.id))) return;
      const user = await User.findById(req.params.id).select('-password').lean();
      if (!user) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, user });
    } catch (err) {
      console.error('[scoped/users-list/:id] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Block / unblock (status toggle)
router.patch(
  '/users-list/:id/status',
  requirePermission('users.block'),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.id))) return;
      const { isActive } = req.body || {};
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ success: false, error: 'isActive boolean required' });
      }
      const user = await User.findByIdAndUpdate(req.params.id, { $set: { isActive } }, { new: true })
        .select('_id oderId isActive name email');
      res.json({ success: true, user });
    } catch (err) {
      console.error('[scoped/users-list/status] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Wallet adjust (credit/debit/bonus)
router.post(
  '/users-list/:id/wallet',
  requirePermission('users.wallet.credit'),
  attachScope,
  async (req, res) => {
    try {
      if (!(await ensureUserInScope(req, res, req.params.id))) return;
      const { type, amount, note } = req.body || {};
      const amt = Number(amount);
      if (!['credit', 'debit', 'bonus'].includes(type)) {
        return res.status(400).json({ success: false, error: 'type must be credit/debit/bonus' });
      }
      if (!Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ success: false, error: 'amount must be a positive number' });
      }
      // Require the specific sub-permission too.
      const subKey = type === 'credit' ? 'users.wallet.credit' : type === 'debit' ? 'users.wallet.debit' : 'users.wallet.bonus';
      if (!req.admin.hasPermission(subKey)) {
        return res.status(403).json({ success: false, error: `Forbidden: permission '${subKey}' required` });
      }
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ success: false, error: 'Not found' });
      if (!user.wallet) user.wallet = { balance: 0, credit: 0 };
      if (type === 'credit') user.wallet.balance = (user.wallet.balance || 0) + amt;
      else if (type === 'debit') user.wallet.balance = (user.wallet.balance || 0) - amt;
      else if (type === 'bonus') user.wallet.credit = (user.wallet.credit || 0) + amt;
      await user.save();

      await logScopedChange({
        req, admin: req.admin,
        activityType: type === 'bonus' ? 'wallet_credit' : `wallet_${type}`,
        description: `${type} ${amt} ${type === 'bonus' ? '(bonus) ' : ''}on user ${user.oderId}`,
        metadata: { userId: String(user._id), type, amount: amt, note: note || '' },
      });

      res.json({ success: true, wallet: user.wallet });
    } catch (err) {
      console.error('[scoped/users-list/wallet] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* ═════════════════════════════════════════════════════════════════════════
 * FUND MANAGEMENT (Phase 10) — scoped list of deposits / withdrawals.
 * Mutations still go to /api/admin/transactions/:id (which now has a scope
 * guard added in server/index.js).
 * ═════════════════════════════════════════════════════════════════════════ */
const Transaction = require('../models/Transaction');

router.get(
  '/transactions-list',
  requirePermission('deposits.view'),
  attachScope,
  async (req, res) => {
    try {
      if (req.adminScope.isAll) {
        return res.status(400).json({ success: false, error: 'Super-admin uses /api/admin/transactions' });
      }
      const users = await User.find({ _id: { $in: req.adminScope.scopedUserIds } })
        .select('oderId name email parentAdminId parentAdminOderId')
        .populate('parentAdminId', 'name oderId role')
        .lean();
      const oderIds = users.map(u => u.oderId).filter(Boolean);
      if (!oderIds.length) {
        return res.json({ success: true, transactions: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 }, summary: zeroSummary() });
      }

      const { type, status, paymentMethod, search, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
      const filter = { oderId: { $in: oderIds } };
      if (type && type !== 'all') filter.type = type;
      else filter.type = { $in: ['deposit', 'withdrawal'] };
      if (status && status !== 'all') filter.status = status;
      if (paymentMethod) filter.paymentMethod = paymentMethod;
      if (search) {
        const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ oderId: rx }, { transactionId: rx }, { paymentMethod: rx }];
      }
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
        if (dateTo)   filter.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
      const skip = (pageNum - 1) * pageSize;

      const [rows, total] = await Promise.all([
        Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
        Transaction.countDocuments(filter),
      ]);
      const userByOder = Object.fromEntries(users.map(u => [u.oderId, u]));
      const transactions = rows.map(t => {
        const u = userByOder[t.oderId];
        return {
          ...t,
          userName: u?.name || null,
          userEmail: u?.email || null,
          parentType: u?.parentAdminId?.role === 'broker' ? 'BROKER'
                     : u?.parentAdminId?.role === 'sub_admin' ? 'SUBADMIN' : 'ADMIN',
          parentName: u?.parentAdminId?.name || u?.parentAdminOderId || null,
          parentOderId: u?.parentAdminId?.oderId || u?.parentAdminOderId || null,
        };
      });

      // Summary across all matching rows (not just the current page)
      const allMatching = await Transaction.find(filter).select('type status amount').lean();
      const isApproved = (s) => s === 'approved' || s === 'completed';
      const isPending = (s) => s === 'pending' || s === 'processing';
      const summary = {
        total: allMatching.length,
        totalDeposits: allMatching.filter(t => t.type === 'deposit').reduce((s, t) => s + (Number(t.amount) || 0), 0),
        totalWithdrawals: allMatching.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (Number(t.amount) || 0), 0),
        approvedDeposits: allMatching.filter(t => t.type === 'deposit' && isApproved(t.status)).reduce((s, t) => s + (Number(t.amount) || 0), 0),
        approvedWithdrawals: allMatching.filter(t => t.type === 'withdrawal' && isApproved(t.status)).reduce((s, t) => s + (Number(t.amount) || 0), 0),
        pending: allMatching.filter(t => isPending(t.status)).length,
      };
      res.json({
        success: true, transactions, summary,
        pagination: { total, page: pageNum, limit: pageSize, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (err) {
      console.error('[scoped/transactions-list] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

function zeroSummary() {
  return { total: 0, totalDeposits: 0, totalWithdrawals: 0, approvedDeposits: 0, approvedWithdrawals: 0, pending: 0 };
}

/* ═════════════════════════════════════════════════════════════════════════
 * TRADE MANAGEMENT (Phase 10) — scoped mirrors of admin trade endpoints.
 *
 * Positions are keyed by userId = oderId string. We resolve the admin's scope
 * to a set of oderIds and filter every query. Close / modify actions verify
 * the position belongs to an in-scope user before mutating.
 * ═════════════════════════════════════════════════════════════════════════ */
const Trade = require('../models/Trade');

async function scopedOderIdsFor(admin, req) {
  const users = await User.find({ _id: { $in: req.adminScope.scopedUserIds } })
    .select('oderId').lean();
  return users.map(u => u.oderId).filter(Boolean);
}

/**
 * Build a map of oderId -> displayable user name for the given set of users.
 * Used by scoped trade endpoints so the front-end can render `userName`
 * alongside `userId`, matching the admin panel's TradeManagement view.
 */
async function buildUserNameMap(oderIds) {
  if (!oderIds || !oderIds.length) return {};
  const users = await User.find({ oderId: { $in: oderIds } })
    .select('oderId name firstName lastName email').lean();
  const map = {};
  for (const u of users) {
    const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    map[u.oderId] = u.name || full || u.email || u.oderId;
  }
  return map;
}

// Open positions (netting + hedging), filtered to scope.
router.get(
  '/trades/open',
  requirePermission('trades.view'),
  attachScope,
  async (req, res) => {
    try {
      if (req.adminScope.isAll) {
        return res.status(400).json({ success: false, error: 'Super-admin uses /api/admin/trades/active' });
      }
      const oderIds = await scopedOderIdsFor(req.admin, req);
      if (!oderIds.length) return res.json({ success: true, positions: [], summary: { total: 0 } });

      const { HedgingPosition, NettingPosition } = require('../models/Position');
      const { symbol, mode, search } = req.query;

      const positions = [];
      if (!mode || mode === 'hedging' || mode === 'all') {
        const q = { status: 'open', userId: { $in: oderIds } };
        if (symbol) q.symbol = { $regex: symbol, $options: 'i' };
        if (search) q.userId = { $in: oderIds.filter(id => new RegExp(search, 'i').test(id)) };
        const rows = await HedgingPosition.find(q).sort({ openTime: -1 }).limit(500).lean();
        positions.push(...rows.map(p => ({ ...p, mode: 'hedging', positionType: 'HedgingPosition' })));
      }
      if (!mode || mode === 'netting' || mode === 'all') {
        const q = { status: 'open', userId: { $in: oderIds } };
        if (symbol) q.symbol = { $regex: symbol, $options: 'i' };
        if (search) q.userId = { $in: oderIds.filter(id => new RegExp(search, 'i').test(id)) };
        const rows = await NettingPosition.find(q).sort({ openTime: -1 }).limit(500).lean();
        positions.push(...rows.map(p => ({ ...p, mode: 'netting', entryPrice: p.avgPrice, positionType: 'NettingPosition' })));
      }
      // Enrich with userName (admin-parity) and total volume
      const nameMap = await buildUserNameMap([...new Set(positions.map(p => p.userId))]);
      for (const p of positions) p.userName = nameMap[p.userId] || p.userId;
      const totalUnrealizedPnL = positions.reduce((sum, p) => sum + (p.profit || 0), 0);
      const totalVolume = positions.reduce((sum, p) => sum + (Number(p.volume) || 0), 0);
      res.json({
        success: true,
        positions,
        summary: {
          total: positions.length,
          hedging: positions.filter(p => p.mode === 'hedging').length,
          netting: positions.filter(p => p.mode === 'netting').length,
          totalUnrealizedPnL,
          totalVolume,
        },
      });
    } catch (err) {
      console.error('[scoped/trades/open] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Composed / aggregated-by-symbol view of open positions.
router.get(
  '/trades/composed',
  requirePermission('trades.view'),
  attachScope,
  async (req, res) => {
    try {
      if (req.adminScope.isAll) {
        return res.status(400).json({ success: false, error: 'Super-admin uses /api/admin/trades/composed' });
      }
      const oderIds = await scopedOderIdsFor(req.admin, req);
      if (!oderIds.length) {
        return res.json({
          success: true, composed: [],
          totals: { totalSymbols: 0, totalPositions: 0, totalBuyLots: 0, totalSellLots: 0, totalPnL: 0, totalUniqueUsers: 0 },
        });
      }
      const { HedgingPosition, NettingPosition } = require('../models/Position');
      const { mode } = req.query;
      const map = {};
      const add = (sym, side, vol, entry, pnl, userId, tradeMode) => {
        if (!map[sym]) {
          map[sym] = {
            symbol: sym, totalBuyLots: 0, totalSellLots: 0, netLots: 0,
            buyCount: 0, sellCount: 0, totalCount: 0,
            uniqueUsers: new Set(),
            totalBuyValue: 0, totalSellValue: 0, totalPnL: 0,
            byMode: {
              hedging: { buyLots: 0, sellLots: 0, count: 0, pnl: 0 },
              netting: { buyLots: 0, sellLots: 0, count: 0, pnl: 0 },
            },
          };
        }
        const d = map[sym];
        d.uniqueUsers.add(userId);
        d.totalCount += 1;
        d.totalPnL += pnl || 0;
        if (side === 'buy') {
          d.totalBuyLots += vol; d.buyCount += 1;
          d.totalBuyValue += vol * (entry || 0);
          d.byMode[tradeMode].buyLots += vol;
        } else {
          d.totalSellLots += vol; d.sellCount += 1;
          d.totalSellValue += vol * (entry || 0);
          d.byMode[tradeMode].sellLots += vol;
        }
        d.byMode[tradeMode].count += 1;
        d.byMode[tradeMode].pnl += pnl || 0;
      };
      if (!mode || mode === 'hedging' || mode === 'all') {
        const rows = await HedgingPosition.find({ status: 'open', userId: { $in: oderIds } }).lean();
        for (const p of rows) add(p.symbol, p.side, p.volume || 0.01, p.entryPrice || 0, p.profit || 0, p.userId, 'hedging');
      }
      if (!mode || mode === 'netting' || mode === 'all') {
        const rows = await NettingPosition.find({ status: 'open', userId: { $in: oderIds } }).lean();
        for (const p of rows) add(p.symbol, p.side, p.volume || p.quantity || 1, p.avgPrice || 0, p.profit || 0, p.userId, 'netting');
      }
      const composed = Object.values(map).map(d => ({
        ...d,
        uniqueUsers: d.uniqueUsers.size,
        netLots: d.totalBuyLots - d.totalSellLots,
        avgBuyPrice: d.totalBuyLots > 0 ? d.totalBuyValue / d.totalBuyLots : 0,
        avgSellPrice: d.totalSellLots > 0 ? d.totalSellValue / d.totalSellLots : 0,
      })).sort((a, b) => b.totalCount - a.totalCount);

      const totals = {
        totalSymbols: composed.length,
        totalPositions: composed.reduce((s, r) => s + r.totalCount, 0),
        totalBuyLots: composed.reduce((s, r) => s + r.totalBuyLots, 0),
        totalSellLots: composed.reduce((s, r) => s + r.totalSellLots, 0),
        totalPnL: composed.reduce((s, r) => s + r.totalPnL, 0),
        totalUniqueUsers: composed.reduce((s, r) => s + (r.uniqueUsers || 0), 0),
      };
      res.json({ success: true, composed, totals });
    } catch (err) {
      console.error('[scoped/trades/composed] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Pending orders (hedging only)
router.get(
  '/trades/pending',
  requirePermission('trades.view'),
  attachScope,
  async (req, res) => {
    try {
      if (req.adminScope.isAll) {
        return res.status(400).json({ success: false, error: 'Super-admin uses /api/admin/trades/pending' });
      }
      const oderIds = await scopedOderIdsFor(req.admin, req);
      if (!oderIds.length) return res.json({ success: true, orders: [], total: 0 });

      const { HedgingPosition } = require('../models/Position');
      const { symbol, search } = req.query;
      const q = { status: 'pending', userId: { $in: oderIds } };
      if (symbol) q.symbol = { $regex: symbol, $options: 'i' };
      if (search) q.userId = { $in: oderIds.filter(id => new RegExp(search, 'i').test(id)) };
      const orders = await HedgingPosition.find(q).sort({ createdAt: -1 }).limit(500).lean();
      const nameMap = await buildUserNameMap([...new Set(orders.map(o => o.userId))]);
      for (const o of orders) o.userName = nameMap[o.userId] || o.userId;
      res.json({ success: true, orders, total: orders.length });
    } catch (err) {
      console.error('[scoped/trades/pending] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Trade history (closed trades from Trade collection)
router.get(
  '/trades/history',
  requirePermission('trades.view'),
  attachScope,
  async (req, res) => {
    try {
      if (req.adminScope.isAll) {
        return res.status(400).json({ success: false, error: 'Super-admin uses /api/admin/trades/history' });
      }
      const oderIds = await scopedOderIdsFor(req.admin, req);
      if (!oderIds.length) {
        return res.json({ success: true, trades: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 } });
      }
      const { page = 1, limit = 50, symbol, search, mode, dateFrom, dateTo } = req.query;
      const filter = {
        type: { $in: ['close', 'partial_close', 'binary'] },
        userId: { $in: oderIds },
      };
      if (symbol) filter.symbol = { $regex: symbol, $options: 'i' };
      if (search) filter.userId = { $in: oderIds.filter(id => new RegExp(search, 'i').test(id)) };
      if (mode && mode !== 'all') filter.mode = mode;
      if (dateFrom || dateTo) {
        filter.executedAt = {};
        if (dateFrom) filter.executedAt.$gte = new Date(dateFrom);
        if (dateTo)   filter.executedAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
      }
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
      const skip = (pageNum - 1) * pageSize;

      const [trades, total] = await Promise.all([
        Trade.find(filter).sort({ executedAt: -1 }).skip(skip).limit(pageSize).lean(),
        Trade.countDocuments(filter),
      ]);
      const nameMap = await buildUserNameMap([...new Set(trades.map(t => t.userId))]);
      for (const t of trades) t.userName = nameMap[t.userId] || t.userId;

      // Summary stats (P/L, win rate) — mirrors admin /trades/history summary
      const summary = trades.reduce((acc, t) => {
        const p = Number(t.profit ?? t.pnl) || 0;
        acc.totalPnL += p;
        if (p >= 0) acc.winningTrades++;
        else acc.losingTrades++;
        return acc;
      }, { totalPnL: 0, winningTrades: 0, losingTrades: 0 });
      summary.totalTrades = trades.length;
      summary.winRate = summary.totalTrades > 0
        ? (summary.winningTrades / summary.totalTrades) * 100
        : 0;

      res.json({
        success: true, trades, summary,
        pagination: { total, page: pageNum, limit: pageSize, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (err) {
      console.error('[scoped/trades/history] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* ═════════════════════════════════════════════════════════════════════════
 * USER ACTIVITY LOGS (Phase 9) — scoped mirror of /api/admin/activity-logs.
 * Filters entries to users inside the signed-in admin's subtree.
 * ═════════════════════════════════════════════════════════════════════════ */
const UserActivityLog = require('../models/UserActivityLog');

router.get(
  '/activity-logs-list',
  requirePermission('admin.viewAuditLog'),
  attachScope,
  async (req, res) => {
    try {
      if (req.adminScope.isAll) {
        return res.status(400).json({ success: false, error: 'Super-admin uses /api/admin/activity-logs' });
      }
      const scopedUsers = await User.find({ _id: { $in: req.adminScope.scopedUserIds } })
        .select('_id oderId name email').lean();
      const scopedUserIds = scopedUsers.map(u => u._id);
      const scopedOderIds = scopedUsers.map(u => u.oderId).filter(Boolean);
      if (!scopedUsers.length) {
        return res.json({ success: true, logs: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } });
      }

      const { userId, activityType, search, page = 1, limit = 20, startDate, endDate } = req.query;
      const filter = {
        $or: [
          { userId: { $in: scopedUserIds } },
          { oderId: { $in: scopedOderIds } },
        ],
      };
      // Narrow to a specific user if the caller passed one — but only if in scope.
      if (userId && userId !== 'all') {
        const target = scopedUsers.find(u => String(u._id) === String(userId) || u.oderId === userId);
        if (!target) return res.status(403).json({ success: false, error: 'User not in your scope' });
        delete filter.$or;
        filter.$and = [{ $or: [{ userId: target._id }, { oderId: target.oderId }] }];
      }
      if (activityType && activityType !== 'all') filter.activityType = activityType;
      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) filter.timestamp.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          filter.timestamp.$lte = end;
        }
      }
      if (search) {
        const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const searchOr = [{ oderId: rx }, { description: rx }];
        if (filter.$and) filter.$and.push({ $or: searchOr });
        else if (filter.$or) {
          filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
          delete filter.$or;
        } else filter.$or = searchOr;
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * pageSize;

      const [rows, total] = await Promise.all([
        UserActivityLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(pageSize).lean(),
        UserActivityLog.countDocuments(filter),
      ]);
      const userByOder = Object.fromEntries(scopedUsers.map(u => [u.oderId, u]));
      const userById = Object.fromEntries(scopedUsers.map(u => [String(u._id), u]));
      const logs = rows.map(l => ({ ...l, user: userByOder[l.oderId] || userById[String(l.userId)] || null }));
      res.json({
        success: true,
        logs,
        users: scopedUsers.map(u => ({ _id: u._id, oderId: u.oderId, name: u.name })),
        pagination: { total, page: pageNum, limit: pageSize, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (err) {
      console.error('[scoped/activity-logs-list] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* ═════════════════════════════════════════════════════════════════════════
 * KYC (Phase 9) — scoped list + approve/reject for KYCs of users in scope.
 * Mirrors /api/admin/kyc* but filters by the admin's scopedUserIds (via oderId).
 * ═════════════════════════════════════════════════════════════════════════ */

const KYC = require('../models/KYC');

router.get(
  '/kyc-list',
  requirePermission('users.kyc.view'),
  attachScope,
  async (req, res) => {
    try {
      if (req.adminScope.isAll) {
        return res.status(400).json({ success: false, error: 'Super-admin uses /api/admin/kyc' });
      }
      const scopedUsers = await User.find({ _id: { $in: req.adminScope.scopedUserIds } })
        .select('_id oderId name email phone').lean();
      const scopedOderIds = scopedUsers.map(u => u.oderId).filter(Boolean);
      if (!scopedOderIds.length) {
        return res.json({ success: true, kycs: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } });
      }
      const { status, search, page = 1, limit = 20 } = req.query;
      const filter = { oderId: { $in: scopedOderIds } };
      if (status && status !== 'all') filter.status = status;
      if (search) {
        const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ oderId: rx }, { fullName: rx }, { documentNumber: rx }];
      }
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * pageSize;

      const [rows, total] = await Promise.all([
        KYC.find(filter).sort({ submittedAt: -1, createdAt: -1 }).skip(skip).limit(pageSize).lean(),
        KYC.countDocuments(filter),
      ]);
      // Attach user summary per KYC row
      const userByOderId = Object.fromEntries(scopedUsers.map(u => [u.oderId, u]));
      const kycs = rows.map(k => ({ ...k, user: userByOderId[k.oderId] || null }));

      res.json({
        success: true,
        kycs,
        pagination: { total, page: pageNum, limit: pageSize, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (err) {
      console.error('[scoped/kyc-list] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.get(
  '/kyc-list/:kycId',
  requirePermission('users.kyc.view'),
  attachScope,
  async (req, res) => {
    try {
      const kyc = await KYC.findById(req.params.kycId).lean();
      if (!kyc) return res.status(404).json({ success: false, error: 'Not found' });
      const user = await User.findOne({ oderId: kyc.oderId }).select('_id oderId name email phone isActive').lean();
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });
      if (!(await ensureUserInScope(req, res, user._id))) return;
      res.json({ success: true, kyc: { ...kyc, user } });
    } catch (err) {
      console.error('[scoped/kyc-list/:id] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.put(
  '/kyc-list/:kycId/approve',
  requirePermission('users.kyc.approve'),
  attachScope,
  async (req, res) => {
    try {
      const kyc = await KYC.findById(req.params.kycId);
      if (!kyc) return res.status(404).json({ success: false, error: 'Not found' });
      const user = await User.findOne({ oderId: kyc.oderId }).select('_id oderId').lean();
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });
      if (!(await ensureUserInScope(req, res, user._id))) return;

      kyc.status = 'approved';
      kyc.reviewedAt = new Date();
      kyc.reviewedBy = req.admin._id;
      kyc.rejectionReason = null;
      await kyc.save();

      await logScopedChange({
        req, admin: req.admin,
        activityType: 'kyc_approved',
        description: `Approved KYC ${kyc._id} for ${kyc.oderId}`,
        metadata: { kycId: String(kyc._id), oderId: kyc.oderId },
      });
      res.json({ success: true, kyc });
    } catch (err) {
      console.error('[scoped/kyc-list/approve] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.put(
  '/kyc-list/:kycId/reject',
  requirePermission('users.kyc.reject'),
  attachScope,
  async (req, res) => {
    try {
      const { reason } = req.body || {};
      const kyc = await KYC.findById(req.params.kycId);
      if (!kyc) return res.status(404).json({ success: false, error: 'Not found' });
      const user = await User.findOne({ oderId: kyc.oderId }).select('_id oderId').lean();
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });
      if (!(await ensureUserInScope(req, res, user._id))) return;

      kyc.status = 'rejected';
      kyc.reviewedAt = new Date();
      kyc.reviewedBy = req.admin._id;
      kyc.rejectionReason = String(reason || '').slice(0, 500) || 'No reason provided';
      await kyc.save();

      await logScopedChange({
        req, admin: req.admin,
        activityType: 'kyc_rejected',
        description: `Rejected KYC ${kyc._id} for ${kyc.oderId}: ${kyc.rejectionReason}`,
        metadata: { kycId: String(kyc._id), oderId: kyc.oderId, reason: kyc.rejectionReason },
      });
      res.json({ success: true, kyc });
    } catch (err) {
      console.error('[scoped/kyc-list/reject] error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* ═════════════════════════════════════════════════════════════════════════
 * AUDIT — /audit  (Phase 6)
 *
 * Returns the scoped-setting change log. Scope-aware:
 *   - super_admin:     sees every scoped_* entry from any admin
 *   - sub_admin:       sees their own + their brokers' entries (subtree)
 *   - broker/bank_user: sees only their own entries
 * ═════════════════════════════════════════════════════════════════════════ */
const AdminActivityLog = require('../models/AdminActivityLog');
const { getAdminSubtreeIds } = require('../middleware/adminPermission');

const SCOPED_ACTIVITY_TYPES = [
  'scoped_segment_write', 'scoped_segment_clear',
  'scoped_reorder_write',  'scoped_reorder_clear',
  'scoped_risk_write',     'scoped_risk_clear',
];

router.get(
  '/audit',
  requirePermission('admin.viewAuditLog'),
  attachScope,
  async (req, res) => {
    try {
      const {
        activityType, startDate, endDate,
        page = 1, limit = 50,
      } = req.query;

      const filter = { activityType: { $in: SCOPED_ACTIVITY_TYPES } };

      // Role-based visibility: super_admin = all, sub_admin = subtree, else = self.
      if (req.admin.role === 'sub_admin') {
        const subtree = await getAdminSubtreeIds(req.admin._id);
        filter.adminId = { $in: subtree.map(String) };
      } else if (req.admin.role !== 'super_admin') {
        filter.adminId = String(req.admin._id);
      }

      if (activityType && SCOPED_ACTIVITY_TYPES.includes(activityType)) {
        filter.activityType = activityType;
      }
      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) filter.timestamp.$gte = new Date(startDate);
        if (endDate)   filter.timestamp.$lte = new Date(endDate);
      }

      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
      const skip     = (pageNum - 1) * pageSize;

      const [logs, total] = await Promise.all([
        AdminActivityLog.find(filter)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(pageSize)
          .lean(),
        AdminActivityLog.countDocuments(filter),
      ]);

      res.json({
        success: true,
        logs,
        pagination: {
          total,
          page: pageNum,
          limit: pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
        scope: {
          role: req.adminScope.role,
          affectedUserCount: req.adminScope.isAll ? null : req.adminScope.scopedUserIds.length,
        },
      });
    } catch (err) {
      console.error('[scoped/audit] read error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

module.exports = router;
