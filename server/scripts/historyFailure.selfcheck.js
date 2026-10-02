/**
 * What the chart tells a user when Kite refuses a historical request.
 *
 *   node server/scripts/historyFailure.selfcheck.js
 *
 * This matters because the three cases need three different actions, and Kite
 * answers the first two with the same 403. Getting it wrong tells someone to
 * reconnect when the account simply has no historical-data subscription, or
 * hides a real outage behind "session expired".
 */
const assert = require('assert');
const { classifyHistoryFailure } = require('../services/zerodha.service');

const kite = (status, error_type, message) => ({ response: { status, data: { error_type, message } } });

// The daily token died — reconnecting in Admin fixes it.
assert.strictEqual(
  classifyHistoryFailure(kite(403, 'TokenException', 'Invalid `api_key` or `access_token`.')),
  'session',
);

// Kite sometimes reports the same thing as 401.
assert.strictEqual(classifyHistoryFailure(kite(401, 'TokenException', 'Token expired')), 'session');

// The app itself is not subscribed to historical data — reconnecting will not help.
assert.strictEqual(
  classifyHistoryFailure(kite(403, 'PermissionException', 'This app does not have permission')),
  'permission',
);

// Anything else is a real fault, not something to blame on the user's session.
assert.strictEqual(classifyHistoryFailure(kite(500, 'GeneralException', 'Oops')), 'upstream');
assert.strictEqual(classifyHistoryFailure(new Error('socket hang up')), 'upstream');
assert.strictEqual(classifyHistoryFailure(undefined), 'upstream');

console.log('historyFailure.selfcheck: all cases pass');
