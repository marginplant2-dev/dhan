import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const authHeaders = () => {
  const token = localStorage.getItem('dhanfunded-admin-token');
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

const parameterTypes = [
  { value: 'contract_specs', label: 'Contract Specs' },
  { value: 'trading_limits', label: 'Market Limits' },
{ value: 'margin_leverage', label: 'Margin' },
  { value: 'costs', label: 'Spread & Commission' },
  { value: 'swap', label: 'Swap (Rollover)' },
  { value: 'risk_management', label: 'Risk Management' },
  { value: 'block_settings', label: 'Block / Active' }
];

function getColumnsForType(type) {
  switch (type) {
    case 'contract_specs':
      return [
        { key: 'contractSize', label: 'Contract Size', type: 'number' },
        { key: 'digits', label: 'Digits', type: 'number' },
        { key: 'pipSize', label: 'Pip Size', type: 'number', step: '0.00001' },
        { key: 'pipValue', label: 'Pip Value', type: 'number' }
      ];
    case 'trading_limits':
      return [
        { key: 'minLots', label: 'Min Lot', type: 'number', step: '0.01' },
        { key: 'maxLots', label: 'Max Lot', type: 'number' },
        { key: 'lotStep', label: 'Lot Step', type: 'number', step: '0.01' },
        { key: 'maxExchangeLots', label: 'Max Exch Lots', type: 'number' },
        { key: 'orderLots', label: 'Max Per Order', type: 'number' },
        { key: 'maxPositionsPerSymbol', label: 'Max Pos/Symbol', type: 'number' },
        { key: 'maxTotalPositions', label: 'Max Total Pos', type: 'number' }
      ];
case 'margin_leverage':
      return [
        { key: 'marginMode', label: 'Margin Mode', type: 'select', options: [{ v: 'percentage', l: 'Percentage' }, { v: 'fixed', l: 'Fixed' }, { v: 'calculated', l: 'Calculated' }] },
        { key: 'marginRate', label: 'Margin Rate (%)', type: 'number' },
        { key: 'hedgedMarginRate', label: 'Hedged (%)', type: 'number' }
      ];
    case 'costs':
      return [
        { key: 'spreadType', label: 'Spread Type', type: 'select', options: [{ v: 'floating', l: 'Floating' }, { v: 'fixed', l: 'Fixed' }, { v: 'variable', l: 'Variable' }] },
        { key: 'spreadPips', label: 'Spread Pips', type: 'number' },
        { key: 'markupPips', label: 'Markup Pips', type: 'number' },
        { key: 'commissionType', label: 'Comm Type', type: 'select', options: [{ v: 'per_lot', l: 'Per Lot' }, { v: 'per_crore', l: 'Per Crore' }, { v: 'percentage', l: 'Percentage' }, { v: 'fixed', l: 'Fixed' }] },
        { key: 'commission', label: 'Comm Value', type: 'number' },
        { key: 'openCommission', label: 'Open Comm', type: 'number' },
        { key: 'closeCommission', label: 'Close Comm', type: 'number' }
      ];
    case 'swap':
      return [
        { key: 'swapType', label: 'Swap Type', type: 'select', options: [{ v: 'points', l: 'Points' }, { v: 'percentage', l: 'Percentage' }, { v: 'money', l: 'Money' }] },
        { key: 'swapLong', label: 'Swap Long', type: 'number' },
        { key: 'swapShort', label: 'Swap Short', type: 'number' },
        { key: 'tripleSwapDay', label: '3-Day (0–6)', type: 'number', min: 0, max: 6 }
      ];
    case 'risk_management':
      return [
        { key: 'ledgerBalanceClose', label: 'Ledger Close %', type: 'number' },
        { key: 'profitTradeHoldMinSeconds', label: 'Profit Hold s', type: 'number' },
        { key: 'lossTradeHoldMinSeconds', label: 'Loss Hold s', type: 'number' },
        { key: 'blockLimitAboveBelowHighLow', label: 'Block A/B HL', type: 'select', options: [{ v: false, l: 'Off' }, { v: true, l: 'On' }] },
        { key: 'blockLimitBetweenHighLow', label: 'Block Betw. HL', type: 'select', options: [{ v: false, l: 'Off' }, { v: true, l: 'On' }] },
        { key: 'exitOnlyMode', label: 'Exit Only', type: 'select', options: [{ v: false, l: 'Off' }, { v: true, l: 'On' }] }
      ];
    case 'block_settings':
      return [
        { key: 'tradingEnabled', label: 'Market', type: 'select', options: [{ v: true, l: 'Allowed' }, { v: false, l: 'Blocked' }] },
        { key: 'blockOptions', label: 'Block Opt', type: 'select', options: [{ v: false, l: 'Off' }, { v: true, l: 'On' }] },
        { key: 'blockFractionLot', label: 'Block Frac', type: 'select', options: [{ v: false, l: 'Off' }, { v: true, l: 'On' }] },
        { key: 'isActive', label: 'Active', type: 'select', options: [{ v: true, l: 'Yes' }, { v: false, l: 'No' }] }
      ];
    default:
      return [];
  }
}

export default function HedgingUserSegmentOverrides() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [userParameterType, setUserParameterType] = useState('contract_specs');
  const [userSegmentSettings, setUserSegmentSettings] = useState({});
  const [savingUserSettings, setSavingUserSettings] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  // Script-level overrides
  const [userScriptSettings, setUserScriptSettings] = useState([]);
  const [editingUserScript, setEditingUserScript] = useState(null);
  const [scriptSettingType, setScriptSettingType] = useState('contract_specs');
  const [selectedScriptSegment, setSelectedScriptSegment] = useState(null);
  const [scriptInstrumentSearch, setScriptInstrumentSearch] = useState('');
  const [scriptInstruments, setScriptInstruments] = useState([]);
  const [scriptInstrumentsLoading, setScriptInstrumentsLoading] = useState(false);
  const [savingScript, setSavingScript] = useState(false);
  const [manualSymbol, setManualSymbol] = useState('');

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3200);
  };

  const fetchSegments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/hedging/segments`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setSegments(data.segments || []);
    } catch (e) {
      console.error(e);
      showToast('Failed to load hedging segments', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments]);

  const searchUsers = async () => {
    if (!userSearch || userSearch.length < 2) return;
    setUserSearchLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/user-segment-settings/search-users?search=${encodeURIComponent(userSearch)}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setUserSearchResults(data.users || []);
    } catch (e) {
      console.error(e);
    } finally {
      setUserSearchLoading(false);
    }
  };

  const toggleUserSelection = (user) => {
    setSelectedUsers((prev) => {
      const exists = prev.find((u) => u._id === user._id);
      if (exists) return prev.filter((u) => u._id !== user._id);
      return [...prev, user];
    });
  };

  const fetchAllUserSegmentSettings = async () => {
    if (selectedUsers.length === 0) {
      setUserSegmentSettings({});
      return;
    }
    try {
      const userId = selectedUsers[0]._id;
      const res = await fetch(`${API_URL}/api/admin/user-segment-settings/user/${userId}?tradeMode=hedging`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success) return;
      const settingsMap = {};
      const all = data.settings || [];
      all.forEach((s) => {
        if (!s.symbol) {
          settingsMap[s.segmentId?._id || s.segmentId] = { ...s, segmentId: s.segmentId?._id || s.segmentId };
        }
      });
      setUserSegmentSettings(settingsMap);
      setUserScriptSettings(all.filter((s) => s.symbol));
    } catch (e) {
      console.error(e);
    }
  };

  const fetchScriptInstruments = async () => {
    if (!selectedScriptSegment) return;
    setScriptInstrumentsLoading(true);
    try {
      const segment = selectedScriptSegment;
      const exchange = segment.exchange || segment.name || 'FOREX';
      const segmentName = segment.name || segment.displayName || '';
      const res = await fetch(
        `${API_URL}/api/admin/segments/search-instruments?exchange=${encodeURIComponent(exchange)}&search=${encodeURIComponent(scriptInstrumentSearch)}&segmentName=${encodeURIComponent(segmentName)}`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (data.success) setScriptInstruments(data.instruments || []);
    } catch (e) {
      console.error(e);
      showToast('Failed to load symbols', 'error');
    } finally {
      setScriptInstrumentsLoading(false);
    }
  };

  const addScriptOverride = (instrument) => {
    const segment = selectedScriptSegment;
    if (!segment) return;
    const sym = (instrument && (instrument.symbol || instrument.tradingsymbol || instrument.tradingSymbol)) ? String(instrument.symbol || instrument.tradingsymbol || instrument.tradingSymbol).toUpperCase() : '';
    if (!sym) return;
    const seg = segments.find((s) => s._id === segment._id) || segment;
    setEditingUserScript({
              segmentId: seg._id,
              segmentName: seg.name,
              symbol: sym,
              contractSize: (instrument && instrument.contractSize) ?? seg.contractSize ?? 100000,
              digits: seg.digits ?? 5,
              pipSize: seg.pipSize ?? 0.0001,
              pipValue: seg.pipValue ?? 10,
              lotStep: seg.lotStep ?? 0.01,
              minLots: seg.minLots ?? 0.01,
              maxLots: seg.maxLots ?? 100,
              orderLots: seg.orderLots ?? 50,
              maxExchangeLots: seg.maxExchangeLots,
              maxPositionsPerSymbol: seg.maxPositionsPerSymbol,
              maxTotalPositions: seg.maxTotalPositions,
              maxLeverage: seg.maxLeverage,
              defaultLeverage: seg.defaultLeverage,
              marginMode: seg.marginMode,
              marginRate: seg.marginRate,
              hedgedMarginRate: seg.hedgedMarginRate,
              spreadType: seg.spreadType,
              spreadPips: seg.spreadPips,
              markupPips: seg.markupPips,
              commissionType: seg.commissionType,
              commission: seg.commission,
              openCommission: seg.openCommission,
              closeCommission: seg.closeCommission,
              swapType: seg.swapType,
              swapLong: seg.swapLong,
              swapShort: seg.swapShort,
              tripleSwapDay: seg.tripleSwapDay,
              tradingEnabled: true,
              isActive: true
            });
    setScriptInstruments([]);
    setScriptInstrumentSearch('');
  };

  const scriptPayload = () => {
    const s = editingUserScript;
    if (!s) return null;
    return {
      contractSize: s.contractSize,
      digits: s.digits,
      pipSize: s.pipSize,
      pipValue: s.pipValue,
      lotStep: s.lotStep,
      minLots: s.minLots,
      maxLots: s.maxLots,
      orderLots: s.orderLots,
      maxExchangeLots: s.maxExchangeLots,
      maxPositionsPerSymbol: s.maxPositionsPerSymbol,
      maxTotalPositions: s.maxTotalPositions,
      marginMode: s.marginMode,
      marginRate: s.marginRate,
      hedgedMarginRate: s.hedgedMarginRate,
      spreadType: s.spreadType,
      spreadPips: s.spreadPips,
      markupPips: s.markupPips,
      commissionType: s.commissionType,
      commission: s.commission,
      openCommission: s.openCommission,
      closeCommission: s.closeCommission,
      swapType: s.swapType,
      swapLong: s.swapLong,
      swapShort: s.swapShort,
      tripleSwapDay: s.tripleSwapDay,
      ledgerBalanceClose: s.ledgerBalanceClose,
      profitTradeHoldMinSeconds: s.profitTradeHoldMinSeconds,
      lossTradeHoldMinSeconds: s.lossTradeHoldMinSeconds,
      blockLimitAboveBelowHighLow: s.blockLimitAboveBelowHighLow,
      blockLimitBetweenHighLow: s.blockLimitBetweenHighLow,
      exitOnlyMode: s.exitOnlyMode,
      tradingEnabled: s.tradingEnabled,
      blockOptions: s.blockOptions,
      blockFractionLot: s.blockFractionLot,
      isActive: s.isActive
    };
  };

  const saveUserScriptSetting = async () => {
    if (!editingUserScript || selectedUsers.length === 0) return;
    setSavingScript(true);
    try {
      const segment = segments.find((s) => s._id === editingUserScript.segmentId);
      const res = await fetch(`${API_URL}/api/admin/user-segment-settings/bulk`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          userIds: selectedUsers.map((u) => u._id),
          segmentId: editingUserScript.segmentId,
          segmentName: segment?.name || editingUserScript.segmentName,
          symbol: (editingUserScript.symbol || '').toUpperCase(),
          tradeMode: 'hedging',
          settings: scriptPayload()
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Script override saved');
        setEditingUserScript(null);
        fetchAllUserSegmentSettings();
      } else {
        showToast(data.error || 'Save failed', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Save failed', 'error');
    } finally {
      setSavingScript(false);
    }
  };

  const deleteUserScriptSetting = async (id) => {
    if (!confirm('Remove this script override for the selected user(s)?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/user-segment-settings/${id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        showToast('Script override removed');
        fetchAllUserSegmentSettings();
      } else {
        showToast(data.error || 'Delete failed', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Delete failed', 'error');
    }
  };

  useEffect(() => {
    if (selectedUsers.length > 0) fetchAllUserSegmentSettings();
    else {
      setUserSegmentSettings({});
      setUserScriptSettings([]);
      setEditingUserScript(null);
    }
  }, [selectedUsers]);

  useEffect(() => {
    const uid = searchParams.get('userId');
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/users/${uid}`, { headers: authHeaders() });
        const data = await res.json();
        if (cancelled || !data.success || !data.user) return;
        setSelectedUsers([data.user]);
        const next = new URLSearchParams(searchParams);
        next.delete('userId');
        setSearchParams(next, { replace: true });
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams, setSearchParams]);

  const updateUserSegmentCell = (segmentId, key, value) => {
    setUserSegmentSettings((prev) => ({
      ...prev,
      [segmentId]: {
        ...(prev[segmentId] || {}),
        segmentId,
        [key]: value,
        _modified: true
      }
    }));
  };

  const saveAllUserSegmentSettings = async () => {
    if (selectedUsers.length === 0) {
      showToast('Select at least one user', 'error');
      return;
    }
    const modified = Object.entries(userSegmentSettings).filter(([, s]) => s._modified);
    if (modified.length === 0) {
      showToast('No changes to save', 'error');
      return;
    }
    setSavingUserSettings(true);
    try {
      let saved = 0;
      for (const [segmentId, setting] of modified) {
        const segment = segments.find((s) => s._id === segmentId);
        if (!segment) continue;
        const res = await fetch(`${API_URL}/api/admin/user-segment-settings/bulk`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            userIds: selectedUsers.map((u) => u._id),
            segmentId,
            segmentName: segment.name,
            tradeMode: 'hedging',
            settings: {
              contractSize: setting.contractSize,
              digits: setting.digits,
              pipSize: setting.pipSize,
              pipValue: setting.pipValue,
              lotStep: setting.lotStep,
              minLots: setting.minLots,
              maxLots: setting.maxLots,
              orderLots: setting.orderLots,
              maxExchangeLots: setting.maxExchangeLots,
              maxPositionsPerSymbol: setting.maxPositionsPerSymbol,
              maxTotalPositions: setting.maxTotalPositions,
              maxLeverage: setting.maxLeverage,
              defaultLeverage: setting.defaultLeverage,
              fixedLeverage: setting.fixedLeverage,
              leverageOptions: setting.leverageOptions,
              marginMode: setting.marginMode,
              marginRate: setting.marginRate,
              hedgedMarginRate: setting.hedgedMarginRate,
              spreadType: setting.spreadType,
              spreadPips: setting.spreadPips,
              markupPips: setting.markupPips,
              commissionType: setting.commissionType,
              commission: setting.commission,
              openCommission: setting.openCommission,
              closeCommission: setting.closeCommission,
              swapType: setting.swapType,
              swapLong: setting.swapLong,
              swapShort: setting.swapShort,
              tripleSwapDay: setting.tripleSwapDay,
              ledgerBalanceClose: setting.ledgerBalanceClose,
              profitTradeHoldMinSeconds: setting.profitTradeHoldMinSeconds,
              lossTradeHoldMinSeconds: setting.lossTradeHoldMinSeconds,
              blockLimitAboveBelowHighLow: setting.blockLimitAboveBelowHighLow,
              blockLimitBetweenHighLow: setting.blockLimitBetweenHighLow,
              exitOnlyMode: setting.exitOnlyMode,
              tradingEnabled: setting.tradingEnabled,
              blockOptions: setting.blockOptions,
              blockFractionLot: setting.blockFractionLot,
              isActive: setting.isActive
            }
          })
        });
        const data = await res.json();
        if (data.success) saved++;
      }
      setUserSegmentSettings((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (next[k]._modified) delete next[k]._modified;
        });
        return next;
      });
      showToast(`Saved hedging overrides for ${saved} segment(s)`);
      fetchAllUserSegmentSettings();
    } catch (e) {
      console.error(e);
      showToast('Save failed', 'error');
    } finally {
      setSavingUserSettings(false);
    }
  };

  const cols = getColumnsForType(userParameterType);

  return (
    <div style={{ marginTop: 20 }}>
      {toast.show && (
        <div style={{
          position: 'fixed', top: 20, right: 20, padding: '12px 20px',
          background: toast.type === 'error' ? '#ef4444' : '#22c55e',
          color: 'white', borderRadius: 8, zIndex: 1000, fontWeight: 500
        }}>
          {toast.message}
        </div>
      )}

      <div className="admin-card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 8px', color: '#e4e4e7', fontSize: 16 }}>👤 Per-user hedging overrides</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#a1a1aa' }}>
          Same setting groups as hedging segment defaults. Overrides apply only when the user trades in <strong>hedging</strong> mode.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={{ display: 'block', fontSize: 12, color: '#a1a1aa', marginBottom: 6 }}>Search user</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                placeholder="Name, email, phone, ID…"
                className="admin-input"
                style={{ flex: 1, padding: '10px 12px' }}
              />
              <button type="button" className="admin-btn-secondary" onClick={searchUsers} disabled={userSearchLoading}>
                {userSearchLoading ? '…' : 'Search'}
              </button>
            </div>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: 12, color: '#a1a1aa', marginBottom: 6 }}>Setting type</label>
            <select
              className="admin-input"
              value={userParameterType}
              onChange={(e) => setUserParameterType(e.target.value)}
              style={{ width: '100%', padding: '10px 12px' }}
            >
              {parameterTypes.map((pt) => (
                <option key={pt.value} value={pt.value}>{pt.label}</option>
              ))}
            </select>
          </div>
        </div>
        {userSearchResults.length > 0 && (
          <div style={{ marginTop: 12, maxHeight: 200, overflowY: 'auto', border: '1px solid #3f3f46', borderRadius: 8 }}>
            {userSearchResults.map((u) => (
              <div
                key={u._id}
                onClick={() => toggleUserSelection(u)}
                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between' }}
              >
                <span style={{ color: '#e4e4e7' }}>{u.name} <span style={{ color: '#71717a' }}>({u.oderId})</span></span>
                <span style={{ color: selectedUsers.some((x) => x._id === u._id) ? '#22c55e' : '#a1a1aa' }}>
                  {selectedUsers.some((x) => x._id === u._id) ? '✓ Selected' : '+ Add'}
                </span>
              </div>
            ))}
          </div>
        )}
        {selectedUsers.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {selectedUsers.map((u) => (
              <span key={u._id} style={{ padding: '6px 12px', background: '#27272a', borderRadius: 6, fontSize: 12, color: '#e4e4e7' }}>
                {u.oderId}
                <button type="button" onClick={() => toggleUserSelection(u)} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>×</button>
              </span>
            ))}
            <button type="button" className="admin-btn-secondary" onClick={() => setSelectedUsers([])} style={{ fontSize: 12 }}>Clear</button>
            <button type="button" className="admin-btn-primary" onClick={saveAllUserSegmentSettings} disabled={savingUserSettings} style={{ marginLeft: 'auto' }}>
              {savingUserSettings ? 'Saving…' : '💾 Save changes'}
            </button>
          </div>
        )}
      </div>

      {selectedUsers.length === 0 ? (
        <div className="admin-card" style={{ padding: 48, textAlign: 'center', color: '#a1a1aa' }}>
          Select a user to edit hedging segment overrides by type.
        </div>
      ) : (
        <div className="admin-card" style={{ padding: 20 }}>
          <h4 style={{ margin: '0 0 16px', color: '#e4e4e7', fontSize: 14 }}>
            Hedging segments — {parameterTypes.find((p) => p.value === userParameterType)?.label}
            <span style={{ fontWeight: 400, color: '#71717a', marginLeft: 12 }}>for {selectedUsers.map((u) => u.oderId).join(', ')}</span>
          </h4>
          <div className="admin-table-container" style={{ overflowX: 'auto', maxHeight: '65vh' }}>
            <table className="admin-table" style={{ width: 'max-content', minWidth: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#18181b' }}>
                <tr>
                  <th style={{ minWidth: 160 }}>Segment</th>
                  <th style={{ minWidth: 80 }}>Status</th>
                  {cols.map((col) => (
                    <th key={col.key} style={{ minWidth: col.type === 'select' ? 100 : 88 }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={cols.length + 2} style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                ) : (
                  segments.map((segment) => {
                    const userSetting = userSegmentSettings[segment._id] || {};
                    const isModified = userSetting._modified;
                    return (
                      <tr key={segment._id} style={{ background: isModified ? 'rgba(56, 189, 248, 0.06)' : undefined }}>
                        <td>
                          <strong style={{ color: '#e4e4e7' }}>{segment.displayName}</strong>
                          <div style={{ fontSize: 11, color: '#71717a' }}>{segment.name}</div>
                        </td>
                        <td>
                          <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, background: userSetting._id ? 'rgba(34,197,94,0.15)' : 'rgba(113,113,122,0.2)', color: userSetting._id ? '#4ade80' : '#a1a1aa' }}>
                            {userSetting._id ? 'Custom' : 'Default'}
                          </span>
                        </td>
                        {cols.map((col) => (
                          <td key={col.key}>
                            {col.type === 'select' ? (
                              <select
                                value={userSetting[col.key] != null ? String(userSetting[col.key]) : ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const val = v === '' ? null : v === 'true' ? true : v === 'false' ? false : v;
                                  updateUserSegmentCell(segment._id, col.key, val);
                                }}
                                style={{ width: '100%', padding: '6px 8px', background: '#18181b', border: '1px solid #3f3f46', borderRadius: 4, color: '#e4e4e7', fontSize: 12 }}
                              >
                                <option value="">Default</option>
                                {col.options.map((o) => (
                                  <option key={String(o.v)} value={String(o.v)}>{o.l}</option>
                                ))}
                              </select>
                            ) : col.type === 'text' ? (
                              <input
                                type="text"
                                value={userSetting[col.key] ?? ''}
                                onChange={(e) => updateUserSegmentCell(segment._id, col.key, e.target.value || null)}
                                placeholder="Def."
                                style={{ width: '100%', padding: '6px 8px', background: '#18181b', border: '1px solid #3f3f46', borderRadius: 4, color: '#e4e4e7', fontSize: 12 }}
                              />
                            ) : (
                              <input
                                type="number"
                                value={userSetting[col.key] ?? ''}
                                onChange={(e) => updateUserSegmentCell(segment._id, col.key, e.target.value === '' ? null : Number(e.target.value))}
                                placeholder="Def."
                                min={col.min}
                                max={col.max}
                                step={col.step || 'any'}
                                style={{ width: '100%', padding: '6px 8px', background: '#18181b', border: '1px solid #3f3f46', borderRadius: 4, color: '#e4e4e7', fontSize: 12, minWidth: 72 }}
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedUsers.length > 0 && (
        <div className="admin-card" style={{ padding: 20, marginTop: 20, border: '1px solid #3f3f46' }}>
          <h3 style={{ margin: '0 0 8px', color: '#e4e4e7', fontSize: 16 }}>📜 Script-level overrides</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#a1a1aa' }}>
            Override hedging settings for specific symbols (e.g. EURUSD, BTCUSD) for the selected user(s).
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, padding: 16, background: '#18181b', borderRadius: 8 }}>
            <div style={{ flex: '0 0 180px' }}>
              <label style={{ fontSize: 12, color: '#a1a1aa', display: 'block', marginBottom: 6 }}>Segment</label>
              <select
                value={selectedScriptSegment?._id || ''}
                onChange={(e) => {
                  const seg = segments.find((s) => s._id === e.target.value);
                  setSelectedScriptSegment(seg || null);
                  setScriptInstruments([]);
                }}
                style={{ width: '100%', padding: '10px 12px', background: '#27272a', border: '1px solid #3f3f46', borderRadius: 6, color: '#e4e4e7', fontSize: 13 }}
              >
                <option value="">Select segment</option>
                {segments.map((s) => (
                  <option key={s._id} value={s._id}>{s.displayName}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ fontSize: 12, color: '#a1a1aa', display: 'block', marginBottom: 6 }}>Search symbol</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="e.g. EURUSD, BTCUSD..."
                  value={scriptInstrumentSearch}
                  onChange={(e) => setScriptInstrumentSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), fetchScriptInstruments())}
                  disabled={!selectedScriptSegment}
                  style={{ flex: 1, padding: '10px 12px', background: '#27272a', border: '1px solid #3f3f46', borderRadius: 6, color: '#e4e4e7', fontSize: 13 }}
                />
                <button type="button" className="admin-btn-secondary" onClick={fetchScriptInstruments} disabled={scriptInstrumentsLoading || !selectedScriptSegment}>
                  {scriptInstrumentsLoading ? '…' : 'Search'}
                </button>
              </div>
            </div>
            <div style={{ flex: '0 0 200px' }}>
              <label style={{ fontSize: 12, color: '#a1a1aa', display: 'block', marginBottom: 6 }}>Or add symbol</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="e.g. EURUSD"
                  value={manualSymbol}
                  onChange={(e) => setManualSymbol((e.target.value || '').toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), manualSymbol.trim() && addScriptOverride({ symbol: manualSymbol.trim() }) && setManualSymbol(''))}
                  disabled={!selectedScriptSegment}
                  style={{ flex: 1, padding: '10px 12px', background: '#27272a', border: '1px solid #3f3f46', borderRadius: 6, color: '#e4e4e7', fontSize: 13 }}
                />
                <button type="button" className="admin-btn-primary" onClick={() => { if (manualSymbol.trim()) { addScriptOverride({ symbol: manualSymbol.trim() }); setManualSymbol(''); } }} disabled={!selectedScriptSegment || !manualSymbol.trim()}>
                  Add
                </button>
              </div>
            </div>
          </div>

          {scriptInstruments.length > 0 && (
            <div style={{ marginBottom: 16, padding: 12, background: '#18181b', borderRadius: 8, maxHeight: 220, overflowY: 'auto' }}>
              <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 8 }}>Click to add override:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {scriptInstruments.slice(0, 50).map((inst, i) => {
                  const sym = (inst.symbol || inst.tradingsymbol || inst.tradingSymbol || '').toUpperCase();
                  if (!sym) return null;
                  return (
                    <button
                      key={sym + i}
                      type="button"
                      onClick={() => addScriptOverride(inst)}
                      style={{ padding: '8px 14px', background: '#27272a', border: '1px solid #3f3f46', borderRadius: 6, color: '#38bdf8', cursor: 'pointer', fontSize: 13 }}
                    >
                      {sym}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {editingUserScript && (
            <div style={{ marginBottom: 20, padding: 20, background: '#1e293b', borderRadius: 10, border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #334155' }}>
                <span style={{ fontWeight: 600, color: '#38bdf8', fontSize: 16 }}>📜 {editingUserScript.symbol}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <select
                    value={scriptSettingType}
                    onChange={(e) => setScriptSettingType(e.target.value)}
                    style={{ padding: '8px 12px', background: '#0f172a', border: '1px solid #475569', borderRadius: 6, color: '#e4e4e7', fontSize: 12 }}
                  >
                    {parameterTypes.map((pt) => (
                      <option key={pt.value} value={pt.value}>{pt.label}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setEditingUserScript(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                {getColumnsForType(scriptSettingType).map((col) => (
                  <div key={col.key}>
                    <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{col.label}</label>
                    {col.type === 'select' ? (
                      <select
                        value={editingUserScript[col.key] != null ? String(editingUserScript[col.key]) : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          const val = v === '' ? null : v === 'true' ? true : v === 'false' ? false : v;
                          setEditingUserScript((prev) => ({ ...prev, [col.key]: val }));
                        }}
                        style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#e4e4e7', fontSize: 12 }}
                      >
                        <option value="">Default</option>
                        {(col.options || []).map((o) => (
                          <option key={String(o.v)} value={String(o.v)}>{o.l}</option>
                        ))}
                      </select>
                    ) : col.type === 'text' ? (
                      <input
                        type="text"
                        value={editingUserScript[col.key] ?? ''}
                        onChange={(e) => setEditingUserScript((prev) => ({ ...prev, [col.key]: e.target.value || null }))}
                        placeholder="Default"
                        style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#e4e4e7', fontSize: 12 }}
                      />
                    ) : (
                      <input
                        type="number"
                        value={editingUserScript[col.key] ?? ''}
                        onChange={(e) => setEditingUserScript((prev) => ({ ...prev, [col.key]: e.target.value === '' ? null : Number(e.target.value) }))}
                        placeholder="Default"
                        min={col.min}
                        max={col.max}
                        step={col.step || 'any'}
                        style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#e4e4e7', fontSize: 12 }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="button" className="admin-btn-secondary" onClick={() => setEditingUserScript(null)}>Cancel</button>
                <button type="button" className="admin-btn-primary" onClick={saveUserScriptSetting} disabled={savingScript}>
                  {savingScript ? 'Saving…' : '💾 Save script override'}
                </button>
              </div>
            </div>
          )}

          {userScriptSettings.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 8 }}>Existing script overrides ({userScriptSettings.length}):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {userScriptSettings.map((s) => (
                  <div key={s._id} style={{ padding: 12, background: '#18181b', borderRadius: 8, border: '1px solid #3f3f46', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <span style={{ fontWeight: 600, color: '#38bdf8', fontSize: 13 }}>{s.symbol}</span>
                      <div style={{ fontSize: 11, color: '#71717a' }}>{s.segmentId?.displayName || s.segmentName}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="admin-btn-secondary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setEditingUserScript({ ...s, segmentId: s.segmentId?._id || s.segmentId })}>Edit</button>
                      <button type="button" className="admin-btn" style={{ padding: '6px 10px', fontSize: 12, background: '#7f1d1d', color: '#fecaca' }} onClick={() => deleteUserScriptSetting(s._id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
