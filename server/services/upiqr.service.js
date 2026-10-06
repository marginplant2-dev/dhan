/**
 * UPIQR integration — order creation and status confirmation.
 *
 * Security model, and where it differs from Razorpay / Cashfree:
 *
 *  - The SERVER always decides the amount. Never trust the client.
 *  - UPIQR's published API is an order create plus a status check, both
 *    authenticated by our API key in the request body. There is no documented
 *    signature scheme for its webhook callback, so NOTHING here ever activates
 *    a challenge on the strength of a callback body. A callback is treated as a
 *    hint that something changed; the decision is always made by calling
 *    checkOrderStatus() ourselves over TLS with our own key. A forged callback
 *    therefore buys an attacker a wasted status check and nothing else.
 *  - verifyWebhookSignature() is offered for the day UPIQR documents one. It
 *    returns false when unconfigured rather than true, so turning it on can
 *    only ever tighten the path, never loosen it.
 *
 * Env:
 *  UPIQR_API_KEY         — API key, sent in the body of every call
 *  UPIQR_WEBHOOK_SECRET  — shared secret for the callback, when one is sent
 *  UPIQR_BASE_URL        — override the API origin (defaults to the live one)
 */
const crypto = require('crypto');
const axios = require('axios');

const DEFAULT_BASE = 'https://upiqr.xyz';
const TIMEOUT_MS = 20000;

function baseUrl() {
  return (process.env.UPIQR_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
}

function isConfigured() {
  return Boolean(process.env.UPIQR_API_KEY);
}

function apiKey() {
  const key = process.env.UPIQR_API_KEY;
  if (!key) throw new Error('UPIQR is not configured (set UPIQR_API_KEY)');
  return key;
}

/**
 * Create an order. `amountInr` is in RUPEES — UPIQR takes rupees, not paise,
 * so unlike Razorpay there is no ×100 here. Getting that wrong in either
 * direction is a 100× billing error, which is why it is spelled out.
 */
async function createOrder({ amountInr, clientTxnId, customerName, customerMobile, redirectUrl, info }) {
  const amount = Number(amountInr);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid amount');
  if (!clientTxnId) throw new Error('clientTxnId required');

  const { data } = await axios.post(
    `${baseUrl()}/api/create_order`,
    {
      key: apiKey(),
      amount,
      client_txn_id: String(clientTxnId),
      customer_name: customerName || 'Customer',
      // UPIQR validates the mobile, and a blank one fails the call outright.
      customer_mobile: String(customerMobile || '').replace(/\D/g, '').slice(-10) || '9999999999',
      redirect_url: redirectUrl || '',
      p_info: info || 'Challenge purchase',
    },
    { timeout: TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } },
  );

  if (!data || data.status !== true || !data.data) {
    throw new Error(data?.msg || 'UPIQR order creation failed');
  }
  return data.data; // { order_id, payment_url, upi_id_hash, upi_intent }
}

/**
 * Ask UPIQR what actually happened to an order. This is the only thing allowed
 * to decide that money arrived.
 */
async function checkOrderStatus(clientTxnId) {
  if (!clientTxnId) throw new Error('clientTxnId required');
  const { data } = await axios.post(
    `${baseUrl()}/api/check_order_status`,
    { key: apiKey(), client_txn_id: String(clientTxnId) },
    { timeout: TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } },
  );
  if (!data || data.status !== true || !data.data) {
    throw new Error(data?.msg || 'Transaction not found');
  }
  return data.data; // { id, amount, client_txn_id, status, upi_txn_id, txnAt }
}

/**
 * Has this order been paid?
 *
 * UPIQR's sample shows `status: "pending"`; the paid wording is not documented,
 * so match the settled vocabulary gateways use and treat everything else as
 * not-yet-paid. Erring this way can only delay an activation, never grant one
 * that was not paid for.
 */
function isPaid(statusData) {
  const s = String(statusData?.status || '').toLowerCase();
  return s === 'success' || s === 'paid' || s === 'completed' || s === 'captured';
}

/** Terminal failure — stop polling rather than waiting out the window. */
function isFailed(statusData) {
  const s = String(statusData?.status || '').toLowerCase();
  return s === 'failure' || s === 'failed' || s === 'expired' || s === 'cancelled' || s === 'canceled';
}

/**
 * Best-effort signature check over the raw callback body (HMAC-SHA256, hex or
 * base64). Returns false when no secret is set or no signature was sent, so a
 * caller that requires it fails closed.
 */
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.UPIQR_WEBHOOK_SECRET;
  if (!secret || !signature || !rawBody) return false;
  const mac = crypto.createHmac('sha256', secret).update(rawBody);
  const hex = mac.digest('hex');
  const b64 = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const given = String(signature).replace(/^sha256=/i, '').trim();
  for (const expected of [hex, b64]) {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

module.exports = {
  isConfigured,
  createOrder,
  checkOrderStatus,
  isPaid,
  isFailed,
  verifyWebhookSignature,
};
