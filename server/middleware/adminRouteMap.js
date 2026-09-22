/**
 * Route → permission-key map for every admin endpoint.
 *
 * HOW THE CHOKEPOINT WORKS:
 *   app.use('/api/admin', enforceAdminPermissionByRoute);
 *
 * For each incoming admin request we:
 *   1. Look up the (METHOD, pattern) in ROUTE_MAP below.
 *   2. If we find a `permission`, call `requirePermission(permission)` inline.
 *      The middleware rejects with 403 if the admin lacks that permission.
 *   3. If we find `{ public: true }`, skip the check (e.g. login).
 *   4. If we find nothing → fall through to the legacy behavior: require a
 *      valid admin token (resolveAdminFromRequest must succeed) but no
 *      specific permission. This keeps 100% of today's behavior for routes
 *      we haven't catalogued yet, so Phase 2 can't accidentally lock admins
 *      out of a forgotten endpoint.
 *
 * Patterns use Express-style `:param` placeholders and are matched by the
 * matcher in `enforceAdminPermissionByRoute.js`.
 *
 * super_admin always passes (`hasPermission` shortcut). So every entry here
 * is really "what key must a sub_admin / broker / bank_user have to access
 * this route".
 */

const ROUTE_MAP = [
  // ───────── Auth / public (no permission check, not even admin token) ─────────
  // Patterns are relative to the '/api/admin' mount prefix — so the actual URL
  // '/api/admin/auth/login' matches as '/auth/login'.
  { method: 'POST',   pattern: '/auth/login',                  public: true },
  { method: 'POST',   pattern: '/auth/seed',                   public: true },
  { method: 'GET',    pattern: '/auth/verify',                 public: true },
  { method: 'POST',   pattern: '/auth/logout',                 public: true },
  { method: 'GET',    pattern: '/auth/me',                     public: true },
  { method: 'POST',   pattern: '/auth/migrate-permissions',    public: true },

  // ───────── Dashboard (any authenticated admin) ─────────
  // deposits.view is the lowest-common-denominator permission every role's
  // preset grants (super/sub/broker/bank_user all hold it), so the stats
  // page is accessible to everyone who can log in. Reports-specific data
  // inside the dashboard is still gated per-widget downstream.
  { method: 'GET',    pattern: '/dashboard/stats',             permission: 'deposits.view' },

  // ───────── Users ─────────
  { method: 'GET',    pattern: '/users',                       permission: 'users.view' },
  { method: 'GET',    pattern: '/users/search',                permission: 'users.view' },
  { method: 'GET',    pattern: '/users/:userId',               permission: 'users.view' },
  { method: 'POST',   pattern: '/users',                       permission: 'users.create' },
  { method: 'PUT',    pattern: '/users/:userId',               permission: 'users.edit' },
  { method: 'PUT',    pattern: '/users/:userId/trade-modes',   permission: 'users.edit' },
  { method: 'PUT',    pattern: '/users/:userId/currency-permissions', permission: 'users.edit' },
  { method: 'PATCH',  pattern: '/users/:userId/status',        permission: 'users.block' },
  { method: 'DELETE', pattern: '/users/:userId',               permission: 'users.block' },
  { method: 'PUT',    pattern: '/users/:userId/password',      permission: 'users.edit' },
  { method: 'POST',   pattern: '/users/:userId/login-as',      permission: 'admin.impersonateUser' },
  { method: 'POST',   pattern: '/subadmins/:adminId/login-as',  permission: 'admin.impersonateAdmin' },
  { method: 'POST',   pattern: '/brokers/:brokerId/login-as',   permission: 'admin.impersonateAdmin' },
  { method: 'POST',   pattern: '/users/:userId/download-report', permission: 'reports.export' },
  { method: 'POST',   pattern: '/users/:userId/wallet',        permission: 'users.wallet.credit' },

  // ───────── Bonus templates / user bonuses ─────────
  { method: 'GET',    pattern: '/bonus-templates',             permission: 'users.wallet.bonus' },
  { method: 'POST',   pattern: '/bonus-templates',             permission: 'users.wallet.bonus' },
  { method: 'PUT',    pattern: '/bonus-templates/:id',         permission: 'users.wallet.bonus' },
  { method: 'DELETE', pattern: '/bonus-templates/:id',         permission: 'users.wallet.bonus' },
  { method: 'GET',    pattern: '/user-bonuses',                permission: 'users.wallet.bonus' },
  { method: 'POST',   pattern: '/user-bonuses/grant',          permission: 'users.wallet.bonus' },
  { method: 'POST',   pattern: '/user-bonuses/:id/cancel',     permission: 'users.wallet.bonus' },

  // ───────── KYC ─────────
  { method: 'GET',    pattern: '/kyc',                         permission: 'users.kyc.view' },
  { method: 'GET',    pattern: '/kyc/pending-count',           permission: 'users.kyc.view' },
  { method: 'GET',    pattern: '/kyc/user/:userId',            permission: 'users.kyc.view' },
  { method: 'PUT',    pattern: '/kyc/:kycId/approve',          permission: 'users.kyc.approve' },
  { method: 'PUT',    pattern: '/kyc/:kycId/reject',           permission: 'users.kyc.reject' },
  { method: 'PUT',    pattern: '/kyc/:kycId/resubmit',         permission: 'users.kyc.approve' },

  // ───────── Transactions (deposits + withdrawals live on same rows) ─────────
  // Single PUT endpoint handles both approve/reject and status transitions —
  // guard with the most-permissive of deposits/withdrawals view; fine-grained
  // status is enforced inside the handler.
  { method: 'GET',    pattern: '/transactions',                permission: 'deposits.view' },
  { method: 'GET',    pattern: '/transactions/reconciliation', permission: 'deposits.view' },
  { method: 'PUT',    pattern: '/transactions/:id',            permission: 'deposits.approve' },

  // Payment methods (admin-configured deposit methods)
  { method: 'GET',    pattern: '/payment-methods',             permission: 'deposits.view' },
  // Payment-method config is intentionally super_admin-only. We reuse
  // `admin.createSubAdmin` because (a) its ineligibility list bans every
  // non-super role from ever holding it and (b) adding a dedicated
  // `admin.configurePaymentMethods` key would require a full catalog+preset
  // roll-out. If that key is ever introduced, swap these three lines.
  { method: 'POST',   pattern: '/payment-methods',             permission: 'admin.createSubAdmin' },
  { method: 'PUT',    pattern: '/payment-methods/:id',         permission: 'admin.createSubAdmin' },
  { method: 'DELETE', pattern: '/payment-methods/:id',         permission: 'admin.createSubAdmin' },

  // Admin's own payment details (bank/upi/crypto for disbursement)
  { method: 'GET',    pattern: '/payment-details',             permission: 'deposits.view' },
  { method: 'POST',   pattern: '/payment-details/bank',        permission: 'deposits.view' },
  { method: 'POST',   pattern: '/payment-details/upi',         permission: 'deposits.view' },
  { method: 'POST',   pattern: '/payment-details/crypto',      permission: 'deposits.view' },
  // Writes need 'deposits.approve' (write-grade), not the view key — otherwise
  // any read-only auditor with deposits.view could edit/delete admin payout
  // details by id. Per-admin ownership is still enforced inside the handler.
  { method: 'PUT',    pattern: '/payment-details/:id',         permission: 'deposits.approve' },
  { method: 'DELETE', pattern: '/payment-details/:id',         permission: 'deposits.approve' },

  // ───────── Trades ─────────
  { method: 'GET',    pattern: '/trades/active',               permission: 'trades.view' },
  { method: 'GET',    pattern: '/trades/composed',             permission: 'trades.view' },
  { method: 'GET',    pattern: '/trades/pending',              permission: 'trades.view' },
  { method: 'GET',    pattern: '/trades/history',              permission: 'trades.view' },
  { method: 'POST',   pattern: '/trades/place',                permission: 'trades.modify' },
  { method: 'POST',   pattern: '/trades/:id/close',            permission: 'trades.close' },
  { method: 'POST',   pattern: '/trades/:id/cancel',           permission: 'trades.close' },
  { method: 'POST',   pattern: '/trades/:id/reopen',           permission: 'trades.modify' },
  { method: 'POST',   pattern: '/trades/:id/close-with-pnl',   permission: 'trades.close' },
  { method: 'DELETE', pattern: '/trades/:id/delete',           permission: 'trades.modify' },
  { method: 'PUT',    pattern: '/trades/:id/edit',             permission: 'trades.modify' },
  { method: 'GET',    pattern: '/trade-edit-logs',             permission: 'admin.viewAuditLog' },
  { method: 'POST',   pattern: '/netting/option-expiry-settlement', permission: 'trades.modify' },

  // ───────── Watchlist ─────────
  { method: 'GET',    pattern: '/watchlist/:segment',          permission: 'users.view' },
  { method: 'POST',   pattern: '/watchlist',                   permission: 'nettingSegment.edit' },
  { method: 'DELETE', pattern: '/watchlist',                   permission: 'nettingSegment.edit' },

  // ───────── Activity logs ─────────
  { method: 'GET',    pattern: '/activity-logs',               permission: 'admin.viewAuditLog' },
  { method: 'GET',    pattern: '/activity-logs/export',        permission: 'reports.export' },
  { method: 'GET',    pattern: '/activity-logs/user/:userId',  permission: 'admin.viewAuditLog' },
  { method: 'GET',    pattern: '/activity-logs/stats',         permission: 'admin.viewAuditLog' },
  { method: 'GET',    pattern: '/subadmin-activity-logs',      permission: 'admin.viewAuditLog' },
  { method: 'GET',    pattern: '/broker-activity-logs',        permission: 'admin.viewAuditLog' },
  { method: 'POST',   pattern: '/test-activity-log',           permission: 'admin.viewAuditLog' },
  { method: 'GET',    pattern: '/all-activity-logs',           permission: 'admin.viewAuditLog' },
  { method: 'GET',    pattern: '/admin-activity-logs/export',  permission: 'reports.export' },

  // ───────── Symbols ─────────
  { method: 'GET',    pattern: '/symbols',                     permission: 'nettingSegment.view' },
  { method: 'GET',    pattern: '/symbols/:symbol',             permission: 'nettingSegment.view' },
  { method: 'POST',   pattern: '/symbols',                     permission: 'nettingSegment.edit' },
  { method: 'PUT',    pattern: '/symbols/:symbol',             permission: 'nettingSegment.edit' },
  { method: 'DELETE', pattern: '/symbols/:symbol',             permission: 'nettingSegment.edit' },
  { method: 'POST',   pattern: '/symbols/sync',                permission: 'nettingSegment.edit' },
  { method: 'POST',   pattern: '/symbols/bulk-update',         permission: 'nettingSegment.edit' },

  // ───────── Segments ─────────
  { method: 'GET',    pattern: '/segments',                    permission: 'nettingSegment.view' },
  { method: 'POST',   pattern: '/segments/reseed',             permission: 'nettingSegment.edit' },
  { method: 'GET',    pattern: '/segments/search-instruments', permission: 'nettingSegment.view' },
  { method: 'GET',    pattern: '/segments/:id',                permission: 'nettingSegment.view' },

  // ───────── Hierarchy / admin management ─────────
  // Bug fix: these listings must be visible to sub_admins so they can manage
  // their own brokers. Sub_admin preset holds `admin.createBroker` and
  // super_admin bypasses all checks, so gating on createBroker opens the page
  // to both without leaking it to plain brokers / bank_users (which also
  // shouldn't see the admin tree).
  { method: 'GET',    pattern: '/hierarchy',                   permission: 'admin.createBroker' },
  { method: 'GET',    pattern: '/hierarchy/tree',              permission: 'admin.createBroker' },
  { method: 'GET',    pattern: '/hierarchy/subadmins',         permission: 'admin.createBroker' },
  // Bug fix: `/hierarchy/create` needs to authorize based on the requested
  // target role (sub_admin/broker/bank_user). Marking public here and doing
  // the role-aware permission check inside the handler avoids mis-denying
  // sub_admins who legitimately have `admin.createBroker` but not
  // `admin.createSubAdmin` (which is banned for sub_admin anyway).
  { method: 'POST',   pattern: '/hierarchy/create',            public: true },
  { method: 'PUT',    pattern: '/hierarchy/:id',               permission: 'admin.createBroker' },
  { method: 'DELETE', pattern: '/hierarchy/:id',               permission: 'admin.createBroker' },
  // Admin ↔ admin wallet funding. Using admin.createBroker here keeps the
  // action inside the management surface (sub_admin for their brokers,
  // super_admin for anyone) without reusing the misleading user-wallet key.
  { method: 'POST',   pattern: '/hierarchy/fund-request',      permission: 'admin.createBroker' },
  { method: 'POST',   pattern: '/hierarchy/approve-fund',      permission: 'admin.createBroker' },
  { method: 'GET',    pattern: '/hierarchy/:id/fund-requests', permission: 'admin.createBroker' },
  { method: 'POST',   pattern: '/hierarchy/:id/wallet',        permission: 'admin.createBroker' },
  // Impersonation split: logging in as another sub_admin remains super-admin
  // only. Logging in as a broker should also work for the sub_admin that
  // created them, so it's now gated by broker-management permission (with a
  // parent-scope check inside the handler).
  { method: 'POST',   pattern: '/subadmins/:adminId/login-as', permission: 'admin.impersonateAdmin' },
  { method: 'POST',   pattern: '/brokers/:brokerId/login-as',  permission: 'admin.createBroker' },

  // ───────── Phase 3: scoped endpoints (router does its own requirePermission,
  // so mark public here to skip the chokepoint's outer check — otherwise we'd
  // double-check and some paths would 401 before the router's own middleware
  // runs). Security is enforced per-route inside routes/adminScoped.js. ─────
  { method: 'GET',    pattern: '/scoped/segments/:mode',            public: true },
  { method: 'GET',    pattern: '/scoped/segments/:mode/:name',      public: true },
  { method: 'PUT',    pattern: '/scoped/segments/:mode/:name',      public: true },
  { method: 'DELETE', pattern: '/scoped/segments/:mode/:name',      public: true },
  { method: 'GET',    pattern: '/scoped/reorder',                   public: true },
  { method: 'PUT',    pattern: '/scoped/reorder',                   public: true },
  { method: 'DELETE', pattern: '/scoped/reorder',                   public: true },
  { method: 'GET',    pattern: '/scoped/risk',                      public: true },
  { method: 'PUT',    pattern: '/scoped/risk',                      public: true },
  { method: 'DELETE', pattern: '/scoped/risk',                      public: true },
  { method: 'GET',    pattern: '/scoped/audit',                     public: true },

  // Phase 7: per-user scoped writes — router enforces perm + scope internally.
  { method: 'GET',    pattern: '/scoped/users/search',              public: true },
  { method: 'GET',    pattern: '/scoped/users/:userId/segment/:mode/:name', public: true },
  { method: 'PUT',    pattern: '/scoped/users/:userId/segment/:mode/:name', public: true },
  { method: 'DELETE', pattern: '/scoped/users/:userId/segment/:mode/:name', public: true },
  { method: 'GET',    pattern: '/scoped/users/:userId/reorder',     public: true },
  { method: 'PUT',    pattern: '/scoped/users/:userId/reorder',     public: true },
  { method: 'DELETE', pattern: '/scoped/users/:userId/reorder',     public: true },
  { method: 'GET',    pattern: '/scoped/users/:userId/risk',        public: true },
  { method: 'PUT',    pattern: '/scoped/users/:userId/risk',        public: true },
  { method: 'DELETE', pattern: '/scoped/users/:userId/risk',        public: true },
  { method: 'GET',    pattern: '/scoped/users/:userId/snapshot',    public: true },

  // Phase 9: scoped user management
  { method: 'GET',    pattern: '/scoped/users-list',                  public: true },
  { method: 'GET',    pattern: '/scoped/users-list/:id',              public: true },
  { method: 'PATCH',  pattern: '/scoped/users-list/:id/status',       public: true },
  { method: 'POST',   pattern: '/scoped/users-list/:id/wallet',       public: true },
  { method: 'GET',    pattern: '/scoped/kyc-list',                    public: true },
  { method: 'GET',    pattern: '/scoped/kyc-list/:kycId',             public: true },
  { method: 'PUT',    pattern: '/scoped/kyc-list/:kycId/approve',     public: true },
  { method: 'PUT',    pattern: '/scoped/kyc-list/:kycId/reject',      public: true },
  { method: 'GET',    pattern: '/scoped/activity-logs-list',          public: true },
  { method: 'GET',    pattern: '/scoped/trades/composed',             public: true },
  { method: 'GET',    pattern: '/scoped/trades/open',                 public: true },
  { method: 'GET',    pattern: '/scoped/trades/pending',              public: true },
  { method: 'GET',    pattern: '/scoped/trades/history',              public: true },
  { method: 'GET',    pattern: '/scoped/transactions-list',           public: true },

  // Phase 8: scoped script (per-symbol) overrides
  { method: 'GET',    pattern: '/scoped/scripts/:mode',                           public: true },
  { method: 'GET',    pattern: '/scoped/scripts/:mode/:segmentName/:symbol',      public: true },
  { method: 'PUT',    pattern: '/scoped/scripts/:mode/:segmentName/:symbol',      public: true },
  { method: 'DELETE', pattern: '/scoped/scripts/:mode/:segmentName/:symbol',      public: true },
  { method: 'GET',    pattern: '/scoped/users/:userId/script/:mode/:segmentName/:symbol', public: true },
  { method: 'PUT',    pattern: '/scoped/users/:userId/script/:mode/:segmentName/:symbol', public: true },
  { method: 'DELETE', pattern: '/scoped/users/:userId/script/:mode/:segmentName/:symbol', public: true },
];

