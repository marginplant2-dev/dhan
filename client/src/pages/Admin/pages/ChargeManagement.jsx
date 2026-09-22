import { useState, useEffect } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';
import { formatIndianSegmentCode } from '../../../constants/indianSegmentLabels';

function ChargeManagement() {
  const { API_URL } = useOutletContext();
  const location = useLocation();
  
  // Charges state - using localStorage with cascading hierarchy
  const [charges, setCharges] = useState(() => {
    const saved = localStorage.getItem('dhanfunded-charges');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState(''); // 'commission', 'spread', 'swap'
  const [editItem, setEditItem] = useState(null);
  
  // Form state with cascading hierarchy
  const [chargeForm, setChargeForm] = useState({
    level: 'GLOBAL', // GLOBAL, SEGMENT, INSTRUMENT, USER
    segment: '',
    instrumentSymbol: '',
    userId: '',
    userName: '',
    // Commission fields
    commissionType: 'PER_LOT', // PER_LOT, PER_TRADE, PERCENTAGE
    commissionValue: 0,
    commissionOnBuy: true,
    commissionOnSell: true,
    commissionOnClose: false,
    // Spread fields
    spreadType: 'FIXED', // FIXED, VARIABLE
    spreadValue: 0,
    // Swap fields
    swapLong: 0,
    swapShort: 0,
    // Common
    isActive: true
  });

  // Segments list - separated by market type
  const forexCryptoSegments = ['Forex', 'Metals', 'Crypto', 'Indices', 'Energy'];
  const indianSegments = ['NSE_EQ', 'NSE_FUT', 'NSE_OPT', 'BSE_EQ', 'BSE_FUT', 'MCX_FUT', 'MCX_OPT'];
  const segments = [...forexCryptoSegments, ...indianSegments];
  
  // Market type filter for spread section
  const [spreadMarketType, setSpreadMarketType] = useState('forex'); // 'forex' or 'indian'
  
  // Instruments by segment
  const instrumentsBySegment = {
    Forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD', 'EURGBP', 'EURJPY', 'GBPJPY'],
    Metals: ['XAUUSD', 'XAGUSD'],
    Crypto: ['BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD', 'BNBUSD'],
    Indices: ['US30', 'US500', 'NAS100', 'UK100', 'GER40'],
    Energy: ['USOIL', 'UKOIL', 'NGAS'],
    // Indian segments - will be populated from Zerodha subscribed instruments
    NSE_EQ: [],
    NSE_FUT: [],
    NSE_OPT: [],
    BSE_EQ: [],
    BSE_FUT: [],
    MCX_FUT: [],
    MCX_OPT: []
  };
  
  // Check if segment is Indian
  const isIndianSegment = (segment) => {
    return indianSegments.includes(segment) || 
           segment?.startsWith('NSE') || 
           segment?.startsWith('BSE') || 
           segment?.startsWith('MCX');
  };

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('/commission')) return 'commission';
    if (path.includes('/swap')) return 'swap';
    if (path.includes('/margin')) return 'margin';
    if (path.includes('/leverage')) return 'leverage';
    return 'spread';
  };

  const activeTab = getActiveTab();

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('dhanfunded-charges', JSON.stringify(charges));
  }, [charges]);

  // Filter charges by type
  const getChargesByType = (type) => {
    if (type === 'commission') return charges.filter(c => c.commissionValue > 0);
    if (type === 'spread') return charges.filter(c => c.spreadValue > 0);
    if (type === 'swap') return charges.filter(c => c.swapLong !== 0 || c.swapShort !== 0);
    return charges;
  };

  // Save charge
  const saveCharge = () => {
    if (editItem) {
      setCharges(prev => prev.map(c => c.id === editItem.id ? { ...c, ...chargeForm } : c));
      alert('Charge updated!');
    } else {
      const newCharge = { id: Date.now().toString(), ...chargeForm, createdAt: new Date().toISOString() };
      setCharges(prev => [...prev, newCharge]);
      alert('Charge added!');
    }
    resetForm();
    setShowModal(false);
  };

  // Delete charge
  const deleteCharge = (id) => {
    if (!confirm('Are you sure you want to delete this charge?')) return;
    setCharges(prev => prev.filter(c => c.id !== id));
    alert('Charge deleted!');
  };

  // Reset form
  const resetForm = () => {
    setChargeForm({
      level: 'GLOBAL',
      segment: '',
      instrumentSymbol: '',
      userId: '',
      userName: '',
      commissionType: 'PER_LOT',
      commissionValue: 0,
      commissionOnBuy: true,
      commissionOnSell: true,
      commissionOnClose: false,
      spreadType: 'FIXED',
      spreadValue: 0,
      swapLong: 0,
      swapShort: 0,
      isActive: true
    });
    setEditItem(null);
  };

  // Open modal
  const openModal = (type, item = null) => {
    setModalType(type);
    setEditItem(item);
    if (item) {
      setChargeForm({ ...item });
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  // Get level label
  const getLevelLabel = (charge) => {
    if (charge.level === 'USER') return `User: ${charge.userName || 'Unknown'}`;
    if (charge.level === 'INSTRUMENT') return charge.instrumentSymbol;
    if (charge.level === 'SEGMENT') return charge.segment;
    return 'Global (All)';
  };

  // Update level based on selections
  const updateLevel = (field, value) => {
    setChargeForm(prev => {
      const updated = { ...prev, [field]: value };
      // Determine level based on what's filled
      if (updated.userId) {
        updated.level = 'USER';
      } else if (updated.instrumentSymbol) {
        updated.level = 'INSTRUMENT';
      } else if (updated.segment) {
        updated.level = 'SEGMENT';
      } else {
        updated.level = 'GLOBAL';
      }
      return updated;
    });
  };

  const getTabTitle = () => {
    const titles = {
      spread: 'Spread Settings',
      commission: 'Commission Settings',
      swap: 'Swap Settings',
      margin: 'Margin Settings',
      leverage: 'Leverage Settings'
    };
    return titles[activeTab] || 'Charge Management';
  };

  const currentCharges = getChargesByType(activeTab);

  // Get available instruments based on selected segment
  const getAvailableInstruments = () => {
    if (chargeForm.segment) {
      return instrumentsBySegment[chargeForm.segment] || [];
    }
    return Object.values(instrumentsBySegment).flat();
  };

  // Filter charges by market type for spread
  const getFilteredCharges = () => {
    let filtered = getChargesByType(activeTab);
    if (activeTab === 'spread') {
      if (spreadMarketType === 'forex') {
        filtered = filtered.filter(c => !isIndianSegment(c.segment));
      } else {
        filtered = filtered.filter(c => isIndianSegment(c.segment) || c.segment?.startsWith('NSE') || c.segment?.startsWith('BSE') || c.segment?.startsWith('MCX'));
      }
    }
    return filtered;
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>{getTabTitle()}</h2>
        <button onClick={() => openModal(activeTab)} className="admin-btn primary">+ Add {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</button>
      </div>

      {/* Market Type Tabs for Spread */}
      {activeTab === 'spread' && (
        <div className="admin-sub-tabs" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <button 
            className={`admin-btn ${spreadMarketType === 'forex' ? 'primary' : ''}`}
            onClick={() => setSpreadMarketType('forex')}
            style={{ padding: '8px 20px' }}
          >
            🌍 Forex / Crypto / Metals
          </button>
          <button 
            className={`admin-btn ${spreadMarketType === 'indian' ? 'primary' : ''}`}
            onClick={() => setSpreadMarketType('indian')}
            style={{ padding: '8px 20px' }}
          >
            🇮🇳 Indian Instruments (NSE/BSE/MCX)
          </button>
        </div>
      )}

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>Applies To</th>
              <th>Value</th>
              <th>Type</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {getFilteredCharges().length === 0 ? (
              <tr><td colSpan="6" className="no-data">No {activeTab} settings configured {activeTab === 'spread' ? `for ${spreadMarketType === 'forex' ? 'Forex/Crypto' : 'Indian instruments'}` : ''}</td></tr>
            ) : (
              getFilteredCharges().map((item, idx) => (
                <tr key={item.id || idx}>
                  <td><span className="mode-badge">{item.level}</span></td>
                  <td>{getLevelLabel(item)}</td>
                  <td className="text-success">
                    {activeTab === 'commission' && `₹${item.commissionValue} (${item.commissionType})`}
                    {activeTab === 'spread' && `${item.spreadValue} pips (${item.spreadType})`}
                    {activeTab === 'swap' && `Long: ${item.swapLong} | Short: ${item.swapShort}`}
                  </td>
                  <td>
                    {activeTab === 'commission' && item.commissionType}
                    {activeTab === 'spread' && item.spreadType}
                    {activeTab === 'swap' && 'Points/Lot'}
                  </td>
                  <td>
                    <span className={`status-badge status-${item.isActive ? 'active' : 'inactive'}`}>
                      {item.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button onClick={() => openModal(activeTab, item)} className="admin-btn primary small">Edit</button>
                      <button onClick={() => deleteCharge(item.id)} className="admin-btn danger small">Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Commission Modal */}
      {showModal && modalType === 'commission' && (
        <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 550 }}>
            <div className="admin-modal-header">
              <h3>{editItem ? 'Edit' : 'Add'} Commission</h3>
              <button onClick={() => setShowModal(false)} className="admin-modal-close">&times;</button>
            </div>
            <div className="admin-modal-body">
              <p className="text-muted" style={{ marginBottom: 16, fontSize: 12 }}>
                Cascading hierarchy: User → Instrument → Segment → Global. More specific settings override general ones.
              </p>
              
              <div className="admin-form-group">
                <label>1. Segment (optional)</label>
                <select value={chargeForm.segment} onChange={(e) => updateLevel('segment', e.target.value)} className="admin-select">
                  <option value="">All Segments (Global)</option>
                  {segments.map(s => <option key={s} value={s}>{formatIndianSegmentCode(s)}</option>)}
                </select>
              </div>
              
              <div className="admin-form-group">
                <label>2. Instrument (optional)</label>
                <select value={chargeForm.instrumentSymbol} onChange={(e) => updateLevel('instrumentSymbol', e.target.value)} className="admin-select">
                  <option value="">All Instruments</option>
                  {getAvailableInstruments().map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              
              <div className="admin-form-group">
                <label>3. Specific User (optional - highest priority)</label>
                <input type="text" value={chargeForm.userName} onChange={(e) => { setChargeForm(prev => ({ ...prev, userName: e.target.value, userId: e.target.value ? 'custom' : '', level: e.target.value ? 'USER' : (prev.instrumentSymbol ? 'INSTRUMENT' : (prev.segment ? 'SEGMENT' : 'GLOBAL')) })); }} className="admin-input" placeholder="Enter user name/email for override" />
              </div>

              <div style={{ background: 'var(--bg-tertiary)', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
                <strong>Applies to:</strong> {chargeForm.level} - {getLevelLabel(chargeForm)}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <div className="admin-form-group">
                  <label>Commission Type</label>
                  <select value={chargeForm.commissionType} onChange={(e) => setChargeForm(prev => ({ ...prev, commissionType: e.target.value }))} className="admin-select">
                    <option value="PER_LOT">Per Lot ($)</option>
                    <option value="PER_TRADE">Per Position ($)</option>
                    <option value="PERCENTAGE">Percentage (%)</option>
                  </select>
                </div>
                <div className="admin-form-group">
                  <label>Value</label>
                  <input type="number" step="0.01" value={chargeForm.commissionValue} onChange={(e) => setChargeForm(prev => ({ ...prev, commissionValue: parseFloat(e.target.value) || 0 }))} className="admin-input" />
                </div>
              </div>
              
              <div className="admin-form-group">
                <label>Charge on:</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label className="admin-toggle">
                    <input type="checkbox" checked={chargeForm.commissionOnBuy} onChange={(e) => setChargeForm(prev => ({ ...prev, commissionOnBuy: e.target.checked }))} />
                    Buy
                  </label>
                  <label className="admin-toggle">
                    <input type="checkbox" checked={chargeForm.commissionOnSell} onChange={(e) => setChargeForm(prev => ({ ...prev, commissionOnSell: e.target.checked }))} />
                    Sell
                  </label>
                  <label className="admin-toggle">
                    <input type="checkbox" checked={chargeForm.commissionOnClose} onChange={(e) => setChargeForm(prev => ({ ...prev, commissionOnClose: e.target.checked }))} />
                    Close
                  </label>
                </div>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button onClick={() => setShowModal(false)} className="admin-btn">Cancel</button>
              <button onClick={saveCharge} className="admin-btn primary">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Spread Modal */}
      {showModal && modalType === 'spread' && (
        <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="admin-modal-header">
              <h3>{editItem ? 'Edit' : 'Add'} Spread - {spreadMarketType === 'forex' ? '🌍 Forex/Crypto' : '🇮🇳 Indian Instruments'}</h3>
              <button onClick={() => setShowModal(false)} className="admin-modal-close">&times;</button>
            </div>
            <div className="admin-modal-body">
              {/* Market Type Info */}
              <div style={{ background: spreadMarketType === 'indian' ? 'rgba(255, 153, 0, 0.1)' : 'rgba(59, 130, 246, 0.1)', padding: 12, borderRadius: 8, marginBottom: 16, border: `1px solid ${spreadMarketType === 'indian' ? '#ff9900' : '#3b82f6'}` }}>
                <strong>{spreadMarketType === 'forex' ? '🌍 Forex / Crypto / Metals' : '🇮🇳 Indian Market (NSE/BSE/MCX)'}</strong>
                <p style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>
                  {spreadMarketType === 'forex' 
                    ? 'Spread is added to Ask price. Bid stays as live market price.' 
                    : 'Spread is added to Ask price for Indian instruments. Configure per segment or specific symbol.'}
                </p>
              </div>

              <div className="admin-form-group">
                <label>1. Segment (optional)</label>
                <select value={chargeForm.segment} onChange={(e) => updateLevel('segment', e.target.value)} className="admin-select">
                  <option value="">All {spreadMarketType === 'forex' ? 'Forex/Crypto' : 'Indian'} Segments (Global)</option>
                  {(spreadMarketType === 'forex' ? forexCryptoSegments : indianSegments).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              
              <div className="admin-form-group">
                <label>2. Instrument Symbol (optional - type to enter)</label>
                <input 
                  type="text" 
                  value={chargeForm.instrumentSymbol} 
                  onChange={(e) => updateLevel('instrumentSymbol', e.target.value.toUpperCase())} 
                  className="admin-input" 
                  placeholder={spreadMarketType === 'forex' ? 'e.g., XAUUSD, BTCUSD, EURUSD' : 'e.g., RELIANCE, SBIN, NIFTY24MARFUT'}
                />
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {spreadMarketType === 'forex' 
                    ? 'Enter exact symbol like XAUUSD, BTCUSD, etc.' 
                    : 'Enter exact market symbol from Zerodha (e.g., RELIANCE, SBIN, NIFTY24MARFUT)'}
                </p>
              </div>

              <div style={{ background: 'var(--bg-tertiary)', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
                <strong>Applies to:</strong> {chargeForm.level} - {getLevelLabel(chargeForm)}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <div className="admin-form-group">
                  <label>Spread Type</label>
                  <select value={chargeForm.spreadType} onChange={(e) => setChargeForm(prev => ({ ...prev, spreadType: e.target.value }))} className="admin-select">
                    <option value="FIXED">Fixed</option>
                    <option value="VARIABLE">Variable</option>
                  </select>
                </div>
                <div className="admin-form-group">
                  <label>Spread Value ({spreadMarketType === 'indian' ? '₹' : 'pips'})</label>
                  <input type="number" step="0.01" value={chargeForm.spreadValue} onChange={(e) => setChargeForm(prev => ({ ...prev, spreadValue: parseFloat(e.target.value) || 0 }))} className="admin-input" />
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {spreadMarketType === 'indian' 
                      ? 'Value in Rupees (e.g., 0.50 = ₹0.50 added to ask)' 
                      : 'Value in pips (e.g., 0.5 = 0.5 pips spread)'}
                  </p>
                </div>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button onClick={() => setShowModal(false)} className="admin-btn">Cancel</button>
              <button onClick={saveCharge} className="admin-btn primary">Save Spread</button>
            </div>
          </div>
        </div>
      )}

      {/* Swap Modal */}
      {showModal && modalType === 'swap' && (
        <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 550 }}>
            <div className="admin-modal-header">
              <h3>{editItem ? 'Edit' : 'Add'} Swap</h3>
              <button onClick={() => setShowModal(false)} className="admin-modal-close">&times;</button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-form-group">
                <label>1. Segment (optional)</label>
                <select value={chargeForm.segment} onChange={(e) => updateLevel('segment', e.target.value)} className="admin-select">
                  <option value="">All Segments (Global)</option>
                  {segments.map(s => <option key={s} value={s}>{formatIndianSegmentCode(s)}</option>)}
                </select>
              </div>
              
              <div className="admin-form-group">
                <label>2. Instrument (optional)</label>
                <select value={chargeForm.instrumentSymbol} onChange={(e) => updateLevel('instrumentSymbol', e.target.value)} className="admin-select">
                  <option value="">All Instruments</option>
                  {getAvailableInstruments().map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <div className="admin-form-group">
                  <label>Swap Long (points/lot)</label>
                  <input type="number" step="0.01" value={chargeForm.swapLong} onChange={(e) => setChargeForm(prev => ({ ...prev, swapLong: parseFloat(e.target.value) || 0 }))} className="admin-input" />
                </div>
                <div className="admin-form-group">
                  <label>Swap Short (points/lot)</label>
                  <input type="number" step="0.01" value={chargeForm.swapShort} onChange={(e) => setChargeForm(prev => ({ ...prev, swapShort: parseFloat(e.target.value) || 0 }))} className="admin-input" />
                </div>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button onClick={() => setShowModal(false)} className="admin-btn">Cancel</button>
              <button onClick={saveCharge} className="admin-btn primary">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Generic Modal for Margin/Leverage */}
      {showModal && (modalType === 'margin' || modalType === 'leverage') && (
        <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{editItem ? 'Edit' : 'Add'} {modalType.charAt(0).toUpperCase() + modalType.slice(1)}</h3>
              <button onClick={() => setShowModal(false)} className="admin-modal-close">&times;</button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-placeholder">
                <div className="placeholder-icon">🔧</div>
                <p>{modalType.charAt(0).toUpperCase() + modalType.slice(1)} settings coming soon</p>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button onClick={() => setShowModal(false)} className="admin-btn">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChargeManagement;
