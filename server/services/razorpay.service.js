/**
 * Razorpay integration — order creation + signature verification.
 *
 * Security model (industry standard):
 *  - The SERVER always decides the amount (never trust the client).
 *  - The checkout callback (client → /verify) is authenticated by an HMAC-SHA256
 *    signature over `order_id|payment_id` keyed with the API secret.
 *  - The webhook (Razorpay → /webhook) is authenticated by an HMAC-SHA256
 *    signature over the RAW request body keyed with the webhook secret.
 *  - Both use crypto.timingSafeEqual to avoid timing attacks.
 *
 * Env:
 *  RAZORPAY_KEY_ID          — public key id (also sent to the browser)
 *  RAZORPAY_KEY_SECRET      — secret, server-only; signs order/payment
 *  RAZORPAY_WEBHOOK_SECRET  — secret you set when creating the webhook in the
 *                             Razorpay dashboard; signs webhook payloads
 */
const crypto = require('crypto');
let Razorpay;
try { Razorpay = require('razorpay'); } catch (_) { Razorpay = null; }

let instance = null;

function isConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getKeyId() {
  return process.env.RAZORPAY_KEY_ID || '';
}

function getInstance() {
  if (!Razorpay) throw new Error('razorpay package is not installed (run: npm install razorpay)');
  if (!isConfigured()) throw new Error('Razorpay is not configured (set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)');
  if (!instance) {
    instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return instance;
}

/**
 * Create a Razorpay order. amountInr is in RUPEES — we convert to paise.
 * receipt is our own reference (the Transaction _id) so we can reconcile.
 */
async function createOrder({ amountInr, receipt, notes = {} }) {
  const rupees = Number(amountInr);
  if (!Number.isFinite(rupees) || rupees <= 0) throw new Error('Invalid order amount');
  const rzp = getInstance();
  return rzp.orders.create({
    amount: Math.round(rupees * 100), // paise
    currency: 'INR',
    receipt: String(receipt).slice(0, 40),
    notes,
    payment_capture: 1 // auto-capture on success
  });
}

// Constant-time hex-string compare (handles unequal lengths without throwing).
function safeEqualHex(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify the checkout callback: expected = HMAC_SHA256(order_id|payment_id, key_secret).
 */
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
}

/**
 * Verify a webhook: expected = HMAC_SHA256(rawBody, webhook_secret).
 * rawBody MUST be the exact bytes Razorpay sent (use express.raw()).
 */
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return safeEqualHex(expected, signature);
}

// Fetch a payment (for reconciliation / admin tooling). Best-effort.
async function fetchPayment(paymentId) {
  const rzp = getInstance();
  return rzp.payments.fetch(paymentId);
}

module.exports = {
  isConfigured,
  getKeyId,
  getInstance,
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPayment
};
