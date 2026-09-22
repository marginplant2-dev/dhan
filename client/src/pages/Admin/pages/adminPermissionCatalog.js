/**
 * Mirror of server/models/Admin.js catalog. Keep this in sync manually until
 * we move to a shared package. If a key is added on the server but not here,
 * the Admin Management UI simply won't render its checkbox — backend still
 * enforces it.
 */

export const PERMISSION_KEYS = [
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

  // Netting segment
  'nettingSegment.view', 'nettingSegment.edit',
  'nettingSegment.leverage', 'nettingSegment.margin', 'nettingSegment.commission',
  'nettingSegment.swap', 'nettingSegment.spread', 'nettingSegment.limits',
  'nettingSegment.exitOnly',

  // Hedging segment
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

  // Admin ops
  'admin.createSubAdmin', 'admin.createBroker', 'admin.createBankUser',
  'admin.impersonateUser', 'admin.impersonateAdmin', 'admin.viewAuditLog',
];

/**
 * UI-only metadata: label, short description, and dependency keys.
 * Dependencies auto-check when a dependent is checked (e.g. editing commission
 * requires viewing the segment first). Never enforced server-side — this is
 * purely a UX helper so admins don't create invalid permission combos.
 */
export const PERMISSION_META = {
  'users.view':            { label: 'View users',                  hint: 'See user list and profiles' },
  'users.create':          { label: 'Create users',                hint: 'Create new user accounts',              deps: ['users.view'] },
  'users.edit':            { label: 'Edit users',                  hint: 'Modify user profile / settings',         deps: ['users.view'] },
  'users.block':           { label: 'Block / unblock',             hint: 'Suspend or reactivate accounts',         deps: ['users.view'] },
  'users.wallet.credit':   { label: 'Credit wallet',               hint: 'Add funds to a user wallet',             deps: ['users.view'] },
  'users.wallet.debit':    { label: 'Debit wallet',                hint: 'Remove funds from a user wallet',        deps: ['users.view'] },
  'users.wallet.bonus':    { label: 'Grant / cancel bonus',        hint: 'Issue bonus credit or cancel active bonuses', deps: ['users.view'] },
  'users.kyc.view':        { label: 'View KYC',                    hint: 'View submitted documents',               deps: ['users.view'] },
  'users.kyc.approve':     { label: 'Approve KYC',                 hint: 'Mark KYC as verified',                   deps: ['users.kyc.view'] },
  'users.kyc.reject':      { label: 'Reject KYC',                  hint: 'Mark KYC as rejected',                   deps: ['users.kyc.view'] },
  'users.bank.view':       { label: 'View bank details',           hint: "See user's saved bank accounts",          deps: ['users.view'] },

  'deposits.view':         { label: 'View deposits',               hint: 'See deposit transactions' },
  'deposits.approve':      { label: 'Approve deposits',            hint: 'Credit pending deposits',                deps: ['deposits.view'] },
  'deposits.reject':       { label: 'Reject deposits',             hint: 'Decline deposits',                        deps: ['deposits.view'] },
  'withdrawals.view':      { label: 'View withdrawals',            hint: 'See withdrawal requests' },
  'withdrawals.approve':   { label: 'Approve withdrawals',         hint: 'Process withdrawal requests',             deps: ['withdrawals.view'] },
  'withdrawals.reject':    { label: 'Reject withdrawals',          hint: 'Decline withdrawals',                     deps: ['withdrawals.view'] },

  'trades.view':           { label: 'View positions',                 hint: 'See live/history positions' },
  'trades.modify':         { label: 'Modify positions',               hint: 'Edit SL/TP, reopen',                     deps: ['trades.view'] },
  'trades.close':          { label: 'Close positions',                hint: 'Force-close positions',                  deps: ['trades.view'] },

  'nettingSegment.view':   { label: 'View netting segments',        hint: 'See segment config' },
  'nettingSegment.edit':   { label: 'Edit netting segments',        hint: 'Save netting segment overrides (scoped to own users)', deps: ['nettingSegment.view'] },
  'nettingSegment.leverage':  { label: 'Netting — leverage',         hint: 'maxLeverage / defaultLeverage / leverageOptions', deps: ['nettingSegment.edit'] },
  'nettingSegment.margin':    { label: 'Netting — margin %',         hint: 'Intraday / overnight / options margins',         deps: ['nettingSegment.edit'] },
  'nettingSegment.commission':{ label: 'Netting — commission',        hint: 'commission / type / chargeOn / option rates',     deps: ['nettingSegment.edit'] },
  'nettingSegment.swap':      { label: 'Netting — swap',              hint: 'Swap long/short/type/time',                       deps: ['nettingSegment.edit'] },
  'nettingSegment.spread':    { label: 'Netting — spread',            hint: 'Spread pips, markup, limit-away',                 deps: ['nettingSegment.edit'] },
  'nettingSegment.limits':    { label: 'Netting — limits',            hint: 'minLots, maxLots, maxQty',                        deps: ['nettingSegment.edit'] },
  'nettingSegment.exitOnly':  { label: 'Netting — exit-only mode',    hint: 'Force close-only for this segment',               deps: ['nettingSegment.edit'] },

  'hedgingSegment.view':   { label: 'View hedging segments',        hint: 'See segment config' },
  'hedgingSegment.edit':   { label: 'Edit hedging segments',        hint: 'Save hedging segment overrides (scoped to own users)', deps: ['hedgingSegment.view'] },
  'hedgingSegment.leverage':  { label: 'Hedging — leverage',         deps: ['hedgingSegment.edit'] },
  'hedgingSegment.margin':    { label: 'Hedging — margin %',         deps: ['hedgingSegment.edit'] },
  'hedgingSegment.commission':{ label: 'Hedging — commission',        deps: ['hedgingSegment.edit'] },
  'hedgingSegment.swap':      { label: 'Hedging — swap',              deps: ['hedgingSegment.edit'] },
  'hedgingSegment.spread':    { label: 'Hedging — spread',            deps: ['hedgingSegment.edit'] },
  'hedgingSegment.limits':    { label: 'Hedging — limits',            deps: ['hedgingSegment.edit'] },
  'hedgingSegment.exitOnly':  { label: 'Hedging — exit-only mode',    deps: ['hedgingSegment.edit'] },

  'reorder.view':          { label: 'View reorder delays',         hint: 'See reorder configuration' },
  'reorder.edit':          { label: 'Edit reorder delays',         hint: 'Save reorder override (scoped to own users)', deps: ['reorder.view'] },

  'risk.view':             { label: 'View risk settings',          hint: 'See risk rules in effect' },
  'risk.edit':             { label: 'Edit risk settings',          hint: 'Toggle booleans (block-limits, exit-only)', deps: ['risk.view'] },
  'risk.marginCall':       { label: 'Risk — margin call level',     deps: ['risk.edit'] },
  'risk.stopOut':          { label: 'Risk — stop-out level',        deps: ['risk.edit'] },
  'risk.tradeHold':        { label: 'Risk — position hold timers',     deps: ['risk.edit'] },
  'risk.ledgerClose':      { label: 'Risk — ledger-balance close',  deps: ['risk.edit'] },

  'reports.view':          { label: 'View reports',                hint: 'Dashboards and stats' },
  'reports.export':        { label: 'Export reports',              hint: 'Download CSVs',                         deps: ['reports.view'] },

  'admin.createSubAdmin':  { label: 'Create sub-admins',            hint: 'Only super-admin typically' },
  'admin.createBroker':    { label: 'Create brokers',               hint: 'Sub-admin can create brokers under themselves' },
  'admin.createBankUser':  { label: 'Create bank users',            hint: 'Super-admin only' },
  'admin.impersonateUser': { label: 'Impersonate users',            hint: 'Login-as into a user account' },
  'admin.impersonateAdmin':{ label: 'Impersonate admins',           hint: 'Login-as into another admin' },
  'admin.viewAuditLog':    { label: 'View audit logs',              hint: 'Admin activity logs + hierarchy view' },
};

