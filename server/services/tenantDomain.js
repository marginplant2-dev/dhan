/**
 * Custom-domain (white-label) subsystem.
 *
 * An admin serves the end-user app from their own hostname, so their clients
 * never see the platform's. Lifecycle:
 *
 *   NONE → PENDING_DNS → VERIFYING → ISSUING_CERT → READY
 *                             ↘ FAILED (with a human-readable reason)
 *
 * The whole subsystem is feature-flagged: with CUSTOM_DOMAINS_ENABLED unset
 * the endpoints refuse politely and nothing else in the app changes. Tenant
 * rows are left untouched, so it can be frozen without data loss.
 */

const dns = require('dns').promises;
const crypto = require('crypto');
const { exec } = require('child_process');

const PLATFORM_DOMAIN = (process.env.PLATFORM_DOMAIN || 'dhanfunded.com').toLowerCase();
/** Host tenants point their CNAME at. */
const EDGE_HOST = (process.env.CUSTOM_DOMAIN_EDGE_HOST || PLATFORM_DOMAIN).toLowerCase();
/** TXT record that carries the per-tenant proof token. */
const TXT_PREFIX = process.env.CUSTOM_DOMAIN_TXT_PREFIX || '_dhanfunded-verify';

const STATUS = {
  NONE: 'NONE',
  PENDING_DNS: 'PENDING_DNS',
  VERIFYING: 'VERIFYING',
  ISSUING_CERT: 'ISSUING_CERT',
  READY: 'READY',
  FAILED: 'FAILED',
};

function domainsEnabled() {
  return String(process.env.CUSTOM_DOMAINS_ENABLED || '').toLowerCase() === 'true';
}

/** Thrown for anything the admin can fix by editing their input. */
class DomainError extends Error {}

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Lowercase, strip scheme / path / port / trailing dot, then validate.
 * Returns null for an empty input (meaning "no domain").
 */
function normalizeDomain(raw) {
  let d = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^[a-z]+:\/\//, '')   // scheme
       .replace(/\/.*$/, '')          // path
       .replace(/:\d+$/, '')          // port
       .replace(/\.+$/, '');          // trailing dot
  if (!d) return null;
  if (IPV4_RE.test(d) || d.includes(':')) throw new DomainError('Enter a domain name, not an IP address');
  if (!HOSTNAME_RE.test(d)) throw new DomainError('That does not look like a valid domain name');
  if (d === PLATFORM_DOMAIN || d.endsWith('.' + PLATFORM_DOMAIN)) {
    throw new DomainError('This is the platform domain — connect a domain you own');
  }
  return d;
}

/** The two records the admin has to create, shown verbatim in the UI. */
function dnsInstructions(domain, token) {
  return [
    { type: 'CNAME', name: domain, value: EDGE_HOST },
    { type: 'TXT', name: `${TXT_PREFIX}.${domain}`, value: token || '' },
  ];
}

function newToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Re-resolve both records. Only a token match moves the row forward; every
 * failure returns a reason the UI can show as-is.
 */
async function checkDns(domain, token) {
  let cname = [];
  try {
    cname = await dns.resolveCname(domain);
  } catch (err) {
    // A CNAME on the apex is often flattened to A records by the DNS provider;
    // accept that too as long as it resolves to the edge's address.
    if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
      return { ok: false, reason: `Could not read the CNAME record (${err.code || err.message})` };
    }
  }
  let cnameOk = cname.some(v => String(v).toLowerCase().replace(/\.$/, '') === EDGE_HOST);
  if (!cnameOk) {
    try {
      const [edgeIps, domainIps] = await Promise.all([dns.resolve4(EDGE_HOST), dns.resolve4(domain)]);
      cnameOk = domainIps.some(ip => edgeIps.includes(ip));
    } catch { /* leave cnameOk false */ }
  }
  if (!cnameOk) {
    return { ok: false, reason: `${domain} does not point at ${EDGE_HOST} yet. DNS changes can take up to an hour.` };
  }

  const txtName = `${TXT_PREFIX}.${domain}`;
  let txt = [];
  try {
    txt = await dns.resolveTxt(txtName);
  } catch (err) {
    return { ok: false, reason: `TXT record ${txtName} not found (${err.code || err.message})` };
  }
  const flat = txt.map(parts => parts.join('').trim());
  if (!flat.includes(token)) {
    return { ok: false, reason: `TXT record ${txtName} does not carry this account's verification token` };
  }
  return { ok: true };
}

