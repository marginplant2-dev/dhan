/**
 * White-label branding + custom domain, per admin.
 *
 * Mounted at /api/admin/branding, so the admin chokepoint has already
 * resolved `req.admin` before anything here runs. An admin only ever touches
 * its OWN row — there is no id in any of these paths, which is the simplest
 * way to make cross-tenant edits impossible.
 */

const express = require('express');
const router = express.Router();

const Admin = require('../models/Admin');
const { logScopedChange } = require('../services/scopedAuditLog');
const {
  STATUS, DomainError, EDGE_HOST, PLATFORM_DOMAIN,
  domainsEnabled, normalizeDomain, dnsInstructions, newToken,
  checkDns, enqueueCertificate, bustHostCache,
} = require('../services/tenantDomain');

/** Feature flag — freezes the subsystem without touching tenant data. */
router.use((req, res, next) => {
  if (!domainsEnabled()) {
    return res.status(503).json({ success: false, error: 'Custom domains are not enabled on this platform' });
  }
  if (!req.admin) return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
});

/** The super-admin's synthesized view has no Admin row to brand. */
function tenantId(req) {
  return req.admin._syntheticSuperAdmin ? null : req.admin._id;
}

function present(admin) {
  return {
    brandName: admin.brandName || '',
    logoUrl: admin.logoUrl || '',
    customDomain: admin.customDomain || null,
    status: admin.customDomainStatus || STATUS.NONE,
    lastError: admin.customDomainLastError || '',
    verifiedAt: admin.customDomainVerifiedAt || null,
    platformDomain: PLATFORM_DOMAIN,
    edgeHost: EDGE_HOST,
    dns: admin.customDomain ? dnsInstructions(admin.customDomain, admin.customDomainToken) : [],
  };
}

async function loadTenant(req, res) {
  const id = tenantId(req);
  if (!id) {
    res.status(400).json({ success: false, error: 'The platform owner has no tenant branding — create an admin first' });
    return null;
  }
  const admin = await Admin.findById(id);
  if (!admin) {
    res.status(404).json({ success: false, error: 'Admin not found' });
    return null;
  }
  return admin;
}

/* GET /me — brand + domain + status + last error + the records to add */
router.get('/me', async (req, res) => {
  try {
    const admin = await loadTenant(req, res);
    if (!admin) return;
    res.json({ success: true, branding: present(admin) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* PUT / — set brand name, logo, and/or the custom domain */
router.put('/', async (req, res) => {
  try {
    const admin = await loadTenant(req, res);
    if (!admin) return;

    const { brandName, logoUrl, customDomain } = req.body || {};
    if (brandName !== undefined) admin.brandName = String(brandName).trim().slice(0, 80);
    if (logoUrl !== undefined) admin.logoUrl = String(logoUrl).trim().slice(0, 500);

    if (customDomain !== undefined) {
      let domain;
      try {
        domain = normalizeDomain(customDomain);
      } catch (err) {
        if (err instanceof DomainError) return res.status(400).json({ success: false, error: err.message });
        throw err;
      }

      if (domain !== admin.customDomain) {
        if (admin.customDomain) bustHostCache(admin.customDomain);
        admin.customDomain = domain;
        // A new domain starts over: a token from the previous one must never
        // verify the new one.
        admin.customDomainToken = domain ? newToken() : null;
        admin.customDomainStatus = domain ? STATUS.PENDING_DNS : STATUS.NONE;
        admin.customDomainLastError = '';
        admin.customDomainVerifiedAt = null;
      }
    }

    try {
      await admin.save();
    } catch (err) {
      // Uniqueness: say it is taken without leaking who holds it.
      if (err && err.code === 11000) {
        return res.status(409).json({ success: false, error: 'That domain is already connected to another account' });
      }
      throw err;
    }

    await logScopedChange({
      req, admin: req.admin, activityType: 'settings_change',
      description: `Branding updated${admin.customDomain ? ` (domain ${admin.customDomain})` : ''}`,
      metadata: { customDomain: admin.customDomain, status: admin.customDomainStatus },
    });

    res.json({ success: true, branding: present(admin) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* POST /domain/verify — re-resolve DNS, then request the certificate */
router.post('/domain/verify', async (req, res) => {
  try {
    const admin = await loadTenant(req, res);
    if (!admin) return;
    if (!admin.customDomain) {
      return res.status(400).json({ success: false, error: 'No domain connected yet' });
    }

    admin.customDomainStatus = STATUS.VERIFYING;
    await admin.save();

    const result = await checkDns(admin.customDomain, admin.customDomainToken);
    if (!result.ok) {
      admin.customDomainStatus = STATUS.FAILED;
      admin.customDomainLastError = result.reason;
      await admin.save();
      return res.json({ success: false, branding: present(admin), error: result.reason });
    }

    admin.customDomainStatus = STATUS.ISSUING_CERT;
    admin.customDomainLastError = '';
    await admin.save();

    // Issuance never blocks this request — the UI polls /domain/status.
    enqueueCertificate(Admin, admin._id, admin.customDomain);

    res.json({ success: true, branding: present(admin) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* GET /domain/status — poll the lifecycle */
router.get('/domain/status', async (req, res) => {
  try {
    const admin = await loadTenant(req, res);
    if (!admin) return;
    res.json({
      success: true,
      status: admin.customDomainStatus || STATUS.NONE,
      lastError: admin.customDomainLastError || '',
      customDomain: admin.customDomain || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* POST /domain/disconnect — release the domain from this tenant at once */
router.post('/domain/disconnect', async (req, res) => {
  try {
    const admin = await loadTenant(req, res);
    if (!admin) return;
    const was = admin.customDomain;

    admin.customDomain = null;
    admin.customDomainToken = null;
    admin.customDomainStatus = STATUS.NONE;
    admin.customDomainLastError = '';
    admin.customDomainVerifiedAt = null;
    await admin.save();
    bustHostCache(was);

    await logScopedChange({
      req, admin: req.admin, activityType: 'settings_change',
      description: `Custom domain disconnected${was ? ` (${was})` : ''}`,
      metadata: { customDomain: was },
    });

    res.json({ success: true, branding: present(admin) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
