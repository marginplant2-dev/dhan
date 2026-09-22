import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { compressImage, base64ByteSize } from '../../../utils/compressImage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function WalletPage() {
  const { user, walletData, positions = [] } = useOutletContext();

  const [activeTab, setActiveTab] = useState('deposit');
  // On mobile the deposit/withdrawal form is collapsed by default and only
  // opens when the user taps Deposit or Withdraw in the hero card. Desktop
  // ignores this flag — CSS only applies the collapsed state at ≤768px.
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const currency = 'INR';
  const [paymentMethod, setPaymentMethod] = useState('');
  const [proofImage, setProofImage] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [withdrawDetails, setWithdrawDetails] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState({ bankAccounts: [], upiIds: [], cryptoWallets: [] });
  const [userWallet, setUserWallet] = useState({ balance: 0, credit: 0, equity: 0, margin: 0, freeMargin: 0 });
  const [uploadedHashes, setUploadedHashes] = useState([]);
  const [withdrawMethod, setWithdrawMethod] = useState('bank');
  const [withdrawBankDetails, setWithdrawBankDetails] = useState({
    bankName: '', accountNumber: '', ifsc: '', accountHolder: ''
  });
  const [withdrawUpiDetails, setWithdrawUpiDetails] = useState({ upiId: '', name: '' });
  const [withdrawCryptoDetails, setWithdrawCryptoDetails] = useState({ network: '', address: '' });

  // Eligible bonus hint — Fix 21c. Live-fetched as the user types in the
  // deposit amount input. Tells them upfront how much bonus they'll get
  // when admin approves the deposit. Re-fetched on amount/currency change
  // (debounced 300ms). Carries `belowMinimum` + `minimumRequired` so the
  // card can render "deposit at least ₹X to qualify" instead of a vague
  // no-match message.
  const [eligibleBonus, setEligibleBonus] = useState({ amount: 0, templateName: null, isFirstDeposit: null, belowMinimum: false, minimumRequired: null, minimumTemplateName: null });
  
  // Saved bank details from user settings
  const [savedBankAccounts, setSavedBankAccounts] = useState([]);
  const [selectedSavedBank, setSelectedSavedBank] = useState('');
  
  // Saved UPI details from user settings
  const [savedUpiAccounts, setSavedUpiAccounts] = useState([]);
  const [selectedSavedUpi, setSelectedSavedUpi] = useState('');

  // Fetch wallet from server - use direct user wallet endpoint
  const fetchWalletFromServer = async () => {
    const userId = user?.oderId || user?.id;
    if (!userId) return;
    try {
      // Use the direct user wallet endpoint that reads from User.wallet
      const response = await fetch(`${API_URL}/api/user/wallet/${userId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.wallet) {
          setUserWallet({
            balance: Number(data.wallet.balance) || 0,
            credit: Number(data.wallet.credit) || 0,
            equity: Number(data.wallet.equity) || 0,
            margin: Number(data.wallet.margin) || 0,
            freeMargin: Number(data.wallet.freeMargin) || 0
          });
        }
      }
    } catch (error) {
      // Silent fail - wallet will show 0
    }
  };

  // Fetch transactions from server
  const fetchTransactionsFromServer = async () => {
    const userId = user?.oderId || user?.id;
    if (!userId) return;
    try {
      const response = await fetch(`${API_URL}/api/transactions/${userId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.transactions) {
          setTransactions(data.transactions);
        }
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  // Eligible bonus debounced fetcher (Fix 21c). Only fires on the deposit
  // tab when amount > 0. Converts USD input to INR before asking the server
  // since templates store minDeposit in INR.
  useEffect(() => {
    const reset = { amount: 0, templateName: null, isFirstDeposit: null, belowMinimum: false, minimumRequired: null, minimumTemplateName: null };
    if (activeTab !== 'deposit') {
      setEligibleBonus(reset);
      return;
    }
    const numAmt = parseFloat(amount);
    if (!(numAmt > 0)) {
      setEligibleBonus(reset);
      return;
    }
    const userId = user?.oderId || user?.id;
    if (!userId) return;
    const inrAmount = numAmt;

    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/user/eligible-bonus?userId=${encodeURIComponent(userId)}&amount=${inrAmount}`);
        const data = await res.json();
        if (data?.success) {
          setEligibleBonus({
            amount: Number(data.bonus) || 0,
            templateName: data.templateName || null,
            isFirstDeposit: data.isFirstDeposit,
            belowMinimum: !!data.belowMinimum,
            minimumRequired: data.minimumRequired != null ? Number(data.minimumRequired) : null,
            minimumTemplateName: data.minimumTemplateName || null
          });
        }
      } catch (_) {
        setEligibleBonus(reset);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [amount, currency, activeTab, user]);

  // Pulled out so we can re-call on tab switch + via the polling interval below.
  // Without this, an admin editing a UPI/bank/crypto entry won't be reflected
  // until the user reloads the wallet page.
  const loadPaymentMethods = useCallback(async () => {
    try {
      const userId = user?.oderId || user?.id;
      const endpoint = userId
        ? `${API_URL}/api/admin-payment-details/for-user/${userId}`
        : `${API_URL}/api/admin-payment-details`;

      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPaymentMethods({
            bankAccounts: data.bankAccounts || [],
            upiIds: data.upiIds || [],
            cryptoWallets: data.cryptoWallets || []
          });
        }
      }
    } catch (error) {
      console.error('Error loading payment methods:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchWalletFromServer();
    fetchTransactionsFromServer();
    loadPaymentMethods();

    const hashes = JSON.parse(localStorage.getItem('dhanfunded-uploaded-hashes') || '[]');
    setUploadedHashes(hashes);

    // Fetch user's saved bank accounts
    const loadSavedBankAccounts = async () => {
      try {
        const userId = user?.oderId || user?.id;
        if (!userId) return;
        const response = await fetch(`${API_URL}/api/user/bank-accounts/${userId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.bankAccounts) {
            setSavedBankAccounts(data.bankAccounts);
          }
        }
      } catch (error) {
        console.error('Error loading saved bank accounts:', error);
      }
    };
    loadSavedBankAccounts();
    
    // Fetch user's saved UPI accounts
    const loadSavedUpiAccounts = async () => {
      try {
        const userId = user?.oderId || user?.id;
        if (!userId) return;
        const response = await fetch(`${API_URL}/api/user/upi-accounts/${userId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.upiAccounts) {
            setSavedUpiAccounts(data.upiAccounts);
          }
        }
      } catch (error) {
        console.error('Error loading saved UPI accounts:', error);
      }
    };
    loadSavedUpiAccounts();

    const walletInterval = setInterval(fetchWalletFromServer, 5000);
    // Refresh admin-side payment details every 15s so users see UPI / bank /
    // crypto edits made by the admin without having to reload the page.
    const paymentMethodsInterval = setInterval(loadPaymentMethods, 15000);
    return () => {
      clearInterval(walletInterval);
      clearInterval(paymentMethodsInterval);
    };
  }, [user, loadPaymentMethods]);

  // Re-fetch payment methods when the user opens the deposit tab so the latest
  // admin-edited UPI / bank list shows up immediately (no 15s wait).
  useEffect(() => {
    if (activeTab === 'deposit') {
      loadPaymentMethods();
    }
  }, [activeTab, loadPaymentMethods]);

  // Generate hash for duplicate detection
  const generateHash = async (data) => {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleProofUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      alert('Image size should be less than 25 MB');
      return;
    }
    try {
      // Mobile cameras produce huge files; compress to a manageable size
      // before sending so the upload doesn't fail with "Failed to fetch".
      const base64 = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
      const sizeKb = Math.round(base64ByteSize(base64) / 1024);
      console.log(`[ProofUpload] original=${(file.size / 1024).toFixed(0)} KB → compressed=${sizeKb} KB`);
      const hash = await generateHash(base64);
      if (uploadedHashes.includes(hash)) {
        alert('This screenshot has already been used. Please upload a new payment proof.');
        return;
      }
      setProofImage(base64);
    } catch (err) {
      alert('Could not process image — try a different file.');
    }
  };

  const submitRequest = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (activeTab === 'deposit' && !paymentMethod) {
      alert('Please select a payment method');
      return;
    }
    if (activeTab === 'deposit' && !proofImage) {
      alert('Please upload payment proof screenshot');
      return;
    }
    if (activeTab === 'withdrawal') {
      const maxWithdrawable = Math.max(0, Number(displayFreeMargin) || 0);
      if (parseFloat(amount) > maxWithdrawable) {
        alert(`You can only withdraw up to ₹${Number(maxWithdrawable).toFixed(2)} (Free Margin).${displayMargin > 0 ? ' You have active positions using margin.' : ''}`);
        return;
      }
      if (withdrawMethod === 'bank' || withdrawMethod === 'upi') {
        if (!withdrawBankDetails.bankName || !withdrawBankDetails.accountNumber || !withdrawBankDetails.ifsc || !withdrawBankDetails.accountHolder) {
          alert('Please fill all bank details');
          return;
        }
      } else if (withdrawMethod === 'crypto') {
        if (!withdrawCryptoDetails.network || !withdrawCryptoDetails.address) {
          alert('Please fill crypto wallet details');
          return;
        }
      }
    }

    if (proofImage) {
      const hash = await generateHash(proofImage);
      const updatedHashes = [...uploadedHashes, hash];
      setUploadedHashes(updatedHashes);
      localStorage.setItem('dhanfunded-uploaded-hashes', JSON.stringify(updatedHashes));
    }

    // Build withdrawal details object
    let withdrawalInfo = null;
    if (activeTab === 'withdrawal') {
      withdrawalInfo = {
        method: withdrawMethod,
        ...((withdrawMethod === 'bank' || withdrawMethod === 'upi') && { bankDetails: withdrawBankDetails }),
        ...(withdrawMethod === 'crypto' && { cryptoDetails: withdrawCryptoDetails })
      };
    }

    const newRequest = {
      id: Date.now().toString(),
      oderId: user?.oderId,
      userId: user?.id,
      userName: user?.name || 'User',
      type: activeTab,
      amount: parseFloat(amount),
      currency: currency, // USD or INR
      method: activeTab === 'deposit' ? paymentMethod : withdrawMethod,
      proofImage: activeTab === 'deposit' ? proofImage : null,
      transactionId: activeTab === 'deposit' ? transactionId : null,
      withdrawalInfo: withdrawalInfo,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    // For withdrawal, set paymentMethod to withdrawMethod for consistency
    if (activeTab === 'withdrawal') {
      setPaymentMethod(withdrawMethod);
    }

    // Submit the request to the backend. The previous implementation silently
    // wrote to localStorage on network/CORS failure and still alerted "submitted
    // successfully" — admins never saw the request because it never reached the
    // DB. Now we surface the real error and keep the form filled so the user
    // can retry.
    let serverResult = null;
    try {
      const response = await fetch(`${API_URL}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRequest)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(`Failed to submit ${activeTab}: ${data.error || `HTTP ${response.status}`}\n\nYour details are still in the form — please try again.`);
        return;
      }
      serverResult = data?.transaction || data || newRequest;
    } catch (error) {
      console.error(`[${activeTab}] submit failed:`, error);
      alert(`Network error — could not reach the server. Please check your connection and try again.\n\n(${error?.message || 'fetch failed'})`);
      return;
    }

    setTransactions([...transactions, serverResult]);
    setAmount('');
    setPaymentMethod('');
    setProofImage('');
    setTransactionId('');
    setWithdrawDetails('');
    setWithdrawBankDetails({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '' });
    setWithdrawUpiDetails({ upiId: '', name: '' });
    setWithdrawCryptoDetails({ network: '', address: '' });
    setSelectedSavedBank('');
    setSelectedSavedUpi('');
    setMobileFormOpen(false);
    alert(`${activeTab === 'deposit' ? 'Deposit' : 'Withdrawal'} request submitted successfully!`);
  };

  const getMethodDetails = (methodId) => {
    const bank = paymentMethods.bankAccounts.find(b => b._id === methodId);
    if (bank) return { type: 'bank', data: bank };
    const upi = paymentMethods.upiIds.find(u => u._id === methodId);
    if (upi) return { type: 'upi', data: upi };
    const crypto = paymentMethods.cryptoWallets.find(c => c._id === methodId);
    if (crypto) return { type: 'crypto', data: crypto };
    return null;
  };

  const selectedMethod = paymentMethod ? getMethodDetails(paymentMethod) : null;
  const toInr = (v) => Number(v || 0).toFixed(2);

  /** Same source as footer status bar: balance from API, margin/equity/free from UserLayout (positions). */
  const displayBalance = Number(walletData?.balance) || Number(userWallet.balance) || 0;
  const displayCredit = Number(walletData?.credit) || Number(userWallet.credit) || 0;
  const layoutMetricsTrust =
    Number(walletData?.balance) > 0 ||
    (Array.isArray(positions) && positions.length > 0) ||
    Number(walletData?.margin) > 0;

  let displayEquity;
  let displayMargin;
  let displayFreeMargin;
  if (layoutMetricsTrust) {
    displayMargin = Number(walletData?.margin) || 0;
    displayEquity = Number(walletData?.equity);
    if (!Number.isFinite(displayEquity)) displayEquity = displayBalance + displayCredit;
    displayFreeMargin = Number(walletData?.freeMargin);
    if (!Number.isFinite(displayFreeMargin)) displayFreeMargin = Math.max(0, displayEquity - displayMargin);
  } else {
    displayMargin = Number(userWallet.margin) || 0;
    displayEquity = Number(userWallet.equity) || displayBalance + displayCredit;
    displayFreeMargin =
      Number(userWallet.freeMargin) || Math.max(0, displayEquity - displayMargin);
  }

  const scrollToWalletForm = () => {
    document.querySelector('.wallet-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="wallet-page">
      <div className="mobi-wallet-mobile-hero">
        <div className="mobi-wallet-hero">
          <div className="mobi-wallet-title">Wallet</div>
          <div className="mobi-balance-card">
            <div className="mobi-pc-label">Balance (INR)</div>
            <div className="mobi-pc-amount">
              {`₹${Number(displayBalance || 0).toFixed(2)}`}
            </div>
            <div className="mobi-pc-row">
              <div>
                <div className="mobi-pc-stat-label">Equity</div>
                <div className="mobi-pc-stat-val">₹{toInr(displayEquity)}</div>
              </div>
              <div>
                <div className="mobi-pc-stat-label">Free</div>
                <div className="mobi-pc-stat-val">₹{toInr(displayFreeMargin)}</div>
              </div>
              <div>
                <div className="mobi-pc-stat-label">Margin</div>
                <div className="mobi-pc-stat-val">₹{toInr(displayMargin)}</div>
              </div>
            </div>
          </div>
          <div className="mobi-wallet-actions">
            <button
              type="button"
              className="mobi-wa-deposit"
              onClick={() => {
                setActiveTab('deposit');
                setMobileFormOpen(true);
                scrollToWalletForm();
              }}
            >
              Deposit
            </button>
            <button
              type="button"
              className="mobi-wa-withdraw"
              onClick={() => {
                setActiveTab('withdrawal');
                setMobileFormOpen(true);
                scrollToWalletForm();
              }}
            >
              Withdraw
            </button>
          </div>
        </div>
      </div>

      <div className="wallet-balance-card">
        <h2>My Wallet</h2>
        {(() => {
          // Single source of truth — use the server-side `wallet` doc
          // (displayBalance / displayFreeMargin / displayMargin / displayEquity
          // / displayCredit). The legacy `walletINR` mirror can drift due to
          // old migrations and must NOT be shown here or the top cards will
          // contradict the "Available for Withdrawal" box below.
          const fmt = (v) => Number(v || 0).toFixed(2);
          return (
            <div className="balance-row inr">
              <span className="currency-label">INR</span>
              <div className="balance-grid">
                <div className="balance-item"><span className="balance-label">Balance</span><span className="balance-value">₹{fmt(displayBalance)}</span></div>
                <div className="balance-item"><span className="balance-label">Credit</span><span className="balance-value">₹{fmt(displayCredit)}</span></div>
                <div className="balance-item"><span className="balance-label">Equity</span><span className="balance-value">₹{fmt(displayEquity)}</span></div>
                <div className="balance-item"><span className="balance-label">Margin</span><span className="balance-value">₹{fmt(displayMargin)}</span></div>
                <div className="balance-item highlight-inr"><span className="balance-label">Free Margin</span><span className="balance-value">₹{fmt(displayFreeMargin)}</span></div>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="wallet-content">
        <div className={`wallet-form-card${mobileFormOpen ? ' wallet-form-card--mobile-open' : ''}`}>
          <>
          <button
            type="button"
            className="wallet-form-mobile-close"
            aria-label="Close form"
            onClick={() => setMobileFormOpen(false)}
          >
            ✕
          </button>
          <div className="wallet-tabs">
            <button className={`wallet-tab ${activeTab === 'deposit' ? 'active' : ''}`} onClick={() => setActiveTab('deposit')}>Deposit</button>
            <button className={`wallet-tab ${activeTab === 'withdrawal' ? 'active' : ''}`} onClick={() => setActiveTab('withdrawal')}>Withdrawal</button>
          </div>

          <div className="wallet-form">
            <div className="form-group">
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                <span>INR Balance: ₹{Number(displayBalance || 0).toFixed(2)}</span>
              </div>
            </div>

            {activeTab === 'withdrawal' && (
              <div style={{
                background: displayMargin > 0
                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.08))'
                  : 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.08))',
                border: `1px solid ${displayMargin > 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                borderRadius: 10,
                padding: '14px 16px',
                marginBottom: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Available for Withdrawal</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: displayMargin > 0 ? '#f59e0b' : '#10b981' }}>
                    {`₹${toInr(Math.max(0, Number(displayFreeMargin) || 0))}`}
                  </span>
                </div>
                {displayMargin > 0 && (
                  <div style={{ fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>⚠️</span>
                    <span>You have active positions. Only free margin (Balance − Used Margin) can be withdrawn.</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>
                  <span>Balance: ₹{toInr(displayBalance || 0)}</span>
                  <span>Margin Used: ₹{toInr(displayMargin || 0)}</span>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={activeTab === 'withdrawal'
                  ? `Max: ₹${Number(Math.max(0, Number(displayFreeMargin) || 0)).toFixed(2)}`
                  : 'Enter amount in ₹'}
                min="1"
                max={activeTab === 'withdrawal' ? Math.max(0, Number(displayFreeMargin) || 0) : undefined}
              />
              {activeTab === 'withdrawal' && amount && parseFloat(amount) > (Number(displayFreeMargin) || 0) && (
                <p style={{ fontSize: 12, color: '#ef4444', margin: '4px 0 0', fontWeight: 500 }}>
                  ⚠ Amount exceeds available free margin (₹{toInr(displayFreeMargin || 0)})
                </p>
              )}
              {/* Eligible bonus hint — Fix 21c (revised in 21c.7). Two
                  states only:
                    1. A template matches → yellow card "Eligible bonus: ₹X"
                    2. Deposit is below the minimum required by SOME active
                       template → gray card telling user the threshold
                  When neither condition is true (no active templates at all,
                  or user is on a regular deposit with no regular template),
                  the card simply doesn't render — silence is fine. */}
              {activeTab === 'deposit' && amount && parseFloat(amount) > 0 && eligibleBonus.amount > 0 && (
                <div style={{
                  marginTop: 8,
                  padding: '10px 14px',
                  background: 'rgba(251, 191, 36, 0.1)',
                  border: '1px solid rgba(251, 191, 36, 0.4)',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#fbbf24',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1.2 }}>🎁</span>
                  <span style={{ flex: 1 }}>
                    <strong>Eligible bonus: ₹{eligibleBonus.amount.toFixed(2)}</strong>
                    {eligibleBonus.templateName && (
                      <span style={{ marginLeft: 6, opacity: 0.85 }}>({eligibleBonus.templateName})</span>
                    )}
                    {eligibleBonus.isFirstDeposit && (
                      <span style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'rgba(251, 191, 36, 0.25)' }}>FIRST DEPOSIT</span>
                    )}
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, fontWeight: 400, lineHeight: 1.5 }}>
                      Auto-credited to your bonus credit when admin approves the deposit. Credit boosts your Free Margin so you can open larger positions; it is not directly withdrawable.
                    </div>
                  </span>
                </div>
              )}
              {activeTab === 'deposit' && amount && parseFloat(amount) > 0 && eligibleBonus.amount === 0 && eligibleBonus.belowMinimum && eligibleBonus.minimumRequired != null && (
                <div style={{
                  marginTop: 8,
                  padding: '10px 14px',
                  background: 'rgba(100, 116, 139, 0.12)',
                  border: '1px solid rgba(100, 116, 139, 0.35)',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1.2 }}>ℹ️</span>
                  <span style={{ flex: 1 }}>
                    <strong>Deposit at least ₹{eligibleBonus.minimumRequired.toLocaleString('en-IN')} to qualify for a bonus</strong>
                    {eligibleBonus.minimumTemplateName && (
                      <span style={{ marginLeft: 6, opacity: 0.85 }}>({eligibleBonus.minimumTemplateName})</span>
                    )}
                  </span>
                </div>
              )}
            </div>

            {activeTab === 'deposit' && (
              <div className="form-group">
                <label>Payment Method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="">Select payment method</option>
                  {paymentMethods.bankAccounts.length > 0 && (
                    <optgroup label="Bank Transfer">
                      {paymentMethods.bankAccounts.map(bank => (
                        <option key={bank._id} value={bank._id}>
                          {bank.bankName} - ****{bank.accountNumber?.slice(-4)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {paymentMethods.upiIds.length > 0 && (
                    <optgroup label="UPI">
                      {paymentMethods.upiIds.map(upi => (
                        <option key={upi._id} value={upi._id}>
                          {upi.name} - {upi.upiId}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {paymentMethods.cryptoWallets.length > 0 && (
                    <optgroup label="Crypto">
                      {paymentMethods.cryptoWallets.map(crypto => (
                        <option key={crypto._id} value={crypto._id}>
                          {crypto.network} - {crypto.address?.slice(0, 10)}...
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}

            {selectedMethod && activeTab === 'deposit' && (
              <div className="payment-details-box">
                <h4>Payment Details</h4>
                {selectedMethod.type === 'bank' && (
                  <>
                    <p><strong>Bank:</strong> {selectedMethod.data.bankName}</p>
                    <p><strong>Account:</strong> {selectedMethod.data.accountNumber}</p>
                    <p><strong>IFSC:</strong> {selectedMethod.data.ifsc}</p>
                    <p><strong>Name:</strong> {selectedMethod.data.accountHolder}</p>
                  </>
                )}
                {selectedMethod.type === 'upi' && (
                  <>
                    <p><strong>UPI ID:</strong> {selectedMethod.data.upiId}</p>
                    <p><strong>Name:</strong> {selectedMethod.data.name}</p>
                    {selectedMethod.data.qrImage && <img src={selectedMethod.data.qrImage} alt="QR" className="payment-qr" />}
                  </>
                )}
                {selectedMethod.type === 'crypto' && (
                  <>
                    <p><strong>Network:</strong> {selectedMethod.data.network}</p>
                    <p className="crypto-address"><strong>Address:</strong> {selectedMethod.data.address}</p>
                    {selectedMethod.data.qrImage && <img src={selectedMethod.data.qrImage} alt="QR" className="payment-qr" />}
                  </>
                )}
              </div>
            )}

            {activeTab === 'deposit' && (
              <>
                <div className="form-group">
                  <label>Transaction ID / UTR Number</label>
                  <input
                    className="wallet-input"
                    type="text"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="Enter transaction ID or UTR number"
                  />
                  <small style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Optional: Enter the transaction reference for faster verification</small>
                </div>
                <div className="form-group">
                  <label>Upload Payment Proof *</label>
                  <div className="proof-upload-area">
                    <input type="file" id="proof-upload" accept="image/*" onChange={handleProofUpload} className="file-input" />
                    <label htmlFor="proof-upload" className="upload-label">
                      {proofImage ? (
                        <img src={proofImage} alt="Proof" className="proof-preview" />
                      ) : (
                        <div className="upload-placeholder"><span>📷</span><span>Upload Screenshot</span></div>
                      )}
                    </label>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'withdrawal' && (
              <div className="withdrawal-details-section">
                <div className="form-group">
                  <label>Withdrawal Method</label>
                  <div className="withdraw-method-tabs" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <button type="button" className={`method-tab ${withdrawMethod === 'bank' ? 'active' : ''}`} 
                      onClick={() => setWithdrawMethod('bank')}
                      style={{ flex: 1, padding: '10px', borderRadius: 8, border: withdrawMethod === 'bank' ? '2px solid var(--primary)' : '1px solid var(--border)', background: withdrawMethod === 'bank' ? 'var(--primary-light)' : 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px' }}>
                      🏦 Bank Transfer
                    </button>
                    <button type="button" className={`method-tab ${withdrawMethod === 'upi' ? 'active' : ''}`}
                      onClick={() => setWithdrawMethod('upi')}
                      style={{ flex: 1, padding: '10px', borderRadius: 8, border: withdrawMethod === 'upi' ? '2px solid var(--primary)' : '1px solid var(--border)', background: withdrawMethod === 'upi' ? 'var(--primary-light)' : 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px' }}>
                      📱 UPI
                    </button>
                  </div>
                </div>

                {(withdrawMethod === 'bank' || withdrawMethod === 'upi') && (
                  <div className="bank-details-form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Saved Bank Accounts Selection */}
                    {savedBankAccounts.length > 0 && (
                      <div className="form-group">
                        <label>Select Saved Bank Account</label>
                        <select 
                          value={selectedSavedBank}
                          onChange={(e) => {
                            const bankId = e.target.value;
                            setSelectedSavedBank(bankId);
                            if (bankId) {
                              const bank = savedBankAccounts.find(b => b._id === bankId);
                              if (bank) {
                                setWithdrawBankDetails({
                                  bankName: bank.bankName,
                                  accountNumber: bank.accountNumber,
                                  ifsc: bank.ifsc,
                                  accountHolder: bank.accountHolder,
                                  upiId: bank.upiId || ''
                                });
                                // Also set UPI details if available
                                if (bank.upiId) {
                                  setWithdrawUpiDetails({
                                    upiId: bank.upiId,
                                    name: bank.accountHolder
                                  });
                                }
                              }
                            } else {
                              setWithdrawBankDetails({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '', upiId: '' });
                              setWithdrawUpiDetails({ upiId: '', name: '' });
                            }
                          }}
                          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                        >
                          <option value="">-- Enter manually or select saved --</option>
                          {savedBankAccounts.map(bank => (
                            <option key={bank._id} value={bank._id}>
                              {bank.bankName} - ****{bank.accountNumber?.slice(-4)} ({bank.accountHolder}) {bank.upiId ? `📱 ${bank.upiId}` : ''}
                            </option>
                          ))}
                        </select>
                        <small style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Add bank accounts in Settings → Bank Details</small>
                      </div>
                    )}
                    
                    <div className="form-group">
                      <label>Bank Name *</label>
                      <input type="text" value={withdrawBankDetails.bankName} 
                        onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, bankName: e.target.value }))}
                        placeholder="Enter bank name" />
                    </div>
                    <div className="form-group">
                      <label>Account Holder Name *</label>
                      <input type="text" value={withdrawBankDetails.accountHolder}
                        onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, accountHolder: e.target.value }))}
                        placeholder="Enter account holder name" />
                    </div>
                    <div className="form-group">
                      <label>Account Number *</label>
                      <input type="text" value={withdrawBankDetails.accountNumber}
                        onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, accountNumber: e.target.value }))}
                        placeholder="Enter account number" />
                    </div>
                    <div className="form-group">
                      <label>IFSC Code *</label>
                      <input type="text" value={withdrawBankDetails.ifsc}
                        onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, ifsc: e.target.value.toUpperCase() }))}
                        placeholder="Enter IFSC code" />
                    </div>
                    <div className="form-group">
                      <label>UPI ID (Optional - for faster withdrawal)</label>
                      <input type="text" value={withdrawBankDetails.upiId || ''}
                        onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, upiId: e.target.value }))}
                        placeholder="e.g., yourname@upi" />
                    </div>
                  </div>
                )}

              </div>
            )}

            <button className="submit-btn" onClick={submitRequest}>
              {activeTab === 'deposit' ? 'Submit Deposit Request' : 'Submit Withdrawal Request'}
            </button>
          </div>
          </>
        </div>

        <div className="transactions-card">
          <h3>Transaction History</h3>
          {transactions.length === 0 ? (
            <p className="no-transactions">No transactions yet</p>
          ) : (
            <div className="transactions-list">
              {transactions.map(tx => {
                const bonusAmt = Number(tx.bonusAmount) || 0;
                return (
                  <div key={tx.id || tx._id} className={`transaction-item ${tx.type}`}>
                    <div className="tx-icon">{tx.type === 'deposit' ? '↓' : '↑'}</div>
                    <div className="tx-info">
                      <span className="tx-type">
                        {tx.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                        {bonusAmt > 0 && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>
                            🎁 +₹{bonusAmt.toFixed(2)} BONUS
                          </span>
                        )}
                      </span>
                      <span className="tx-date">
                        {new Date(tx.createdAt).toLocaleDateString()}
                        {bonusAmt > 0 && tx.bonusTemplateName && (
                          <span style={{ marginLeft: 8, fontSize: 10, color: '#9ca3af' }}>
                            ({tx.bonusTemplateName})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="tx-amount">₹{Number(tx.amount || 0).toFixed(2)}</div>
                    <span className={`tx-status ${tx.status}`}>{tx.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WalletPage;
