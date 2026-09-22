import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Promo shown on the offer strip; PricingPage re-exports these for its coupon box.
export const PROMO_CODE = 'WELCOME10';
export const PROMO_DISCOUNT = 0.10;

const STEP_TO_TAB = { 0: 'Instant', 1: '1-Step', 2: '2-Step' };
const TAB_ORDER = ['2-Step', '1-Step', 'Instant'];

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const pct = (percent, base) => ((Number(percent) || 0) * (Number(base) || 0)) / 100;

/** ₹200000 → "₹2L", ₹5000000 → "₹50L", ₹1200000 → "₹12L" */
function shortFund(n) {
  const v = Number(n) || 0;
  if (v >= 10000000) return `₹${+(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${+(v / 100000).toFixed(v % 100000 ? 2 : 0)}L`;
  return inr(v);
}

const Info = ({ tip }) => <span className="pf-info" data-tip={tip}>i</span>;

/** One table row: a label + one cell per tier. `render` gets the tier. */
function Row({ label, tip, sub, tiers, render }) {
  return (
    <tr>
      <th scope="row">
        <span className="inline-flex items-center">
          {label}
          {tip && <Info tip={tip} />}
        </span>
        {sub && <span className="pf-table-sub">{sub}</span>}
      </th>
      {tiers.map((t, i) => <td key={i}>{render(t)}</td>)}
    </tr>
  );
}

const HIGHLIGHTS = [
  'Real-time risk monitoring',
  'Objective tracking dashboard',
  'Trade journaling and analytics',
  'Payouts in INR to your bank',
];