/**
 * Certificate issuance. Never blocks the request thread — the caller sets
 * ISSUING_CERT and polls /domain/status.
 *
 * The command is configurable because the right one depends on the edge:
 * certbot on the origin, or a CDN API call when TLS terminates there.
 * ponytail: shell-out with a configured command; swap for an ACME client if
 * issuance ever needs to report progress beyond success/failure.
 */
function enqueueCertificate(AdminModel, adminId, domain) {
  const template = process.env.CUSTOM_DOMAIN_CERT_CMD;
  if (!template) {
    // Nothing configured: stop at ISSUING_CERT and say exactly what is missing
    // instead of pretending the domain is live.
    return AdminModel.updateOne({ _id: adminId }, {
      $set: {
        customDomainStatus: STATUS.ISSUING_CERT,
        customDomainLastError: 'DNS verified. Waiting for the TLS certificate — CUSTOM_DOMAIN_CERT_CMD is not configured on the server.',
      },
    }).catch(() => {});
  }
  const cmd = template.split('{DOMAIN}').join(domain);
  setImmediate(() => {
    exec(cmd, { timeout: 5 * 60 * 1000 }, async (err, _stdout, stderr) => {
      try {
        if (err) {
          await AdminModel.updateOne({ _id: adminId }, {
            $set: {
              customDomainStatus: STATUS.FAILED,
              customDomainLastError: `Certificate issuance failed: ${String(stderr || err.message).slice(-400)}`,
            },
          });
        } else {
          await AdminModel.updateOne({ _id: adminId }, {
            $set: {
              customDomainStatus: STATUS.READY,
              customDomainLastError: '',
              customDomainVerifiedAt: new Date(),
            },
          });
          bustHostCache(domain);
        }
      } catch (e) {
        console.error('[tenantDomain] cert callback failed:', e.message);
      }
    });
  });
  return Promise.resolve();
}

/* ── Host → tenant resolution ──────────────────────────────────────────────
 * Runs on public requests (signup, branding), so it is cached. Only a READY
 * domain resolves — a half-connected one must not capture signups.
 */
const HOST_TTL_MS = 60 * 1000;
const hostCache = new Map(); // host → { admin: Object|null, at }

function bustHostCache(host) {
  if (host) hostCache.delete(String(host).toLowerCase());
  else hostCache.clear();
}

/** @returns {Promise<Object|null>} the owning Admin, or null for the platform. */
async function tenantForHost(host) {
  if (!domainsEnabled()) return null;
  const h = String(host || '').toLowerCase().split(':')[0].replace(/\.+$/, '');
  if (!h || h === PLATFORM_DOMAIN || h.endsWith('.' + PLATFORM_DOMAIN)) return null;

  const hit = hostCache.get(h);
  if (hit && Date.now() - hit.at < HOST_TTL_MS) return hit.admin;

  const Admin = require('../models/Admin');
  const admin = await Admin.findOne({
    customDomain: h,
    customDomainStatus: STATUS.READY,
    isActive: true,
  }).select('_id oderId name brandName logoUrl customDomain').lean();

  hostCache.set(h, { admin: admin || null, at: Date.now() });
  return admin || null;
}

/**
 * The base URL to put in anything a user receives (emails, referral links,
 * share sheets). Only a READY domain is used; anything else falls back to the
 * platform, so disconnecting takes effect on the next request.
 */
async function siteUrlForUser(user) {
  const fallback = (process.env.PUBLIC_SITE_URL || `https://${PLATFORM_DOMAIN}`).replace(/\/$/, '');
  if (!domainsEnabled() || !user || !user.parentAdminId) return fallback;
  try {
    const Admin = require('../models/Admin');
    const owner = await Admin.findOne({
      _id: user.parentAdminId,
      customDomainStatus: STATUS.READY,
    }).select('customDomain').lean();
    return owner && owner.customDomain ? `https://${owner.customDomain}` : fallback;
  } catch {
    return fallback;
  }
}

module.exports = {
  STATUS,
  DomainError,
  PLATFORM_DOMAIN,
  EDGE_HOST,
  TXT_PREFIX,
  domainsEnabled,
  normalizeDomain,
  dnsInstructions,
  newToken,
  checkDns,
  enqueueCertificate,
  tenantForHost,
  siteUrlForUser,
  bustHostCache,
};
