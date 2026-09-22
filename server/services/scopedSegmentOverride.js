/**
 * Scoped segment override writer (Phase 3).
 *
 * When a sub-admin/broker saves segment settings, this service:
 *   1. Validates which fields they're allowed to write based on the
 *      fine-grained permission keys they hold.
 *   2. Resolves their user scope (direct users only for broker; full subtree
 *      for sub-admin; a specific user when super-admin edits per-user).
 *   3. Bulk-upserts one `UserSegmentSettings` row per (user, segment, layer)
 *      — where `layer` is 'sub_admin' / 'broker' / 'user_explicit' depending
 *      on who wrote.
 *
 * The trade engine (`NettingEngine.getSegmentSettingsForTrade` /
 * `HedgingEngine.getSegmentSettingsForTrade`) already reads the layered rows
 * via `UserSegmentSettings.getEffectiveSettingsForUser`, so no engine code
 * changes are required for the overrides to take effect.
 */

const mongoose = require('mongoose');
const UserSegmentSettings = require('../models/UserSegmentSettings');
const NettingSegment = require('../models/NettingSegment');
const HedgingSegment = require('../models/HedgingSegment');
const { layerForWriterRole } = require('../middleware/adminPermission');

/**
 * Fine-grained permission → editable field-name map. A sub-admin who holds
 * `nettingSegment.commission` can write only these fields; trying to write
 * `leverage` fields in the same request is silently dropped.
 *
 * Keeps the editable surface small on purpose. Super-admin still edits
 * everything via the global segment doc endpoints (unchanged).
 */
const EDITABLE_FIELDS_BY_PERMISSION = {
  leverage: ['maxLeverage', 'defaultLeverage', 'fixedLeverage', 'leverageOptions'],
  margin: [
    'intradayMargin', 'overnightMargin',
    'optionBuyIntraday', 'optionBuyOvernight',
    'optionSellIntraday', 'optionSellOvernight',
    'marginCalcMode', 'fixedMarginAsPercent',
    'exposureIntraday', 'exposureCarryForward',
    'intradayHolding', 'overnightHolding',
    'marginRate', 'hedgedMarginRate',
  ],
  commission: [
    'commission', 'commissionType', 'chargeOn',
    'optionBuyCommission', 'optionSellCommission',
  ],
  swap: ['swapType', 'swapLong', 'swapShort', 'tripleSwapDay', 'swapTime'],
  spread: [
    'spreadType', 'spreadPips', 'markupPips',
    'limitAwayPoints', 'limitAwayPercent',
    'buyingStrikeFar', 'sellingStrikeFar',
    'buyingStrikeFarPercent', 'sellingStrikeFarPercent',
  ],
  limits: [
    'minLots', 'maxLots', 'orderLots', 'maxExchangeLots',
    'minQty', 'perOrderQty', 'maxQtyPerScript', 'maxQtyPerSegment',
    'maxPositionsPerSymbol', 'maxTotalPositions',
    'limitType', 'maxValue',
  ],
  exitOnly: ['exitOnlyMode'],
};

/** Mode → segment-model map */
const SEGMENT_MODELS = {
  netting: NettingSegment,
  hedging: HedgingSegment,
};

/**
 * Filter a payload down to the fields the admin is actually allowed to write
 * based on which subkey permissions they hold.
 *
 * @param {Object} admin   — the Admin doc (hasPermission method).
 * @param {string} mode    — 'netting' | 'hedging' (picks the right permission prefix).
 * @param {Object} payload — raw field values sent by the client.
 * @returns {Object}         — sanitized payload (only allowed fields kept).
 */
function filterEditableFields(admin, mode, payload) {
  const prefix = mode === 'hedging' ? 'hedgingSegment' : 'nettingSegment';
  // Super-admin holding `.edit` gets everything for the mode.
  if (admin.hasPermission(`${prefix}.edit`) && admin.role === 'super_admin') {
    return { ...payload };
  }
  const out = {};
  for (const [subKey, fields] of Object.entries(EDITABLE_FIELDS_BY_PERMISSION)) {
    if (!admin.hasPermission(`${prefix}.${subKey}`)) continue;
    for (const f of fields) {
      if (f in payload) out[f] = payload[f];
    }
  }
  return out;
}

