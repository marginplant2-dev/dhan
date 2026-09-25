import { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Building2, Gamepad2, LineChart, Mail, Play, ShieldCheck, TrendingUp, UserPlus, Users, Zap } from 'lucide-react';
import './DashboardHome.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authData.token || ''}`
  };
}

// The demo card used to start empty on every visit and only appear once
// /api/prop/demo answered — coming back to the dashboard from any other
// section, it popped in seconds late. The last good response is kept for the
// tab and painted immediately; the request still runs and replaces it.
const DEMO_CACHE_KEY = 'pf-demo-cache';
function readDemoCache() {
  try { return JSON.parse(sessionStorage.getItem(DEMO_CACHE_KEY) || 'null'); } catch { return null; }
}
function writeDemoCache(value) {
  try {
    if (value) sessionStorage.setItem(DEMO_CACHE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(DEMO_CACHE_KEY);
  } catch { /* storage blocked — the card just waits for the network */ }
}

const INR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const NUM = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The three indices this platform trades, with the tick symbols to try. */
const INDICES = [
  { label: 'NIFTY 50', symbols: ['NIFTY 50', 'NIFTY50', 'NIFTY'], tone: '#16C79A' },
  { label: 'SENSEX', symbols: ['SENSEX', 'BSE SENSEX'], tone: '#1268E8' },
  { label: 'BANKNIFTY', symbols: ['NIFTY BANK', 'BANKNIFTY'], tone: '#7A5AF8' },
];

/** The rising curve in the demo strip. Decorative: it illustrates a practice
    account, and drawing it beats shipping a screenshot of one. */
function DemoCurve() {
  const pts = [0, 6, 3, 11, 8, 16, 13, 22, 19, 28, 24, 34, 31, 42, 38, 48, 45, 57, 52, 64, 71];
  const d = pts
    .map((v, i) => `${(i / (pts.length - 1)) * 300} ${64 - (v / 71) * 52}`)
    .map((xy, i) => (i ? 'L' : 'M') + xy)
    .join(' ');
  return (
    <svg className="dh-demo-curve" viewBox="0 0 300 68" fill="none" aria-hidden>
      <path d={`${d} L300 68 L0 68 Z`} fill="#16C79A" opacity=".12" />
      <path d={d} stroke="#16C79A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A sparkline from whatever ticks we have seen this session — no history API. */
function Spark({ points, tone }) {
  if (!points || points.length < 2) return <svg className="dh-index-spark" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * 84} ${30 - ((p - min) / span) * 26}`)
    .map((xy, i) => (i ? 'L' : 'M') + xy)
    .join(' ');
  return (
    <svg className="dh-index-spark" viewBox="0 0 84 32" fill="none" aria-hidden>
      <path d={`${d} L84 32 L0 32 Z`} fill={tone} opacity=".10" />
      <path d={d} stroke={tone} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DashboardPage() {
  const { user, setActiveChallengeAccountId, getTickBySymbolAuto } = useOutletContext();
  const navigate = useNavigate();
  const [myAccounts, setMyAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [challenges, setChallenges] = useState([]);
  const [activeProgramme, setActiveProgramme] = useState(null);
  const [sparks, setSparks] = useState({});

  // Free practice account. Same endpoints the admin panel promises ("users can
  // spin up a demo from their home page"), surfaced where people actually land.
  const [demo, setDemo] = useState(() => readDemoCache()?.demo || null);
  const [demoSettings, setDemoSettings] = useState(() => readDemoCache()?.settings || null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoErr, setDemoErr] = useState('');

  const fetchDemo = async () => {
    try {
      const res = await fetch(`${API_URL}/api/prop/demo`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.demo) {
        setDemo(data.demo);
        setDemoSettings(data.settings || null);
        setDemoErr('');
        writeDemoCache({ demo: data.demo, settings: data.settings || null });
        return data.demo;
      }
      // Admin can switch demos off entirely — then the card simply never shows.
      if (!/disabled/i.test(data.message || '')) setDemoErr(data.message || '');
      setDemo(null);
      writeDemoCache(null);
    } catch {
      /* offline — leave the card hidden rather than showing a broken one */
    }
    return null;
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/prop/my-accounts`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) setMyAccounts(data.accounts || []);
    } catch (err) {
      console.error('Error loading accounts:', err);
    }
    setLoading(false);
  };

  const fetchChallenges = async () => {
    try {
      const res = await fetch(`${API_URL}/api/prop/challenges`);
      const data = await res.json();
      if (data.success) {
        const list = (data.challenges || []).filter((c) => c.isActive !== false);
        setChallenges(list);
        // 2-Step first if it is there: it is the cheapest way in.
        const preferred = list.find((c) => c.stepsCount === 2) || list[0];
        setActiveProgramme((cur) => cur || preferred?._id || null);
      }
    } catch (err) {
      console.error('Error loading challenges:', err);
    }
  };

  useEffect(() => { fetchDemo(); fetchAccounts(); fetchChallenges(); }, []);

  // Keep a short price history per index so the sparkline has something to draw.
  useEffect(() => {
    if (typeof getTickBySymbolAuto !== 'function') return;
    const sample = () => {
      setSparks((prev) => {
        const next = { ...prev };
        for (const idx of INDICES) {
          const tick = idx.symbols.map((s) => getTickBySymbolAuto(s)).find(Boolean);
          const px = Number(tick?.lastPrice ?? tick?.last_price ?? tick?.ltp);
          if (!Number.isFinite(px) || px <= 0) continue;
          next[idx.label] = [...(prev[idx.label] || []), px].slice(-24);
        }
        return next;
      });
    };
    sample();
    const id = setInterval(sample, 5000);
    return () => clearInterval(id);
  }, [getTickBySymbolAuto]);

  const openDemo = async () => {
    setDemoBusy(true);
    setDemoErr('');
    const d = demo || await fetchDemo();
    setDemoBusy(false);
    // Straight into the terminal with the demo selected — a practice account
    // has no phases or targets to show on a challenge dashboard first.
    if (d?._id) {
      setActiveChallengeAccountId?.(d._id);
      navigate('/app/market');
    }
  };

  const resetDemo = async () => {
    if (!confirm('Reset the demo balance? Open demo positions will be closed at their entry price.')) return;
    setDemoBusy(true);
    setDemoErr('');
    try {
      const res = await fetch(`${API_URL}/api/prop/demo/reset`, { method: 'POST', headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        setDemo(data.demo);
        writeDemoCache({ demo: data.demo, settings: demoSettings });
      } else setDemoErr(data.message || 'Reset failed');
    } catch (e) { setDemoErr(e.message); }
    setDemoBusy(false);
  };

  const liveAccounts = myAccounts.filter((a) => ['ACTIVE', 'FUNDED', 'PASSED'].includes(a.status));
  const programme = useMemo(
    () => challenges.find((c) => c._id === activeProgramme) || challenges[0] || null,
    [challenges, activeProgramme],
  );

  /** What this programme asks of you, in the three numbers that decide it. */
  const objectives = (c) => {
    const r = c?.rules || {};
    const target = c?.stepsCount === 0
      ? r.profitTargetInstantPercent
      : r.profitTargetPhase1Percent;
    return [
      { label: 'Profit target', value: target != null ? `${target}%` : '—' },
      { label: 'Daily loss', value: r.maxDailyDrawdownPercent != null ? `${r.maxDailyDrawdownPercent}%` : '—' },
      { label: 'Max loss', value: r.maxOverallDrawdownPercent != null ? `${r.maxOverallDrawdownPercent}%` : '—' },
    ];
  };

  const tierNote = (c, i) => {
    if (c?.stepsCount === 0) return 'Funded from day one, no evaluation';
    if (i === 0) return 'Start here and prove the process';
    if (i === 1) return 'More room, same rules';
    return 'For a strategy that has already scaled';
  };

  const statusTone = (s) => ({
    ACTIVE: { bg: 'rgba(42,91,199,.12)', fg: '#2A5BC7' },
    FUNDED: { bg: 'rgba(22,199,132,.14)', fg: '#0E9F6E' },
    PASSED: { bg: 'rgba(22,199,132,.14)', fg: '#0E9F6E' },
    FAILED: { bg: 'rgba(229,72,77,.12)', fg: '#E5484D' },
  }[s] || { bg: 'var(--bg-tertiary)', fg: 'var(--text-muted)' });

  const steps = [
    { Icon: UserPlus, title: 'Create Account', sub: 'Done', done: true },
    { Icon: Mail, title: 'Verify Email', sub: user?.emailVerified ? 'Done' : 'Check your inbox', done: !!user?.emailVerified },
    { Icon: Play, title: 'Start Trading', sub: liveAccounts.length ? 'In progress' : 'Buy a challenge', done: liveAccounts.length > 0 },
  ];

  return (
    <div className="dh-home">

      {/* ── Banner ─────────────────────────────────────────────────────── */}
      <section className="dh-banner">
        <div className="dh-wrap dh-banner-inner">
          <div>
            <div className="dh-banner-eyebrow">Indian markets · Opportunity · Virtual capital</div>
            <h1>Trade. Prove.<br />Get <em>Funded.</em></h1>
            <p>Show your skills, trade with discipline, and unlock virtual capital.</p>
            <div className="dh-banner-feats">
              <div className="dh-feat">
                <span className="dh-feat-icon" style={{ background: 'rgba(22,199,154,.24)' }}><LineChart size={16} /></span>
                <span><b>Real Market Conditions</b><span>NSE &amp; BSE prices</span></span>
              </div>
              <div className="dh-feat">
                <span className="dh-feat-icon" style={{ background: 'rgba(233,162,59,.26)' }}><Zap size={16} /></span>
                <span><b>Flexible Evaluation</b><span>1-Step &amp; 2-Step</span></span>
              </div>
              <div className="dh-feat">
                <span className="dh-feat-icon" style={{ background: 'rgba(18,104,232,.3)' }}><ShieldCheck size={16} /></span>
                <span><b>Transparent Rules</b><span>No hidden conditions</span></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="dh-wrap">

        {/* ── Index strip ──────────────────────────────────────────────── */}
        <div className="dh-indices">
          {INDICES.map((idx) => {
            const tick = typeof getTickBySymbolAuto === 'function'
              ? idx.symbols.map((s) => getTickBySymbolAuto(s)).find(Boolean)
              : null;
            const price = Number(tick?.lastPrice ?? tick?.last_price ?? tick?.ltp);
            const chg = Number(tick?.change ?? 0);
            const prev = Number(tick?.close ?? 0);
            const pct = prev > 0 && Number.isFinite(chg) ? (chg / prev) * 100 : null;
            const up = chg >= 0;
            return (
              <div className="dh-index" key={idx.label}>
                <span className="dh-index-mark" style={{ background: `${idx.tone}1F`, color: idx.tone }}>
                  <BarChart3 size={18} />
                </span>
                <div className="dh-index-body">
                  <div className="dh-index-name">{idx.label}</div>
                  <div className="dh-index-row">
                    <span className="dh-index-price">
                      {Number.isFinite(price) && price > 0 ? NUM(price) : '—'}
                    </span>
                    {Number.isFinite(chg) && chg !== 0 && (
                      <span className="dh-index-chg" style={{ color: up ? '#0E9F6E' : '#E5484D' }}>
                        {up ? '+' : ''}{NUM(chg)}{pct != null ? ` (${up ? '+' : ''}${pct.toFixed(2)}%)` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <Spark points={sparks[idx.label]} tone={idx.tone} />
              </div>
            );
          })}
        </div>

        {/* ── Practice account ─────────────────────────────────────────── */}
        {demo && (
          <div className="dh-demo">
            <div className="dh-demo-main">
              <span className="dh-demo-icon"><Gamepad2 size={20} /></span>
              <div>
                <div className="dh-demo-title">
                  Demo account<span className="dh-demo-free">Free</span>
                </div>
                <div className="dh-demo-sub">Live NSE &amp; BSE prices · practice only<br />Profits are not paid out.</div>
              </div>
            </div>
            <DemoCurve />
            <div className="dh-demo-bal">
              <b>{INR(demo.currentBalance ?? demo.balance ?? 0)}</b>
              <span>Virtual balance</span>
            </div>
            <div className="dh-demo-actions">
              <button className="dh-btn-sm dh-btn-sm--go" onClick={openDemo} disabled={demoBusy}>
                {demoBusy ? 'Opening…' : 'Start trading'} <ArrowRight size={15} />
              </button>
              <button className="dh-btn-sm" onClick={resetDemo} disabled={demoBusy} title="Reset the virtual balance">
                Reset
              </button>
            </div>
          </div>
        )}
        {demoErr && <p className="dh-sub" style={{ color: '#E5484D' }}>{demoErr}</p>}

        {/* ── Challenges ───────────────────────────────────────────────── */}
        <section className="dh-section">
          <div className="dh-section-head">
            <div>
              <div className="dh-eyebrow">Choose your challenge</div>
              <h2 className="dh-h2">Choose Your <em>Challenge</em></h2>
              <p className="dh-sub">Flexible evaluation plans to match your trading style.</p>
            </div>
            <div className="dh-head-right">
              <button type="button" className="dh-viewall" onClick={() => navigate('/app/challenges')}>
                View all plans <ArrowRight size={15} />
              </button>
            {challenges.length > 1 && (
              <div className="dh-tabs">
                {challenges.map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    className="dh-tab"
                    data-active={c._id === programme?._id}
                    onClick={() => setActiveProgramme(c._id)}
                  >
                    {c.name.replace(/ Evaluation$/, '')}
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>

          {programme ? (
            <div className="dh-cards">
              {(programme.tiers || []).slice(0, 3).map((tier, i) => (
                <div className="dh-card" key={tier._id || i} data-popular={!!tier.isPopular}>
                  {tier.isPopular && <span className="dh-card-flag">Most popular</span>}
                  <span className="dh-card-mark" data-i={i}>
                    {i === 0 ? <TrendingUp size={16} /> : i === 1 ? <Users size={16} /> : <Building2 size={16} />}
                  </span>
                  <div className="dh-card-size">{INR(tier.fundSize)} Challenge</div>
                  <p className="dh-card-note">{tierNote(programme, i)}</p>

                  <div className="dh-card-stats">
                    {objectives(programme).map((o) => (
                      <div className="dh-card-stat" key={o.label}>
                        <span>{o.label}</span>
                        <b>{o.value}</b>
                      </div>
                    ))}
                  </div>

                  <div className="dh-card-price">
                    <span className="dh-card-fee">{INR(tier.challengeFee)}</span>
                    <span className="dh-card-was">one-time</span>
                  </div>

                  <button className="dh-buy" onClick={() => navigate('/app/challenges')}>
                    Buy Challenge <ArrowRight size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="dh-empty"><p>Challenges are being set up. Check back shortly.</p></div>
          )}

          {/* ── Steps ──────────────────────────────────────────────────── */}
          <div className="dh-steps">
            <div>
              <div className="dh-steps-title">Get started in 3 simple steps</div>
              <div className="dh-sub">Onboarding takes minutes — the evaluation is the only hard part.</div>
            </div>
            <div className="dh-steps-list">
              {steps.map((s, i) => (
                <div className="dh-step" key={s.title}>
                  <span className="dh-step-n" data-done={s.done}>{i + 1}</span>
                  <span><b>{s.title}</b><span>{s.sub}</span></span>
                  {i < steps.length - 1 && <ArrowRight className="dh-step-arrow" size={15} />}
                </div>
              ))}
            </div>
            <button className="dh-buy" style={{ width: 'auto', padding: '0 22px' }} onClick={() => navigate('/app/challenges')}>
              Start Evaluation <ArrowRight size={16} />
            </button>
          </div>
        </section>

        {/* ── Accounts ─────────────────────────────────────────────────── */}
        <section className="dh-section">
          <div className="dh-section-head">
            <div>
              <div className="dh-eyebrow">Your accounts</div>
              <h2 className="dh-h2">Evaluations &amp; funded</h2>
            </div>
          </div>

          {loading ? (
            <div className="dh-empty"><p>Loading your accounts…</p></div>
          ) : liveAccounts.length === 0 ? (
            <div className="dh-empty">
              <p>No accounts yet. Buy a challenge above and it appears here the moment it is approved.</p>
              <button className="dh-buy" style={{ width: 'auto', padding: '0 22px', margin: '0 auto' }}
                      onClick={() => navigate('/app/challenges')}>
                Start Evaluation <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <div className="dh-acc-grid">
              {liveAccounts.map((acc) => {
                const tone = statusTone(acc.status);
                return (
                  <div
                    className="dh-acc"
                    key={acc._id}
                    onClick={() => {
                      setActiveChallengeAccountId?.(acc._id);
                      navigate('/app/challenge-dashboard');
                    }}
                  >
                    <div className="dh-acc-top">
                      <span className="dh-acc-id">{acc.accountId || acc.accountNumber || 'Account'}</span>
                      <span className="dh-pill" style={{ background: tone.bg, color: tone.fg }}>{acc.status}</span>
                    </div>
                    <div className="dh-acc-bal">{INR(acc.currentBalance ?? acc.balance ?? 0)}</div>
                    <div className="dh-acc-meta">
                      {INR(acc.initialBalance ?? acc.accountSize ?? 0)} account
                      {acc.currentPhase ? ` · phase ${acc.currentPhase}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default DashboardPage;