export const PERMISSION_GROUPS = [
  { name: 'Users', keys: [
    'users.view', 'users.create', 'users.edit', 'users.block',
    'users.wallet.credit', 'users.wallet.debit', 'users.wallet.bonus',
    'users.kyc.view', 'users.kyc.approve', 'users.kyc.reject',
    'users.bank.view',
  ]},
  { name: 'Funds', keys: [
    'deposits.view', 'deposits.approve', 'deposits.reject',
    'withdrawals.view', 'withdrawals.approve', 'withdrawals.reject',
  ]},
  { name: 'Trades', keys: ['trades.view', 'trades.modify', 'trades.close'] },
  { name: 'Netting Segments', keys: [
    'nettingSegment.view', 'nettingSegment.edit',
    'nettingSegment.leverage', 'nettingSegment.margin', 'nettingSegment.commission',
    'nettingSegment.swap', 'nettingSegment.spread', 'nettingSegment.limits',
    'nettingSegment.exitOnly',
  ]},
  { name: 'Hedging Segments', keys: [
    'hedgingSegment.view', 'hedgingSegment.edit',
    'hedgingSegment.leverage', 'hedgingSegment.margin', 'hedgingSegment.commission',
    'hedgingSegment.swap', 'hedgingSegment.spread', 'hedgingSegment.limits',
    'hedgingSegment.exitOnly',
  ]},
  { name: 'Reorder', keys: ['reorder.view', 'reorder.edit'] },
  { name: 'Risk', keys: [
    'risk.view', 'risk.edit',
    'risk.marginCall', 'risk.stopOut', 'risk.tradeHold', 'risk.ledgerClose',
  ]},
  { name: 'Reports', keys: ['reports.view', 'reports.export'] },
  { name: 'Admin Ops', keys: [
    'admin.createSubAdmin', 'admin.createBroker', 'admin.createBankUser',
    'admin.impersonateUser', 'admin.impersonateAdmin', 'admin.viewAuditLog',
  ]},
];