/**
 * Resolve the segment doc by name for the given mode.
 * @returns {{ _id, name }|null}
 */
async function resolveSegmentByName(mode, segmentName) {
  const Model = SEGMENT_MODELS[mode];
  if (!Model) return null;
  return Model.findOne({ name: segmentName }).lean();
}

/**
 * Core bulk-apply routine: write one UserSegmentSettings row per user in
 * `scopedUserIds`, tagged with the correct layer. `fields` has already been
 * filtered by permission.
 *
 * Uses a single bulkWrite with upserts so it scales to thousands of users.
 *
 * @returns {{ matchedCount, upsertedCount, modifiedCount, affectedUsers }}
 */
async function applyScopedSegmentOverride({
  admin,
  segmentId,
  segmentName,
  tradeMode,      // 'netting' | 'hedging' — also becomes the UserSegmentSettings.tradeMode field
  symbol = null,  // null = segment-wide
  fields,         // already permission-filtered
  scopedUserIds,  // required — caller must pre-resolve via getScopedUserIds
}) {
  if (!Array.isArray(scopedUserIds)) {
    throw new Error('scopedUserIds must be an array (use [] for no-op)');
  }
  if (!Object.keys(fields).length) {
    return { matchedCount: 0, upsertedCount: 0, modifiedCount: 0, affectedUsers: 0 };
  }
  const layer = layerForWriterRole(admin.role);
  if (!layer) throw new Error(`Admin role '${admin.role}' cannot write overrides`);

  // Fetch oderId for each userId (required by the UserSegmentSettings schema).
  const User = require('../models/User');
  const userRows = await User.find({ _id: { $in: scopedUserIds } })
    .select('_id oderId')
    .lean();

  const bulkOps = userRows.map((u) => ({
    updateOne: {
      filter: {
        userId: u._id,
        segmentId,
        symbol,
        tradeMode,
        layer,
      },
      update: {
        $set: {
          ...fields,
          segmentName,
          oderId: u.oderId,
          setByAdminId: admin._id,
          setByRole: admin.role,
        },
        $setOnInsert: {
          userId: u._id,
          segmentId,
          symbol,
          tradeMode,
          layer,
        },
      },
      upsert: true,
    },
  }));

  if (!bulkOps.length) {
    return { matchedCount: 0, upsertedCount: 0, modifiedCount: 0, affectedUsers: 0 };
  }

  const res = await UserSegmentSettings.bulkWrite(bulkOps, { ordered: false });
  return {
    matchedCount: res.matchedCount || 0,
    upsertedCount: res.upsertedCount || 0,
    modifiedCount: res.modifiedCount || 0,
    affectedUsers: userRows.length,
  };
}

/**
 * Remove all override rows written by this admin for a given segment/user scope.
 * Useful for "reset to default" in the sub-admin UI.
 */
async function clearScopedSegmentOverride({
  admin,
  segmentId,
  tradeMode,
  symbol = null,
  scopedUserIds,
}) {
  const layer = layerForWriterRole(admin.role);
  if (!layer) throw new Error(`Admin role '${admin.role}' cannot clear overrides`);

  const res = await UserSegmentSettings.deleteMany({
    setByAdminId: admin._id,
    layer,
    segmentId,
    tradeMode,
    symbol,
    ...(Array.isArray(scopedUserIds) ? { userId: { $in: scopedUserIds } } : {}),
  });
  return { deletedCount: res.deletedCount || 0 };
}

module.exports = {
  EDITABLE_FIELDS_BY_PERMISSION,
  SEGMENT_MODELS,
  filterEditableFields,
  resolveSegmentByName,
  applyScopedSegmentOverride,
  clearScopedSegmentOverride,
};
