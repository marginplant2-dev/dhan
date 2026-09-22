const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const EmailOtp = require('../models/EmailOtp');
const emailService = require('./email.service');

const SIGNUP_OTP_TTL_MS = 10 * 60 * 1000;
const RESET_OTP_TTL_MS = 15 * 60 * 1000;
const MAX_OTP_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

/** In-process rate limit (per server instance). For multi-node, use Redis. */
const sendTimestamps = {
  signup: new Map(),
  password_reset: new Map()
};

function assertCanSend(purpose, email) {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const map = sendTimestamps[purpose];
  const arr = (map.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= MAX_OTP_SENDS_PER_HOUR) {
    const err = new Error('Too many emails sent for this address. Try again in an hour.');
    err.statusCode = 429;
    throw err;
  }
  arr.push(now);
  map.set(key, arr);
}

async function requireSignupOtp() {
  // Signup OTP is required when SMTP is configured. Set SIGNUP_OTP_DISABLED=true
  // in .env to bypass (e.g. local dev without a working mailbox).
  if (String(process.env.SIGNUP_OTP_DISABLED).toLowerCase() === 'true') return false;
  return require('./email.service').isSmtpConfigured();
}

function generateSixDigitCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function sendSignupOtp(email) {
  const normalized = email.toLowerCase().trim();
  assertCanSend('signup', normalized);

  await EmailOtp.deleteMany({ email: normalized, purpose: 'signup' });

  const code = generateSixDigitCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + SIGNUP_OTP_TTL_MS);
  await EmailOtp.create({
    email: normalized,
    purpose: 'signup',
    codeHash,
    attempts: 0,
    expiresAt
  });

  await emailService.sendSignupOtpEmail(normalized, code);
  return { expiresAt };
}

async function verifyAndConsumeSignupOtp(email, plainCode) {
  const code = String(plainCode || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: 'Enter the 6-digit verification code from your email' };
  }
  const normalized = email.toLowerCase().trim();
  const doc = await EmailOtp.findOne({ email: normalized, purpose: 'signup' }).sort({ createdAt: -1 });
  if (!doc) return { ok: false, error: 'No verification code found. Request a new code.' };
  if (doc.expiresAt.getTime() < Date.now()) {
    await EmailOtp.deleteOne({ _id: doc._id });
    return { ok: false, error: 'Verification code expired. Request a new one.' };
  }
  if (doc.attempts >= MAX_VERIFY_ATTEMPTS) {
    await EmailOtp.deleteOne({ _id: doc._id });
    return { ok: false, error: 'Too many attempts. Request a new code.' };
  }

  const match = await bcrypt.compare(code, doc.codeHash);
  if (!match) {
    doc.attempts += 1;
    await doc.save();
    return { ok: false, error: 'Incorrect verification code' };
  }

  await EmailOtp.deleteOne({ _id: doc._id });
  return { ok: true };
}

async function sendPasswordResetOtp(email) {
  const normalized = email.toLowerCase().trim();
  await EmailOtp.deleteMany({ email: normalized, purpose: 'password_reset' });

  const code = generateSixDigitCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + RESET_OTP_TTL_MS);
  await EmailOtp.create({
    email: normalized,
    purpose: 'password_reset',
    codeHash,
    attempts: 0,
    expiresAt
  });

  await emailService.sendPasswordResetOtpEmail(normalized, code);
  return { expiresAt };
}

async function verifyAndConsumePasswordResetOtp(email, plainCode) {
  const resetCode = String(plainCode || '').trim();
  if (!/^\d{6}$/.test(resetCode)) {
    return { ok: false, error: 'Enter the 6-digit reset code from your email' };
  }
  const normalized = email.toLowerCase().trim();
  const doc = await EmailOtp.findOne({ email: normalized, purpose: 'password_reset' }).sort({ createdAt: -1 });
  if (!doc) return { ok: false, error: 'No reset code found. Request a new one.' };
  if (doc.expiresAt.getTime() < Date.now()) {
    await EmailOtp.deleteOne({ _id: doc._id });
    return { ok: false, error: 'Reset code expired. Request a new one.' };
  }
  if (doc.attempts >= MAX_VERIFY_ATTEMPTS) {
    await EmailOtp.deleteOne({ _id: doc._id });
    return { ok: false, error: 'Too many attempts. Request a new code.' };
  }

  const match = await bcrypt.compare(resetCode, doc.codeHash);
  if (!match) {
    doc.attempts += 1;
    await doc.save();
    return { ok: false, error: 'Incorrect code' };
  }

  await EmailOtp.deleteOne({ _id: doc._id });
  return { ok: true };
}

function rateLimitPasswordResetEmail(email) {
  assertCanSend('password_reset', email.toLowerCase().trim());
}

module.exports = {
  requireSignupOtp,
  sendSignupOtp,
  verifyAndConsumeSignupOtp,
  sendPasswordResetOtp,
  verifyAndConsumePasswordResetOtp,
  rateLimitPasswordResetEmail
};
