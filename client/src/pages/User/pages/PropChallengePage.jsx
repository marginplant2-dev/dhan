import { useState, useEffect, useMemo, Fragment } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { compressImage, base64ByteSize } from '../../../utils/compressImage';
import UpiQr from '../../../components/UpiQr';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authData.token || ''}` };
}

// Razorpay "Pay Online" toggle. Currently OFF — challenge purchases go through
// the manual UPI flow only (pay to admin UPI, upload screenshot + UTR, admin
// approves from the Challenge Buys queue). All the Razorpay code below (script
// loader, checkout handler) and the server-side routes are kept intact — flip
// this to true to bring the gateway back with no other changes needed.
const RAZORPAY_ENABLED = false;
// Cashfree online checkout. Set to false to hide the "Pay Online" button and
// fall back to manual-UPI-only (the gateway code + endpoints stay in place).
const CASHFREE_ENABLED = false;
// True when ANY automated gateway is shown — controls the "manual UPI" button's
// role (secondary pill vs full-size primary).
const GATEWAY_ON = RAZORPAY_ENABLED || CASHFREE_ENABLED;

const PROGRAMS = [
  { steps: 2, label: '2-Step', sub: 'Standard evaluation', icon: '\u2730', color: '#1a1a2e',
    phases: ['Qualifier', 'Validator', 'Rewards'],
    desc: 'Two-phase evaluation process. Pass Phase 1 and Phase 2 to receive your funded account with profit split.' },
  { steps: 1, label: '1-Step', sub: 'Single stage evaluation', icon: '\u26A1', color: '#3b82f6',
    phases: ['Qualifier', 'Rewards'],
    desc: 'Single-phase evaluation. Reach the profit target while respecting drawdown rules to get funded.' },
  { steps: 0, label: 'Instant', sub: 'Skip evaluation and get direct funded account', icon: '\u23F0', color: '#f59e0b',
    phases: ['Rewards'], isNew: true,
    desc: 'No evaluation phase. Trade a simulated funded account from day one with EOD trailing drawdown rules, starting with profit split. Complete KYC and e-sign contractor agreement from profile section before requesting payouts.' },
];

function PropChallengePage() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState([]);
  // First-paint skeleton only — we never flip back to true during
  // re-fetches. buyChallenge just patches state directly.
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);
  const [rzpBusy, setRzpBusy] = useState(false);
  const [cfBusy, setCfBusy] = useState(false);
  const [propStatus, setPropStatus] = useState({ enabled: false });
  const [myAccounts, setMyAccounts] = useState([]);
  const [activeProgram, setActiveProgram] = useState(2);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedTierIndex, setSelectedTierIndex] = useState(0);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmStage, setConfirmStage] = useState(1); // 1 = rules summary, 2 = UPI payment
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // IB coupon state — shared by the summary panel and the confirm modal.
  const [couponInput, setCouponInput] = useState('');
  const [couponState, setCouponState] = useState({ status: 'idle', applied: null, error: null });

  // Admin payment methods (UPI list + bank accounts) for the buy-request dialog.
  const [adminUpiList, setAdminUpiList] = useState([]);
  const [adminBankList, setAdminBankList] = useState([]);
  const [selectedAdminUpiId, setSelectedAdminUpiId] = useState('');
  // Sub-step inside the payment stage: 1 = Pay & Screenshot (QR + bank), 2 = Upload proof.
  const [payStep, setPayStep] = useState(1);
  const [paymentForm, setPaymentForm] = useState({ transactionRef: '', screenshotBase64: '', note: '' });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  // Lightbox for QR enlargement.
  const [qrPreview, setQrPreview] = useState(null);
  // Which UPI id was just copied — drives inline button feedback. The toast can
  // land behind the bottom nav on small screens, so the button confirms itself.
  const [copiedUpiId, setCopiedUpiId] = useState('');

  // Fetch admin's active UPI list when the payment stage opens.
  useEffect(() => {
    if (!confirmOpen || confirmStage !== 2) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin-payment-details`);
        const data = await res.json();
        if (!cancelled && data.success) {
          const list = data.upiIds || [];
          setAdminUpiList(list);
          setAdminBankList(data.bankAccounts || []);
          setPayStep(1); // always start the payment stage on the QR/pay sub-step
          if (list.length > 0 && !selectedAdminUpiId) setSelectedAdminUpiId(list[0]._id);
        }
      } catch (e) { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmOpen, confirmStage]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  // Fire all three fetches in parallel, flip loading off as soon as the
  // first one returns so the UI paints progressively. No blocking
  // full-page "Loading…" screen.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const kickedFetches = [
        fetch(`${API_URL}/api/prop/status`).then(r => r.json())
          .then(s => { if (!cancelled && s.success) setPropStatus(s); })
          .catch(() => {}),
        fetch(`${API_URL}/api/prop/challenges`).then(r => r.json())
          .then(c => { if (!cancelled && c.success) setChallenges(c.challenges); })
          .catch(() => {}),
        fetch(`${API_URL}/api/prop/my-accounts`, { headers: getAuthHeaders() }).then(r => r.json())
          .then(a => { if (!cancelled && a.success) setMyAccounts(a.accounts); })
          .catch(() => {})
      ];
      // Flip loading off as soon as challenges land (the main content);
      // the other two panels just fill in when they arrive.
      await Promise.race(kickedFetches);
      if (!cancelled) setLoading(false);
      await Promise.all(kickedFetches);
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const refetchMyAccounts = () => {
    fetch(`${API_URL}/api/prop/my-accounts`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(a => { if (a.success) setMyAccounts(a.accounts); })
      .catch(() => {});
  };

  // Load the Razorpay Checkout script once (self-contained, no bundler import).
  const loadRazorpayScript = () => new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

  // Razorpay flow: create-order (server) → Checkout → verify (server, signature).
  const payWithRazorpay = async (payable) => {
    if (!agreeTerms) { showToast('Please agree to the payment & service terms first', 'error'); return; }
    if (!selectedPlan) { showToast('Please select a plan first', 'error'); return; }
    setRzpBusy(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) { showToast('Could not load the payment gateway. Please use the UPI option.', 'error'); setRzpBusy(false); return; }

      const res = await fetch(`${API_URL}/api/prop/razorpay/create-order`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          challengeId: selectedPlan._id,
          tierIndex: selectedTierIndex,
          couponCode: couponState.applied?.code || null
        })
      });
      const data = await res.json();
      if (!data.success) { showToast(data.message || 'Could not start payment', 'error'); setRzpBusy(false); return; }
      if (data.free) { showToast('Challenge activated (free)! 🎉', 'success'); setTimeout(() => navigate('/app/my-challenges'), 1200); return; }

      const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: 'DhanFunded',
        description: `${selectedPlan.name || 'Challenge'} — ₹${Number(payable).toLocaleString('en-IN')}`,
        prefill: data.prefill || {},
        theme: { color: '#10b981' },
        handler: async (resp) => {
          try {
            const vr = await fetch(`${API_URL}/api/prop/razorpay/verify`, {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature
              })
            });
            const vd = await vr.json();
            if (vd.success) {
              showToast('Payment successful — your account is active! 🎉', 'success');
              setTimeout(() => navigate('/app/my-challenges'), 1500);
            } else {
              showToast(vd.message || 'Verification failed. If money was debited, contact support — it auto-activates via webhook.', 'error');
            }
          } catch (e) { showToast('Verification error: ' + e.message, 'error'); }
        },
        modal: { ondismiss: () => setRzpBusy(false) }
      });
      rzp.on('payment.failed', (r) => { showToast('Payment failed: ' + (r?.error?.description || 'try again'), 'error'); setRzpBusy(false); });
      rzp.open();
      setRzpBusy(false);
    } catch (e) {
      showToast('Payment error: ' + e.message, 'error');
      setRzpBusy(false);
    }
  };

  // Load the Cashfree Checkout SDK once (self-contained, no bundler import).
  const loadCashfreeScript = () => new Promise((resolve) => {
    if (window.Cashfree) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

  // Cashfree flow: create-order (server) → Checkout modal (payment_session_id) →
  // verify (server re-fetches order status). Webhook is the authoritative fallback.
  const payWithCashfree = async (payable) => {
    if (!agreeTerms) { showToast('Please agree to the payment & service terms first', 'error'); return; }
    if (!selectedPlan) { showToast('Please select a plan first', 'error'); return; }
    setCfBusy(true);
    try {
      const ok = await loadCashfreeScript();
      if (!ok) { showToast('Could not load the payment gateway. Please use the UPI option.', 'error'); setCfBusy(false); return; }

      const res = await fetch(`${API_URL}/api/prop/cashfree/create-order`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          challengeId: selectedPlan._id,
          tierIndex: selectedTierIndex,
          couponCode: couponState.applied?.code || null
        })
      });
      const data = await res.json();
      if (!data.success) { showToast(data.message || 'Could not start payment', 'error'); setCfBusy(false); return; }
      if (data.free) { showToast('Challenge activated (free)! 🎉', 'success'); setTimeout(() => navigate('/app/my-challenges'), 1200); return; }

      const cashfree = window.Cashfree({ mode: data.env === 'sandbox' ? 'sandbox' : 'production' });
      const result = await cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: '_modal' });
      if (result?.error) {
        showToast(result.error.message || 'Payment was cancelled', 'error');
        setCfBusy(false);
        return;
      }

      // Modal finished — confirm with the server (webhook is the safety net).
      const vr = await fetch(`${API_URL}/api/prop/cashfree/verify`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ cfOrderId: data.cfOrderId })
      });
      const vd = await vr.json();
      if (vd.success) {
        showToast('Payment successful — your account is active! 🎉', 'success');
        setTimeout(() => navigate('/app/my-challenges'), 1500);
      } else {
        showToast(vd.message || 'Payment received — activating shortly. Check My Challenges.', 'error');
      }
      setCfBusy(false);
    } catch (e) {
      showToast('Payment error: ' + e.message, 'error');
      setCfBusy(false);
    }
  };

  // Convert a screenshot file to a base64 data URL with client-side
  // compression. Mobile cameras produce 4-15 MB photos which break the
  // upload — compress to ~1600px / 80% JPEG so the payload stays
  // comfortably under the API limit (typical output: 200-500 KB).
  const handleScreenshotChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setPaymentError('Screenshot too large (max 25 MB)');
      return;
    }
    try {
      const compressed = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
      const sizeKb = Math.round(base64ByteSize(compressed) / 1024);
      console.log(`[ProofUpload] original=${(file.size / 1024).toFixed(0)} KB → compressed=${sizeKb} KB`);
      setPaymentForm(p => ({ ...p, screenshotBase64: compressed }));
      setPaymentError(null);
    } catch (err) {
      // Surface the real reason (HEIC / unsupported format / read error) —
      // a generic message left users retrying the same failing photo.
      setPaymentError(err?.message || 'Could not process image — try a different file');
    }
  };

  // Log buying intent (fire-and-forget) when the user opens the pay flow, so the
  // admin dashboard can follow up with people who tapped Pay but dropped off.
  const logPurchaseIntent = () => {
    try {
      if (!selectedPlan?._id) return;
      const fee = Number((couponState.applied?.finalFee != null ? couponState.applied.finalFee : selectedTier.challengeFee) || 0);
      fetch(`${API_URL}/api/prop/purchase-intent`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          challengeId: selectedPlan._id,
          tierIndex: selectedTierIndex,
          accountType: pm.label,
          challengeName: selectedPlan.name || '',
          fundSize: Number(selectedTier.fundSize || 0),
          fee,
        }),
      }).catch(() => {});
    } catch (_) { /* never blocks the buy flow */ }
  };

  const submitBuyRequest = async (id, tierIndex) => {
    setPaymentError(null);
    if (!selectedAdminUpiId) { setPaymentError('Pick a UPI option to pay'); return; }
    const upi = adminUpiList.find(u => u._id === selectedAdminUpiId);
    if (!upi) { setPaymentError('Selected UPI not found'); return; }
    if (!paymentForm.transactionRef.trim()) { setPaymentError('Transaction reference number required'); return; }
    if (!paymentForm.screenshotBase64) { setPaymentError('Payment screenshot required'); return; }

    setPaymentSubmitting(true);
    setBuying(id);
    try {
      const res = await fetch(`${API_URL}/api/prop/buy-request`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          challengeId: id,
          tierIndex: Number(tierIndex) || 0,
          couponCode: couponState.applied?.code || null,
          adminUpiId: upi.upiId,
          transactionRef: paymentForm.transactionRef.trim(),
          screenshotBase64: paymentForm.screenshotBase64,
          note: paymentForm.note.trim()
        })
      });
      const d = await res.json();
      if (d.success) {
        setSelectedId(null);
        setAgreeTerms(false);
        setCouponInput('');
        setCouponState({ status: 'idle', applied: null, error: null });
        setPaymentForm({ transactionRef: '', screenshotBase64: '', note: '' });
        setSelectedAdminUpiId('');
        setConfirmStage(1);
        setConfirmOpen(false);
        showToast(`${d.message} Check My Challenges.`, 'success');
        refetchMyAccounts();
        setTimeout(() => navigate('/app/my-challenges'), 600);
      } else {
        setPaymentError(d.message || 'Submission failed');
      }
    } catch (e) {
      setPaymentError('Network error: ' + e.message);
    }
    setPaymentSubmitting(false);
    setBuying(null);
  };

  const validateCoupon = async () => {
    const code = String(couponInput || '').trim().toUpperCase();
    if (!code) return;
    if (!selectedTier?.challengeFee) return;
    setCouponState({ status: 'checking', applied: null, error: null });
    try {
      const res = await fetch(
        `${API_URL}/api/ib/coupon/validate/${encodeURIComponent(code)}?challengeFee=${Number(selectedTier.challengeFee)}`,
        { headers: getAuthHeaders() }
      );
      const d = await res.json();
      if (d.success && d.data?.valid) {
        setCouponState({ status: 'applied', applied: d.data, error: null });
      } else {
        setCouponState({ status: 'error', applied: null, error: d.error || 'Invalid coupon' });
      }
    } catch (e) {
      setCouponState({ status: 'error', applied: null, error: 'Network error' });
    }
  };

  const clearCoupon = () => {
    setCouponInput('');
    setCouponState({ status: 'idle', applied: null, error: null });
  };

  // If user changes plan/tier after applying a coupon, re-validate against
  // the new fee (or just clear so the discount math doesn't go stale).
  useEffect(() => {
    if (couponState.applied) {
      setCouponState({ status: 'idle', applied: null, error: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedTierIndex]);

  const grouped = useMemo(() => {
    const m = {};
    challenges.forEach(c => { const k = c.stepsCount ?? 2; if (!m[k]) m[k] = []; m[k].push(c); });
    return m;
  }, [challenges]);

  const availablePrograms = PROGRAMS.filter(p => grouped[p.steps]?.length > 0);

  useEffect(() => {
    if (availablePrograms.length > 0 && !availablePrograms.find(p => p.steps === activeProgram))
      setActiveProgram(availablePrograms[0].steps);
  }, [availablePrograms]);

  const currentPlans = grouped[activeProgram] || [];
  const selectedPlan = currentPlans.find(c => c._id === selectedId);
  // Representative plan for the active program — drives the program-overview
  // stats box (Max loss / Split etc.) so it stays visible even when the user
  // hasn't selected a plan yet.
  const programPlan = currentPlans[0] || null;
  const pm = PROGRAMS.find(p => p.steps === activeProgram) || PROGRAMS[0];

  useEffect(() => {
    // Desktop (>900px, sticky sidebar): pre-select the program's Popular plan
    // so the order summary is filled in from the first paint.
    // Mobile (<=900px, the summary opens INLINE under the tapped card — see
    // the <style> block below): nothing is pre-selected, otherwise an open
    // summary would push the rest of the plans down the screen.
    // Re-runs when the challenges arrive (grouped), since on first render the
    // list is still empty.
    setAgreeTerms(false);
    const plan = (grouped[activeProgram] || [])[0];
    const desktop = typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 901px)').matches;
    if (desktop && plan) {
      const tiers = Array.isArray(plan.tiers) ? plan.tiers : [];
      const popular = tiers.findIndex(t => t.isPopular);
      setSelectedId(plan._id);
      setSelectedTierIndex(popular >= 0 ? popular : 0);
    } else {
      setSelectedId(null);
      setSelectedTierIndex(0);
    }
  }, [activeProgram, grouped]);

  // Normalize tiers for the currently-selected plan — fall back to the
  // legacy (fundSize, challengeFee) pair when the admin hasn't populated
  // the new tiers array.
  const planTiers = useMemo(() => {
    if (!selectedPlan) return [];
    if (Array.isArray(selectedPlan.tiers) && selectedPlan.tiers.length > 0) return selectedPlan.tiers;
    return [{
      fundSize: Number(selectedPlan.fundSize) || 0,
      challengeFee: Number(selectedPlan.challengeFee) || 0,
      label: '',
      isPopular: false
    }];
  }, [selectedPlan]);

  useEffect(() => {
    if (selectedTierIndex >= planTiers.length) setSelectedTierIndex(0);
  }, [planTiers.length, selectedTierIndex]);

  const selectedTier = planTiers[selectedTierIndex] || planTiers[0] || { fundSize: 0, challengeFee: 0 };

  if (loading) {
    // Shimmer-style skeleton that mirrors the real page layout so the user
    // never stares at bare "Loading…" text. Animations degrade gracefully.
    const shimmer = {
      background: 'linear-gradient(90deg, var(--bg-secondary) 0%, var(--bg-tertiary, var(--bg-primary)) 50%, var(--bg-secondary) 100%)',
      backgroundSize: '200% 100%',
      animation: 'pf-shimmer 1.2s ease-in-out infinite',
      borderRadius: '10px'
    };
    return (
      <div style={{ padding: '20px', maxWidth: 1200, margin: '0 auto' }}>
        <style>{`@keyframes pf-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {[1,2,3].map(i => <div key={i} style={{ ...shimmer, height: 64, flex: 1 }} />)}
        </div>
        <div style={{ ...shimmer, height: 88, marginBottom: 20 }} />
        <div style={{ height: 18, width: 180, ...shimmer, marginBottom: 14 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ ...shimmer, height: 140 }} />)}
        </div>
      </div>
    );
  }
  if (!propStatus.enabled) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--text-secondary)' }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🏆</div><h2 style={{ color: 'var(--text-primary)' }}>Prop Evaluation</h2><p>Challenges not available right now.</p></div></div>;

  const sty = {
    card: { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '14px' },
    statBox: { padding: '10px 16px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '120px' },
  };

  // "Secured Payments Powered by UPI | SBI" footer — self-contained wordmarks
  // (no external images) so it renders identically on every step of the pay flow.
  const securedFooter = (
    <div style={{ textAlign: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, letterSpacing: 0.3 }}>Secured Payments Powered by</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <img src="/landing/img/upi-logo.svg" alt="UPI" style={{ height: 26, width: 'auto' }} />
        <span style={{ width: 1, height: 20, background: 'var(--border-color)' }} />
        <img src="/landing/img/sbi-logo.svg" alt="SBI" style={{ height: 20, width: 'auto' }} />
      </div>
    </div>
  );

  // Summary/payment content — rendered in the desktop sidebar AND inline
  // under the tapped plan on mobile, so mobile users never scroll to pay.
  const renderSummary = () => (
              <div style={{ padding: '20px' }}>
                <h3 style={{ color: 'var(--text-primary)', margin: '0 0 14px', fontSize: '16px', fontWeight: '700' }}>Summary</h3>

                {/* Total Payable */}
                <div style={{
                  padding: '14px', borderRadius: '10px', textAlign: 'center', marginBottom: '14px',
                  background: pm.steps === 0 ? '#fef3c7' : 'rgba(59,130,246,0.06)',
                  border: pm.steps === 0 ? '1px solid #fde68a' : '1px solid rgba(59,130,246,0.12)'
                }}>
                  <div style={{ fontSize: '9px', fontWeight: '700', color: pm.steps === 0 ? '#92400e' : '#3b82f6', letterSpacing: '1px', marginBottom: '4px' }}>TOTAL PAYABLE</div>
                  {couponState.applied ? (
                    <>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'line-through' }}>
                        ₹ {Number(couponState.applied.originalFee || 0).toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '26px', fontWeight: '800', color: '#10b981' }}>
                        ₹ {Number(couponState.applied.finalFee || 0).toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '11px', color: '#10b981', marginTop: 2 }}>
                        You save ₹ {Number(couponState.applied.discountAmount || 0).toLocaleString('en-IN')} ({couponState.applied.discountPercent}% off)
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: '26px', fontWeight: '800', color: 'var(--text-primary)' }}>
                      ₹ {Number(selectedTier.challengeFee || 0).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>

                {/* Coupon input */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', letterSpacing: '0.5px', marginBottom: '4px' }}>HAVE A COUPON?</div>
                  {couponState.applied ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: '8px',
                      background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)'
                    }}>
                      <div style={{ fontSize: 12 }}>
                        <strong style={{ color: '#10b981' }}>{couponState.applied.code}</strong>
                        {couponState.applied.ibName && <span style={{ color: 'var(--text-secondary)' }}> · {couponState.applied.ibName}</span>}
                      </div>
                      <button
                        onClick={clearCoupon}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                      >Remove</button>
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => { e.preventDefault(); if (couponInput.trim() && couponState.status !== 'checking') validateCoupon(); }}
                      style={{ display: 'flex', gap: 6 }}
                    >
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        placeholder="e.g. PRAVIN24"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        autoComplete="off"
                        spellCheck={false}
                        inputMode="text"
                        enterKeyHint="done"
                        style={{
                          flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 8, minHeight: 44,
                          border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                          color: 'var(--text-primary)', fontSize: 16, textTransform: 'uppercase'
                        }}
                      />
                      <button
                        type="submit"
                        disabled={!couponInput.trim() || couponState.status === 'checking'}
                        style={{
                          padding: '10px 16px', borderRadius: 8, border: 'none', minHeight: 44,
                          background: couponInput.trim() ? '#3b82f6' : 'var(--border-color)',
                          color: '#fff', fontWeight: 700, fontSize: 13,
                          cursor: couponInput.trim() ? 'pointer' : 'not-allowed',
                          touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'
                        }}
                      >{couponState.status === 'checking' ? '…' : 'Apply'}</button>
                    </form>
                  )}
                  {couponState.error && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#ef4444' }}>❌ {couponState.error}</div>
                  )}
                </div>

                {/* Badges */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '14px' }}>
                  {['✅ Secure', '⚡ Fast', '📌 Fixed Fee'].map((b, i) => (
                    <span key={i} style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '500' }}>{b}</span>
                  ))}
                </div>

                {/* Details */}
                <div style={{ marginBottom: '14px' }}>
                  {[
                    { l: 'Selected Account', v: `₹ ${Number(selectedTier.fundSize || 0).toLocaleString('en-IN')}` },
                    { l: 'Account Type', v: pm.label },
                    { l: 'Evaluation Fee', v: `₹ ${Number(selectedTier.challengeFee || 0).toLocaleString('en-IN')}` },
                    { l: 'Currency', v: 'INR' },
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{r.l}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: '600' }}>{r.v}</span>
                    </div>
                  ))}
                </div>

                {/* Rules — compact %+₹ chips derived from the selected plan's
                    rules × fund size. Kept tight (2×2, small type) so the card
                    height barely changes. */}
                {selectedPlan?.rules && (() => {
                  const r = selectedPlan.rules || {};
                  const fundSize = Number(selectedTier.fundSize || 0);
                  const amt = (p) => Math.round(fundSize * p / 100);
                  const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
                  // Profit targets: Instant → single instant target; 1-Step → Phase 1;
                  // 2-Step → BOTH Phase 1 and Phase 2 targets.
                  const p1Pct = pm.steps === 0 ? Number(r.profitTargetInstantPercent || 0) : Number(r.profitTargetPhase1Percent || 0);
                  const p2Pct = pm.steps === 2 ? Number(r.profitTargetPhase2Percent || 0) : 0;
                  const dailyPct = Number(r.maxDailyDrawdownPercent || 0);
                  const maxPct = Number(r.maxOverallDrawdownPercent || 0);
                  const oneDayOfTarget = Number(r.maxOneDayProfitPercentOfTarget || 0);
                  const p1Amt = amt(p1Pct);

                  const profitItems = [];
                  if (p1Pct > 0) profitItems.push({ l: pm.steps === 2 ? 'Profit Target P1' : 'Profit Target', pct: p1Pct, amt: p1Amt });
                  if (p2Pct > 0) profitItems.push({ l: 'Profit Target P2', pct: p2Pct, amt: amt(p2Pct) });
                  if (oneDayOfTarget > 0 && p1Amt > 0) profitItems.push({ l: 'Max 1-Day Profit', pct: oneDayOfTarget, amt: Math.round(p1Amt * oneDayOfTarget / 100) });

                  const lossItems = [];
                  if (dailyPct > 0) lossItems.push({ l: 'Daily Loss', pct: dailyPct, amt: amt(dailyPct) });
                  if (maxPct > 0) lossItems.push({ l: 'Max Loss', pct: maxPct, amt: amt(maxPct) });

                  if (!profitItems.length && !lossItems.length) return null;

                  const chip = (it) => (
                    <div key={it.l} style={{ padding: '5px 7px', borderRadius: '7px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)' }}>
                      <div style={{ fontSize: '8px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.2px', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.l}</div>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#d97706', whiteSpace: 'nowrap' }}>{it.pct}% · {inr(it.amt)}</div>
                    </div>
                  );
                  return (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', letterSpacing: '0.5px', marginBottom: '6px' }}>RULES</div>
                      {/* LEFT column = profit rules stacked; RIGHT column = loss rules stacked. */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', alignItems: 'start' }}>
                        <div style={{ display: 'grid', gap: '6px' }}>{profitItems.map(chip)}</div>
                        <div style={{ display: 'grid', gap: '6px' }}>{lossItems.map(chip)}</div>
                      </div>
                    </div>
                  );
                })()}

                {/* Payment Options */}
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', letterSpacing: '0.5px', marginBottom: '4px' }}>PAYMENT OPTIONS</div>
                <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '16px' }}>
                  {GATEWAY_ON ? 'UPI • Card • Netbanking' : 'UPI'}
                </div>

                {/* Terms */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', marginBottom: '16px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} style={{ marginTop: '3px', accentColor: pm.color }} />
                  <span><strong style={{ color: 'var(--text-primary)' }}>I agree to the payment & service terms.</strong> This is a digital evaluation service. Fees are non-refundable except for verified payment errors. Refund benefits may apply on success as per Refund Policy.</span>
                </label>

                {(() => {
                  const payable = Number((couponState.applied?.finalFee != null ? couponState.applied.finalFee : selectedTier.challengeFee) || 0);
                  return (
                  <>
                    {/* Cashfree "Pay Online" — instant, auto-activates on success.
                        Hidden while CASHFREE_ENABLED is false. */}
                    {CASHFREE_ENABLED && (
                      <button
                        onClick={() => payWithCashfree(payable)}
                        disabled={!agreeTerms || cfBusy || buying}
                        style={{
                          width: '100%', padding: '15px', borderRadius: '12px', border: 'none', marginBottom: '10px',
                          cursor: (agreeTerms && !cfBusy && !buying) ? 'pointer' : 'not-allowed',
                          fontWeight: '800', fontSize: '16px', letterSpacing: '0.3px', color: '#fff',
                          background: agreeTerms ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'var(--border-color)',
                          boxShadow: agreeTerms ? '0 8px 20px rgba(16,185,129,0.35)' : 'none',
                          opacity: agreeTerms ? 1 : 0.5, transition: 'all 0.2s',
                          touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'
                        }}
                      >
                        {cfBusy ? 'Opening payment…' : `⚡ Pay Online  ₹ ${payable.toLocaleString('en-IN')}`}
                      </button>
                    )}

                    {/* Razorpay "Pay Online" — hidden while RAZORPAY_ENABLED is false. */}
                    {RAZORPAY_ENABLED && (
                      <button
                        onClick={() => payWithRazorpay(payable)}
                        disabled={!agreeTerms || rzpBusy || buying}
                        style={{
                          width: '100%', padding: '15px', borderRadius: '12px', border: 'none', marginBottom: '10px',
                          cursor: (agreeTerms && !rzpBusy && !buying) ? 'pointer' : 'not-allowed',
                          fontWeight: '800', fontSize: '16px', letterSpacing: '0.3px', color: '#fff',
                          background: agreeTerms ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'var(--border-color)',
                          boxShadow: agreeTerms ? '0 8px 20px rgba(16,185,129,0.35)' : 'none',
                          opacity: agreeTerms ? 1 : 0.5, transition: 'all 0.2s',
                          touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'
                        }}
                      >
                        {rzpBusy ? 'Opening payment…' : `⚡ Pay Online  ₹ ${payable.toLocaleString('en-IN')}`}
                      </button>
                    )}

                    {/* Manual UPI — pay to admin UPI, upload screenshot + UTR, admin
                        approves from the Challenge Buys queue. Becomes the primary
                        (full-size) button when no gateway is on. */}
                    <button
                      onClick={() => { logPurchaseIntent(); setConfirmStage(2); setConfirmOpen(true); }}
                      disabled={!agreeTerms || buying}
                      style={{
                        width: '100%', padding: GATEWAY_ON ? '12px' : '15px', borderRadius: '12px',
                        border: GATEWAY_ON ? '1.5px solid var(--border-color)' : 'none',
                        cursor: agreeTerms && !buying ? 'pointer' : 'not-allowed',
                        fontWeight: GATEWAY_ON ? '700' : '800',
                        fontSize: GATEWAY_ON ? '13px' : '16px',
                        letterSpacing: GATEWAY_ON ? 'normal' : '0.3px',
                        color: GATEWAY_ON ? 'var(--text-primary)' : '#fff',
                        background: GATEWAY_ON
                          ? 'transparent'
                          : (agreeTerms ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'var(--border-color)'),
                        boxShadow: (!GATEWAY_ON && agreeTerms) ? '0 8px 20px rgba(16,185,129,0.35)' : 'none',
                        opacity: agreeTerms ? 1 : 0.5, transition: 'all 0.2s',
                        touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'
                      }}
                    >
                      {buying
                        ? 'Processing...'
                        : (GATEWAY_ON
                            ? 'Or pay via UPI manually (upload screenshot)'
                            : `Pay via UPI  ₹ ${payable.toLocaleString('en-IN')}`)}
                    </button>
                  </>
                  );
                })()}

                <div style={{ textAlign: 'center', fontSize: '9px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  {CASHFREE_ENABLED
                    ? '🔒 Payments are processed securely via Cashfree'
                    : (RAZORPAY_ENABLED
                        ? '🔒 Payments are processed securely via Razorpay'
                        : '🔒 Pay to our UPI, upload the screenshot — account activates after admin verification')}
                </div>
              </div>
  );

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      <div className="prop-eval-content" style={{ padding: '24px 28px 60px' }}>
        {/* Breadcrumb */}
        <div className="se-crumb">
          Home <span aria-hidden="true">/</span> <span className="se-crumb-here">Start Evaluation</span>
        </div>

        <header className="se-head">
          <h1 className="se-title">Start Evaluation</h1>
          <p className="se-sub">Choose an evaluation path, review the rules, and complete checkout.</p>
        </header>

        {/* ===== MAIN 2-COL LAYOUT ===== */}
        <div className="prop-eval-layout" style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

          {/* ===== LEFT COLUMN ===== */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* ===== PROGRAM CARDS =====
                Selected = solid dark card with light text and pill steps, the
                rest stay white — the choice reads at a glance, like a radio. */}
            <div className="se-programs" role="radiogroup" aria-label="Evaluation program">
              {availablePrograms.map(p => {
                const active = activeProgram === p.steps;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    key={p.steps}
                    onClick={() => setActiveProgram(p.steps)}
                    className={`se-program${active ? ' is-active' : ''}`}
                  >
                    <span className="se-radio" aria-hidden="true" />
                    <span className="se-program-top">
                      <span className="se-program-icon" aria-hidden="true">{p.icon}</span>
                      <span className="se-program-text">
                        <span className="se-program-name">
                          {p.label}
                          {p.isNew && <span className="se-new">NEW</span>}
                        </span>
                        <span className="se-program-sub">{p.sub}</span>
                      </span>
                    </span>
                    <span className="se-steps">
                      {p.phases.map((ph, idx) => (
                        <Fragment key={idx}>
                          {idx > 0 && <span className="se-step-sep" aria-hidden="true">›</span>}
                          <span className="se-step">{ph}</span>
                        </Fragment>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="se-divider" />

            {/* ===== EVALUATION PLANS GRID =====
                 Each Challenge can expose several (fundSize, fee) tiers —
                 we flatten them so one card = one tier. Clicking a card
                 picks both the plan _id and the tier index, which then
                 drive the Summary panel and buy flow. */}
            <h2 className="se-h2">Evaluation Plans</h2>
            {(() => {
              const flat = [];
              currentPlans.forEach(ch => {
                const tiers = Array.isArray(ch.tiers) && ch.tiers.length > 0
                  ? ch.tiers
                  : [{ fundSize: Number(ch.fundSize) || 0, challengeFee: Number(ch.challengeFee) || 0, label: '', isPopular: false }];
                tiers.forEach((t, tIdx) => flat.push({ ch, tier: t, tierIndex: tIdx }));
              });
              return (
                <div className="prop-plans-grid se-plans">
                  {flat.map(({ ch, tier, tierIndex }) => {
                    const isSel = selectedId === ch._id && selectedTierIndex === tierIndex;
                    return (
                      <Fragment key={`${ch._id}-${tierIndex}`}>
                      <div
                        onClick={() => { setSelectedId(ch._id); setSelectedTierIndex(tierIndex); setAgreeTerms(false); }}
                        className={`se-plan${isSel ? ' is-selected' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSel}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(ch._id); setSelectedTierIndex(tierIndex); setAgreeTerms(false); } }}
                      >
                        {tier.isPopular && (
                          <div style={{
                            position: 'absolute', top: '-10px', left: '14px',
                            background: '#f59e0b', color: '#000', fontSize: '9px', fontWeight: '800',
                            padding: '2px 10px', borderRadius: '4px', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px'
                          }}>⭐ POPULAR</div>
                        )}
                        {isSel && (
                          <div style={{
                            position: 'absolute', top: '14px', right: '14px', width: '22px', height: '22px',
                            borderRadius: '50%', background: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            <span style={{ color: 'var(--bg-primary)', fontWeight: '800', fontSize: '13px' }}>✓</span>
                          </div>
                        )}
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {ch.name}{tier.label ? ` · ${tier.label}` : ''}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' }}>Balance</div>
                        <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '16px' }}>
                          ₹ {Number(tier.fundSize || 0).toLocaleString('en-IN')}
                        </div>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 14px', borderRadius: '10px',
                          background: 'var(--bg-tertiary, var(--bg-primary))', border: '1px solid var(--border-color)'
                        }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-primary)' }}>Evaluation Fee</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>One time payment</div>
                          </div>
                          <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                            ₹ {Number(tier.challengeFee || 0).toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                      {/* MOBILE: summary/payment card opens right under the tapped
                          plan so the user never has to scroll to the bottom to pay.
                          Hidden on desktop (the sticky sidebar handles it there). */}
                      {isSel && (
                        <div className="prop-summary-inline" style={{ gridColumn: '1 / -1', minWidth: 0 }}>
                          <div className="prop-summary-inline-card" style={{ ...sty.card, overflow: 'hidden', borderColor: '#3b82f6', boxShadow: '0 8px 28px rgba(59,130,246,0.18)' }}>
                            {renderSummary()}
                          </div>
                        </div>
                      )}
                      </Fragment>
                    );
                  })}
                </div>
              );
            })()}

            {/* Static info cards below the plans — Platform + Risk Rules.
                Hardcoded per product spec so the user always sees these two
                reassurance blurbs under whichever program tab they're on. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '14px 18px', borderRadius: '14px',
                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: 'var(--bg-tertiary, var(--bg-primary))',
                  color: 'var(--text-secondary)', fontSize: '16px'
                }}>🖥️</span>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>Platform</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 700 }}>DhanFunded Web Terminal</div>
                </div>
              </div>
            </div>

            {/* My Challenges Banner */}
            {myAccounts.length > 0 && (
              <div onClick={() => navigate('/app/my-challenges')} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                padding: '14px 20px', borderRadius: '14px', marginTop: '24px',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))',
                border: '1px solid rgba(99,102,241,0.12)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>📊</span>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>My Challenges</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{myAccounts.length} active account(s)</div>
                  </div>
                </div>
                <span style={{ color: '#818cf8', fontSize: '18px' }}>→</span>
              </div>
            )}
          </div>

          {/* ===== RIGHT: SUMMARY PANEL ===== */}
          {selectedPlan && (
            <div className="prop-summary-panel se-summary" style={{ ...sty.card, overflow: 'hidden' }}>
              <div className="se-summary-head">Order summary</div>
{renderSummary()}
            </div>
          )}
        </div>
      </div>

      {/* Pre-purchase confirmation modal */}
      {confirmOpen && selectedPlan && (
        <div
          onClick={() => !buying && setConfirmOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary)', color: 'var(--text-primary)',
              border: '1px solid var(--border-color)', borderRadius: 16,
              width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto',
              padding: '24px 24px 20px'
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
              {confirmStage === 1 ? 'Confirm Purchase' : `Pay ₹${Number((couponState.applied?.finalFee != null ? couponState.applied.finalFee : selectedTier.challengeFee) || 0).toLocaleString('en-IN')} via UPI`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {confirmStage === 1
                ? 'Please review the rules before continuing to payment.'
                : 'Pay using any UPI app to the admin\'s UPI ID below, then enter your transaction reference + screenshot.'}
            </div>

            {confirmStage === 1 && (<>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>FUND SIZE</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>₹ {Number(selectedTier.fundSize || 0).toLocaleString('en-IN')}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>EVALUATION FEE</div>
                {couponState.applied ? (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'line-through' }}>
                      ₹ {Number(couponState.applied.originalFee || 0).toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>
                      ₹ {Number(couponState.applied.finalFee || 0).toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: 10, color: '#10b981' }}>
                      Coupon {couponState.applied.code} · −{couponState.applied.discountPercent}%
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>₹ {Number(selectedTier.challengeFee || 0).toLocaleString('en-IN')}</div>
                )}
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.5, marginBottom: 8 }}>RULES YOU MUST FOLLOW</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
              {selectedPlan.rules?.maxDailyDrawdownPercent != null && (
                <li>Daily drawdown limit: <strong>{selectedPlan.rules.maxDailyDrawdownPercent}%</strong></li>
              )}
              {selectedPlan.rules?.maxOverallDrawdownPercent != null && (
                <li>Overall drawdown limit: <strong>{selectedPlan.rules.maxOverallDrawdownPercent}%</strong></li>
              )}
              {selectedPlan.rules?.profitTargetPhase1Percent != null && selectedPlan.stepsCount >= 1 && (
                <li>Phase 1 profit target: <strong>{selectedPlan.rules.profitTargetPhase1Percent}%</strong></li>
              )}
              {selectedPlan.rules?.profitTargetPhase2Percent != null && selectedPlan.stepsCount === 2 && (
                <li>Phase 2 profit target: <strong>{selectedPlan.rules.profitTargetPhase2Percent}%</strong></li>
              )}
              {selectedPlan.rules?.profitTargetInstantPercent != null && selectedPlan.stepsCount === 0 && (
                <li>Profit target: <strong>{selectedPlan.rules.profitTargetInstantPercent}%</strong></li>
              )}
              {selectedPlan.rules?.maxOneDayProfitPercentOfTarget != null && (
                <li>Max one-day profit: <strong>{selectedPlan.rules.maxOneDayProfitPercentOfTarget}%</strong> of target</li>
              )}
            </ul>

            {/* Instagram payout highlights CTA */}
            <a
              href="https://www.instagram.com/dhanfunded"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
                marginTop: 14, padding: '11px 14px', borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(245,133,41,0.10), rgba(221,42,123,0.10), rgba(129,52,175,0.10))',
                border: '1px solid rgba(221,42,123,0.30)'
              }}
            >
              <span style={{
                flexShrink: 0, width: 34, height: 34, borderRadius: 10,
                background: 'linear-gradient(135deg, #f58529 0%, #dd2a7b 50%, #8134af 100%)',
                display: 'grid', placeItems: 'center', color: '#fff', fontSize: 17
              }}>📸</span>
              <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.4 }}>
                Check out our <strong>Instagram highlights</strong> to see our latest payouts.
              </span>
              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: '#dd2a7b', whiteSpace: 'nowrap' }}>Follow ↗</span>
            </a>

            <div style={{
              marginTop: 12, padding: 12, background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10,
              fontSize: 12, color: '#ef4444'
            }}>
              ⚠ The evaluation fee is <strong>non-refundable</strong>. Breaching any rule above will fail the account — the fee will not be returned.
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                onClick={() => setConfirmOpen(false)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)', cursor: 'pointer',
                  fontWeight: 600
                }}
              >Cancel</button>
              <button
                onClick={() => setConfirmStage(2)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  background: '#3b82f6', color: '#fff', border: 'none',
                  cursor: 'pointer', fontWeight: 700
                }}
              >Continue to Payment →</button>
            </div>
            </>)}

            {confirmStage === 2 && (<>
              {/* Step indicator: Pay & Screenshot › Upload */}
              {/* flexWrap matters: a center-justified row that overflows clips
                  its LEFT edge with no way to scroll to it. */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {[{ n: 1, l: '📷 Pay & Screenshot' }, { n: 2, l: '⬆ Upload' }].map((s, i) => (
                  <Fragment key={s.n}>
                    {i > 0 && <span style={{ color: 'var(--text-secondary)' }}>›</span>}
                    <span style={{
                      padding: '6px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                      background: payStep === s.n ? 'rgba(59,130,246,0.12)' : 'var(--bg-tertiary)',
                      color: payStep === s.n ? '#3b82f6' : 'var(--text-secondary)',
                      border: payStep === s.n ? '1px solid rgba(59,130,246,0.35)' : '1px solid var(--border-color)'
                    }}>{s.l}</span>
                  </Fragment>
                ))}
              </div>

              {payStep === 1 && (<>
              {/* UPI list */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.5, marginBottom: 6 }}>SELECT ADMIN UPI</div>
              {adminUpiList.length === 0 ? (
                <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 12, color: '#ef4444', marginBottom: 14 }}>
                  ⚠ Admin has not set up any UPI yet. Please contact support.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {adminUpiList.map(upi => {
                    const sel = selectedAdminUpiId === upi._id;
                    // Build a UPI deep-link with the payee + amount pre-filled.
                    // Any UPI app scanning this QR will open with the
                    // recipient + amount already populated. Falls back to
                    // admin's uploaded QR image if present (preferred).
                    const amount = Number((couponState.applied?.finalFee != null ? couponState.applied.finalFee : selectedTier.challengeFee) || 0);
                    const upiDeepLink = `upi://pay?pa=${encodeURIComponent(upi.upiId)}&pn=${encodeURIComponent(upi.name || 'DhanFunded')}&am=${amount}&cu=INR`;
                    // Admin-uploaded image wins; otherwise the QR is drawn
                    // locally (see UpiQr) instead of fetched from a third party.
                    const qrSrc = upi.qrImage || null;
                    return (
                      <div
                        key={upi._id}
                        onClick={() => setSelectedAdminUpiId(upi._id)}
                        style={{
                          padding: 12, borderRadius: 10, cursor: 'pointer',
                          border: sel ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                          background: sel ? 'rgba(59,130,246,0.06)' : 'var(--bg-primary)',
                          display: 'flex', alignItems: 'center', gap: 12
                        }}
                      >
                        {qrSrc ? (
                          <img
                            src={qrSrc}
                            alt="QR"
                            onClick={(e) => { e.stopPropagation(); setQrPreview(qrSrc); }}
                            style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border-color)', cursor: 'zoom-in', background: '#fff' }}
                          />
                        ) : (
                          <span onClick={(e) => { e.stopPropagation(); setQrPreview(upiDeepLink); }} style={{ cursor: 'zoom-in', lineHeight: 0 }}>
                            <UpiQr value={upiDeepLink} size={80} style={{ border: '1px solid var(--border-color)' }} />
                          </span>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{upi.name}</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                            {upi.upiId}
                            <span
                              title="Verified UPI ID"
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 15, height: 15, borderRadius: '50%', background: '#1d9bf0',
                                color: '#fff', fontSize: 9, fontWeight: 900, flexShrink: 0
                              }}
                            >✓</span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                            {(() => {
                              const isCopied = copiedUpiId === upi._id;
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard?.writeText(upi.upiId);
                                    showToast('UPI ID copied', 'success');
                                    setCopiedUpiId(upi._id);
                                    setTimeout(() => setCopiedUpiId((c) => (c === upi._id ? '' : c)), 2000);
                                  }}
                                  aria-label={isCopied ? 'UPI ID copied' : `Copy UPI ID ${upi.upiId}`}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    minHeight: 38, padding: '0 14px', fontSize: 13, fontWeight: 700,
                                    borderRadius: 8, cursor: 'pointer', transition: 'all .15s',
                                    border: `1px solid ${isCopied ? '#16a34a' : 'var(--border-color)'}`,
                                    background: isCopied ? 'rgba(22,163,74,0.10)' : 'var(--bg-tertiary)',
                                    color: isCopied ? '#16a34a' : 'var(--text-primary)',
                                  }}
                                >{isCopied ? '✓ Copied' : '📋 Copy UPI ID'}</button>
                              );
                            })()}
                          </div>
                          {!upi.qrImage && (
                            <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 2 }}>QR auto-generated · ₹{amount} included</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Amount to send */}
              <div style={{ textAlign: 'center', margin: '4px 0 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: 0.5 }}>AMOUNT TO SEND</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>
                  ₹ {Number((couponState.applied?.finalFee != null ? couponState.applied.finalFee : selectedTier.challengeFee) || 0).toLocaleString('en-IN')}
                </div>
              </div>

              {/* Bank details — shown when admin has configured a bank account */}
              {adminBankList.length > 0 && (() => {
                const bank = adminBankList[0];
                const row = (label, value) => value ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-color)', gap: 12 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, wordBreak: 'break-all', textAlign: 'right' }}>
                      {value}
                      <button
                        onClick={() => { navigator.clipboard?.writeText(value); showToast(label + ' copied', 'success'); }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
                        title={'Copy ' + label}
                      >📋</button>
                    </span>
                  </div>
                ) : null;
                return (
                  <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.5, marginBottom: 4 }}>🏦 BANK DETAILS</div>
                    {row('Bank', bank.bankName)}
                    {row('A/C Holder', bank.accountHolder)}
                    {row('A/C Number', bank.accountNumber)}
                    {row('IFSC', bank.ifsc)}
                  </div>
                );
              })()}

              {/* Back → review · Next → upload proof */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => setConfirmStage(1)}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                >← Back</button>
                <button
                  onClick={() => setPayStep(2)}
                  disabled={adminUpiList.length === 0}
                  style={{ flex: 1.4, padding: '11px', borderRadius: 10, background: adminUpiList.length === 0 ? 'var(--border-color)' : '#3b82f6', color: '#fff', border: 'none', cursor: adminUpiList.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13 }}
                >Verify Payment</button>
              </div>

              {securedFooter}
              </>)}

              {payStep === 2 && (<>
              {/* Payment proof form */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.5, marginBottom: 6 }}>YOUR PAYMENT DETAILS</div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>Transaction Reference / UTR *</label>
                <input
                  type="text"
                  value={paymentForm.transactionRef}
                  onChange={(e) => setPaymentForm(p => ({ ...p, transactionRef: e.target.value }))}
                  placeholder="From your UPI app"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>Transaction Screenshot *</label>
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '22px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                  border: '2px dashed var(--border-color)', background: 'var(--bg-primary)'
                }}>
                  <input type="file" accept="image/*" onChange={handleScreenshotChange} style={{ display: 'none' }} />
                  {paymentForm.screenshotBase64 ? (
                    <>
                      <img src={paymentForm.screenshotBase64} alt="preview" style={{ maxHeight: 130, borderRadius: 8, border: '1px solid var(--border-color)' }} />
                      <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>Tap to change screenshot</span>
                    </>
                  ) : (
                    <>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: 'rgba(59,130,246,0.12)', color: '#3b82f6', fontSize: 18 }}>⬆</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Tap to upload screenshot</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>or drop the image here</span>
                    </>
                  )}
                </label>
              </div>
              {paymentError && (
                <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#ef4444', marginBottom: 12 }}>
                  ⚠ {paymentError}
                </div>
              )}

              {/* Reassurance + GST invoice note */}
              <div style={{
                padding: '10px 12px', borderRadius: 8, marginBottom: 4,
                background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)',
                fontSize: 12, lineHeight: 1.55, color: 'var(--text-secondary)'
              }}>
                Your evaluation account is <strong style={{ color: 'var(--text-primary)' }}>activated instantly</strong> upon successful payment. A <strong style={{ color: 'var(--text-primary)' }}>GST-compliant tax invoice</strong> will be sent automatically to your registered email address after the payment is confirmed.
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => setPayStep(1)}
                  disabled={paymentSubmitting}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 10,
                    background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)', cursor: paymentSubmitting ? 'not-allowed' : 'pointer',
                    fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap'
                  }}
                >← Back</button>
                {(() => {
                  // UTR + screenshot are BOTH mandatory — the button stays
                  // disabled until they're provided, and submit re-checks anyway.
                  const ready = paymentForm.transactionRef.trim() && paymentForm.screenshotBase64;
                  const disabled = paymentSubmitting || adminUpiList.length === 0 || !ready;
                  return (
                    <button
                      onClick={() => submitBuyRequest(selectedPlan._id, selectedTierIndex)}
                      disabled={disabled}
                      title={!ready ? 'Enter the UTR / transaction reference and upload the payment screenshot first' : ''}
                      style={{
                        flex: 1.4, padding: '11px', borderRadius: 10,
                        background: disabled ? 'var(--border-color)' : '#10b981', color: '#fff', border: 'none',
                        cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13,
                        opacity: disabled && !paymentSubmitting ? 0.7 : 1, whiteSpace: 'nowrap'
                      }}
                    >{paymentSubmitting ? 'Verifying…' : 'Verify Payment'}</button>
                  );
                })()}
              </div>

              {securedFooter}
              </>)}
            </>)}
          </div>
        </div>
      )}

      {/* QR enlargement lightbox */}
      {qrPreview && (
        <div
          onClick={() => setQrPreview(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out'
          }}
        >
          {/* Admin-uploaded QRs are data/HTTP urls; a locally drawn one is passed
              as the raw upi:// string, which has to be re-rendered, not <img>'d. */}
          {String(qrPreview).startsWith('upi://') ? (
            <span onClick={(e) => e.stopPropagation()} style={{ lineHeight: 0 }}>
              <UpiQr value={qrPreview} size={Math.min(360, Math.round(window.innerWidth * 0.8))} />
            </span>
          ) : (
            <img src={qrPreview} alt="QR" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}

      <style>{`
        /* Inline mobile summary is hidden on desktop — the sticky sidebar is used there. */
        .prop-summary-inline { display: none; }
        /* Grid and flex children default to min-width:auto, which lets a long
           unbreakable value (Rs 10,00,000) push the whole column past the
           screen. This is what clipped the Summary on 601-900px phones. */
        .prop-plans-grid > *,
        .prop-eval-layout > * { min-width: 0; }
        .prop-eval-content { overflow-x: hidden; }
        @media (max-width: 900px) {
          /* Stack the two columns AND stretch them to full width. Without
             align-items:stretch the content-sized columns overflow the screen
             and clip on the right (cut-off ₹ values, broken card borders). */
          .prop-eval-layout { flex-direction: column !important; align-items: stretch !important; gap: 16px !important; }
          .prop-eval-layout > div { width: 100% !important; min-width: 0 !important; }
          /* Hide the sidebar summary (which otherwise lands at the very bottom on
             mobile) — the inline card under the tapped plan replaces it. */
          .prop-summary-panel { display: none !important; }
          .prop-summary-inline { display: block !important; animation: pf-summary-open 0.28s ease; }
          .prop-summary-inline-card { margin-top: 12px; }
        }
        @media (max-width: 600px) {
          .prop-plans-grid { grid-template-columns: 1fr !important; }
          .prop-eval-content { padding: 16px 14px 48px !important; }
        }
        @keyframes pf-summary-open {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Toast Notification */}
      {toast.show && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          padding: '14px 24px',
          borderRadius: '12px',
          background: toast.type === 'error' ? '#ef4444' : '#10b981',
          color: '#fff',
          fontSize: '14px',
          fontWeight: '500',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          zIndex: 9999,
          maxWidth: '400px',
          animation: 'slideIn 0.3s ease'
        }}>
          {toast.type === 'error' ? '❌ ' : '✅ '}{toast.message}
        </div>
      )}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default PropChallengePage;
