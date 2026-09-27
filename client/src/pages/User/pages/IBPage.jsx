import { useEffect, useState, useCallback, Fragment } from 'react';
import {
  LuPercent, LuIndianRupee, LuUsers, LuShieldCheck, LuArrowRight, LuGift,
  LuShare2, LuFileText, LuLink, LuUser, LuPhone, LuMail, LuSend, LuAward,
  LuTicket, LuChartLine, LuBanknote, LuHandshake,
} from 'react-icons/lu';
import './ReferralPartner.css';
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

// The banner art: a gift box with two coupon tickets, drawn rather than
// exported, so it stays sharp at any DPI and re-flows on a phone instead of
// being letterboxed. Desktop and mobile size and reorder it differently.
function HeroArt() {
  return (
    <svg viewBox="0 0 340 250" fill="none" role="presentation">
      <defs>
        <linearGradient id="rpBox" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5AA9FF" /><stop offset="1" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id="rpLid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7FC0FF" /><stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="rpTicket" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD770" /><stop offset="1" stopColor="#F2A93B" />
        </linearGradient>
      </defs>

      <path d="M120 44c-16-16-40-14-40 4 0 14 22 20 46 18" stroke="#8FD0FF" strokeWidth="7" strokeLinecap="round" />
      <path d="M186 44c16-16 40-14 40 4 0 14-22 20-46 18" stroke="#8FD0FF" strokeWidth="7" strokeLinecap="round" />

      <rect x="86" y="92" width="134" height="104" rx="10" fill="url(#rpBox)" />
      <rect x="76" y="66" width="154" height="34" rx="9" fill="url(#rpLid)" />
      <rect x="142" y="66" width="22" height="130" fill="#93C5FD" fillOpacity="0.85" />

      <g transform="rotate(-8 214 150)">
        <rect x="170" y="126" width="112" height="56" rx="9" fill="url(#rpTicket)" />
        <circle cx="170" cy="154" r="8" fill="#12409A" />
        <circle cx="282" cy="154" r="8" fill="#12409A" />
        <path d="M226 132v44" stroke="#C8862A" strokeWidth="2.5" strokeDasharray="5 5" />
        <text x="198" y="150" textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize="13" fontWeight="800" fill="#7A4B10">COUPON</text>
        <text x="198" y="166" textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize="13" fontWeight="800" fill="#7A4B10">CODE</text>
        <circle cx="254" cy="154" r="17" fill="#fff" fillOpacity="0.55" />
        <text x="254" y="161" textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize="20" fontWeight="800" fill="#7A4B10">%</text>
      </g>

      <circle cx="74" cy="196" r="15" fill="#F5B93D" />
      <circle cx="74" cy="196" r="10" fill="#FFD879" />
      <circle cx="98" cy="208" r="12" fill="#F5B93D" />
      <circle cx="98" cy="208" r="8" fill="#FFD879" />

      <path d="M252 96l34-34M286 62h-15M286 62v15" stroke="#7FE3B0" strokeWidth="5" strokeLinecap="round" />
      <path d="M56 78l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#BFE4FF" />
      <path d="M298 128l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#BFE4FF" />
      <path d="M240 34l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#FFE59B" />
      <circle cx="46" cy="140" r="4" fill="#8FD0FF" />
      <circle cx="312" cy="196" r="5" fill="#8FD0FF" />
    </svg>
  );
}

function BenefitsArt() {
  return (
    <svg className="rp-benefits-bg" width="150" height="104" viewBox="0 0 150 104" fill="none" role="presentation">
      <rect x="6" y="62" width="18" height="42" rx="4" fill="#2563EB" />
      <rect x="34" y="44" width="18" height="60" rx="4" fill="#2563EB" />
      <rect x="62" y="26" width="18" height="78" rx="4" fill="#2563EB" />
      <rect x="90" y="52" width="18" height="52" rx="4" fill="#60A5FA" />
      <rect x="118" y="14" width="18" height="90" rx="4" fill="#2563EB" />
    </svg>
  );
}

