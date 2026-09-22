import { useState, useEffect, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  LuArrowDownToLine, LuArrowUpFromLine, LuArrowRight,
  LuTrendingUp, LuMinus, LuBell,
  LuNewspaper, LuZap, LuRotateCw, LuPlay
} from 'react-icons/lu';
import MarketWatchPanel from './MarketWatchPanel';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// TradingView Heatmap Widget Component
function TradingViewHeatmap({ isDark }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      "exchanges": [],
      "dataSource": "SPX500",
      "grouping": "sector",
      "blockSize": "market_cap_basic",
      "blockColor": "change",
      "locale": "en",
      "symbolUrl": "",
      "colorTheme": isDark ? "dark" : "light",
      "hasTopBar": false,
      "isDataSet498": true,
      "isZoomEnabled": true,
      "hasSymbolTooltip": true,
      "width": "100%",
      "height": "100%"
    });

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [isDark]);

  // Mandatory TradingView attribution: visible credit + direct link (same as public home in App.jsx)
  return (
    <div className="tradingview-widget-wrapper">
      <div ref={containerRef} className="tradingview-widget" />
      <div className="tradingview-attribution">
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Stock Heatmap by TradingView
        </a>
      </div>
    </div>
  );
}

// Quick Wallet Actions Component
function QuickWalletActions({ user, displayCurrency, usdInrRate, usdMarkup }) {
  const [userWallet, setUserWallet] = useState(null);

  const formatCurrency = (value) => {
    const numValue = Number(value || 0);
    return `₹${numValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [proofImage, setProofImage] = useState('');
  const [withdrawDetails, setWithdrawDetails] = useState('');
  const [paymentMethods, setPaymentMethods] = useState({ bankAccounts: [], upiIds: [], cryptoWallets: [] });
  const [withdrawMethod, setWithdrawMethod] = useState('bank');
  const [withdrawBankDetails, setWithdrawBankDetails] = useState({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '' });
  const [withdrawUpiDetails, setWithdrawUpiDetails] = useState({ upiId: '', name: '' });
  const [withdrawCryptoDetails, setWithdrawCryptoDetails] = useState({ network: '', address: '' });

  const fetchWallet = async () => {
    try {
      // Get user ID from props or localStorage
      const userId = user?.oderId || user?.id;
      if (!userId) {
        const userData = JSON.parse(localStorage.getItem('dhanfunded-user') || '{}');
        const fallbackUserId = userData?.oderId || userData?.id;
        if (!fallbackUserId) return;

        const response = await fetch(`${API_URL}/api/user/wallet/${fallbackUserId}`);
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
        return;
      }

      // Use the direct user wallet endpoint (same as WalletPage)
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
    } catch (err) {
      console.error('Error fetching wallet:', err);
    }
  };

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin-payment-details`);
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
    } catch (err) {
      console.error('Error fetching payment methods:', err);
    }
  };

  useEffect(() => {
    fetchWallet();
    fetchPaymentMethods();
  }, [user]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProofImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const getAllPaymentMethods = () => {
    const methods = [];
    paymentMethods.bankAccounts?.forEach(acc => {
      methods.push({ id: `bank_${acc.id}`, type: 'bank', name: `${acc.bankName} - ${acc.accountNumber}`, details: acc, icon: '🏦' });
    });
    paymentMethods.upiIds?.forEach(upi => {
      methods.push({ id: `upi_${upi.id}`, type: 'upi', name: upi.upiId, details: upi, icon: '📱' });
    });
    paymentMethods.cryptoWallets?.forEach(wallet => {
      methods.push({ id: `crypto_${wallet.id}`, type: 'crypto', name: `${wallet.network} - ${wallet.address.slice(0, 8)}...`, details: wallet, icon: '₿' });
    });
    return methods;
  };

  const getSelectedMethod = () => {
    const allMethods = getAllPaymentMethods();
    return allMethods.find(m => m.id === paymentMethod);
  };

  const submitDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (!paymentMethod) {
      alert('Please select a payment method');
      return;
    }
    if (!proofImage) {
      alert('Please upload payment proof');
      return;
    }

    const selectedMethod = getSelectedMethod();
    const userId = user?.id || user?.oderId;

    try {
      const response = await fetch(`${API_URL}/api/transactions/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: parseFloat(amount),
          method: paymentMethod,
          methodDetails: selectedMethod?.details,
          proofImage
        })
      });

      const result = await response.json();
      if (result.success) {
        alert('Deposit request submitted successfully!');
        setShowDepositModal(false);
        setAmount('');
        setPaymentMethod('');
        setProofImage('');
        fetchWallet();
      } else {
        alert(result.error || 'Failed to submit deposit');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const submitWithdraw = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (userWallet && parseFloat(amount) > userWallet.freeMargin) {
      alert('Insufficient balance');
      return;
    }

    // Validate user-entered withdrawal details based on method
    let userWithdrawDetails = {};
    if (withdrawMethod === 'bank') {
      if (!withdrawBankDetails.bankName || !withdrawBankDetails.accountNumber || !withdrawBankDetails.ifsc || !withdrawBankDetails.accountHolder) {
        alert('Please fill all bank details');
        return;
      }
      userWithdrawDetails = { type: 'bank', ...withdrawBankDetails };
    } else if (withdrawMethod === 'upi') {
      if (!withdrawUpiDetails.upiId || !withdrawUpiDetails.name) {
        alert('Please fill UPI details');
        return;
      }
      userWithdrawDetails = { type: 'upi', ...withdrawUpiDetails };
    } else if (withdrawMethod === 'crypto') {
      if (!withdrawCryptoDetails.network || !withdrawCryptoDetails.address) {
        alert('Please fill crypto wallet details');
        return;
      }
      userWithdrawDetails = { type: 'crypto', ...withdrawCryptoDetails };
    }

    const userId = user?.id || user?.oderId;

    try {
      const response = await fetch(`${API_URL}/api/transactions/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: parseFloat(amount),
          method: withdrawMethod,
          withdrawDetails: userWithdrawDetails
        })
      });

      const result = await response.json();
      if (result.success) {
        alert('Withdrawal request submitted successfully!');
        setShowWithdrawModal(false);
        setAmount('');
        setWithdrawMethod('bank');
        setWithdrawBankDetails({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '' });
        setWithdrawUpiDetails({ upiId: '', name: '' });
        setWithdrawCryptoDetails({ network: '', address: '' });
        fetchWallet();
      } else {
        alert(result.error || 'Failed to submit withdrawal');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  return (
    <div className="quick-wallet">
      <div className="quick-balance-card pf-glow">
        <div className="balance-row">
          <span className="balance-label">Balance</span>
          <span className="balance-value">{formatCurrency(userWallet?.balance)}</span>
        </div>
        <div className="balance-row">
          <span className="balance-label">Free Margin</span>
          <span className="balance-value">{formatCurrency(userWallet?.freeMargin)}</span>
        </div>
        <div className="balance-row">
          <span className="balance-label">Equity</span>
          <span className="balance-value">{formatCurrency(userWallet?.equity)}</span>
        </div>
      </div>

      <div className="quick-action-buttons">
        <button className="quick-action-btn deposit" onClick={() => setShowDepositModal(true)}>
          <span className="btn-icon">↓</span>
          <span>Deposit</span>
        </button>
        <button className="quick-action-btn withdraw" onClick={() => setShowWithdrawModal(true)}>
          <span className="btn-icon">↑</span>
          <span>Withdraw</span>
        </button>
      </div>

      {showDepositModal && (
        <div className="quick-modal-overlay" onClick={() => setShowDepositModal(false)}>
          <div className="quick-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Deposit Funds</h4>
              <button className="close-btn" onClick={() => setShowDepositModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Amount (₹)</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" min="0" />
              </div>
              <div className="form-group">
                <label>Select Payment Method</label>
                {getAllPaymentMethods().length === 0 ? (
                  <p className="no-methods">No payment methods available. Contact admin.</p>
                ) : (
                  <div className="payment-methods-list">
                    {getAllPaymentMethods().map(m => (
                      <button key={m.id} className={`payment-method-item ${paymentMethod === m.id ? 'selected' : ''}`} onClick={() => setPaymentMethod(m.id)}>
                        <span className="method-icon">{m.icon}</span>
                        <span className="method-name">{m.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {getSelectedMethod() && (
                <div className="selected-method-details">
                  <h5>Payment Details</h5>
                  {getSelectedMethod().type === 'bank' && (
                    <div className="method-info">
                      <p><strong>Bank:</strong> {getSelectedMethod().details.bankName}</p>
                      <p><strong>Account:</strong> {getSelectedMethod().details.accountNumber}</p>
                      <p><strong>IFSC:</strong> {getSelectedMethod().details.ifscCode}</p>
                      <p><strong>Name:</strong> {getSelectedMethod().details.accountName}</p>
                    </div>
                  )}
                  {getSelectedMethod().type === 'upi' && (
                    <div className="method-info">
                      <p><strong>UPI ID:</strong> {getSelectedMethod().details.upiId}</p>
                      {getSelectedMethod().details.qrCode && (
                        <img src={getSelectedMethod().details.qrCode} alt="QR" className="qr-code" />
                      )}
                    </div>
                  )}
                  {getSelectedMethod().type === 'crypto' && (
                    <div className="method-info">
                      <p><strong>Network:</strong> {getSelectedMethod().details.network}</p>
                      <p><strong>Address:</strong> <span className="crypto-addr">{getSelectedMethod().details.address}</span></p>
                    </div>
                  )}
                </div>
              )}
              <div className="form-group">
                <label>Upload Payment Proof</label>
                <input type="file" accept="image/*" onChange={handleImageUpload} />
                {proofImage && <img src={proofImage} alt="Proof" className="proof-preview" />}
              </div>
              <button className="submit-btn" onClick={submitDeposit}>Submit Deposit</button>
            </div>
          </div>
        </div>
      )}

      {showWithdrawModal && (
        <div className="quick-modal-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div className="quick-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Withdraw Funds</h4>
              <button className="close-btn" onClick={() => setShowWithdrawModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Amount (₹) - Available: ₹{Number(userWallet?.freeMargin || 0).toFixed(2)}</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" min="0" max={userWallet?.freeMargin || 0} />
              </div>
              <div className="form-group">
                <label>Withdrawal Method</label>
                <div className="payment-methods-list" style={{ display: 'flex', gap: 8 }}>
                  <button className={`payment-method-item ${withdrawMethod === 'bank' ? 'selected' : ''}`} onClick={() => setWithdrawMethod('bank')} style={{ flex: 1 }}>
                    <span className="method-icon">🏦</span>
                    <span className="method-name">Bank</span>
                  </button>
                  <button className={`payment-method-item ${withdrawMethod === 'upi' ? 'selected' : ''}`} onClick={() => setWithdrawMethod('upi')} style={{ flex: 1 }}>
                    <span className="method-icon">📱</span>
                    <span className="method-name">UPI</span>
                  </button>
                  <button className={`payment-method-item ${withdrawMethod === 'crypto' ? 'selected' : ''}`} onClick={() => setWithdrawMethod('crypto')} style={{ flex: 1 }}>
                    <span className="method-icon">₿</span>
                    <span className="method-name">Crypto</span>
                  </button>
                </div>
              </div>

              {withdrawMethod === 'bank' && (
                <div className="withdraw-details-form">
                  <div className="form-group">
                    <label>Bank Name *</label>
                    <input type="text" value={withdrawBankDetails.bankName} onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, bankName: e.target.value }))} placeholder="Enter bank name" />
                  </div>
                  <div className="form-group">
                    <label>Account Number *</label>
                    <input type="text" value={withdrawBankDetails.accountNumber} onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, accountNumber: e.target.value }))} placeholder="Enter account number" />
                  </div>
                  <div className="form-group">
                    <label>IFSC Code *</label>
                    <input type="text" value={withdrawBankDetails.ifsc} onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, ifsc: e.target.value }))} placeholder="Enter IFSC code" />
                  </div>
                  <div className="form-group">
                    <label>Account Holder Name *</label>
                    <input type="text" value={withdrawBankDetails.accountHolder} onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, accountHolder: e.target.value }))} placeholder="Enter account holder name" />
                  </div>
                </div>
              )}

              {withdrawMethod === 'upi' && (
                <div className="withdraw-details-form">
                  <div className="form-group">
                    <label>UPI ID *</label>
                    <input type="text" value={withdrawUpiDetails.upiId} onChange={(e) => setWithdrawUpiDetails(prev => ({ ...prev, upiId: e.target.value }))} placeholder="Enter UPI ID (e.g. name@upi)" />
                  </div>
                  <div className="form-group">
                    <label>Name *</label>
                    <input type="text" value={withdrawUpiDetails.name} onChange={(e) => setWithdrawUpiDetails(prev => ({ ...prev, name: e.target.value }))} placeholder="Enter your name" />
                  </div>
                </div>
              )}

              {withdrawMethod === 'crypto' && (
                <div className="withdraw-details-form">
                  <div className="form-group">
                    <label>Network *</label>
                    <input type="text" value={withdrawCryptoDetails.network} onChange={(e) => setWithdrawCryptoDetails(prev => ({ ...prev, network: e.target.value }))} placeholder="Enter network (e.g. TRC20, ERC20)" />
                  </div>
                  <div className="form-group">
                    <label>Wallet Address *</label>
                    <input type="text" value={withdrawCryptoDetails.address} onChange={(e) => setWithdrawCryptoDetails(prev => ({ ...prev, address: e.target.value }))} placeholder="Enter wallet address" />
                  </div>
                </div>
              )}

              <button className="submit-btn" onClick={submitWithdraw}>Submit Withdrawal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Market News Component
