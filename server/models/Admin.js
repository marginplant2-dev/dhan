const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Permission key catalog — single source of truth. Any route or UI referencing
 * a permission must use one of these keys. Grouped for UI tree rendering.
 *
 * Grant semantics: `true` means allowed. Scope (own-users vs all) is derived
 * from role at write time — super_admin writes globals, everyone else writes
 * to their own subtree via `UserSegmentSettings` / `UserRiskSettings`.
 */
const PERMISSION_KEYS = [
  // Users
  'users.view', 'users.create', 'users.edit', 'users.block',
  'users.wallet.credit', 'users.wallet.debit', 'users.wallet.bonus',
  'users.kyc.view', 'users.kyc.approve', 'users.kyc.reject',
  'users.bank.view',

  // Funds
  'deposits.view', 'deposits.approve', 'deposits.reject',
  'withdrawals.view', 'withdrawals.approve', 'withdrawals.reject',

  // Trades
  'trades.view', 'trades.modify', 'trades.close',

  // Segment settings — Netting
  'nettingSegment.view', 'nettingSegment.edit',
  'nettingSegment.leverage', 'nettingSegment.margin', 'nettingSegment.commission',
  'nettingSegment.swap', 'nettingSegment.spread', 'nettingSegment.limits',
  'nettingSegment.exitOnly',

  // Segment settings — Hedging
  'hedgingSegment.view', 'hedgingSegment.edit',
  'hedgingSegment.leverage', 'hedgingSegment.margin', 'hedgingSegment.commission',
  'hedgingSegment.swap', 'hedgingSegment.spread', 'hedgingSegment.limits',
  'hedgingSegment.exitOnly',

  // Reorder
  'reorder.view', 'reorder.edit',

  // Risk
  'risk.view', 'risk.edit',
  'risk.marginCall', 'risk.stopOut', 'risk.tradeHold', 'risk.ledgerClose',

  // Reports
  'reports.view', 'reports.export',

  // Admin operations
  'admin.createSubAdmin', 'admin.createBroker', 'admin.createBankUser',
  'admin.impersonateUser', 'admin.impersonateAdmin', 'admin.viewAuditLog',
];

/** Group → keys map for the Admin Management UI. */
const PERMISSION_GROUPS = {
  Users: [
    'users.view', 'users.create', 'users.edit', 'users.block',
    'users.wallet.credit', 'users.wallet.debit', 'users.wallet.bonus',
    'users.kyc.view', 'users.kyc.approve', 'users.kyc.reject',
    'users.bank.view',
  ],
  Funds: [
    'deposits.view', 'deposits.approve', 'deposits.reject',
    'withdrawals.view', 'withdrawals.approve', 'withdrawals.reject',
  ],
  Trades: ['trades.view', 'trades.modify', 'trades.close'],
  'Netting Segments': [
    'nettingSegment.view', 'nettingSegment.edit',
    'nettingSegment.leverage', 'nettingSegment.margin', 'nettingSegment.commission',
    'nettingSegment.swap', 'nettingSegment.spread', 'nettingSegment.limits',
    'nettingSegment.exitOnly',
  ],
  'Hedging Segments': [
    'hedgingSegment.view', 'hedgingSegment.edit',
    'hedgingSegment.leverage', 'hedgingSegment.margin', 'hedgingSegment.commission',
    'hedgingSegment.swap', 'hedgingSegment.spread', 'hedgingSegment.limits',
    'hedgingSegment.exitOnly',
  ],
  Reorder: ['reorder.view', 'reorder.edit'],
  Risk: [
    'risk.view', 'risk.edit',
    'risk.marginCall', 'risk.stopOut', 'risk.tradeHold', 'risk.ledgerClose',
  ],
  Reports: ['reports.view', 'reports.export'],
  'Admin Ops': [
    'admin.createSubAdmin', 'admin.createBroker', 'admin.createBankUser',
    'admin.impersonateUser', 'admin.impersonateAdmin', 'admin.viewAuditLog',
  ],
};

