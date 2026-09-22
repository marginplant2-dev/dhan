/**
 * Currency Rate Service — INR-only platform.
 *
 * The platform has been converted to INR-only. The wallet stores INR natively
 * and all instruments are Indian (NSE/BSE/indices), so no USD↔INR conversion
 * is required. This module is kept as a stub so that legacy callers that still
 * multiply or divide by the rate end up with an identity operation (rate = 1).
 */

function getUsdInrRate() { return 1; }
function getCachedUsdInrRate() { return 1; }
async function refreshRate() { return 1; }

module.exports = {
  getUsdInrRate,
  getCachedUsdInrRate,
  refreshRate,
};
