import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// All 15 netting segments with their codes and display names
const NETTING_SEGMENTS = [
  { code: 'NSE_EQ', name: 'NSE EQ', lotApplies: false, qtyApplies: true, optionApplies: false, expiryHoldApplies: false },
  { code: 'NSE_FUT', name: 'NSE FUT', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: true },
  { code: 'NSE_OPT', name: 'NSE OPT', lotApplies: true, qtyApplies: false, optionApplies: true, expiryHoldApplies: true },
  { code: 'BSE_EQ', name: 'BSE EQ', lotApplies: false, qtyApplies: true, optionApplies: false, expiryHoldApplies: false },
  { code: 'BSE_FUT', name: 'BSE FUT', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: true },
  { code: 'BSE_OPT', name: 'BSE OPT', lotApplies: true, qtyApplies: false, optionApplies: true, expiryHoldApplies: true },
  { code: 'MCX_FUT', name: 'MCX FUT', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: true },
  { code: 'MCX_OPT', name: 'MCX OPT', lotApplies: true, qtyApplies: false, optionApplies: true, expiryHoldApplies: true },
  { code: 'FOREX', name: 'Forex', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: false },
  { code: 'STOCKS', name: 'Stocks (International)', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: false },
  { code: 'CRYPTO_PERPETUAL', name: 'Crypto Perpetual', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: false },
  { code: 'CRYPTO_OPTIONS', name: 'Crypto Options', lotApplies: true, qtyApplies: false, optionApplies: true, expiryHoldApplies: true },
  { code: 'INDICES', name: 'Indices', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: false },
  { code: 'COMMODITIES', name: 'Commodities', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: false },
];

// 10 Setting category tabs (Risk Management moved to separate submenu)
const SETTING_CATEGORIES = [
  { id: 'lot', label: 'Lot Settings' },
  { id: 'quantity', label: 'Quantity Settings' },
  { id: 'value', label: 'Value Settings' },
  { id: 'fixedMargin', label: 'Fixed Margin' },
  { id: 'options', label: 'Options' },
  { id: 'brokerage', label: 'Brokerage' },
  { id: 'limitPoint', label: 'Limit away' },
  { id: 'spread', label: 'Spread' },
  { id: 'block', label: 'Block' },
  { id: 'expiryHold', label: 'Expiry day' },
];

// Fields for each category
const CATEGORY_FIELDS = {
  lot: [
    { key: 'minLots', label: 'Min Lot', type: 'number', step: '0.01' },
    { key: 'orderLots', label: 'Per Order Lot', type: 'number', step: '0.01' },
    { key: 'maxLots', label: 'Max Lot/Script', type: 'number', step: '0.01' },
    {
      key: 'maxExchangeLots',
      label: 'Max exchange lots',
      type: 'number',
      step: '0.01',
      segmentTabOnly: true,
      onlyMainSegmentsTab: true,
      tooltip:
        'Segment-wide cap: total lots (open + pending) allowed in this segment across all symbols. Editable only on segment defaults — not on script overrides. N/A on NSE/BSE cash equity (quantity-based).',
    },
  ],
  quantity: [
    { key: 'minQty', label: 'Min Qty', type: 'number' },
    { key: 'perOrderQty', label: 'Per Order Qty', type: 'number' },
    { key: 'maxQtyPerScript', label: 'Max Qty/Script', type: 'number' },
  ],
  value: [
    {
      key: 'maxValue',
      label: 'Max margin value (₹ INR)',
      type: 'number',
      tooltip:
        'Cap on total margin used in this segment, entered in Indian Rupees (₹). Compared against INR margin before orders are booked. Use 0 for unlimited.',
    },
  ],
  fixedMargin: [
    {
      key: 'marginCalcMode',
      label: 'Margin Mode',
      type: 'select',
      options: [
        { v: 'fixed', l: 'Fixed — per lot/share' },
        { v: 'times', l: 'Times — multiplier (buying power)' },
      ],
      tooltip:
        'How margin values are calculated:\n• Fixed: margin = value × lots (F&O) or value × shares (EQ). Enter the value in ₹ INR (Indian segments); for Forex/Crypto fixed margin, still enter ₹—server converts to USD for the wallet.\n• Times: margin = (qty × price) / value — unitless multiplier (e.g. 100 → 100× buying power).',
    },
    {
      key: 'intradayMargin',
      label: 'Intraday Margin',
      type: 'number',
      tooltip:
        'Fixed mode: ₹ per lot (F&O) or ₹ per share (EQ). Percent mode: % of (qty × price). Times mode: unitless multiplier. All ₹ amounts are INR.',
    },
    {
      key: 'overnightMargin',
      label: 'Overnight Margin',
      type: 'number',
      tooltip:
        'Fixed mode: ₹ per lot or ₹ per share. Percent / times same as intraday. Carry-forward session. All ₹ amounts are INR.',
    },
    {
      key: 'optionBuyIntraday',
      label: 'Opt Buy Intraday',
      type: 'number',
      optionOnly: true,
      tooltip: 'Option buy intraday; uses same margin mode (fixed/percent/times) as other margin columns.',
    },
    {
      key: 'optionBuyOvernight',
      label: 'Opt Buy Overnight',
      type: 'number',
      optionOnly: true,
      tooltip: 'Option buy overnight; same margin mode (fixed/percent/times) as segment toggle.',
    },
    {
      key: 'optionSellIntraday',
      label: 'Opt Sell Intraday',
      type: 'number',
      optionOnly: true,
      tooltip: 'Option sell intraday; same margin mode (fixed/percent/times) as segment toggle.',
    },
    {
      key: 'optionSellOvernight',
      label: 'Opt Sell Overnight',
      type: 'number',
      optionOnly: true,
      tooltip: 'Option sell overnight; same margin mode (fixed/percent/times) as segment toggle.',
    },
  ],
  options: [
    {
      key: 'buyingStrikeFarPercent',
      label: 'Buy max % from underlying',
      type: 'number',
      step: '0.1',
      segmentTabOnly: true,
      tooltip: 'Max |option strike − underlying| = underlying × (this % / 100). Example: 10% at underlying 24000 → ±2400.',
    },
    {
      key: 'sellingStrikeFarPercent',
      label: 'Sell max % from underlying',
      type: 'number',
      step: '0.1',
      segmentTabOnly: true,
      tooltip: 'Same as buy %, applied when selling/writing the option.',
    },
    {
      key: 'buyingStrikeFar',
      label: 'Buy max (price units)',
      type: 'number',
      scriptTabOnly: true,
      tooltip: 'Fixed max |strike − underlying| in ₹ for this symbol; overrides segment % for buys.',
    },
    {
      key: 'sellingStrikeFar',
      label: 'Sell max (price units)',
      type: 'number',
      scriptTabOnly: true,
      tooltip: 'Fixed max |strike − underlying| in ₹ for this symbol; overrides segment % for sells.',
    },
  ],
  // riskManagement: [...] removed — orphan from a pre-refactor layout that's no
  // longer in SETTING_CATEGORIES. Margin-call / stop-out are admin-wide and
  // configured at /admin/risk-management, not per segment. The schema fields
  // were also dropped from server/models/{Hedging,Netting}Segment.js.
  brokerage: [
    { key: 'commissionType', label: 'Type', type: 'select', options: [{ v: 'per_lot', l: 'Per Lot' }, { v: 'per_crore', l: 'Per Crore' }] },
    {
      key: 'commission',
      label: 'Commission (₹)',
      type: 'number',
      // Fix 22: single rate is N/A on OPT segments — those use the per-side
      // optionBuyCommission / optionSellCommission fields below.
      notForOption: true,
      tooltip: 'Commission amount in INR. Automatically converted to USD using live exchange rate. N/A for OPT segments — use the per-side Buy/Sell columns instead.',
    },
    {
      key: 'optionBuyCommission',
      label: 'Buy Brokerage (₹)',
      type: 'number',
      // Fix 22: per-side rates apply ONLY to OPT segments. Disabled (N/A) on
      // non-OPT segments — those use the single Commission column above.
      optionOnly: true,
      tooltip: 'OPT segments only. Commission charged on BUY-side option trades (INR). Charged at open/close per the Charge On rule.',
    },
    {
      key: 'optionSellCommission',
      label: 'Sell Brokerage (₹)',
      type: 'number',
      optionOnly: true,
      tooltip: 'OPT segments only. Commission charged on SELL-side option trades (INR). Charged at open/close per the Charge On rule.',
    },
    { key: 'chargeOn', label: 'Charge On', type: 'select', options: [{ v: 'open', l: 'Open' }, { v: 'close', l: 'Close' }, { v: 'both', l: 'Both' }] },
  ],
  limitPoint: [
    {
      key: 'limitAwayPercent',
      label: 'Max % away from market',
      type: 'number',
      step: '0.1',
      segmentTabOnly: true,
      tooltip: 'Scales with price (e.g. 10% at ₹100 → ±₹10). Buy limit between market−band and market; sell between market and market+band.',
    },
    {
      key: 'limitAwayPoints',
      label: 'Max points away',
      type: 'number',
      scriptTabOnly: true,
      tooltip: 'Fixed price distance for this symbol only. Overrides segment % when set.',
    },
  ],
  spread: [
    { key: 'spreadType', label: 'Spread Type', type: 'select', options: [{ v: 'fixed', l: 'Fixed' }, { v: 'floating', l: 'Floating' }] },
    {
      key: 'spreadPips',
      label: 'Spread (instrument price units)',
      type: 'number',
      step: '0.1',
      tooltip:
        'Width added to bid/ask in the symbol quote currency (e.g. USD on EURUSD, rupees on NSE)—not a separate INR field.',
    },
    {
      key: 'swapType',
      label: 'Swap Type',
      type: 'select',
      options: [{ v: 'points', l: 'Points' }, { v: 'percentage', l: 'Percentage' }],
      tooltip: 'How overnight swap is derived from the fields below. Charges are converted to USD for the user wallet using the live USD/INR rate.',
    },
    {
      key: 'swapLong',
      label: 'Swap Long',
      type: 'number',
      step: '0.01',
      tooltip:
        'Long overnight swap coefficient. For Indian F&O, think in ₹ terms consistent with segment defaults; engine maps fees to the USD wallet.',
    },
    {
      key: 'swapShort',
      label: 'Swap Short',
      type: 'number',
      step: '0.01',
      tooltip: 'Short overnight swap coefficient (same rules as Swap Long).',
    },
    {
      key: 'swapTime',
      label: 'Swap Time (IST)',
      type: 'time',
      tooltip:
        'Per-segment swap charge time in IST (HH:mm). The per-minute scheduler applies overnight swap to all open positions in this segment when the IST clock hits this minute. Default 22:30 (matches the legacy 17:00 UTC EOD trigger). Set 15:30 for post-NSE-close, 22:00 for FX rollover, etc.',
    },
  ],
  block: [
    { key: 'isActive', label: 'Is Active', type: 'select', options: [{ v: true, l: 'Yes' }, { v: false, l: 'No' }] },
    { key: 'tradingEnabled', label: 'Access Enabled', type: 'select', options: [{ v: true, l: 'Yes' }, { v: false, l: 'No' }] },
    { key: 'allowOvernight', label: 'Allow overnight (CF)', type: 'select', options: [{ v: true, l: 'Yes' }, { v: false, l: 'No' }] },
  ],
  expiryHold: [
    {
      key: 'expiryProfitHoldMinSeconds',
      label: 'Expiry profit hold (sec)',
      type: 'number',
      tooltip:
        'On contract expiry day (IST): minimum seconds before the user can close a profitable trade. 0 = use only global Risk settings profit hold. When set, overrides global/user profit hold for that day.',
    },
    {
      key: 'expiryLossHoldMinSeconds',
      label: 'Expiry loss hold (sec)',
      type: 'number',
      tooltip:
        'On expiry day (IST): minimum seconds before closing a losing trade. 0 = use only global loss hold. When set, overrides global/user loss hold.',
    },
    {
      key: 'expiryDayIntradayMargin',
      label: 'Expiry day margin (futures)',
      type: 'number',
      futureOnly: true,
      tooltip:
        'On IST expiry day: fixed margin for FUTURES orders only. Mode (₹ / % / ×) follows the segment marginCalcMode. N/A for OPT segments — option expiry margin is set via the per-side BUY/SELL fields below.',
    },
    {
      key: 'expiryDayOptionBuyMargin',
      label: 'Expiry day option BUY margin',
      type: 'number',
      optionOnly: true,
      tooltip:
        'On IST expiry day only: fixed margin for OPTION BUY orders. Mirrors the non-expiry "Option buy intraday" field. N/A for FUT segments.',
    },
    {
      key: 'expiryDayOptionSellMargin',
      label: 'Expiry day option SELL margin',
      type: 'number',
      optionOnly: true,
      tooltip:
        'On IST expiry day only: fixed margin for OPTION SELL orders. Mirrors the non-expiry "Option sell intraday" field. N/A for FUT segments.',
    },
  ],
};