/** Default permission presets per role. Applied on admin creation only. */
const ROLE_PRESETS = {
  super_admin: Object.fromEntries(PERMISSION_KEYS.map(k => [k, true])),

  sub_admin: Object.fromEntries(PERMISSION_KEYS.map(k => [k, (
    // Users
    k === 'users.view' || k === 'users.create' || k === 'users.edit' || k === 'users.block' ||
    k === 'users.wallet.credit' || k === 'users.wallet.debit' || k === 'users.wallet.bonus' ||
    k === 'users.kyc.view' || k === 'users.kyc.approve' || k === 'users.bank.view' ||
    // Funds
    k === 'deposits.view' || k === 'deposits.approve' ||
    k === 'withdrawals.view' || k === 'withdrawals.approve' ||
    // Trades
    k === 'trades.view' || k === 'trades.modify' || k === 'trades.close' ||
    // Segment/Reorder/Risk view (edit off by default — super-admin grants)
    k === 'nettingSegment.view' || k === 'hedgingSegment.view' ||
    k === 'reorder.view' || k === 'risk.view' ||
    // Reports
    k === 'reports.view' || k === 'reports.export' ||
    // Admin ops — sub-admin manages their own brokers AND should be able to
    // read their own scoped audit log (Override Audit sidebar item) by default.
    k === 'admin.createBroker' ||
    k === 'admin.viewAuditLog'
  )])),

  // Broker default — read-only oversight across all the settings menus so the
  // sidebar isn't empty after creation. Super-admin grants the matching
  // `.edit` / write keys when they want a broker to actually change config.
  broker: Object.fromEntries(PERMISSION_KEYS.map(k => [k, (
    k === 'users.view' || k === 'users.create' || k === 'users.edit' ||
    k === 'users.wallet.credit' || k === 'users.wallet.debit' ||
    k === 'deposits.view' || k === 'withdrawals.view' ||
    // Trades — brokers need modify/close so they can punch trades on behalf
    // of their users from Market Watch (sidebar item is enabled below). Without
    // these the /api/admin/trades/place chokepoint 403s (see adminRouteMap.js:
    // POST /trades/place → trades.modify).
    k === 'trades.view' || k === 'trades.modify' || k === 'trades.close' ||
    // View-level settings so Market Watch / Netting / Hedging / Reorder / Risk
    // sidebar entries appear by default.
    k === 'nettingSegment.view' || k === 'hedgingSegment.view' ||
    k === 'reorder.view' || k === 'risk.view' ||
    k === 'reports.view' ||
    k === 'admin.viewAuditLog'
  )])),

  bank_user: Object.fromEntries(PERMISSION_KEYS.map(k => [k, (
    k === 'users.view' || k === 'users.bank.view' || k === 'users.kyc.view' ||
    k === 'deposits.view' || k === 'deposits.approve' || k === 'deposits.reject' ||
    k === 'withdrawals.view' || k === 'withdrawals.approve' || k === 'withdrawals.reject'
  )])),
};

/**
 * Permissions a given role is NEVER allowed to hold, even if a caller tries to
 * set them. Enforced both in the pre-save hook (server-of-record) and mirrored
 * to the client for disabled checkboxes.
 *
 * Key constraint: sub_admin must NOT be able to create other sub_admins or
 * bank_users — only super_admin creates those. Brokers can't create any admin.
 */
const ROLE_INELIGIBLE_PERMISSIONS = {
  super_admin: [],
  sub_admin: [
    'admin.createSubAdmin',
    'admin.createBankUser',
    'admin.impersonateAdmin',
  ],
  broker: [
    'admin.createSubAdmin',
    'admin.createBroker',
    'admin.createBankUser',
    'admin.impersonateAdmin',
  ],
  bank_user: [
    'admin.createSubAdmin',
    'admin.createBroker',
    'admin.createBankUser',
    'admin.impersonateAdmin',
    'admin.impersonateUser',
    // Bank users only handle deposit/withdrawal approval — no segment/risk/reorder/trade writes
    'nettingSegment.edit', 'nettingSegment.leverage', 'nettingSegment.margin',
    'nettingSegment.commission', 'nettingSegment.swap', 'nettingSegment.spread',
    'nettingSegment.limits', 'nettingSegment.exitOnly',
    'hedgingSegment.edit', 'hedgingSegment.leverage', 'hedgingSegment.margin',
    'hedgingSegment.commission', 'hedgingSegment.swap', 'hedgingSegment.spread',
    'hedgingSegment.limits', 'hedgingSegment.exitOnly',
    'reorder.edit', 'risk.edit',
    'risk.marginCall', 'risk.stopOut', 'risk.tradeHold', 'risk.ledgerClose',
    'trades.modify', 'trades.close',
    'users.wallet.credit', 'users.wallet.debit', 'users.wallet.bonus',
    'users.create', 'users.edit', 'users.block',
  ],
};

/**
 * Force any ineligible permission for the given role to false. Pure function;
 * returns a new permissions object.
 */
