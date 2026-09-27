import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  LuTrophy, LuWallet, LuClock, LuCheck, LuUsers, LuChartColumn, LuLandmark,
  LuTarget, LuTrendingUp, LuArrowRight, LuBookOpen, LuInfo, LuZap,
  LuLock, LuClipboardList, LuX, LuBanknote,
} from 'react-icons/lu';
import { compressImage } from '../../../utils/compressImage';
import './PassedChallenges.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authData.token || ''}`
  };
}

const fmtINR = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The reference tucks a faint mark into each stat card and runs a candle line
// under the empty state. Inline SVG keeps both crisp and costs no request.
const STAT_ART = {
  users: (
    <svg width="96" height="60" viewBox="0 0 96 60" fill="none"><circle cx="40" cy="20" r="11" fill="#2563EB" /><path d="M20 56c0-11 9-19 20-19s20 8 20 19z" fill="#2563EB" /><circle cx="66" cy="26" r="8" fill="#60A5FA" /><path d="M52 56c0-8 6-14 14-14s14 6 14 14z" fill="#60A5FA" /></svg>
  ),
  chart: (
    <svg width="104" height="56" viewBox="0 0 104 56" fill="none"><path d="M4 46L26 30l16 10 20-24 18 12 18-20" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 46L26 30l16 10 20-24 18 12 18-20V56H4z" fill="#059669" fillOpacity="0.25" /></svg>
  ),
  wallet: (
    <svg width="92" height="60" viewBox="0 0 92 60" fill="none"><rect x="10" y="16" width="66" height="42" rx="9" fill="#7C3AED" /><rect x="52" y="30" width="34" height="15" rx="7" fill="#A78BFA" /><circle cx="64" cy="37.5" r="4" fill="#7C3AED" /></svg>
  ),
  bank: (
    <svg width="92" height="58" viewBox="0 0 92 58" fill="none"><path d="M46 6l36 18H10z" fill="#D97706" /><rect x="18" y="28" width="8" height="22" fill="#F59E0B" /><rect x="34" y="28" width="8" height="22" fill="#F59E0B" /><rect x="50" y="28" width="8" height="22" fill="#F59E0B" /><rect x="66" y="28" width="8" height="22" fill="#F59E0B" /><rect x="10" y="52" width="72" height="6" rx="2" fill="#D97706" /></svg>
  ),
};

function EmptyCandles() {
  const bars = [
    [30, 34, 18], [58, 22, 30], [86, 40, 14], [114, 28, 24], [700, 30, 22],
    [728, 20, 32], [756, 36, 16], [784, 26, 26], [812, 34, 18],
  ];
  return (
    <svg className="pc-empty-bg" width="100%" height="86" viewBox="0 0 860 86" preserveAspectRatio="none" fill="none" role="presentation">
      <path d="M0 62c90-26 150 12 240-6s150-34 240-16 160 30 240 8v42H0z" fill="#E8F0FC" />
      {bars.map(([x, y, h], i) => (
        <rect key={i} x={x} y={y} width="7" height={h} rx="2" fill="#C9DCF6" />
      ))}
    </svg>
  );
}

// Flat line art, in the page's own palette, rather than a raster trophy.
function EmptyTrophy() {
  return (
    <svg width="186" height="120" viewBox="0 0 186 120" fill="none" role="presentation">
      <rect x="34" y="28" width="26" height="20" rx="4" fill="#DCE8FB" transform="rotate(-12 34 28)" />
      <rect x="126" y="24" width="24" height="18" rx="4" fill="#DCE8FB" transform="rotate(10 126 24)" />
      <rect x="40" y="70" width="22" height="16" rx="4" fill="#EAF1FC" transform="rotate(8 40 70)" />
      <path d="M62 30h62v22a31 31 0 0 1-62 0z" fill="#2E5FB5" />
      <path d="M62 34H50a14 14 0 0 0 14 14z" fill="#5B8AD8" />
      <path d="M124 34h12a14 14 0 0 1-14 14z" fill="#5B8AD8" />
      <rect x="85" y="80" width="16" height="12" fill="#2E5FB5" />
      <rect x="70" y="92" width="46" height="11" rx="4" fill="#1E4795" />
      <path d="M93 38l3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.5-5.4 7.6-1.1z" fill="#fff" />
      <path d="M140 46l22 12-22 12-4-11z" fill="#3E72C9" />
      <path d="M140 46l-4 13 9 3z" fill="#2E5FB5" />
      <path d="M26 60h8M30 56v8" stroke="#F2A93B" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="160" cy="88" r="4" fill="#BBD0EE" />
    </svg>
  );
}

