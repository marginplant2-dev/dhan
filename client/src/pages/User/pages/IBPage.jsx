import { useEffect, useState, useCallback } from 'react';
import { useOutletContext, useParams, useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authData.token || ''}` };
}

const fmtInr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const daysUntil = (date) => {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
};

const SUB_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'coupon', label: 'My Coupon' },
  { key: 'redemptions', label: 'Redemptions' },
  { key: 'withdraw', label: 'Withdraw' }
];

function ApplyForm({ user, onApplied, onError, error }) {
  const [form, setForm] = useState({
    businessName: '',
    website: '',
    marketingPlan: '',
    expectedMonthlyReferrals: 0,
    experience: ''
  });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    onError?.(null);
    try {
      const res = await fetch(`${API_URL}/api/ib/apply`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) {
        await onApplied?.();
      } else {
        onError?.(data.error || 'Application failed');
      }
    } catch (err) { onError?.(err.message); }
    setBusy(false);
  };

  const samplePrefix = (user?.name || 'YOU').split(' ')[0].toUpperCase().replace(/[^A-Z0-9]/g, '') || 'YOU';

  // Collapsed until the user opts in. A five-field form stretched edge-to-edge
  // was the first thing on the page for people who had no interest in it.
  if (!open) {
    return (
      <div style={formShell}>
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 0 }}>
          <div style={pitchHead}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', opacity: .75 }}>
              PARTNER PROGRAMME
            </div>
            <h2 style={{ margin: '6px 0 0', fontSize: 22, letterSpacing: '-.02em' }}>
              Earn on every referral
            </h2>
          </div>

          <div style={{ padding: 22 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 18px' }}>
              Get your own coupon code. Anyone who buys a challenge with it gets a
              discount, and you earn a commission on that purchase.
            </p>

            <div style={pitchGrid}>
              {[
                ['Your own code', <>Issued on approval, e.g. <code style={codeChip}>{samplePrefix}24</code></>],
                ['Buyers save', 'They get a discount for using your code'],
                ['You earn', 'Commission credited on each challenge sold'],
              ].map(([h, b]) => (
                <div key={h} style={pitchCell}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{h}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{b}</div>
                </div>
              ))}
            </div>

            {error && <div style={{ ...errBox, marginTop: 16, marginBottom: 0 }}>{error}</div>}

            <button type="button" onClick={() => setOpen(true)} style={{ ...primaryBtn, marginTop: 20, width: '100%' }}>
              Apply to become a partner
            </button>
            <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', textAlign: 'center', margin: '10px 0 0' }}>
              Takes a minute · reviewed by admin
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={formShell}>
      <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 19, color: 'var(--text-primary)', letterSpacing: '-.01em' }}>
              Partner application
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12.5, margin: '5px 0 0' }}>
              Tell us about your reach. Admin reviews every application.
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} style={ghostBtn}>Cancel</button>
        </div>

        <div style={fieldRow}>
          <label style={lbl} htmlFor="ib-business">Business / Channel Name <span style={{ color: '#ef4444' }}>*</span></label>
          <input id="ib-business" style={inp} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="e.g. Nifty Traders Hub" required />
        </div>

        {/* Short fields pair up on desktop so the form doesn't read as one long column. */}
        <div style={twoCol}>
          <div style={fieldRow}>
            <label style={lbl} htmlFor="ib-site">Website / Social Profile</label>
            <input id="ib-site" style={inp} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://youtube.com/@yourchannel" />
          </div>
          <div style={fieldRow}>
            <label style={lbl} htmlFor="ib-refs">Expected Monthly Referrals</label>
            <input id="ib-refs" style={inp} type="number" min="0" value={form.expectedMonthlyReferrals} onChange={(e) => setForm({ ...form, expectedMonthlyReferrals: Number(e.target.value) })} />
          </div>
        </div>

        <div style={fieldRow}>
          <label style={lbl} htmlFor="ib-plan">Marketing Plan</label>
          <textarea id="ib-plan" style={{ ...inp, minHeight: 84, resize: 'vertical' }} value={form.marketingPlan} onChange={(e) => setForm({ ...form, marketingPlan: e.target.value })} placeholder="How will you reach traders? Channels, audience size, content style." />
        </div>

        <div style={fieldRow}>
          <label style={lbl} htmlFor="ib-exp">Past Experience</label>
          <textarea id="ib-exp" style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder="Any affiliate or community-building work you've done before." />
        </div>

        {error && <div style={errBox}>{error}</div>}

        <button type="submit" disabled={busy} style={{ ...primaryBtn, width: '100%', opacity: busy ? 0.65 : 1 }}>
          {busy ? 'Submitting…' : 'Submit application'}
        </button>
      </form>
    </div>
  );
}

function StatusCard({ title, body, action }) {
  return (
    <div style={cardStyle}>
      <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>{title}</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>{body}</p>
      {action}
    </div>
  );
}

function ActiveDashboard({ profile, activeSection, navigate, fetchProfile }) {
  if (!profile) return null;
  return (
    <div>
      <div className="ib-subtabs">
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => navigate(`/app/ib${t.key === 'overview' ? '' : '/' + t.key}`)}
            className={`ib-subtab ${activeSection === t.key ? 'ib-subtab-active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeSection === 'overview' && <Overview ib={profile} onChanged={fetchProfile} />}
      {activeSection === 'coupon' && <CouponPanel ib={profile} onChanged={fetchProfile} />}
      {activeSection === 'redemptions' && <Redemptions ib={profile} />}
      {activeSection === 'withdraw' && <Withdraw ib={profile} onChanged={fetchProfile} />}
    </div>
  );
}

