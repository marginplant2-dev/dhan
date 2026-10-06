/**
 * The UPIQR webhook signature check.
 *
 *   node server/scripts/upiqrSignature.selfcheck.js
 *
 * UPIQR documents X-Webhook-Signature as sha256=<hmac_hex> over the raw body.
 * This guards a path that activates paid challenges, so the cases that must
 * fail are worth pinning down as firmly as the one that must pass.
 */
const assert = require('assert');
const crypto = require('crypto');

process.env.UPIQR_WEBHOOK_SECRET = 'whsec_test_secret';
const upiqr = require('../services/upiqr.service');

const body = Buffer.from(JSON.stringify({
  amount: 500,
  client_txn_id: 'TXN_123456',
  status: 'success',
  upi_txn_id: 'UTR123456789',
}));
const hex = crypto.createHmac('sha256', 'whsec_test_secret').update(body).digest('hex');

// The documented form, and the bare hex some senders use.
assert.strictEqual(upiqr.verifyWebhookSignature(body, `sha256=${hex}`), true, 'sha256= prefixed hex must pass');
assert.strictEqual(upiqr.verifyWebhookSignature(body, hex), true, 'bare hex must pass');
assert.strictEqual(upiqr.verifyWebhookSignature(body, `SHA256=${hex}`), true, 'prefix is case-insensitive');

// Anything else must fail closed.
assert.strictEqual(upiqr.verifyWebhookSignature(body, 'sha256=' + 'a'.repeat(64)), false, 'wrong digest must fail');
assert.strictEqual(upiqr.verifyWebhookSignature(body, ''), false, 'empty signature must fail');
assert.strictEqual(upiqr.verifyWebhookSignature(body, undefined), false, 'missing signature must fail');
assert.strictEqual(upiqr.verifyWebhookSignature(Buffer.from('{}'), `sha256=${hex}`), false, 'tampered body must fail');

// A digest for a different secret must not pass.
const otherHex = crypto.createHmac('sha256', 'whsec_other').update(body).digest('hex');
assert.strictEqual(upiqr.verifyWebhookSignature(body, `sha256=${otherHex}`), false, 'wrong secret must fail');

// With no secret configured it refuses rather than waving everything through.
delete process.env.UPIQR_WEBHOOK_SECRET;
assert.strictEqual(upiqr.verifyWebhookSignature(body, `sha256=${hex}`), false, 'no secret must fail closed');

console.log('upiqrSignature.selfcheck: all cases pass');
