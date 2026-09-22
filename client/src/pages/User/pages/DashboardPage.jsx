import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import IndexTicker from '../../../components/IndexTicker';

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

function DashboardPage() {
  const { user, setActiveChallengeAccountId, getTickBySymbolAuto } = useOutletContext();
  const navigate = useNavigate();
  const [myAccounts, setMyAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Free practice account. The backend and the widget logic already existed in
  // HomePage.jsx, but that component is never routed — /app renders this page —
  // so the entry point the admin panel promises ("users can spin up a demo from
  // their home page") was unreachable. Same endpoints, surfaced where people
  // actually land.
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

  useEffect(() => { fetchDemo(); }, []);

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

  useEffect(() => {
    fetchAccounts();
  }, []);

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

  const activeAccounts = myAccounts.filter(a => a.status === 'ACTIVE');
  const fundedAccounts = myAccounts.filter(a => a.status === 'FUNDED');
  const passedAccounts = myAccounts.filter(a => a.status === 'PASSED');

  const statusColor = (s) => {
    const map = { ACTIVE: '#3b82f6', FUNDED: '#f59e0b', PASSED: '#10b981', FAILED: '#ef4444', EXPIRED: '#6b7280' };
    return map[s] || '#6b7280';
  };

  return (
    <div className="pf-dashboard-root" style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      <style>{`
        .pf-dashboard-root .pf-dash-shell { padding: 24px 28px 60px; }
        .pf-dashboard-root .pf-dash-stepper-card { padding: 32px; }
        .pf-dashboard-root .pf-dash-stepper-line { width: 80px; }
        @media (max-width: 768px) {
          .pf-dashboard-root .pf-dash-shell { padding: 16px 12px 90px; }
          .pf-dashboard-root .pf-dash-stepper-card { padding: 20px 12px; }
          .pf-dashboard-root .pf-dash-stepper-line { width: 28px !important; }
          .pf-dashboard-root .pf-dash-stepper-card h2 { font-size: 18px !important; }
          .pf-dashboard-root .pf-dash-quick-actions { grid-template-columns: 1fr !important; gap: 12px !important; }
          .pf-dashboard-root .pf-dash-quick-card { padding: 16px !important; }
        }
        @media (max-width: 380px) {
          .pf-dashboard-root .pf-dash-stepper-line { width: 16px !important; margin: 0 4px !important; }
          .pf-dashboard-root .pf-dash-stepper-label { font-size: 10px !important; }
        }
      `}</style>
      <div className="pf-dash-shell">
        {/* Live NIFTY / SENSEX / BANKNIFTY at the top (the navbar already marks
            this page as Dashboard, so the breadcrumb and title were redundant). */}
        <div className="dash-top">
          <IndexTicker getTickBySymbolAuto={getTickBySymbolAuto} />
          <button
            className="dash-buy"
            onClick={() => navigate('/app/challenges')}
          >
            + Buy New Challenge
          </button>
        </div>

        {/* Demo account — one compact row at the top (styles: .pf-demo-strip in
            App.css). The previous stacked card spanned the whole screen with a
            full-width button on desktop. Only rendered when the admin has demos on. */}
        {demo && (
          <div className="pf-demo-strip">
            <div className="pf-demo-strip__main">
              <span className="pf-demo-strip__icon" aria-hidden="true">&#127918;</span>
              <div style={{ minWidth: 0 }}>
                <div>
                  <span className="pf-demo-strip__title">Demo account</span>
                  <span className="pf-demo-strip__badge">FREE</span>
                </div>
                <div className="pf-demo-strip__sub">
                  Live NSE &amp; BSE prices &middot; practice only, profits are not paid out
                </div>
                {demoErr && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{demoErr}</div>}
              </div>
            </div>

            <div className="pf-demo-strip__bal">
              <strong>&#8377;{Number(demo.currentBalance ?? demo.initialBalance ?? 0).toLocaleString('en-IN')}</strong>
              <span>virtual balance</span>
            </div>

            <div className="pf-demo-strip__actions">
              <button className="pf-demo-strip__go" onClick={openDemo} disabled={demoBusy}>
                {demoBusy ? 'Opening…' : 'Start trading'}
              </button>
              <button className="pf-demo-strip__reset" onClick={resetDemo} disabled={demoBusy} title="Reset the virtual balance">
                Reset
              </button>
            </div>
          </div>
        )}

        {/* Evaluation Progress Stepper */}
        <div className="pf-dash-stepper-card" style={{
          borderRadius: '16px', marginBottom: '28px', textAlign: 'center',
          background: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
        }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '22px', fontWeight: '700', margin: '0 0 6px' }}>
            {myAccounts.length > 0 ? 'Your Learning Journey' : 'Start your evaluation'}
          </h2>
          <p style={{ color: 'var(--accent-primary)', fontSize: '13px', margin: '0 0 28px' }}>
            {myAccounts.length > 0 ? 'Track your progress below' : 'Click the flag to begin.'}
          </p>

          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', maxWidth: '500px', margin: '0 auto 20px' }}>
            {[
              { label: 'Registered', done: true },
              { label: 'Email Verified', done: !!user?.isEmailVerified || true },
              { label: 'Start Evaluation', done: myAccounts.length > 0 },
            ].map((step, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: step.done ? 'var(--accent-primary)' : 'var(--bg-tertiary, var(--bg-primary))',
                    border: step.done ? 'none' : '2px solid var(--border-color)',
                    color: step.done ? '#fff' : 'var(--text-secondary)', fontSize: '14px', fontWeight: '700'
                  }}>
                    {step.done ? '\u2713' : i === arr.length - 1 ? '\u2691' : (i + 1)}
                  </div>
                  <span className="pf-dash-stepper-label" style={{ fontSize: '11px', color: step.done ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: '600', whiteSpace: 'nowrap' }}>
                    {step.label}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div className="pf-dash-stepper-line" style={{
                    height: '2px', margin: '0 8px', marginBottom: '20px',
                    background: step.done ? 'var(--accent-primary)' : 'var(--border-color)'
                  }} />
                )}
              </div>
            ))}
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Simulated practice &middot; Clear rules &middot; Certificates issued on pass
          </div>
        </div>

        {/* Active Accounts */}
        {loading ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Loading accounts...</p>
        ) : myAccounts.length > 0 ? (
          <div>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '700', margin: '0 0 16px' }}>
              My Accounts
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '400', marginLeft: '8px' }}>
                {myAccounts.length} total
              </span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {myAccounts.map(acc => {
                const ch = acc.challengeId || {};
                const sc = statusColor(acc.status);
                const pnl = acc.totalPnl != null ? Number(acc.totalPnl) : ((acc.walletBalance ?? acc.currentBalance ?? 0) - (acc.initialBalance || 0));
                return (
                  <div
                    key={acc._id}
                    onClick={() => navigate(`/app/challenge/${acc._id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '16px 20px', borderRadius: '12px', cursor: 'pointer',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                      transition: 'border-color 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = sc}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '42px', height: '42px', borderRadius: '10px',
                        background: `${sc}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '18px', color: sc, fontWeight: '800'
                      }}>
                        {acc.status === 'FUNDED' ? '\u{1F4B0}' : acc.status === 'ACTIVE' ? '\u{1F4CA}' : acc.status === 'PASSED' ? '\u2705' : '\u23F0'}
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)', marginBottom: '2px' }}>
                          {ch.name || 'Challenge'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', gap: '10px' }}>
                          <span>ID: {acc.accountId}</span>
                          <span>Fund: ₹{(acc.initialBalance || ch.fundSize || 0).toLocaleString('en-IN')}</span>
                          {acc.totalPhases > 0 && <span>Phase {acc.currentPhase}/{acc.totalPhases}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '600',
                        background: `${sc}15`, color: sc
                      }}>
                        {acc.status}
                      </span>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: pnl >= 0 ? '#10b981' : '#ef4444', marginTop: '4px' }}>
                        {pnl >= 0 ? '+' : ''}₹{pnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{
            textAlign: 'center', padding: '40px', borderRadius: '14px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
          }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 16px' }}>
              No accounts yet. Start your first evaluation!
            </p>
            <button
              onClick={() => navigate('/app/challenges')}
              style={{
                padding: '12px 28px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: 'var(--gold-grad)', color: 'var(--on-gold)',
                fontWeight: '700', fontSize: '14px'
              }}
            >
              Start Evaluation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default DashboardPage;