/** Role presets — mirror of server ROLE_PRESETS. */
export const ROLE_PRESETS = {
  super_admin: Object.fromEntries(PERMISSION_KEYS.map(k => [k, true])),

  sub_admin: Object.fromEntries(PERMISSION_KEYS.map(k => [k, (
    [
      'users.view', 'users.create', 'users.edit', 'users.block',
      'users.wallet.credit', 'users.wallet.debit', 'users.wallet.bonus',
      'users.kyc.view', 'users.kyc.approve', 'users.bank.view',
      'deposits.view', 'deposits.approve',
      'withdrawals.view', 'withdrawals.approve',
      'trades.view', 'trades.modify', 'trades.close',
      'nettingSegment.view', 'hedgingSegment.view',
      'reorder.view', 'risk.view',
      'reports.view', 'reports.export',
      'admin.createBroker',
      // Sub-admin sees their own Override Audit log by default.
      'admin.viewAuditLog',
    ].includes(k)
  )])),

  // Broker default — read-only oversight across all settings menus so the
  // sidebar isn't empty after creation. Super-admin grants matching `.edit`
  // keys when they want a broker to actually change config.
  broker: Object.fromEntries(PERMISSION_KEYS.map(k => [k, (
    [
      'users.view', 'users.create', 'users.edit',
      'users.wallet.credit', 'users.wallet.debit',
      'deposits.view', 'withdrawals.view',
      'trades.view', 'trades.modify', 'trades.close',
      'nettingSegment.view', 'hedgingSegment.view',
      'reorder.view', 'risk.view',
      'reports.view',
      'admin.viewAuditLog',
    ].includes(k)
  )])),

  bank_user: Object.fromEntries(PERMISSION_KEYS.map(k => [k, (
    [
      'users.view', 'users.bank.view', 'users.kyc.view',
      'deposits.view', 'deposits.approve', 'deposits.reject',
      'withdrawals.view', 'withdrawals.approve', 'withdrawals.reject',
    ].includes(k)
  )])),
};

