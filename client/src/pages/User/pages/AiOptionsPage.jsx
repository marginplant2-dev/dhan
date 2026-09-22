import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  LuSparkles, LuRefreshCw, LuChevronRight, LuChevronDown, LuCalendar,
  LuCrown, LuCircleCheck, LuSettings, LuActivity, LuClock, LuTrendingUp, LuBrain,
} from 'react-icons/lu';
import UpiQr from '../../../components/UpiQr';
import './AiOptionsPage.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/* Each index gets its own accent so the selector reads at a glance. */
const ACCENTS = {
  NIFTY: '#2563eb',
  BANKNIFTY: '#059669',
  SENSEX: '#7c3aed',
};

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtExpiry = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtExpiryShort = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

/** "2 min ago" — the page claims to be live, so it has to say how live. */
function useAgo(iso) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 20000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return '';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  return `${mins} min ago`;
}

/** mm:ss until the next refresh. */
function useCountdown(iso) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!iso) { setLeft(0); return; }
    const calc = () => setLeft(Math.max(0, Math.floor((new Date(iso) - Date.now()) / 1000)));
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [iso]);
  const m = String(Math.floor(left / 60)).padStart(2, '0');
  const s = String(left % 60).padStart(2, '0');
  return { left, text: `${m}:${s}` };
}

const scoreTone = (score) => (score >= 8.5 ? 'high' : score >= 7 ? 'mid' : 'low');