/** Short hints for unified segment matrix (scroll-to-group panel). */
const SEGMENT_MATRIX_HELP = {
  lot: 'Min / per-order / max lots / max exchange lots (segment-only). N/A on cash equity rows.',
  quantity: 'Min, per-order, max qty per script. N/A except NSE/BSE EQ.',
  value: 'Limit type (lot vs price) and max margin cap in ₹ INR.',
  fixedMargin: 'Margin mode + intraday/overnight (₹ for fixed) + option legs on OPT rows.',
  options: 'Buy/sell max strike distance as % of underlying. OPT segments only.',
  brokerage: 'Commission in ₹ INR; type and charge on open/close/both.',
  limitPoint: 'Netting limit orders: max % away from market (segment default).',
  spread: 'Fixed vs floating spread floor; swap type and long/short.',
  block: 'Active, trading, overnight carry-forward.',
  expiryHold: 'Indian F&O only: expiry-day holds + expiry margin (times multiplier).',
};

const SEGMENT_MATRIX_HEADER_ROW1_PX = 40;

/** Indian segments → display label (placeholders) */
const ZERODHA_SEGMENT_LABEL = {
  NSE_EQ: 'NSE EQ',
  BSE_EQ: 'BSE EQ',
  NSE_FUT: 'NSE FUT',
  NSE_OPT: 'NSE OPT',
  BSE_FUT: 'BSE FUT',
  BSE_OPT: 'BSE OPT',
  MCX_FUT: 'MCX FUT',
  MCX_OPT: 'MCX OPT',
};

/** Netting code → Zerodha API ?segment= (must match server zerodhaService.searchAllInstruments — NOT "NSE EQ") */
const NETTING_CODE_TO_ZERODHA_API_SEGMENT = {
  NSE_EQ: 'nseEq',
  BSE_EQ: 'bseEq',
  NSE_FUT: 'nseFut',
  NSE_OPT: 'nseOpt',
  BSE_FUT: 'bseFut',
  BSE_OPT: 'bseOpt',
  MCX_FUT: 'mcxFut',
  MCX_OPT: 'mcxOpt',
};

/** Netting code → /api/instruments ?category= (MetaAPI list, same as user MT5 search) */
const BROKER_INSTRUMENT_CATEGORY = {
  FOREX: 'forex',
  STOCKS: 'stocks',
  INDICES: 'indices',
  COMMODITIES: 'com',
};

/** Segments that have a live instrument API in this admin UI (Zerodha / Delta / broker list). */
function segmentHasLiveInstrumentSearch(segCode) {
  if (!segCode) return false;
  if (NETTING_CODE_TO_ZERODHA_API_SEGMENT[segCode]) return true;
  if (segCode === 'CRYPTO_PERPETUAL' || segCode === 'CRYPTO_OPTIONS') return true;
  if (BROKER_INSTRUMENT_CATEGORY[segCode]) return true;
  return false;
}