function sanitizePermissionsForRole(role, perms) {
  const banned = new Set(ROLE_INELIGIBLE_PERMISSIONS[role] || []);
  const out = { ...(perms || {}) };
  for (const key of banned) out[key] = false;
  return out;
}

/**
 * Normalize a permissions value into the canonical flat-dotted shape, e.g.
 *   { 'users.view': true, 'deposits.view': true, ... }.
 *
 * Handles three historical shapes so upgrades are seamless:
 *   1. Already flat (our current format).
 *   2. Nested (legacy — dotted keys were stored as sub-documents because the
 *      old subdoc schema interpreted dots as paths).
 *   3. Mongoose doc / Map — convert via toObject() first.
 *
 * Missing keys default to `false`. Extra keys outside PERMISSION_KEYS are
 * dropped so migrated data can't carry stale entries.
 */
function normalizePermissions(perms) {
  if (!perms) return { ...permissionsDefaults };
  if (typeof perms.toObject === 'function') {
    try { perms = perms.toObject(); } catch { /* fall through */ }
  }
  const out = { ...permissionsDefaults };
  for (const key of PERMISSION_KEYS) {
    // Flat key takes precedence.
    if (typeof perms[key] === 'boolean') {
      out[key] = perms[key];
      continue;
    }
    // Fall back to nested traversal (e.g. perms.users.view).
    const parts = key.split('.');
    let cursor = perms;
    for (const p of parts) {
      if (cursor && typeof cursor === 'object' && !Array.isArray(cursor)) {
        cursor = cursor[p];
      } else {
        cursor = undefined;
        break;
      }
    }
    if (typeof cursor === 'boolean') out[key] = cursor;
  }
  return out;
}

/**
 * Build the per-key default map used when a new admin is seeded with a role
 * preset. The permissions FIELD itself is stored as Mixed (see below) because
 * Mongoose would otherwise interpret dots in keys like 'users.view' as nested
 * schema paths, which breaks validation ("Cast to Object failed for users").
 */
const permissionsDefaults = PERMISSION_KEYS.reduce((acc, key) => {
  acc[key] = false;
  return acc;
}, {});

const adminSchema = new mongoose.Schema({
  oderId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  password: { type: String, required: true, minlength: 6 },
  name: { type: String, required: true, trim: true },

  // Role hierarchy: super_admin > sub_admin > broker  /  bank_user (flat, reports to super_admin)
  role: {
    type: String,
    enum: ['super_admin', 'sub_admin', 'broker', 'bank_user'],
    required: true
  },

  // Parent reference for hierarchy
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  parentOderId: { type: String, default: null },

  // Wallet for sub_admin and broker (bank_user has no wallet)
  wallet: {
    balance: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    totalDeposits: { type: Number, default: 0 },
    totalWithdrawals: { type: Number, default: 0 }
  },

  // Permissions — flat map of 'dottedKey' → boolean. Stored as Mixed because
  // Mongoose treats dots in schema field names as nested paths, which
  // mis-reads our keys (e.g. 'users.view', 'deposits.view') as sub-documents.
  // Mixed lets us persist the object verbatim; we still control the shape via
  // PERMISSION_KEYS + sanitizePermissionsForRole() in the pre-save hook.
  permissions: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({ ...permissionsDefaults }),
  },

  // White-label identity. Shown instead of the platform's branding on this
  // admin's own domain.
  brandName: { type: String, trim: true, default: '' },
  logoUrl: { type: String, trim: true, default: '' },

  // Custom domain. `customDomain` is unique across tenants (sparse, so the
  // many admins without one don't collide on null).
  customDomain: { type: String, trim: true, lowercase: true, default: null },
  customDomainStatus: {
    type: String,
    enum: ['NONE', 'PENDING_DNS', 'VERIFYING', 'ISSUING_CERT', 'READY', 'FAILED'],
    default: 'NONE',
  },
  customDomainToken: { type: String, default: null },
  customDomainLastError: { type: String, default: '' },
  customDomainVerifiedAt: { type: Date, default: null },

  // Status
  isActive: { type: Boolean, default: true },

  // Security
  lastLogin: { type: Date, default: null },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
}, {
  timestamps: true,
  // Normalize the permissions map on every serialization. Legacy admins have
  // nested-shape permissions (Mongoose subdoc legacy); new admins have flat.
  // The client + scoped middleware always expect flat dotted keys, so we
  // guarantee that shape at the JSON boundary regardless of what's on disk.
  toJSON: {
    transform(_doc, ret) {
      ret.permissions = normalizePermissions(ret.permissions);
      delete ret.password;
      return ret;
    },
  },
  toObject: {
    transform(_doc, ret) {
      ret.permissions = normalizePermissions(ret.permissions);
      return ret;
    },
  },
});