/**
 * Permissions a given role is never allowed to hold. Mirror of server-side
 * ROLE_INELIGIBLE_PERMISSIONS. Keys listed here are greyed out in the picker
 * for that role — and even if a malicious client bypasses the UI, the server
 * re-applies the same banlist on save.
 *
 * Rule of thumb: sub_admin cannot create sub_admins or bank_users (only
 * super_admin does). Broker cannot create any admin. Bank_user only handles
 * deposit/withdrawal approval.
 */
export const ROLE_INELIGIBLE_PERMISSIONS = {
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

/** Returns true if a role is allowed to hold this permission key. */
export function isPermissionEligible(role, key) {
  const banned = ROLE_INELIGIBLE_PERMISSIONS[role] || [];
  return !banned.includes(key);
}

/**
 * Convert any-shape permissions payload into the canonical flat-dotted map.
 * Mirror of server/models/Admin.js normalizePermissions — used as a client-side
 * safety net (for example when opening Edit on a legacy admin whose stored
 * permissions are still in nested shape from before the Mixed-field migration).
 */
export function normalizePermissions(perms) {
  const out = {};
  for (const key of PERMISSION_KEYS) out[key] = false;
  if (!perms || typeof perms !== 'object') return out;
  for (const key of PERMISSION_KEYS) {
    if (typeof perms[key] === 'boolean') {
      out[key] = perms[key];
      continue;
    }
    // Fall back to nested traversal (e.g. perms.users.view for 'users.view').
    const parts = key.split('.');
    let cursor = perms;
    for (const p of parts) {
      if (cursor && typeof cursor === 'object' && !Array.isArray(cursor)) cursor = cursor[p];
      else { cursor = undefined; break; }
    }
    if (typeof cursor === 'boolean') out[key] = cursor;
  }
  return out;
}

/**
 * Apply dependency-cascading to a permissions object. If a key is TRUE,
 * all its deps must also be TRUE. Idempotent — safe to call on every change.
 */
export function withDependencies(perms) {
  const out = { ...perms };
  // Iterate until fixed-point (deps can have deps).
  let changed = true;
  let guard = 10;
  while (changed && guard-- > 0) {
    changed = false;
    for (const key of PERMISSION_KEYS) {
      if (!out[key]) continue;
      const deps = PERMISSION_META[key]?.deps || [];
      for (const d of deps) {
        if (!out[d]) {
          out[d] = true;
          changed = true;
        }
      }
    }
  }
  return out;
}

/**
 * When a key is being UN-checked, also un-check anything that depends on it.
 * e.g. unchecking `users.view` should uncheck `users.create`, `users.edit`, etc.
 */
export function cascadeUncheck(perms, keyBeingUnchecked) {
  const out = { ...perms };
  out[keyBeingUnchecked] = false;
  let changed = true;
  let guard = 10;
  while (changed && guard-- > 0) {
    changed = false;
    for (const key of PERMISSION_KEYS) {
      if (!out[key]) continue;
      const deps = PERMISSION_META[key]?.deps || [];
      if (deps.some(d => !out[d])) {
        out[key] = false;
        changed = true;
      }
    }
  }
  return out;
}

/** Count how many in a group are checked — used for "2 of 11" badge. */
export function countChecked(perms, group) {
  let on = 0;
  for (const k of group.keys) if (perms[k]) on++;
  return { on, total: group.keys.length };
}

/** Produce an all-false permissions map (for bank_user reset, etc.). */
export function emptyPermissions() {
  return Object.fromEntries(PERMISSION_KEYS.map(k => [k, false]));
}
