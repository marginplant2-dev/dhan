/**
 * Self-check for the tenancy rules. No DB, no network — pins the arithmetic
 * and the fail-closed defaults that the acceptance tests care about.
 *
 *   node scripts/tenancy.selfcheck.js
 */

const assert = require('assert');

const { normalizeDomain, DomainError, dnsInstructions } = require('../services/tenantDomain');
const { earnsFrom, ownedEventsFilter } = require('../services/revenueAttribution');
const { capPermissions, scopeUserFilter } = require('../middleware/adminPermission');

function throws(fn, what) {
  try { fn(); } catch (err) {
    assert.ok(err instanceof DomainError, `${what}: wrong error type (${err.message})`);
    return;
  }
  assert.fail(`${what}: expected a rejection`);
}

(async () => {
  /* ── domain normalisation + validation ─────────────────────────────── */
  assert.strictEqual(normalizeDomain('  HTTPS://Broker-X.com:8443/signup/  '), 'broker-x.com');
  assert.strictEqual(normalizeDomain('app.broker-x.com.'), 'app.broker-x.com');
  assert.strictEqual(normalizeDomain(''), null);
  assert.strictEqual(normalizeDomain(null), null);
  throws(() => normalizeDomain('203.0.113.7'), 'IP address');
  throws(() => normalizeDomain('not a domain'), 'invalid hostname');
  throws(() => normalizeDomain('dhanfunded.com'), 'platform domain');
  throws(() => normalizeDomain('anything.dhanfunded.com'), 'platform subdomain');

  const records = dnsInstructions('broker-x.com', 'tok123');
  assert.strictEqual(records.length, 2);
  assert.strictEqual(records[0].type, 'CNAME');
  assert.strictEqual(records[1].name, '_dhanfunded-verify.broker-x.com');
  assert.strictEqual(records[1].value, 'tok123');

  /* ── revenue attribution: a new owner earns only from the transfer ──── */
  const joined = new Date('2026-09-10T00:00:00Z');
  assert.strictEqual(earnsFrom(new Date('2026-09-01'), joined), false, 'before transfer must not count');
  assert.strictEqual(earnsFrom(new Date('2026-09-20'), joined), true, 'after transfer counts');
  assert.strictEqual(earnsFrom(joined, joined), true, 'the transfer instant itself counts');
  assert.strictEqual(earnsFrom(new Date('2020-01-01'), null), true, 'never moved ⇒ whole history counts');

  // An empty scope matches nothing — never "no filter".
  assert.deepStrictEqual(ownedEventsFilter([]), { oderId: { $in: [] } });

  const filter = ownedEventsFilter([
    { oderId: 'U1', parentAdminAssignedAt: joined },
    { oderId: 'U2', parentAdminAssignedAt: null },
  ]);
  assert.deepStrictEqual(filter.$or[0], { oderId: 'U1', createdAt: { $gte: joined } });
  assert.deepStrictEqual(filter.$or[1], { oderId: 'U2' });

  /* ── cap rule: nobody grants more than they hold ───────────────────── */
  const granter = { hasPermission: (k) => k === 'users.view' || k === 'users.edit' };
  const capped = capPermissions(granter, {
    'users.view': true,
    'users.edit': false,
    'withdrawals.approve': true,   // granter does not hold this
  });
  assert.strictEqual(capped.permissions['users.view'], true);
  assert.strictEqual(capped.permissions['withdrawals.approve'], false, 'must be clipped');
  assert.deepStrictEqual(capped.clipped, ['withdrawals.approve'], 'save response must report the clip');

  /* ── scoping: fail closed ──────────────────────────────────────────── */
  assert.deepStrictEqual(await scopeUserFilter(null), { _id: { $in: [] } }, 'no actor ⇒ nothing');
  assert.deepStrictEqual(await scopeUserFilter({ role: 'nonsense' }), { _id: { $in: [] } }, 'unknown role ⇒ nothing');
  assert.deepStrictEqual(await scopeUserFilter({ role: 'super_admin' }), { parentAdminId: null },
    'super-admin owns the platform pool, not everything');
  const brokerId = 'abc';
  assert.deepStrictEqual(await scopeUserFilter({ role: 'broker', _id: brokerId }), { parentAdminId: brokerId });

  console.log('tenancy self-check: all assertions passed');
  process.exit(0);
})().catch((err) => {
  console.error('tenancy self-check FAILED:', err.message);
  process.exit(1);
});