export default function PricingTable({
  showHeading = true,
  onTabChange = null,
  className = 'pf-section',
}) {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(null);
  // Which account size the phone view is showing. A 6-column table can't work
  // on a 390px screen, so mobile picks one tier and shows it as a card.
  const [tierIdx, setTierIdx] = useState(0);

  useEffect(() => {
    fetch(`${API_URL}/api/prop/challenges`)
      .then((r) => r.json())
      .then((d) => { if (d.success && Array.isArray(d.challenges)) setChallenges(d.challenges); })
      .catch(() => { /* offline → empty state below */ })
      .finally(() => setLoading(false));
  }, []);

  // Plans keyed by tab name, built straight off the admin's published challenges.
  const plans = useMemo(() => {
    const out = {};
    for (const c of challenges) {
      const name = STEP_TO_TAB[c.stepsCount];
      if (!name) continue;
      const raw = c.tiers?.length ? c.tiers : [{ fundSize: c.fundSize, challengeFee: c.challengeFee }];
      out[name] = {
        steps: c.stepsCount,
        rules: c.rules || {},
        funded: c.fundedSettings || {},
        tiers: raw
          .map((t) => ({
            fundSize: Number(t.fundSize) || 0,
            fee: Number(t.challengeFee) || 0,
            popular: !!t.isPopular,
          }))
          .sort((a, b) => a.fundSize - b.fundSize),
      };
    }
    return out;
  }, [challenges]);

  const available = TAB_ORDER.filter((t) => plans[t]);
  const active = tab && plans[tab] ? tab : available[0];
  const plan = plans[active];

  useEffect(() => { if (active) onTabChange?.(active); }, [active, onTabChange]);

  const select = (t) => { setTab(t); onTabChange?.(t); };

  if (loading) {
    return (
      <section className={className}>
        <div className="pf-wrap text-center pf-body py-16">Loading assessments…</div>
      </section>
    );
  }

  if (!plan) {
    return (
      <section className={className}>
        <div className="pf-wrap text-center py-16">
          <p className="pf-body mb-5">Assessments are being updated. Please check back shortly.</p>
          <Link to="/contact-us" className="pf-btn pf-btn--ghost">Contact us</Link>
        </div>
      </section>
    );
  }

  const r = plan.rules, f = plan.funded, tiers = plan.tiers;
  const target1 = plan.steps === 0 ? r.profitTargetInstantPercent : r.profitTargetPhase1Percent;
  const windowDays = r.challengeExpiryDays;
  const days = r.tradingDaysRequired;

  // Single source for every rule row. The desktop table and the mobile card
  // both render from this, so the two can never drift apart.
  const specs = [
    target1 != null && {
      label: plan.steps === 2 ? 'Phase 1 Performance Target' : 'Performance Target',
      tip: 'Profit you must reach to clear this phase, measured on the starting balance.',
      render: (t) => (<>{target1}%<span className="pf-table-sub">({inr(pct(target1, t.fundSize))})</span></>),
    },
    plan.steps === 2 && r.profitTargetPhase2Percent != null && {
      label: 'Phase 2 Performance Target',
      tip: 'Phase 2 restarts at the original balance with an easier target.',
      render: (t) => (<>{r.profitTargetPhase2Percent}%<span className="pf-table-sub">({inr(pct(r.profitTargetPhase2Percent, t.fundSize))})</span></>),
    },
    {
      label: 'Maximum Loss Limit',
      tip: 'Total loss allowed from the starting balance across the whole assessment.',
      render: (t) => (<>{r.maxOverallDrawdownPercent}%<span className="pf-table-sub">({inr(pct(r.maxOverallDrawdownPercent, t.fundSize))})</span></>),
    },
    {
      label: 'Daily Loss Limit',
      tip: "Loss allowed in a single day, measured from that day's opening balance.",
      render: (t) => (<>{r.maxDailyDrawdownPercent}%<span className="pf-table-sub">({inr(pct(r.maxDailyDrawdownPercent, t.fundSize))})</span></>),
    },
    r.maxOneDayProfitPercentOfTarget != null && {
      label: 'Max One-Day Profit',
      tip: "Caps how much of a single day's profit counts toward the target, so progress has to be spread across days.",
      render: (t) => (
        <>
          {r.maxOneDayProfitPercentOfTarget}% of target
          {target1 != null && (
            <span className="pf-table-sub">({inr(pct(r.maxOneDayProfitPercentOfTarget, pct(target1, t.fundSize)))})</span>
          )}
        </>
      ),
    },
    { label: 'Assessment Window', tip: 'Calendar days available to complete the assessment.', render: () => (windowDays ? `${windowDays} Days` : 'Unlimited') },
    { label: 'Min Active Days', tip: 'Distinct days on which you must place at least one trade.', render: () => (days ? `${days} Days` : 'None') },
    { label: 'Performance Share', tip: 'Your cut of the profit on a funded Pro Account.', render: () => `Up to ${f.profitSplitPercent || 95}%` },
    { label: 'Payout Cycle', sub: 'Requested from your dashboard', tip: 'How often you can request a payout once funded.', render: () => `Every ${f.withdrawalFrequencyDays || 14} days` },
  ].filter(Boolean);

  const tier = tiers[Math.min(tierIdx, tiers.length - 1)] || tiers[0];

  return (
    <section id="assessments" className={className}>
      <div className="pf-wrap">
        {showHeading && (
          <div className="text-center max-w-2xl mx-auto mb-10">
            <p className="pf-eyebrow mb-4">Assessments</p>
            <h2 className="pf-h2 mb-5">Pick your account size</h2>
            <p className="pf-lead">One fee, no subscription. Every rule below is enforced by the platform, not by hand.</p>
          </div>
        )}

        {available.length > 1 && (
          <div className="flex justify-center mb-9">
            <div className="pf-seg" role="tablist">
              {available.map((t) => (
                <button key={t} role="tab" aria-selected={t === active} data-active={t === active} onClick={() => select(t)}>
                  {t === 'Instant' ? 'Instant' : (<>{t}<span className="pf-seg-long"> Assessment</span></>)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Phone: pick a size, read one card. ── */}
        <div className="pf-price-mobile">
          <div className="pf-size-row" role="tablist" aria-label="Account size">
            {tiers.map((t, i) => (
              <button
                key={t.fundSize}
                role="tab"
                aria-selected={i === tierIdx}
                data-active={i === tierIdx}
                onClick={() => setTierIdx(i)}
              >
                {shortFund(t.fundSize).replace('₹', '')}
              </button>
            ))}
          </div>

          <div className="pf-card pf-price-card">
            {tier?.popular && <span className="pf-price-flag">Most chosen</span>}

            <div className="pf-price-head">
              <div className="pf-price-size">{shortFund(tier.fundSize)}</div>
              <div className="pf-price-fee">{inr(tier.fee)}</div>
              <div className="pf-price-note">One-time fee · including GST</div>
            </div>

            <Link
              to={`/register?plan=${encodeURIComponent(active)}&tier=${tier.fundSize}`}
              className="pf-btn pf-btn--primary w-full"
            >
              Get Started
            </Link>

            <dl className="pf-price-specs">
              {specs.map((sp) => (
                <div key={sp.label}>
                  <dt>{sp.label}</dt>
                  <dd>{sp.render(tier)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="pf-card overflow-hidden pf-price-table-wrap">
          <div className="pf-scroll-x">
            <table className="pf-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ width: '30%' }}>Account Size</th>
                  {tiers.map((t, i) => (
                    <th scope="col" key={i}>
                      <div className="text-[1.6rem] font-extrabold tracking-[-.03em] mb-3.5" style={{ color: 'var(--pf-text)' }}>
                        {shortFund(t.fundSize)}
                      </div>
                      <Link
                        to={`/register?plan=${encodeURIComponent(active)}&tier=${t.fundSize}`}
                        className="pf-btn pf-btn--primary pf-btn--sm"
                      >
                        Get Started
                      </Link>
                      <div className="text-[1.15rem] font-extrabold mt-3.5" style={{ color: 'var(--pf-text)' }}>{inr(t.fee)}</div>
                      <span className="pf-table-sub">(including GST)</span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {specs.map((sp) => (
                  <Row key={sp.label} label={sp.label} tip={sp.tip} sub={sp.sub} tiers={tiers} render={sp.render} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 p-5" style={{ borderTop: '1px solid var(--pf-border)' }}>
            {HIGHLIGHTS.map((h) => (
              <div key={h} className="pf-inset flex items-center gap-3 px-4 py-3">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--pf-brand)' }} />
                <span className="text-[.88rem] font-medium" style={{ color: 'var(--pf-text)' }}>{h}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center mt-9">
          <p className="pf-body mb-4">Need help choosing?</p>
          <Link to="/contact-us" className="pf-btn pf-btn--ghost">Contact us for personalised guidance</Link>
        </div>
      </div>
    </section>
  );
}