function IBPage() {
  const { user } = useOutletContext();
  const { section } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [profileStatus, setProfileStatus] = useState('loading'); // loading | none | pending | active | rejected | suspended
  const [error, setError] = useState(null);

  const activeSection = section || 'overview';

  const fetchProfile = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/ib/profile`, { headers: getAuthHeaders() });
      if (res.status === 404) {
        setProfile(null);
        setProfileStatus('none');
        return;
      }
      const data = await res.json();
      if (data.success && data.data) {
        setProfile(data.data);
        setProfileStatus(data.data.status || 'pending');
      } else {
        setProfileStatus('none');
      }
    } catch (e) {
      setError(e.message);
      setProfileStatus('none');
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  if (profileStatus === 'loading') {
    return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading IB profile…</div>;
  }

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      <style>{`
        .ib-page-wrap { padding: 20px 28px 60px; width: 100%; }
        .ib-subtabs {
          display: flex; gap: 8px; margin-bottom: 18px;
          overflow-x: auto; -webkit-overflow-scrolling: touch;
          padding-bottom: 4px;
          scrollbar-width: none;
        }
        .ib-subtabs::-webkit-scrollbar { display: none; }
        .ib-subtab {
          padding: 8px 16px; border-radius: 8px;
          border: 1px solid var(--border-color);
          background: var(--bg-secondary); color: var(--text-primary);
          cursor: pointer; font-size: 13px; font-weight: 600;
          white-space: nowrap; flex-shrink: 0;
        }
        .ib-subtab-active { background: var(--text-primary); color: var(--bg-primary); }
        .ib-stat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .ib-stat-grid-3 { grid-template-columns: repeat(3, 1fr); }
        .ib-stat-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 14px;
        }
        .ib-stat-label {
          font-size: 10px; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .ib-stat-value { font-size: 18px; font-weight: 800; margin-top: 4px; word-break: break-word; }
        @media (max-width: 700px) {
          .ib-page-wrap { padding: 14px 14px 80px; }
          .ib-stat-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .ib-stat-grid-3 { grid-template-columns: repeat(3, 1fr); gap: 8px; }
          .ib-stat-card { padding: 10px 12px; border-radius: 10px; }
          .ib-stat-label { font-size: 9px; }
          .ib-stat-value { font-size: 14px; }
          .ib-subtab { padding: 7px 12px; font-size: 12px; }
        }
        @media (max-width: 380px) {
          .ib-stat-grid-3 { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
      <div className="ib-page-wrap">
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
          Home / <span style={{ color: 'var(--text-primary)' }}>IB Program</span>
        </div>
        <h1 style={{ color: 'var(--text-primary)', margin: '0 0 18px' }}>🤝 IB Program</h1>

        {profileStatus === 'none' && (
          <ApplyForm user={user} onApplied={fetchProfile} onError={setError} error={error} />
        )}
        {profileStatus === 'pending' && (
          <StatusCard
            title="Application Under Review"
            body={`Submitted on ${profile?.appliedAt ? new Date(profile.appliedAt).toLocaleString() : '—'}. You'll be notified once admin approves and issues your coupon.`}
          />
        )}
        {profileStatus === 'rejected' && (
          <StatusCard
            title="Application Rejected"
            body={profile?.rejectedReason || 'Your previous application was rejected. You can re-apply with updated details.'}
            action={<ApplyForm user={user} onApplied={fetchProfile} onError={setError} error={error} />}
          />
        )}
        {profileStatus === 'suspended' && (
          <StatusCard
            title="IB Account Suspended"
            body={profile?.adminNotes || 'Your IB account has been suspended.'}
            action={
              <>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 16, marginBottom: 12 }}>
                  You can re-apply below — admin will review your new application and decide whether to reinstate your IB status.
                </p>
                <ApplyForm user={user} onApplied={fetchProfile} onError={setError} error={error} />
              </>
            }
          />
        )}
        {profileStatus === 'active' && (
          <ActiveDashboard
            profile={profile}
            activeSection={activeSection}
            navigate={navigate}
            fetchProfile={fetchProfile}
          />
        )}
      </div>
    </div>
  );
}