const RP_HERO_POINTS = [
  [LuPercent, '#F4EDFE', '#7C3AED', 'Buyers Get Discount', 'Using your coupon code'],
  [LuIndianRupee, '#E9F9F1', '#059669', 'You Earn Commission', 'On every successful purchase'],
  [LuUsers, '#EEF4FF', '#2563EB', 'Track Everything', 'Real-time analytics'],
  [LuShieldCheck, '#FFF7E8', '#D97706', 'Reliable & Secure', 'Timely payouts'],
];

const RP_STEPS = [
  [LuFileText, '#EAF2FE', '#2563EB', 'Apply as a Partner', 'Submit a simple application. It takes only 1 minute.'],
  [LuGift, '#F4EDFE', '#7C3AED', 'Get Your Coupon Code', 'After approval, you will receive your unique coupon code.'],
  [LuShare2, '#E9F9F1', '#059669', 'Share & Earn', 'Share the code with your audience and earn commission on every sale.'],
];

const RP_BENEFITS = [
  [LuBanknote, '#FFF7E8', '#D97706', 'Attractive Commission', 'Earn on every successful purchase'],
  [LuTicket, '#FFF3E0', '#EA7C1B', 'Your Own Coupon Code', 'Give discount to your audience'],
  [LuChartLine, '#F4EDFE', '#7C3AED', 'Real-time Tracking', 'Track clicks, sales and earnings'],
  [LuShieldCheck, '#EAF2FE', '#2563EB', 'Reliable Payouts', 'Timely and secure payments'],
];