function PassedChallengesPage() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingPayouts, setPendingPayouts] = useState({}); // { challengeAccountId: txId }
  const [payoutHistory, setPayoutHistory] = useState([]); // all user payout requests

  // Withdraw modal state
  const [withdrawAccount, setWithdrawAccount] = useState(null);
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', upiId: '', holderName: '', note: '', qrImage: '' });
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/prop/my-accounts`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        // Show funded accounts + PASSED accounts still awaiting funding. A PASSED
        // account that ALREADY has its funded account (fundedAccountId set) is
        // hidden here — otherwise it shows a confusing duplicate "awaiting
        // funding" card with its frozen evaluation balance alongside the real
        // funded account (which is where trading/withdrawals actually happen).
        const filtered = (data.accounts || []).filter(a =>
          a.status === 'FUNDED' || (a.status === 'PASSED' && !a.fundedAccountId)
        );
        setAccounts(filtered);
      }
    } catch (e) { /* ignore */ }
    // Pull payout requests so we can hide "Withdraw" button on accounts with active request
    // and show history to the user
    try {
      const r = await fetch(`${API_URL}/api/prop/my-payouts`, { headers: getAuthHeaders() });
      const d = await r.json();
      if (d.success) {
        const m = {};
        const allPayouts = d.payouts || [];
        allPayouts.forEach(p => {
          if (p.status === 'pending' && p.paymentDetails?.challengeAccountId) {
            m[String(p.paymentDetails.challengeAccountId)] = p._id;
          }
        });
        setPendingPayouts(m);
        setPayoutHistory(allPayouts);
      }
    } catch (e) { /* ignore — endpoint may not exist; we just won't show pending markers */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openWithdraw = (acc) => {
    // Use cap-adjusted withdrawable so user can't request more than the
    // 8%-per-cycle limit (engine will enforce regardless, but this aligns UI).
    const status = acc ? computePayoutStatus(acc) : null;
    const max = status ? status.cappedWithdrawable : 0;
    setWithdrawAccount(acc || { _placeholder: true });
    setWithdrawForm({
      amount: max > 0 ? String(max.toFixed(2)) : '',
      upiId: '',
      holderName: user?.name || '',
      note: '',
      qrImage: ''
    });
    setWithdrawMsg(null);
  };

  const handleQrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setWithdrawMsg({ type: 'err', text: 'QR image too large (max 25 MB)' });
      return;
    }
    try {
      const compressed = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.85 });
      setWithdrawForm(p => ({ ...p, qrImage: compressed }));
      setWithdrawMsg(null);
    } catch (err) {
      setWithdrawMsg({ type: 'err', text: err?.message || 'Could not process image — try a different file' });
    }
  };

  const submitWithdraw = async () => {
    setWithdrawMsg(null);
    const amt = Number(withdrawForm.amount);
    if (!(amt > 0)) { setWithdrawMsg({ type: 'err', text: 'Enter a valid amount' }); return; }
    // Cap validation: cannot request more than the eligible (5%-capped) amount.
    const maxW = withdrawAccount?._placeholder ? 0 : computeWithdrawable(withdrawAccount).withdrawable;
    if (!withdrawAccount?._placeholder && amt > maxW + 0.01) {
      setWithdrawMsg({ type: 'err', text: `Maximum withdrawable is ₹${maxW.toLocaleString('en-IN', { maximumFractionDigits: 2 })}. Aap isse zyada nahi nikaal sakte.` });
      return;
    }
    if (!withdrawForm.upiId.trim()) { setWithdrawMsg({ type: 'err', text: 'UPI ID required' }); return; }
    if (!withdrawForm.holderName.trim()) { setWithdrawMsg({ type: 'err', text: 'Holder name required' }); return; }
    // Placeholder account = user has no funded account yet. Show a clear
    // message instead of POSTing (would 400 from engine anyway).
    if (withdrawAccount?._placeholder) {
      setWithdrawMsg({
        type: 'err',
        text: 'You do not have any funds available for withdrawal. Please pass and fund a challenge first to request a payout.'
      });
      return;
    }
    setWithdrawBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/prop/withdraw`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          challengeAccountId: withdrawAccount._id,
          amount: amt,
          upiId: withdrawForm.upiId.trim(),
          holderName: withdrawForm.holderName.trim(),
          note: withdrawForm.note.trim(),
          qrImage: withdrawForm.qrImage || ''
        })
      });
      const d = await res.json();
      if (d.success) {
        setWithdrawMsg({ type: 'ok', text: `Withdrawal request submitted. Admin will transfer ₹${Number(d.requestedAmount || 0).toFixed(2)} to your UPI.` });
        setTimeout(() => { setWithdrawAccount(null); fetchAll(); }, 1500);
      } else {
        setWithdrawMsg({ type: 'err', text: d.message || 'Failed' });
      }
    } catch (e) { setWithdrawMsg({ type: 'err', text: e.message }); }
    setWithdrawBusy(false);
  };

  // Compute withdrawable amount for an account
  const computeWithdrawable = (acc) => {
    const fs = acc.challengeId?.fundedSettings || {};
    const initial = Number(acc.initialBalance) || 0;
    const balance = Number(acc.walletBalance || acc.currentBalance) || initial;
    const profit = Math.max(0, balance - initial);
    const splitPct = Number(acc.profitSplitPercent || 80);
    // Person's share is split% of profit, but capped at maxWithdrawalPercent%
    // of the fund size (default 5%). The modal MUST show this capped figure so
    // it matches the card's "Eligible Withdrawal (capped X%)" — previously it
    // showed the uncapped profit-split (e.g. ₹3,25,137 instead of ₹2,50,000).
    const capPct = Number(fs.maxWithdrawalPercent || 5);
    const capAmount = (initial * capPct) / 100;
    const maxShare = (profit * splitPct) / 100;
    return {
      profit,
      withdrawable: Math.min(maxShare, capAmount),
      splitPct,
      capPct,
      balance,
      initial
    };
  };

  // Compute funded-phase payout eligibility — mirrors the 5 gates the engine
  // enforces in withdrawProfit. Returns the FIRST unmet condition (in priority
  // order: pending → cooldown → age → market days → profit → consistency)
  // so the UI can show a precise reason on the locked Withdraw button.
  const computePayoutStatus = (acc) => {
    const fs = acc.challengeId?.fundedSettings || {};
    const initial = Number(acc.initialBalance) || 0;
    const balance = Number(acc.walletBalance || acc.currentBalance) || initial;
    const profitPct = initial > 0 ? ((balance - initial) / initial) * 100 : 0;
    const profit = Math.max(0, balance - initial);
    const splitPct = Number(acc.profitSplitPercent || 80);
    const capPct = Number(fs.maxWithdrawalPercent || 5);
    const capAmount = (initial * capPct) / 100;
    const maxShare = (profit * splitPct) / 100;
    const cappedWithdrawable = Math.min(maxShare, capAmount);

    // Account age (since funded)
    const fundedAt = acc.fundedAt ? new Date(acc.fundedAt) : (acc.createdAt ? new Date(acc.createdAt) : null);
    const minDays = Number(fs.minDaysSinceFundedForPayout || 14);
    const daysSinceFunded = fundedAt ? (Date.now() - fundedAt.getTime()) / 86400000 : 0;
    const daysUntilFirstPayout = Math.max(0, Math.ceil(minDays - daysSinceFunded));

    // Account lifetime (30 days)
    const lifetimeDays = Number(fs.accountLifetimeDays || 30);
    const expiresAt = acc.expiresAt ? new Date(acc.expiresAt) : (fundedAt ? new Date(fundedAt.getTime() + lifetimeDays * 86400000) : null);
    const daysToExpiry = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)) : null;

    // Market days
    const tradingDays = Array.isArray(acc.uniqueTradingDays) ? acc.uniqueTradingDays.length : 0;
    const minTradingDays = Number(fs.minTradingDaysForPayout || 5);

    // Min profit % gate
    const minProfitPct = Number(fs.minProfitPercentForPayout || 8);

    // Consistency: best day ≤ N% of total profit
    const consistencyMax = Number(fs.consistencyMaxDayPercent || 30);
    let consistencyRatio = 0;
    let consistencyOk = true;
    let bestDayPnl = 0;
    let totalDayProfit = 0;
    if (acc.dailyPnlMap && typeof acc.dailyPnlMap === 'object') {
      // dailyPnlMap returned from the API is a plain object (Map serialized).
      const entries = acc.dailyPnlMap instanceof Map
        ? Array.from(acc.dailyPnlMap.entries())
        : Object.entries(acc.dailyPnlMap);
      for (const [, pnl] of entries) {
        const v = Number(pnl) || 0;
        if (v > 0) {
          totalDayProfit += v;
          if (v > bestDayPnl) bestDayPnl = v;
        }
      }
      if (totalDayProfit > 0) {
        consistencyRatio = (bestDayPnl / totalDayProfit) * 100;
        consistencyOk = consistencyRatio <= consistencyMax;
      }
    }

    // Cooldown since last payout (14 days default)
    const cooldownDays = Number(fs.withdrawalFrequencyDays || 14);
    const lastWdAt = acc.lastWithdrawalDate ? new Date(acc.lastWithdrawalDate).getTime() : null;
    const cooldownRemaining = lastWdAt
      ? Math.max(0, Math.ceil(cooldownDays - (Date.now() - lastWdAt) / 86400000))
      : 0;

    const hasPending = !!pendingPayouts[String(acc._id)];

    // Gate evaluation in priority order
    let eligible = true;
    let lockReason = null;
    let lockKind = null; // 'pending' | 'cooldown' | 'age' | 'trading' | 'profit' | 'consistency'

    if (hasPending) {
      eligible = false; lockKind = 'pending';
      lockReason = 'Payout pending admin approval';
    } else if (cooldownRemaining > 0) {
      eligible = false; lockKind = 'cooldown';
      lockReason = `Next payout in ${cooldownRemaining} day${cooldownRemaining === 1 ? '' : 's'}`;
    } else if (daysUntilFirstPayout > 0) {
      eligible = false; lockKind = 'age';
      lockReason = `${daysUntilFirstPayout} more day${daysUntilFirstPayout === 1 ? '' : 's'} until first payout`;
    } else if (tradingDays < minTradingDays) {
      eligible = false; lockKind = 'trading';
      lockReason = `Need ${minTradingDays - tradingDays} more active day${(minTradingDays - tradingDays) === 1 ? '' : 's'}`;
    } else if (profitPct < minProfitPct) {
      eligible = false; lockKind = 'profit';
      lockReason = `Reach ${minProfitPct}% profit (you're at ${profitPct.toFixed(2)}%)`;
    } else if (!consistencyOk) {
      eligible = false; lockKind = 'consistency';
      lockReason = `Best day too concentrated (${consistencyRatio.toFixed(0)}% of total; max ${consistencyMax}%)`;
    } else if (profit <= 0) {
      eligible = false; lockKind = 'profit';
      lockReason = 'No profit yet — keep trading';
    }

    return {
      eligible,
      lockReason,
      lockKind,
      daysSinceFunded: Math.floor(daysSinceFunded),
      daysUntilFirstPayout,
      daysToExpiry,
      lifetimeDays,
      minDays,
      tradingDays,
      minTradingDays,
      profitPct,
      minProfitPct,
      consistencyRatio,
      consistencyMax,
      consistencyOk,
      cooldownRemaining,
      cappedWithdrawable,
      capPct,
      capAmount,
      hasPending,
      profit,
      splitPct,
      balance,
      initial
    };
  };

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading passed challenges…</div>;
  }

  const fundedAccs = accounts.filter(a => a.status === 'FUNDED');
  const awaitingCount = accounts.filter(a => a.status === 'PASSED').length;
  const totalProfit = fundedAccs.reduce((sum, a) => sum + computePayoutStatus(a).profit, 0);
  const totalWithdrawn = accounts.reduce((sum, a) => sum + (Number(a.totalWithdrawn) || 0), 0);
  const eligibleCount = fundedAccs.filter(a => computePayoutStatus(a).eligible).length;
  const payoutReady = fundedAccs.reduce((sum, a) => {
    const st = computePayoutStatus(a);
    return sum + (st.eligible ? st.cappedWithdrawable : 0);
  }, 0);
  const fundedBase = fundedAccs.reduce((sum, a) => sum + Number(a.initialBalance || 0), 0);
  const profitPct = fundedBase > 0 ? (totalProfit / fundedBase) * 100 : 0;

  // Where the user actually stands, so the stepper reflects the account rather
  // than always sitting on step 1.
  const stage = totalWithdrawn > 0 ? 4 : eligibleCount > 0 ? 3 : fundedAccs.length > 0 ? 2 : 1;

  const STEPS = ['Evaluation', 'Get Funded', 'Trade & Profit', 'Request Payout'];
  const HOW = [
    ['Pass an Evaluation', 'Complete the challenge as per rules and get a funded account.'],
    ['Trade & Earn Profit', 'Trade on your funded account and generate eligible profits.'],
    ['Request Withdrawal', 'Once eligible, request your payout directly to your UPI or bank account.'],
  ];

  const STAT_CARDS = [
    { key: 'funded', chip: '#EEF4FF', fg: '#2563EB', Icon: LuUsers, label: 'Funded Accounts',
      value: String(fundedAccs.length), sub: `${awaitingCount} active funded accounts`, art: STAT_ART.users },
    { key: 'profit', chip: '#E9F9F1', fg: '#059669', Icon: LuChartColumn, label: 'Total Profit',
      value: fmtINR(totalProfit), sub: 'Across all funded accounts', art: STAT_ART.chart,
      badge: `${profitPct.toFixed(0)}%` },
    { key: 'eligible', chip: '#F4EDFE', fg: '#7C3AED', Icon: LuWallet, label: 'Eligible for Payout',
      value: String(eligibleCount), sub: 'Meets all funded phase rules', art: STAT_ART.wallet },
    { key: 'drawn', chip: '#FFF7E8', fg: '#D97706', Icon: LuLandmark, label: 'Already Withdrawn',
      value: fmtINR(totalWithdrawn), sub: 'Total amount withdrawn', art: STAT_ART.bank },
  ];

  return (
    <div className="pc-root">
      <div className="pc-wrap">

        <div className="pc-crumb">Home / <b>Passed Challenges</b></div>

        <div className="pc-head">
          <div className="pc-head-left">
            <span className="pc-chip pc-head-chip"><LuTrophy size={22} /></span>
            <div>
              <h1>Passed Challenges</h1>
              <p>Your funded accounts, profits and withdrawal status. Trade your skills and earn real rewards.</p>
            </div>
          </div>
          <div className="pc-banner">
            <span className="pc-chip pc-banner-chip"><LuTrendingUp size={18} /></span>
            <div>
              <div className="pc-banner-t">Complete an evaluation challenge</div>
              <div className="pc-banner-s">Get funded and start earning real profits!</div>
            </div>
            <button className="pc-banner-go" onClick={() => navigate('/app/challenges')} aria-label="Browse challenges">
              <LuArrowRight size={17} />
            </button>
          </div>
        </div>

        <div className="pc-stats">
          {STAT_CARDS.map(c => (
            <div key={c.key} className="pc-card pc-stat">
              <span className="pc-stat-art">{c.art}</span>
              <div className="pc-stat-top">
                <span className="pc-chip pc-stat-chip" style={{ background: c.chip, color: c.fg }}>
                  <c.Icon size={17} />
                </span>
                {c.badge && <span className="pc-badge">{c.badge} <LuTrendingUp size={11} /></span>}
              </div>
              <div className="pc-stat-body">
                <div className="pc-stat-label">{c.label}</div>
                <div className="pc-stat-value">{c.value}</div>
                <div className="pc-stat-sub">{c.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="pc-row">
          <div className="pc-card">
            <div className="pc-panel-head">
              <div className="pc-panel-title">
                <span className="pc-chip pc-panel-chip" style={{ background: '#EEF4FF', color: '#2563EB' }}>
                  <LuTarget size={17} />
                </span>
                <div>
                  <div className="pc-panel-t">Funding Progress</div>
                  <div className="pc-panel-s">Complete an evaluation challenge to get a funded account</div>
                </div>
              </div>
              <button className="pc-link" onClick={() => navigate('/challenges')}>
                View Rules <LuArrowRight size={12} />
              </button>
            </div>
            <div className="pc-progress-body">
              <div className="pc-steps">
                {STEPS.map((label, i) => {
                  const n = i + 1;
                  return (
                    <div key={label} className={`pc-step${n === stage ? ' is-on' : ''}${n < stage ? ' is-done' : ''}`}>
                      <div className="pc-step-dot">{n < stage ? <LuCheck size={13} /> : n}</div>
                      <div className="pc-step-n">{n}</div>
                      <div className="pc-step-l">{label}</div>
                    </div>
                  );
                })}
              </div>
              <div className="pc-payout">
                <div className="pc-payout-top">
                  <span className="pc-chip pc-payout-chip"><LuChartColumn size={16} /></span>
                  <div>
                    <div className="pc-payout-t">Payout Ready <LuInfo size={12} /></div>
                    <div className="pc-payout-v">{fmtINR(payoutReady)}</div>
                  </div>
                </div>
                <div className="pc-payout-s">
                  {payoutReady > 0
                    ? 'Ready to withdraw from your funded account.'
                    : 'Complete a challenge to unlock withdrawals'}
                </div>
              </div>
            </div>
          </div>

          <div className="pc-card pc-how">
            <div className="pc-panel-head">
              <div className="pc-panel-title">
                <span className="pc-chip pc-panel-chip" style={{ background: '#EEF4FF', color: '#2563EB' }}>
                  <LuBookOpen size={17} />
                </span>
                <div className="pc-panel-t">How payouts work?</div>
              </div>
              <button className="pc-link" onClick={() => navigate('/how-it-works')}>
                View Details <LuArrowRight size={12} />
              </button>
            </div>
            <div className="pc-how-list">
              {HOW.map(([t, sub], i) => (
                <div key={t} className="pc-how-item">
                  <span className="pc-how-n">{i + 1}</span>
                  <div>
                    <div className="pc-how-t">{t}</div>
                    <div className="pc-how-s">{sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="pc-card pc-empty">
            <EmptyCandles />
            <div className="pc-empty-art"><EmptyTrophy /></div>
            <h3>No funded accounts yet</h3>
            <p>Pass an evaluation challenge to see it here. After passing, you can withdraw the profits directly to your UPI or bank account.</p>
            <div className="pc-empty-actions">
              <button className="pc-btn" onClick={() => navigate('/app/my-challenges')}>
                <LuTrophy size={15} /> View My Challenges <LuArrowRight size={14} />
              </button>
              <button className="pc-btn pc-btn-ghost" onClick={() => navigate('/app/challenges')}>
                <LuZap size={15} /> Start Evaluation
              </button>
            </div>
          </div>
        ) : (
          <div className="pc-cards-grid">
            {accounts.map(acc => {
              const isFunded = acc.status === 'FUNDED';
              const isPassed = acc.status === 'PASSED';
              const status = computePayoutStatus(acc);
              const {
                profit, splitPct, balance, initial,
                daysSinceFunded, daysToExpiry, minDays, lifetimeDays,
                tradingDays, minTradingDays, profitPct, minProfitPct,
                consistencyRatio, consistencyMax, consistencyOk,
                cappedWithdrawable, capPct,
                eligible, lockReason, lockKind, hasPending
              } = status;

              // Progress-bar helper
              const ProgressRow = ({ label, value, max, color, suffix, ok }) => {
                const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
                return (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>
                      <span>{label}</span>
                      <span style={{ color: ok ? '#10b981' : 'var(--text-primary)', fontWeight: 600 }}>
                        {value}{suffix || ''} / {max}{suffix || ''}
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: ok ? '#10b981' : color, transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                );
              };

              return (
                <div
                  key={acc._id}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: `2px solid ${isFunded ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.4)'}`,
                    borderRadius: 14,
                    padding: 18,
                    position: 'relative'
                  }}
                >
                  {/* Status badge */}
                  <div style={{
                    position: 'absolute', top: 14, right: 14,
                    padding: '4px 12px', borderRadius: 999,
                    background: isFunded ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                    color: isFunded ? '#f59e0b' : '#10b981',
                    fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 4
                  }}>
                    <LuCheck size={12} /> {isFunded ? 'FUNDED' : 'PASSED'}
                  </div>

                  {/* Header */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {acc.accountId}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                      {acc.challengeId?.name || 'Challenge'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Fund Size: <strong>{fmtINR(initial)}</strong> · Split: <strong>{splitPct}%</strong>
                      {isFunded && daysToExpiry != null && (
                        <> · A/c expires in <strong style={{ color: daysToExpiry < 7 ? '#ef4444' : '#f59e0b' }}>{daysToExpiry}d</strong></>
                      )}
                    </div>
                  </div>

                  {/* Balance + profit */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Current Balance</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{fmtINR(balance)}</div>
                    </div>
                    <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Profit ({profitPct.toFixed(2)}%)</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: profit > 0 ? '#10b981' : 'var(--text-secondary)', marginTop: 2 }}>{fmtINR(profit)}</div>
                    </div>
                  </div>

                  {/* Funded-phase progress bars — only on FUNDED accounts */}
                  {isFunded && (
                    <div style={{
                      padding: 12, borderRadius: 10, marginBottom: 12,
                      background: 'var(--bg-primary)', border: '1px solid var(--border-color)'
                    }}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, letterSpacing: 0.3 }}>
                        Payout Requirements
                      </div>
                      <ProgressRow
                        label="Days since funded"
                        value={daysSinceFunded}
                        max={minDays}
                        color="var(--accent-primary)"
                        suffix="d"
                        ok={daysSinceFunded >= minDays}
                      />
                      <ProgressRow
                        label="Market days"
                        value={tradingDays}
                        max={minTradingDays}
                        color="var(--accent-primary)"
                        ok={tradingDays >= minTradingDays}
                      />
                      <ProgressRow
                        label="Profit %"
                        value={profitPct.toFixed(1)}
                        max={minProfitPct}
                        color="#f59e0b"
                        suffix="%"
                        ok={profitPct >= minProfitPct}
                      />
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Consistency (best day / total)</span>
                        <span style={{ color: consistencyOk ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                          {consistencyRatio > 0 ? `${consistencyRatio.toFixed(0)}%` : '—'} / max {consistencyMax}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Eligible withdrawal amount */}
                  {isFunded && (
                    <div style={{
                      padding: 10, borderRadius: 8, marginBottom: 12,
                      background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)'
                    }}>
                      <div style={{ fontSize: 10, color: '#10b981', textTransform: 'uppercase', fontWeight: 600 }}>
                        Eligible Withdrawal (capped {capPct}%)
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
                        {fmtINR(cappedWithdrawable)}
                      </div>
                    </div>
                  )}

                  {/* Withdrawal history */}
                  {Number(acc.totalWithdrawn) > 0 && (
                    <div style={{
                      padding: 10, borderRadius: 8, marginBottom: 12,
                      background: 'rgba(0,51,102,0.06)', border: '1px solid rgba(0,51,102,0.22)',
                      fontSize: 12, color: 'var(--text-secondary)'
                    }}>
                      Withdrawn so far: <strong style={{ color: 'var(--accent-primary)' }}>{fmtINR(acc.totalWithdrawn)}</strong>
                      {acc.lastWithdrawalDate && (
                        <> · Last: {new Date(acc.lastWithdrawalDate).toLocaleDateString()}</>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => navigate(`/app/challenge/${acc._id}`)}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 8,
                        background: isFunded ? 'var(--gold)' : 'var(--bg-tertiary)',
                        color: isFunded ? '#fff' : 'var(--text-primary)',
                        border: isFunded ? 'none' : '1px solid var(--border-color)',
                        cursor: 'pointer', fontWeight: 600, fontSize: 13
                      }}
                    >{isFunded ? 'Trade' : 'View'}</button>
                    {isFunded && hasPending ? (
                      <div style={{
                        flex: 1, padding: '10px 12px', borderRadius: 8,
                        background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                        color: '#f59e0b', fontWeight: 600, fontSize: 12, textAlign: 'center',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                      }}>
                        <LuClock size={14} /> Pending approval
                      </div>
                    ) : isFunded && eligible ? (
                      <button
                        onClick={() => openWithdraw(acc)}
                        style={{
                          flex: 1, padding: '10px 12px', borderRadius: 8,
                          background: 'var(--gold)', color: 'var(--on-gold)', border: 'none',
                          cursor: 'pointer', fontWeight: 700, fontSize: 13,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5
                        }}
                      ><LuWallet size={14} /> Withdraw {fmtINR(cappedWithdrawable)}</button>
                    ) : isFunded ? (
                      <div
                        title={lockReason || 'Withdraw locked'}
                        style={{
                          flex: 1, padding: '10px 12px', borderRadius: 8,
                          background: 'rgba(156,163,175,0.1)',
                          border: '1px solid rgba(156,163,175,0.3)',
                          color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11,
                          textAlign: 'center', cursor: 'help', lineHeight: 1.3
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><LuLock size={13} /> {lockReason || 'Withdraw locked'}</span>
                      </div>
                    ) : isPassed ? (
                      <div style={{
                        flex: 1, padding: '10px 12px', borderRadius: 8,
                        background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
                        color: '#10b981', fontWeight: 600, fontSize: 12, textAlign: 'center'
                      }}>Awaiting funding</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payout History Section */}
      {payoutHistory.length > 0 && (
        <div style={{ marginTop: 24, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 18 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><LuClipboardList size={16} /> My Payout Requests</span></h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11 }}>Date</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11 }}>Amount</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11 }}>UPI</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {payoutHistory.map(p => {
                  const statusColor = p.status === 'approved' ? '#10b981' : p.status === 'rejected' ? '#ef4444' : '#f59e0b';
                  const statusBg = p.status === 'approved' ? 'rgba(16,185,129,0.1)' : p.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)';
                  return (
                    <tr key={p._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {new Date(p.createdAt).toLocaleDateString('en-IN')} {new Date(p.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {fmtINR(p.amount)}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
                        {p.withdrawalInfo?.upiDetails?.upiId || p.paymentDetails?.upiId || '-'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 6,
                          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                          background: statusBg, color: statusColor
                        }}>
                          {p.status === 'approved'
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><LuCheck size={12} /> Approved</span>
                          : p.status === 'rejected'
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><LuX size={12} /> Rejected</span>
                            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><LuClock size={12} /> Pending</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Withdraw modal */}
      {withdrawAccount && (
        <div
          onClick={() => !withdrawBusy && setWithdrawAccount(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
            overflowY: 'auto'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
              borderRadius: 14, width: '100%', maxWidth: 460, padding: 18,
              color: 'var(--text-primary)', maxHeight: '92vh', overflowY: 'auto'
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><LuBanknote size={18} /> Withdraw Profit</span></div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {withdrawAccount.accountId} · {withdrawAccount.challengeId?.name}<br />
              Maximum withdrawable: <strong style={{ color: '#10b981' }}>{fmtINR(computeWithdrawable(withdrawAccount).withdrawable)}</strong>
              <br />Admin will transfer to your UPI ID below.
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>
                Amount to withdraw (₹) *
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max={computeWithdrawable(withdrawAccount).withdrawable}
                value={withdrawForm.amount}
                onChange={(e) => {
                  // Clamp so the user can NEVER type more than the eligible
                  // (5%-capped) amount — empty allowed while editing.
                  const maxW = computeWithdrawable(withdrawAccount).withdrawable;
                  let v = e.target.value;
                  if (v !== '' && Number(v) > maxW) v = String(Number(maxW.toFixed(2)));
                  setWithdrawForm(p => ({ ...p, amount: v }));
                }}
                placeholder="e.g. 5000"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Max: <strong>{fmtINR(computeWithdrawable(withdrawAccount).withdrawable)}</strong> (capped {computeWithdrawable(withdrawAccount).capPct || 5}% of fund)
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setWithdrawForm(p => ({ ...p, amount: String(computeWithdrawable(withdrawAccount).withdrawable.toFixed(2)) }))}
                  style={{ flex: 1, padding: '5px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}
                >Withdraw all ({fmtINR(computeWithdrawable(withdrawAccount).withdrawable)})</button>
              </div>
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
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>
                UPI QR Code (optional)
              </label>
              <input type="file" accept="image/*" onChange={handleQrUpload} style={{ fontSize: 12 }} />
              {withdrawForm.qrImage && (
                <img src={withdrawForm.qrImage} alt="QR preview" style={{ marginTop: 8, maxHeight: 120, borderRadius: 6, border: '1px solid var(--border-color)' }} />
              )}
              <small style={{ color: 'var(--text-secondary)', fontSize: 10, display: 'block', marginTop: 4 }}>
                Apna UPI ka QR upload karo so admin can verify and transfer faster.
              </small>
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
                onClick={() => setWithdrawAccount(null)}
                disabled={withdrawBusy}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)', cursor: withdrawBusy ? 'not-allowed' : 'pointer',
                  fontWeight: 600
                }}
              >Cancel</button>
              <button
                onClick={submitWithdraw}
                disabled={withdrawBusy}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  background: 'var(--gold)', color: 'var(--on-gold)', border: 'none',
                  cursor: withdrawBusy ? 'not-allowed' : 'pointer', fontWeight: 700
                }}
              >{withdrawBusy ? 'Submitting…' : 'Request Withdrawal'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PassedChallengesPage;