function AiOptionsPage() {
  const { user } = useOutletContext() || {};
  const token = useMemo(() => localStorage.getItem('dhanfunded-token') || '', []);
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [config, setConfig] = useState(null);
  const [indexKey, setIndexKey] = useState('NIFTY');
  const [expiries, setExpiries] = useState([]);
  const [expiry, setExpiry] = useState('');
  const [expiryOpen, setExpiryOpen] = useState(false);

  const [data, setData] = useState(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPlans, setShowPlans] = useState(false);
  const [openRow, setOpenRow] = useState(null);   // symbol whose reasoning is open

  const ago = useAgo(data?.asOf);
  const countdown = useCountdown(data?.nextUpdateAt);
  const pollRef = useRef(null);

  /* ── load ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    fetch(`${API_URL}/api/ai-options/config`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => { if (d.success) setConfig(d); })
      .catch(() => {});
  }, [authHeaders]);

  useEffect(() => {
    let alive = true;
    setExpiries([]); setExpiry(''); setError(''); setLoading(true);
    fetch(`${API_URL}/api/ai-options/expiries?index=${indexKey}`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        // Without an expiry nothing downstream can run, so this is the one
        // place that has to clear the spinner — otherwise the page span forever.
        if (!d.success) { setError(d.message || 'Could not load expiry dates'); setLoading(false); return; }
        const list = d.expiries || [];
        setExpiries(list);
        setExpiry(list[0] || '');
        if (!list.length) { setError('No expiry dates listed for this index right now.'); setLoading(false); }
      })
      .catch(() => { if (alive) { setError('Could not reach the server'); setLoading(false); } });
    return () => { alive = false; };
  }, [indexKey, authHeaders]);

  const load = useCallback(async () => {
    if (!expiry) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(
        `${API_URL}/api/ai-options/suggestions?index=${indexKey}&expiry=${expiry}`,
        { headers: authHeaders },
      );
      const d = await r.json();
      if (r.status === 402) { setLocked(true); setData(null); return; }
      setLocked(false);
      if (!d.success) { setError(d.message || 'Could not load the analysis'); setData(null); return; }
      setData(d);
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, [indexKey, expiry, authHeaders]);

  useEffect(() => { load(); }, [load]);

  /* Refresh itself once the window is up, so the page stays what it claims. */
  useEffect(() => {
    clearTimeout(pollRef.current);
    if (locked || !data?.nextUpdateAt) return;
    const ms = Math.max(5000, new Date(data.nextUpdateAt) - Date.now() + 1000);
    pollRef.current = setTimeout(load, ms);
    return () => clearTimeout(pollRef.current);
  }, [data, locked, load]);

  const indices = config?.indices || [
    { key: 'NIFTY', label: 'NIFTY 50', exchange: 'NSE' },
    { key: 'BANKNIFTY', label: 'BANK NIFTY', exchange: 'NSE' },
    { key: 'SENSEX', label: 'SENSEX', exchange: 'BSE' },
  ];
  const sub = config?.subscription;
  const rows = data?.suggestions || [];

  return (
    <div className="aio-scroll">
      <div className="aio">

        {/* ── header ─────────────────────────────────────────────── */}
        <div className="aio-head">
          <div className="aio-head-text">
            <h1><span className="aio-ai">AI</span> Options Analysis</h1>
            <p>Live Nifty, Bank Nifty &amp; Sensex option chain analysis, powered by Gemini AI.</p>

            <div className="aio-chips">
              <span className="aio-chip"><LuSparkles /> AI Powered (Gemini)</span>
              <span className="aio-chip"><LuActivity /> Real-time Analysis</span>
              <span className="aio-chip"><LuTrendingUp /> Top 3&ndash;4 Ranked Contracts</span>
              <span className="aio-chip"><LuClock /> Updated Every 4&ndash;5 Minutes</span>
              <span className="aio-chip"><LuBrain /> Sharpen Your Edge</span>
            </div>
          </div>

          <div className="aio-head-card">
            <LuSparkles className="aio-head-card-icon" />
            <div>
              <strong>Smarter Analysis</strong>
              <strong>Clearer Decisions</strong>
              <strong>Powered by Gemini AI</strong>
            </div>
          </div>
        </div>

        {/* ── index + expiry selector ────────────────────────────── */}
        <div className="aio-selector">
          {indices.map((ix) => (
            <button
              key={ix.key}
              type="button"
              className={`aio-ix ${indexKey === ix.key ? 'is-active' : ''}`}
              style={{ '--ix': ACCENTS[ix.key] || '#2563eb' }}
              onClick={() => setIndexKey(ix.key)}
            >
              <span className="aio-ix-icon"><LuSparkles /></span>
              <span className="aio-ix-text">
                <span className="aio-ix-name">{ix.label}</span>
                <span className="aio-ix-exch">{ix.exchange}</span>
              </span>
            </button>
          ))}

          <div className="aio-expiry">
            <button type="button" className="aio-expiry-btn" onClick={() => setExpiryOpen((o) => !o)}>
              <LuCalendar className="aio-expiry-cal" />
              <span className="aio-ix-text">
                <span className="aio-ix-exch">Expiry Date</span>
                <span className="aio-ix-name">{expiry ? `${fmtExpiry(expiry)}` : 'Loading…'}</span>
              </span>
              <LuChevronDown className={`aio-expiry-caret ${expiryOpen ? 'is-open' : ''}`} />
            </button>
            {expiryOpen && (
              <div className="aio-expiry-menu">
                {expiries.length === 0 && <div className="aio-expiry-empty">No expiries listed</div>}
                {expiries.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={`aio-expiry-item ${e === expiry ? 'is-sel' : ''}`}
                    onClick={() => { setExpiry(e); setExpiryOpen(false); }}
                  >
                    {fmtExpiry(e)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── results ────────────────────────────────────────────── */}
        <div className="aio-panel">
          <div className="aio-panel-head">
            <h2>
              Top Option Contracts ({indices.find((i) => i.key === indexKey)?.label || indexKey})
              {data?.spot > 0 && (
                <span className="aio-spot">
                  spot {Number(data.spot).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </h2>
            <div className="aio-panel-meta">
              {!locked && data && (
                <>
                  <span className="aio-live"><i /> Live</span>
                  <span className="aio-dot">&middot;</span>
                  <span>Updated {ago}</span>
                </>
              )}
              {!locked && data && (
                <span className="aio-next">
                  Next update in {countdown.text}
                  <button type="button" className="aio-refresh" onClick={load} aria-label="Refresh now">
                    <LuRefreshCw className={loading ? 'is-spin' : ''} />
                  </button>
                </span>
              )}
            </div>
          </div>

          {locked ? (
            <LockedState onSeePlans={() => setShowPlans(true)} pending={config?.pendingRequest} />
          ) : loading && !rows.length ? (
            <div className="aio-state">Analysing the live option chain…</div>
          ) : error ? (
            <div className="aio-state aio-state-err">{error}</div>
          ) : !rows.length ? (
            <div className="aio-state">Nothing stood out in this expiry right now. Try the next expiry.</div>
          ) : (
            <>
              {/* desktop table */}
              <div className="aio-table-wrap">
                <table className="aio-table">
                  <thead>
                    <tr>
                      <th>#</th><th>Symbol</th><th>Type</th><th>Strike Price</th>
                      <th>Expiry</th><th>LTP</th><th>AI Score</th>
                      <th>Expected Move</th><th>Confidence</th><th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => ([
                      <tr key={r.symbol}>
                        <td><span className="aio-rank">{i + 1}</span></td>
                        <td className="aio-sym">{indices.find((x) => x.key === indexKey)?.key || indexKey}</td>
                        <td><span className={`aio-type is-${r.type.toLowerCase()}`}>{r.type}</span></td>
                        <td className="aio-num">{Number(r.strike).toLocaleString('en-IN')}</td>
                        <td>{fmtExpiryShort(r.expiry)}</td>
                        <td className="aio-num">{inr(r.ltp)}</td>
                        <td>
                          <div className="aio-score">
                            <span className={`aio-score-n is-${scoreTone(r.score)}`}>{r.score.toFixed(1)}</span>
                            <span className="aio-score-bar">
                              <i className={`is-${scoreTone(r.score)}`} style={{ width: `${r.score * 10}%` }} />
                            </span>
                          </div>
                        </td>
                        <td className="aio-move">+{r.expectedMoveLow}% &ndash; {r.expectedMoveHigh}%</td>
                        <td><span className={`aio-conf is-${r.confidence.toLowerCase()}`}>{r.confidence}</span></td>
                        <td>
                          <button
                            type="button"
                            className="aio-view"
                            onClick={() => setOpenRow(openRow === r.symbol ? null : r.symbol)}
                          >
                            {openRow === r.symbol ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>,
                      openRow === r.symbol && (
                        <tr key={`${r.symbol}-why`} className="aio-why-row">
                          <td colSpan={10}>
                            <div className="aio-why">
                              <strong>Why this contract</strong>
                              <p>{r.rationale || 'No note returned for this contract.'}</p>
                              <span>
                                {r.symbol} &middot; lot size {r.lotSize} &middot; one lot costs about{' '}
                                {inr(r.ltp * r.lotSize)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ),
                    ]))}
                  </tbody>
                </table>
              </div>

              {/* phone cards */}
              <div className="aio-cards">
                {rows.map((r, i) => (
                  <div
                    className="aio-card"
                    key={r.symbol}
                    onClick={() => setOpenRow(openRow === r.symbol ? null : r.symbol)}
                  >
                    <span className="aio-rank">{i + 1}</span>
                    <div className="aio-card-main">
                      <div className="aio-card-top">
                        <strong>{indexKey} {Number(r.strike).toLocaleString('en-IN')}</strong>
                        <span className={`aio-type is-${r.type.toLowerCase()}`}>{r.type}</span>
                      </div>
                      <div className="aio-card-sub">{fmtExpiryShort(r.expiry)} &middot; {inr(r.ltp)}</div>
                      {openRow === r.symbol && (
                        <div className="aio-card-why">
                          {r.rationale || 'No note returned for this contract.'}
                          <span>Lot {r.lotSize} &middot; about {inr(r.ltp * r.lotSize)} per lot</span>
                        </div>
                      )}
                    </div>
                    <div className="aio-card-right">
                      <span className={`aio-score-pill is-${scoreTone(r.score)}`}>{r.score.toFixed(1)}</span>
                      <span className="aio-card-move">+{r.expectedMoveLow}% &ndash; {r.expectedMoveHigh}%</span>
                    </div>
                    <LuChevronRight className="aio-card-caret" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── subscription + how it works ────────────────────────── */}
        <div className="aio-bottom">
          <div className="aio-sub-card">
            <div className="aio-sub-crown"><LuCrown /></div>
            <h3>{sub ? 'Your AI Options Access' : 'Get Full Access with AI Options'}</h3>
            {sub ? (
              <p>
                <strong>{sub.planName}</strong> &mdash; active until{' '}
                <strong>{fmtExpiry(sub.expiresAt)}</strong>.
              </p>
            ) : (
              <p>Unlock live AI option chain analysis for Nifty, Bank Nifty &amp; Sensex. Updated every 4&ndash;5 minutes using Gemini AI.</p>
            )}

            <ul className="aio-sub-list">
              <li><LuCircleCheck /> Top 3&ndash;4 ranked contracts</li>
              <li><LuCircleCheck /> Strike, LTP &amp; AI score</li>
              <li><LuCircleCheck /> Real-time updates (every 4&ndash;5 min)</li>
              <li><LuCircleCheck /> Study the chain faster</li>
              <li><LuCircleCheck /> Nifty, Bank Nifty &amp; Sensex coverage</li>
              <li><LuCircleCheck /> Cancel anytime</li>
            </ul>

            <button type="button" className="aio-cta" onClick={() => setShowPlans(true)}>
              {sub ? 'Extend access' : 'Choose Subscription Plan'} <LuChevronRight />
            </button>
          </div>

          <div className="aio-how">
            <div className="aio-how-icon"><LuSettings /></div>
            <h3>How It Works?</h3>
            <ol>
              <li><span>1</span><div><strong>Choose Your Index</strong><em>Select Nifty, Bank Nifty or Sensex.</em></div></li>
              <li><span>2</span><div><strong>Get AI Analysis</strong><em>We read the live chain from the exchange and analyse it with Gemini AI.</em></div></li>
              <li><span>3</span><div><strong>See the Top Contracts</strong><em>The 3&ndash;4 contracts that stand out, each with an AI score.</em></div></li>
              <li><span>4</span><div><strong>Decide for Yourself</strong><em>Use it as one input. You place your own trades and manage your own risk.</em></div></li>
            </ol>
          </div>
        </div>

        {/* The page sells analysis, not advice. Say so where it is read. */}
        <p className="aio-disclaimer">
          Educational analysis only &mdash; not investment advice, and not a recommendation to buy or
          sell any contract. DhanFunded is not a SEBI-registered investment adviser or research
          analyst. Options carry a high risk of loss; you are responsible for your own trades.
        </p>
      </div>

      {showPlans && (
        <PlansModal
          plans={config?.plans || []}
          pending={config?.pendingRequest}
          authHeaders={authHeaders}
          user={user}
          onClose={() => setShowPlans(false)}
          onDone={() => {
            setShowPlans(false);
            fetch(`${API_URL}/api/ai-options/config`, { headers: authHeaders })
              .then((r) => r.json()).then((d) => { if (d.success) setConfig(d); }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

/* ── locked ─────────────────────────────────────────────────────────── */
function LockedState({ onSeePlans, pending }) {
  return (
    <div className="aio-locked-wrap">
      {/* The real layout, blurred. Placeholder bars — never invented numbers,
          which would be a lie about what the subscription returns. */}
      <div className="aio-teaser" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div className="aio-teaser-row" key={i}>
            <span className="aio-rank">{i + 1}</span>
            <span className="aio-bar" style={{ width: '22%' }} />
            <span className="aio-bar" style={{ width: '12%' }} />
            <span className="aio-bar" style={{ width: '16%' }} />
            <span className="aio-bar aio-bar-green" style={{ width: '14%' }} />
            <span className="aio-bar" style={{ width: '10%' }} />
          </div>
        ))}
      </div>

    <div className="aio-locked">
      <div className="aio-locked-icon"><LuCrown /></div>
      {pending ? (
        <>
          <h3>Payment under review</h3>
          <p>Your subscription request is with our team. Access opens as soon as the payment is verified &mdash; usually within a few hours.</p>
        </>
      ) : (
        <>
          <h3>Subscribe to see the analysis</h3>
          <p>The live option chain analysis is part of the AI Options subscription.</p>
          <button type="button" className="aio-cta" onClick={onSeePlans}>
            View Subscription Plans <LuChevronRight />
          </button>
        </>
      )}
    </div>
    </div>
  );
}

/* ── plans + UPI payment ────────────────────────────────────────────── */
function PlansModal({ plans, pending, authHeaders, onClose, onDone }) {
  const [picked, setPicked] = useState(null);
  const [upiList, setUpiList] = useState([]);
  const [upiId, setUpiId] = useState('');
  const [shot, setShot] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [payStep, setPayStep] = useState(1);   // 1 = pay, 2 = upload the proof

  // Same source the challenge-buy flow pays into, so there is one set of UPI
  // details to keep current.
  useEffect(() => {
    fetch(`${API_URL}/api/admin-payment-details`)
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) return;
        const list = d.upiIds || [];
        setUpiList(list);
        if (list[0]) setUpiId(list[0].upiId || '');
      })
      .catch(() => {});
  }, []);

  const active = upiList.find((u) => u.upiId === upiId) || null;
  // Any UPI app opens this pre-filled at the exact amount, so the user cannot
  // accidentally pay a different figure.
  const upiDeepLink = upiId && picked
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(active?.name || 'DhanFunded')}&am=${Number(picked.price)}&cu=INR`
    : '';

  const readFile = (file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setMsg('Screenshot must be under 3 MB'); return; }
    const fr = new FileReader();
    fr.onload = () => setShot(String(fr.result || ''));
    fr.readAsDataURL(file);
  };

  const submit = async () => {
    if (!picked) return;
    // The UTR field is gone, so this image is the only evidence an admin gets.
    if (!shot) { setMsg('Please upload the payment screenshot'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${API_URL}/api/ai-options/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          planId: picked._id, adminUpiId: upiId || 'upi', screenshotBase64: shot,
        }),
      });
      const d = await r.json();
      if (!d.success) { setMsg(d.message || 'Could not submit the request'); return; }
      onDone();
    } catch {
      setMsg('Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="aio-modal-bg" onClick={onClose}>
      <div className="aio-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aio-modal-head">
          <h3>{picked ? 'Complete your payment' : 'AI Options Subscription'}</h3>
          <button type="button" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        {pending ? (
          <div className="aio-modal-body">
            <p className="aio-note">You already have a request awaiting approval. We will open access as soon as the payment is verified.</p>
          </div>
        ) : !picked ? (
          <div className="aio-modal-body">
            {plans.length === 0 && <p className="aio-note">No plans are on sale right now. Please check back soon.</p>}
            <div className="aio-plans">
              {plans.map((p) => (
                <button type="button" key={p._id} className={`aio-plan ${p.popular ? 'is-popular' : ''}`} onClick={() => { setPicked(p); setPayStep(1); setMsg(''); }}>
                  {p.popular && <span className="aio-plan-ribbon">Popular</span>}
                  <span className="aio-plan-name">{p.name}</span>
                  <span className="aio-plan-price">{`₹${Number(p.price).toLocaleString('en-IN')}`}</span>
                  <span className="aio-plan-days">{p.days} days access</span>
                  {p.description && <span className="aio-plan-desc">{p.description}</span>}
                  {(p.features || []).map((f, i) => (
                    <span className="aio-plan-feat" key={i}><LuCircleCheck /> {f}</span>
                  ))}
                  <span className="aio-plan-pay">Pay &#8377;{Number(p.price).toLocaleString('en-IN')} <LuChevronRight /></span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="aio-modal-body">
            {/* Two steps, because a UTR only exists after the payment. */}
            <div className="aio-steps">
              <span className={payStep === 1 ? 'is-on' : ''}>1 &middot; Pay</span>
              <LuChevronRight />
              <span className={payStep === 2 ? 'is-on' : ''}>2 &middot; Upload proof</span>
            </div>

            {payStep === 1 ? (
              <>
                <div className="aio-pay-head">
                  <div className="aio-pay-amt"><span>&#8377;</span>{Number(picked.price).toLocaleString('en-IN')}</div>
                  <div className="aio-pay-plan">{picked.name} &middot; {picked.days} days &middot; to {active?.name || 'DhanFunded'}</div>
                </div>

                {upiList.length > 1 && (
                  <label className="aio-field">
                    <span>Pay to</span>
                    <select value={upiId} onChange={(e) => setUpiId(e.target.value)}>
                      {upiList.map((u) => (
                        <option key={u._id} value={u.upiId}>{u.upiId}{u.name ? ` — ${u.name}` : ''}</option>
                      ))}
                    </select>
                  </label>
                )}

                {upiId ? (
                  <div className="aio-qr-box">
                    {/* Drawn locally, with the amount already inside — the app
                        opens pre-filled at the exact price. */}
                    {active?.qrImage
                      ? <img className="aio-qr" src={active.qrImage} alt={`UPI QR for ${upiId}`} />
                      : <UpiQr value={upiDeepLink} size={196} className="aio-qr" />}
                    <div className="aio-qr-id">{upiId}</div>
                    <a className="aio-cta aio-pay-btn" href={upiDeepLink}>
                      Pay &#8377;{Number(picked.price).toLocaleString('en-IN')}
                    </a>
                    <div className="aio-pay-secure">
                      Secured payments powered by <strong>UPI</strong>
                    </div>
                  </div>
                ) : (
                  <p className="aio-err">No payment account configured. Please contact support.</p>
                )}

                <p className="aio-rules-line">
                  Pay the exact amount, then keep the screenshot &mdash; it is what we verify.
                </p>

                <div className="aio-modal-actions">
                  <button type="button" className="aio-ghost" onClick={() => setPicked(null)}>Back</button>
                  <button type="button" className="aio-cta" disabled={!upiId} onClick={() => setPayStep(2)}>
                    Verify <LuChevronRight />
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="aio-field">
                  <span>Payment screenshot</span>
                  <input type="file" accept="image/*" onChange={(e) => readFile(e.target.files?.[0])} />
                </label>
                {shot && <img className="aio-shot" src={shot} alt="Payment screenshot" />}
                <p className="aio-note">
                  Upload the screenshot from your UPI app showing &#8377;{Number(picked.price).toLocaleString('en-IN')} paid
                  to {upiId}. Access opens once our team verifies it.
                </p>
                {msg && <p className="aio-err">{msg}</p>}
                <div className="aio-modal-actions">
                  <button type="button" className="aio-ghost" onClick={() => setPayStep(1)}>Back</button>
                  <button type="button" className="aio-cta" disabled={busy} onClick={submit}>
                    {busy ? 'Submitting\u2026' : 'Submit for approval'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AiOptionsPage;
