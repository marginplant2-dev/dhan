/**
 * Cashfree Payments (PG) integration — order creation, status verify, webhook verify.
 *
 * Uses the Cashfree Orders API (x-api-version 2023-08-01) over native fetch — no
 * SDK/npm package needed (Node 18+ has global fetch).
 *
 * Security model (industry standard):
 *  - The SERVER always decides the amount (never trust the client).
 *  - After checkout, the SERVER re-fetches the order from Cashfree and only
 *    activates when order_status === 'PAID' (client can't fake it).
 *  - The webhook (Cashfree → /webhook) is authenticated by a signature:
 *    base64( HMAC_SHA256( timestamp + rawBody, secretKey ) ), compared in
 *    constant time.
 *
 * Env (server-only):
 *  CASHFREE_APP_ID      — client id  (x-client-id)
 *  CASHFREE_SECRET_KEY  — secret key (x-client-secret + webhook HMAC key)
 *  CASHFREE_ENV         — 'production' (default) or 'sandbox'
 */
const crypto = require('crypto');

const API_VERSION = '2023-08-01';

function isConfigured() {
  return Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
}

function getAppId() {
  return process.env.CASHFREE_APP_ID || '';
}

function getEnv() {
  return String(process.env.CASHFREE_ENV || 'production').toLowerCase() === 'sandbox'
    ? 'sandbox'
    : 'production';
}

function apiBase() {
  return getEnv() === 'sandbox'
    ? 'https://sandbox.cashfree.com/pg'
    : 'https://api.cashfree.com/pg';
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-version': API_VERSION,
    'x-client-id': process.env.CASHFREE_APP_ID || '',
    'x-client-secret': process.env.CASHFREE_SECRET_KEY || ''
  };
}

/**
 * Create a Cashfree order. amountInr is in RUPEES.
 * Returns the raw order (contains payment_session_id + order_status).
 */
async function createOrder({ amountInr, orderId, customer = {}, returnUrl, notifyUrl, notes = {} }) {
  if (!isConfigured()) throw new Error('Cashfree is not configured (set CASHFREE_APP_ID / CASHFREE_SECRET_KEY)');
  const rupees = Number(amountInr);
  if (!Number.isFinite(rupees) || rupees <= 0) throw new Error('Invalid order amount');

  const custId = String(customer.id || 'guest').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50) || 'guest';
  const custPhone = (customer.phone && String(customer.phone).replace(/\D/g, '').slice(-10)) || '9999999999';

  const body = {
    order_id: String(orderId),
    order_amount: Number(rupees.toFixed(2)),
    order_currency: 'INR',
    customer_details: {
      customer_id: custId,
      customer_name: customer.name || 'Trader',
      customer_email: customer.email || 'noreply@dhanfunded.com',
      customer_phone: custPhone
    },
    order_meta: {
      return_url: returnUrl,
      notify_url: notifyUrl
    },
    order_note: 'Challenge purchase',
    order_tags: notes
  };

  const resp = await fetch(`${apiBase()}/orders`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body)
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.message || `Cashfree order failed (HTTP ${resp.status})`);
  return data;
}

/** Fetch an order (authoritative payment status). order_status: PAID / ACTIVE / EXPIRED... */
async function getOrder(orderId) {
  const resp = await fetch(`${apiBase()}/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: authHeaders()
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.message || `Cashfree fetch failed (HTTP ${resp.status})`);
  return data;
}

// Constant-time string compare (handles unequal lengths without throwing).
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify a Cashfree webhook.
 *   expected = base64( HMAC_SHA256( timestamp + rawBody, secretKey ) )
 * rawBody MUST be the exact bytes Cashfree sent (use express.raw()).
 */
function verifyWebhookSignature(rawBody, signature, timestamp) {
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!secret || !signature || !timestamp) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const expected = crypto.createHmac('sha256', secret).update(timestamp + body).digest('base64');
  return safeEqual(expected, signature);
}

module.exports = {
  isConfigured,
  getAppId,
  getEnv,
  createOrder,
  getOrder,
  verifyWebhookSignature
};