function ApplyForm({ user, onApplied, onError, error }) {
  // Name, phone and email are prefilled from the account but stay editable —
  // a partner often wants payouts and updates on a different contact than the
  // one they trade with. The server stores whatever is submitted here.
  const [form, setForm] = useState({
    fullName: user?.name || '',
    mobile: user?.phone || '',
    contactEmail: user?.email || '',
    website: '',
  });
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    onError?.(null);
    try {
      const res = await fetch(`${API_URL}/api/ib/apply`, {
        method: 'POST',
        headers: getAuthHeaders(),
        // businessName is what the admin list has always keyed on, so it is
        // sent alongside rather than left blank for existing rows.
        body: JSON.stringify({ ...form, businessName: form.fullName }),
      });
      const data = await res.json();
      if (data.success) await onApplied?.();
      else onError?.(data.error || 'Application failed');
    } catch (err) { onError?.(err.message); }
    setBusy(false);
  };

  const scrollToForm = () => {
    document.getElementById('rp-apply')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('rp-name')?.focus({ preventScroll: true });
  };

  return (
    <>
      <div className="rp-hero">
        <div className="rp-hero-copy">
          <div className="rp-eyebrow">Referral Partner Program</div>
          <h1>Earn on Every <span>Referral</span></h1>
          <p>
            Share your unique coupon code. When someone buys a challenge using
            your code, they get a discount and you earn a commission.
          </p>
          <button type="button" className="rp-hero-cta" onClick={scrollToForm}>
            <LuHandshake size={16} /> Apply Now <LuArrowRight size={15} />
          </button>
          <div className="rp-hero-note">Takes 1 minute &bull; Reviewed by admin</div>
        </div>

        <div className="rp-hero-art"><HeroArt /></div>

        <div className="rp-hero-panel">
          {RP_HERO_POINTS.map(([Icon, bg, fg, t, sub]) => (
            <div key={t} className="rp-hero-item">
              <span className="rp-chip rp-hero-item-chip" style={{ background: bg, color: fg }}>
                <Icon size={15} />
              </span>
              <div>
                <div className="rp-hero-item-t">{t}</div>
                <div className="rp-hero-item-s">{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rp-card rp-how">
        <div className="rp-how-t">How It Works?</div>
        <div className="rp-how-s">Become a partner and start earning in 3 simple steps</div>
        <div className="rp-how-steps">
          {RP_STEPS.map(([Icon, bg, fg, t, sub], i) => (
            <Fragment key={t}>
              {i > 0 && <span className="rp-how-arrow"><LuArrowRight size={18} /></span>}
              <div className="rp-how-step">
                <span className="rp-how-n" style={{ background: bg, color: fg }}>{i + 1}</span>
                <span className="rp-chip rp-how-chip" style={{ background: bg, color: fg }}>
                  <Icon size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="rp-how-step-t">{t}</div>
                  <div className="rp-how-step-s">{sub}</div>
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      <div className="rp-row">
        <form id="rp-apply" className="rp-card rp-form-card" onSubmit={submit}>
          <div className="rp-form-head">
            <span className="rp-chip rp-form-chip"><LuLink size={17} /></span>
            <div>
              <div className="rp-form-t">Apply to Become a Referral Partner</div>
              <div className="rp-form-s">Fill in the details below. Our team will review and approve your application.</div>
            </div>
          </div>

          <div className="rp-grid">
            <div className="rp-field">
              <label htmlFor="rp-name">Full Name <i>*</i></label>
              <div className="rp-input">
                <LuUser size={15} />
                <input id="rp-name" value={form.fullName} onChange={set('fullName')} placeholder="Enter your full name" required />
              </div>
            </div>
            <div className="rp-field">
              <label htmlFor="rp-mobile">Mobile Number <i>*</i></label>
              <div className="rp-input">
                <LuPhone size={15} />
                <input id="rp-mobile" value={form.mobile} onChange={set('mobile')} placeholder="Enter your mobile number" inputMode="tel" required />
              </div>
            </div>
            <div className="rp-field">
              <label htmlFor="rp-email">Email Address <i>*</i></label>
              <div className="rp-input">
                <LuMail size={15} />
                <input id="rp-email" type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="Enter your email address" required />
              </div>
            </div>
            <div className="rp-field">
              <label htmlFor="rp-social">Social Media / Channel Link (Optional)</label>
              <div className="rp-input">
                <LuLink size={15} />
                <input id="rp-social" value={form.website} onChange={set('website')} placeholder="YouTube / Instagram / Telegram link" />
              </div>
            </div>
          </div>

          {error && <div className="rp-err">{error}</div>}

          <button type="submit" className="rp-submit" disabled={busy}>
            <LuSend size={15} /> {busy ? 'Submitting…' : 'Submit Application'} {!busy && <LuArrowRight size={15} />}
          </button>

          <div className="rp-foot">
            Our team will review your application and approve it shortly.<br />
            You will receive your coupon code after approval.
          </div>
        </form>

        <div className="rp-card rp-benefits">
          <BenefitsArt />
          <div className="rp-benefits-head">
            <span className="rp-chip rp-benefits-chip"><LuAward size={17} /></span>
            <div className="rp-benefits-t">Partner Benefits</div>
          </div>
          {RP_BENEFITS.map(([Icon, bg, fg, t, sub]) => (
            <div key={t} className="rp-benefit">
              <span className="rp-chip rp-benefit-chip" style={{ background: bg, color: fg }}>
                <Icon size={16} />
              </span>
              <div>
                <div className="rp-benefit-t">{t}</div>
                <div className="rp-benefit-s">{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
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
    return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading referral partner profile…</div>;
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
          Home / <span style={{ color: 'var(--text-primary)' }}>Referral Partner</span>
        </div>
        <h1 style={{ color: 'var(--text-primary)', margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <LuHandshake size={22} /> Referral Partner
        </h1>

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
            title="Referral account suspended"
            body={profile?.adminNotes || 'Your referral partner account has been suspended.'}
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
      <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Withdraw referral earnings</h3>
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