function NettingSegmentSettings() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const activeTab = tab === 'scripts' ? 'scripts' : tab === 'users' ? 'users' : tab === 'copy' ? 'copy' : 'segments';

  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingData, setEditingData] = useState({});
  const [settingCategory, setSettingCategory] = useState('lot');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Script settings state
  const [scripts, setScripts] = useState([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  /** Filters saved overrides (debounced) + supplies symbol for + Add — same idea as user “search symbol” */
  const [scriptSymbolQuery, setScriptSymbolQuery] = useState('');
  const [debouncedSymbolQuery, setDebouncedSymbolQuery] = useState('');
  const [scriptSearchAllSegments, setScriptSearchAllSegments] = useState(false);
  const [liveInstrumentHits, setLiveInstrumentHits] = useState([]);
  const [liveInstrumentLoading, setLiveInstrumentLoading] = useState(false);
  const [instrumentSuggestOpen, setInstrumentSuggestOpen] = useState(false);
  const instrumentSearchWrapRef = useRef(null);
  const [selectedSegmentFilter, setSelectedSegmentFilter] = useState('');
  const [editingScripts, setEditingScripts] = useState({});
  const [savingScripts, setSavingScripts] = useState(false);
  const [addingScript, setAddingScript] = useState(false);
  /** Uppercase symbol last chosen from search dropdown — required before + Add (typed text alone is not enough). */
  const [scriptPickedSymbol, setScriptPickedSymbol] = useState(null);

  // User settings state
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [targetUserSearch, setTargetUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userSettings, setUserSettings] = useState([]);
  const [editingUserSettings, setEditingUserSettings] = useState({});
  const [savingUserSettings, setSavingUserSettings] = useState(false);
  /** User detail: segment-wide vs per-symbol overrides */
  const [userSettingsView, setUserSettingsView] = useState('segments');
  const [userScriptSymbolQuery, setUserScriptSymbolQuery] = useState('');
  const [debouncedUserScriptQuery, setDebouncedUserScriptQuery] = useState('');
  const [userScriptSegmentFilter, setUserScriptSegmentFilter] = useState('');
  const [userScriptSearchAllSegments, setUserScriptSearchAllSegments] = useState(false);
  const [userScriptInstrumentHits, setUserScriptInstrumentHits] = useState([]);
  const [userScriptInstrumentLoading, setUserScriptInstrumentLoading] = useState(false);
  const [userScriptSuggestOpen, setUserScriptSuggestOpen] = useState(false);
  const userScriptInstrumentWrapRef = useRef(null);
  const [editingUserScriptRows, setEditingUserScriptRows] = useState({});
  const [addingUserScript, setAddingUserScript] = useState(false);
  const [savingUserScriptRows, setSavingUserScriptRows] = useState(false);
  const [userScriptPickedSymbol, setUserScriptPickedSymbol] = useState(null);

  // Copy settings state
  const [copySourceUser, setCopySourceUser] = useState(null);
  const [copyTargetUsers, setCopyTargetUsers] = useState([]);
  const [copying, setCopying] = useState(false);

  const segmentMatrixScrollRef = useRef(null);
  const segmentCategoryColRefs = useRef({});
  const [segmentJumpCategory, setSegmentJumpCategory] = useState('');

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // Fetch netting segments
  const fetchSegments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/admin/netting-segments`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (data.success) {
        setSegments(data.segments || []);
      }
    } catch (error) {
      console.error('Error fetching netting segments:', error);
      showToast('Error loading segments', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'segments' || activeTab === 'scripts' || (activeTab === 'users' && selectedUser)) {
    fetchSegments();
    }
  }, [activeTab, selectedUser, fetchSegments]);

  // Get segment data by code
  const getSegmentByCode = useCallback((code) => {
    return segments.find(s => s.name === code || s.code === code) || {};
  }, [segments]);

  // Update cell for inline editing
  const updateCell = (segmentCode, key, value) => {
    setEditingData(prev => ({
      ...prev,
      [segmentCode]: { ...(prev[segmentCode] || {}), [key]: value }
    }));
  };

  const updateScriptCell = (scriptId, key, value) => {
    setEditingScripts((prev) => ({
      ...prev,
      [scriptId]: { ...(prev[scriptId] || {}), [key]: value }
    }));
  };

  const getScriptStoredValue = (script, fieldKey) => {
    if (fieldKey === 'intradayMargin') return script.intradayMargin ?? script.intradayHolding ?? null;
    if (fieldKey === 'overnightMargin') return script.overnightMargin ?? script.overnightHolding ?? null;
    return script[fieldKey];
  };

  const updateUserScriptCell = (rowId, key, value) => {
    setEditingUserScriptRows((prev) => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || {}), [key]: value }
    }));
  };

  const updateUserSegmentCell = (segmentCode, key, value) => {
    setEditingUserSettings((prev) => ({
      ...prev,
      [segmentCode]: { ...(prev[segmentCode] || {}), [key]: value }
    }));
  };

  const renderUserScriptInput = (row, segmentCode, field, category) => {
    if (isFieldNA(segmentCode, category, field.key)) {
      return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>N/A</span>;
    }

    const editedVal = editingUserScriptRows[row._id]?.[field.key];
    const stored = getScriptStoredValue(row, field.key);
    const currentValue = editedVal !== undefined ? editedVal : stored;

    if (field.type === 'select') {
      return (
        <select
          value={currentValue !== undefined && currentValue !== null ? String(currentValue) : ''}
          onChange={(e) => {
            let val = e.target.value;
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (val === '') val = null;
            updateUserScriptCell(row._id, field.key, val);
          }}
          style={{
            width: '100%',
            minWidth: '72px',
            padding: '6px 8px',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: '12px'
          }}
        >
          <option value="">Segment default</option>
          {field.options.map((opt) => (
            <option key={String(opt.v)} value={String(opt.v)}>{opt.l}</option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={field.type}
        value={currentValue !== undefined && currentValue !== null ? currentValue : ''}
        onChange={(e) => {
          let val = e.target.value;
          if (field.type === 'number') {
            val = val === '' ? null : Number(val);
          }
          updateUserScriptCell(row._id, field.key, val);
        }}
        step={field.step || 'any'}
        placeholder={field.placeholder || 'default'}
        style={{
          width: '100%',
          minWidth: '64px',
          padding: '6px 8px',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          fontSize: '12px'
        }}
      />
    );
  };

  const renderUserSegmentInput = (segmentCode, userSetting, field, category) => {
    if (isFieldNA(segmentCode, category, field.key)) {
      return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>N/A</span>;
    }

    const editedVal = editingUserSettings[segmentCode]?.[field.key];
    const displayVal = (fk) => {
      if (!userSetting) return undefined;
      if (fk === 'intradayMargin') return userSetting.intradayHolding ?? userSetting.intradayMargin;
      if (fk === 'overnightMargin') return userSetting.overnightHolding ?? userSetting.overnightMargin;
      return userSetting[fk];
    };
    const stored = displayVal(field.key);
    const currentValue = editedVal !== undefined ? editedVal : stored;

    if (field.type === 'select') {
      return (
        <select
          value={currentValue !== undefined && currentValue !== null ? String(currentValue) : ''}
          onChange={(e) => {
            let val = e.target.value;
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (val === '') val = null;
            updateUserSegmentCell(segmentCode, field.key, val);
          }}
          style={{
            width: '100%',
            minWidth: '72px',
            padding: '6px 8px',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: '12px'
          }}
        >
          <option value="">Segment default</option>
          {field.options.map((opt) => (
            <option key={String(opt.v)} value={String(opt.v)}>{opt.l}</option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={field.type}
        value={currentValue !== undefined && currentValue !== null ? currentValue : ''}
        onChange={(e) => {
          let val = e.target.value;
          if (field.type === 'number') {
            val = val === '' ? null : Number(val);
          }
          updateUserSegmentCell(segmentCode, field.key, val);
        }}
        step={field.step || 'any'}
        placeholder={field.placeholder || 'default'}
        style={{
          width: '100%',
          minWidth: '64px',
          padding: '6px 8px',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          fontSize: '12px'
        }}
      />
    );
  };

  const saveUserSegmentEdits = async () => {
    const codes = Object.keys(editingUserSettings);
    if (codes.length === 0 || !selectedUser) return;
    setSavingUserSettings(true);
    try {
      for (const code of codes) {
        const raw = editingUserSettings[code];
        const payload = {};
        for (const [k, v] of Object.entries(raw)) {
          payload[k] = v === '' ? null : v;
        }
        if ('intradayMargin' in payload) {
          payload.intradayHolding = payload.intradayMargin;
          delete payload.intradayMargin;
        }
        if ('overnightMargin' in payload) {
          payload.overnightHolding = payload.overnightMargin;
          delete payload.overnightMargin;
        }

        // Find existing row for this segment (segment-level, no symbol)
        const existingRow = userSettings.find(
          (s) => !(s.symbol != null && String(s.symbol).trim() !== '') && (s.segmentName || s.segmentCode) === code
        );

        if (existingRow?._id) {
          // Update existing
          const res = await fetch(`${API_URL}/api/admin/user-segment-settings/${existingRow._id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
            },
            body: JSON.stringify(payload)
      });
      const data = await res.json();
          if (!data.success) throw new Error(data.error || data.message || 'Save failed');
      } else {
          // Create new via bulk
          const segDoc = segments.find((s) => s.name === code);
          if (!segDoc?._id) throw new Error(`Segment ${code} not found`);
          const res = await fetch(`${API_URL}/api/admin/user-segment-settings/bulk`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
            },
            body: JSON.stringify({
              userIds: [selectedUser._id],
              segmentId: segDoc._id,
              segmentName: segDoc.name,
              tradeMode: 'netting',
              settings: payload
            })
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error || data.message || 'Save failed');
        }
      }
      showToast(`Saved ${codes.length} segment override(s)`);
      setEditingUserSettings({});
      fetchUserSettings(selectedUser._id);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSavingUserSettings(false);
    }
  };

  // Save all edited segments
  const saveAllSegments = async () => {
    const editedCodes = Object.keys(editingData);
    if (editedCodes.length === 0) return;
    
    setSaving(true);
    try {
      for (const code of editedCodes) {
        const segment = segments.find(s => s.name === code || s.code === code);
        if (!segment) continue;

        const res = await fetch(`${API_URL}/api/admin/netting-segments/${segment._id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
          },
          body: JSON.stringify(editingData[code])
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to save');
        }
      showToast(`Saved ${editedCodes.length} segment(s) successfully`);
      setEditingData({});
      fetchSegments();
      } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Check if a field should show N/A for a segment
  const isFieldNA = (segmentCode, category, fieldKey) => {
    const segmentDef = NETTING_SEGMENTS.find(s => s.code === segmentCode);
    if (!segmentDef) return false;

    // Lot settings: N/A for NSE_EQ and BSE_EQ
    if (category === 'lot' && !segmentDef.lotApplies) return true;

    // Quantity settings: Only for NSE_EQ and BSE_EQ
    if (category === 'quantity' && !segmentDef.qtyApplies) return true;

    // Options settings: Only for *_OPT segments
    if (category === 'options' && !segmentDef.optionApplies) return true;

    // Fixed margin option fields: Only for *_OPT segments
    if (category === 'fixedMargin') {
      const field = CATEGORY_FIELDS.fixedMargin.find(f => f.key === fieldKey);
      if (field?.optionOnly && !segmentDef.optionApplies) return true;
    }

    // Brokerage (Fix 22): per-side option commission fields are only enabled
    // on OPT segments; the legacy single `commission` field is disabled there.
    if (category === 'brokerage') {
      const field = CATEGORY_FIELDS.brokerage.find(f => f.key === fieldKey);
      if (field?.optionOnly && !segmentDef.optionApplies) return true;
      if (field?.notForOption && segmentDef.optionApplies) return true;
    }

    // Expiry day holds/margins: Indian F&O only (NSE/BSE/MCX FUT & OPT), not EQ / global markets / crypto
    if (category === 'expiryHold') {
      if (!segmentDef.expiryHoldApplies) return true;
      // Per-field FUT vs OPT gating (Fix 17b clarification):
      //   futureOnly → only show on segments where optionApplies === false (i.e., FUT segments)
      //   optionOnly → only show on segments where optionApplies === true (i.e., OPT segments)
      const field = CATEGORY_FIELDS.expiryHold.find(f => f.key === fieldKey);
      if (field?.futureOnly && segmentDef.optionApplies) return true;
      if (field?.optionOnly && !segmentDef.optionApplies) return true;
    }

    return false;
  };

  /** True if this setting category has at least one applicable field for the segment code (e.g. Options only for *_OPT). */
  const categoryAppliesToSegmentCode = (segmentCode, categoryId) => {
    if (!segmentCode) return true;
    const fields = CATEGORY_FIELDS[categoryId] || [];
    return fields.some((f) => !isFieldNA(segmentCode, categoryId, f.key));
  };

  /** All segment columns in one list (excludes script-only fields). Used for unified matrix table. */
  const unifiedSegmentFields = useMemo(() => {
    const out = [];
    for (const cat of SETTING_CATEGORIES) {
      for (const f of CATEGORY_FIELDS[cat.id] || []) {
        if (f.scriptTabOnly) continue;
        out.push({ ...f, categoryId: cat.id, categoryLabel: cat.label });
      }
    }
    return out;
  }, []);

  const segmentCategoryGroups = useMemo(() => {
    const groups = [];
    let i = 0;
    const list = unifiedSegmentFields;
    while (i < list.length) {
      const id = list[i].categoryId;
      let count = 0;
      while (i + count < list.length && list[i + count].categoryId === id) {
        count += 1;
      }
      const cat = SETTING_CATEGORIES.find((c) => c.id === id);
      groups.push({ id, label: cat?.label || id, count, startIndex: i });
      i += count;
    }
    return groups;
  }, [unifiedSegmentFields]);

  const scrollSegmentMatrixToCategory = useCallback((categoryId) => {
    if (!segmentMatrixScrollRef.current) return;
    const wrap = segmentMatrixScrollRef.current;
    if (!categoryId) {
      wrap.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    const el = segmentCategoryColRefs.current[categoryId];
    if (!el) return;
    const targetLeft = el.offsetLeft - 32;
    wrap.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, []);

  // Render input field
  const renderInput = (segmentCode, field, category) => {
    if (isFieldNA(segmentCode, category, field.key)) {
      return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>N/A</span>;
    }

    const segment = getSegmentByCode(segmentCode);
    const editedValue = editingData[segmentCode]?.[field.key];
    let currentValue = editedValue !== undefined ? editedValue : segment[field.key];
    if (field.key === 'marginCalcMode' && (currentValue === undefined || currentValue === null)) {
      currentValue = 'fixed';
    }
    if (field.key === 'allowOvernight' && (currentValue === undefined || currentValue === null)) {
      currentValue = true;
    }

    if (field.type === 'select') {
      return (
        <select
          value={currentValue !== undefined && currentValue !== null ? String(currentValue) : ''}
          onChange={(e) => {
            let val = e.target.value;
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (val === '') val = null;
            updateCell(segmentCode, field.key, val);
          }}
          style={{
            width: '100%',
            padding: '6px 8px',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: '12px'
          }}
        >
          {field.options.map(opt => (
            <option key={String(opt.v)} value={String(opt.v)}>{opt.l}</option>
          ))}
        </select>
      );
    }

      return (
        <input
        type={field.type}
        value={currentValue !== undefined && currentValue !== null ? currentValue : ''}
        onChange={(e) => {
          let val = e.target.value;
          if (field.type === 'number') {
            val = val === '' ? null : Number(val);
          }
          updateCell(segmentCode, field.key, val);
        }}
        step={field.step || 'any'}
        placeholder={field.placeholder || ''}
        style={{
          width: '100%',
          padding: '6px 8px',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          fontSize: '12px'
        }}
      />
    );
  };

  const renderScriptInput = (script, segmentCode, field, category) => {
    if (isFieldNA(segmentCode, category, field.key)) {
      return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>N/A</span>;
    }

    const editedVal = editingScripts[script._id]?.[field.key];
    const stored = getScriptStoredValue(script, field.key);
    const currentValue = editedVal !== undefined ? editedVal : stored;

    if (field.type === 'select') {
      return (
        <select
          value={currentValue !== undefined && currentValue !== null ? String(currentValue) : ''}
          onChange={(e) => {
            let val = e.target.value;
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (val === '') val = null;
            updateScriptCell(script._id, field.key, val);
          }}
          style={{
            width: '100%',
            minWidth: '72px',
            padding: '6px 8px',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: '12px'
          }}
        >
          <option value="">Segment default</option>
          {field.options.map((opt) => (
            <option key={String(opt.v)} value={String(opt.v)}>{opt.l}</option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={field.type}
        value={currentValue !== undefined && currentValue !== null ? currentValue : ''}
        onChange={(e) => {
          let val = e.target.value;
          if (field.type === 'number') {
            val = val === '' ? null : Number(val);
          }
          updateScriptCell(script._id, field.key, val);
        }}
        step={field.step || 'any'}
        placeholder={field.placeholder || 'default'}
        style={{
          width: '100%',
          minWidth: '64px',
          padding: '6px 8px',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          fontSize: '12px'
        }}
      />
    );
  };

  const currentFields = useMemo(() => {
    let fields = CATEGORY_FIELDS[settingCategory] || [];
    if (settingCategory === 'limitPoint' || settingCategory === 'options') {
      const scriptCtx =
        activeTab === 'scripts' || (activeTab === 'users' && userSettingsView === 'scripts');
      fields = fields.filter((f) => (scriptCtx ? !f.segmentTabOnly : !f.scriptTabOnly));
    }
    if (settingCategory === 'lot') {
      fields = fields.filter((f) => {
        if (f.onlyMainSegmentsTab && activeTab !== 'segments') return false;
        const scriptCtx =
          activeTab === 'scripts' || (activeTab === 'users' && userSettingsView === 'scripts');
        if (scriptCtx) return !f.segmentTabOnly;
        return !f.scriptTabOnly;
      });
    }
    if (settingCategory === 'fixedMargin') {
      fields = fields.filter((f) => {
        if (f.onlyMainSegmentsTab && activeTab !== 'segments') return false;
        const scriptCtx =
          activeTab === 'scripts' || (activeTab === 'users' && userSettingsView === 'scripts');
        if (scriptCtx) return !f.segmentTabOnly;
        return !f.scriptTabOnly;
      });
    }
    if (settingCategory === 'expiryHold') {
      fields = fields.filter((f) => {
        if (f.onlyMainSegmentsTab && activeTab !== 'segments') return false;
        const scriptCtx =
          activeTab === 'scripts' || (activeTab === 'users' && userSettingsView === 'scripts');
        if (scriptCtx) return !f.segmentTabOnly;
        return !f.scriptTabOnly;
      });
    }
    return fields;
  }, [settingCategory, activeTab, userSettingsView]);

  const hasEdits = Object.keys(editingData).length > 0;
  const hasScriptEdits = Object.keys(editingScripts).length > 0;

  const scriptCategoriesVisible = useMemo(() => {
    if (activeTab !== 'scripts') return SETTING_CATEGORIES;
    if (selectedSegmentFilter) {
      return SETTING_CATEGORIES.filter((cat) => categoryAppliesToSegmentCode(selectedSegmentFilter, cat.id));
    }
    const codes = [...new Set((scripts || []).map((s) => s.segment).filter(Boolean))];
    if (codes.length === 0) return SETTING_CATEGORIES;
    return SETTING_CATEGORIES.filter((cat) =>
      codes.some((code) => categoryAppliesToSegmentCode(code, cat.id))
    );
  }, [activeTab, selectedSegmentFilter, scripts]);

  const scriptTableFields = useMemo(() => {
    let fields = CATEGORY_FIELDS[settingCategory] || [];
    if (settingCategory === 'limitPoint' || settingCategory === 'options') {
      fields = fields.filter((f) => !f.segmentTabOnly);
    }
    if (settingCategory === 'lot') {
      fields = fields.filter((f) => {
        if (f.onlyMainSegmentsTab) return false;
        return !f.segmentTabOnly;
      });
    }
    if (settingCategory === 'fixedMargin') {
      fields = fields.filter((f) => {
        if (f.onlyMainSegmentsTab) return false;
        return !f.segmentTabOnly;
      });
    }
    if (settingCategory === 'expiryHold') {
      fields = fields.filter((f) => {
        if (f.onlyMainSegmentsTab) return false;
        return !f.segmentTabOnly;
      });
    }
    if (activeTab !== 'scripts') return fields;
    if (!selectedSegmentFilter) return fields;
    return fields.filter((f) => !isFieldNA(selectedSegmentFilter, settingCategory, f.key));
  }, [activeTab, selectedSegmentFilter, settingCategory]);

  useEffect(() => {
    if (activeTab !== 'scripts') return;
    const ids = scriptCategoriesVisible.map((c) => c.id);
    if (ids.length && !ids.includes(settingCategory)) {
      setSettingCategory(ids[0]);
      setEditingScripts({});
    }
  }, [activeTab, scriptCategoriesVisible, settingCategory]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSymbolQuery(scriptSymbolQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [scriptSymbolQuery]);

  useEffect(() => {
    if (!scriptSymbolQuery.trim()) setScriptSearchAllSegments(false);
  }, [scriptSymbolQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedUserScriptQuery(userScriptSymbolQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [userScriptSymbolQuery]);

  useEffect(() => {
    if (!userScriptSymbolQuery.trim()) setUserScriptSearchAllSegments(false);
  }, [userScriptSymbolQuery]);

  useEffect(() => {
    const onDoc = (e) => {
      if (instrumentSearchWrapRef.current && !instrumentSearchWrapRef.current.contains(e.target)) {
        setInstrumentSuggestOpen(false);
      }
      if (userScriptInstrumentWrapRef.current && !userScriptInstrumentWrapRef.current.contains(e.target)) {
        setUserScriptSuggestOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Live instrument suggestions (Zerodha / Delta / MetaAPI) — mirrors user Market “search symbol”
  useEffect(() => {
    if (activeTab !== 'scripts') return;
    const seg = selectedSegmentFilter;
    const q = scriptSymbolQuery.trim();
    if (!seg || !q) {
      setLiveInstrumentHits([]);
      setLiveInstrumentLoading(false);
      return;
    }

    const zerodhaApiSeg = NETTING_CODE_TO_ZERODHA_API_SEGMENT[seg];
    const minLen = zerodhaApiSeg ? 2 : 1;
    if (q.length < minLen) {
      setLiveInstrumentHits([]);
      setLiveInstrumentLoading(false);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      setLiveInstrumentLoading(true);
      try {
        let rows = [];
        if (zerodhaApiSeg) {
          const res = await fetch(
            `${API_URL}/api/zerodha/instruments/search?query=${encodeURIComponent(q)}&segment=${encodeURIComponent(zerodhaApiSeg)}&isAdmin=true`
          );
          const data = await res.json();
          rows = (data.instruments || []).map((i) => ({
            key: String(i.token ?? i.symbol),
            symbol: i.symbol,
            name: [i.name, i.exchange, i.expiry].filter(Boolean).join(' · ')
          }));
        } else if (seg === 'CRYPTO_PERPETUAL') {
          const res = await fetch(`${API_URL}/api/delta/instruments?search=${encodeURIComponent(q)}&category=perpetual`);
          const data = await res.json();
          rows = (data.instruments || []).map((i) => ({
            key: i.symbol,
            symbol: i.symbol,
            name: [i.name, i.contract_type].filter(Boolean).join(' · ')
          }));
        } else if (seg === 'CRYPTO_OPTIONS') {
          const res = await fetch(`${API_URL}/api/delta/instruments?search=${encodeURIComponent(q)}&category=options`);
          const data = await res.json();
          rows = (data.instruments || []).map((i) => ({
            key: i.symbol,
            symbol: i.symbol,
            name: [i.name, i.contract_type].filter(Boolean).join(' · ')
          }));
        } else if (BROKER_INSTRUMENT_CATEGORY[seg]) {
          const cat = BROKER_INSTRUMENT_CATEGORY[seg];
          const res = await fetch(`${API_URL}/api/instruments?search=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}`);
          const data = await res.json();
          const list = data.instruments || [];
          const filtered = list.filter((i) => i.category !== 'crypto_perpetual' && i.category !== 'crypto');
          rows = filtered.map((i) => ({
            key: i.symbol,
            symbol: i.symbol,
            name: i.name || ''
          }));
        }
        if (!cancelled) setLiveInstrumentHits(rows.slice(0, 50));
      } catch (err) {
        console.error('Admin instrument search:', err);
        if (!cancelled) setLiveInstrumentHits([]);
      } finally {
        if (!cancelled) setLiveInstrumentLoading(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [activeTab, scriptSymbolQuery, selectedSegmentFilter]);

  useEffect(() => {
    setScriptPickedSymbol(null);
  }, [selectedSegmentFilter]);

  // User Settings → script overrides: same instrument sources as Script Settings tab
  useEffect(() => {
    if (activeTab !== 'users' || !selectedUser || userSettingsView !== 'scripts') return;
    const seg = userScriptSegmentFilter;
    const q = userScriptSymbolQuery.trim();
    if (!seg || !q) {
      setUserScriptInstrumentHits([]);
      setUserScriptInstrumentLoading(false);
      return;
    }

    const zerodhaApiSeg = NETTING_CODE_TO_ZERODHA_API_SEGMENT[seg];
    const minLen = zerodhaApiSeg ? 2 : 1;
    if (q.length < minLen) {
      setUserScriptInstrumentHits([]);
      setUserScriptInstrumentLoading(false);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      setUserScriptInstrumentLoading(true);
      try {
        let rows = [];
        if (zerodhaApiSeg) {
          const res = await fetch(
            `${API_URL}/api/zerodha/instruments/search?query=${encodeURIComponent(q)}&segment=${encodeURIComponent(zerodhaApiSeg)}&isAdmin=true`
          );
          const data = await res.json();
          rows = (data.instruments || []).map((i) => ({
            key: String(i.token ?? i.symbol),
            symbol: i.symbol,
            name: [i.name, i.exchange, i.expiry].filter(Boolean).join(' · ')
          }));
        } else if (seg === 'CRYPTO_PERPETUAL') {
          const res = await fetch(`${API_URL}/api/delta/instruments?search=${encodeURIComponent(q)}&category=perpetual`);
          const data = await res.json();
          rows = (data.instruments || []).map((i) => ({
            key: i.symbol,
            symbol: i.symbol,
            name: [i.name, i.contract_type].filter(Boolean).join(' · ')
          }));
        } else if (seg === 'CRYPTO_OPTIONS') {
          const res = await fetch(`${API_URL}/api/delta/instruments?search=${encodeURIComponent(q)}&category=options`);
          const data = await res.json();
          rows = (data.instruments || []).map((i) => ({
            key: i.symbol,
            symbol: i.symbol,
            name: [i.name, i.contract_type].filter(Boolean).join(' · ')
          }));
        } else if (BROKER_INSTRUMENT_CATEGORY[seg]) {
          const cat = BROKER_INSTRUMENT_CATEGORY[seg];
          const res = await fetch(`${API_URL}/api/instruments?search=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}`);
          const data = await res.json();
          const list = data.instruments || [];
          const filtered = list.filter((i) => i.category !== 'crypto_perpetual' && i.category !== 'crypto');
          rows = filtered.map((i) => ({
            key: i.symbol,
            symbol: i.symbol,
            name: i.name || ''
          }));
        }
        if (!cancelled) setUserScriptInstrumentHits(rows.slice(0, 50));
      } catch (err) {
        console.error('User script instrument search:', err);
        if (!cancelled) setUserScriptInstrumentHits([]);
      } finally {
        if (!cancelled) setUserScriptInstrumentLoading(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [activeTab, selectedUser, userSettingsView, userScriptSymbolQuery, userScriptSegmentFilter]);

  useEffect(() => {
    setUserScriptPickedSymbol(null);
  }, [userScriptSegmentFilter]);

  // Fetch scripts for Script Settings tab
  const fetchScripts = useCallback(async () => {
    try {
      setScriptsLoading(true);
      const params = new URLSearchParams();
      if (debouncedSymbolQuery) params.append('search', debouncedSymbolQuery);
      if (debouncedSymbolQuery && scriptSearchAllSegments) params.append('allSegments', '1');
      if (selectedSegmentFilter) params.append('segment', selectedSegmentFilter);

      const res = await fetch(`${API_URL}/api/admin/netting-scripts?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (data.success) {
        setScripts(data.scripts || []);
      }
    } catch (error) {
      console.error('Error fetching scripts:', error);
      showToast('Error loading scripts', 'error');
    } finally {
      setScriptsLoading(false);
    }
  }, [debouncedSymbolQuery, selectedSegmentFilter, scriptSearchAllSegments]);

  useEffect(() => {
    if (activeTab === 'scripts') {
      fetchScripts();
    }
  }, [activeTab, fetchScripts]);

  const handleAddScript = async (symbolDirect = undefined) => {
    const raw = (symbolDirect != null ? String(symbolDirect) : scriptSymbolQuery).trim();
    if (!selectedSegmentFilter) {
      showToast('Select a segment before adding a script', 'error');
      return;
    }
    if (!raw) {
      showToast('Search and choose a symbol from the list', 'error');
      return;
    }
    const sym = raw.toUpperCase();
    if (segmentHasLiveInstrumentSearch(selectedSegmentFilter)) {
      if (symbolDirect == null) {
        if (!scriptPickedSymbol || sym !== scriptPickedSymbol) {
          showToast('Pick a symbol from the search results (click a row). Typed text alone is not allowed.', 'error');
          return;
        }
      }
    }
    const segDoc = segments.find((s) => s.name === selectedSegmentFilter);
    if (!segDoc?._id) {
      showToast('Segments not loaded yet — try again in a moment', 'error');
      return;
    }
    setAddingScript(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/netting-scripts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
        },
        body: JSON.stringify({
          symbol: sym,
          segmentId: segDoc._id
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || data.message || 'Failed to add script');
      showToast(data.message || 'Script override saved');
      setScriptSymbolQuery('');
      setScriptPickedSymbol(null);
      fetchScripts();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setAddingScript(false);
    }
  };

  const handleDeleteScript = async (scriptId) => {
    if (!window.confirm('Delete this script override?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/netting-scripts/${scriptId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || data.message || 'Delete failed');
      showToast('Script override removed');
      fetchScripts();
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const saveAllScripts = async () => {
    const ids = Object.keys(editingScripts);
    if (ids.length === 0) return;
    setSavingScripts(true);
    try {
      for (const id of ids) {
        const raw = editingScripts[id];
        const payload = {};
        for (const [k, v] of Object.entries(raw)) {
          payload[k] = v === '' ? null : v;
        }
        const res = await fetch(`${API_URL}/api/admin/netting-scripts/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || data.message || 'Save failed');
      }
      showToast(`Saved ${ids.length} script override(s)`);
      setEditingScripts({});
      fetchScripts();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSavingScripts(false);
    }
  };

  // Fetch users for User Settings tab
  const fetchUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      const params = new URLSearchParams();
      if (userSearch) params.append('search', userSearch);

      const res = await fetch(`${API_URL}/api/admin/users?${params.toString()}&limit=50`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setUsersLoading(false);
    }
  }, [userSearch]);

  useEffect(() => {
    if (activeTab === 'users' || activeTab === 'copy') {
      fetchUsers();
    }
  }, [activeTab, fetchUsers]);

  // Fetch user's segment settings
  const fetchUserSettings = useCallback(async (userId) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/user-segment-settings/user/${userId}?tradeMode=netting`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (data.success) {
        setUserSettings(data.settings || []);
      }
    } catch (error) {
      console.error('Error fetching user settings:', error);
    }
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchUserSettings(selectedUser._id);
    }
  }, [selectedUser, fetchUserSettings]);

  const userScriptRowsAll = useMemo(
    () => (userSettings || []).filter((s) => s.symbol != null && String(s.symbol).trim() !== ''),
    [userSettings]
  );

  const filteredUserScriptRows = useMemo(() => {
    let rows = userScriptRowsAll;
    const q = debouncedUserScriptQuery.trim();
    if (q) {
      const u = q.toUpperCase();
      rows = rows.filter((r) => String(r.symbol).toUpperCase().includes(u));
    }
    if (userScriptSegmentFilter && !userScriptSearchAllSegments) {
      rows = rows.filter((r) => (r.segmentName || r.segmentId?.name) === userScriptSegmentFilter);
    }
    return rows;
  }, [userScriptRowsAll, debouncedUserScriptQuery, userScriptSegmentFilter, userScriptSearchAllSegments]);

  const userScriptCategoriesVisible = useMemo(() => {
    if (userScriptSegmentFilter) {
      return SETTING_CATEGORIES.filter((cat) => categoryAppliesToSegmentCode(userScriptSegmentFilter, cat.id));
    }
    const codes = [...new Set(filteredUserScriptRows.map((r) => r.segmentName || r.segmentId?.name).filter(Boolean))];
    if (codes.length === 0) return SETTING_CATEGORIES;
    return SETTING_CATEGORIES.filter((cat) =>
      codes.some((code) => categoryAppliesToSegmentCode(code, cat.id))
    );
  }, [userScriptSegmentFilter, filteredUserScriptRows]);

  useEffect(() => {
    if (activeTab !== 'users' || !selectedUser || userSettingsView !== 'scripts') return;
    const ids = userScriptCategoriesVisible.map((c) => c.id);
    if (ids.length && !ids.includes(settingCategory)) {
      setSettingCategory(ids[0]);
      setEditingUserScriptRows({});
    }
  }, [activeTab, selectedUser, userSettingsView, userScriptCategoriesVisible, settingCategory]);

  const handleAddUserScript = async (symbolDirect = undefined) => {
    const raw = (symbolDirect != null ? String(symbolDirect) : userScriptSymbolQuery).trim();
    if (!selectedUser?._id) return;
    if (!userScriptSegmentFilter) {
      showToast('Select a segment before adding a script override', 'error');
      return;
    }
    if (!raw) {
      showToast('Search and choose a symbol from the list', 'error');
      return;
    }
    const sym = raw.toUpperCase();
    if (segmentHasLiveInstrumentSearch(userScriptSegmentFilter)) {
      if (symbolDirect == null) {
        if (!userScriptPickedSymbol || sym !== userScriptPickedSymbol) {
          showToast('Pick a symbol from the search results (click a row). Typed text alone is not allowed.', 'error');
          return;
        }
      }
    }
    const segDoc = segments.find((s) => s.name === userScriptSegmentFilter);
    if (!segDoc?._id) {
      showToast('Segments not loaded yet — try again in a moment', 'error');
      return;
    }
    setAddingUserScript(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/user-segment-settings/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
        },
        body: JSON.stringify({
          userIds: [selectedUser._id],
          segmentId: segDoc._id,
          segmentName: segDoc.name,
          symbol: sym,
          tradeMode: 'netting',
          settings: {}
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || data.message || 'Failed to add user script override');
      showToast(data.message || 'Saved per-user script override');
      setUserScriptSymbolQuery('');
      setUserScriptPickedSymbol(null);
      setUserScriptSuggestOpen(false);
      fetchUserSettings(selectedUser._id);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setAddingUserScript(false);
    }
  };

  const handleDeleteUserScript = async (rowId) => {
    if (!window.confirm('Remove this per-user script override?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/user-segment-settings/${rowId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || data.message || 'Delete failed');
      showToast('User script override removed');
      setEditingUserScriptRows((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      if (selectedUser) fetchUserSettings(selectedUser._id);
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const saveUserScriptEdits = async () => {
    const ids = Object.keys(editingUserScriptRows);
    if (ids.length === 0) return;
    setSavingUserScriptRows(true);
    try {
      for (const id of ids) {
        const raw = editingUserScriptRows[id];
        const payload = {};
        for (const [k, v] of Object.entries(raw)) {
          payload[k] = v === '' ? null : v;
        }
        if ('intradayMargin' in payload) {
          payload.intradayHolding = payload.intradayMargin;
          delete payload.intradayMargin;
        }
        if ('overnightMargin' in payload) {
          payload.overnightHolding = payload.overnightMargin;
          delete payload.overnightMargin;
        }
        const res = await fetch(`${API_URL}/api/admin/user-segment-settings/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || data.message || 'Save failed');
      }
      showToast(`Saved ${ids.length} user script override(s)`);
      setEditingUserScriptRows({});
      fetchUserSettings(selectedUser._id);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSavingUserScriptRows(false);
    }
  };

  // Copy settings from one user to others
  const handleCopySettings = async () => {
    if (!copySourceUser || copyTargetUsers.length === 0) {
      showToast('Select source user and at least one target user', 'error');
      return;
    }

    setCopying(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/user-segment-settings/copy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
        },
        body: JSON.stringify({
          sourceUserId: copySourceUser._id,
          targetUserIds: copyTargetUsers.map(u => u._id),
          tradeMode: 'netting'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Copied settings to ${copyTargetUsers.length} user(s)`);
        setCopyTargetUsers([]);
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="admin-page segment-management-page">
      <div className="admin-page-header">
        <h2>Netting Segment Settings</h2>
      </div>

      <div
        style={{
          marginTop: '10px',
          marginBottom: '6px',
          padding: '12px 14px',
          fontSize: '12px',
          lineHeight: 1.55,
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          background: 'rgba(59, 130, 246, 0.07)',
        }}
      >
        <strong style={{ color: 'var(--text-primary)' }}>Enter monetary settings in ₹ INR</strong>
        <p style={{ margin: '6px 0 0' }}>
          NSE, BSE, and MCX rows use rupees for margin caps, fixed margins, brokerage, and related fees. For
          Forex / Crypto / international rows, fixed margin and brokerage are still entered in{' '}
          <strong>₹</strong> (the server converts to USD for the wallet using the live USD/INR rate).{' '}
          <strong>Spread</strong> is always in the symbol&apos;s own price units (not a separate INR field).
          Percentages, leverage, and lot/qty limits are not currency amounts.
        </p>
      </div>

      {/* Main Tabs */}
      <div className="admin-tabs">
        <button 
          type="button"
          className={`admin-tab ${activeTab === 'segments' ? 'active' : ''}`}
          onClick={() => navigate('/admin/netting-segments')}
        >
          Segment Settings
        </button>
        <button 
          type="button"
          className={`admin-tab ${activeTab === 'scripts' ? 'active' : ''}`}
          onClick={() => navigate('/admin/netting-segments/scripts')}
        >
          Script Settings
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => navigate('/admin/netting-segments/users')}
        >
          User Settings
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === 'copy' ? 'active' : ''}`}
          onClick={() => navigate('/admin/netting-segments/copy')}
        >
          Copy Settings
        </button>
      </div>

      {/* Segment Settings Tab */}
      {activeTab === 'segments' && (
        <div className="admin-card" style={{ marginTop: '20px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '14px',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '12px'
            }}
          >
            <div style={{ flex: '1 1 220px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                All segment settings (one table)
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Segment names stay fixed on the left; headers stay fixed on top. Scroll horizontally for every field group.
              </p>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Scroll to group
              <select
                value={segmentJumpCategory}
                onChange={(e) => {
                  const v = e.target.value;
                  setSegmentJumpCategory(v);
                  requestAnimationFrame(() => scrollSegmentMatrixToCategory(v));
                }}
                style={{
                  minWidth: '200px',
                  padding: '8px 10px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '13px'
                }}
              >
                <option value="">— Start (left) —</option>
                {segmentCategoryGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            {segmentJumpCategory && SEGMENT_MATRIX_HELP[segmentJumpCategory] && (
              <div
                style={{
                  flex: '1 1 100%',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                  padding: '8px 10px',
                  background: 'rgba(59, 130, 246, 0.08)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <strong style={{ color: '#93c5fd' }}>{SETTING_CATEGORIES.find((c) => c.id === segmentJumpCategory)?.label}</strong>
                {' — '}
                {SEGMENT_MATRIX_HELP[segmentJumpCategory]}
            </div>
            )}
          </div>

          <details style={{ marginBottom: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500 }}>
              Full help (all groups)
            </summary>
            <div style={{ marginTop: '10px', lineHeight: 1.55, paddingLeft: '4px', maxWidth: '920px' }}>
              <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>
                Values apply per netting segment (and can be overridden per symbol in Script / User tabs unless noted). Users see errors in the trade ticket when a rule blocks an order or close.
              </p>

              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Lot settings</strong> — Min lot, per-order lot cap, max lots per symbol (script), max exchange lots (segment-only).
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: '1.25rem' }}>
                <li>
                  <strong>Logic:</strong> Min/per-order/max-per-script apply to lot-based segments. <strong>Max exchange lots</strong> caps total lots (open + pending) for the whole segment across all symbols; it is <strong>not</strong> editable on Script settings (segment matrix only). N/A on NSE/BSE EQ (quantity-based).
                </li>
                <li>
                  <strong>Example:</strong> You set per-order lot to 10. A user trying to buy 15 lots in one order gets rejected; they can place 10 + 5. You set max exchange lots to 100 and the user already has 95 lots across NSE FUT; a new 10-lot order is rejected (would exceed 100).
                </li>
              </ul>

              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Quantity settings</strong> — Min qty, per-order qty, max qty per script (NSE/BSE EQ).
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: '1.25rem' }}>
                <li>
                  <strong>Example:</strong> Min qty 5 — a 1-share order is rejected. Per-order qty 500 — a single order above 500 shares is rejected.
                </li>
              </ul>

              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Value settings</strong> — Limit type (lot vs price) and max portfolio value in the segment.
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: '1.25rem' }}>
                <li>
                  <strong>Example:</strong> Price mode with max ₹1L — total marked value of positions in that segment cannot exceed ₹1L after the order.
                </li>
              </ul>

              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Fixed margin</strong> — Intraday/overnight and option legs. Margin mode (fixed/percent/times) set on <em>segment</em> defaults; script and user overrides can inherit or override the mode.
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: '1.25rem' }}>
                <li>
                  <strong>Example:</strong> Global risk margin is ignored for that leg when a fixed margin is set; raising intraday margin increases blocked margin on new buys/sells in that segment.
                </li>
              </ul>

              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Options</strong> — How far strike may be from underlying (segment %; script points on Script tab).
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: '1.25rem' }}>
                <li>
                  <strong>Example:</strong> Buy max 10% from underlying — deep OTM calls beyond 10% of spot are rejected.
                </li>
              </ul>

              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Brokerage</strong> — Commission type (per lot / per crore), amount, charge on open/close/both.
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: '1.25rem' }}>
                <li>
                  <strong>Example:</strong> Charge on both — user pays commission when opening and when closing.
                </li>
              </ul>

              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Limit away</strong> — How far a limit price may sit from the market (segment %; script uses fixed points).
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: '1.25rem' }}>
                <li>
                  <strong>Example:</strong> 5% away — buy limit cannot be more than 5% below LTP; sell limit cannot be more than 5% above.
                </li>
              </ul>

              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Spread</strong> — Fixed applies a minimum width in price points; Floating uses max(floor, live bid−ask) when bid/ask exist.
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: '1.25rem' }}>
                <li>
                  <strong>Example:</strong> Wider spread floor — users get slightly worse fills (buy pays more, sell receives less).
                </li>
              </ul>

              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Swap</strong> — Overnight swap type and long/short values (segment defaults).
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: '1.25rem' }}>
                <li>
                  <strong>Example:</strong> Higher swap charge — carry-forward positions cost more per rollover run.
                </li>
              </ul>

              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Block</strong> — Segment active, access enabled, allow overnight (carry-forward).
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: '1.25rem' }}>
                <li>
                  <strong>Example:</strong> Trading off — user sees prices but cannot place orders. Exit-only — cannot open new symbols or add size; can only reduce/close. Allow overnight off — CF disallowed; intraday square-off rules apply.
                </li>
              </ul>

              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Expiry day</strong> (Indian futures and options segments only: NSE/BSE/MCX FUT and OPT) — Special rules when the <em>contract expiry date is today in IST</em>.
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: '1.25rem' }}>
                <li>
                  <strong>Expiry profit / loss hold (seconds):</strong> If set above zero, they override the global Risk “profit position hold” / “loss position hold” for user-initiated <em>closes</em> on that expiry day. If left 0, global risk holds still apply.
                </li>
                <li>
                  <strong>Example (hold):</strong> Global profit hold is 10s; you set expiry profit hold to 45s on NSE OPT. On expiry day, a user in profit cannot close until the position is at least 45s old (they see a message with seconds remaining).
                </li>
                <li>
                  <strong>Expiry day margin:</strong> One number for both futures and options, buy and sell. When set, on expiry day it replaces the normal <strong>intraday-style</strong> fixed margin for that order. Carry-forward on expiry day does <strong>not</strong> use overnight margin columns for that contract — engine uses intraday-style paths only. Optional “% of notional” applies to <em>segment</em> default; script/user values stay fixed per lot/share.
                </li>
                <li>
                  <strong>Example (margin):</strong> Normal opt buy intraday margin is ₹5,000/lot; you set expiry day margin to ₹8,000/lot on NSE OPT. On expiry day only, margin blocked for a new option buy uses ₹8,000/lot instead of ₹5,000. After expiry day, the usual segment margins apply again.
                </li>
              </ul>
            </div>
          </details>

          {/* Save Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button 
              onClick={saveAllSegments}
              disabled={!hasEdits || saving}
              style={{
                padding: '8px 20px',
                background: hasEdits ? '#22c55e' : 'var(--bg-tertiary)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: hasEdits ? 'pointer' : 'default',
                fontSize: '13px',
                fontWeight: 500,
                opacity: hasEdits ? 1 : 0.5
              }}
            >
              {saving ? 'Saving...' : `Save ${Object.keys(editingData).length} Edit(s)`}
              </button>
          </div>

          {/* Segments matrix: sticky segment column + sticky two-row header; settings scroll horizontally */}
          <div
            ref={segmentMatrixScrollRef}
            className="netting-segments-matrix-scroll"
            style={{
              overflow: 'auto',
              maxHeight: 'calc(100vh - 280px)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              background: 'var(--bg-primary)'
            }}
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading segments...</div>
            ) : (
              <table
                className="admin-table netting-segments-matrix-table"
                style={{
                  width: 'max-content',
                  minWidth: '100%',
                  borderCollapse: 'separate',
                  borderSpacing: 0
                }}
              >
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      style={{
                        position: 'sticky',
                        left: 0,
                        top: 0,
                        zIndex: 6,
                        minWidth: '148px',
                        width: '148px',
                        background: 'var(--bg-tertiary)',
                        boxShadow: '4px 0 0 0 var(--border-color), 0 4px 0 0 var(--border-color)',
                        verticalAlign: 'middle',
                        textAlign: 'left',
                        padding: '10px 12px'
                      }}
                    >
                      Segment
                    </th>
                    {segmentCategoryGroups.map((g) => (
                      <th
                        key={g.id}
                        colSpan={g.count}
                        style={{
                          position: 'sticky',
                          top: 0,
                          zIndex: 4,
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-primary)',
                          fontSize: '11px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          textAlign: 'center',
                          padding: '8px 6px',
                          borderBottom: '1px solid var(--border-color)',
                          whiteSpace: 'nowrap',
                          boxShadow: '0 4px 0 0 var(--border-color)'
                        }}
                      >
                        {g.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {unifiedSegmentFields.map((field, idx) => {
                      const isFirstInCat =
                        idx === 0 ||
                        unifiedSegmentFields[idx - 1].categoryId !== field.categoryId;
                      return (
                        <th
                          key={field.key}
                          ref={(el) => {
                            if (isFirstInCat && el) {
                              segmentCategoryColRefs.current[field.categoryId] = el;
                            }
                          }}
                          title={field.tooltip || field.label}
                          style={{
                            position: 'sticky',
                            top: SEGMENT_MATRIX_HEADER_ROW1_PX,
                            zIndex: 3,
                            minWidth: '112px',
                            maxWidth: '140px',
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-secondary)',
                            fontSize: '11px',
                            fontWeight: 500,
                            padding: '8px 6px',
                            borderBottom: '1px solid var(--border-color)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            boxShadow: 'inset 0 -1px 0 var(--border-color)'
                          }}
                        >
                          {field.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {NETTING_SEGMENTS.map((segDef) => {
                    const isEdited = editingData[segDef.code] !== undefined;
                    const rowBg = isEdited ? 'rgba(59, 130, 246, 0.06)' : 'var(--bg-secondary)';
                    const stickyBg = isEdited ? 'rgba(30, 58, 138, 0.35)' : 'var(--bg-tertiary)';
                    return (
                      <tr key={segDef.code} style={{ background: rowBg }}>
                        <td
                          style={{
                            position: 'sticky',
                            left: 0,
                            zIndex: 2,
                            background: stickyBg,
                            boxShadow: '4px 0 8px rgba(0,0,0,0.35)',
                            padding: '10px 12px',
                            verticalAlign: 'middle',
                            borderBottom: '1px solid var(--border-color)'
                          }}
                        >
                          <strong style={{ color: 'var(--text-primary)' }}>{segDef.name}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{segDef.code}</div>
                        </td>
                        {unifiedSegmentFields.map((field) => (
                          <td
                            key={field.key}
                            style={{
                              verticalAlign: 'middle',
                              padding: '6px 8px',
                              borderBottom: '1px solid var(--border-color)',
                              minWidth: '112px'
                            }}
                          >
                            {renderInput(segDef.code, field, field.categoryId)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Script Settings Tab */}
      {activeTab === 'scripts' && (
        <div className="admin-card" style={{ marginTop: '20px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px' }}>Script Overrides</h3>
              <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Override segment defaults for specific symbols
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-start', justifyContent: 'flex-end', maxWidth: '960px' }}>
              <select
                value={selectedSegmentFilter}
                onChange={(e) => {
                  setSelectedSegmentFilter(e.target.value);
                  setInstrumentSuggestOpen(false);
                }}
                style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px' }}
              >
                <option value="">All Segments</option>
                {NETTING_SEGMENTS.map(seg => (
                  <option key={seg.code} value={seg.code}>{seg.name}</option>
                ))}
              </select>
              <div ref={instrumentSearchWrapRef} style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
                <input
                  type="text"
                  placeholder={
                    selectedSegmentFilter
                      ? ZERODHA_SEGMENT_LABEL[selectedSegmentFilter]
                        ? 'Search — click a result to add (or select then + Add)'
                        : selectedSegmentFilter === 'CRYPTO_PERPETUAL' || selectedSegmentFilter === 'CRYPTO_OPTIONS'
                          ? 'Search crypto — click a result to add'
                          : 'Search — click a result to add'
                      : 'Select a segment first, then search like on Market page'
                  }
                  value={scriptSymbolQuery}
                  onChange={(e) => {
                    const v = e.target.value;
                    setScriptSymbolQuery(v);
                    setInstrumentSuggestOpen(true);
                    setScriptPickedSymbol((prev) => {
                      if (prev == null) return null;
                      return v.trim().toUpperCase() === prev ? prev : null;
                    });
                  }}
                  onFocus={() => setInstrumentSuggestOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddScript();
                    }
                  }}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                />
                {instrumentSuggestOpen && selectedSegmentFilter && scriptSymbolQuery.trim() && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: '100%',
                      marginTop: 4,
                      maxHeight: 280,
                      overflowY: 'auto',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      zIndex: 50,
                      boxShadow: '0 12px 40px rgba(0,0,0,0.45)'
                    }}
                  >
                    {liveInstrumentLoading && (
                      <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>Searching instruments…</div>
                    )}
                    {!liveInstrumentLoading && liveInstrumentHits.length === 0 && (
                      <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {ZERODHA_SEGMENT_LABEL[selectedSegmentFilter] && scriptSymbolQuery.trim().length < 2
                          ? 'Type at least 2 characters for Indian instrument search.'
                          : BROKER_INSTRUMENT_CATEGORY[selectedSegmentFilter] || selectedSegmentFilter === 'CRYPTO_PERPETUAL' || selectedSegmentFilter === 'CRYPTO_OPTIONS'
                            ? 'No matches — adjust your search. You must click a result to add (typing alone is not enough).'
                            : 'No instrument search for this segment.'}
                      </div>
                    )}
                    {liveInstrumentHits.map((row) => (
              <button 
                        key={row.key}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          const s = String(row.symbol || '').trim();
                          if (!s) return;
                          const u = s.toUpperCase();
                          setScriptSymbolQuery(s);
                          setScriptPickedSymbol(u);
                          setInstrumentSuggestOpen(false);
                          void handleAddScript(s);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 14px',
                          border: 'none',
                          borderBottom: '1px solid var(--border-color)',
                          background: 'transparent',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: 13
                        }}
                      >
                        <div style={{ fontWeight: 600, color: '#38bdf8' }}>{row.symbol}</div>
                        {row.name ? <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{row.name}</div> : null}
              </button>
                    ))}
                  </div>
                )}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', paddingTop: 8, whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={scriptSearchAllSegments}
                  onChange={(e) => setScriptSearchAllSegments(e.target.checked)}
                  disabled={!scriptSymbolQuery.trim()}
                />
                Search all segments
              </label>
              <button
                type="button"
                onClick={() => handleAddScript()}
                disabled={
                  !selectedSegmentFilter ||
                  addingScript ||
                  (segmentHasLiveInstrumentSearch(selectedSegmentFilter) &&
                    (!scriptPickedSymbol ||
                      scriptSymbolQuery.trim().toUpperCase() !== scriptPickedSymbol))
                }
                title={
                  segmentHasLiveInstrumentSearch(selectedSegmentFilter) && !scriptPickedSymbol
                    ? 'Click a symbol in the search list first'
                    : undefined
                }
                style={{
                  padding: '8px 16px',
                  marginTop: 0,
                  background:
                    selectedSegmentFilter &&
                    !addingScript &&
                    (!segmentHasLiveInstrumentSearch(selectedSegmentFilter) ||
                      (scriptPickedSymbol && scriptSymbolQuery.trim().toUpperCase() === scriptPickedSymbol))
                      ? '#3b82f6'
                      : 'var(--bg-tertiary)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor:
                    selectedSegmentFilter &&
                    !addingScript &&
                    (!segmentHasLiveInstrumentSearch(selectedSegmentFilter) ||
                      (scriptPickedSymbol && scriptSymbolQuery.trim().toUpperCase() === scriptPickedSymbol))
                      ? 'pointer'
                      : 'default',
                  fontSize: '13px',
                  opacity: selectedSegmentFilter ? 1 : 0.6
                }}
              >
                {addingScript ? 'Adding…' : '+ Add Script'}
              </button>
            </div>
          </div>

          {/* Setting Category Tabs — only categories that apply to the selected segment (or to rows when &quot;All&quot;) */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            {scriptCategoriesVisible.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { setSettingCategory(cat.id); setEditingScripts({}); }}
                style={{
                  padding: '8px 16px',
                  background: settingCategory === cat.id ? '#3b82f6' : 'transparent',
                  border: settingCategory === cat.id ? 'none' : '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: settingCategory === cat.id ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {settingCategory === 'limitPoint' && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Script — points only</strong> — Absolute distance from the live price for this symbol. When set (&gt; 0), it overrides segment <em>%</em> for netting limits on that symbol. Priority: user per-symbol points → this script row → user segment-wide points → segment %.
            </p>
          )}

          {settingCategory === 'options' && activeTab === 'scripts' && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Script — ₹ from underlying</strong> — Max <strong style={{ color: 'var(--text-primary)' }}>|strike − underlying|</strong> in price units for this symbol only; overrides segment buy/sell <em>%</em> for that side when &gt; 0.
            </p>
          )}

          {settingCategory === 'fixedMargin' && activeTab === 'scripts' && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Script fixed margin</strong> — Margin mode can be overridden per script. If not set, inherits from segment. Values are interpreted according to the effective margin mode (fixed/percent/times).
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={saveAllScripts}
              disabled={!hasScriptEdits || savingScripts}
              style={{
                padding: '8px 20px',
                background: hasScriptEdits ? '#22c55e' : 'var(--bg-tertiary)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: hasScriptEdits ? 'pointer' : 'default',
                fontSize: '13px',
                fontWeight: 500,
                opacity: hasScriptEdits ? 1 : 0.5
              }}
            >
              {savingScripts ? 'Saving…' : `Save ${Object.keys(editingScripts).length} script edit(s)`}
            </button>
          </div>

          {/* Scripts Table */}
          <div style={{ overflowX: 'auto' }}>
            {scriptsLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading scripts...</div>
            ) : scripts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                <p style={{ fontSize: '40px', margin: '0 0 10px' }}>📜</p>
                {debouncedSymbolQuery ? (
                  <p>
                    No saved overrides match &quot;{debouncedSymbolQuery}&quot;.
                    {!scriptSearchAllSegments ? ' Try &quot;Search all segments&quot; or adjust the filter. ' : ' '}
                    Search instruments and <strong style={{ color: 'var(--text-primary)' }}>click a result</strong> to add (or pick a row then &quot;+ Add Script&quot;). Typed text without choosing from the list is not accepted.
                  </p>
                ) : (
                  <p>
                    Pick a segment, search, then click a symbol in the dropdown to add. The same field filters saved overrides below.
                  </p>
                )}
              </div>
            ) : (
              <table className="admin-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--bg-tertiary)', zIndex: 2 }}>Symbol</th>
                    <th>Segment</th>
                    {scriptTableFields.map(field => (
                      <th key={field.key}>{field.label}</th>
                    ))}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scripts.map(script => {
                    const segCode = script.segment;
                    const rowEdited = editingScripts[script._id] && Object.keys(editingScripts[script._id]).length > 0;
                    return (
                    <tr key={script._id} style={{ background: rowEdited ? 'rgba(59, 130, 246, 0.06)' : 'transparent' }}>
                      <td style={{ position: 'sticky', left: 0, background: rowEdited ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)', zIndex: 1 }}>
                        <strong style={{ color: '#38bdf8' }}>{script.symbol}</strong>
                      </td>
                      <td>
                        <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                          {script.segmentName || script.segment}
                        </span>
                      </td>
                      {scriptTableFields.map(field => (
                        <td key={field.key}>
                          {renderScriptInput(script, segCode, field, settingCategory)}
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          onClick={() => handleDeleteScript(script._id)}
                          style={{ padding: '4px 8px', background: '#ef4444', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '11px' }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* User Settings Tab */}
      {activeTab === 'users' && (
        <div className="admin-card" style={{ marginTop: '20px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px' }}>User Settings</h3>
              <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Override default settings for specific users
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search user..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', width: '250px', fontSize: '13px' }}
              />
            </div>
          </div>

          {/* User List */}
          {!selectedUser && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
              {usersLoading ? (
                <div style={{ color: 'var(--text-secondary)' }}>Loading users...</div>
              ) : users.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)' }}>No users found</div>
              ) : (
                users.map(user => (
                  <div
                    key={user._id}
                    onClick={() => setSelectedUser(user)}
                    style={{
                      padding: '16px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  >
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{user.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{user.email}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Client ID: {user.clientId || 'N/A'}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Selected User Settings */}
          {selectedUser && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setUserSettings([]);
                    setUserSettingsView('segments');
                    setEditingUserScriptRows({});
                    setUserScriptSymbolQuery('');
                    setUserScriptSuggestOpen(false);
                  }}
                  style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}
                >
                  ← Back
                </button>
                <div>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{selectedUser.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{selectedUser.email} • {selectedUser.clientId}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setUserSettingsView('segments');
                    setEditingUserScriptRows({});
                  }}
                  style={{
                    padding: '8px 16px',
                    background: userSettingsView === 'segments' ? '#3b82f6' : 'transparent',
                    border: userSettingsView === 'segments' ? 'none' : '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: userSettingsView === 'segments' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500
                  }}
                >
                  Segment overrides
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserSettingsView('scripts');
                    setEditingUserScriptRows({});
                  }}
                  style={{
                    padding: '8px 16px',
                    background: userSettingsView === 'scripts' ? '#3b82f6' : 'transparent',
                    border: userSettingsView === 'scripts' ? 'none' : '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: userSettingsView === 'scripts' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500
                  }}
                >
                  Script overrides (this user only)
                </button>
              </div>

              {/* Setting Category Tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                {(userSettingsView === 'segments' ? SETTING_CATEGORIES : userScriptCategoriesVisible).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSettingCategory(cat.id);
                      if (userSettingsView === 'segments') setEditingUserSettings({});
                      else setEditingUserScriptRows({});
                    }}
                    style={{
                      padding: '8px 16px',
                      background: settingCategory === cat.id ? '#3b82f6' : 'transparent',
                      border: settingCategory === cat.id ? 'none' : '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: settingCategory === cat.id ? '#fff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {settingCategory === 'limitPoint' && userSettingsView === 'segments' && (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>User segment override — %</strong> — Same rules as the segment table: overrides the default segment % for this user on the whole segment (until a per-script row sets points).
                </p>
              )}
              {settingCategory === 'limitPoint' && userSettingsView === 'scripts' && (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>User script override — points</strong> — Same as global script row: beats segment % for that user+symbol. Takes priority over the global script row for limits; user segment-wide points apply only if neither per-symbol row sets points.
                </p>
              )}
              {settingCategory === 'options' && userSettingsView === 'segments' && (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>User segment — %</strong> — Overrides default segment buy/sell strike <em>%</em> for this user on the whole options segment.
                </p>
              )}
              {settingCategory === 'options' && userSettingsView === 'scripts' && (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>User script — ₹ caps</strong> — Per-user per-symbol max |strike − underlying| in ₹; overrides segment % and global script row for that user+symbol when set.
                </p>
              )}
              {settingCategory === 'fixedMargin' && userSettingsView === 'segments' && (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>User segment margin</strong> — Margin mode can be overridden per user. If not set, inherits from script override or segment default. Values are interpreted according to the effective margin mode (fixed/percent/times).
                </p>
              )}
              {settingCategory === 'fixedMargin' && userSettingsView === 'scripts' && (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--text-primary)' }}>User script margin</strong> — Margin mode can be overridden per user per symbol. If not set, inherits from the override chain (user segment → script → segment).
                </p>
              )}

              {userSettingsView === 'segments' && (
              <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={saveUserSegmentEdits}
                  disabled={Object.keys(editingUserSettings).length === 0 || savingUserSettings}
                  style={{
                    padding: '8px 20px',
                    background: Object.keys(editingUserSettings).length > 0 ? '#22c55e' : 'var(--bg-tertiary)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    cursor: Object.keys(editingUserSettings).length > 0 ? 'pointer' : 'default',
                    fontSize: '13px',
                    fontWeight: 500,
                    opacity: Object.keys(editingUserSettings).length > 0 ? 1 : 0.5
                  }}
                >
                  {savingUserSettings ? 'Saving…' : `Save ${Object.keys(editingUserSettings).length} Edit(s)`}
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
              <table className="admin-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--bg-tertiary)', zIndex: 2, minWidth: '150px' }}>Segment</th>
                    {currentFields.map(field => (
                      <th key={field.key} style={{ minWidth: '120px' }}>{field.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {NETTING_SEGMENTS.map((segDef) => {
                    const userSetting = userSettings.find(
                      (s) =>
                        !(s.symbol != null && String(s.symbol).trim() !== '') &&
                        (s.segmentName || s.segmentCode) === segDef.code
                    );
                    const isEdited = editingUserSettings[segDef.code] !== undefined;
                    return (
                      <tr key={segDef.code} style={{ background: isEdited ? 'rgba(59, 130, 246, 0.05)' : 'transparent' }}>
                        <td style={{ position: 'sticky', left: 0, background: isEdited ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)', zIndex: 1 }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{segDef.name}</strong>
                        </td>
                        {currentFields.map((field) => (
                          <td key={field.key}>
                            {renderUserSegmentInput(segDef.code, userSetting, field, settingCategory)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              </>
              )}

              {userSettingsView === 'scripts' && (
                <div>
                  <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Per-symbol rows apply only to <strong style={{ color: 'var(--text-primary)' }}>{selectedUser.name}</strong> and override segment defaults (and global script overrides) for that symbol.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-start', marginBottom: '16px' }}>
              <select 
                      value={userScriptSegmentFilter}
                      onChange={(e) => {
                        setUserScriptSegmentFilter(e.target.value);
                        setUserScriptSuggestOpen(false);
                      }}
                      style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px' }}
                    >
                      <option value="">Select segment…</option>
                      {NETTING_SEGMENTS.map((seg) => (
                        <option key={seg.code} value={seg.code}>{seg.name}</option>
                ))}
              </select>
                    <div ref={userScriptInstrumentWrapRef} style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
                      <input
                        type="text"
                        placeholder={
                          userScriptSegmentFilter
                            ? ZERODHA_SEGMENT_LABEL[userScriptSegmentFilter]
                              ? 'Search — click a result to add (or select then + Add)'
                              : userScriptSegmentFilter === 'CRYPTO_PERPETUAL' || userScriptSegmentFilter === 'CRYPTO_OPTIONS'
                                ? 'Search crypto — click a result to add'
                                : 'Search — click a result to add'
                            : 'Choose segment, then search (filters list + add row)'
                        }
                        value={userScriptSymbolQuery}
                        onChange={(e) => {
                          const v = e.target.value;
                          setUserScriptSymbolQuery(v);
                          setUserScriptSuggestOpen(true);
                          setUserScriptPickedSymbol((prev) => {
                            if (prev == null) return null;
                            return v.trim().toUpperCase() === prev ? prev : null;
                          });
                        }}
                        onFocus={() => setUserScriptSuggestOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddUserScript();
                          }
                        }}
                        style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                      />
                      {userScriptSuggestOpen && userScriptSegmentFilter && userScriptSymbolQuery.trim() && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: '100%',
                            marginTop: 4,
                            maxHeight: 280,
                            overflowY: 'auto',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 8,
                            zIndex: 50,
                            boxShadow: '0 12px 40px rgba(0,0,0,0.45)'
                          }}
                        >
                          {userScriptInstrumentLoading && (
                            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>Searching instruments…</div>
                          )}
                          {!userScriptInstrumentLoading && userScriptInstrumentHits.length === 0 && (
                            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                              {ZERODHA_SEGMENT_LABEL[userScriptSegmentFilter] && userScriptSymbolQuery.trim().length < 2
                                ? 'Type at least 2 characters for Indian instrument search.'
                                : 'No matches — adjust search. Click a result to add (typed text alone is not enough).'}
            </div>
                          )}
                          {!userScriptInstrumentLoading &&
                            userScriptInstrumentHits.map((h) => (
                              <button
                                key={h.key}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  const s = String(h.symbol || '').trim();
                                  if (!s) return;
                                  const u = s.toUpperCase();
                                  setUserScriptSymbolQuery(s);
                                  setUserScriptPickedSymbol(u);
                                  setUserScriptSuggestOpen(false);
                                  void handleAddUserScript(s);
                                }}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '10px 14px',
                                  border: 'none',
                                  borderBottom: '1px solid var(--border-color)',
                                  background: 'transparent',
                                  color: 'var(--text-primary)',
                                  fontSize: 13,
                                  cursor: 'pointer'
                                }}
                              >
                                <div style={{ fontWeight: 600 }}>{h.symbol}</div>
                                {h.name && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{h.name}</div>}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={userScriptSearchAllSegments}
                        onChange={(e) => setUserScriptSearchAllSegments(e.target.checked)}
                        disabled={!userScriptSymbolQuery.trim()}
                      />
                      Search all segments
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAddUserScript()}
                      disabled={
                        addingUserScript ||
                        !userScriptSegmentFilter ||
                        !selectedUser?._id ||
                        (segmentHasLiveInstrumentSearch(userScriptSegmentFilter) &&
                          (!userScriptPickedSymbol ||
                            userScriptSymbolQuery.trim().toUpperCase() !== userScriptPickedSymbol))
                      }
                      title={
                        segmentHasLiveInstrumentSearch(userScriptSegmentFilter) && !userScriptPickedSymbol
                          ? 'Click a symbol in the search list first'
                          : undefined
                      }
                      style={{
                        padding: '8px 16px',
                        background:
                          !addingUserScript &&
                          userScriptSegmentFilter &&
                          selectedUser?._id &&
                          (!segmentHasLiveInstrumentSearch(userScriptSegmentFilter) ||
                            (userScriptPickedSymbol &&
                              userScriptSymbolQuery.trim().toUpperCase() === userScriptPickedSymbol))
                            ? '#22c55e'
                            : 'var(--bg-tertiary)',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        cursor:
                          !addingUserScript &&
                          userScriptSegmentFilter &&
                          selectedUser?._id &&
                          (!segmentHasLiveInstrumentSearch(userScriptSegmentFilter) ||
                            (userScriptPickedSymbol &&
                              userScriptSymbolQuery.trim().toUpperCase() === userScriptPickedSymbol))
                            ? 'pointer'
                            : 'default',
                        fontSize: '13px',
                        fontWeight: 500
                      }}
                    >
                      {addingUserScript ? 'Adding…' : '+ Add for this user'}
                    </button>
          </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                    <button
                      type="button"
                      onClick={saveUserScriptEdits}
                      disabled={Object.keys(editingUserScriptRows).length === 0 || savingUserScriptRows}
                      style={{
                        padding: '8px 20px',
                        background: Object.keys(editingUserScriptRows).length > 0 ? '#22c55e' : 'var(--bg-tertiary)',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        cursor: Object.keys(editingUserScriptRows).length > 0 ? 'pointer' : 'default',
                        fontSize: '13px',
                        fontWeight: 500,
                        opacity: Object.keys(editingUserScriptRows).length > 0 ? 1 : 0.5
                      }}
                    >
                      {savingUserScriptRows ? 'Saving…' : `Save ${Object.keys(editingUserScriptRows).length} edit(s)`}
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    {filteredUserScriptRows.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                        {userScriptRowsAll.length === 0
                          ? 'No per-user script overrides yet. Pick segment, search symbol, then "+ Add for this user".'
                          : 'No rows match the current filter. Try "Search all segments" or clear the symbol filter.'}
                      </div>
                    ) : (
                      <table className="admin-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                            <th style={{ position: 'sticky', left: 0, background: 'var(--bg-tertiary)', zIndex: 2 }}>Symbol</th>
                    <th>Segment</th>
                            {currentFields.map((field) => (
                              <th key={field.key}>{field.label}</th>
                            ))}
                            <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                          {filteredUserScriptRows.map((row) => {
                            const segCode = row.segmentName || row.segmentId?.name;
                            const segLabel = NETTING_SEGMENTS.find((s) => s.code === segCode)?.name || segCode || '—';
                            const rowEdited = editingUserScriptRows[row._id] && Object.keys(editingUserScriptRows[row._id]).length > 0;
                            return (
                              <tr key={row._id} style={{ background: rowEdited ? 'rgba(59, 130, 246, 0.06)' : 'transparent' }}>
                                <td style={{ position: 'sticky', left: 0, background: rowEdited ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)', zIndex: 1 }}>
                                  <strong style={{ color: '#38bdf8' }}>{row.symbol}</strong>
                                </td>
                                <td>
                                  <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                                    {segLabel}
                                  </span>
                                </td>
                                {currentFields.map((field) => (
                                  <td key={field.key}>
                                    {renderUserScriptInput(row, segCode, field, settingCategory)}
                                  </td>
                                ))}
                                <td>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUserScript(row._id)}
                                    style={{ padding: '4px 8px', background: '#ef4444', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '11px' }}
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                </tbody>
              </table>
            )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Copy Settings Tab */}
      {activeTab === 'copy' && (
        <div className="admin-card" style={{ marginTop: '20px', padding: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px' }}>Copy Settings</h3>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Copy netting segment settings from one user to multiple users
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
            {/* Source User */}
            <div>
              <h4 style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>Source User</h4>
              <input
                type="text"
                placeholder="Search source user..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', marginBottom: '12px', fontSize: '13px' }}
              />
              
              {copySourceUser ? (
                <div style={{ padding: '16px', background: 'var(--bg-secondary)', border: '2px solid #22c55e', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{copySourceUser.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{copySourceUser.email}</div>
                  <button
                    onClick={() => setCopySourceUser(null)}
                    style={{ marginTop: '8px', padding: '4px 12px', background: '#ef4444', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '11px' }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  {users.map(user => (
                    <div
                      key={user._id}
                      onClick={() => setCopySourceUser(user)}
                      style={{
                        padding: '12px',
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '13px' }}>{user.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user.email}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Target Users */}
            <div>
              <h4 style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
                Target Users ({copyTargetUsers.length} selected)
              </h4>

              <input
                type="text"
                placeholder="Search target user..."
                value={targetUserSearch}
                onChange={(e) => setTargetUserSearch(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', marginBottom: '12px', fontSize: '13px' }}
              />

              {copyTargetUsers.length > 0 && (
                <div style={{ marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {copyTargetUsers.map(user => (
                    <span
                      key={user._id}
                      style={{
                        padding: '4px 10px',
                        background: 'rgba(59, 130, 246, 0.2)',
                        borderRadius: '20px',
                        fontSize: '12px',
                        color: '#3b82f6',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {user.name}
                      <button
                        onClick={() => setCopyTargetUsers(prev => prev.filter(u => u._id !== user._id))}
                        style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '14px' }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                {users
                  .filter(u => {
                    if (u._id === copySourceUser?._id) return false;
                    if (copyTargetUsers.some(t => t._id === u._id)) return false;
                    if (targetUserSearch.trim()) {
                      const q = targetUserSearch.toLowerCase();
                      return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.oderId?.toLowerCase().includes(q);
                    }
                    return true;
                  })
                  .map(user => (
                    <div
                      key={user._id}
                      onClick={() => setCopyTargetUsers(prev => [...prev, user])}
                      style={{
                        padding: '12px',
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '13px' }}>{user.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user.email}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Copy Button */}
          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={handleCopySettings}
              disabled={!copySourceUser || copyTargetUsers.length === 0 || copying}
              style={{
                padding: '12px 32px',
                background: copySourceUser && copyTargetUsers.length > 0 ? '#22c55e' : 'var(--bg-tertiary)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: copySourceUser && copyTargetUsers.length > 0 ? 'pointer' : 'default',
                fontSize: '14px',
                fontWeight: 500,
                opacity: copySourceUser && copyTargetUsers.length > 0 ? 1 : 0.5
              }}
            >
              {copying ? 'Copying...' : `Copy Settings to ${copyTargetUsers.length} User(s)`}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div className={`admin-toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default NettingSegmentSettings;
