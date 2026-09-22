import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function MarketControl() {
  const { API_URL } = useOutletContext();
  
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [editingMarket, setEditingMarket] = useState(null);
  const [marketStatuses, setMarketStatuses] = useState({});
  
  // Holiday form
  const [holidayForm, setHolidayForm] = useState({ date: '', description: '' });
  const [specialSessionForm, setSpecialSessionForm] = useState({ date: '', openTime: '', closeTime: '', description: '' });

  // Fetch all markets
  const fetchMarkets = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/market-control`);
      const data = await res.json();
      if (data.success) {
        setMarkets(data.markets || []);
      }
    } catch (error) {
      console.error('Error fetching markets:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch market statuses
  const fetchMarketStatuses = async () => {
    try {
      const res = await fetch(`${API_URL}/api/market-status`);
      const data = await res.json();
      if (data.success) {
        const statusMap = {};
        data.markets.forEach(m => { statusMap[m.market] = m; });
        setMarketStatuses(statusMap);
      }
    } catch (error) {
      console.error('Error fetching market statuses:', error);
    }
  };

  useEffect(() => {
    fetchMarkets();
    fetchMarketStatuses();
    // Refresh statuses every minute
    const interval = setInterval(fetchMarketStatuses, 60000);
    return () => clearInterval(interval);
  }, []);

  // Update market settings
  const updateMarket = async () => {
    if (!editingMarket) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/market-control/${editingMarket.market}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: editingMarket.isActive,
          tradingHours: editingMarket.tradingHours,
          tradingDays: editingMarket.tradingDays,
          autoSquareOff: editingMarket.autoSquareOff,
          bufferTime: editingMarket.bufferTime,
          closedMessage: editingMarket.closedMessage
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Market settings updated successfully!');
        setEditingMarket(null);
        fetchMarkets();
        fetchMarketStatuses();
      } else {
        alert(data.error || 'Failed to update market');
      }
    } catch (error) {
      console.error('Error updating market:', error);
      alert('Error updating market');
    }
  };

  // Toggle market active status
  const toggleMarketActive = async (market) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/market-control/${market.market}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !market.isActive })
      });
      const data = await res.json();
      if (data.success) {
        fetchMarkets();
        fetchMarketStatuses();
      }
    } catch (error) {
      console.error('Error toggling market:', error);
    }
  };

  // Add holiday
  const addHoliday = async () => {
    if (!selectedMarket || !holidayForm.date) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/market-control/${selectedMarket.market}/holidays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holidayForm)
      });
      const data = await res.json();
      if (data.success) {
        setHolidayForm({ date: '', description: '' });
        setSelectedMarket(data.market);
        fetchMarkets();
      } else {
        alert(data.error || 'Failed to add holiday');
      }
    } catch (error) {
      console.error('Error adding holiday:', error);
    }
  };

  // Remove holiday
  const removeHoliday = async (holidayId) => {
    if (!selectedMarket) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/market-control/${selectedMarket.market}/holidays/${holidayId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setSelectedMarket(data.market);
        fetchMarkets();
      }
    } catch (error) {
      console.error('Error removing holiday:', error);
    }
  };

  // Add special session
  const addSpecialSession = async () => {
    if (!selectedMarket || !specialSessionForm.date || !specialSessionForm.openTime || !specialSessionForm.closeTime) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/market-control/${selectedMarket.market}/special-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(specialSessionForm)
      });
      const data = await res.json();
      if (data.success) {
        setSpecialSessionForm({ date: '', openTime: '', closeTime: '', description: '' });
        setSelectedMarket(data.market);
        fetchMarkets();
      } else {
        alert(data.error || 'Failed to add special session');
      }
    } catch (error) {
      console.error('Error adding special session:', error);
    }
  };

  // Remove special session
  const removeSpecialSession = async (sessionId) => {
    if (!selectedMarket) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/market-control/${selectedMarket.market}/special-sessions/${sessionId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setSelectedMarket(data.market);
        fetchMarkets();
      }
    } catch (error) {
      console.error('Error removing special session:', error);
    }
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>🕐 Market Control</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '5px' }}>Control market timing and session hours for Indian markets</p>
      </div>

      {/* Market Status Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '30px' }}>
        {markets.map(market => {
          const status = marketStatuses[market.market];
          const isOpen = status?.isOpen;
          return (
            <div key={market.market} style={{ 
              background: 'var(--bg-secondary)',
              borderRadius: '12px', 
              padding: '20px',
              border: `2px solid ${isOpen ? 'var(--success)' : 'var(--danger)'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px' }}>{market.displayName}</h3>
                <div style={{ 
                  width: '12px', height: '12px', borderRadius: '50%', 
                  background: isOpen ? 'var(--success)' : 'var(--danger)',
                  boxShadow: `0 0 10px ${isOpen ? 'var(--success)' : 'var(--danger)'}`
                }} />
              </div>
              <p style={{ margin: 0, color: isOpen ? 'var(--success)' : 'var(--danger)', fontSize: '14px', fontWeight: 500 }}>
                {isOpen ? 'OPEN' : 'CLOSED'}
              </p>
              <p style={{ margin: '5px 0 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                {market.tradingHours?.openTime} - {market.tradingHours?.closeTime}
              </p>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading markets...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Markets List */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>Markets Configuration</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {markets.map(market => (
                <div key={market.market} style={{ 
                  background: 'var(--bg-tertiary)', 
                  borderRadius: '10px', 
                  padding: '15px',
                  border: selectedMarket?.market === market.market ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                  cursor: 'pointer'
                }} onClick={() => setSelectedMarket(market)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>{market.displayName}</h4>
                      <p style={{ margin: '3px 0 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                        {market.tradingHours?.openTime} - {market.tradingHours?.closeTime} IST
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleMarketActive(market); }}
                        style={{ 
                          padding: '6px 12px', 
                          borderRadius: '6px', 
                          background: market.isActive ? 'var(--success)' : 'var(--danger)', 
                          color: '#fff', 
                          border: 'none', 
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        {market.isActive ? 'Active' : 'Disabled'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingMarket({...market}); }}
                        style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--accent-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  {/* Auto Square-Off / Intraday→CF info on card */}
                  <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: market.autoSquareOff?.enabled ? 'rgba(16,185,129,0.08)' : 'rgba(100,116,139,0.08)', border: `1px solid ${market.autoSquareOff?.enabled ? 'rgba(16,185,129,0.2)' : 'rgba(100,116,139,0.15)'}`, fontSize: 11 }}>
                    <span style={{ fontWeight: 600, color: market.autoSquareOff?.enabled ? '#10b981' : 'var(--text-muted)' }}>
                      {market.autoSquareOff?.enabled ? `⏰ Intraday → CF at ${market.autoSquareOff?.time || '15:30'} IST` : '⏸ No auto square-off / conversion'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                    {dayNames.map((day, idx) => (
                      <span key={idx} style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        background: market.tradingDays?.includes(idx) ? 'var(--accent-primary)' : 'var(--bg-hover)',
                        color: market.tradingDays?.includes(idx) ? '#fff' : 'var(--text-muted)'
                      }}>
                        {day}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Market Details / Edit Panel */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)' }}>
            {editingMarket ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>Edit {editingMarket.displayName}</h3>
                  <button onClick={() => setEditingMarket(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}>×</button>
                </div>

                {/* Market Hours */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>Market Hours (IST)</label>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                      type="time"
                      value={editingMarket.tradingHours?.openTime || '09:15'}
                      onChange={(e) => setEditingMarket(prev => ({ ...prev, tradingHours: { ...prev.tradingHours, openTime: e.target.value } }))}
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>to</span>
                    <input
                      type="time"
                      value={editingMarket.tradingHours?.closeTime || '15:30'}
                      onChange={(e) => setEditingMarket(prev => ({ ...prev, tradingHours: { ...prev.tradingHours, closeTime: e.target.value } }))}
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                {/* Market Days */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>Market Days</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {dayNames.map((day, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          const days = editingMarket.tradingDays || [];
                          const newDays = days.includes(idx) ? days.filter(d => d !== idx) : [...days, idx];
                          setEditingMarket(prev => ({ ...prev, tradingDays: newDays }));
                        }}
                        style={{ 
                          padding: '8px 12px', 
                          borderRadius: '6px', 
                          background: editingMarket.tradingDays?.includes(idx) ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                          color: editingMarket.tradingDays?.includes(idx) ? '#fff' : 'var(--text-primary)',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer'
                        }}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto Square Off / Intraday → Carryforward Conversion */}
                <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                    Auto Square-Off / Intraday → Carryforward
                  </label>
                  <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.4 }}>
                    At the configured time (IST), all intraday positions in this market will be checked.
                    If the user has enough free margin for the overnight rate, the trade converts to carryforward (and swap will apply later).
                    If not, the trade is auto-closed. Disable this for 24h markets like Forex/Crypto if you don't want auto-conversion.
                  </p>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={editingMarket.autoSquareOff?.enabled !== false}
                        onChange={(e) => setEditingMarket(prev => ({ ...prev, autoSquareOff: { ...prev.autoSquareOff, enabled: e.target.checked } }))}
                        style={{ width: 18, height: 18 }}
                      />
                      Enable auto conversion / square-off
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Time (IST):</span>
                      <input
                        type="time"
                        value={editingMarket.autoSquareOff?.time || '15:30'}
                        onChange={(e) => setEditingMarket(prev => ({ ...prev, autoSquareOff: { ...prev.autoSquareOff, time: e.target.value } }))}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Buffer Time */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>Buffer Time (minutes)</label>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Before Open</span>
                      <input
                        type="number"
                        value={editingMarket.bufferTime?.beforeOpen || 0}
                        onChange={(e) => setEditingMarket(prev => ({ ...prev, bufferTime: { ...prev.bufferTime, beforeOpen: parseInt(e.target.value) || 0 } }))}
                        style={{ width: '80px', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', marginLeft: '10px' }}
                      />
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>After Close</span>
                      <input
                        type="number"
                        value={editingMarket.bufferTime?.afterClose || 0}
                        onChange={(e) => setEditingMarket(prev => ({ ...prev, bufferTime: { ...prev.bufferTime, afterClose: parseInt(e.target.value) || 0 } }))}
                        style={{ width: '80px', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', marginLeft: '10px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Closed Message */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>Closed Message</label>
                  <textarea
                    value={editingMarket.closedMessage || ''}
                    onChange={(e) => setEditingMarket(prev => ({ ...prev, closedMessage: e.target.value }))}
                    placeholder="Message to show when market is closed"
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', minHeight: '60px', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setEditingMarket(null)} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={updateMarket} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'var(--accent-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>Save Changes</button>
                </div>
              </>
            ) : selectedMarket ? (
              <>
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>{selectedMarket.displayName} - Holidays & Sessions</h3>

                {/* Add Holiday */}
                <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--bg-tertiary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ color: 'var(--text-primary)', margin: '0 0 10px 0', fontSize: '14px' }}>📅 Add Holiday</h4>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input
                      type="date"
                      value={holidayForm.date}
                      onChange={(e) => setHolidayForm(prev => ({ ...prev, date: e.target.value }))}
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                    <input
                      type="text"
                      placeholder="Description (e.g., Diwali)"
                      value={holidayForm.description}
                      onChange={(e) => setHolidayForm(prev => ({ ...prev, description: e.target.value }))}
                      style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                    <button onClick={addHoliday} style={{ padding: '10px 20px', borderRadius: '6px', background: 'var(--success)', color: '#fff', border: 'none', cursor: 'pointer' }}>Add</button>
                  </div>
                </div>

                {/* Holidays List */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ color: 'var(--text-muted)', margin: '0 0 10px 0', fontSize: '12px' }}>HOLIDAYS ({selectedMarket.holidays?.length || 0})</h4>
                  {selectedMarket.holidays?.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No holidays configured</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflow: 'auto' }}>
                      {selectedMarket.holidays?.map(h => (
                        <div key={h._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <div>
                            <span style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            {h.description && <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '10px' }}>- {h.description}</span>}
                          </div>
                          <button onClick={() => removeHoliday(h._id)} style={{ background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add Special Session */}
                <div style={{ marginBottom: '20px', padding: '15px', background: 'color-mix(in srgb, var(--success) 12%, var(--bg-tertiary))', borderRadius: '10px', border: '1px solid color-mix(in srgb, var(--success) 35%, var(--border-color))' }}>
                  <h4 style={{ color: 'var(--success)', margin: '0 0 10px 0', fontSize: '14px' }}>✨ Add Special Session (e.g., Muhurat Session)</h4>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input
                      type="date"
                      value={specialSessionForm.date}
                      onChange={(e) => setSpecialSessionForm(prev => ({ ...prev, date: e.target.value }))}
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                    <input
                      type="time"
                      value={specialSessionForm.openTime}
                      onChange={(e) => setSpecialSessionForm(prev => ({ ...prev, openTime: e.target.value }))}
                      placeholder="Open"
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                    <input
                      type="time"
                      value={specialSessionForm.closeTime}
                      onChange={(e) => setSpecialSessionForm(prev => ({ ...prev, closeTime: e.target.value }))}
                      placeholder="Close"
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                    <input
                      type="text"
                      placeholder="Description"
                      value={specialSessionForm.description}
                      onChange={(e) => setSpecialSessionForm(prev => ({ ...prev, description: e.target.value }))}
                      style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                    <button onClick={addSpecialSession} style={{ padding: '10px 20px', borderRadius: '6px', background: 'var(--success)', color: '#fff', border: 'none', cursor: 'pointer' }}>Add</button>
                  </div>
                </div>

                {/* Special Sessions List */}
                <div>
                  <h4 style={{ color: 'var(--text-muted)', margin: '0 0 10px 0', fontSize: '12px' }}>SPECIAL SESSIONS ({selectedMarket.specialSessions?.length || 0})</h4>
                  {selectedMarket.specialSessions?.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No special sessions configured</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedMarket.specialSessions?.map(s => (
                        <div key={s._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'color-mix(in srgb, var(--success) 10%, var(--bg-tertiary))', borderRadius: '6px', border: '1px solid color-mix(in srgb, var(--success) 30%, var(--border-color))' }}>
                          <div>
                            <span style={{ color: 'var(--success)', fontSize: '13px' }}>{new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            <span style={{ color: 'var(--text-primary)', fontSize: '12px', marginLeft: '10px' }}>{s.openTime} - {s.closeTime}</span>
                            {s.description && <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '10px' }}>({s.description})</span>}
                          </div>
                          <button onClick={() => removeSpecialSession(s._id)} style={{ background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '48px', marginBottom: '15px' }}>🕐</div>
                <h3 style={{ color: 'var(--text-primary)', margin: '0 0 10px 0' }}>Select a Market</h3>
                <p style={{ margin: 0 }}>Click on a market from the list to manage holidays and special sessions</p>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 1024px) {
          .admin-page > div:last-child {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

export default MarketControl;
