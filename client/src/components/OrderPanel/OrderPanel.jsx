import React, { useEffect, useState } from 'react';
import { X, Plus, ChevronDown } from 'lucide-react';
import useStore from '../../store/useStore';
import './OrderPanel.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const leverageOptions = ['1:10', '1:50', '1:100', '1:200', '1:500'];

const OrderPanel = () => {
  const selectedInstrument = useStore((state) => state.selectedInstrument);
  const orderType = useStore((state) => state.orderType);
  const setOrderType = useStore((state) => state.setOrderType);
  const orderSide = useStore((state) => state.orderSide);
  const setOrderSide = useStore((state) => state.setOrderSide);
  const volume = useStore((state) => state.volume);
  const setVolume = useStore((state) => state.setVolume);
  const leverage = useStore((state) => state.leverage);
  const setLeverage = useStore((state) => state.setLeverage);
  const setOrderPanelOpen = useStore((state) => state.setOrderPanelOpen);
  const freeMargin = useStore((state) => state.freeMargin);

  const [showLeverageDropdown, setShowLeverageDropdown] = useState(false);
  const [charges, setCharges] = useState(null);
  const [chargesLoading, setChargesLoading] = useState(false);

  // Fetch real charges from DB when symbol changes
  useEffect(() => {
    const fetchCharges = async () => {
      if (!selectedInstrument?.symbol) return;
      setChargesLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/charges/${selectedInstrument.symbol}`);
        const data = await res.json();
        if (data.success) {
          setCharges(data);
        }
      } catch (err) {
        console.warn('Failed to fetch charges:', err);
      } finally {
        setChargesLoading(false);
      }
    };
    fetchCharges();
  }, [selectedInstrument?.symbol]);

  const leverageMultiplier = parseInt(leverage.split(':')[1]);
  const marginRequired = (volume * selectedInstrument.bid) / leverageMultiplier;
  const buyingPower = freeMargin * leverageMultiplier;

  // Use DB charges if available, fallback to calculated values
  const spreadPips = charges?.spread
    ? charges.spread.totalPips
    : ((selectedInstrument.ask - selectedInstrument.bid) * 10000).toFixed(0);

  const commissionAmount = charges?.commission
    ? (charges.commission.type === 'per-lot'
      ? (charges.commission.open + charges.commission.close) * volume
      : charges.commission.open + charges.commission.close)
    : 0;

  const commissionPerLot = charges?.commission
    ? (charges.commission.open + charges.commission.close)
    : 0;

  const maxLeverage = charges?.leverage?.max || 100;

  const handleVolumeChange = (delta) => {
    const newVol = Math.max(1, Math.round(volume + delta));
    setVolume(newVol);
  };

  const [orderLoading, setOrderLoading] = useState(false);
  const [orderResult, setOrderResult] = useState(null);

  const handleSubmitOrder = async () => {
    // Get user ID from localStorage (set during login)
    const userData = JSON.parse(localStorage.getItem('dhanfunded-user') || '{}');
    const userId = userData.oderId || userData.userId;

    if (!userId) {
      alert('Please login to place orders');
      return;
    }

    const challengeAccountId = localStorage.getItem('dhanfunded-active-challenge') || null;
    if (!challengeAccountId) {
      alert('⚠️ No challenge selected\n\nThis is a prop-evaluation platform — orders can only be placed on an active challenge account, not on your main wallet.\n\nOpen "My Challenges" to pick a challenge, then click "Start Practicing".');
      return;
    }

    setOrderLoading(true);
    setOrderResult(null);

    try {
      const leverageMultiplierVal = parseInt(leverage.split(':')[1]);
      const response = await fetch(`${API_URL}/api/trade/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          symbol: selectedInstrument.symbol,
          side: orderSide,
          volume,
          lotSize: selectedInstrument?.lotSize || 1,
          quantity: parseFloat(volume) * (selectedInstrument?.lotSize || 1),
          leverage: leverageMultiplierVal,
          orderType,
          stopLoss: null,
          takeProfit: null,
          challengeAccountId,
          exchange: selectedInstrument?.exchange || '',
          segment: selectedInstrument?.segment || ''
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setOrderResult({ type: 'success', message: `${orderSide.toUpperCase()} ${volume} lot ${selectedInstrument.symbol} @ ${data.position.entryPrice.toFixed(2)}` });
        // Update store balance
        if (data.wallet) {
          useStore.setState({
            balance: data.wallet.balance,
            equity: data.wallet.equity,
            margin: data.wallet.margin,
            freeMargin: data.wallet.freeMargin
          });
        }
        // Clear result after 3 seconds
        setTimeout(() => setOrderResult(null), 3000);
      } else {
        const errMsg = data.details
          ? `${data.error}\nFree Margin: $${data.details.freeMargin}\nRequired: $${data.details.totalRequired?.toFixed(2) || data.details.marginRequired?.toFixed(2)}`
          : data.error || 'Order failed';
        setOrderResult({ type: 'error', message: errMsg });
        setTimeout(() => setOrderResult(null), 5000);
      }
    } catch (err) {
      setOrderResult({ type: 'error', message: 'Network error: ' + err.message });
      setTimeout(() => setOrderResult(null), 5000);
    } finally {
      setOrderLoading(false);
    }
  };

  return (
    <div className="order-panel">
      <div className="order-panel-header">
        <span className="order-panel-title">{selectedInstrument.symbol} order</span>
        <button className="close-btn" onClick={() => setOrderPanelOpen(false)}>
          <X size={16} />
        </button>
      </div>

      <div className="order-type-tabs">
        <button
          className={`order-type-tab ${orderType === 'market' ? 'active' : ''}`}
          onClick={() => setOrderType('market')}
        >
          Market
        </button>
        <button
          className={`order-type-tab ${orderType === 'pending' ? 'active' : ''}`}
          onClick={() => setOrderType('pending')}
        >
          Pending
        </button>
      </div>

      <div className="order-prices">
        <button
          className={`price-btn sell ${orderSide === 'sell' ? 'active' : ''}`}
          onClick={() => setOrderSide('sell')}
        >
          <span className="price-label">SELL</span>
          <span className="price-value">{selectedInstrument.bid.toFixed(2)}</span>
        </button>
        <button
          className={`price-btn buy ${orderSide === 'buy' ? 'active' : ''}`}
          onClick={() => setOrderSide('buy')}
        >
          <span className="price-label">BUY</span>
          <span className="price-value">{selectedInstrument.ask.toFixed(2)}</span>
        </button>
      </div>

      <div className="order-side-btns">
        <button
          className={`side-btn ${orderSide === 'sell' ? 'active' : ''}`}
          onClick={() => setOrderSide('sell')}
        >
          Sell Side
        </button>
        <button
          className={`side-btn ${orderSide === 'buy' ? 'active' : ''}`}
          onClick={() => setOrderSide('buy')}
        >
          Buy Side
        </button>
      </div>

      <div className="order-form">
        <div className="form-group">
          <label>Volume</label>
          <div className="volume-input">
            <button className="vol-btn" onClick={() => handleVolumeChange(-1)}>-</button>
            <input
              type="number"
              value={volume}
              onChange={(e) => setVolume(Math.max(1, Math.round(parseFloat(e.target.value) || 1)))}
              step="1"
              min="1"
            />
            <button className="vol-btn" onClick={() => handleVolumeChange(1)}>+</button>
          </div>
          <span className="volume-hint">{Math.round(volume)} lots</span>
        </div>

        <div className="form-group">
          <label>Leverage (Max: 1:{maxLeverage})</label>
          <div className="leverage-selector">
            <button
              className="leverage-btn"
              onClick={() => setShowLeverageDropdown(!showLeverageDropdown)}
            >
              {leverage}
              <ChevronDown size={14} />
            </button>
            <div className="leverage-value">₹{marginRequired.toFixed(2)}</div>
            {showLeverageDropdown && (
              <div className="leverage-dropdown">
                {leverageOptions.map(lev => (
                  <button
                    key={lev}
                    className={`leverage-option ${leverage === lev ? 'active' : ''}`}
                    onClick={() => { setLeverage(lev); setShowLeverageDropdown(false); }}
                  >
                    {lev}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="margin-info">
            <span>Margin Required: ${marginRequired.toFixed(2)}</span>
            <span>Free: ${freeMargin.toFixed(2)}</span>
          </div>
          <div className="buying-power">
            Buying Power: ${buyingPower.toFixed(2)}
          </div>
        </div>

        <div className="form-group tp-sl">
          <div className="tp-sl-row">
            <span className="tp-label">Take profit</span>
            <button className="tp-sl-add">
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="form-group tp-sl">
          <div className="tp-sl-row">
            <span className="sl-label">Stop loss</span>
            <button className="tp-sl-add">
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="trading-charges">
          <div className="charges-header">Order Charges {chargesLoading ? '⏳' : charges?.spread ? '✅' : '⚙️'}</div>
          <div className="charge-row">
            <span>Spread</span>
            <span>
              {spreadPips} pips
              {charges?.spread && (
                <span style={{ fontSize: '10px', color: '#888', marginLeft: '4px' }}>
                  ({charges.spread.type})
                </span>
              )}
            </span>
          </div>
          <div className="charge-row">
            <span>Commission</span>
            <span>
              {commissionAmount > 0
                ? `₹${commissionAmount.toFixed(2)} (₹${commissionPerLot.toFixed(2)}/lot)`
                : '₹0.00'}
            </span>
          </div>
          {charges?.swap && (
            <div className="charge-row">
              <span>Swap {orderSide === 'buy' ? '(Long)' : '(Short)'}</span>
              <span style={{ color: (orderSide === 'buy' ? charges.swap.long : charges.swap.short) >= 0 ? '#10b981' : '#ef4444' }}>
                {orderSide === 'buy' ? charges.swap.long : charges.swap.short} {charges.swap.type}
              </span>
            </div>
          )}
          {charges?.margin && (
            <div className="charge-row">
              <span>Margin Rate</span>
              <span>{charges.margin.initial}%</span>
            </div>
          )}
        </div>

        {orderResult && (
          <div style={{
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            marginBottom: '8px',
            whiteSpace: 'pre-line',
            background: orderResult.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            color: orderResult.type === 'success' ? '#10b981' : '#ef4444',
            border: `1px solid ${orderResult.type === 'success' ? '#10b981' : '#ef4444'}`
          }}>
            {orderResult.type === 'success' ? '✅ ' : '❌ '}{orderResult.message}
          </div>
        )}

        <button
          className={`submit-order-btn ${orderSide}`}
          onClick={handleSubmitOrder}
          disabled={orderLoading}
          style={{ opacity: orderLoading ? 0.6 : 1 }}
        >
          {orderLoading ? 'Executing...' : `Open ${orderSide.toUpperCase()} Order`}
        </button>

        <div className="order-summary">
          {Math.round(volume)} lots @ {orderSide === 'buy' ? selectedInstrument.ask.toFixed(2) : selectedInstrument.bid.toFixed(2)}
          {commissionAmount > 0 && <span style={{ color: '#f59e0b', marginLeft: '8px' }}>+ ${commissionAmount.toFixed(2)} comm.</span>}
        </div>
      </div>
    </div>
  );
};

export default OrderPanel;