// ============ Sub-panels ============

/**
 * Always-available "Apply for a new coupon" form. The IB can have many
 * active coupons at once; each request creates a new pending_issue row
 * for admin to set terms on.
 */
function ApplyCouponBlock({ onChanged, hasPending }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/ib/coupon/request`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ note })
      });
      const data = await res.json();
      if (data.success) {
        setNote('');
        onChanged?.();
      } else {
        setError(data.error || 'Failed');
      }
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div style={{
      background: 'rgba(59,130,246,0.06)',
      border: '1px solid rgba(59,130,246,0.25)',
      borderRadius: 12,
      padding: 18
    }}>
      <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Apply for a New Coupon</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0, marginBottom: 12 }}>
        Request as many coupons as you need — you can have multiple active codes at the same time (e.g. one with 20% off and another with 10% off). Admin sets the discount %, validity, usage cap and your commission % when approving.
      </p>
      {hasPending && (
        <div style={{
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 8, padding: 10, fontSize: 12, color: '#f59e0b', marginBottom: 12
        }}>
          ⏳ You already have one request awaiting admin approval. Submit another after that one is processed.
        </div>
      )}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="(Optional) Note for admin — e.g. expected volume, target campaign"
        style={{ ...inp, minHeight: 60, marginBottom: 10 }}
      />
      {error && <div style={errBox}>{error}</div>}
      <button onClick={submit} disabled={busy || hasPending} style={primaryBtn}>
        {busy ? 'Submitting…' : 'Apply for New Coupon'}
      </button>
    </div>
  );
}

/**
 * Single coupon row card — shown in the list view of My Coupon tab.
 */
function CouponCard({ coupon }) {
  const days = daysUntil(coupon.validUntil);
  const limitHit = coupon.maxRedemptions > 0 && (coupon.redemptionCount || 0) >= coupon.maxRedemptions;
  const expiredByDate = coupon.validUntil && new Date(coupon.validUntil) < new Date();
  const effectivelyExpired = coupon.status === 'expired' || coupon.status === 'admin_revoked' || limitHit || expiredByDate;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!coupon.code) return;
    navigator.clipboard?.writeText(coupon.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const statusColor =
    coupon.status === 'active' && !effectivelyExpired ? '#10b981' :
    coupon.status === 'pending_issue' ? '#f59e0b' :
    '#ef4444';
  const statusLabel =
    coupon.status === 'pending_issue' ? 'Awaiting admin approval' :
    coupon.status === 'admin_revoked' ? 'Revoked by admin' :
    effectivelyExpired ? (limitHit ? 'Limit reached' : 'Expired') :
    'Active';

  return (
    <div style={{ ...cardStyle, padding: 18, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <code style={{ fontSize: 20, fontWeight: 800, padding: '6px 14px', background: 'var(--bg-tertiary, var(--bg-primary))', borderRadius: 8 }}>
          {coupon.code}
        </code>
        <button onClick={copy} style={ghostBtn}>{copied ? 'Copied!' : 'Copy'}</button>
        <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>● {statusLabel}</span>
      </div>
      {coupon.status === 'pending_issue' ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '6px 0 0' }}>
          Admin will set the discount %, validity, usage cap and your commission %.
        </p>
      ) : (
        <div className="ib-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          <Stat label="Buyer Discount" value={`${coupon.discountPercent}%`} />
          <Stat label="Your Commission" value={`${coupon.challengePurchaseCommissionPercent}%`} />
          <Stat
            label={effectivelyExpired ? 'Expired' : 'Days Left'}
            value={effectivelyExpired ? '—' : `${days}`}
            color={effectivelyExpired ? '#ef4444' : undefined}
          />
          <Stat label="Usage" value={`${coupon.redemptionCount || 0} / ${coupon.maxRedemptions > 0 ? coupon.maxRedemptions : '∞'}`} />
          <Stat label="You Earned" value={fmtInr(coupon.totalCommissionEarned)} color="#10b981" />
        </div>
      )}
    </div>
  );
}

function useCouponsList(refreshKey) {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/ib/coupons`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!cancelled && data.success) setCoupons(data.data.rows || []);
      } catch (e) { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);
  return { coupons, loading };
}