// Hash password before saving and seed role-based permission defaults.
adminSchema.pre('save', async function() {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }

  // Seed permissions on new admins — merge preset under any caller-provided overrides.
  if (this.isNew) {
    const preset = ROLE_PRESETS[this.role] || {};
    const provided = normalizePermissions(this.permissions);
    const merged = { ...preset };
    for (const k of PERMISSION_KEYS) {
      if (provided[k] === true || provided[k] === false) merged[k] = provided[k];
    }
    this.permissions = sanitizePermissionsForRole(this.role, merged);
    this.markModified('permissions');
  } else {
    // On every save of an existing doc, opportunistically migrate legacy
    // nested-shape permissions into the flat-dotted format AND re-sanitize.
    // Cheap — normalizePermissions is a dict walk over 54 keys.
    const normalized = normalizePermissions(this.permissions);
    this.permissions = sanitizePermissionsForRole(this.role, normalized);
    this.markModified('permissions');
  }
});

// Compare password method
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Check if this admin has a permission. Super-admin shortcuts to true so we
 * never accidentally lock them out on a key they were never asked to grant.
 */
adminSchema.methods.hasPermission = function(key) {
  if (!key) return false;
  if (this.role === 'super_admin') return true;
  if (!this.permissions) return false;
  // Flat form
  if (typeof this.permissions[key] === 'boolean') return this.permissions[key];
  // Legacy nested form — e.g. permissions.users.view for key 'users.view'
  const parts = key.split('.');
  let cursor = this.permissions;
  for (const p of parts) {
    if (cursor && typeof cursor === 'object' && !Array.isArray(cursor)) cursor = cursor[p];
    else return false;
  }
  return !!cursor;
};

// Generate admin ID based on role
adminSchema.statics.generateAdminId = async function(role) {
  let prefix;
  switch (role) {
    case 'super_admin': prefix = 'SA'; break;
    case 'sub_admin': prefix = 'AD'; break;
    case 'broker': prefix = 'BR'; break;
    case 'bank_user': prefix = 'BK'; break;
    default: prefix = 'XX';
  }

  let adminId;
  let exists = true;
  while (exists) {
    const random = Math.floor(10000 + Math.random() * 90000);
    adminId = `${prefix}${random}`;
    const existing = await this.findOne({ oderId: adminId });
    exists = !!existing;
  }
  return adminId;
};

// Get direct-child admins (sub-admins under a super-admin, brokers under a sub-admin).
adminSchema.methods.getChildren = async function() {
  return await this.model('Admin').find({ parentId: this._id });
};

// Can this admin manage another admin (for create/edit/delete)?
adminSchema.methods.canManage = function(targetAdmin) {
  if (this.role === 'super_admin') return true;
  if (this.role === 'sub_admin' && targetAdmin.parentId?.toString() === this._id.toString()) return true;
  return false;
};

// Indexes
adminSchema.index({ role: 1, isActive: 1 });
adminSchema.index({ parentId: 1 });
adminSchema.index({ parentOderId: 1 });
// One domain, one tenant. Partial (not merely sparse) so several admins can
// hold null without tripping the index.
adminSchema.index(
  { customDomain: 1 },
  { unique: true, partialFilterExpression: { customDomain: { $type: 'string' } } }
);

const Admin = mongoose.model('Admin', adminSchema);

// Export catalog alongside the model so routes + UI stay aligned.
Admin.PERMISSION_KEYS = PERMISSION_KEYS;
Admin.PERMISSION_GROUPS = PERMISSION_GROUPS;
Admin.ROLE_PRESETS = ROLE_PRESETS;
Admin.ROLE_INELIGIBLE_PERMISSIONS = ROLE_INELIGIBLE_PERMISSIONS;
Admin.sanitizePermissionsForRole = sanitizePermissionsForRole;
Admin.normalizePermissions = normalizePermissions;

module.exports = Admin;
module.exports.PERMISSION_KEYS = PERMISSION_KEYS;
module.exports.PERMISSION_GROUPS = PERMISSION_GROUPS;
module.exports.ROLE_PRESETS = ROLE_PRESETS;
module.exports.ROLE_INELIGIBLE_PERMISSIONS = ROLE_INELIGIBLE_PERMISSIONS;
module.exports.sanitizePermissionsForRole = sanitizePermissionsForRole;
module.exports.normalizePermissions = normalizePermissions;
