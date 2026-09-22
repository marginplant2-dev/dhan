import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import HedgingUserSegmentOverrides from './HedgingUserSegmentOverrides';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function HedgingSegmentSettings() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const activeTab = tab === 'scripts' ? 'scripts' : tab === 'users' ? 'users' : 'hedging-settings';
  
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  // State for inline table editing
  const [editingSegments, setEditingSegments] = useState({});
  const [savingSegments, setSavingSegments] = useState(false);
  
  // Parameter Type for filtering columns
  const [parameterType, setParameterType] = useState('contract_specs');
  
  // Script Overrides State
  const [scripts, setScripts] = useState([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [scriptsPagination, setScriptsPagination] = useState({ total: 0, page: 1, limit: 50, pages: 0 });
  const [scriptSearch, setScriptSearch] = useState('');
  
  // Add Script Form State
  const [showAddScript, setShowAddScript] = useState(false);
  const [addingScript, setAddingScript] = useState(false);
  const [newScriptForm, setNewScriptForm] = useState({
    symbol: '',
    segmentId: '',
    contractSize: 100000,
    digits: 5,
    pipSize: 0.0001,
    pipValue: 10,
    minLots: 0.01,
    maxLots: 100,
    lotStep: 0.01,
    maxLeverage: 500,
    defaultLeverage: 100,
    spreadType: 'floating',
    spreadPips: 0,
    commission: 0,
    swapLong: 0,
    swapShort: 0,
    isActive: true
  });
  
  // Script inline editing state
  const [editingScripts, setEditingScripts] = useState({});
  const [savingScripts, setSavingScripts] = useState(false);
  const [scriptParameterType, setScriptParameterType] = useState('trading_limits');
  
  // Segment instruments for adding scripts
  const [selectedAddSegment, setSelectedAddSegment] = useState('');
  const [segmentInstruments, setSegmentInstruments] = useState([]);
  const [instrumentsLoading, setInstrumentsLoading] = useState(false);
  const [instrumentFilter, setInstrumentFilter] = useState('');
  const [addingSymbol, setAddingSymbol] = useState(''); // symbol currently being added
  
  // Toast
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Fetch Hedging segments (Forex + Crypto only - no Indian markets)
  const fetchSegments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/admin/hedging/segments`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (data.success) {
        setSegments(data.segments);
      }
    } catch (error) {
      console.error('Error fetching hedging segments:', error);
      showToast('Error loading segments', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments]);

  // Fetch Hedging Scripts
  const fetchScripts = useCallback(async (page = 1, search = '') => {
    try {
      setScriptsLoading(true);
      const queryParams = new URLSearchParams({
        page,
        limit: 50,
        search: search || '',
      });
      
      const res = await fetch(`${API_URL}/api/admin/hedging/scripts?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      
      if (data.success) {
        setScripts(data.scripts || []);
        setScriptsPagination(data.pagination || { total: 0, page: 1, limit: 50, pages: 0 });
      }
    } catch (error) {
      console.error('Error fetching hedging scripts:', error);
      showToast('Error loading scripts', 'error');
    } finally {
      setScriptsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'scripts') {
      fetchScripts(1, scriptSearch);
    }
  }, [activeTab, fetchScripts, scriptSearch]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // Update script cell for inline editing
  const updateScriptCell = (scriptId, key, value) => {
    const script = scripts.find(s => s._id === scriptId);
    setEditingScripts(prev => ({
      ...prev,
      [scriptId]: { ...(prev[scriptId] || script), [key]: value }
    }));
  };

  // Save all edited scripts
  const saveAllScripts = async () => {
    const editedIds = Object.keys(editingScripts);
    if (editedIds.length === 0) return;
    setSavingScripts(true);
    try {
      for (const id of editedIds) {
        const scriptData = editingScripts[id];
        const res = await fetch(`${API_URL}/api/admin/hedging/scripts/${id}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` 
          },
          body: JSON.stringify(scriptData)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to save');
      }
      showToast(`Saved ${editedIds.length} script override(s) successfully`);
      setEditingScripts({});
      fetchScripts(1, scriptSearch);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSavingScripts(false);
    }
  };

  // Debounce ref for instrument search
  const instrumentSearchTimer = useRef(null);

  // Fetch instruments for selected segment with optional search query (live search)
  const fetchSegmentInstruments = useCallback(async (segmentId, search = '') => {
    if (!segmentId) {
      setSegmentInstruments([]);
      return;
    }
    setInstrumentsLoading(true);
    try {
      const segment = segments.find(s => s._id === segmentId);
      if (!segment) {
        setSegmentInstruments([]);
        setInstrumentsLoading(false);
        return;
      }
      const exchange = segment.exchange || segment.name || 'FOREX';
      const segmentName = segment.name || segment.displayName || '';
      const params = new URLSearchParams({ exchange, search: search.trim(), segmentName });
      const res = await fetch(`${API_URL}/api/admin/segments/search-instruments?${params}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (data.success) setSegmentInstruments(data.instruments || []);
    } catch (error) {
      console.error('Error fetching instruments:', error);
    } finally {
      setInstrumentsLoading(false);
    }
  }, [segments]);

  // Add instrument as script override
  const addInstrumentAsScript = async (instrument) => {
    if (!selectedAddSegment) {
      showToast('Please select a segment first', 'error');
      return;
    }
    if (addingSymbol) return; // prevent double-click

    const symbol = instrument.symbol;
    setAddingSymbol(symbol);
    try {
      const token = localStorage.getItem('dhanfunded-admin-token');
      const res = await fetch(`${API_URL}/api/admin/hedging/scripts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ symbol, segmentId: selectedAddSegment, isActive: true })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`${symbol} added successfully`);
        // Immediately mark as added in local state without waiting for full refetch
        setScripts(prev => [...prev, { ...data.script, symbol, segmentId: selectedAddSegment }]);
        fetchScripts(1, scriptSearch);
      } else {
        showToast(data.error || data.message || 'Failed to add script', 'error');
      }
    } catch (error) {
      console.error('[addInstrumentAsScript] error:', error);
      showToast(error.message || 'Network error', 'error');
    } finally {
      setAddingSymbol('');
    }
  };

  // Add new script override
  const handleAddScript = async () => {
    if (!newScriptForm.symbol || !newScriptForm.segmentId) {
      showToast('Symbol and Segment are required', 'error');
      return;
    }
    
    setAddingScript(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/hedging/scripts`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` 
        },
        body: JSON.stringify(newScriptForm)
      });
      const data = await res.json();
      
      if (data.success) {
        showToast('Script override added successfully');
        setShowAddScript(false);
        setNewScriptForm({
          symbol: '',
          segmentId: '',
          contractSize: 100000,
          digits: 5,
          pipSize: 0.0001,
          pipValue: 10,
          minLots: 0.01,
          maxLots: 100,
          lotStep: 0.01,
          maxLeverage: 500,
          defaultLeverage: 100,
          spreadType: 'floating',
          spreadPips: 0,
          commission: 0,
          swapLong: 0,
          swapShort: 0,
          isActive: true
        });
        fetchScripts(1, scriptSearch);
      } else {
        throw new Error(data.message || 'Failed to add script');
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setAddingScript(false);
    }
  };

  const handleSyncSegments = async () => {
    try {
      setSyncing(true);
      const res = await fetch(`${API_URL}/api/admin/segments/sync`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast('Hedging segments synchronized');
        fetchSegments();
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      showToast(error.message || 'Error syncing segments', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const parameterTypes = [
    { value: 'contract_specs', label: 'Contract Specs' },
    { value: 'trading_limits', label: 'Market Limits' },
    { value: 'margin_leverage', label: 'Margin' },
    { value: 'costs', label: 'Spread & Commission' },
    { value: 'swap', label: 'Swap (Rollover)' }
  ];

  const getColumnsForType = (type) => {
    switch (type) {
      case 'contract_specs': return [
        { key: 'contractSize', label: 'Contract Size', type: 'number' },
        { key: 'digits', label: 'Digits', type: 'number' },
        { key: 'pipSize', label: 'Pip Size', type: 'number', step: '0.00001' },
        { key: 'pipValue', label: 'Pip Value', type: 'number' },
      ];
      case 'trading_limits': return [
        { key: 'minLots', label: 'Min Lot', type: 'number', step: '0.01' },
        { key: 'maxLots', label: 'Max Lot', type: 'number' },
        { key: 'lotStep', label: 'Lot Step', type: 'number', step: '0.01' },
        { key: 'maxExchangeLots', label: 'Max Exch Lots', type: 'number' },
        { key: 'orderLots', label: 'Max Per Order', type: 'number' },
        { key: 'maxPositionsPerSymbol', label: 'Max Pos/Symbol', type: 'number', title: 'Max open positions per symbol (blank = use global)' },
        { key: 'maxTotalPositions', label: 'Max Total Pos', type: 'number', title: 'Max total open tickets (blank = use global)' },
      ];
      case 'margin_leverage': return [
        { key: 'marginMode', label: 'Margin Mode', type: 'select', options: [{v: 'percentage', l: 'Percentage'}, {v: 'fixed', l: 'Fixed'}, {v: 'calculated', l: 'Calculated'}] },
        { key: 'marginRate', label: 'Margin Rate (%)', type: 'number' },
        { key: 'hedgedMarginRate', label: 'Hedged Margin (%)', type: 'number' }
      ];
      case 'costs': return [
        { key: 'spreadType', label: 'Spread Type', type: 'select', options: [{v: 'floating', l: 'Floating'}, {v: 'fixed', l: 'Fixed'}, {v: 'variable', l: 'Variable'}] },
        { key: 'spreadPips', label: 'Spread Pips', type: 'number' },
        { key: 'markupPips', label: 'Markup Pips', type: 'number' },
        { key: 'commissionType', label: 'Comm Type', type: 'select', options: [{ v: 'per_lot', l: 'Per Lot' }, { v: 'per_crore', l: 'Per Crore' }, { v: 'percentage', l: 'Percentage' }, { v: 'fixed', l: 'Fixed' }] },
        { key: 'commission', label: 'Comm Value', type: 'number' },
      ];
      case 'swap': return [
        { key: 'swapType', label: 'Swap Type', type: 'select', options: [{v: 'points', l: 'Points'}, {v: 'percentage', l: 'Percentage'}, {v: 'money', l: 'Money'}] },
        { key: 'swapLong', label: 'Swap Long', type: 'number' },
        { key: 'swapShort', label: 'Swap Short', type: 'number' },
        { key: 'tripleSwapDay', label: '3-Day Swap (0-6)', type: 'number', min: 0, max: 6, title: 'Day swap is charged 3× (weekend). 0=Sun … 3=Wed (typical for FX)' }
      ];
      default: return [];
    }
  };

  const updateSegmentCell = (segId, key, value) => {
    const seg = segments.find(s => s._id === segId);
    setEditingSegments(prev => ({
      ...prev,
      [segId]: { ...(prev[segId] || seg), [key]: value }
    }));
  };

  const saveAllSegments = async () => {
    const editedIds = Object.keys(editingSegments);
    if (editedIds.length === 0) return;
    setSavingSegments(true);
    try {
      for (const id of editedIds) {
        const res = await fetch(`${API_URL}/api/admin/hedging/segments/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingSegments[id])
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to save');
      }
      showToast(`Saved ${editedIds.length} hedging segment(s) successfully`);
      setEditingSegments({});
      fetchSegments();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSavingSegments(false);
    }
  };

  const renderSettingInput = (segId, column) => {
    const seg = segments.find(s => s._id === segId);
    if (!seg) return null;
    
    // Check if this segment is being edited, otherwise use original value
    const currentValue = editingSegments[segId] && editingSegments[segId][column.key] !== undefined 
      ? editingSegments[segId][column.key] 
      : seg[column.key];

    if (column.type === 'select') {
      return (
        <select 
          className="admin-input-sm" 
          value={currentValue !== null && currentValue !== undefined ? currentValue : ''} 
          onChange={(e) => {
            let val = e.target.value;
            if (val === 'true') val = true;
            if (val === 'false') val = false;
            if (val === '') val = null;
            updateSegmentCell(segId, column.key, val);
          }}
          style={{ width: '100%', padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
        >
          {column.options.map(opt => (
            <option key={String(opt.v)} value={opt.v}>{opt.l}</option>
          ))}
        </select>
      );
    }

    return (
      <input 
        type={column.type} 
        className="admin-input-sm" 
        value={currentValue !== null && currentValue !== undefined ? currentValue : ''}
        onChange={(e) => {
          let val = e.target.value;
          if (column.type === 'number') {
            val = val === '' ? null : Number(val);
          }
          updateSegmentCell(segId, column.key, val);
        }}
        step={column.step || "any"}
        min={column.min}
        max={column.max}
        style={{ width: '100%', padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
      />
    );
  };

  const columns = getColumnsForType(parameterType);
  const hasEdits = Object.keys(editingSegments).length > 0;

  return (
    <div className="admin-page segment-management-page">
      <div className="admin-page-header">
        <h2>Hedging Segment Settings</h2>
        {activeTab === 'hedging-settings' && (
          <div className="header-actions">
            <button 
              className="admin-btn-secondary"
              onClick={handleSyncSegments}
              disabled={syncing}
            >
              {syncing ? 'Syncing...' : '↻ Sync Default Segments'}
            </button>
          </div>
        )}
      </div>

      <div className="admin-tabs">
        <button 
          type="button"
          className={`admin-tab ${activeTab === 'hedging-settings' ? 'active' : ''}`}
          onClick={() => navigate('/admin/hedging-segments')}
        >
          Hedging Settings
        </button>
        <button 
          type="button"
          className={`admin-tab ${activeTab === 'scripts' ? 'active' : ''}`}
          onClick={() => navigate('/admin/hedging-segments/scripts')}
        >
          Script Overrides
        </button>
        <button 
          type="button"
          className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => navigate('/admin/hedging-segments/users')}
        >
          User Settings
        </button>
      </div>

      <div
        style={{
          margin: '12px 0 16px',
          padding: '14px 16px',
          borderRadius: '8px',
          border: '1px solid rgba(59, 130, 246, 0.35)',
          background: 'rgba(59, 130, 246, 0.08)',
          color: 'var(--text-primary)',
          fontSize: '13px',
          lineHeight: 1.55
        }}
      >
        <strong style={{ color: '#93c5fd' }}>Hedging is not for Indian segments.</strong>{' '}
        NSE, NFO, MCX, BSE, BFO, and CDS instruments belong in{' '}
        <strong>Netting mode</strong> (configure under Netting Segments). Hedging here is for Forex / Crypto /
        MT5-style multi-position trading.
      </div>

      {activeTab === 'users' && <HedgingUserSegmentOverrides />}

      {activeTab === 'hedging-settings' && (
        <div className="admin-card">
          <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <div className="segment-type-selector">
              <label style={{ marginRight: '10px', color: 'var(--text-secondary)' }}>Setting Type:</label>
              <select 
                className="admin-input" 
                value={parameterType}
                onChange={(e) => setParameterType(e.target.value)}
                style={{ width: '250px' }}
              >
                {parameterTypes.map(pt => (
                  <option key={pt.value} value={pt.value}>{pt.label}</option>
                ))}
              </select>
            </div>
            
            <div className="bulk-actions" style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="admin-btn-primary" 
                onClick={saveAllSegments} 
                disabled={!hasEdits || savingSegments}
                style={{ opacity: !hasEdits ? 0.5 : 1 }}
              >
                {savingSegments ? 'Saving...' : `Save ${Object.keys(editingSegments).length} Edits`}
              </button>
            </div>
          </div>

          <div className="admin-table-container">
            {loading ? (
              <div className="loading-state">Loading hedging segments...</div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Segment Name</th>
                    <th>Market Details</th>
                    {columns.map(col => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {segments.map((segment) => {
                    const isEdited = editingSegments[segment._id] !== undefined;
                    return (
                      <tr key={segment._id} style={isEdited ? { background: 'rgba(56, 189, 248, 0.05)' } : {}}>
                        <td>
                          <strong>{segment.displayName}</strong>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{segment.name}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                             <span className="segment-badge forex" style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                                FOREX MODE
                             </span>
                             <span className="segment-badge exchange" style={{ background: 'rgba(161, 161, 170, 0.2)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                                {segment.exchange}
                             </span>
                          </div>
                        </td>
                        
                        {columns.map(col => (
                          <td key={col.key} style={{ minWidth: '100px' }}>
                            {renderSettingInput(segment._id, col)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {segments.length === 0 && !loading && (
                    <tr>
                      <td colSpan={columns.length + 2} className="text-center">No hedging segments found. Please click 'Sync Default Segments'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Script Overrides Tab */}
      {activeTab === 'scripts' && (
        <div className="admin-card" style={{ padding: '20px', marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px' }}>Script Overrides for Hedging</h3>
              <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Override settings for specific symbols in forex/hedging segments
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input 
                type="text"
                placeholder="Search symbol..."
                value={scriptSearch}
                onChange={(e) => setScriptSearch(e.target.value)}
                className="admin-input"
                style={{ width: '180px', padding: '8px 12px' }}
              />
              <button 
                className="admin-btn-secondary"
                onClick={() => fetchScripts(1, scriptSearch)}
                style={{ padding: '8px 16px' }}
              >
                Search
              </button>
              <button 
                className="admin-btn-primary"
                onClick={() => setShowAddScript(!showAddScript)}
                style={{ padding: '8px 16px' }}
              >
                {showAddScript ? '✕ Cancel' : '+ Add Script'}
              </button>
            </div>
          </div>

          {/* Add Script - Select Segment then show instruments */}
          {showAddScript && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '14px' }}>➕ Add Script Override</h4>
                <button onClick={() => { setShowAddScript(false); setSelectedAddSegment(''); setSegmentInstruments([]); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
              </div>
              
              {/* Step 1: Select Segment */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px' }}>
                <div style={{ flex: '0 0 250px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Select Segment</label>
                  <select 
                    value={selectedAddSegment}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedAddSegment(val);
                      setInstrumentFilter('');
                      fetchSegmentInstruments(val, '');
                    }}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '13px' }}
                  >
                    <option value="">Select Segment</option>
                    {segments.map(seg => (
                      <option key={seg._id} value={seg._id}>{seg.displayName}</option>
                    ))}
                  </select>
                </div>
                {selectedAddSegment && (
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Search Instruments</label>
                    <input
                      type="text"
                      placeholder="Search by symbol name (e.g. BTC, EUR, GOLD)..."
                      value={instrumentFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setInstrumentFilter(val);
                        clearTimeout(instrumentSearchTimer.current);
                        instrumentSearchTimer.current = setTimeout(() => {
                          fetchSegmentInstruments(selectedAddSegment, val);
                        }, 300);
                      }}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '13px' }}
                    />
                  </div>
                )}
              </div>

              {/* Step 2: Show Instruments */}
              {selectedAddSegment && (
                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  {instrumentsLoading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading instruments...</div>
                  ) : segmentInstruments.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {instrumentFilter ? 'No instruments found matching your search' : 'No instruments found — try searching by symbol name'}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', padding: '12px' }}>
                      {segmentInstruments.map((inst, idx) => {
                          const alreadyAdded = scripts.some(s => s.symbol === inst.symbol && String(s.segmentId) === String(selectedAddSegment));
                          const isThisAdding = addingSymbol === inst.symbol;
                          const isDisabled = alreadyAdded || !!addingSymbol;
                          return (
                            <button
                              type="button"
                              key={idx}
                              onClick={() => !alreadyAdded && !addingSymbol && addInstrumentAsScript(inst)}
                              disabled={isDisabled}
                              style={{
                                padding: '10px 12px',
                                border: alreadyAdded ? '1px solid #22c55e' : isThisAdding ? '1px solid #3b82f6' : '1px solid var(--border-color)',
                                borderRadius: '6px',
                                background: alreadyAdded ? 'rgba(34, 197, 94, 0.1)' : isThisAdding ? 'rgba(59,130,246,0.15)' : 'var(--bg-tertiary)',
                                color: alreadyAdded ? '#22c55e' : isThisAdding ? '#3b82f6' : 'var(--text-primary)',
                                cursor: isDisabled ? 'default' : 'pointer',
                                fontSize: '12px',
                                fontWeight: 500,
                                textAlign: 'left',
                                opacity: isDisabled && !isThisAdding ? 0.5 : 1
                              }}
                            >
                              {alreadyAdded ? '✓ ' : isThisAdding ? '⏳ ' : '+ '}{inst.symbol}
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Setting Type Selector and Save Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Setting Type:</label>
              <select
                value={scriptParameterType}
                onChange={(e) => { setScriptParameterType(e.target.value); setEditingScripts({}); }}
                style={{ padding: '8px 14px', background: 'var(--bg-tertiary)', border: '2px solid #3b82f6', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontWeight: 500 }}
              >
                {parameterTypes.map(pt => (
                  <option key={pt.value} value={pt.value}>{pt.label}</option>
                ))}
              </select>
            </div>
            {Object.keys(editingScripts).length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#fbbf24' }}>{Object.keys(editingScripts).length} unsaved</span>
                <button onClick={() => setEditingScripts({})} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>Discard</button>
                <button onClick={saveAllScripts} disabled={savingScripts} style={{ padding: '6px 12px', background: '#22c55e', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12 }}>{savingScripts ? 'Saving...' : '💾 Save All'}</button>
              </div>
            )}
          </div>

          {/* Scripts Table with Inline Editing */}
          <div style={{ overflowX: 'auto' }}>
            {scriptsLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Loading script overrides...</div>
            ) : scripts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                <p style={{ fontSize: '40px', margin: '0 0 10px' }}>📜</p>
                <p style={{ margin: 0 }}>No script overrides found for hedging segments.</p>
                <p style={{ margin: '8px 0 0', fontSize: '13px' }}>Use the search above to add script overrides.</p>
              </div>
            ) : (
              <table className="admin-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--bg-tertiary)', zIndex: 2, minWidth: 120 }}>Symbol</th>
                    <th style={{ minWidth: 100 }}>Segment</th>
                    {getColumnsForType(scriptParameterType).map(col => (
                      <th key={col.key} style={{ minWidth: 100 }}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scripts.map((script) => {
                    const edited = editingScripts[script._id];
                    const data = edited || script;
                    const isEdited = !!edited;
                    return (
                      <tr key={script._id} style={{ background: isEdited ? 'rgba(59, 130, 246, 0.05)' : 'transparent' }}>
                        <td style={{ position: 'sticky', left: 0, background: isEdited ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)', zIndex: 1 }}>
                          <strong style={{ color: '#38bdf8' }}>{script.symbol}</strong>
                        </td>
                        <td>
                          <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                            {script.segmentId?.displayName || script.segmentId?.name || 'Unknown'}
                          </span>
                        </td>
                        {getColumnsForType(scriptParameterType).map(col => (
                          <td key={col.key}>
                            {col.type === 'select' ? (
                              <select
                                value={data[col.key] !== undefined && data[col.key] !== null ? String(data[col.key]) : ''}
                                onChange={(e) => {
                                  let val = e.target.value;
                                  if (val === 'true') val = true;
                                  else if (val === 'false') val = false;
                                  else if (val === '') val = null;
                                  updateScriptCell(script._id, col.key, val);
                                }}
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: 4, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12 }}
                              >
                                {col.options.map(opt => (
                                  <option key={String(opt.v)} value={String(opt.v)}>{opt.l}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={col.type}
                                value={data[col.key] !== undefined && data[col.key] !== null ? data[col.key] : ''}
                                onChange={(e) => {
                                  let val = e.target.value;
                                  if (col.type === 'number') val = val === '' ? null : Number(val);
                                  updateScriptCell(script._id, col.key, val);
                                }}
                                step={col.step || 'any'}
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: 4, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12 }}
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {scriptsPagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
              <button 
                className="admin-btn-secondary"
                disabled={scriptsPagination.page <= 1}
                onClick={() => fetchScripts(scriptsPagination.page - 1, scriptSearch)}
              >
                Previous
              </button>
              <span style={{ color: 'var(--text-secondary)', alignSelf: 'center' }}>
                Page {scriptsPagination.page} of {scriptsPagination.pages}
              </span>
              <button 
                className="admin-btn-secondary"
                disabled={scriptsPagination.page >= scriptsPagination.pages}
                onClick={() => fetchScripts(scriptsPagination.page + 1, scriptSearch)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {toast.show && (
        <div className={`admin-toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default HedgingSegmentSettings;