function Overview({ ib, onChanged }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { coupons, loading } = useCouponsList(refreshKey);
  const refresh = () => { setRefreshKey(k => k + 1); onChanged?.(); };

  const isEffectivelyActive = (c) => c.status === 'active'
    && (!c.validUntil || new Date(c.validUntil) >= new Date())
    && !(c.maxRedemptions > 0 && (c.redemptionCount || 0) >= c.maxRedemptions);

  const activeCoupons = coupons.filter(isEffectivelyActive);
  const inactiveCoupons = coupons.filter(c =>
    c.status !== 'pending_issue' && !isEffectivelyActive(c)
  );
  const pendingCoupons = coupons.filter(c => c.status === 'pending_issue');
  const totalRedemptions = coupons.reduce((s, c) => s + (c.redemptionCount || 0), 0);

  const cards = [
    { label: 'Total Earned', value: fmtInr(ib.wallet?.totalEarned), color: '#10b981' },
    { label: 'Available Balance', value: fmtInr(ib.wallet?.balance), color: 'var(--accent-primary)' },
    { label: 'Active Coupons', value: activeCoupons.length, color: '#8b5cf6' },
    { label: 'Total Redemptions', value: totalRedemptions, color: '#f59e0b' }
  ];

  return (
    <div>
      <div className="ib-stat-grid" style={{ marginBottom: 20 }}>
        {cards.map(c => (
          <div key={c.label} className="ib-stat-card">
            <div className="ib-stat-label">{c.label}</div>
            <div className="ib-stat-value" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>Your Coupons</h3>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : (activeCoupons.length === 0 && inactiveCoupons.length === 0) ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            You don't have any coupons yet. Apply for one below — admin will review and issue with the discount %, validity, usage cap and your commission %.
          </p>
        ) : (
          <>
            {activeCoupons.map(c => <CouponCard key={c._id} coupon={c} />)}
            {inactiveCoupons.map(c => <CouponCard key={c._id} coupon={c} />)}
          </>
        )}
        {pendingCoupons.length > 0 && (
          <div style={{
            marginTop: 12, fontSize: 12, color: '#f59e0b',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 8, padding: 10
          }}>
            ⏳ {pendingCoupons.length} request(s) awaiting admin approval.
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <ApplyCouponBlock onChanged={refresh} hasPending={pendingCoupons.length > 0} />
      </div>
    </div>
  );
}

function CouponPanel({ ib, onChanged }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { coupons, loading } = useCouponsList(refreshKey);
  const refresh = () => { setRefreshKey(k => k + 1); onChanged?.(); };

  const pendingCount = coupons.filter(c => c.status === 'pending_issue').length;
  const grouped = {
    active: coupons.filter(c => c.status === 'active'
      && (!c.validUntil || new Date(c.validUntil) >= new Date())
      && !(c.maxRedemptions > 0 && (c.redemptionCount || 0) >= c.maxRedemptions)),
    pending: coupons.filter(c => c.status === 'pending_issue'),
    inactive: coupons.filter(c => {
      if (c.status === 'pending_issue') return false;
      if (c.status === 'admin_revoked' || c.status === 'expired') return true;
      if (c.validUntil && new Date(c.validUntil) < new Date()) return true;
      if (c.maxRedemptions > 0 && (c.redemptionCount || 0) >= c.maxRedemptions) return true;
      return false;
    })
  };

  return (
    <div>
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading coupons…</p>
      ) : (
        <>
          {grouped.active.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>Active ({grouped.active.length})</h3>
              {grouped.active.map(c => <CouponCard key={c._id} coupon={c} />)}
            </div>
          )}
          {grouped.pending.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>Awaiting Admin Approval ({grouped.pending.length})</h3>
              {grouped.pending.map(c => <CouponCard key={c._id} coupon={c} />)}
            </div>
          )}
          {grouped.inactive.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>Past Coupons ({grouped.inactive.length})</h3>
              {grouped.inactive.map(c => <CouponCard key={c._id} coupon={c} />)}
            </div>
          )}
          {coupons.length === 0 && (
            <div style={cardStyle}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                You haven't been issued any coupons yet. Submit a request below.
              </p>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <ApplyCouponBlock onChanged={refresh} hasPending={pendingCount > 0} />
      </div>
    </div>
  );
}

function Redemptions({ ib }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/ib/coupon-redemptions`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!cancelled && data.success) {
          setRows(data.data.rows || []);
          setSummary(data.data.summary || {});
        }
      } catch (e) { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div className="ib-stat-grid" style={{ marginBottom: 16 }}>
        <Stat label="Redemptions" value={summary.count || 0} />
        <Stat label="You Earned" value={fmtInr(summary.totalCommission)} color="#10b981" />
        <Stat label="Discount Given" value={fmtInr(summary.totalDiscount)} color="#f59e0b" />
        <Stat label="Buyers' Spend (Net)" value={fmtInr(summary.totalNet)} />
      </div>
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>Coupon Redemptions</h3>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No one has used your coupon yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tblStyle}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Buyer</th>
                  <th style={th}>Challenge</th>
                  <th style={th}>Original</th>
                  <th style={th}>Discount</th>
                  <th style={th}>Final</th>
                  <th style={th}>Your Commission</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r._id}>
                    <td style={td}>{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td style={td}>
                      <strong>{r.userId?.name || '—'}</strong><br />
                      <small>{r.userId?.oderId}</small>
                    </td>
                    <td style={td}>{r.challengeId?.name || '—'}</td>
                    <td style={td}>{fmtInr(r.couponSnapshot?.originalFee)}</td>
                    <td style={{ ...td, color: '#f59e0b' }}>−{fmtInr(r.couponSnapshot?.discountAmount)}</td>
                    <td style={td}>{fmtInr(r.couponSnapshot?.finalFee)}</td>
                    <td style={{ ...td, color: '#10b981', fontWeight: 700 }}>{fmtInr(r.couponSnapshot?.ibCommissionAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Withdraw({ ib, onChanged }) {
  const [form, setForm] = useState({
    amount: '',
    upiId: '',
    holderName: ib?.userId?.name || '',
    note: ''
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const available = Math.max(0, Number(ib.wallet?.balance || 0) - Number(ib.wallet?.pendingWithdrawal || 0));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/ib/withdraw`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amount: Number(form.amount),
          upiId: form.upiId.trim(),
          holderName: form.holderName.trim(),
          note: form.note.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'ok', text: 'Withdrawal request submitted. Admin will review and process to your UPI ID.' });
        setForm({ ...form, amount: '', note: '' });
        onChanged();
      } else {
        setMsg({ type: 'err', text: data.error || 'Failed' });
      }
    } catch (err) { setMsg({ type: 'err', text: err.message }); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} style={cardStyle}>
      <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Withdraw IB Earnings</h3>
      <div className="ib-stat-grid ib-stat-grid-3" style={{ marginBottom: 14 }}>
        <Stat label="Available" value={fmtInr(available)} color="#10b981" />
        <Stat label="Pending" value={fmtInr(ib.wallet?.pendingWithdrawal)} color="#f59e0b" />
        <Stat label="Total Withdrawn" value={fmtInr(ib.wallet?.totalWithdrawn)} />
      </div>
      <div style={fieldRow}>
        <label style={lbl}>Amount (₹)</label>
        <input
          style={inp} type="number" min="1" step="1"
          max={available || undefined}
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          required
        />
      </div>
      <div style={fieldRow}>
        <label style={lbl}>UPI ID</label>
        <input
          style={inp} type="text"
          value={form.upiId}
          onChange={(e) => setForm({ ...form, upiId: e.target.value })}
          placeholder="yourname@upi"
          required
        />
      </div>
      <div style={fieldRow}>
        <label style={lbl}>Account Holder Name</label>
        <input
          style={inp} type="text"
          value={form.holderName}
          onChange={(e) => setForm({ ...form, holderName: e.target.value })}
          placeholder="As per UPI account"
        />
      </div>
      <div style={fieldRow}>
        <label style={lbl}>Note (optional)</label>
        <textarea
          style={{ ...inp, minHeight: 60 }}
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
      </div>
      {msg && (
        <div style={msg.type === 'err' ? errBox : { ...errBox, background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.3)', color: '#10b981' }}>
          {msg.text}
        </div>
      )}
      <button type="submit" disabled={busy || !available} style={primaryBtn}>
        {busy ? 'Submitting…' : 'Request Withdrawal'}
      </button>
    </form>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="ib-stat-card">
      <div className="ib-stat-label">{label}</div>
      <div className="ib-stat-value" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

// ============ Styles ============

const cardStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 14,
  padding: 22,
  marginBottom: 16
};
/* The IB form used to stretch the full page width — ~1850px inputs on a
   desktop, which is why it read as unfinished rather than as a form. */
const formShell = { maxWidth: 660, marginInline: 'auto', width: '100%' };
const pitchHead = {
  padding: '20px 22px',
  background: 'var(--gold-grad)',
  color: '#fff',
};
const pitchGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 12,
};
const pitchCell = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-color)',
  borderRadius: 10,
  padding: '12px 13px',
};
const codeChip = {
  background: 'rgba(0,51,102,.10)', color: 'var(--accent-primary)',
  padding: '1px 6px', borderRadius: 5, fontWeight: 700, fontSize: 11.5,
};
const twoCol = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
  gap: '0 14px',
};
const fieldRow = { marginBottom: 14 };
const lbl = { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 };
const inp = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-primary)', color: 'var(--text-primary)',
  fontSize: 14
};
const primaryBtn = {
  padding: '12px 20px', borderRadius: 10, border: 'none',
  background: 'var(--gold)', color: 'var(--on-gold)', fontWeight: 700, fontSize: 14,
  cursor: 'pointer'
};
const ghostBtn = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-color)',
  background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600
};
const errBox = {
  padding: '10px 12px', borderRadius: 8,
  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
  color: '#ef4444', fontSize: 13, marginBottom: 12
};
const tblStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th = { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 };
const td = { padding: '10px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' };

export default IBPage;
