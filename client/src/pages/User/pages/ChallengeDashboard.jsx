import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { compressImage } from '../../../utils/compressImage';
import UpiQr from '../../../components/UpiQr';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authData.token || ''}`
  };
}

const statusConfig = {
  ACTIVE:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', dot: '#f59e0b', label: 'Active' },
  PASSED:  { color: '#10b981', bg: 'rgba(16,185,129,0.12)', dot: '#10b981', label: 'Passed' },
  FAILED:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', dot: '#ef4444', label: 'Failed' },
  FUNDED:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', dot: '#f59e0b', label: 'Funded' },
  EXPIRED: { color: '#6b7280', bg: 'rgba(107,114,128,0.15)', dot: '#6b7280', label: 'Expired' }
};

const formatINR = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatINRCompact = (v) => {
  const n = Number(v || 0);
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
};
const formatDuration = (sec) => {
  if (!sec || sec <= 0) return '0h 0m 0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Equity curve chart — pure SVG so it renders identically across browsers   */
/* without pulling a chart library's init/destroy/resize dance into this     */
/* file. Data is [{ t: Date, equity: Number }, …] in chronological order.    */
/* ────────────────────────────────────────────────────────────────────────── */
function EquityCurveChart({ data, initialBalance, mode = 'absolute', showObjectives = true, objectives = [] }) {
  const containerRef = useRef(null);
  const [w, setW] = useState(800);
  const h = 260;

  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(e.contentRect.width);
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const padding = { top: 20, right: 16, bottom: 28, left: 72 };
  const plotW = Math.max(100, w - padding.left - padding.right);
  const plotH = h - padding.top - padding.bottom;

  const hasData = Array.isArray(data) && data.length > 0;
  const values = hasData ? data.map(d => mode === 'change' ? d.equity - initialBalance : d.equity) : [];
  const yMin = hasData ? Math.min(...values, mode === 'change' ? 0 : initialBalance) : 0;
  const yMax = hasData ? Math.max(...values, mode === 'change' ? 0 : initialBalance) : 1;
  const yPad = (yMax - yMin) * 0.08 || Math.max(1, Math.abs(yMax) * 0.02);
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  const xOf = (i) => hasData && data.length > 1
    ? padding.left + (i / (data.length - 1)) * plotW
    : padding.left + plotW / 2;
  const yOf = (v) => padding.top + (1 - (v - yLo) / (yHi - yLo || 1)) * plotH;

  const linePath = hasData
    ? values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(' ')
    : '';
  const areaPath = hasData
    ? `${linePath} L ${xOf(values.length - 1).toFixed(1)} ${yOf(yLo).toFixed(1)} L ${xOf(0).toFixed(1)} ${yOf(yLo).toFixed(1)} Z`
    : '';

  // Y-axis gridlines
  const yTicks = [];
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) {
    const v = yLo + ((yHi - yLo) * (tickCount - i)) / tickCount;
    yTicks.push({ v, y: yOf(v) });
  }

  // X-axis ticks — show first & last timestamp plus a few in between
  const xTicks = [];
  if (hasData) {
    const n = Math.min(4, data.length);
    for (let i = 0; i < n; i++) {
      const idx = Math.round((i / Math.max(1, n - 1)) * (data.length - 1));
      const t = new Date(data[idx].t);
      xTicks.push({
        x: xOf(idx),
        label: t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      });
    }
  }

  const last = hasData ? values[values.length - 1] : 0;
  const lineColor = hasData && last >= (mode === 'change' ? 0 : initialBalance) ? '#10b981' : '#ef4444';

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg width={w} height={h} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="eq-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Gridlines + Y labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padding.left} y1={t.y} x2={padding.left + plotW} y2={t.y}
              stroke="var(--border-color, rgba(255,255,255,0.06))" strokeDasharray="3 3" />
            <text x={padding.left - 8} y={t.y + 4} fill="var(--text-secondary, #9ca3af)"
              fontSize="10" textAnchor="end">
              {mode === 'change'
                ? (t.v >= 0 ? '+' : '') + formatINRCompact(t.v)
                : formatINRCompact(t.v)}
            </text>
          </g>
        ))}

        {/* Initial-balance reference line (absolute mode only) */}
        {mode === 'absolute' && showObjectives && initialBalance > 0 && (
          <>
            <line
              x1={padding.left}
              y1={yOf(initialBalance)}
              x2={padding.left + plotW}
              y2={yOf(initialBalance)}
              stroke="#6b7280"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
            <text x={padding.left + plotW - 4} y={yOf(initialBalance) - 4}
              fill="#9ca3af" fontSize="10" textAnchor="end">
              Account Size {formatINRCompact(initialBalance)}
            </text>
          </>
        )}

        {/* Objective bands (max daily loss / max loss / profit target) */}
        {mode === 'absolute' && showObjectives && objectives?.filter(o => o.key === 'profit-target' || o.key === 'max-loss').map((o, i) => {
          const pct = Number(o.target) / 100;
          const v = o.key === 'profit-target'
            ? initialBalance * (1 + pct)
            : initialBalance * (1 - pct);
          if (v < yLo || v > yHi) return null;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={yOf(v)}
                x2={padding.left + plotW}
                y2={yOf(v)}
                stroke={o.key === 'profit-target' ? '#10b981' : '#ef4444'}
                strokeDasharray="2 4"
                strokeWidth="1"
                opacity="0.55"
              />
              <text x={padding.left + 4} y={yOf(v) - 3}
                fill={o.key === 'profit-target' ? '#10b981' : '#ef4444'}
                fontSize="10">
                {o.key === 'profit-target' ? 'Target' : 'Max Loss'} {formatINRCompact(v)}
              </text>
            </g>
          );
        })}

        {/* Area + line */}
        {hasData && <path d={areaPath} fill="url(#eq-area)" />}
        {hasData && <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" />}

        {/* Last-point dot */}
        {hasData && (
          <circle
            cx={xOf(values.length - 1)}
            cy={yOf(values[values.length - 1])}
            r="4"
            fill={lineColor}
            stroke="var(--bg-primary, #fff)"
            strokeWidth="2"
          />
        )}

        {/* X labels */}
        {xTicks.map((t, i) => (
          <text key={i} x={t.x} y={h - 8} fill="var(--text-secondary, #9ca3af)"
            fontSize="10" textAnchor="middle">{t.label}</text>
        ))}

        {!hasData && (
          <text x={w / 2} y={h / 2} fill="var(--text-secondary, #9ca3af)"
            fontSize="12" textAnchor="middle">No equity data yet — place an order to start</text>
        )}
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Consistency score gauge — semi-circle arc                                 */
/* ────────────────────────────────────────────────────────────────────────── */
function ConsistencyGauge({ score, daysTraded }) {
  const radius = 70;
  const circumference = Math.PI * radius;
  const progress = score == null ? 0 : (score / 100) * circumference;
  const color = score == null ? '#6b7280' : score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0' }}>
      <svg width="180" height="110" viewBox="0 0 180 110">
        <path
          d="M 20 100 A 70 70 0 0 1 160 100"
          fill="none"
          stroke="var(--border-color, rgba(255,255,255,0.1))"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M 20 100 A 70 70 0 0 1 160 100"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x="90" y="85" textAnchor="middle" fill="var(--text-primary)"
          fontSize="26" fontWeight="700">
          {score == null ? '—' : score}
        </text>
        {score != null && (
          <text x="90" y="102" textAnchor="middle" fill="var(--text-secondary)" fontSize="10">
            / 100
          </text>
        )}
      </svg>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 2 }}>
        {score == null ? 'No data' : `${daysTraded} trading day${daysTraded === 1 ? '' : 's'}`}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Main component                                                            */
/* ────────────────────────────────────────────────────────────────────────── */
function ChallengeDashboard() {
  const { setActiveChallengeAccountId, user } = useOutletContext();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedUpiId, setCopiedUpiId] = useState('');
  const [equityMode, setEquityMode] = useState('absolute'); // 'absolute' | 'change'
  const [showObjectivesOnChart, setShowObjectivesOnChart] = useState(true);
  const [journalTab, setJournalTab] = useState('calendar'); // calendar | closed | charts
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // FUNDED-account profit withdrawal flow.
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({ upiId: '', holderName: '', note: '' });
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState(null);

  // FAILED-account paid reset flow (pay 50% fee → admin approves → account restarts).
  const [resetOpen, setResetOpen] = useState(false);
  const [resetInfo, setResetInfo] = useState(null); // { resetFee, fundSize, pendingRequest }
  const [resetUpiList, setResetUpiList] = useState([]);
  const [resetSelectedUpi, setResetSelectedUpi] = useState('');
  const [resetForm, setResetForm] = useState({ transactionRef: '', screenshotBase64: '', note: '' });
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState(null);
  const [resetQrPreview, setResetQrPreview] = useState(null);
  const [resetPending, setResetPending] = useState(false); // a reset request is awaiting admin approval
  const [resetUsed, setResetUsed] = useState(false); // one-time reset already consumed → hide button, offer new challenge
  const resetLabelStyle = { display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 700 };
  const resetInputStyle = { width: '100%', padding: '11px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' };

  const submitWithdrawProfit = async () => {
    setWithdrawMsg(null);
    if (!withdrawForm.upiId.trim()) { setWithdrawMsg({ type: 'err', text: 'UPI ID required' }); return; }
    if (!withdrawForm.holderName.trim()) { setWithdrawMsg({ type: 'err', text: 'Holder name required' }); return; }
    setWithdrawBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/prop/withdraw`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          challengeAccountId: id,
          upiId: withdrawForm.upiId.trim(),
          holderName: withdrawForm.holderName.trim(),
          note: withdrawForm.note.trim()
        })
      });
      const d = await res.json();
      if (d.success) {
        setWithdrawMsg({ type: 'ok', text: `Request submitted. Admin will transfer ₹${Number(d.requestedAmount || 0).toFixed(2)} to your UPI.` });
        setTimeout(() => { setWithdrawOpen(false); setWithdrawForm({ upiId: '', holderName: '', note: '' }); fetchAll(); }, 1500);
      } else {
        setWithdrawMsg({ type: 'err', text: d.message || 'Failed' });
      }
    } catch (e) { setWithdrawMsg({ type: 'err', text: e.message }); }
    setWithdrawBusy(false);
  };

  // Open the reset modal — loads the 50% fee + admin UPI list in parallel.
  const openResetModal = async () => {
    setResetMsg(null);
    setResetInfo(null);
    setResetForm({ transactionRef: '', screenshotBase64: '', note: '' });
    setResetOpen(true);
    try {
      const [infoRes, upiRes] = await Promise.all([
        fetch(`${API_URL}/api/prop/account/${id}/reset-info`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/admin-payment-details`)
      ]);
      const info = await infoRes.json();
      if (info.success) { setResetInfo(info); setResetPending(!!info.pendingRequest); }
      const upi = await upiRes.json();
      if (upi.success) {
        const list = upi.upiIds || [];
        setResetUpiList(list);
        if (list.length > 0) setResetSelectedUpi(list[0]._id);
      }
    } catch (e) {
      setResetMsg({ type: 'err', text: 'Could not load reset details' });
    }
  };

  const handleResetScreenshot = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setResetMsg({ type: 'err', text: 'Screenshot too large (max 25 MB)' }); return; }
    try {
      const compressed = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
      setResetForm(p => ({ ...p, screenshotBase64: compressed }));
    } catch (err) { setResetMsg({ type: 'err', text: err?.message || 'Could not process image' }); }
  };

  const submitReset = async () => {
    setResetMsg(null);
    const upi = resetUpiList.find(u => u._id === resetSelectedUpi);
    if (!upi) { setResetMsg({ type: 'err', text: 'Select a UPI to pay to' }); return; }
    if (!resetForm.transactionRef.trim()) { setResetMsg({ type: 'err', text: 'UTR / transaction reference required' }); return; }
    if (!resetForm.screenshotBase64) { setResetMsg({ type: 'err', text: 'Payment screenshot required' }); return; }
    setResetBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/prop/reset-request`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          accountId: id,
          adminUpiId: upi.upiId || upi._id,
          transactionRef: resetForm.transactionRef.trim(),
          screenshotBase64: resetForm.screenshotBase64,
          note: resetForm.note.trim()
        })
      });
      const d = await res.json();
      if (d.success) {
        setResetMsg({ type: 'ok', text: 'Reset request submitted! Your account restarts once admin verifies the payment.' });
        setResetPending(true);
        setResetInfo(prev => ({ ...(prev || {}), pendingRequest: { amount: prev?.resetFee } }));
        setTimeout(() => { setResetOpen(false); fetchAll(); }, 2200);
      } else {
        setResetMsg({ type: 'err', text: d.message || 'Failed to submit' });
      }
    } catch (e) { setResetMsg({ type: 'err', text: e.message }); }
    setResetBusy(false);
  };

  useEffect(() => {
    if (id && setActiveChallengeAccountId) setActiveChallengeAccountId(id);
  }, [id, setActiveChallengeAccountId]);

  const fetchAll = async () => {
    try {
      const [dashRes, insRes] = await Promise.all([
        fetch(`${API_URL}/api/prop/account/${id}/dashboard`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/prop/account/${id}/insights`, { headers: getAuthHeaders() })
      ]);
      const dashJson = await dashRes.json();
      const insJson = await insRes.json();
      if (dashJson?.success) setData(dashJson);
      else if (!data) navigate('/app/my-challenges');
      if (insJson?.success) setInsights(insJson);
      // For a FAILED account, learn whether a reset request is already pending
      // so the header can show "Reset Pending" without opening the modal.
      if (dashJson?.success && dashJson.account?.status === 'FAILED') {
        fetch(`${API_URL}/api/prop/account/${id}/reset-info`, { headers: getAuthHeaders() })
          .then(r => r.json())
          .then(info => {
            if (info?.success) {
              setResetPending(!!info.pendingRequest);
              // Reset is one-time — once used, hide the button entirely. (BUG 1)
              setResetUsed(!!info.resetUsed);
              // Arrived from the Reset button on My Challenges: open the popup
              // straight away, then drop the flag so a refresh doesn't reopen it.
              if (searchParams.get('reset') === '1') {
                if (!info.resetUsed) openResetModal();
                setSearchParams({}, { replace: true });
              }
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('Error loading challenge dashboard:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 12000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleCopyId = () => {
    const txt = data?.account?.accountId || '';
    if (!txt) return;
    navigator.clipboard?.writeText(txt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  const handleClosePosition = async (positionId) => {
    if (!confirm('Close this position at current market price?')) return;
    const pos = insights?.openTrades?.find(p => p.positionId === positionId);
    if (!pos) return;
    try {
      const res = await fetch(`${API_URL}/api/prop/positions/${positionId}/close`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ closePrice: Number(pos.currentPrice) || Number(pos.entryPrice) })
      });
      const result = await res.json();
      if (!result.success) alert(result.message || 'Close failed');
      else fetchAll();
    } catch {
      alert('Network error while closing position');
    }
  };

  if (loading) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
          <div>Loading dashboard…</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ width: '100%', height: '100%', overflowY: 'auto', padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p>Challenge account not found.</p>
        <button onClick={() => navigate('/app/my-challenges')}
          style={{ marginTop: 12, padding: '10px 20px', borderRadius: 8, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>
          Back to My Challenges
        </button>
      </div>
    );
  }

  const { account, challenge, rules, balance, time, funded, violations } = data;
  const overview = insights?.overview || {
    balance: balance.current, equity: balance.equity, unrealizedPnl: 0,
    todaysPnl: 0, initialBalance: balance.initial, totalPnl: 0, totalPnlPercent: 0
  };
  const objectives = insights?.objectives || [];
  const stats = insights?.stats || null;
  const consistency = insights?.consistency || { score: null, daysTraded: 0 };
  const equityCurve = insights?.equityCurve || [];
  const dailyBreakdown = insights?.dailyBreakdown || [];
  const openTrades = insights?.openTrades || [];
  const closedTrades = insights?.closedTrades || [];

  const sc = statusConfig[account.status] || statusConfig.ACTIVE;
  const createdStr = account.createdAt
    ? new Date(account.createdAt).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      }) + ' IST'
    : '';

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ padding: '16px 24px 60px', maxWidth: 1280, margin: '0 auto' }}>

        {/* ── Breadcrumb ───────────────────────────────────────────────── */}
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/app')}>Home</span>
          {' / '}
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/app/my-challenges')}>Dashboard</span>
          {' / '}
          <span style={{ color: 'var(--text-primary)' }}>{account.accountId}</span>
        </div>

        {/* ── Header card ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: '1 1 400px', minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
                {account.accountId}
              </h1>
              <button
                type="button"
                onClick={handleCopyId}
                title="Copy challenge ID"
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13
                }}
              >
                {copied ? '✓' : '⧉'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: sc.bg, color: sc.color
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: sc.dot, display: 'inline-block' }} />
                {sc.label}
              </span>
              <span style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                {account.totalPhases}-Step
              </span>
              {challenge?.challengeFee === 0 && (
                <span style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                  Free Trial
                </span>
              )}
              <span style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                Size: {formatINR(overview.initialBalance)}
              </span>
            </div>
            {createdStr && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10 }}>
                Created {createdStr}
              </div>
            )}
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Fully simulated practice environment. Place trades in Trading Room to update objectives and stats.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, position: 'relative', flexWrap: 'wrap' }}>
            {/* Reset — only on FAILED accounts that HAVEN'T used their one-time
                reset yet. Pay 50% fee to wipe trades & restart. Once a request is
                in, the button flips to a "Pending" pill. After the reset has been
                used once (resetUsed), the button disappears and we show a small
                "buy a new challenge" hint instead. (BUG 1) */}
            {account.status === 'FAILED' && !resetUsed && (
              <button
                onClick={openResetModal}
                className={resetPending ? undefined : 'pf-reset-btn'}
                title={resetPending ? 'Reset requested — awaiting admin approval' : 'Reset this failed account'}
                style={{
                  padding: '10px 22px', borderRadius: 999,
                  border: resetPending ? '1px solid rgba(245,158,11,0.5)' : 'none',
                  background: resetPending ? 'rgba(245,158,11,0.15)' : undefined,
                  color: resetPending ? '#b45309' : undefined, fontWeight: 800, fontSize: 14, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 7, letterSpacing: '0.3px'
                }}
              >
                {resetPending ? '⏳ Reset Pending' : '🔄 Reset'}
              </button>
            )}
            {account.status === 'FAILED' && resetUsed && (
              <button
                onClick={() => navigate('/app/challenges')}
                title="Reset already used once — buy a new challenge to continue"
                style={{
                  padding: '10px 22px', borderRadius: 999, border: 'none',
                  background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                  color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 7, letterSpacing: '0.3px',
                  boxShadow: '0 8px 22px rgba(37,99,235,0.35)'
                }}
              >
                🛒 Buy New Challenge
              </button>
            )}
            {(account.status === 'ACTIVE' || account.status === 'FUNDED') && (
              <button
                onClick={() => { setActiveChallengeAccountId?.(account._id || id); navigate('/app/market'); }}
                style={{
                  padding: '10px 20px', borderRadius: 999, border: 'none',
                  background: '#0f172a', color: '#fff',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8
                }}
              >
                Trading Room <span>→</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setMoreMenuOpen(m => !m)}
              style={{
                padding: '10px 16px', borderRadius: 999, border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6
              }}
            >
              ⋮ More actions
            </button>
            {moreMenuOpen && (
              <div
                onMouseLeave={() => setMoreMenuOpen(false)}
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                  borderRadius: 10, padding: 4, minWidth: 180, zIndex: 10,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.25)'
                }}
              >
                {account.status === 'FUNDED' && (
                  <button
                    onClick={() => {
                      setMoreMenuOpen(false);
                      setWithdrawForm({ upiId: '', holderName: user?.name || '', note: '' });
                      setWithdrawMsg(null);
                      setWithdrawOpen(true);
                    }}
                    style={menuItemStyle}
                  >💸 Withdraw Profit</button>
                )}
                <button
                  onClick={() => { setMoreMenuOpen(false); navigate('/app/my-challenges'); }}
                  style={menuItemStyle}
                >Back to My Challenges</button>
                <button
                  onClick={() => { setMoreMenuOpen(false); fetchAll(); }}
                  style={menuItemStyle}
                >Refresh Data</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Account Overview ────────────────────────────────────────── */}
        <SectionCard>
          <SectionLabel>ACCOUNT OVERVIEW</SectionLabel>
          {(() => {
            // On FAILED accounts, swap TODAY'S PNL for the engine's force-close
            // total. Sums All positions closedBy='challenge-failed' so the
            // multi-position case (2+ open positions when DD limit hit) shows
            // the full breach amount, not just the first one.
            const isFailed = account.status === 'FAILED';
            const breachTrades = isFailed
              ? (data.closedTrades || []).filter(p => p.closedBy === 'challenge-failed')
              : [];
            const breachTotal = breachTrades.reduce((s, p) => s + Number(p.profit || 0), 0);
            const label = breachTrades.length > 1
              ? `DD BREACH (${breachTrades.length} TRADES)`
              : 'DD BREACH LOSS';
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <StatTile label="BALANCE" value={formatINR(overview.balance)} accent={overview.balance >= overview.initialBalance ? '#10b981' : '#ef4444'} />
                <StatTile label="EQUITY" value={formatINR(overview.equity)} accent={overview.equity >= overview.initialBalance ? '#10b981' : '#ef4444'} />
                <StatTile label="UNREALIZED PNL" value={`${overview.unrealizedPnl >= 0 ? '+' : ''}${formatINR(overview.unrealizedPnl)}`} accent={overview.unrealizedPnl === 0 ? '#9ca3af' : overview.unrealizedPnl > 0 ? '#10b981' : '#ef4444'} muted={overview.unrealizedPnl === 0} />
                {isFailed && breachTrades.length > 0 ? (
                  <StatTile
                    label={label}
                    value={`${breachTotal >= 0 ? '+' : ''}${formatINR(breachTotal)}`}
                    accent="#dc2626"
                  />
                ) : (
                  <StatTile label="TODAY'S PNL" value={`${overview.todaysPnl >= 0 ? '+' : ''}${formatINR(overview.todaysPnl)}`} accent={overview.todaysPnl === 0 ? '#9ca3af' : overview.todaysPnl > 0 ? '#10b981' : '#ef4444'} muted={overview.todaysPnl === 0} />
                )}
              </div>
            );
          })()}
        </SectionCard>

        {/* ── Rollover profit banner ──────────────────────────────────── */}
        <div style={{
          padding: '14px 20px', background: 'var(--bg-secondary)',
          borderRadius: 14, border: '1px solid var(--border-color)',
          marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: '#9ca3af' }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Rollover Profit</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {account.status === 'FUNDED' ? `Profit split ${funded?.profitSplitPercent || 80}%` : 'No additional profit credited'}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            {formatINR(funded?.withdrawable || 0)}
          </div>
        </div>

        {/* ── Equity Curve ────────────────────────────────────────────── */}
        <SectionCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Equity Curve</h3>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Live account performance · IST (Asia/Kolkata)
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 0.3 }}>VIEW</span>
                <div style={{ display: 'flex', padding: 2, background: 'var(--bg-tertiary, var(--bg-primary))', borderRadius: 999, border: '1px solid var(--border-color)' }}>
                  <button onClick={() => setEquityMode('absolute')} style={toggleBtn(equityMode === 'absolute')}>
                    ₹ Absolute
                  </button>
                  <button onClick={() => setEquityMode('change')} style={toggleBtn(equityMode === 'change')}>
                    % Change
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 0.3 }}>OBJECTIVES</span>
                <button
                  onClick={() => setShowObjectivesOnChart(v => !v)}
                  aria-pressed={showObjectivesOnChart}
                  style={{
                    width: 38, height: 22, borderRadius: 999,
                    background: showObjectivesOnChart ? '#10b981' : 'var(--border-color)',
                    border: 'none', position: 'relative', cursor: 'pointer', padding: 0
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: showObjectivesOnChart ? 18 : 2,
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.18s'
                  }} />
                </button>
              </div>
            </div>
          </div>
          <EquityCurveChart
            data={equityCurve}
            initialBalance={overview.initialBalance}
            mode={equityMode}
            showObjectives={showObjectivesOnChart}
            objectives={objectives}
          />
        </SectionCard>

        {/* ── Consistency Score ───────────────────────────────────────── */}
        <SectionCard>
          <SectionLabel>CONSISTENCY SCORE</SectionLabel>
          <ConsistencyGauge score={consistency.score} daysTraded={consistency.daysTraded} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: 0.4 }}>DAYS</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                {consistency.daysTraded || '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>active</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: 0.4 }}>UPDATED</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>just now</div>
            </div>
          </div>
        </SectionCard>

        {/* ── Objectives ──────────────────────────────────────────────── */}
        <SectionCard>
          <h3 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Objectives</h3>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px', gap: 12, padding: '8px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border-color)' }}>
              <span>Evaluation Objectives</span>
              <span>Result</span>
              <span style={{ textAlign: 'right' }}>Summary</span>
            </div>
            {objectives.length === 0 && (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>No objectives configured</div>
            )}
            {objectives.map((o, i) => {
              // Display format varies by metric. Three groups:
              //   1) DD / profit-target (key in DD_KEYS): actual % is of
              //      initial balance → show ₹ amount with limit progress.
              //   2) Consistency: actual % is "best day / total profit" —
              //      NOT a balance amount. Show as raw %, not ₹.
              //   3) Min active days / max one-day cap: count or %used —
              //      already in the right form, just show actual / target.
              let resultText;
              const DD_KEYS = new Set(['max-daily-loss', 'max-loss', 'profit-target']);
              if (DD_KEYS.has(o.key) && o.unit === '%') {
                const initial = Number(overview.initialBalance) || Number(balance.initial) || 0;
                const actualNum = Number(o.actual) || 0;
                // Prefer the authoritative ₹ amount the backend computes
                // directly from today's PnL / balance vs initial (so display
                // exactly matches the BALANCE card and Daily Summary). Fall
                // back to deriving from actual % only if backend didn't
                // include it (older API response).
                const hasAuth = o.actualAmount !== undefined && o.actualAmount !== null;
                const amountSigned = hasAuth ? Number(o.actualAmount) : null;
                const actualAbs = hasAuth
                  ? Math.abs(amountSigned)
                  : (Math.abs(actualNum) * initial) / 100;
                const isLossKey = o.key === 'max-daily-loss' || o.key === 'max-loss';
                let sign;
                if (isLossKey) {
                  sign = '−';
                } else if (hasAuth) {
                  sign = amountSigned < 0 ? '−' : (amountSigned > 0 ? '+' : '');
                } else {
                  sign = actualNum < 0 ? '−' : (actualNum > 0 ? '+' : '');
                }
                // Limit-consumed: loss keys count |actual| / |target|.
                // For profit-target, only POSITIVE progress counts — a loss is
                // 0% toward the target.
                let limitConsumed;
                if (isLossKey) {
                  limitConsumed = Math.min(100, Math.round((Math.abs(actualNum) / Math.abs(Number(o.target) || 1)) * 100));
                } else {
                  const progressNum = hasAuth ? amountSigned : actualNum;
                  limitConsumed = progressNum > 0
                    ? Math.min(100, Math.round((Math.abs(actualNum) / Math.abs(Number(o.target) || 1)) * 100))
                    : 0;
                }
                resultText = (hasAuth || initial > 0)
                  ? `${sign}₹${Math.round(actualAbs).toLocaleString('en-IN')} (${limitConsumed}% of limit)`
                  : `${actualNum.toFixed(2)}% (${limitConsumed}%)`;
                // Profit Target: show how much profit was ignored by the
                // 1-day cap so the user understands why the % moved less
                // than their actual P&L card on a big-day.
                const ignored = Number(o.ignoredAmount || 0);
                if (o.key === 'profit-target' && ignored > 0) {
                  resultText += ` · ₹${Math.round(ignored).toLocaleString('en-IN')} ignored (1-day cap)`;
                }
              } else if (o.key === 'consistency') {
                // actual = best-day's % of total profit. Show raw %, no ₹.
                resultText = `${Number(o.actual).toFixed(1)}% (max ${Number(o.target).toFixed(0)}%)`;
              } else if (o.key === 'max-one-day-profit') {
                // Show actual best-day profit vs the cap directly. Reads
                // "+₹5,217 (max ₹4,000)" — far clearer than "130.4% of cap
                // used". A red ✕ on the row already signals "exceeded".
                const best = Number(o.actualAmount ?? 0);
                const cap = Number(o.limitAmount ?? 0);
                if (cap > 0) {
                  const bestStr = `₹${Math.round(best).toLocaleString('en-IN')}`;
                  const capStr = `₹${Math.round(cap).toLocaleString('en-IN')}`;
                  resultText = `+${bestStr} (max ${capStr})`;
                } else {
                  resultText = `${Number(o.actual).toFixed(1)}% of cap used`;
                }
              } else {
                // Min active days etc. — raw count.
                resultText = `${o.actual} / ${o.target}`;
              }
              return (
                <div key={o.key} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px', gap: 12, padding: '14px 4px', borderBottom: i < objectives.length - 1 ? '1px solid var(--border-color)' : 'none', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#3b82f6', fontWeight: 500 }}>{o.label}</span>
                  <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{resultText}</span>
                  <span style={{ textAlign: 'right' }}>
                    <ObjectiveIcon passed={o.passed} status={o.status} />
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: 'right', marginTop: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
            Updated {new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </SectionCard>

        {/* ── Stats Grid ──────────────────────────────────────────────── */}
        {stats && (
          <SectionCard>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <MetricTile label="Win rate" value={`${stats.winRate.toFixed(2)} %`} accent="#10b981" />
              <MetricTile label="Average profit" value={formatINR(stats.avgProfit)} accent="#10b981" />
              <MetricTile label="Average loss" value={formatINR(stats.avgLoss)} accent="#ef4444" />
              <MetricTile label="Number of positions" value={stats.numTrades} />
              <MetricTile label="Avg position duration" value={formatDuration(stats.avgDurationSec)} />
              <MetricTile label="Annualized Sharpe Ratio" value={stats.sharpe.toFixed(2)} />
              <MetricTile label="Average RRR" value={stats.avgRRR.toFixed(2)} />
              <MetricTile label="Profit factor" value={stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)} />
              <MetricTile label="Expectancy" value={formatINR(stats.expectancy)} accent={stats.expectancy >= 0 ? '#10b981' : '#ef4444'} />
            </div>
          </SectionCard>
        )}

        {/* ── Daily Summary ───────────────────────────────────────────── */}
        <SectionCard>
          <h3 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Daily Summary</h3>
          {dailyBreakdown.length === 0 ? (
            <EmptyState title="No daily activity yet" hint="Daily performance will appear here once positions are closed." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    <th style={tHeadStyle}>Date</th>
                    <th style={tHeadStyle}>Positions</th>
                    <th style={tHeadStyle}>Wins</th>
                    <th style={tHeadStyle}>Losses</th>
                    <th style={{ ...tHeadStyle, textAlign: 'right' }}>P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {[...dailyBreakdown].reverse().map(d => {
                    // Identify ALL DD-breach auto-close trades on this day —
                    // a multi-position breach (2+ open positions when limit hit)
                    // produces multiple force-closes in the same tick.
                    const breachTrades = (data.closedTrades || []).filter(p =>
                      p.closedBy === 'challenge-failed' &&
                      p.closeTime &&
                      new Date(p.closeTime).toISOString().slice(0, 10) === d.date
                    );
                    const breachPnl = breachTrades.reduce((s, p) => s + Number(p.profit || 0), 0);
                    const profitBeforeBreach = d.pnl - breachPnl;
                    return (
                      <React.Fragment key={d.date}>
                        <tr style={{ borderTop: '1px solid var(--border-color)' }}>
                          <td style={tCellStyle}>{new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                          <td style={tCellStyle}>{d.trades}</td>
                          <td style={{ ...tCellStyle, color: '#10b981' }}>{d.wins}</td>
                          <td style={{ ...tCellStyle, color: '#ef4444' }}>{d.losses}</td>
                          <td style={{ ...tCellStyle, textAlign: 'right', fontWeight: 700, color: d.pnl >= 0 ? '#10b981' : '#ef4444' }}>
                            {d.pnl >= 0 ? '+' : ''}{formatINR(d.pnl)}
                          </td>
                        </tr>
                        {breachTrades.length > 0 && (
                          <tr style={{ background: 'rgba(220,38,38,0.05)' }}>
                            <td colSpan={5} style={{ ...tCellStyle, fontSize: 11, color: '#dc2626', padding: '6px 12px' }}>
                              🚨 Includes DD-breach force-close{breachTrades.length > 1 ? `s (${breachTrades.length} positions)` : ''}:{' '}
                              <strong>{breachPnl >= 0 ? '+' : ''}{formatINR(breachPnl)}</strong>
                              {' '}(profit before breach: <strong>{profitBeforeBreach >= 0 ? '+' : ''}{formatINR(profitBeforeBreach)}</strong>)
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* ── Open Positions ─────────────────────────────────────────────── */}
        <SectionCard>
          <h3 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: '#10b981' }} />
            Open Positions
          </h3>
          {openTrades.length === 0 ? (
            <EmptyState title="No open positions" hint="When you open a position, it will appear here." icon="📥" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    <th style={tHeadStyle}>Symbol</th>
                    <th style={tHeadStyle}>Side</th>
                    <th style={tHeadStyle}>Vol</th>
                    <th style={tHeadStyle}>Entry</th>
                    <th style={tHeadStyle}>Current</th>
                    <th style={tHeadStyle}>S/L</th>
                    <th style={tHeadStyle}>T/P</th>
                    <th style={{ ...tHeadStyle, textAlign: 'right' }}>P&L</th>
                    <th style={tHeadStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {openTrades.map(p => {
                    const pnl = Number(p.profit) || 0;
                    return (
                      <tr key={p.positionId} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td style={{ ...tCellStyle, fontWeight: 700 }}>{p.symbol}</td>
                        <td style={{ ...tCellStyle, color: p.side === 'buy' ? '#10b981' : '#ef4444', fontWeight: 700, textTransform: 'uppercase' }}>{p.side}</td>
                        <td style={tCellStyle}>{p.volume}</td>
                        <td style={tCellStyle}>{Number(p.entryPrice).toFixed(2)}</td>
                        <td style={tCellStyle}>{Number(p.currentPrice || p.entryPrice).toFixed(2)}</td>
                        <td style={tCellStyle}>{p.stopLoss ? Number(p.stopLoss).toFixed(2) : '—'}</td>
                        <td style={tCellStyle}>{p.takeProfit ? Number(p.takeProfit).toFixed(2) : '—'}</td>
                        <td style={{ ...tCellStyle, textAlign: 'right', fontWeight: 700, color: pnl >= 0 ? '#10b981' : '#ef4444' }}>
                          {pnl >= 0 ? '+' : ''}{formatINR(pnl)}
                        </td>
                        <td style={tCellStyle}>
                          <button
                            onClick={() => handleClosePosition(p.positionId)}
                            style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                          >
                            Close
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* ── Trading Journal ─────────────────────────────────────────── */}
        <SectionCard>
          <h3 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Activity Journal</h3>
          <div style={{ display: 'inline-flex', padding: 4, background: 'var(--bg-tertiary, var(--bg-primary))', borderRadius: 999, border: '1px solid var(--border-color)', marginBottom: 14 }}>
            <button onClick={() => setJournalTab('calendar')} style={toggleBtn(journalTab === 'calendar')}>Calendar</button>
            <button onClick={() => setJournalTab('closed')} style={toggleBtn(journalTab === 'closed')}>Closed positions</button>
            <button onClick={() => setJournalTab('charts')} style={toggleBtn(journalTab === 'charts')}>Charts</button>
          </div>

          {journalTab === 'calendar' && (
            dailyBreakdown.length === 0 ? (
              <EmptyState title="No activity on the calendar" hint="Your activity timeline will appear once positions are recorded." dashed />
            ) : (
              <CalendarGrid days={dailyBreakdown} />
            )
          )}

          {journalTab === 'closed' && (
            closedTrades.length === 0 ? (
              <EmptyState title="No closed positions yet" hint="Closed positions will be listed here with realized P&L." dashed />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: 'var(--text-secondary)', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      <th style={tHeadStyle}>Closed</th>
                      <th style={tHeadStyle}>Symbol</th>
                      <th style={tHeadStyle}>Side</th>
                      <th style={tHeadStyle}>Vol</th>
                      <th style={tHeadStyle}>Entry</th>
                      <th style={tHeadStyle}>Exit</th>
                      <th style={tHeadStyle}>Reason</th>
                      <th style={{ ...tHeadStyle, textAlign: 'right' }}>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedTrades.map(p => {
                      const pnl = Number(p.profit) || 0;
                      return (
                        <tr key={p.positionId} style={{ borderTop: '1px solid var(--border-color)' }}>
                          <td style={tCellStyle}>
                            {p.closeTime ? new Date(p.closeTime).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td style={{ ...tCellStyle, fontWeight: 700 }}>{p.symbol}</td>
                          <td style={{ ...tCellStyle, color: p.side === 'buy' ? '#10b981' : '#ef4444', fontWeight: 700, textTransform: 'uppercase' }}>{p.side}</td>
                          <td style={tCellStyle}>{p.volume}</td>
                          <td style={tCellStyle}>{Number(p.entryPrice).toFixed(2)}</td>
                          <td style={tCellStyle}>{p.closePrice ? Number(p.closePrice).toFixed(2) : '—'}</td>
                          <td style={tCellStyle}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                              background: p.closedBy === 'sl' ? 'rgba(239,68,68,0.15)'
                                : p.closedBy === 'tp' ? 'rgba(16,185,129,0.15)'
                                : p.closedBy === 'stop_out' ? 'rgba(239,68,68,0.2)'
                                : p.closedBy === 'challenge-failed' ? 'rgba(220,38,38,0.25)'
                                : 'var(--bg-tertiary, var(--bg-primary))',
                              color: p.closedBy === 'sl' || p.closedBy === 'stop_out' || p.closedBy === 'challenge-failed' ? '#ef4444'
                                : p.closedBy === 'tp' ? '#10b981'
                                : 'var(--text-secondary)',
                              border: p.closedBy === 'challenge-failed' ? '1px solid #dc2626' : 'none'
                            }}>
                              {p.closedBy === 'challenge-failed'
                                ? '🔴 DD BREACH'
                                : String(p.closedBy || 'user').toUpperCase()}
                            </span>
                          </td>
                          <td style={{ ...tCellStyle, textAlign: 'right', fontWeight: 700, color: pnl >= 0 ? '#10b981' : '#ef4444' }}>
                            {pnl >= 0 ? '+' : ''}{formatINR(pnl)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {journalTab === 'charts' && (
            dailyBreakdown.length === 0 ? (
              <EmptyState title="No charts to plot yet" hint="Daily P&L chart becomes available once positions close." dashed />
            ) : (
              <DailyPnlBars days={dailyBreakdown} />
            )
          )}
        </SectionCard>

        {/* ── Why Failed? card — shown only on FAILED accounts. Lists ALL
             force-closed trades (multi-position breach: 2+ open positions
             at the breach tick all get closed in one engine cycle, each
             at its own tick mark price). */}
        {account.status === 'FAILED' && (() => {
          const breachTrades = (data.closedTrades || []).filter(p => p.closedBy === 'challenge-failed');
          const failViolation = (violations || []).find(v => v.severity === 'FAIL');
          if (breachTrades.length === 0 && !failViolation) return null;
          const breachTotal = breachTrades.reduce((s, p) => s + Number(p.profit || 0), 0);
          return (
            <SectionCard>
              <div style={{
                padding: 14, borderRadius: 10, border: '1px solid #dc2626',
                background: 'rgba(220,38,38,0.06)'
              }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: '#dc2626' }}>
                  🚨 Why this challenge failed
                </h3>
                {failViolation && (
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: breachTrades.length > 0 ? 12 : 0 }}>
                    <strong>Reason:</strong> {failViolation.description}
                  </div>
                )}
                {breachTrades.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <div style={{ marginBottom: 8 }}>
                      {breachTrades.length === 1
                        ? <>Your open <strong>{breachTrades[0].symbol}</strong> position was auto-closed
                            by the engine at the exact tick when intraday equity crossed the DD limit.</>
                        : <>The engine auto-closed <strong>{breachTrades.length} open positions</strong>{' '}
                            simultaneously at the tick when intraday equity crossed the DD limit. Each
                            position was closed at its own tick mark price (no recovered LTPs).</>}
                    </div>
                    {breachTrades.map((bt, i) => {
                      const pnl = Number(bt.profit || 0);
                      return (
                        <div key={bt.positionId || i} style={{
                          marginTop: 8, padding: '8px 10px', borderRadius: 6,
                          background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)'
                        }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                            {bt.symbol} <span style={{ fontSize: 10, color: bt.side === 'buy' ? '#10b981' : '#ef4444', textTransform: 'uppercase' }}>{bt.side}</span> · {bt.volume} lot
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, fontSize: 11 }}>
                            <div>Entry: <strong style={{ color: 'var(--text-primary)' }}>{Number(bt.entryPrice).toFixed(2)}</strong></div>
                            <div>Force-close: <strong style={{ color: 'var(--text-primary)' }}>{Number(bt.closePrice).toFixed(2)}</strong></div>
                            <div>Realised: <strong style={{ color: pnl >= 0 ? '#10b981' : '#ef4444' }}>{pnl >= 0 ? '+' : ''}{formatINR(pnl)}</strong></div>
                            <div>At: <strong style={{ color: 'var(--text-primary)' }}>{bt.closeTime ? new Date(bt.closeTime).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</strong></div>
                          </div>
                        </div>
                      );
                    })}
                    {breachTrades.length > 1 && (
                      <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: 'rgba(220,38,38,0.1)', fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
                        Total force-close loss: {breachTotal >= 0 ? '+' : ''}{formatINR(breachTotal)}
                      </div>
                    )}
                    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: 'rgba(220,38,38,0.08)', fontSize: 11 }}>
                      Note: Daily DD measures peak intraday equity dip (realised + floating), not
                      just end-of-day P&L. Even if other trades that day were profitable, open
                      positions with deep unrealised loss can trigger the limit.
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          );
        })()}

        {/* ── Violations (kept minimal) ──────────────────────────────── */}
        {violations?.length > 0 && (
          <SectionCard>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: '#ef4444' }}>⚠️ Violations ({violations.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {violations.map((v, i) => (
                <div key={i} style={{
                  padding: '8px 12px', borderRadius: 8, fontSize: 12,
                  background: v.severity === 'FAIL' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                  color: v.severity === 'FAIL' ? '#ef4444' : '#f59e0b'
                }}>
                  <strong>{v.rule}</strong>: {v.description}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Time remaining footnote */}
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 4 }}>
          {account.status === 'ACTIVE'
            ? `${time?.remainingDays ?? 0} day${(time?.remainingDays ?? 0) === 1 ? '' : 's'} remaining`
            : account.status === 'FUNDED'
              ? `Funded account · ${funded?.profitSplitPercent || 80}% profit split`
              : `Account ${sc.label.toLowerCase()}`}
        </div>
      </div>

      {/* ── Withdraw Profit modal (FUNDED accounts) ─────────────────── */}
      {withdrawOpen && (
        <div
          onClick={() => !withdrawBusy && setWithdrawOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
              borderRadius: 14, width: '100%', maxWidth: 460, padding: 22,
              color: 'var(--text-primary)'
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>💸 Withdraw Profit</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Profit split: <strong>{funded?.profitSplitPercent || 80}%</strong> · Available profit: <strong>{formatINR(Math.max(0, (Number(account.walletBalance) || Number(account.currentBalance) || 0) - Number(account.initialBalance || 0)))}</strong>
              <br />Admin will transfer the payout amount to the UPI ID below.
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>UPI ID *</label>
              <input
                type="text"
                value={withdrawForm.upiId}
                onChange={(e) => setWithdrawForm(p => ({ ...p, upiId: e.target.value }))}
                placeholder="yourname@upi"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>Account Holder Name *</label>
              <input
                type="text"
                value={withdrawForm.holderName}
                onChange={(e) => setWithdrawForm(p => ({ ...p, holderName: e.target.value }))}
                placeholder="As per UPI account"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>Note (optional)</label>
              <textarea
                value={withdrawForm.note}
                onChange={(e) => setWithdrawForm(p => ({ ...p, note: e.target.value }))}
                style={{ width: '100%', minHeight: 50, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }}
              />
            </div>

            {withdrawMsg && (
              <div style={{
                padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13,
                background: withdrawMsg.type === 'err' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                border: `1px solid ${withdrawMsg.type === 'err' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                color: withdrawMsg.type === 'err' ? '#ef4444' : '#10b981'
              }}>{withdrawMsg.text}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setWithdrawOpen(false)}
                disabled={withdrawBusy}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)', cursor: withdrawBusy ? 'not-allowed' : 'pointer',
                  fontWeight: 600
                }}
              >Cancel</button>
              <button
                onClick={submitWithdrawProfit}
                disabled={withdrawBusy}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  background: '#10b981', color: '#fff', border: 'none',
                  cursor: withdrawBusy ? 'not-allowed' : 'pointer', fontWeight: 700
                }}
              >{withdrawBusy ? 'Submitting…' : 'Request Withdrawal'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Challenge modal (FAILED accounts) ─────────────────────── */}
      {resetOpen && (
        <div
          onClick={() => !resetBusy && setResetOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
              borderRadius: 16, width: '100%', maxWidth: 460, padding: 22, color: 'var(--text-primary)',
              maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
              animation: 'pf-reset-pop 0.22s ease'
            }}
          >
            <style>{'@keyframes pf-reset-pop{from{opacity:0;transform:translateY(12px) scale(0.98)}to{opacity:1;transform:none}}'}</style>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>🔄 Reset Challenge</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Pay <strong>50% of the challenge fee</strong> to wipe all positions and restart this account fresh with 0 positions. Your account restarts only after admin verifies the payment.
            </div>

            {resetInfo?.pendingRequest ? (
              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', textAlign: 'center' }}>
                <div style={{ fontSize: 30, marginBottom: 6 }}>⏳</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Reset request already submitted</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>
                  ₹{Number(resetInfo.pendingRequest.amount || 0).toLocaleString('en-IN')} · awaiting admin approval. You can continue again the moment it's verified.
                </div>
              </div>
            ) : (
              <>
                {/* Reset fee highlight */}
                <div style={{
                  padding: 16, borderRadius: 14, textAlign: 'center', marginBottom: 16,
                  background: 'linear-gradient(135deg, #fff1f2 0%, #ffedd5 100%)', border: '2px dashed #f97316'
                }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: '#c2410c', textTransform: 'uppercase' }}>Reset Fee · 50%</div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: '#dc2626', marginTop: 4 }}>
                    ₹ {Number(resetInfo?.resetFee || 0).toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 11, color: '#9a3412', marginTop: 2 }}>
                    on your {formatINRCompact(resetInfo?.fundSize || account.initialBalance)} account
                  </div>
                </div>

                {/* UPI to pay */}
                <label style={resetLabelStyle}>Pay to UPI *</label>
                {resetUpiList.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>No payment UPI configured. Please contact support.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {resetUpiList.map(u => {
                      const amount = Number(resetInfo?.resetFee || 0);
                      // Prefer the admin's uploaded QR; otherwise build a UPI
                      // deep-link QR with the payee + reset fee pre-filled.
                      const upiDeepLink = `upi://pay?pa=${encodeURIComponent(u.upiId)}&pn=${encodeURIComponent(u.name || 'DhanFunded')}&am=${amount}&cu=INR`;
                      // Locally drawn when the admin has not uploaded one — no
                      // third-party request on the payment path.
                      const qrSrc = u.qrImage || null;
                      const sel = resetSelectedUpi === u._id;
                      return (
                        <div
                          key={u._id}
                          onClick={() => setResetSelectedUpi(u._id)}
                          style={{
                            padding: 12, borderRadius: 10, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 12,
                            background: sel ? 'rgba(59,130,246,0.08)' : 'var(--bg-primary)',
                            border: `1.5px solid ${sel ? '#3b82f6' : 'var(--border-color)'}`
                          }}
                        >
                          {qrSrc ? (
                            <img
                              src={qrSrc}
                              alt="Pay QR"
                              onClick={(e) => { e.stopPropagation(); setResetQrPreview(qrSrc); }}
                              style={{ width: 74, height: 74, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border-color)', background: '#fff', cursor: 'zoom-in', flexShrink: 0 }}
                            />
                          ) : (
                            <span onClick={(e) => { e.stopPropagation(); setResetQrPreview(upiDeepLink); }} style={{ cursor: 'zoom-in', lineHeight: 0, flexShrink: 0 }}>
                              <UpiQr value={upiDeepLink} size={74} style={{ border: '1px solid var(--border-color)' }} />
                            </span>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, wordBreak: 'break-all' }}>{u.upiId}</div>
                            {(u.label || u.name) && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.label || u.name}</div>}
                            <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard?.writeText(u.upiId);
                                  setCopiedUpiId(u._id);
                                  setTimeout(() => setCopiedUpiId((c) => (c === u._id ? '' : c)), 2000);
                                }}
                                aria-label={copiedUpiId === u._id ? 'UPI ID copied' : `Copy UPI ID ${u.upiId}`}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                  minHeight: 38, padding: '0 14px', fontSize: 13, fontWeight: 700,
                                  borderRadius: 8, cursor: 'pointer', transition: 'all .15s',
                                  border: `1px solid ${copiedUpiId === u._id ? '#16a34a' : 'var(--border-color)'}`,
                                  background: copiedUpiId === u._id ? 'rgba(22,163,74,0.10)' : 'var(--bg-tertiary)',
                                  color: copiedUpiId === u._id ? '#16a34a' : '#3b82f6',
                                }}
                              >{copiedUpiId === u._id ? '✓ Copied' : '📋 Copy UPI ID'}</button>
                              <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
                                {u.qrImage ? 'Tap QR to enlarge' : `QR · ₹${amount.toLocaleString('en-IN')} included`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* UTR */}
                <label style={resetLabelStyle}>UTR / Transaction Reference *</label>
                <input
                  type="text"
                  value={resetForm.transactionRef}
                  onChange={(e) => setResetForm(p => ({ ...p, transactionRef: e.target.value }))}
                  placeholder="12-digit UTR from your UPI app"
                  style={resetInputStyle}
                />

                {/* Screenshot */}
                <label style={{ ...resetLabelStyle, marginTop: 12 }}>Payment Screenshot *</label>
                <input type="file" accept="image/*" onChange={handleResetScreenshot} style={{ fontSize: 12, marginBottom: 8 }} />
                {resetForm.screenshotBase64 && (
                  <img src={resetForm.screenshotBase64} alt="proof" style={{ maxHeight: 120, borderRadius: 8, border: '1px solid var(--border-color)', display: 'block', marginBottom: 10 }} />
                )}

                {/* Note */}
                <label style={resetLabelStyle}>Note (optional)</label>
                <textarea
                  value={resetForm.note}
                  onChange={(e) => setResetForm(p => ({ ...p, note: e.target.value }))}
                  style={{ ...resetInputStyle, minHeight: 44 }}
                />
              </>
            )}

            {resetMsg && (
              <div style={{
                padding: '10px 12px', borderRadius: 8, margin: '12px 0', fontSize: 13,
                background: resetMsg.type === 'err' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                border: `1px solid ${resetMsg.type === 'err' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                color: resetMsg.type === 'err' ? '#ef4444' : '#10b981'
              }}>{resetMsg.text}</div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={() => setResetOpen(false)}
                disabled={resetBusy}
                style={{
                  flex: 1, padding: 13, borderRadius: 12, background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)', border: '1px solid var(--border-color)',
                  cursor: resetBusy ? 'not-allowed' : 'pointer', fontWeight: 600
                }}
              >{resetInfo?.pendingRequest ? 'Close' : 'Cancel'}</button>
              {!resetInfo?.pendingRequest && (
                <button
                  onClick={submitReset}
                  disabled={resetBusy || resetUpiList.length === 0}
                  style={{
                    flex: 1.4, padding: 13, borderRadius: 12, border: 'none', color: '#fff',
                    fontWeight: 800, fontSize: 14,
                    background: resetBusy ? 'var(--border-color)' : 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
                    boxShadow: resetBusy ? 'none' : '0 8px 20px rgba(239,68,68,0.35)',
                    cursor: (resetBusy || resetUpiList.length === 0) ? 'not-allowed' : 'pointer'
                  }}
                >{resetBusy ? 'Submitting…' : `Pay ₹${Number(resetInfo?.resetFee || 0).toLocaleString('en-IN')} & Reset`}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR enlarge lightbox (opens above the reset modal) */}
      {resetQrPreview && (
        <div
          onClick={() => setResetQrPreview(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 20
          }}
        >
          {String(resetQrPreview).startsWith('upi://') ? (
            <span onClick={(e) => e.stopPropagation()} style={{ lineHeight: 0, background: '#fff', padding: 12, borderRadius: 12 }}>
              <UpiQr value={resetQrPreview} size={Math.min(320, Math.round(window.innerWidth * 0.8))} />
            </span>
          ) : (
            <img
              src={resetQrPreview}
              alt="Payment QR"
              style={{ width: 'min(320px, 80vw)', height: 'auto', borderRadius: 12, background: '#fff', padding: 12 }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Reusable pieces ─────────────────────────────────────────────────────── */

function SectionCard({ children }) {
  return (
    <div style={{
      padding: 20, background: 'var(--bg-secondary)',
      borderRadius: 14, border: '1px solid var(--border-color)',
      marginBottom: 16
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function StatTile({ label, value, accent = 'var(--text-primary)', muted = false }) {
  return (
    <div style={{
      padding: '14px 16px', background: 'var(--bg-tertiary, var(--bg-primary))',
      borderRadius: 12, border: '1px solid var(--border-color)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.4 }}>
          {label}
        </span>
        <span style={{ width: 24, height: 3, borderRadius: 2, background: muted ? 'var(--border-color)' : accent }} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent, letterSpacing: '-0.3px' }}>{value}</div>
    </div>
  );
}

function MetricTile({ label, value, accent = 'var(--text-primary)' }) {
  return (
    <div style={{
      padding: '14px 16px', background: 'var(--bg-tertiary, var(--bg-primary))',
      borderRadius: 12, border: '1px solid var(--border-color)'
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label} <span style={{ fontSize: 10, opacity: 0.5 }}>ⓘ</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent }}>{value}</div>
    </div>
  );
}

function ObjectiveIcon({ passed, status }) {
  // Prefer the new 3-state `status` field (passed | failed | pending).
  // Fall back to the legacy boolean `passed` for older payloads.
  const effective = status || (passed ? 'passed' : 'failed');

  if (effective === 'pending') {
    // Grey dash — "no data yet, will be evaluated as you participate".
    return (
      <span title="Awaiting activity — will evaluate as you participate" style={{
        display: 'inline-flex', width: 22, height: 22, borderRadius: '50%',
        border: '1.5px solid var(--text-secondary, #9ca3af)', color: 'var(--text-secondary, #9ca3af)',
        alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700
      }}>–</span>
    );
  }
  if (effective === 'passed') {
    return (
      <span style={{
        display: 'inline-flex', width: 22, height: 22, borderRadius: '50%',
        border: '1.5px solid #10b981', color: '#10b981',
        alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700
      }}>✓</span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', width: 22, height: 22, borderRadius: '50%',
      border: '1.5px solid #ef4444', color: '#ef4444',
      alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700
    }}>✕</span>
  );
}

function EmptyState({ title, hint, icon = '📥', dashed = false }) {
  return (
    <div style={{
      padding: '32px 20px', textAlign: 'center',
      background: 'var(--bg-tertiary, var(--bg-primary))',
      borderRadius: 12, border: dashed ? '1px dashed var(--border-color)' : '1px solid var(--border-color)'
    }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{hint}</div>
    </div>
  );
}

/* Compact 7-day-wide calendar heatmap of closed-trade PnL */
function CalendarGrid({ days }) {
  const maxAbs = Math.max(...days.map(d => Math.abs(d.pnl)), 1);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
      {days.map(d => {
        const intensity = Math.min(1, Math.abs(d.pnl) / maxAbs);
        const bg = d.pnl > 0
          ? `rgba(16,185,129,${0.15 + intensity * 0.45})`
          : d.pnl < 0
            ? `rgba(239,68,68,${0.15 + intensity * 0.45})`
            : 'var(--bg-tertiary, var(--bg-primary))';
        return (
          <div key={d.date} style={{
            padding: 10, borderRadius: 8, background: bg,
            border: '1px solid var(--border-color)',
            minHeight: 68, display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              {new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: d.pnl > 0 ? '#10b981' : d.pnl < 0 ? '#ef4444' : 'var(--text-secondary)' }}>
              {d.pnl === 0 ? '—' : `${d.pnl >= 0 ? '+' : ''}${formatINRCompact(d.pnl)}`}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{d.trades} position{d.trades === 1 ? '' : 's'}</div>
          </div>
        );
      })}
    </div>
  );
}

function DailyPnlBars({ days }) {
  const max = Math.max(...days.map(d => Math.abs(d.pnl)), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 200, padding: '0 4px', borderBottom: '1px solid var(--border-color)' }}>
      {days.map(d => {
        const pct = Math.abs(d.pnl) / max;
        const h = Math.max(2, pct * 180);
        return (
          <div key={d.date} title={`${d.date} · ${d.pnl >= 0 ? '+' : ''}${formatINR(d.pnl)}`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 20 }}>
            <div style={{
              width: '100%', maxWidth: 36, height: h,
              background: d.pnl >= 0 ? '#10b981' : '#ef4444',
              borderRadius: '4px 4px 0 0', opacity: 0.85
            }} />
            <div style={{ fontSize: 9, color: 'var(--text-secondary)', writingMode: 'horizontal-tb' }}>
              {new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Small style helpers */
const menuItemStyle = {
  display: 'block', width: '100%', padding: '10px 14px', border: 'none',
  background: 'transparent', color: 'var(--text-primary)', textAlign: 'left',
  borderRadius: 6, cursor: 'pointer', fontSize: 13
};
const toggleBtn = (active) => ({
  padding: '5px 12px', borderRadius: 999, border: 'none',
  background: active ? 'var(--bg-primary)' : 'transparent',
  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  fontWeight: 600, fontSize: 12, cursor: 'pointer',
  boxShadow: active ? '0 1px 4px rgba(0,0,0,0.15)' : 'none'
});
const tHeadStyle = { padding: '10px 8px', borderBottom: '1px solid var(--border-color)', fontWeight: 600 };
const tCellStyle = { padding: '12px 8px', color: 'var(--text-primary)' };

export default ChallengeDashboard;