function MarketNews() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const response = await fetch('https://finnhub.io/api/v1/news?category=general&token=demo');
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        setNews(data.slice(0, 12));
      } else {
        setNews(getSampleNews());
      }
    } catch (error) {
      console.error('Error fetching news:', error);
      setNews(getSampleNews());
    } finally {
      setLoading(false);
    }
  };

  const getSampleNews = () => [
    { id: 1, headline: 'Gold Prices Surge Amid Global Uncertainty', summary: 'Gold prices reached new highs as investors seek safe-haven assets.', image: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=400', source: 'Market Watch', datetime: Date.now() / 1000 - 3600, url: '#', category: 'commodities' },
    { id: 2, headline: 'Fed Signals Potential Rate Cuts in 2026', summary: 'Federal Reserve officials hint at possible interest rate reductions.', image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400', source: 'Reuters', datetime: Date.now() / 1000 - 7200, url: '#', category: 'forex' },
    { id: 3, headline: 'Bitcoin Breaks $100K Resistance Level', summary: 'Cryptocurrency markets rally as Bitcoin surpasses key barrier.', image: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=400', source: 'CoinDesk', datetime: Date.now() / 1000 - 10800, url: '#', category: 'crypto' },
    { id: 4, headline: 'Tech Stocks Lead Market Rally', summary: 'Major technology companies drive gains in US equity markets.', image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400', source: 'Bloomberg', datetime: Date.now() / 1000 - 14400, url: '#', category: 'stocks' },
    { id: 5, headline: 'EUR/USD Volatility Increases on ECB Decision', summary: 'European Central Bank policy announcement sparks currency movements.', image: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400', source: 'FX Street', datetime: Date.now() / 1000 - 18000, url: '#', category: 'forex' },
    { id: 6, headline: 'Oil Prices Stabilize After OPEC Meeting', summary: 'Crude oil markets find balance following production discussions.', image: 'https://images.unsplash.com/photo-1513828583688-c52646db42da?w=400', source: 'Energy News', datetime: Date.now() / 1000 - 21600, url: '#', category: 'commodities' }
  ];

  const formatTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000 / 60);
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const categories = ['all', 'forex', 'crypto', 'stocks', 'commodities'];
  const filteredNews = activeCategory === 'all' ? news : news.filter(item => item.category === activeCategory);

  return (
    <div className="market-news">
      <div className="news-categories">
        {categories.map(cat => (
          <button key={cat} className={`category-btn ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="news-loading">Loading market news...</div>
      ) : (
        <div className="news-grid">
          {filteredNews.map((item, index) => (
            <a key={item.id || index} href={item.url} target="_blank" rel="noopener noreferrer" className="news-card pf-glow">
              <div className="news-image">
                <img src={item.image || 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400'} alt={item.headline} onError={(e) => e.target.src = 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400'} />
                {item.isVideo && (
                  <div className="video-overlay">
                    <span className="play-icon">▶</span>
                  </div>
                )}
              </div>
              <div className="news-content">
                <h4 className="news-headline">{item.headline}</h4>
                <p className="news-summary">{item.summary}</p>
                <div className="news-meta">
                  <span className="news-source">{item.source}</span>
                  <span className="news-time">{formatTime(item.datetime)}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      <div className="youtube-section">
        <h4 className="youtube-title">📚 Market Education</h4>

        <div className="video-category">
          <h5 className="category-title">🎯 Market Basics</h5>
          <div className="youtube-grid">
            <div className="youtube-card pf-glow">
              <iframe src="https://www.youtube.com/embed/p7HKvqRI_Bo" title="Stock Market Explained" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              <div className="video-info"><span className="video-title">Stock Market Explained (Whiteboard)</span></div>
            </div>
            <div className="youtube-card pf-glow">
              <iframe src="https://www.youtube.com/embed/ZCFkWDdmXG8" title="Investing For Beginners" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              <div className="video-info"><span className="video-title">Investing For Beginners (Graham Stephan)</span></div>
            </div>
          </div>
        </div>

        <div className="video-category">
          <h5 className="category-title">₿ Cryptocurrency</h5>
          <div className="youtube-grid">
            <div className="youtube-card pf-glow">
              <iframe src="https://www.youtube.com/embed/bBC-nXj3Ng4" title="How Bitcoin Works" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              <div className="video-info"><span className="video-title">But How Does Bitcoin Actually Work? (3Blue1Brown)</span></div>
            </div>
            <div className="youtube-card pf-glow">
              <iframe src="https://www.youtube.com/embed/Yb6825iv0Vk" title="Crypto Explained" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              <div className="video-info"><span className="video-title">Cryptocurrency Explained (Simply Explained)</span></div>
            </div>
          </div>
        </div>

        <div className="video-category">
          <h5 className="category-title">📊 Technical Analysis</h5>
          <div className="youtube-grid">
            <div className="youtube-card pf-glow">
              <iframe src="https://www.youtube.com/embed/08R_TJhAOGo" title="Technical Analysis" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              <div className="video-info"><span className="video-title">The Only Technical Analysis Video You Need</span></div>
            </div>
            <div className="youtube-card pf-glow">
              <iframe src="https://www.youtube.com/embed/MN3-HJ-pPrg" title="EMA Strategy" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              <div className="video-info"><span className="video-title">The FASTEST & Most AGGRESSIVE EMA Strategy</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main HomePage Component
function HomePage() {
  const {
    user,
    isDark,
    displayCurrency,
    usdInrRate,
    usdMarkup,
    walletData,
    walletINR,
    walletUSD,
    livePrices,
    watchlist,
    setSelectedSymbol,
    navigateToPage,
    isMetaApiConnected,
    totalPnL,
    getTickBySymbolAuto,
    isZerodhaConnected
  } = useOutletContext();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [banners, setBanners] = useState([]);
  const navigate = useNavigate();

  // ─── Demo account widget state ───
  const [demoAccount, setDemoAccount] = useState(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoErr, setDemoErr] = useState('');
  const [demoLoaded, setDemoLoaded] = useState(false);

  const fetchDemo = async () => {
    const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
    if (!authData.token) { setDemoLoaded(true); return null; }
    try {
      const res = await fetch(`${API_URL}/api/prop/demo`, {
        headers: { Authorization: `Bearer ${authData.token}` }
      });
      const data = await res.json();
      if (data.success && data.demo) {
        setDemoAccount(data.demo);
        setDemoErr('');
        setDemoLoaded(true);
        return data.demo;
      } else if (data.message && /disabled/i.test(data.message)) {
        setDemoAccount(null);
      } else {
        setDemoErr(data.message || '');
      }
    } catch (_) { /* network — hide */ }
    setDemoLoaded(true);
    return null;
  };

  useEffect(() => { fetchDemo(); }, []);

  const startDemo = async () => {
    setDemoBusy(true);
    setDemoErr('');
    const demo = await fetchDemo();
    setDemoBusy(false);
    if (demo?._id) {
      navigate(`/app/challenge/${demo._id}`);
    }
  };

  const resetDemo = async () => {
    const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
    if (!confirm('Reset demo balance to initial? Any open demo positions will be cancelled at entry price.')) return;
    setDemoBusy(true);
    setDemoErr('');
    try {
      const res = await fetch(`${API_URL}/api/prop/demo/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authData.token || ''}` }
      });
      const data = await res.json();
      if (data.success) {
        setDemoAccount(data.demo);
      } else {
        setDemoErr(data.message || 'Reset failed');
      }
    } catch (e) { setDemoErr(e.message); }
    setDemoBusy(false);
  };

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const res = await fetch(`${API_URL}/api/banners/active`);
        const data = await res.json();
        if (data.banners && data.banners.length > 0) {
          setBanners(data.banners);
        }
      } catch (error) {
        console.error('Error fetching banners:', error);
      }
    };
    fetchBanners();
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % banners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [banners.length]);

  const n = (v) => Number(v || 0);
  const fmtMoney = (val) => {
    const x = n(val);
    return `₹${x.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  };
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,';
  const initials = (user?.name || 'U')
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const wlSymbols =
    watchlist && watchlist.length > 0
      ? watchlist.slice(0, 8)
      : ['XAUUSD', 'EURUSD', 'BTCUSD', 'GBPUSD', 'USDJPY'];

  const pickQuote = (sym) => {
    const q = livePrices?.[sym];
    if (!q) return { bid: 0, ask: 0, mid: 0 };
    const bid = n(q.bid);
    const ask = n(q.ask);
    const mid = bid && ask ? (bid + ask) / 2 : n(q.lastPrice || q.last || 0);
    return { bid, ask, mid };
  };

  return (
    <div className="home-page">
      {/* Unified home layout — same content for mobile and desktop,
           grid collapses to single column on mobile via CSS */}
      <div className="home-desktop-block" style={{ display: 'block' }}>
        {/* Banner Carousel */}
        <div className="banner-carousel">
          {banners.length === 0 ? (
            <div className="default-banner">
              <div className="banner-content">
                <h2>WELCOME TO DHANFUNDED</h2>
                <p>THE BEST CHOICE FOR FUTURE TRADING</p>
              </div>
            </div>
          ) : (
            <>
              <div className="banner-slides">
                {banners.map((banner, index) => (
                  <div key={banner._id} className={`banner-slide ${index === currentSlide ? 'active' : ''}`}>
                    <img src={banner.imageData || banner.imageUrl} alt="" />
                  </div>
                ))}
              </div>
              {banners.length > 1 && (
                <div className="banner-dots">
                  {banners.map((_, index) => (
                    <button key={index} className={`dot ${index === currentSlide ? 'active' : ''}`} onClick={() => setCurrentSlide(index)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Live market watch — reads the shared Zerodha tick cache */}
        <div style={{ margin: '16px 0' }}>
          <MarketWatchPanel
            watchlist={watchlist}
            getTickBySymbolAuto={getTickBySymbolAuto}
            isZerodhaConnected={isZerodhaConnected}
            setSelectedSymbol={setSelectedSymbol}
            navigateToPage={navigateToPage}
          />
        </div>

        {/* Two-column: Left (accounts + quick actions) | Right (heatmap) */}
        <div className="hp-main-grid">
          <div className="hp-left-col">
            {/* Demo Account Card — free practice account, ₹2L default */}
            {demoLoaded && demoAccount && (() => {
              const bal = n(demoAccount.walletBalance || demoAccount.currentBalance);
              const init = n(demoAccount.initialBalance);
              const pnl = bal - init;
              const pnlPct = init > 0 ? ((pnl / init) * 100).toFixed(2) : '0.00';
              const positive = pnl >= 0;
              return (
                <div className="hp-account-card pf-glow" style={{
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(139,92,246,0.04))',
                  border: '2px solid rgba(139,92,246,0.4)'
                }}>
                  <div className="hp-account-header">
                    <span className="hp-account-label" style={{ color: '#8b5cf6' }}>
                      🎮 DEMO ACCOUNT · {demoAccount.accountId}
                    </span>
                    <span className={`hp-account-badge ${positive ? 'green' : 'red'}`}>
                      {positive ? '+' : ''}{pnlPct}%
                    </span>
                  </div>
                  <div className="hp-account-balance" style={{ color: '#8b5cf6' }}>
                    ₹{bal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="hp-account-stats">
                    <div className="hp-account-stat">
                      <span className="hp-account-stat-label">INITIAL</span>
                      <span className="hp-account-stat-value">{fmtMoney(init)}</span>
                    </div>
                    <div className="hp-account-stat">
                      <span className="hp-account-stat-label">P&amp;L</span>
                      <span className="hp-account-stat-value" style={{ color: positive ? '#10b981' : '#ef4444' }}>
                        {positive ? '+' : ''}{fmtMoney(pnl)}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => navigate(`/app/challenge/${demoAccount._id}`)}
                      style={{
                        flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none',
                        background: '#8b5cf6', color: '#fff', fontWeight: 700, fontSize: 13,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                      }}
                    >
                      <LuPlay size={16} /> Practice Demo
                    </button>
                    <button
                      type="button"
                      onClick={resetDemo}
                      disabled={demoBusy}
                      style={{
                        padding: '10px 14px', borderRadius: 8,
                        background: 'transparent', color: '#8b5cf6',
                        border: '1.5px solid rgba(139,92,246,0.4)',
                        fontWeight: 600, fontSize: 12, cursor: demoBusy ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap'
                      }}
                    >
                      <LuRotateCw size={14} /> Reset
                    </button>
                  </div>
                  {demoErr && (
                    <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6,
                      background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 11 }}>
                      {demoErr}
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-secondary)', textAlign: 'center' }}>
                    Practice freely — no DD limits, no expiry, no risk.
                  </div>
                </div>
              );
            })()}

            {/* "Try Demo" prompt when user has no demo account yet */}
            {demoLoaded && !demoAccount && !demoErr && (
              <div className="hp-account-card pf-glow" style={{
                background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(139,92,246,0.02))',
                border: '2px dashed rgba(139,92,246,0.3)',
                textAlign: 'center', padding: '24px 16px'
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎮</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#8b5cf6', marginBottom: 4 }}>
                  Try Free Demo Account
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                  Practice with virtual funds — no DD limits, no expiry, no payment.
                </div>
                <button
                  type="button"
                  onClick={startDemo}
                  disabled={demoBusy}
                  style={{
                    padding: '10px 24px', borderRadius: 999, border: 'none',
                    background: '#8b5cf6', color: '#fff', fontWeight: 700, fontSize: 13,
                    cursor: demoBusy ? 'not-allowed' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6
                  }}
                >
                  <LuPlay size={16} /> {demoBusy ? 'Starting…' : 'Start Demo'}
                </button>
              </div>
            )}

            {/* USD Account Card */}
            <div className="hp-account-card pf-glow">
              <div className="hp-account-header">
                <span className="hp-account-label">USD ACCOUNT</span>
                {(() => {
                  const eq = n(walletData?.equity);
                  const bal = n(walletData?.balance);
                  const pct = bal > 0 ? (((eq - bal) / bal) * 100).toFixed(1) : '0.0';
                  const positive = Number(pct) >= 0;
                  return (
                    <span className={`hp-account-badge ${positive ? 'green' : 'red'}`}>
                      {positive ? '+' : ''}{pct}%
                    </span>
                  );
                })()}
              </div>
              <div className="hp-account-balance">₹{n(walletData?.balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="hp-account-stats">
                <div className="hp-account-stat">
                  <span className="hp-account-stat-label">FREE MARGIN</span>
                  <span className="hp-account-stat-value">₹{n(walletData?.freeMargin).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="hp-account-stat">
                  <span className="hp-account-stat-label">EQUITY</span>
                  <span className="hp-account-stat-value">₹{n(walletData?.equity).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* INR Account Card */}
            <div className="hp-account-card pf-glow">
              <div className="hp-account-header">
                <span className="hp-account-label">INR ACCOUNT</span>
                <span className="hp-account-badge neutral"><LuMinus size={12} /> Stable</span>
              </div>
              {(() => {
                // Native INR balance (walletINR.balance) — FX-stable so a
                // ₹10,000 deposit always shows ₹10,000 here. Equity adds the
                // native INR credit; free margin = equity − margin converted.
                const inrBalance = n(walletINR?.balance);
                const inrCredit = n(walletData?.creditInr) || n(walletData?.credit) * rate;
                const inrEquity = inrBalance + inrCredit + n(totalPnL) * rate;
                const inrMargin = n(walletData?.margin) * rate;
                const inrFreeMargin = Math.max(0, inrEquity - inrMargin);
                const fmt = (v) => v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
                return (
                  <>
                    <div className="hp-account-balance">₹{fmt(inrBalance)}</div>
                    <div className="hp-account-stats">
                      <div className="hp-account-stat">
                        <span className="hp-account-stat-label">FREE MARGIN</span>
                        <span className="hp-account-stat-value">₹{fmt(inrFreeMargin)}</span>
                      </div>
                      <div className="hp-account-stat">
                        <span className="hp-account-stat-label">EQUITY</span>
                        <span className="hp-account-stat-value">₹{fmt(inrEquity)}</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Quick Actions */}
            <div className="hp-quick-actions-card pf-glow">
              <h3 className="hp-section-title"><LuZap size={18} /> QUICK ACTIONS</h3>
              <button className="hp-action-btn" onClick={() => navigateToPage('wallet')}>
                <span className="hp-action-btn-left">
                  <span className="hp-action-icon deposit"><LuArrowDownToLine size={18} /></span>
                  Deposit Funds
                </span>
                <LuArrowRight size={18} className="hp-action-arrow" />
              </button>
              <button className="hp-action-btn" onClick={() => navigateToPage('wallet')}>
                <span className="hp-action-btn-left">
                  <span className="hp-action-icon withdraw"><LuArrowUpFromLine size={18} /></span>
                  Withdraw Profits
                </span>
                <LuArrowRight size={18} className="hp-action-arrow" />
              </button>
            </div>
          </div>

          {/* Right column: Market Heatmap */}
          <div className="hp-right-col">
            <div className="hp-heatmap-card">
              <div className="hp-heatmap-header">
                <h3 className="hp-section-title" style={{ margin: 0 }}>MARKET HEATMAP</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Top performing assets across indices</span>
              </div>
              <div className="tradingview-widget-container" style={{ height: '100%', minHeight: 420 }}>
                <TradingViewHeatmap isDark={isDark} />
              </div>
            </div>
          </div>
        </div>

        {/* Market News */}
        <div className="hp-news-section">
          <div className="hp-news-header">
            <h3 className="hp-section-title"><LuNewspaper size={18} /> MARKET NEWS & UPDATES</h3>
          </div>
          <MarketNews />
        </div>
      </div>
    </div>
  );
}

export default HomePage;