/**
 * Convert an Express-style pattern ('/users/:userId') into a regex that the
 * matcher can test actual paths against. Cached for performance.
 */
function _patternToRegex(pattern) {
  // Replace :param first (before other escaping would turn `:` into `\:`),
  // using a placeholder that can't appear in a URL, then escape the rest,
  // then swap the placeholder for the capture group.
  const PARAM_TOKEN = '__PARAM_TOKEN__';
  const withTokens = pattern.replace(/:([A-Za-z0-9_]+)/g, PARAM_TOKEN);
  const escaped = withTokens.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const finalPattern = escaped.split(PARAM_TOKEN).join('([^/]+)');
  return new RegExp('^' + finalPattern + '$');
}

const COMPILED = ROUTE_MAP.map(entry => ({
  ...entry,
  regex: _patternToRegex(entry.pattern),
}));

/** Find the best route entry for an incoming (method, subpath). */
function lookupRoute(method, subpath) {
  const m = String(method || '').toUpperCase();
  // Strip query string just in case
  const p = String(subpath || '').split('?')[0];
  for (const entry of COMPILED) {
    if (entry.method !== m) continue;
    if (entry.regex.test(p)) return entry;
  }
  return null;
}

module.exports = {
  ROUTE_MAP,
  lookupRoute,
};
