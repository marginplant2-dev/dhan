import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { LuX, LuRepeat, LuChartColumn, LuTimer, LuStar } from 'react-icons/lu';
import { getOneClickTradeButtonStyle, isOneClickSymbolBusy } from '../../../hooks/useMetaApiPrices';
import TVChartContainer from '../../../components/TVChart/TVChartContainer';
import InstrumentPickerModal from './InstrumentPickerModal';
import PositionsSidePanel from '../../../components/PositionsSidePanel';
import tradingSounds from '../../../utils/sounds';
import { isIndianCashEquitySegmentCode } from '../../../constants/indianSegmentLabels';
import {
  NETTING_SEGMENT_CODE_TO_CATEGORY,
  WATCHLIST_CATEGORY_TO_SEGMENT_CODE
} from '../../../constants/nettingSegmentUi';
import { netProfitInrIndianNettingClose } from '../../../utils/indianNettingTradeDisplay';

/** Broker "Search All Instruments" modal tab → netting segment (admin isActive hides tab + list) */
const BROKER_SEARCH_TAB_TO_NETTING_CODE = {
  forex: 'FOREX',
  stocks: 'STOCKS',
  indices: 'INDICES',
  com: 'COMMODITIES',
  indian_nse_eq: 'NSE_EQ',
  indian_nse_fut: 'NSE_FUT',
  indian_nse_opt: 'NSE_OPT',
  indian_bse_eq: 'BSE_EQ',
  indian_bse_fut: 'BSE_FUT',
  indian_bse_opt: 'BSE_OPT',
  indian_mcx_fut: 'MCX_FUT',
  indian_mcx_opt: 'MCX_OPT',
  delta_perpetual: 'CRYPTO_PERPETUAL',
  delta_call_options: 'CRYPTO_OPTIONS',
  delta_put_options: 'CRYPTO_OPTIONS'
};

const BROKER_MODAL_INTL_TABS = ['all', 'forex', 'stocks', 'indices', 'com'];
const BROKER_MODAL_INDIAN_TABS = [
  'indian_nse_eq',
  'indian_nse_fut',
  'indian_nse_opt',
  'indian_bse_eq',
  'indian_bse_fut',
  'indian_bse_opt',
  'indian_mcx_fut',
  'indian_mcx_opt'
];
const BROKER_MODAL_DELTA_TABS = ['delta_perpetual', 'delta_call_options', 'delta_put_options'];
const INTL_NETTING_CODES = ['FOREX', 'STOCKS', 'CRYPTO', 'INDICES', 'COMMODITIES'];

const ORDER_BOOK_HISTORY_PAGE_SIZE = 50;

function metaInstrumentCategoryToNettingCode(category) {
  if (!category) return null;
  const c = String(category).toLowerCase();
  if (c === 'forex' || c === 'forex_yen') return 'FOREX';
  if (c === 'stocks') return 'STOCKS';
  if (c === 'indices') return 'INDICES';
  if (c === 'metals' || c === 'energy') return 'COMMODITIES';
  return null;
}

/** Netting limit orders only: points override, else % of market, else legacy segment points — matches NettingEngine (limit/pending). */
function getNettingLimitAwayOffset(marketPrice, settings) {
  if (!settings || !Number.isFinite(marketPrice) || marketPrice <= 0) return null;
  const pts = settings.limitAwayPoints;
  const pct = settings.limitAwayPercent;
  if (pts != null && Number(pts) > 0) {
    return { away: Number(pts), detail: `${Number(pts)} pts` };
  }
  if (pct != null && Number(pct) > 0) {
    const away = marketPrice * (Number(pct) / 100);
    return { away, detail: `${Number(pct)}% (≈${away.toFixed(2)})` };
  }
  return null;
}

/** Stop / SL-M: points or % of market — same rules as limit orders. */
function getNettingStopSlmAwayOffset(marketPrice, settings) {
  if (!settings || !Number.isFinite(marketPrice) || marketPrice <= 0) return null;
  const pts = settings.limitAwayPoints;
  const pct = settings.limitAwayPercent;
  if (pts != null && Number(pts) > 0) {
    return { away: Number(pts), detail: `${Number(pts)} pts` };
  }
  if (pct != null && Number(pct) > 0) {
    const away = marketPrice * (Number(pct) / 100);
    return { away, detail: `${Number(pct)}% (≈${away.toFixed(2)})` };
  }
  return null;
}

// Zerodha stores option roots and the underlying-index under different `name` fields
// (e.g. NIFTY options have name="NIFTY", but the index is name="NIFTY 50"). The strike
// validator must look up the index ticker, not the bare root, otherwise the partial-match
// in getTickBySymbolAuto can return another option's premium as if it were the spot.
const OPTION_ROOT_TO_INDEX_TICKER = {
  NIFTY: 'NIFTY 50',
  BANKNIFTY: 'NIFTY BANK',
  FINNIFTY: 'NIFTY FIN SERVICE',
  MIDCPNIFTY: 'NIFTY MID SELECT',
  SENSEX: 'SENSEX',
  BANKEX: 'BANKEX',
  SENSEX50: 'SNSX50'
};

// Build NSE/BSE futures-symbol candidates for the current 3 months in IST.
// e.g. for root=NIFTY in April 2026 → ['NIFTY26APRFUT', 'NIFTY26MAYFUT', 'NIFTY26JUNFUT'].
function buildCurrentFutureCandidates(root) {
  if (!root) return [];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const istMs = Date.now() + (5 * 60 + 30) * 60 * 1000;
  const ist = new Date(istMs);
  const m = ist.getUTCMonth();
  const y = ist.getUTCFullYear();
  const out = [];
  for (let i = 0; i < 3; i++) {
    const mi = (m + i) % 12;
    const yyi = String((y + (m + i >= 12 ? 1 : 0)) % 100).padStart(2, '0');
    out.push(`${root}${yyi}${months[mi]}FUT`);
  }
  return out;
}

/**
 * Resolve the LTP of the underlying for an Indian option contract. Tries (in order):
 *   1. The mapped index ticker (e.g. NIFTY → "NIFTY 50")
 *   2. Current-month and next-month futures (e.g. NIFTY26APRFUT)
 *   3. The bare root (only useful when an EQ ticker exists with that exact symbol)
 * Returns 0 if nothing is subscribed — caller should clearly tell the user to add the
 * underlying to the watchlist instead of computing a band against junk data.
 */
function resolveIndianUnderlyingLtp(undRoot, getTickBySymbolAuto, livePrices) {
  if (!undRoot) return 0;
  const root = String(undRoot).toUpperCase();
  const candidates = [];
  const indexTicker = OPTION_ROOT_TO_INDEX_TICKER[root];
  if (indexTicker) candidates.push(indexTicker);
  candidates.push(...buildCurrentFutureCandidates(root));
  candidates.push(root); // last-resort: bare root for EQ tickers (SBIN options → SBIN equity)

  if (typeof getTickBySymbolAuto === 'function') {
    for (const c of candidates) {
      const t = getTickBySymbolAuto(c);
      const lp = t?.lastPrice || t?.last_price || 0;
      if (lp > 0) return lp;
    }
  }
  if (livePrices) {
    for (const c of candidates) {
      const lp = livePrices[c]?.bid || livePrices[c]?.lastPrice || 0;
      if (lp > 0) return lp;
    }
  }
  return 0;
}

/** Netting options: max |strike − underlying| — script/user points win, else segment % of underlying (matches NettingEngine). */
function getOptionsStrikeMaxDistance(underlying, settings, orderSide) {
  if (!settings || !Number.isFinite(underlying) || underlying <= 0) return null;
  if (orderSide === 'buy') {
    const pts = settings.buyingStrikeFar;
    const pct = settings.buyingStrikeFarPercent;
    if (pts != null && Number(pts) > 0) {
      return { max: Number(pts), detail: `${Number(pts)} (price units from underlying)` };
    }
    if (pct != null && Number(pct) > 0) {
      const max = underlying * (Number(pct) / 100);
      return { max, detail: `${Number(pct)}% of underlying (≈${max.toFixed(2)})` };
    }
  } else {
    const pts = settings.sellingStrikeFar;
    const pct = settings.sellingStrikeFarPercent;
    if (pts != null && Number(pts) > 0) {
      return { max: Number(pts), detail: `${Number(pts)} (price units from underlying)` };
    }
    if (pct != null && Number(pct) > 0) {
      const max = underlying * (Number(pct) / 100);
      return { max, detail: `${Number(pct)}% of underlying (≈${max.toFixed(2)})` };
    }
  }
  return null;
}

function MarketPage() {
  const {
    user,
    API_URL,
    isDark,
    livePrices,
    isMetaApiConnected,
    zerodhaTicks,
    isZerodhaConnected,
    getTickByToken,
    getTickBySymbolAuto,
    zerodhaRefreshStatus,
    instrumentsByCategory,
    visibleInstrumentsByCategory: visibleInstrumentsByCategoryFromLayout,
    nettingSegmentBlockByCode,
    allInstruments,
    addInstrumentToCategory,
    selectedSymbol,
    setSelectedSymbol,
    chartTabs,
    setChartTabs,
    addChartTab,
    removeChartTab,
    tradingMode,
    setTradingMode,
    allowedTradeModes,
    hedgingSettings,
    binarySettings,
    isIndianMarketSymbol,
    watchlist,
    setWatchlist,
    isInWatchlist,
    toggleWatchlist,
    addToWatchlist,
    // Broker instruments (MT5-style search)
    brokerInstruments,
    brokerSearchResults,
    brokerInstrumentsLoading,
    brokerCategories,
    brokerCategoryNames,
    searchBrokerInstruments,
    getBrokerByCategory,
    getBrokerInstrument,
    positions,
    pendingOrders,
    tradeHistory,
    cancelledOrders,
    walletData,
    usdInrRate,
    usdMarkup,
    displayCurrency,
    handleCurrencyChange,
    allowedCurrencyDisplay,
    formatPrice,
    fetchPositions,
    showNotification,
    mobileMarketTab,
    setMobileMarketTab,
    mobileShowChartBelow,
    setMobileShowChartBelow,
    // Trading state
    orderSide,
    setOrderSide,
    orderType,
    setOrderType,
    volume,
    setVolume,
    challengeMinLot,
    challengeMaxLot,
    challengeAllowFractional,
    marginPercent: leverage,
    setMarginPercent: setLeverage,
    limitPrice,
    setLimitPrice,
    stopPrice,
    setStopPrice,
    stopLoss,
    setStopLoss,
    takeProfit,
    setTakeProfit,
    slPips,
    setSlPips,
    tpPips,
    setTpPips,
    orderSession,
    setOrderSession,
    binaryDirection,
    setBinaryDirection,
    binaryAmount,
    setBinaryAmount,
    binaryExpiry,
    setBinaryExpiry,
    // UI state
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    filterTab,
    setFilterTab,
    instrumentsPanelCollapsed,
    setInstrumentsPanelCollapsed,
    expandedSegments,
    toggleSegment,
    oneClickMode,
    setOneClickMode,
    oneClickLotSize,
    setOneClickLotSize,
    // Position management
    handleClosePosition,
    handleModifyPosition,
    handleCancelPendingOrder,
    openEditModal,
    openCloseModal,
    handleExecuteOrder,
    oneClickPending,
    getInstrumentWithLivePrice,
    showEditModal,
    setShowEditModal,
    showCloseModal,
    setShowCloseModal,
    selectedPosition,
    editSL,
    setEditSL,
    editTP,
    setEditTP,
    editPrice,
    setEditPrice,
    closeVolume,
    setCloseVolume,
    getTVSymbol,
    removeInstrumentFromCategory,
    activeChallengeAccountId: activeChallengeAccountIdFromContext
  } = useOutletContext();

  const navigate = useNavigate();

  // Positions / pending / history in the market terminal are always scoped
  // to the ACTIVE challenge. Trades from other challenges remain visible in
  // the Orders page (which shows everything), but the terminal should only
  // reflect the challenge the user is currently trading on.
  const scopedPositions = useMemo(() => {
    const cid = activeChallengeAccountIdFromContext;
    if (!cid) return [];
    return (positions || []).filter(p =>
      p.accountContext === 'challenge' &&
      String(p.challengeAccountId || '') === String(cid)
    );
  }, [positions, activeChallengeAccountIdFromContext]);

  const scopedPendingOrders = useMemo(() => {
    const cid = activeChallengeAccountIdFromContext;
    if (!cid) return [];
    return (pendingOrders || []).filter(p =>
      p.accountContext === 'challenge' &&
      String(p.challengeAccountId || '') === String(cid)
    );
  }, [pendingOrders, activeChallengeAccountIdFromContext]);

  const scopedTradeHistory = useMemo(() => {
    const cid = activeChallengeAccountIdFromContext;
    if (!cid) return [];
    return (tradeHistory || []).filter(t =>
      t.accountContext === 'challenge' &&
      String(t.challengeAccountId || '') === String(cid)
    );
  }, [tradeHistory, activeChallengeAccountIdFromContext]);

  const scopedCancelledOrders = useMemo(() => {
    const cid = activeChallengeAccountIdFromContext;
    if (!cid) return [];
    return (cancelledOrders || []).filter(o =>
      o.accountContext === 'challenge' &&
      String(o.challengeAccountId || '') === String(cid)
    );
  }, [cancelledOrders, activeChallengeAccountIdFromContext]);

  const visibleInstrumentsByCategory = visibleInstrumentsByCategoryFromLayout ?? instrumentsByCategory;

  const getSegmentViewOnlyLabel = useCallback(
    (categoryLabel) => {
      const code = WATCHLIST_CATEGORY_TO_SEGMENT_CODE[categoryLabel];
      if (!code || nettingSegmentBlockByCode == null) return null;
      const b = nettingSegmentBlockByCode[code];
      if (!b) return null;
      if (b.isActive === false) return 'Inactive';
      if (b.tradingEnabled === false) return 'Inactive';
      return null;
    },
    [nettingSegmentBlockByCode]
  );

  const brokerSearchModalVisibility = useMemo(() => {
    const block = nettingSegmentBlockByCode;
    const nettingSegActive = (code) => {
      if (!code || block == null) return true;
      const b = block[code];
      if (!b) return true;
      return b.isActive !== false;
    };
    const brokerTabVisible = (tabKey) => {
      if (tabKey === 'all') {
        return INTL_NETTING_CODES.some(nettingSegActive);
      }
      const code = BROKER_SEARCH_TAB_TO_NETTING_CODE[tabKey];
      if (!code) return true;
      return nettingSegActive(code);
    };
    const firstVisibleBrokerTab = () => {
      const order = [...BROKER_MODAL_INTL_TABS, ...BROKER_MODAL_INDIAN_TABS, ...BROKER_MODAL_DELTA_TABS];
      for (const t of order) {
        if (brokerTabVisible(t)) return t;
      }
      return 'all';
    };
    const filterInternationalInstrumentList = (list) => {
      if (!list || block == null) return list;
      return list.filter((inst) => nettingSegActive(metaInstrumentCategoryToNettingCode(inst.category)));
    };
    return { brokerTabVisible, firstVisibleBrokerTab, filterInternationalInstrumentList };
  }, [nettingSegmentBlockByCode]);

  const brokerModalShowInternational = useMemo(
    () => BROKER_MODAL_INTL_TABS.some((t) => brokerSearchModalVisibility.brokerTabVisible(t)),
    [brokerSearchModalVisibility]
  );
  const brokerModalShowIndian = useMemo(
    () => BROKER_MODAL_INDIAN_TABS.some((t) => brokerSearchModalVisibility.brokerTabVisible(t)),
    [brokerSearchModalVisibility]
  );
  const brokerModalShowDelta = useMemo(
    () => BROKER_MODAL_DELTA_TABS.some((t) => brokerSearchModalVisibility.brokerTabVisible(t)),
    [brokerSearchModalVisibility]
  );

  const chartContainerRef = useRef(null);
  
  // Timer state for binary trades countdown
  

  // Resizable order book panel — Fix 15 / 15a / 15b.
  // Standard click-hold-drag pattern (Fix 15b): mousedown on the handle
  // enters resize mode, mouse follows, mouseup anywhere drops the panel.
  // A transparent full-viewport overlay sits ABOVE the TradingView iframe
  // (z-index 99999) so the cursor moving over the chart doesn't break
  // tracking. Updates are RAF-throttled to 60fps.
  const [orderBookHeight, setOrderBookHeight] = useState(250);
  const [isResizingOrderBook, setIsResizingOrderBook] = useState(false);
  const orderBookResizeRafRef = useRef(null);

  // Compute height from a clientY value, clamped to min/max bounds.
  // Pulled out so the overlay handlers can call it directly.
  const computeOrderBookHeightFromY = useCallback((clientY) => {
    const statusBarH = 32;
    const minH = 120;
    const maxH = Math.max(minH, window.innerHeight - 200);
    return Math.max(minH, Math.min(maxH, window.innerHeight - clientY - statusBarH));
  }, []);

  // Safety net: if the user releases the mouse OUTSIDE the browser window,
  // the overlay's onMouseUp never fires and we'd be stuck in resize mode.
  // Window blur catches that edge case.
  useEffect(() => {
    if (!isResizingOrderBook) {
      if (orderBookResizeRafRef.current != null) {
        cancelAnimationFrame(orderBookResizeRafRef.current);
        orderBookResizeRafRef.current = null;
      }
      return;
    }
    const releaseOnBlur = () => setIsResizingOrderBook(false);
    window.addEventListener('blur', releaseOnBlur);
    return () => window.removeEventListener('blur', releaseOnBlur);
  }, [isResizingOrderBook]);

  // Active Positions drilldown (Phase 1) — netting only.
  // expandedPositionId: which parent NettingPosition's row is expanded
  // legsByPosition[oderId]: array of open Trade legs for that parent
  const [expandedPositionId, setExpandedPositionId] = useState(null);
  const [legsByPosition, setLegsByPosition] = useState({});
  const [legsLoadingFor, setLegsLoadingFor] = useState(null);

  // History group expansion (Fix 18). When the user clicks the chevron on
  // a parent History row, we fetch the children for that group and cache
  // them by groupId so re-expand is instant. childrenByGroup[null] is never
  // populated — atomic rows have no groupId and don't render a chevron.
  const [expandedHistoryGroupId, setExpandedHistoryGroupId] = useState(null);
  const [historyChildrenByGroup, setHistoryChildrenByGroup] = useState({});
  const [historyChildrenLoadingFor, setHistoryChildrenLoadingFor] = useState(null);

  const fetchHistoryGroupChildren = useCallback(
    async (groupId) => {
      const uid = user?.oderId || user?.id;
      if (!uid || !groupId) return;
      try {
        setHistoryChildrenLoadingFor(groupId);
        const res = await fetch(`${API_URL}/api/trades/group/${uid}/${encodeURIComponent(groupId)}`);
        const data = await res.json();
        setHistoryChildrenByGroup((prev) => ({ ...prev, [groupId]: data?.children || [] }));
      } catch (err) {
        console.error('[MarketPage] fetchHistoryGroupChildren error:', err);
        setHistoryChildrenByGroup((prev) => ({ ...prev, [groupId]: [] }));
      } finally {
        setHistoryChildrenLoadingFor(null);
      }
    },
    [API_URL, user]
  );

  const toggleExpandHistoryRow = useCallback(
    (groupId) => {
      if (!groupId) return;
      setExpandedHistoryGroupId((prev) => {
        const next = prev === groupId ? null : groupId;
        if (next && !historyChildrenByGroup[groupId]) {
          fetchHistoryGroupChildren(groupId);
        }
        return next;
      });
    },
    [historyChildrenByGroup, fetchHistoryGroupChildren]
  );

  const fetchLegsForPosition = useCallback(
    async (positionOderId) => {
      const uid = user?.oderId || user?.id;
      if (!uid || !positionOderId) return;
      try {
        setLegsLoadingFor(positionOderId);
        const res = await fetch(`${API_URL}/api/trades/legs/${uid}/${positionOderId}`);
        const data = await res.json();
        // Only open legs are "active positions" — closed/consumed/partial_close legs
        // belong in History, not the Active Positions panel.
        const openLegs = (data?.legs || []).filter((l) => l.type === 'open');
        setLegsByPosition((prev) => ({ ...prev, [positionOderId]: openLegs }));
      } catch (err) {
        console.error('[MarketPage] fetchLegsForPosition error:', err);
        setLegsByPosition((prev) => ({ ...prev, [positionOderId]: [] }));
      } finally {
        setLegsLoadingFor(null);
      }
    },
    [API_URL, user]
  );

  const toggleExpandPosition = useCallback(
    (pos) => {
      if (!pos || pos.mode !== 'netting') return;
      const id = pos.oderId || pos._id;
      setExpandedPositionId((prev) => {
        const next = prev === id ? null : id;
        if (next && !legsByPosition[id]) {
          fetchLegsForPosition(id);
        }
        return next;
      });
    },
    [legsByPosition, fetchLegsForPosition]
  );

  // Refetch legs for whichever position is expanded whenever the underlying
  // positions array changes (covers same-side adds + opposite-side reductions).
  useEffect(() => {
    if (expandedPositionId) {
      fetchLegsForPosition(expandedPositionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, expandedPositionId]);

  // When the parent position modify modal opens (controlled from UserLayout
  // via showEditModal/selectedPosition), warm up the segment-settings cache
  // for the position's symbol so the SL/TP hint can show the full band on
  // first render. No-op if it's already the order-panel symbol.
  useEffect(() => {
    if (showEditModal && selectedPosition?.symbol && selectedPosition.symbol !== selectedSymbol) {
      fetchSegSettingsForSymbol(selectedPosition.symbol, {
        exchange: selectedPosition.exchange,
        segment: selectedPosition.segment,
        instrumentType: selectedPosition.instrumentType
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEditModal, selectedPosition]);

  // Per-leg SL/TP edit modal (Phase 2 / Batch 2)
  const [legEditModalOpen, setLegEditModalOpen] = useState(false);
  const [mobileOrderSheetOpen, setMobileOrderSheetOpen] = useState(false);
  const [legBeingEdited, setLegBeingEdited] = useState(null);
  const [legEditSL, setLegEditSL] = useState('');
  const [legEditTP, setLegEditTP] = useState('');
  // Instrument picker modal state — opens from the chart tabs "+" button.
  // Shows an option chain (CE | STRIKE | PE), equity/commodity lists, and
  // a global search; picking an instrument calls addChartTab(symbol).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [legEditParentPos, setLegEditParentPos] = useState(null);

  // Per-leg close confirm modal (Fix 19b). Replaces the ugly window.confirm
  // dialog with a styled modal that mirrors the parent close-modal-pro look.
  // Single "Close Leg" action — no partial slider, no Close All (those don't
  // make sense for a single fill — partial-of-a-fill would just create a
  // smaller leg, and Close All means "close all positions" which is a
  // different concept than "close all legs").
  const [legCloseConfirmOpen, setLegCloseConfirmOpen] = useState(false);
  const [legCloseConfirmLeg, setLegCloseConfirmLeg] = useState(null);
  const [legCloseConfirmParent, setLegCloseConfirmParent] = useState(null);
  const [legCloseConfirmPrice, setLegCloseConfirmPrice] = useState(0);
  const [legCloseConfirmBusy, setLegCloseConfirmBusy] = useState(false);

  // Cache of segment settings keyed by symbol — Fix 14d. Lets the SL/TP modal
  // hints show the full limit-away band even when the modal is for a position
  // whose symbol differs from the order panel's `selectedSymbol`. Populated
  // on-demand by `fetchSegSettingsForSymbol` (called from modal-open handlers).
  // Keys are uppercased symbols. Value `null` is a sentinel meaning "fetched
  // but no segment matched", which prevents repeated retries.
  const [segSettingsBySymbol, setSegSettingsBySymbol] = useState({});

  const fetchSegSettingsForSymbol = useCallback(
    async (symbol, hints = {}) => {
      const uid = user?.oderId || user?.id;
      if (!uid || !symbol) return;
      const key = String(symbol).toUpperCase();
      // Already cached (success OR sentinel null) — skip the round trip.
      if (Object.prototype.hasOwnProperty.call(segSettingsBySymbol, key)) return;
      try {
        const params = new URLSearchParams({ userId: String(uid) });
        if (hints.exchange) params.set('exchange', String(hints.exchange));
        if (hints.segment) params.set('segment', String(hints.segment));
        if (hints.instrumentType) params.set('instrumentType', String(hints.instrumentType));
        const res = await fetch(`${API_URL}/api/user/segment-settings/by-symbol/${encodeURIComponent(key)}?${params}`);
        const data = await res.json();
        const settings = data?.success ? (data.settings || null) : null;
        setSegSettingsBySymbol((prev) => ({ ...prev, [key]: settings }));
      } catch (err) {
        // Network/server error — cache as null so the modal degrades to
        // direction-only and we don't retry on every render.
        setSegSettingsBySymbol((prev) => ({ ...prev, [key]: null }));
      }
    },
    [API_URL, user, segSettingsBySymbol]
  );

  // Resolve segment settings for an arbitrary position/leg symbol. Tries:
  //   1. The in-scope `segmentSettings` if the symbol matches `selectedSymbol`
  //      (free — already loaded by the order panel).
  //   2. The on-demand cache populated by `fetchSegSettingsForSymbol`.
  //   3. null → modal hint degrades to direction-only.
  //
  // NOTE: this is intentionally a plain function (not useCallback) because
  // `segmentSettings` is declared further down via useState (line ~805). A
  // useCallback dependency array referencing `segmentSettings` would evaluate
  // at definition time and trigger a temporal-dead-zone ReferenceError. A
  // plain function only resolves the closure reference when CALLED — and the
  // call sites are inside JSX modals that render after all hooks have run.
  // Recreating this fn each render is essentially free given the call rate.
  const resolveSegForSymbol = (symbol) => {
    if (!symbol) return null;
    if (symbol === selectedSymbol && segmentSettings) return segmentSettings;
    const key = String(symbol).toUpperCase();
    return Object.prototype.hasOwnProperty.call(segSettingsBySymbol, key)
      ? segSettingsBySymbol[key]
      : null;
  };

  const openLegEditModal = useCallback((leg, parentPos) => {
    setLegBeingEdited(leg);
    setLegEditParentPos(parentPos);
    setLegEditSL(leg?.stopLoss != null ? String(leg.stopLoss) : '');
    setLegEditTP(leg?.takeProfit != null ? String(leg.takeProfit) : '');
    setLegEditModalOpen(true);
    // Kick off a fetch for this leg's segment settings if it's not the
    // currently-selected order-panel symbol. The hint helper will pick up
    // the cached value on the next render. Pass exchange/segment hints from
    // the parent position so Indian futures/options resolve correctly.
    if (leg?.symbol && leg.symbol !== selectedSymbol) {
      fetchSegSettingsForSymbol(leg.symbol, {
        exchange: parentPos?.exchange || leg?.exchange,
        segment: parentPos?.segment || leg?.segment,
        instrumentType: parentPos?.instrumentType || leg?.instrumentType
      });
    }
  }, [selectedSymbol, fetchSegSettingsForSymbol]);

  const closeLegEditModal = useCallback(() => {
    setLegEditModalOpen(false);
    setLegBeingEdited(null);
    setLegEditParentPos(null);
    setLegEditSL('');
    setLegEditTP('');
  }, []);

  const saveLegSLTP = useCallback(async () => {
    const uid = user?.oderId || user?.id;
    if (!uid || !legBeingEdited) return;
    const payload = {
      userId: uid,
      stopLoss: legEditSL === '' ? null : Number(legEditSL),
      takeProfit: legEditTP === '' ? null : Number(legEditTP)
    };
    try {
      const res = await fetch(`${API_URL}/api/trades/legs/${legBeingEdited.tradeId || legBeingEdited._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        showNotification(`${data.error || res.statusText}`, 'error', 7000, 'SL/TP update failed');
        return;
      }
      // Refetch legs for the parent position
      const parentId = legEditParentPos?.oderId || legEditParentPos?._id;
      if (parentId) {
        await fetchLegsForPosition(parentId);
      }
      closeLegEditModal();
    } catch (err) {
      showNotification(err.message, 'error', 7000, 'SL/TP update failed');
    }
  }, [API_URL, user, legBeingEdited, legEditSL, legEditTP, legEditParentPos, fetchLegsForPosition, closeLegEditModal]);

  // Reusable JSX hint for SL/TP modal inputs (Fix 14b extension).
  // Mirrors the order-panel hint but works in any modal — pass the position
  // side, the reference price (parent's currentPrice or fill entry), the
  // resolved segment settings (may be null — degrades to direction-only),
  // the kind ('sl' or 'tp'), and the symbol for formatting.
  const renderSLTPModalHint = useCallback((side, refPrice, segSettings, kind, symbol) => {
    const ref = Number(refPrice) || 0;
    if (!(ref > 0)) return null;
    const sideLc = String(side || '').toLowerCase();
    if (sideLc !== 'buy' && sideLc !== 'sell') return null;
    const isSL = kind === 'sl';
    const band = getNettingStopSlmAwayOffset(ref, segSettings);
    const baseStyle = { fontSize: 10, color: '#71717a', marginTop: 4, display: 'block' };

    if (!band) {
      // Direction-only fallback
      let msg;
      if (isSL) {
        msg = sideLc === 'buy'
          ? `Must be below ${formatPrice(ref, symbol)}`
          : `Must be above ${formatPrice(ref, symbol)}`;
      } else {
        msg = sideLc === 'buy'
          ? `Must be above ${formatPrice(ref, symbol)}`
          : `Must be below ${formatPrice(ref, symbol)}`;
      }
      return <span style={baseStyle}>{msg}</span>;
    }

    let limit;
    let msg;
    if (isSL) {
      limit = sideLc === 'buy' ? ref - band.away : ref + band.away;
      msg = sideLc === 'buy'
        ? `At or below ${formatPrice(limit, symbol)} (${band.detail})`
        : `At or above ${formatPrice(limit, symbol)} (${band.detail})`;
    } else {
      limit = sideLc === 'buy' ? ref + band.away : ref - band.away;
      msg = sideLc === 'buy'
        ? `At or above ${formatPrice(limit, symbol)} (${band.detail})`
        : `At or below ${formatPrice(limit, symbol)} (${band.detail})`;
    }
    return <span style={baseStyle}>{msg}</span>;
  }, []);

  // Fix 19b: opens the styled per-leg close confirm modal. Resolves the
  // current price up-front so the modal can display it; the actual POST
  // happens in confirmLegClose() when the user clicks the Close button.
  const closeLegHandler = useCallback(
    (leg, parentPos) => {
      if (!leg) return;
      // Resolve current price for the leg's symbol — fall back to the parent's
      // currentPrice if the live price isn't available right now.
      const live = livePrices?.[leg.symbol] || livePrices?.[parentPos?.symbol];
      let px = 0;
      if (live) {
        px = leg.side === 'buy' ? Number(live.bid) : Number(live.ask);
      }
      if (!(px > 0)) {
        px = Number(parentPos?.currentPrice || parentPos?.entryPrice || parentPos?.avgPrice) || 0;
      }
      if (!(px > 0)) {
        tradingSounds.playError();
        showNotification('No live price available right now.', 'error', 6000, 'Cannot close leg');
        return;
      }
      setLegCloseConfirmLeg(leg);
      setLegCloseConfirmParent(parentPos);
      setLegCloseConfirmPrice(px);
      setLegCloseConfirmOpen(true);
    },
    [livePrices]
  );

  const closeLegConfirmModal = useCallback(() => {
    setLegCloseConfirmOpen(false);
    setLegCloseConfirmLeg(null);
    setLegCloseConfirmParent(null);
    setLegCloseConfirmPrice(0);
    setLegCloseConfirmBusy(false);
  }, []);

  const confirmLegClose = useCallback(async () => {
    const uid = user?.oderId || user?.id;
    if (!uid || !legCloseConfirmLeg || !(legCloseConfirmPrice > 0)) return;
    setLegCloseConfirmBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/positions/close-leg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          tradeId: legCloseConfirmLeg.tradeId,
          currentPrice: legCloseConfirmPrice,
          closeReason: 'user'
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        tradingSounds.playError();
        showNotification(`${data.error || res.statusText}`, 'error', 7000, 'Close leg failed');
        setLegCloseConfirmBusy(false);
        return;
      }
      // Fix 19: per-fill close plays the partial-close sound (it's
      // closing a single fill out of the parent position, conceptually
      // a partial close from the user's POV).
      tradingSounds.playPartialClose();
      const parentId = legCloseConfirmParent?.oderId || legCloseConfirmParent?._id;
      if (parentId) await fetchLegsForPosition(parentId);
      closeLegConfirmModal();
    } catch (err) {
      tradingSounds.playError();
      showNotification(err.message, 'error', 7000, 'Close leg failed');
      setLegCloseConfirmBusy(false);
    }
  }, [API_URL, user, legCloseConfirmLeg, legCloseConfirmPrice, legCloseConfirmParent, fetchLegsForPosition, closeLegConfirmModal]);

  // (removed) A per-second timerTick nothing rendered. Its effect also
  // depended on `positions`, which changes on every tick, so the interval was
  // rebuilt several times a second as well.

  // Zerodha search state
  const [zerodhaSearchQuery, setZerodhaSearchQuery] = useState('');
  const [zerodhaSearchResults, setZerodhaSearchResults] = useState([]);
  const [zerodhaSearching, setZerodhaSearching] = useState(false);
  const [activeSearchSegment, setActiveSearchSegment] = useState(null);
  const [showZerodhaSearch, setShowZerodhaSearch] = useState(false);
  const SEGMENT_TAB_CONFIG = useMemo(() => [
    { key: 'indian_nse_eq', label: 'NSE EQ', type: 'indian' },
    { key: 'indian_nse_fut', label: 'NSE FUT', type: 'indian' },
    { key: 'indian_nse_opt', label: 'NSE OPT', type: 'indian' },
    { key: 'indian_bse_eq', label: 'BSE EQ', type: 'indian' },
    { key: 'indian_bse_fut', label: 'BSE FUT', type: 'indian' },
    { key: 'indian_bse_opt', label: 'BSE OPT', type: 'indian' },
    { key: 'indian_mcx_fut', label: 'MCX FUT', type: 'indian' },
    { key: 'indian_mcx_opt', label: 'MCX OPT', type: 'indian' },
  ], []);

  const visibleSegmentTabs = useMemo(
    () => SEGMENT_TAB_CONFIG.filter(t => brokerSearchModalVisibility.brokerTabVisible(t.key)),
    [SEGMENT_TAB_CONFIG, brokerSearchModalVisibility]
  );

  // Inline search state for Indian segment tabs
  const [inlineIndianQuery, setInlineIndianQuery] = useState('');
  const [inlineIndianResults, setInlineIndianResults] = useState([]);
  const [inlineIndianSearching, setInlineIndianSearching] = useState(false);
  // Inline search for Delta segment tabs
  const [inlineDeltaResults, setInlineDeltaResults] = useState([]);
  const [inlineDeltaLoading, setInlineDeltaLoading] = useState(false);
  const [inlineDeltaQuery, setInlineDeltaQuery] = useState('');

  // When filterTab changes to a segment, reset inline search
  useEffect(() => {
    setInlineIndianQuery('');
    setInlineIndianResults([]);
    setInlineDeltaQuery('');
    setInlineDeltaResults([]);
    // Auto-load delta instruments when switching to a delta tab
    if (filterTab.startsWith('delta_')) {
      const catMap = { 'delta_perpetual': 'perpetual', 'delta_call_options': 'call_options', 'delta_put_options': 'put_options' };
      (async () => {
        setInlineDeltaLoading(true);
        try {
          const url = `${API_URL}/api/delta/instruments?category=${catMap[filterTab] || 'all'}`;
          const resp = await fetch(url);
          const data = await resp.json();
          if (data.success) setInlineDeltaResults(data.instruments || []);
        } catch {} finally { setInlineDeltaLoading(false); }
      })();
    }
  }, [filterTab, API_URL]);

  // Inline Zerodha search for Indian tabs
  const performInlineIndianSearch = useCallback(async (query, tabKey) => {
    if (!query || query.length < 2) return;
    const segMap = {
      'indian_nse_eq': 'nseEq', 'indian_nse_fut': 'nseFut', 'indian_nse_opt': 'nseOpt',
      'indian_bse_eq': 'bseEq', 'indian_bse_fut': 'bseFut', 'indian_bse_opt': 'bseOpt',
      'indian_mcx_fut': 'mcxFut', 'indian_mcx_opt': 'mcxOpt',
    };
    setInlineIndianSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/zerodha/instruments/search?query=${encodeURIComponent(query)}&segment=${segMap[tabKey] || 'nseEq'}`);
      const data = await res.json();
      if (data.success) setInlineIndianResults(data.instruments || []);
      else setInlineIndianResults([]);
    } catch { setInlineIndianResults([]); }
    finally { setInlineIndianSearching(false); }
  }, [API_URL]);

  // Inline Delta search
  const performInlineDeltaSearch = useCallback(async (query, tabKey) => {
    const catMap = { 'delta_perpetual': 'perpetual', 'delta_call_options': 'call_options', 'delta_put_options': 'put_options' };
    setInlineDeltaLoading(true);
    try {
      const url = query && query.length >= 1
        ? `${API_URL}/api/delta/instruments?search=${encodeURIComponent(query)}&category=${catMap[tabKey] || 'all'}`
        : `${API_URL}/api/delta/instruments?category=${catMap[tabKey] || 'all'}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.success) setInlineDeltaResults(data.instruments || []);
    } catch {} finally { setInlineDeltaLoading(false); }
  }, [API_URL]);

  // Broker instruments search state (MT5-style for all 480+ symbols)
  const [brokerSearchQuery, setBrokerSearchQuery] = useState('');
  const [showBrokerSearch, setShowBrokerSearch] = useState(false);
  const [selectedBrokerCategory, setSelectedBrokerCategory] = useState('all');

  useEffect(() => {
    if (!showBrokerSearch || nettingSegmentBlockByCode === null) return;
    if (!brokerSearchModalVisibility.brokerTabVisible(selectedBrokerCategory)) {
      setSelectedBrokerCategory(brokerSearchModalVisibility.firstVisibleBrokerTab());
    }
  }, [
    showBrokerSearch,
    nettingSegmentBlockByCode,
    selectedBrokerCategory,
    brokerSearchModalVisibility
  ]);

  const [orderBookHistoryPage, setOrderBookHistoryPage] = useState(1);
  const orderBookHistoryPageCount = Math.max(
    1,
    Math.ceil((scopedTradeHistory?.length || 0) / ORDER_BOOK_HISTORY_PAGE_SIZE)
  );

  useEffect(() => {
    setOrderBookHistoryPage((p) => Math.min(Math.max(1, p), orderBookHistoryPageCount));
  }, [orderBookHistoryPageCount, scopedTradeHistory?.length]);

  useEffect(() => {
    if (activeTab !== 'history') setOrderBookHistoryPage(1);
  }, [activeTab]);

  const paginatedOrderBookHistory = useMemo(() => {
    const list = scopedTradeHistory || [];
    const start = (orderBookHistoryPage - 1) * ORDER_BOOK_HISTORY_PAGE_SIZE;
    return list.slice(start, start + ORDER_BOOK_HISTORY_PAGE_SIZE);
  }, [scopedTradeHistory, orderBookHistoryPage]);

  const orderBookHistoryRangeStart =
    (scopedTradeHistory?.length || 0) === 0 ? 0 : (orderBookHistoryPage - 1) * ORDER_BOOK_HISTORY_PAGE_SIZE + 1;
  const orderBookHistoryRangeEnd =
    (scopedTradeHistory?.length || 0) === 0
      ? 0
      : Math.min(orderBookHistoryPage * ORDER_BOOK_HISTORY_PAGE_SIZE, scopedTradeHistory?.length || 0);

  // Delta Exchange state (Crypto Futures & Options)
  const [deltaInstruments, setDeltaInstruments] = useState([]);
  const [deltaSearchQuery, setDeltaSearchQuery] = useState('');
  const [deltaSearchResults, setDeltaSearchResults] = useState([]);
  const [deltaLoading, setDeltaLoading] = useState(false);

  // Netting segment settings state
  const [segmentSettings, setSegmentSettings] = useState(null);
  const [segmentSettingsLoading, setSegmentSettingsLoading] = useState(false);

  // Handle broker instrument search
  useEffect(() => {
    if (brokerSearchQuery.length >= 1) {
      searchBrokerInstruments(brokerSearchQuery, selectedBrokerCategory);
    }
  }, [brokerSearchQuery, selectedBrokerCategory, searchBrokerInstruments]);

  const watchlistCategoryFromBrokerInstrument = (instrument) => {
    const c = instrument.category;
    if (c === 'forex' || c === 'forex_yen') return 'Forex';
    if (c === 'metals' || c === 'energy') return 'Commodities';
    if (c === 'indices') return 'Indices';
    if (c === 'stocks') return 'Stocks (International)';
    if (c === 'crypto_perpetual' || c === 'crypto') return 'Crypto Perpetual';
    return 'Forex';
  };

  // Add broker instrument to watchlist + canonical segment (matches netting segment table)
  const addBrokerInstrumentToWatchlist = (instrument) => {
    addToWatchlist(instrument.symbol);
    const cat = watchlistCategoryFromBrokerInstrument(instrument);
    const cat2 = (instrument.category || '').toLowerCase();
    const inferredExchange = instrument.exchange ||
      (cat2 === 'forex' || cat2 === 'yen' || cat2 === 'forex_yen' ? 'FOREX'
        : cat2 === 'indices' ? 'INDICES'
        : cat2 === 'metals' || cat2 === 'energy' ? 'COMMODITIES'
        : cat2 === 'stocks' ? 'STOCKS'
        : '');
    addInstrumentToCategory(
      {
        symbol: instrument.symbol,
        name: instrument.name || instrument.symbol,
        lotSize: 1,
        tickSize: instrument.category === 'indices' ? 1 : 0.01,
        exchange: inferredExchange,
        category: instrument.category
      },
      cat
    );
    showNotification(`${instrument.symbol} added to favourites`, 'success');
  };

  // Fetch Delta Exchange instruments
  const fetchDeltaInstruments = async (category = 'all') => {
    setDeltaLoading(true);
    try {
      const url = `${API_URL}/api/delta/instruments?category=${category}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.success) {
        setDeltaInstruments(data.instruments || []);
        setDeltaSearchResults(data.instruments || []);
      }
    } catch (error) {
      console.error('Error fetching Delta instruments:', error);
    } finally {
      setDeltaLoading(false);
    }
  };

  // Search Delta Exchange instruments
  const searchDeltaInstruments = async (query, category = 'all') => {
    if (!query || query.length < 1) {
      return fetchDeltaInstruments(category);
    }
    setDeltaLoading(true);
    try {
      const url = `${API_URL}/api/delta/instruments?search=${encodeURIComponent(query)}&category=${category}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.success) {
        setDeltaSearchResults(data.instruments || []);
      }
    } catch (error) {
      console.error('Error searching Delta instruments:', error);
    } finally {
      setDeltaLoading(false);
    }
  };

  // Add Delta instrument to watchlist and segment
  const addDeltaInstrumentToWatchlist = (instrument) => {
    // Add to watchlist (persists to database)
    addToWatchlist(instrument.symbol);
    showNotification(`${instrument.symbol} added to favourites`, 'success');
    
    // Also add to appropriate crypto segment
    // Note: Delta Exchange India only has perpetual_futures (no dated futures)
    const segmentMap = {
      'perpetual_futures': 'Crypto Perpetual',
      'call_options': 'Crypto Options',
      'put_options': 'Crypto Options'
    };
    const segment = segmentMap[instrument.contract_type];
    if (segment) {
      // Note: addInstrumentToCategory expects (instrumentData, categoryKey)
      addInstrumentToCategory({
        symbol: instrument.symbol,
        name: instrument.name,
        category: 'crypto_derivative',
        contract_type: instrument.contract_type,
        underlying: instrument.underlying,
        expiry: instrument.expiry,
        source: 'delta_exchange'
      }, segment);
    }
  };

  // SL/TP visibility state (collapsed by default)
  const [showStopLoss, setShowStopLoss] = useState(false);
  const [showTakeProfit, setShowTakeProfit] = useState(false);
  const [showPositionSize, setShowPositionSize] = useState(false);
  
  // Trade in flight: dim submit + disable to prevent double-submit (no loading label)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  const categoryToSegment = WATCHLIST_CATEGORY_TO_SEGMENT_CODE;

  const MAJOR_CRYPTO_PERP_BASES = ['BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOT', 'DOGE', 'SOL', 'AVAX', 'MATIC', 'LINK', 'BCH'];

  const canonicalPerpSymbol = (sym) => {
    const u = String(sym || '').trim().toUpperCase();
    for (const b of MAJOR_CRYPTO_PERP_BASES) {
      if (u === `${b}USD` || u === `${b}USDT` || u === `${b}USD.P` || u === `${b}USDT.P`) return `${b}USD`;
    }
    return u;
  };

  /** Aligns with server NettingEngine segment routing (caps, limits) */
  const resolveSegmentApiName = useCallback(
    (symbol, inst = {}) => {
      if (!symbol) return null;
      const sym = String(symbol).toUpperCase();
      const ex = String(inst.exchange || '').toUpperCase();

      if (inst.source === 'delta_exchange' || ex === 'DELTA' || ex === 'FX_DELTA') {
        const ct = String(inst.contract_type || 'perpetual_futures').toLowerCase();
        if (ct.includes('call_options') || ct.includes('put_options')) return 'CRYPTO_OPTIONS';
        return 'CRYPTO_PERPETUAL';
      }

      if (/^[CP]-/.test(sym)) return 'CRYPTO_OPTIONS';

      if (inst.contract_type) {
        const ct = String(inst.contract_type).toLowerCase();
        if (ct.includes('call_options') || ct.includes('put_options')) return 'CRYPTO_OPTIONS';
        if (ct.includes('future') || ct.includes('perpetual')) return 'CRYPTO_PERPETUAL';
      }

      const forexSix = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']);
      if (
        sym.endsWith('USD') &&
        !sym.includes('/') &&
        !forexSix.has(sym) &&
        !sym.includes('XAU') &&
        !sym.includes('XAG')
      ) {
        return 'CRYPTO_PERPETUAL';
      }
      if (sym.endsWith('USDT') && !sym.includes('/') && !sym.includes('XAU') && !sym.includes('XAG')) {
        const base = sym.replace(/USDT$/i, '');
        if (MAJOR_CRYPTO_PERP_BASES.includes(base)) return 'CRYPTO_PERPETUAL';
      }

      for (const [key, instruments] of Object.entries(instrumentsByCategory)) {
        if (instruments.some((i) => i.symbol === symbol)) {
          return categoryToSegment[key] || null;
        }
      }

      // MetaAPI / broker instruments not in local JSON: use category + exchange before Zerodha fallbacks
      const cat = String(inst.category || '').toLowerCase();
      const fromInstCategory = metaInstrumentCategoryToNettingCode(cat);
      if (fromInstCategory) return fromInstCategory;

      if (ex === 'INDICES') return 'INDICES';
      if (ex === 'FOREX') return 'FOREX';
      if (ex === 'COMMODITIES') return 'COMMODITIES';
      if (ex === 'STOCKS') return 'STOCKS';

      // Continuous index CFDs (e.g. AUS200Roll) — do not treat as NSE cash equity
      if (/ROLL$/i.test(sym)) return 'INDICES';
      if (!['NSE', 'NFO', 'BSE', 'BFO', 'MCX'].includes(ex)) {
        if (/^(US|UK|DE|EU|JP|AUS|HK|SG|CHINA)[0-9]{2,4}/i.test(sym)) return 'INDICES';
      }

      if (ex === 'NSE') return 'NSE_EQ';
      if (ex === 'NFO') {
        // Check if it's an option (ends with CE or PE)
        if (/[CP]E$/i.test(sym)) return 'NSE_OPT';
        return 'NSE_FUT';
      }
      if (ex === 'MCX') {
        // Check if it's an option (ends with CE or PE)
        if (/[CP]E$/i.test(sym)) return 'MCX_OPT';
        return 'MCX_FUT';
      }
      if (ex === 'BSE') return 'BSE_EQ';
      if (ex === 'BFO') {
        // Check if it's an option (ends with CE or PE)
        if (/[CP]E$/i.test(sym)) return 'BSE_OPT';
        return 'BSE_FUT';
      }

      return null;
    },
    [instrumentsByCategory]
  );

  // Global search state - searches all segments when instrument not found locally
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const globalSearchTimeoutRef = useRef(null);

  // Mobile instrument search state (defined here to be available in useEffect)
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');

  // Map segment names to Zerodha segment codes
  const segmentToZerodhaCode = {
    'NSE EQ': 'nseEq',
    'BSE EQ': 'bseEq',
    'NSE FUT': 'nseFut',
    'NSE OPT': 'nseOpt',
    'MCX FUT': 'mcxFut',
    'MCX OPT': 'mcxOpt',
    'BSE FUT': 'bseFut',
    'BSE OPT': 'bseOpt'
  };

  // Check if segment is Indian market (Zerodha)
  const isIndianSegment = (segment) => {
    return ['NSE EQ', 'BSE EQ', 'NSE FUT', 'NSE OPT', 'MCX FUT', 'MCX OPT', 'BSE FUT', 'BSE OPT'].includes(segment);
  };

  // Search Zerodha instruments
  const searchZerodhaInstruments = useCallback(async (query, segment) => {
    if (!query || query.length < 2) {
      setZerodhaSearchResults([]);
      return;
    }

    const zerodhaSegment = segmentToZerodhaCode[segment];
    if (!zerodhaSegment) return;

    setZerodhaSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/zerodha/instruments/search?query=${encodeURIComponent(query)}&segment=${zerodhaSegment}`);
      const data = await res.json();
      if (data.success) {
        setZerodhaSearchResults(data.instruments || []);
      }
    } catch (error) {
      console.error('Error searching Zerodha instruments:', error);
    } finally {
      setZerodhaSearching(false);
    }
  }, [API_URL]);

  // Add Zerodha instrument to segment
  const addZerodhaInstrument = async (instrument, segment) => {
    try {
      // Subscribe to instrument on backend
      const res = await fetch(`${API_URL}/api/zerodha/instruments/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instrument })
      });
      const data = await res.json();
      
      if (data.success) {
        // Add to local instrumentsByCategory
        addInstrumentToCategory(instrument, segment);
        
        // Add to chart and show notification
        addChartTab(instrument.symbol);
        showNotification(`Added ${instrument.symbol} to segment`, 'success', 4000, 'Instrument Added');
        setZerodhaSearchResults([]);
        setZerodhaSearchQuery('');
        setShowZerodhaSearch(false);
      }
    } catch (error) {
      showNotification('Error adding instrument', 'error');
    }
  };

  // Add Zerodha instrument to favourites
  const addZerodhaToFavourites = (instrument) => {
    if (!isInWatchlist(instrument.symbol)) {
      addToWatchlist(instrument.symbol);
      showNotification(`Added ${instrument.symbol} to favourites`, 'success');
    }
  };

  // Global search across all Zerodha segments - triggered when local search has no results
  const performGlobalSearch = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setGlobalSearchResults([]);
      return;
    }

    setGlobalSearching(true);
    const results = [];

    // Search all Zerodha segments
    const zerodhaSegments = [
      { code: 'nseEq', name: 'NSE EQ' },
      { code: 'bseEq', name: 'BSE EQ' },
      { code: 'nseFut', name: 'NSE FUT' },
      { code: 'nseOpt', name: 'NSE OPT' },
      { code: 'mcxFut', name: 'MCX FUT' },
      { code: 'mcxOpt', name: 'MCX OPT' },
      { code: 'bseFut', name: 'BSE FUT' },
      { code: 'bseOpt', name: 'BSE OPT' }
    ];

    // Search all segments in parallel
    const zerodhaPromises = zerodhaSegments.map(async (seg) => {
      try {
        const res = await fetch(`${API_URL}/api/zerodha/instruments/search?query=${encodeURIComponent(query)}&segment=${seg.code}`);
        const data = await res.json();
        if (data.success && data.instruments) {
          return data.instruments.slice(0, 5).map(inst => ({ ...inst, source: 'zerodha', segment: seg.name }));
        }
      } catch (e) { console.log(`Zerodha ${seg.name} search error:`, e); }
      return [];
    });

    // Wait for all searches to complete
    const allResults = await Promise.all([...zerodhaPromises]);
    allResults.forEach(segmentResults => results.push(...segmentResults));

    setGlobalSearchResults(results);
    setGlobalSearching(false);
  }, [API_URL]);

  // Effect to trigger global search - always searches all segments
  useEffect(() => {
    if (globalSearchTimeoutRef.current) {
      clearTimeout(globalSearchTimeoutRef.current);
    }

    // Use either desktop searchQuery or mobile mobileSearchQuery
    const activeQuery = searchQuery || mobileSearchQuery;
    
    if (!activeQuery || activeQuery.length < 2 || (searchQuery && filterTab !== 'ALL SYMBOLS')) {
      setGlobalSearchResults([]);
      return;
    }

    // Always search all segments when query is valid
    globalSearchTimeoutRef.current = setTimeout(() => {
      performGlobalSearch(activeQuery);
    }, 500);

    return () => {
      if (globalSearchTimeoutRef.current) {
        clearTimeout(globalSearchTimeoutRef.current);
      }
    };
  }, [searchQuery, mobileSearchQuery, filterTab, performGlobalSearch]);

  // Add global search result instrument - adds to both segment and favourites
  const addGlobalSearchInstrument = async (inst) => {
    const symbol = inst.symbol || inst.ticker || inst.tkr;
    
    if (inst.source === 'zerodha') {
      await addZerodhaInstrument(inst, inst.segment);
    }
    
    // Also add to favourites
    if (symbol && !isInWatchlist(symbol)) {
      addToWatchlist(symbol);
    }
    
    setGlobalSearchResults([]);
    setSearchQuery('');
    setMobileSearchQuery('');
  };

  // Get selected instrument with live prices
  const staticSelectedInstrument = allInstruments.find(i => i.symbol === selectedSymbol) || allInstruments[0] || { symbol: 'XAUUSD', bid: 0, ask: 0 };
  const selectedInstrument = getInstrumentWithLivePrice(staticSelectedInstrument) || { symbol: 'XAUUSD', bid: 0, ask: 0, low: 0, high: 0, change: 0 };

  // Dynamic font size for order panel price buttons based on text length
  const getPriceFontSize = (price, symbol) => {
    const text = formatPrice(price, symbol);
    const len = text.length;
    if (len > 12) return '12px';
    if (len > 10) return '13px';
    if (len > 8) return '14px';
    return '16px';
  };

  const resolvedSegmentApiName = useMemo(
    () => (selectedSymbol ? resolveSegmentApiName(selectedSymbol, selectedInstrument) : null),
    [selectedSymbol, selectedInstrument, resolveSegmentApiName]
  );

  // Fetch segment settings when segment / symbol changes (netting mode). Pass symbol so script-level block settings apply.
  useEffect(() => {
    if (tradingMode !== 'netting' || !resolvedSegmentApiName || !selectedSymbol) {
      setSegmentSettings(null);
      return;
    }
    const fetchSettings = async () => {
      setSegmentSettingsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('symbol', selectedSymbol);
        if (user?.oderId) params.set('userId', String(user.oderId));
        const res = await fetch(
          `${API_URL}/api/user/segment-settings/${resolvedSegmentApiName}?${params.toString()}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('dhanfunded-token')}` } }
        );
        const data = await res.json();
        if (data.success) {
          setSegmentSettings(data.settings);
        } else {
          setSegmentSettings(null);
        }
      } catch (err) {
        console.error('Error fetching segment settings:', err);
        setSegmentSettings(null);
      } finally {
        setSegmentSettingsLoading(false);
      }
    };
    fetchSettings();
  }, [tradingMode, resolvedSegmentApiName, selectedSymbol, user?.oderId]);

  // Netting: NSE/BSE cash equity uses whole-share quantity; lot-based segments (indices, FNO, FX, etc.) use lots — matches NettingSegment limitType
  const nettingVolumeIsShares =
    tradingMode === 'netting' &&
    isIndianCashEquitySegmentCode(resolvedSegmentApiName) &&
    segmentSettings?.limitType !== 'lot';
  const volumeFieldLabel = nettingVolumeIsShares ? 'Quantity' : 'Lot Size';
  const volumeUnitPlural = nettingVolumeIsShares ? 'shares' : 'lots';

  // Determine the effective `X` (margin value from admin settings).
  // Falls back to base intradayMargin/overnightMargin if the specific Option fields are empty (0 or null).
  // This ensures that an admin who sets "100X" for the overall segment and forgets to set optionBuyIntraday will correctly apply 100X to options too.
  const getSegmentMarginX = useCallback((forcedSession) => {
    if (!segmentSettings) return 0;
    const session = forcedSession || orderSession;
    const isOptSeg = resolvedSegmentApiName && ['NSE_OPT', 'BSE_OPT', 'MCX_OPT', 'CRYPTO_OPTIONS'].includes(resolvedSegmentApiName);

    // Fix 24: check if instrument expires today (IST) → use expiry-day margin fields
    const isExpiryToday = (() => {
      if (!selectedInstrument?.expiry) return false;
      const exp = new Date(selectedInstrument.expiry);
      if (isNaN(exp.getTime())) return false;
      const now = new Date();
      const toIstDate = (d) => {
        const ist = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        return `${ist.getFullYear()}-${ist.getMonth()}-${ist.getDate()}`;
      };
      return toIstDate(exp) === toIstDate(now);
    })();

    // Expiry-day margin override (intraday-style for both intraday + carryforward)
    if (isExpiryToday && (session === 'intraday' || session === 'carryforward')) {
      if (isOptSeg) {
        const sideVal = orderSide === 'buy'
          ? segmentSettings.expiryDayOptionBuyMargin
          : segmentSettings.expiryDayOptionSellMargin;
        if (Number(sideVal) > 0) return Number(sideVal);
      } else {
        // Futures expiry-day margin
        if (Number(segmentSettings.expiryDayIntradayMargin) > 0) {
          return Number(segmentSettings.expiryDayIntradayMargin);
        }
      }
    }

    if (isOptSeg) {
      if (orderSide === 'buy') {
        const raw = session === 'intraday' ? segmentSettings.optionBuyIntraday : segmentSettings.optionBuyOvernight;
        if (Number(raw) > 0) return Number(raw);
      } else {
        const raw = session === 'intraday' ? segmentSettings.optionSellIntraday : segmentSettings.optionSellOvernight;
        if (Number(raw) > 0) return Number(raw);
      }
    }

    // Fallback or Equity/Futures
    const raw = session === 'intraday' ? segmentSettings.intradayMargin : segmentSettings.overnightMargin;
    return Number(raw) || 0;
  }, [segmentSettings, resolvedSegmentApiName, orderSession, orderSide, selectedInstrument]);

  // Fixed margin or times-multiplier configured for current session/side?
  const hasFixedMargin = useMemo(() => {
    if (tradingMode !== 'netting' || !segmentSettings) return false;
    return getSegmentMarginX('intraday') > 0;
  }, [tradingMode, segmentSettings, getSegmentMarginX]);

  const leverageOptionsFromSettings = useMemo(() => {
    if (tradingMode === 'netting' && hasFixedMargin) return [25, 50, 75, 100];
    if (tradingMode === 'hedging') return [10, 25, 50, 100, 200, 500, 1000];
    return null;
  }, [tradingMode, hasFixedMargin]);

  const defaultLeverageOptions = leverageOptionsFromSettings ?? [10, 25, 50, 100, 200, 500, 1000];
  const defaultLeverage = 100;

  // Reset leverage to 100 when segment/session/side changes
  useEffect(() => {
    if (tradingMode === 'netting') {
      setLeverage(100);
    }
  }, [tradingMode, resolvedSegmentApiName, orderSession, orderSide]);

  const overnightDisabled = tradingMode === 'netting' && segmentSettings?.allowOvernight === false;

  /** Shown above netting order form when admin turned off trading or the whole segment */
  const nettingSegmentBlockMessage = useMemo(() => {
    if (tradingMode !== 'netting' || !segmentSettings || segmentSettingsLoading) return null;
    const label =
      (resolvedSegmentApiName && NETTING_SEGMENT_CODE_TO_CATEGORY[resolvedSegmentApiName]) ||
      resolvedSegmentApiName ||
      'this segment';
    if (segmentSettings.isActive === false) {
      return `${label} is inactive. Access is not available for this segment.`;
    }
    if (segmentSettings.tradingEnabled === false) {
      return `Trading is disabled for ${label}. Prices are for information only — Buy/Sell stay off until the broker enables trading for this segment.`;
    }
    return null;
  }, [tradingMode, segmentSettings, segmentSettingsLoading, resolvedSegmentApiName]);

  useEffect(() => {
    if (overnightDisabled && orderSession === 'carryforward') {
      setOrderSession('intraday');
    }
  }, [overnightDisabled, orderSession, setOrderSession]);

  /** Filled open row only (not pending) — used for exit-only: close-only on symbols that already have an open trade. */
  const openNettingPosition = useMemo(() => {
    const sel = canonicalPerpSymbol(selectedSymbol);
    return (positions || []).find(
      (p) =>
        p.mode === 'netting' &&
        canonicalPerpSymbol(p.symbol) === sel &&
        p.status === 'open'
    );
  }, [positions, selectedSymbol]);

  // Admin binary min/max are in INR; UI amount uses display currency (₹ or $).
  const binaryStakeMeta = useMemo(() => {
    const rate = (Number(usdInrRate) || 83) + (Number(usdMarkup) || 0);
    const rawMin = Number(binarySettings?.minTradeAmount);
    const rawMax = Number(binarySettings?.maxTradeAmount);
    const minInr = Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 100;
    let maxInr = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 100_000_000;
    if (maxInr < minInr) maxInr = minInr;
    const minDisp = displayCurrency === 'INR' ? minInr : minInr / rate;
    const maxDisp = displayCurrency === 'INR' ? maxInr : maxInr / rate;
    const stepInr = minInr < 50 ? 1 : 10;
    const stepDisp =
      displayCurrency === 'INR'
        ? stepInr
        : Math.max(0.01, Math.round((stepInr / rate) * 10000) / 10000);
    return { rate, minInr, maxInr, minDisp, maxDisp, stepDisp };
  }, [usdInrRate, usdMarkup, binarySettings?.minTradeAmount, binarySettings?.maxTradeAmount, displayCurrency]);

  const clampBinaryStakeDisplay = useCallback(
    (v) => {
      const x = Math.min(binaryStakeMeta.maxDisp, Math.max(binaryStakeMeta.minDisp, v));
      if (displayCurrency === 'INR') return Math.round(x);
      return Math.round(x * 10000) / 10000;
    },
    [binaryStakeMeta, displayCurrency]
  );

  // Volume validation with segment settings for netting mode
  const lotOrderValidation = useMemo(() => {
    if (tradingMode === 'binary') {
      const amt = Number(binaryAmount);
      const messages = [];
      if (!Number.isFinite(amt) || amt <= 0) {
        return { valid: false, messages: ['Enter a valid order amount.'], canSubmit: false };
      }
      const stakeInr = displayCurrency === 'INR' ? amt : amt * binaryStakeMeta.rate;
      if (stakeInr < binaryStakeMeta.minInr - 1e-6) {
        messages.push(`Minimum stake is ₹${binaryStakeMeta.minInr}.`);
      }
      if (stakeInr > binaryStakeMeta.maxInr + 1e-6) {
        messages.push(`Maximum stake is ₹${binaryStakeMeta.maxInr}.`);
      }
      const allowed = binarySettings?.allowedExpiries;
      if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(binaryExpiry)) {
        messages.push('Choose one of the allowed expiry times.');
      }
      const canSubmit = messages.length === 0;
      return { valid: canSubmit, messages, canSubmit };
    }

    const messages = [];
    let canSubmit = true;

    // Check if segment is active and access enabled
    if (tradingMode === 'netting' && segmentSettings) {
      if (segmentSettings.isActive === false) {
        return {
          valid: false,
          messages: ['This segment is inactive — it is hidden from the list and not available for trading.'],
          canSubmit: false
        };
      }
      if (segmentSettings.tradingEnabled === false) {
        return {
          valid: false,
          messages: ['Trading is turned off for this segment — you can view prices, but Buy/Sell is disabled.'],
          canSubmit: false
        };
      }
      if (segmentSettings.exitOnlyMode === true) {
        if (!openNettingPosition) {
          return {
            valid: false,
            messages: [
              'Exit only mode: you cannot open a new position on this segment. Choose a symbol where you already have an open trade, then trade the opposite side to close (only).'
            ],
            canSubmit: false
          };
        }
      }
    }

    const raw = String(volume ?? '').trim();
    if (raw === '' || raw === '.' || raw === '-') {
      return { valid: false, messages: [nettingVolumeIsShares ? 'Enter a valid quantity.' : 'Enter a valid lot size.'], canSubmit: false };
    }
    const vol = parseFloat(raw);
    if (Number.isNaN(vol) || vol <= 0) {
      return { valid: false, messages: [nettingVolumeIsShares ? 'Enter a valid quantity.' : 'Enter a valid lot size.'], canSubmit: false };
    }

    // Exit only: only reduce/close the open row — no same-side adds, no size larger than open (would flip)
    if (tradingMode === 'netting' && segmentSettings?.exitOnlyMode === true && openNettingPosition) {
      const posSide = String(openNettingPosition.side || '').toLowerCase();
      const orderVol = nettingVolumeIsShares ? Math.round(vol) : vol;
      const openVol =
        Number(
          nettingVolumeIsShares
            ? openNettingPosition.quantity ?? openNettingPosition.volume
            : openNettingPosition.volume
        ) || 0;
      const isClosing =
        (posSide === 'buy' && orderSide === 'sell') || (posSide === 'sell' && orderSide === 'buy');
      if (!isClosing) {
        messages.push(
          'Exit only mode: only closing is allowed — use the opposite side (sell to close a buy, buy to close a sell). You cannot add to this position.'
        );
        canSubmit = false;
      } else if (orderVol > openVol + 1e-9) {
        messages.push(
          `Exit only mode: you can close at most ${openVol} ${nettingVolumeIsShares ? 'shares' : 'lots'} (your open size). A larger size would open a reverse position.`
        );
        canSubmit = false;
      }
    }

    // Quantity validation for shares (NSE_EQ, BSE_EQ)
    if (nettingVolumeIsShares) {
      if (Math.abs(vol - Math.round(vol)) > 1e-9) {
        return { valid: false, messages: ['Quantity must be a whole number.'], canSubmit: false };
      }
      
      // Use segment settings for quantity limits
      if (tradingMode === 'netting' && segmentSettings) {
        const minQty = segmentSettings.minQty || 1;
        const perOrderQty = segmentSettings.perOrderQty;
        const maxQtyPerScript = segmentSettings.maxQtyPerScript;
        
        if (vol < minQty) {
          messages.push(`Minimum quantity is ${minQty}.`);
          canSubmit = false;
        }
        if (perOrderQty && vol > perOrderQty) {
          messages.push(`Max ${perOrderQty} qty per order.`);
          canSubmit = false;
        }
        if (maxQtyPerScript && vol > maxQtyPerScript) {
          messages.push(`Max ${maxQtyPerScript} qty per script.`);
          canSubmit = false;
        }
      } else if (vol < 1) {
        messages.push('Minimum quantity is 1 share.');
        canSubmit = false;
      }
    } else {
      // Lot validation
      if (tradingMode === 'netting' && segmentSettings) {
        const minLots = segmentSettings.minLots ?? 0.01;
        const orderLots = segmentSettings.orderLots;
        const maxLots = segmentSettings.maxLots;
        
        if (vol < minLots) {
          messages.push(`Minimum lot size is ${minLots}.`);
          canSubmit = false;
        }
        if (orderLots && vol > orderLots) {
          messages.push(`Max ${orderLots} lots per order.`);
          canSubmit = false;
        }
        if (maxLots && vol > maxLots) {
          messages.push(`Max ${maxLots} lots per script.`);
          canSubmit = false;
        }
      } else if (vol < 0.01) {
        messages.push('Minimum lot size is 0.01.');
        canSubmit = false;
      }

      // Whole-lots-only enforcement (challenge rule)
      const _wholeLots = challengeAllowFractional === false ||
        (challengeAllowFractional !== true && Number.isFinite(challengeMinLot) && challengeMinLot >= 1 && challengeMinLot % 1 === 0);
      if (_wholeLots && Math.abs(vol - Math.round(vol)) > 1e-9) {
        messages.push('Fractional lots not allowed — use whole numbers (1, 2, 3 …).');
        canSubmit = false;
      }
    }

    // Options strike vs underlying (netting): |strike − underlying| ≤ max, max = points or underlying×%/100 — matches NettingEngine
    const isOptionSegment = tradingMode === 'netting' && ['NSE_OPT', 'BSE_OPT', 'MCX_OPT'].includes(resolvedSegmentApiName);

    if (isOptionSegment && segmentSettings) {
      let strikePrice = selectedInstrument?.strike || 0;
      const underlyingMatch = selectedSymbol.match(/^([A-Z]+)/i);
      const underlyingSymbol = underlyingMatch ? underlyingMatch[1] : 'NIFTY';

      if (!strikePrice) {
        const sym = selectedSymbol.toUpperCase();
        const rest = sym.replace(/^[A-Z]+/, '');
        if (rest.length >= 7) {
          const afterDate = rest.substring(5);
          const strikeMatch = afterDate.match(/^(\d+)([CP]E)$/);
          if (strikeMatch) {
            strikePrice = parseInt(strikeMatch[1], 10);
          }
        }
      }

      const hasOptRule =
        (segmentSettings.buyingStrikeFar != null && segmentSettings.buyingStrikeFar > 0) ||
        (segmentSettings.buyingStrikeFarPercent != null && segmentSettings.buyingStrikeFarPercent > 0) ||
        (segmentSettings.sellingStrikeFar != null && segmentSettings.sellingStrikeFar > 0) ||
        (segmentSettings.sellingStrikeFarPercent != null && segmentSettings.sellingStrikeFarPercent > 0);

      if (strikePrice > 0 && hasOptRule) {
        const underlyingPrice = resolveIndianUnderlyingLtp(
          underlyingSymbol,
          getTickBySymbolAuto,
          livePrices
        );

        if (underlyingPrice > 0) {
          const band = getOptionsStrikeMaxDistance(underlyingPrice, segmentSettings, orderSide);
          if (band) {
            const strikeDistance = Math.abs(strikePrice - underlyingPrice);
            if (strikeDistance > band.max) {
              messages.push(
                `Strike ${strikePrice} is ${strikeDistance.toFixed(0)} from underlying ${underlyingPrice.toFixed(2)}; max allowed ${band.max.toFixed(2)} (${band.detail}).`
              );
              canSubmit = false;
            }
          }
        } else {
          console.log(`[Options] Cannot validate strike distance - underlying price not available for ${underlyingSymbol}`);
        }
      }
    }

    // Netting: % away applies to limit orders only (server: limit/pending). Stop / SL-M keep points-only checks.
    if (tradingMode === 'netting' && orderType !== 'market') {
      const currentPrice = orderSide === 'buy' ? (selectedInstrument?.ask || 0) : (selectedInstrument?.bid || 0);
      const orderPrice = parseFloat(limitPrice) || 0;

      if (orderPrice > 0 && currentPrice > 0) {
        if (orderType === 'limit') {
          const band = getNettingLimitAwayOffset(currentPrice, segmentSettings);
          if (band) {
            const { away, detail } = band;
            // Limit Away Logic: Orders must be OUTSIDE the % range (not too close to market)
            // Example: 1% away means order must be at least 1% below (buy) or above (sell) market price
            if (orderSide === 'buy') {
              if (orderPrice > currentPrice) {
                messages.push(`Limit Buy cannot be above market (${currentPrice.toFixed(2)}).`);
                canSubmit = false;
              } else if (orderPrice > currentPrice - away) {
                messages.push(
                  `Limit Buy too close to market. Must be at least ${detail} below. Max allowed ${(currentPrice - away).toFixed(2)}.`
                );
                canSubmit = false;
              }
            } else {
              if (orderPrice < currentPrice) {
                messages.push(`Limit Sell cannot be below market (${currentPrice.toFixed(2)}).`);
                canSubmit = false;
              } else if (orderPrice < currentPrice + away) {
                messages.push(
                  `Limit Sell too close to market. Must be at least ${detail} above. Min allowed ${(currentPrice + away).toFixed(2)}.`
                );
                canSubmit = false;
              }
            }
          }
        } else if (orderType === 'stop' || orderType === 'slm') {
          const band = getNettingStopSlmAwayOffset(currentPrice, segmentSettings);
          if (band) {
            const minBuyPrice = currentPrice + band.away;
            const maxSellPrice = currentPrice - band.away;
            if (orderSide === 'buy' && orderPrice < minBuyPrice) {
              messages.push(`Stop Buy must be ≥ ${minBuyPrice.toFixed(2)} (${band.detail} above market).`);
              canSubmit = false;
            } else if (orderSide === 'sell' && orderPrice > maxSellPrice) {
              messages.push(`Stop Sell must be ≤ ${maxSellPrice.toFixed(2)} (${band.detail} below market).`);
              canSubmit = false;
            }
          }
        }
      }
    }

    return { valid: messages.length === 0, messages, canSubmit };
  }, [
    tradingMode,
    volume,
    nettingVolumeIsShares,
    segmentSettings,
    openNettingPosition,
    selectedInstrument,
    resolvedSegmentApiName,
    orderSide,
    getTickBySymbolAuto,
    livePrices,
    selectedSymbol,
    orderType,
    limitPrice,
    binaryAmount,
    binaryExpiry,
    binarySettings,
    displayCurrency,
    binaryStakeMeta,
    challengeAllowFractional,
    challengeMinLot
  ]);

  // Auto-round volume for shares mode
  useEffect(() => {
    if (!nettingVolumeIsShares) return;
    setVolume((prev) => {
      const v = parseFloat(String(prev).trim());
      if (!Number.isFinite(v) || v < 1) return '1';
      if (Math.abs(v - Math.round(v)) > 1e-9) return String(Math.max(1, Math.round(v)));
      return String(Math.round(v));
    });
  }, [selectedSymbol, nettingVolumeIsShares, setVolume]);


  // Calculate pip value
  const getPipValue = (symbol) => {
    if (!symbol) return 0.0001;
    if (symbol.includes('JPY')) return 0.01;
    if (symbol === 'XAUUSD' || symbol === 'XPTUSD') return 0.1;
    if (symbol === 'BTCUSD') return 1;
    if (symbol === 'US100' || symbol === 'US2000') return 0.1;
    return 0.0001;
  };

  const pipValue = getPipValue(selectedSymbol);
  const entryPrice = orderSide === 'buy' ? (selectedInstrument.ask || 0) : (selectedInstrument.bid || 0);
  // Effective lot floor / ceiling / step come from the active challenge's
  // admin-configured tradeRules. Fall back to 0.01 (forex default) on main
  // wallet or before the prefs fetch resolves. The step matches the floor so
  // a minLot of 1 increments by 1 (Indian-stock style) instead of 0.01.
  const wholeLotsOnly = challengeAllowFractional === false;
  const rawMinLot = (Number.isFinite(challengeMinLot) && challengeMinLot > 0) ? challengeMinLot : 0.01;
  // When fractional lots are disabled, the floor must be at least 1 lot —
  // a minLot of 0.5 would otherwise let users place 0.5-lot orders.
  const effectiveMinLot = wholeLotsOnly ? Math.max(1, Math.ceil(rawMinLot)) : rawMinLot;
  const effectiveMaxLot = (Number.isFinite(challengeMaxLot) && challengeMaxLot > 0) ? challengeMaxLot : 100;
  const lotStep = wholeLotsOnly ? Math.max(1, Math.round(effectiveMinLot)) : effectiveMinLot;
  const lotDecimals = wholeLotsOnly ? 0 : (lotStep >= 1 ? 0 : (lotStep >= 0.1 ? 1 : (lotStep >= 0.01 ? 2 : 4)));
  const volumeNum = nettingVolumeIsShares
    ? Math.max(1, Math.round(parseFloat(volume) || 1))
    : parseFloat(volume) || effectiveMinLot;

  // Contract size calculation
  const getContractSize = (symbol) => {
    // Check if it's an Indian market instrument
    const inst = allInstruments.find(i => i.symbol === symbol);
    if (inst?.category?.startsWith('nse_') || inst?.category?.startsWith('mcx_') || inst?.category?.startsWith('bse_')) {
      // For Indian markets, use lot size (default 1 for equity)
      return inst.lotSize || 1;
    }
    
    if (symbol.includes('BTC')) return 1;
    if (symbol.includes('ETH')) return 1;
    if (symbol.includes('ADA')) return 1000;
    if (symbol === 'XAUUSD') return 100;
    if (symbol === 'XAGUSD') return 5000;
    if (symbol === 'XPTUSD') return 100;
    if (symbol === 'US100' || symbol === 'US30' || symbol === 'US2000') return 1;
    if (symbol === 'BRENT' || symbol.includes('OIL')) return 1000;
    return 100000;
  };

  const contractSize = getContractSize(selectedSymbol);
  const marginRequired = (volumeNum * contractSize * entryPrice) / leverage;

  // Calculate SL/TP prices
  const calculateSlPrice = () => {
    if (orderSide === 'buy') {
      return (entryPrice - (slPips * pipValue)).toFixed(selectedInstrument.bid < 10 ? 5 : 2);
    }
    return (entryPrice + (slPips * pipValue)).toFixed(selectedInstrument.bid < 10 ? 5 : 2);
  };

  const calculateTpPrice = () => {
    if (orderSide === 'buy') {
      return (entryPrice + (tpPips * pipValue)).toFixed(selectedInstrument.bid < 10 ? 5 : 2);
    }
    return (entryPrice - (tpPips * pipValue)).toFixed(selectedInstrument.bid < 10 ? 5 : 2);
  };

  // Check market hours
  const checkMarketHours = (symbol) => {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const hour = now.getUTCHours();

    // Crypto markets are 24/7
    if (symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('ADA') || 
        symbol.includes('DOGE') || symbol.includes('SOL') || symbol.includes('XRP') ||
        selectedInstrument?.category?.toLowerCase()?.includes('crypto')) {
      return { isOpen: true, reason: 'Crypto markets are 24/7' };
    }

    // Check if this is an Indian instrument (MCX, NSE, BSE)
    const isIndianInstrument = selectedInstrument?.exchange && 
      ['NSE', 'BSE', 'NFO', 'BFO', 'MCX'].includes(selectedInstrument.exchange.toUpperCase());
    
    // Also check category for Indian instruments
    const category = selectedInstrument?.category?.toLowerCase() || '';
    const isIndianCategory = category.includes('nse') || category.includes('bse') || 
                             category.includes('mcx') || category.includes('nfo') || 
                             category.includes('bfo');

    if (isIndianInstrument || isIndianCategory) {
      // Indian market hours: Mon-Fri, 9:15 AM - 3:30 PM IST (3:45 AM - 10:00 AM UTC)
      // MCX: Mon-Fri, 9:00 AM - 11:30 PM IST (3:30 AM - 6:00 PM UTC)
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return { isOpen: false, reason: 'Indian markets closed on weekends' };
      }
      // For now, allow trading during weekdays - server will validate actual hours
      return { isOpen: true, reason: 'Indian market hours' };
    }

    // Forex/Commodities (XAUUSD, EURUSD, etc.) - 24/5 trading
    // Open: Sunday 22:00 UTC, Close: Friday 22:00 UTC
    // Saturday: Always closed
    if (dayOfWeek === 6) {
      return { isOpen: false, reason: 'Forex/Commodities market closed on Saturday' };
    }
    // Sunday before 22:00 UTC: Closed
    if (dayOfWeek === 0 && hour < 22) {
      return { isOpen: false, reason: 'Forex/Commodities market opens Sunday 22:00 UTC' };
    }
    // Friday after 22:00 UTC: Closed
    if (dayOfWeek === 5 && hour >= 22) {
      return { isOpen: false, reason: 'Forex/Commodities market closed Friday 22:00 UTC' };
    }

    return { isOpen: true, reason: 'Market is open' };
  };

  // Calculate required margin
  const calculateRequiredMargin = (forcedSession) => {
    const vol = nettingVolumeIsShares
      ? Math.max(1, Math.round(parseFloat(volume) || 1))
      : parseFloat(volume) || 0.01;
    
    // Get price based on order side (using spread-adjusted instrument)
    let price = orderSide === 'sell' ? (selectedInstrument?.bid || 0) : (selectedInstrument?.ask || 0);

    // Fallback
    if (price === 0) {
      price = selectedInstrument?.lastPrice || 0;
    }

    if (tradingMode === 'binary') return parseFloat(binaryAmount) || 0;

    const marginFactor = leverage / 100;

    if (tradingMode === 'netting') {
      // Option BUY = pay premium (no margin). Hard-code this for option
      // segments so we don't fall through to the underlying's sell margin
      // when admin leaves optionBuyIntraday at 0.
      const isOptSegBuy = orderSide === 'buy'
        && resolvedSegmentApiName
        && ['NSE_OPT', 'BSE_OPT', 'MCX_OPT', 'CRYPTO_OPTIONS'].includes(resolvedSegmentApiName);
      if (isOptSegBuy && price > 0) {
        const lotSize = selectedInstrument?.lotSize || 1;
        const quantity = nettingVolumeIsShares ? vol : vol * lotSize;
        return quantity * price;
      }

      if (segmentSettings && price > 0) {
        const lotSize = selectedInstrument?.lotSize || 1;
        const quantity = nettingVolumeIsShares ? vol : vol * lotSize;
        const isIndian = isIndianInstrument(selectedSymbol);

        const applyNettingFixed = (raw, mode) => {
          const r = Number(raw);
          if (!(r > 0)) return null;
          const effectiveMode = mode === true ? 'percent' : (mode === false ? 'fixed' : (mode || 'fixed'));
          let result;
          switch (effectiveMode) {
            case 'percent': {
              const pct = Math.min(r, 100);
              result = quantity * price * (pct / 100);
              break;
            }
            case 'times': {
              // Apply leverage percentage to multiplier (25% of 500X = 125X effective)
              const effectiveMultiplier = r * (leverage / 100);
              result = (quantity * price) / effectiveMultiplier;
              break;
            }
            case 'fixed':
            default:
              result = r * vol;
              // Fixed margin is always in INR (set by admin).
              // For non-Indian instruments, formatMargin expects USD → converts to display currency.
              // So we must convert from INR to USD here.
              if (!isIndian) {
                const rate = usdInrRate + usdMarkup;
                if (rate > 0) result = result / rate;
              }
              break;
          }
          return result;
        };

        // Use the unified getSegmentMarginX which correctly falls back for Options without specific margin set
        const raw = getSegmentMarginX(forcedSession);
        const m = applyNettingFixed(raw, segmentSettings.marginCalcMode);
        if (m != null) return m;
      }
      
      // Fallback: full contract notional value (no leverage in netting mode).
      // When admin hasn't configured any margin mode, the user must have
      // the full contract value as margin. Leverage only applies in hedging.
      const isIndianFallback = isIndianInstrument(selectedSymbol);
      if (isIndianFallback) {
        const lotSize = selectedInstrument?.lotSize || 1;
        const qty = nettingVolumeIsShares ? vol : vol * lotSize;
        return qty * price;
      }
      const cs = getContractSize(selectedSymbol);
      return vol * cs * price;
    }

    // Hedging mode
    const cs = getContractSize(selectedSymbol);
    const notional = vol * cs * price;
    return notional * marginFactor;
  };

  // Handle order placement
  const handlePlaceOrder = async (forcedSide) => {
    const activeSide = typeof forcedSide === 'string' ? forcedSide : orderSide;

    if (isPlacingOrder) return;
    if (!lotOrderValidation.canSubmit) return;

    // Prop-only trading: block main-wallet orders. Users must select an
    // ACTIVE / FUNDED challenge before placing any trade — trades run on the
    // challenge's isolated virtual sub-wallet, never on User.wallet. Read
    // from React context first (authoritative, matches header chip) and
    // fall back to localStorage for legacy tabs where the context prop isn't
    // propagated yet.
    const activeChallengeAccountId =
      activeChallengeAccountIdFromContext ||
      localStorage.getItem('dhanfunded-active-challenge') ||
      null;
    if (!activeChallengeAccountId) {
      showNotification('Orders run on a challenge account, not your main wallet. Open My Challenges and start one.', 'error', 9000, 'No challenge selected');
      try { navigate('/app/my-challenges'); } catch (_) {}
      return;
    }
    // Re-sync in case context had the value but localStorage was out of sync
    // (different browser tab, refresh edge case, etc.).
    try { localStorage.setItem('dhanfunded-active-challenge', activeChallengeAccountId); } catch (_) {}

    try {
      setIsPlacingOrder(true);

      const marketStatus = checkMarketHours(selectedSymbol);
      if (!marketStatus.isOpen) {
        showNotification(`${selectedSymbol} is not tradable right now. ${marketStatus.reason}`, 'error', 8000, 'Market closed');
        setIsPlacingOrder(false);
        return;
      }

      // Skip client-side margin check for challenge accounts — the server's
      // challengePropEngine.openPosition() validates margin against the
      // challenge wallet's freeMargin using real segment settings. The
      // client-side check uses main-wallet balance which is irrelevant for
      // challenge trades. Server returns a clear error if margin is insufficient.
      if (!activeChallengeAccountId) {
        const requiredMargin = calculateRequiredMargin();
        const _balRate = usdInrRate + usdMarkup;
        const _isIndianSeg = tradingMode === 'netting' && resolvedSegmentApiName &&
          ['NSE_EQ','NSE_FUT','NSE_OPT','BSE_EQ','BSE_FUT','BSE_OPT','MCX_FUT','MCX_OPT'].includes(resolvedSegmentApiName);
        // Use balance (not equity/freeMargin) so available is stable and doesn't float with open P&L
        const balanceLocal = _isIndianSeg
          ? (walletData?.balance || 0) * _balRate
          : (walletData?.balance || 0);

        // Times mode: buying power = balance × X × leverage%
        // Margin = tradeValue / X, so check: marginRequired <= balance × (leverage/100)
        const _isTimesMode = tradingMode === 'netting' && segmentSettings?.marginCalcMode === 'times';
        const _timesX = _isTimesMode ? getSegmentMarginX() : 0;
        const effectiveAvailable = _isTimesMode && _timesX > 0
          ? balanceLocal * (leverage / 100)
          : balanceLocal;

        if (requiredMargin > effectiveAvailable) {
          const _cs = _isIndianSeg ? '₹' : '$';
          const fmtAvail = _isTimesMode && _timesX > 0
            ? `${_cs}${(balanceLocal * _timesX * (leverage / 100)).toLocaleString('en-IN', { maximumFractionDigits: 2 })} buying power (${leverage}% of ${_timesX}X)`
            : `${_cs}${balanceLocal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
          showNotification(`Need ${formatMargin(requiredMargin)}, you have ${fmtAvail}.`, 'error', 8000, 'Insufficient balance');
          setIsPlacingOrder(false);
          return;
        }
      }

      // Use spread-adjusted prices from selectedInstrument (what user sees = what they trade at)
      let currentBid = selectedInstrument.bid || 0;
      let currentAsk = selectedInstrument.ask || 0;

      if (!currentBid || !currentAsk || currentBid <= 0 || currentAsk <= 0) {
        showNotification(`No price feed for ${selectedSymbol} right now.`, 'error', 7000, 'No price data');
        setIsPlacingOrder(false);
        return;
      }

      const vol = parseFloat(volume) || (nettingVolumeIsShares ? 1 : 0.01);
      const minVol = nettingVolumeIsShares ? 1 : 0.01;
      if (nettingVolumeIsShares && Math.abs(vol - Math.round(vol)) > 1e-9) {
        showNotification('Quantity must be a whole number (minimum 1 share).', 'error', 6000, 'Invalid quantity');
        setIsPlacingOrder(false);
        return;
      }
      if (vol < minVol - 1e-9) {
        showNotification(
          nettingVolumeIsShares ? `Minimum quantity is ${minVol} shares` : `Minimum lot size is ${minVol}`,
          'error', 6000, 'Below minimum size'
        );
        setIsPlacingOrder(false);
        return;
      }

      const orderVolume =
        tradingMode === 'netting' && nettingVolumeIsShares ? Math.round(vol) : vol;

      let orderPayload;

      // Get exchange info for market timing validation
      let instrumentExchange = selectedInstrument?.exchange || null;
      let instrumentSegment = selectedInstrument?.segment || '';

      // Delta Exchange: tag DELTA + contract_type so NettingEngine maps to CRYPTO_PERPETUAL / CRYPTO_OPTIONS
      const isDeltaExchangeSymbol =
        selectedSymbol.startsWith('C-') ||
        selectedSymbol.startsWith('P-') ||
        selectedInstrument?.source === 'delta_exchange';

      if (isDeltaExchangeSymbol) {
        instrumentExchange = 'DELTA';
        instrumentSegment = selectedInstrument?.contract_type || 'perpetual_futures';
        console.log('[MarketPage] Delta Exchange → netting segment key:', instrumentSegment);
      } else if (!instrumentExchange && selectedInstrument?.category) {
        const cat = selectedInstrument.category.toLowerCase();
        if (cat.startsWith('nse')) instrumentExchange = 'NSE';
        else if (cat.startsWith('nfo') || cat.includes('fut') || cat.includes('opt')) instrumentExchange = 'NFO';
        else if (cat.startsWith('mcx')) instrumentExchange = 'MCX';
        else if (cat.startsWith('bse')) instrumentExchange = 'BSE';
        else if (cat.startsWith('bfo')) instrumentExchange = 'BFO';
        // Global MetaAPI segments — set explicit exchange so server uses correct segment settings
        else if (cat === 'forex' || cat === 'yen' || cat === 'forex_yen') instrumentExchange = 'FOREX';
        else if (cat === 'indices') instrumentExchange = 'INDICES';
        else if (cat === 'commodity' || cat === 'metals' || cat === 'energy') instrumentExchange = 'COMMODITIES';
        else if (cat === 'stocks') instrumentExchange = 'STOCKS';
        // crypto_perpetual: leave null — server uses inferDeltaExchangeSegment or explicit DELTA
      }
      // Also check watchlist category key for instruments without category on instrument object
      const categoryKey = Object.entries(instrumentsByCategory).find(([key, instruments]) =>
        instruments.some(i => i.symbol === selectedSymbol)
      )?.[0];
      if (!instrumentExchange && categoryKey && !isDeltaExchangeSymbol) {
        if (categoryKey.includes('MCX')) instrumentExchange = 'MCX';  // MCX before NSE/BSE to avoid COMMODITIES fallback
        else if (categoryKey.includes('NSE')) instrumentExchange = categoryKey.includes('FUT') || categoryKey.includes('OPT') ? 'NFO' : 'NSE';
        else if (categoryKey.includes('BSE')) instrumentExchange = categoryKey.includes('FUT') || categoryKey.includes('OPT') ? 'BFO' : 'BSE';
        else if (categoryKey === 'Forex') instrumentExchange = 'FOREX';
        else if (categoryKey === 'Indices') instrumentExchange = 'INDICES';
        else if (categoryKey === 'Commodities') instrumentExchange = 'COMMODITIES';
        else if (categoryKey === 'Stocks (International)') instrumentExchange = 'STOCKS';
        // Crypto Perpetual / Crypto Options: leave null (server handles via pattern/Delta inference)
      }
      
      // Final fallback: detect MCX symbols by pattern (GOLD, SILVER, ZINC, COPPER, CRUDE, etc.)
      if (!instrumentExchange && !isDeltaExchangeSymbol) {
        const mcxPatterns = ['GOLD', 'SILVER', 'ZINC', 'COPPER', 'CRUDE', 'NATURALGAS', 'ALUMINIUM', 'LEAD', 'NICKEL', 'COTTON', 'CRUDEOIL'];
        const symUpper = selectedSymbol.toUpperCase();
        if (mcxPatterns.some(p => symUpper.startsWith(p))) {
          instrumentExchange = 'MCX';
          console.log('[MarketPage] MCX symbol detected by pattern:', selectedSymbol);
        }
      }
      
      console.log('[MarketPage] Trade - symbol:', selectedSymbol, 'exchange:', instrumentExchange, 'segment:', instrumentSegment, 'category:', selectedInstrument?.category, 'categoryKey:', categoryKey);

      if (tradingMode === 'hedging') {
        orderPayload = {
          mode: 'hedging',
          userId: user?.oderId || user?.id || 'guest',
          symbol: selectedSymbol,
          orderType,
          side: activeSide,
          volume: vol,
          price: orderType === 'market' ? (activeSide === 'buy' ? currentAsk : currentBid) : orderType === 'limit' ? parseFloat(limitPrice) : parseFloat(stopPrice),
          stopLoss: stopLoss ? parseFloat(stopLoss) : null,
          takeProfit: takeProfit ? parseFloat(takeProfit) : null,
          leverage,
          isMarketOpen: true,
          exchange: instrumentExchange,
          segment: instrumentSegment,
          lotSize: selectedInstrument?.lotSize || getContractSize(selectedSymbol) || 1,
          quantity: (nettingVolumeIsShares ? vol : vol * (selectedInstrument?.lotSize || getContractSize(selectedSymbol) || 1)),
          marketData: { bid: currentBid, ask: currentAsk },
          spreadPreApplied: orderType === 'market'
        };
      } else if (tradingMode === 'netting') {
        // For netting mode, SL-M uses limitPrice field (Trigger Price input)
        const orderPrice = orderType === 'market'
          ? (activeSide === 'buy' ? currentAsk : currentBid)
          : parseFloat(limitPrice) || parseFloat(stopPrice);

        orderPayload = {
          mode: 'netting',
          userId: user?.oderId || user?.id || 'guest',
          symbol: selectedSymbol,
          orderType: orderType === 'slm' ? 'stop' : orderType, // Convert slm to stop for backend
          side: activeSide,
          volume: orderVolume,
          price: orderPrice,
          stopLoss: stopLoss ? parseFloat(stopLoss) : null,
          takeProfit: takeProfit ? parseFloat(takeProfit) : null,
          leverage, // Pass leverage for netting mode
          session: orderSession,
          isMarketOpen: true,
          exchange: instrumentExchange,
          segment: instrumentSegment,
          lotSize: selectedInstrument?.lotSize || getContractSize(selectedSymbol) || 1,
          quantity: (nettingVolumeIsShares ? vol : vol * (selectedInstrument?.lotSize || getContractSize(selectedSymbol) || 1)),
          marketData: { bid: currentBid, ask: currentAsk },
          spreadPreApplied: orderType === 'market'
        };
      } else if (tradingMode === 'binary') {
        // Convert INR to USD if user is trading in INR display mode
        const effectiveRate = usdInrRate + usdMarkup;
        const amountInUsd = displayCurrency === 'INR' ? binaryAmount / effectiveRate : binaryAmount;
        
        orderPayload = {
          mode: 'binary',
          userId: user?.oderId || user?.id || 'guest',
          symbol: selectedSymbol,
          direction: binaryDirection,
          amount: amountInUsd,
          expiry: binaryExpiry,
          entryPrice: currentBid,
          isMarketOpen: true,
          exchange: instrumentExchange,
          segment: instrumentSegment
        };
      }

      // Always tag the order with the active challenge account. The server
      // will route it to challengePropEngine (virtual sub-wallet) instead of
      // the main NettingEngine / HedgingEngine.
      orderPayload = { ...orderPayload, challengeAccountId: activeChallengeAccountId };

      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        tradingSounds.playError();
        const errMsg = result.error || result.message || `Order failed (${response.status})`;
        showNotification(errMsg, 'error', 8000, 'Order blocked');
        return;
      }

      if (result.success) {
        // Play trade executed sound
        tradingSounds.playTradeExecuted();
        
        fetchPositions();
        setLimitPrice('');
        setStopPrice('');
        setStopLoss('');
        setTakeProfit('');

        if (tradingMode === 'hedging' || tradingMode === 'netting') {
          const execUnit =
            tradingMode === 'netting' && isIndianCashEquitySegmentCode(resolvedSegmentApiName)
              ? 'shares'
              : 'lots';
          const isPendingOrder = orderType === 'limit' || orderType === 'stop' || orderType === 'slm';
          showNotification(
            `${orderSide.toUpperCase()} ${tradingMode === 'netting' && nettingVolumeIsShares ? orderVolume : vol} ${execUnit} ${selectedSymbol} @ ${orderPayload.price}`,
            isPendingOrder ? 'warning' : 'success',
            4000,
            isPendingOrder ? 'Pending Order Placed' : 'Order Executed'
          );
        } else if (tradingMode === 'binary') {
          const expiryText = binaryExpiry >= 3600 ? `${Math.floor(binaryExpiry / 3600)}h` : `${Math.floor(binaryExpiry / 60)}m`;
          showNotification(`${binaryDirection.toUpperCase()} ${displayCurrency === 'INR' ? '₹' : '$'}${binaryAmount} on ${selectedSymbol} - ${expiryText}`, 'success', 4000, 'Order Executed');
        }
      } else {
        tradingSounds.playError();
        const errMsg = result.error || result.message || 'Order was not accepted';
        showNotification(errMsg, 'error', 8000, 'Order blocked');
      }
    } catch (error) {
      showNotification(`Server error: ${error.message}`, 'error');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Check if symbol is Indian market (may not be available on free TradingView)
  const isIndianSymbol = useCallback((symbol) => {
    const inst = allInstruments.find(i => i.symbol === symbol);
    if (inst?.category?.startsWith('nse_') ||
        inst?.category?.startsWith('mcx_') ||
        inst?.category?.startsWith('bse_')) return true;
    // Fallback for symbols not present in `allInstruments` — e.g. the default
    // "NIFTY 50" index, or a freshly added F&O contract. Without this they were
    // misrouted to the metaapi chart feed and never auto-subscribed on Zerodha.
    // Mirrors the Indian-detection heuristic used elsewhere (agent.md §9):
    // index roots + CE/PE option suffix. No forex/crypto symbol matches these.
    const s = String(symbol || '').toUpperCase();
    return s.includes('NIFTY') || s.includes('SENSEX') || s.includes('BANKEX') ||
           s.endsWith('CE') || s.endsWith('PE');
  }, [allInstruments]);

  // Track if current symbol is Indian (for conditional rendering)
  const currentIsIndian = isIndianSymbol(selectedSymbol);

  /** lightweight-charts data backend: Zerodha / Meta market-data API / Delta history */
  const chartDataSource = useMemo(() => {
    if (!selectedSymbol) return 'metaapi';
    if (currentIsIndian) return 'zerodha';
    const inst = allInstruments.find((i) => i.symbol === selectedSymbol) || {};
    const symU = String(selectedSymbol).toUpperCase();
    const forexSix = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']);
    const isPerpetualFutures =
      symU.endsWith('USD') &&
      !symU.includes('/') &&
      !forexSix.has(symU) &&
      !symU.includes('XAU') &&
      !symU.includes('XAG');
    const isDeltaInstrument =
      inst.source === 'delta_exchange' ||
      (inst.symbol && (inst.symbol.startsWith('C-') || inst.symbol.startsWith('P-'))) ||
      !!inst.contract_type ||
      isPerpetualFutures;
    if (isDeltaInstrument) return 'delta';
    return 'metaapi';
  }, [selectedSymbol, currentIsIndian, allInstruments]);

  // Re-register Zerodha instrument when user selects a symbol (e.g. after admin cleared subscriptions/cache)
  useEffect(() => {
    if (!selectedSymbol || chartDataSource !== 'zerodha') return;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/zerodha/instruments/subscribe-by-symbol`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: selectedSymbol }),
          signal: ac.signal
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success !== false) {
          zerodhaRefreshStatus?.();
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          /* network / server down — chart may still load from historical if token resolves */
        }
      }
    })();
    return () => ac.abort();
  }, [selectedSymbol, chartDataSource, API_URL, zerodhaRefreshStatus]);

  // TradingView advanced chart handles its own widgets now

  // Get current price for a position (uses spread-adjusted prices from getInstrumentWithLivePrice)
  const getCurrentPrice = (pos) => {
    // Find the instrument and get spread-adjusted live price
    const staticInst = allInstruments.find(i => i.symbol === pos.symbol);
    if (staticInst) {
      const inst = getInstrumentWithLivePrice(staticInst);
      if (inst && (inst.bid > 0 || inst.ask > 0)) {
        // BUY closes at BID, SELL closes at ASK
        return pos.side === 'buy' ? inst.bid : inst.ask;
      }
    }
    // No live tick (e.g. option not currently in the terminal's feed) — use the
    // server's last-known mark (pos.currentPrice) so LTP + P/L match the Orders
    // page and the engine. Falling back to entryPrice made the terminal show
    // LTP = entry and P/L = -commission, disagreeing with every other view.
    return (Number(pos.currentPrice) > 0 ? pos.currentPrice : null) ?? pos.entryPrice ?? pos.avgPrice;
  };

  /** Same rules as row P/L — used to sum header total without mismatching UserLayout totalPnL. */
  const isIndianPositionPnl = (pos) => {
    const symbol = pos?.symbol || '';
    const posExchange = (pos?.exchange || '').toUpperCase();
    return posExchange === 'NSE' || posExchange === 'BSE' || posExchange === 'NFO' ||
      posExchange === 'BFO' || posExchange === 'MCX' ||
      symbol.includes('NIFTY') || symbol.includes('BANKNIFTY') || symbol.includes('SENSEX') ||
      symbol.includes('FINNIFTY') || symbol.endsWith('CE') || symbol.endsWith('PE') ||
      (!symbol.includes('/') && !symbol.includes('USD') && !symbol.includes('EUR') &&
       !symbol.includes('GBP') && !symbol.includes('JPY') && !symbol.includes('AUD') &&
       !symbol.includes('CAD') && !symbol.includes('CHF') && !symbol.includes('NZD') &&
       !symbol.includes('BTC') && !symbol.includes('ETH') && !symbol.includes('XAU') &&
       !symbol.includes('XAG') && !symbol.includes('US30') && !symbol.includes('US100') &&
       !symbol.includes('US500') && !symbol.includes('UK100'));
  };

  // Calculate profit for position (price P&L minus commission)
  const calculateProfit = (pos) => {
    const currentPrice = getCurrentPrice(pos);
    const entryPrice = pos.entryPrice || pos.avgPrice || 0;
    const priceDiff = pos.side === 'buy' ? currentPrice - entryPrice : entryPrice - currentPrice;
    const symbol = pos.symbol || '';

    let rawPnl = 0;
    if (isIndianPositionPnl(pos)) {
      // Use quantity (= lots × lotSize) directly — mirrors server NettingEngine P/L formula
      const quantity = pos.quantity || (pos.volume * (pos.lotSize || 1)) || 0;
      rawPnl = priceDiff * quantity;
    } else {
      // Forex/Crypto/Indices: contract size × lots
      const vol = pos.volume || 0;
      if (symbol.includes('JPY')) rawPnl = (priceDiff * 100000 * vol) / 100;
      else rawPnl = priceDiff * getContractSize(symbol) * vol;
    }

    // P/L is the raw price P&L — matches UserLayout totalPnL, the server's
    // stored pos.profit, and the Orders page. Commission is charged/shown
    // separately; netting it here made the terminal P/L disagree with every
    // other view by the commission amount.
    return rawPnl;
  };

  // Check if symbol is an Indian instrument
  // Only NSE, BSE, MCX instruments are Indian - everything else (Forex, Crypto, Indices, Stocks) is USD
  const isIndianInstrument = (symbol) => {
    const inst = allInstruments.find(i => i.symbol === symbol);
    // Check category first
    if (inst?.category?.startsWith('nse_') || inst?.category?.startsWith('mcx_') || inst?.category?.startsWith('bse_')) {
      return true;
    }
    // Check symbol patterns for Indian instruments
    return symbol && (
      symbol.includes('NIFTY') || symbol.includes('BANKNIFTY') || 
      symbol.includes('SENSEX') || symbol.includes('FINNIFTY') ||
      symbol.endsWith('FUT') || symbol.endsWith('OPT') ||
      symbol.includes('26') || symbol.includes('25') || // FnO expiry dates
      // Check for common Indian stock patterns (MCX, NSE EQ)
      (symbol.length <= 15 && !symbol.includes('/') && 
       !symbol.includes('USD') && !symbol.includes('EUR') && 
       !symbol.includes('GBP') && !symbol.includes('JPY') && 
       !symbol.includes('AUD') && !symbol.includes('CAD') && 
       !symbol.includes('CHF') && !symbol.includes('NZD') &&
       !symbol.includes('BTC') && !symbol.includes('ETH') &&
       !symbol.includes('XAU') && !symbol.includes('XAG') &&
       !symbol.includes('US30') && !symbol.includes('US100') && 
       !symbol.includes('US500') && !symbol.includes('UK100') &&
       !symbol.includes('DE30') && !symbol.includes('JP225') &&
       !symbol.includes('AAPL') && !symbol.includes('TSLA') &&
       !symbol.includes('GOOGL') && !symbol.includes('AMZN') &&
       !symbol.includes('META') && !symbol.includes('MSFT') &&
       !symbol.includes('NVDA') && !symbol.includes('NFLX'))
    );
  };

  // Format margin — same rules as P/L: Indian margin in INR, international in USD, converted for display toggle
  const formatMargin = (margin) => {
    const m = Number(margin) || 0;
    return `₹${m.toFixed(2)}`;
  };

  // Format P/L - handles both USD (Forex) and INR (Indian) instruments
  // Respects displayCurrency setting for all instruments
  const formatPnL = (profit, symbol = '') => {
    const sign = profit >= 0 ? '+' : '-';
    const rate = usdInrRate + usdMarkup;
    const isIndian = isIndianInstrument(symbol);
    
    if (isIndian) {
      // Indian instruments - profit is in INR
      if (displayCurrency === 'USD') {
        const usdValue = Math.abs(profit / rate);
        return `${sign}$${usdValue.toFixed(2)}`;
      }
      return `${sign}₹${Math.abs(profit).toFixed(2)}`;
    }
    
    // Forex/Crypto - profit is in USD
    if (displayCurrency === 'INR') {
      const inrValue = Math.abs(profit * rate);
      return `${sign}₹${inrValue.toFixed(2)}`;
    }
    return `${sign}$${Math.abs(profit).toFixed(2)}`;
  };

  // Floating P/L in display currency = sum of row P/L (same formula as table). Not context totalPnL — avoids price-source + FX timing mismatch.
  const rateHdr = (Number(usdInrRate) || 83) + (Number(usdMarkup) || 0);
  let marketHeaderFloatingPnL = 0;
  for (const pos of positions) {
    if (pos.status === 'closed') continue;
    if (pos.mode === 'binary') continue;
    const raw = calculateProfit(pos);
    if (isIndianPositionPnl(pos)) {
      marketHeaderFloatingPnL += displayCurrency === 'INR' ? raw : raw / rateHdr;
    } else {
      marketHeaderFloatingPnL += displayCurrency === 'INR' ? raw * rateHdr : raw;
    }
  }

  /** B / lot / S / chart row when One Click is on (matches legacy App.jsx market sidebar). */
  const renderOneClickActions = (symbol, opts = {}) => {
    if (!oneClickMode || !symbol) return null;
    const { showTrash = false, mobile = false } = opts;
    const busy = isOneClickSymbolBusy(symbol, oneClickPending);
    const openChart = (e) => {
      e.stopPropagation();
      if (mobile) openMobileInstrumentChartOnly(symbol, e);
      else addChartTab(symbol);
    };
    return (
      <div
        className="trading-actions"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...(busy ? { opacity: 0.92 } : {}),
          ...(mobile ? { paddingLeft: 8, paddingRight: 8, paddingBottom: 6 } : {})
        }}
        title={busy ? 'Order in progress…' : undefined}
      >
        {showTrash && (
          <button
            type="button"
            className="trash-btn"
            onClick={(e) => {
              e.stopPropagation();
              toggleWatchlist(symbol, e);
            }}
            aria-label="Remove from favourites"
          >
            🗑
          </button>
        )}
        <button
          type="button"
          className="buy-btn-small"
          style={getOneClickTradeButtonStyle(symbol, 'buy', oneClickPending)}
          onClick={() => handleExecuteOrder(symbol, 'buy')}
          disabled={busy}
        >
          B
        </button>
        <input
          type="text"
          className="lot-input"
          value={oneClickLotSize}
          disabled={busy}
          onChange={(e) => setOneClickLotSize(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="One-click lot size"
        />
        <button
          type="button"
          className="sell-btn-small"
          style={getOneClickTradeButtonStyle(symbol, 'sell', oneClickPending)}
          onClick={() => handleExecuteOrder(symbol, 'sell')}
          disabled={busy}
        >
          S
        </button>
        <button type="button" className="chart-btn-small" onClick={openChart} aria-label="Open chart">
          +
        </button>
      </div>
    );
  };

  // Filter instruments for mobile search
  const mobileFilteredInstruments = allInstruments.filter(inst => 
    inst && inst.symbol && (
      inst.symbol.toLowerCase().includes(mobileSearchQuery.toLowerCase()) ||
      (inst.name && inst.name.toLowerCase().includes(mobileSearchQuery.toLowerCase()))
    )
  ).slice(0, 20);

  const renderSegmentTabsGroup = () => (
    <div className="segment-tabs-scroll" style={{
      display: 'flex', gap: '8px', overflowX: 'auto', padding: '8px 12px',
      borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap',
      scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch'
    }}>
      <button 
        className={`filter-tab ${filterTab === 'FAVOURITES' ? 'active' : ''}`} 
        onClick={() => setFilterTab('FAVOURITES')}
        style={{ flexShrink: 0, padding: '6px 12px', borderRadius: '16px' }}
      >
        ★ Favourites
      </button>
      {visibleSegmentTabs.map(tab => (
        <button
          key={tab.key}
          className={`filter-tab ${filterTab === tab.key ? 'active' : ''}`}
          onClick={() => setFilterTab(tab.key)}
          style={{ flexShrink: 0, padding: '6px 12px', borderRadius: '16px' }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const renderSegmentTabContent = (isMobile = false) => {
    const listClass = isMobile ? 'mobile-instruments-list' : 'instruments-list';
    const rowClass = isMobile ? 'mobile-instrument-row' : 'instrument-row-detailed';

    if (filterTab === 'FAVOURITES') {
      return (
        <div className={listClass}>
          {watchlist.length > 0 ? watchlist.map(symbol => {
            let staticInst = allInstruments.find(i => i.symbol === symbol);
            if (!staticInst) {
              const brokerInst = getBrokerInstrument ? getBrokerInstrument(symbol) : null;
              if (brokerInst) {
                staticInst = { symbol: brokerInst.symbol, name: brokerInst.name, category: brokerInst.category };
              } else {
                const livePrice = livePrices?.[symbol];
                if (livePrice) staticInst = { symbol, name: symbol, category: 'other' };
                else return null;
              }
            }
            const inst = getInstrumentWithLivePrice(staticInst);
            const bid = inst.bid || 0;
            const ask = inst.ask || 0;
            const low = inst.low || 0;
            const high = inst.high || 0;
            const change = inst.change || 0;
            const expiry = staticInst.expiry || inst.expiry;

            if (isMobile) {
              return (
                <div
                  key={symbol}
                  className={`${rowClass} ${selectedSymbol === symbol ? 'selected' : ''}`}
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openMobileChartPanelBelow(symbol)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openMobileChartPanelBelow(symbol);
                      }
                    }}
                    style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                  >
                    <div className="inst-main">
                      <span className="inst-symbol">{symbol}</span>
                      <span className="inst-name">{inst.name || ''}</span>
                    </div>
                    <div className="inst-prices">
                      <span className="bid">{formatPrice(bid, symbol)}</span>
                      {inst.spreadAmount > 0 && <span className="spread-badge-sm" title="Spread">{inst.spreadAmount.toFixed(bid < 10 ? 4 : 2)}</span>}
                      <span className="ask">{formatPrice(ask, symbol)}</span>
                    </div>
                    <div className="mobile-instrument-row-actions">
                      <button type="button" className="mobile-row-chart-btn" onClick={(e) => openMobileInstrumentChartOnly(symbol, e)}><LuChartColumn size={16} /></button>
                      <button type="button" className="remove-fav-btn" onClick={(e) => { e.stopPropagation(); toggleWatchlist(symbol, e); }}><LuStar size={16} fill="currentColor" /></button>
                    </div>
                  </div>
                  {renderOneClickActions(symbol, { showTrash: true, mobile: true })}
                </div>
              );
            }

            return (
              <div key={symbol} className={`${rowClass} ${selectedSymbol === inst.symbol ? 'selected' : ''}`} onClick={() => addChartTab(inst.symbol)} style={{ borderLeft: '3px solid var(--border-color)', marginBottom: 2 }}>
                <div className="inst-top-row">
                  <div className="inst-left">
                    <span className="inst-symbol">{inst.symbol}</span>
                    <span className={`inst-change ${change >= 0 ? 'positive' : 'negative'}`}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                      {expiry && <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>Exp: {expiry}</span>}
                    </span>
                  </div>
                  <div className="inst-prices">
                    <div className="price-col bid">
                      <span className="price-value">{formatPrice(bid, inst.symbol)}</span>
                      <span className="price-label">L: {formatPrice(low, inst.symbol)}</span>
                    </div>
                    {inst.spreadAmount > 0 && <span className="spread-badge-sm" title="Spread">{inst.spreadAmount.toFixed(bid < 10 ? 4 : 2)}</span>}
                    <div className="price-col ask">
                      <span className="price-value">{formatPrice(ask, inst.symbol)}</span>
                      <span className="price-label">H: {formatPrice(high, inst.symbol)}</span>
                    </div>
                  </div>
                  <button className="remove-fav-btn" onClick={(e) => { e.stopPropagation(); toggleWatchlist(inst.symbol, e); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 16, cursor: 'pointer', padding: '4px 8px' }}>✕</button>
                </div>
                {renderOneClickActions(inst.symbol, { showTrash: true })}
              </div>
            );
          }) : <div className="no-favorites" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>No favourites added</div>}
        </div>
      );
    }

    // Otherwise, rendering a specific segment
    const actTab = visibleSegmentTabs.find(t => t.key === filterTab);
    if (!actTab) return <div className={listClass} />;

    const renderInst = (inst, idx) => {
      const pricedInst = getInstrumentWithLivePrice(inst) || inst;
      const bid = pricedInst.bid || pricedInst.mark_price || 0;
      const ask = pricedInst.ask || pricedInst.mark_price || 0;

      const isFav = isInWatchlist(inst.symbol);
      const showRemoveFromSegment = actTab.type === 'indian' || actTab.type === 'delta';

      return isMobile ? (
        <div
          key={inst.symbol + idx}
          className={`${rowClass} ${selectedSymbol === inst.symbol ? 'selected' : ''}`}
          style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => openMobileChartPanelBelow(inst.symbol)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openMobileChartPanelBelow(inst.symbol);
              }
            }}
            style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
          >
            <div className="inst-main"><span className="inst-symbol">{inst.symbol}</span><span className="inst-name">{inst.name}</span></div>
            <div className="inst-prices"><span className="bid">{bid > 0 ? formatPrice(bid, inst.symbol) : '-'}</span><span className="ask">{ask > 0 ? formatPrice(ask, inst.symbol) : '-'}</span></div>
            <div className="mobile-instrument-row-actions">
              <button type="button" className="mobile-row-chart-btn" onClick={(e) => openMobileInstrumentChartOnly(inst.symbol, e)}><LuChartColumn size={16} /></button>
              <button type="button" className={`add-fav-btn ${isFav ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleWatchlist(inst.symbol, e); }}><LuStar size={16} fill={isFav ? 'currentColor' : 'none'} /></button>
              {showRemoveFromSegment && (
                <button className="remove-fav-btn" onClick={(e) => { e.stopPropagation(); removeInstrumentFromCategory(inst.symbol, actTab.label); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 16, cursor: 'pointer', padding: '0 8px' }}>✕</button>
              )}
            </div>
          </div>
          {renderOneClickActions(inst.symbol, { showTrash: false, mobile: true })}
        </div>
      ) : (
        <div key={inst.symbol + idx} className={`${rowClass} ${selectedSymbol === inst.symbol ? 'selected' : ''}`} onClick={() => addChartTab(inst.symbol)}>
          <div className="inst-top-row">
            <div className="inst-left"><span className="inst-symbol">{inst.symbol}</span><span className="inst-name" style={{fontSize: 11, color: 'var(--text-secondary)'}}>{inst.name}</span></div>
            <div className="inst-prices">
              <div className="price-col bid"><span className="price-value">{bid > 0 ? formatPrice(bid, inst.symbol) : '-'}</span></div>
              <div className="price-col ask"><span className="price-value">{ask > 0 ? formatPrice(ask, inst.symbol) : '-'}</span></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button onClick={(e) => { e.stopPropagation(); toggleWatchlist(inst.symbol, e); }} style={{ background: 'transparent', border: 'none', color: isFav ? 'var(--accent-primary)' : 'var(--text-secondary)', fontSize: 16, cursor: 'pointer' }}>{isFav ? '★' : '☆'}</button>
              {showRemoveFromSegment && (
                <button className="remove-fav-btn" onClick={(e) => { e.stopPropagation(); removeInstrumentFromCategory(inst.symbol, actTab.label); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 14, cursor: 'pointer', padding: '0 4px', marginLeft: '4px' }}>✕</button>
              )}
            </div>
          </div>
          {renderOneClickActions(inst.symbol, { showTrash: false })}
        </div>
      );
    };

    return (
      <div className={listClass}>
        {actTab.type === 'indian' && (
          <div style={{ padding: '0' }}>
            {(visibleInstrumentsByCategory[actTab.label] || visibleInstrumentsByCategory[actTab.key] || [])
              .filter(i => !inlineIndianQuery || i.symbol.toLowerCase().includes(inlineIndianQuery.toLowerCase()))
              .map(renderInst)}

            {inlineIndianResults.length > 0 && <div style={{ padding: '4px 12px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>SEARCH RESULTS</div>}
            {inlineIndianResults.map(inst => {
              const isAlreadyAdded = (visibleInstrumentsByCategory[actTab.label] || visibleInstrumentsByCategory[actTab.key] || []).some(i => i.symbol === inst.symbol);
              return (
              <div key={inst.token} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{inst.symbol}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{inst.name} {inst.expiry && `• Exp: ${inst.expiry}`}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button disabled={isAlreadyAdded} onClick={() => { addZerodhaInstrument(inst, actTab.label); isMobile ? openMobileChartPanelBelow(inst.symbol) : addChartTab(inst.symbol); }} style={{ padding: '5px 12px', background: isAlreadyAdded ? 'var(--bg-secondary)' : 'var(--accent-primary, #2962ff)', color: isAlreadyAdded ? 'var(--text-secondary)' : '#ffffff', border: isAlreadyAdded ? '1px solid var(--border-color)' : 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: isAlreadyAdded ? 'default' : 'pointer', boxShadow: isAlreadyAdded ? 'none' : '0 1px 2px rgba(41,98,255,0.25)' }}>{isAlreadyAdded ? 'Added' : '+ Add'}</button>
                </div>
              </div>
            )})}
          </div>
        )}

        {actTab.type === 'international' && (
          <div style={{ padding: '0' }}>
            {brokerSearchModalVisibility.filterInternationalInstrumentList(getBrokerByCategory(actTab.key)).filter(i => !searchQuery || i.symbol.toLowerCase().includes(searchQuery.toLowerCase())).map(renderInst)}
          </div>
        )}

        {actTab.type === 'delta' && (
          <div style={{ padding: '0' }}>
            {(visibleInstrumentsByCategory[actTab.label] || visibleInstrumentsByCategory[actTab.key] || [])
              .filter(i => !inlineDeltaQuery || i.symbol.toLowerCase().includes(inlineDeltaQuery.toLowerCase()))
              .map(renderInst)}

            {inlineDeltaLoading ? <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div> : 
             (inlineDeltaResults.length > 0 && (
               <>
                 <div style={{ padding: '4px 12px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>SEARCH RESULTS</div>
                 {inlineDeltaResults.slice(0, 50).map((inst, idx) => {
                    const isAlreadyAdded = (visibleInstrumentsByCategory[actTab.label] || visibleInstrumentsByCategory[actTab.key] || []).some(i => i.symbol === inst.symbol);
                    return (
                    <div key={inst.symbol + idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{inst.symbol}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{inst.name}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button disabled={isAlreadyAdded} onClick={() => { addDeltaInstrumentToWatchlist(inst, actTab.label); isMobile ? openMobileChartPanelBelow(inst.symbol) : addChartTab(inst.symbol); }} style={{ padding: '5px 12px', background: isAlreadyAdded ? 'var(--bg-secondary)' : 'var(--accent-primary, #2962ff)', color: isAlreadyAdded ? 'var(--text-secondary)' : '#ffffff', border: isAlreadyAdded ? '1px solid var(--border-color)' : 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: isAlreadyAdded ? 'default' : 'pointer', boxShadow: isAlreadyAdded ? 'none' : '0 1px 2px rgba(41,98,255,0.25)' }}>{isAlreadyAdded ? 'Added' : '+ Add'}</button>
                      </div>
                    </div>
                 )})}
               </>
             ))
            }
          </div>
        )}
      </div>
    );
  };

  const renderDynamicTopSearchArea = (isMobile = false) => {
    if (filterTab === 'FAVOURITES') return null;
    const actTab = visibleSegmentTabs.find(t => t.key === filterTab);
    if (!actTab) return null;

    const baseStyle = isMobile 
      ? { display: 'flex', gap: '8px', margin: '10px 12px', padding: '0px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)' }
      : { display: 'flex', gap: '8px', padding: '10px 12px', borderBottom: '1px solid var(--border-color)' };

    if (actTab.type === 'indian') {
      return (
        <div style={baseStyle}>
          <input type="text" placeholder={`Search ${actTab.label} (e.g. RELIANCE)...`} value={inlineIndianQuery} onChange={e => setInlineIndianQuery(e.target.value)} onKeyPress={e => e.key === 'Enter' && performInlineIndianSearch(inlineIndianQuery, actTab.key)} style={{ flex: 1, padding: '8px 12px', border: isMobile ? 'none' : '1px solid var(--border-color)', borderRadius: '4px', background: isMobile ? 'transparent' : 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
          <button onClick={() => performInlineIndianSearch(inlineIndianQuery, actTab.key)} disabled={inlineIndianSearching || inlineIndianQuery.length < 2} style={{ padding: '8px 12px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', margin: isMobile ? '4px' : '0' }}>{inlineIndianSearching ? '...' : 'Search'}</button>
        </div>
      );
    }
    
    if (actTab.type === 'delta') {
      return (
        <div style={baseStyle}>
          <input type="text" placeholder={`Search ${actTab.label}...`} value={inlineDeltaQuery} onChange={e => { setInlineDeltaQuery(e.target.value); performInlineDeltaSearch(e.target.value, actTab.key); }} style={{ width: '100%', padding: '8px 12px', border: isMobile ? 'none' : '1px solid var(--border-color)', borderRadius: '4px', background: isMobile ? 'transparent' : 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
        </div>
      );
    }
    
    // International
    if (isMobile) {
      return (
        <div className="instruments-search-bar">
          <input type="text" placeholder="Search instruments..." value={mobileSearchQuery} onChange={(e) => setMobileSearchQuery(e.target.value)} />
        </div>
      );
    }
    
    return (
      <div className="search-box" style={{ display: 'flex', gap: 4 }}>
        <span className="search-icon">🔍</span>
        <input type="text" placeholder="Search eg: EUR/USD, BTC" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, border: 'none', color: 'var(--text-primary)' }} />
      </div>
    );
  };

  const renderOrderPanelContents = () => (
    <>
        <div className="order-header">
          <span className="order-symbol">{selectedSymbol} order</span>
        </div>

        <div className="trading-mode-tabs">
          {allowedTradeModes?.hedging && (
            // Hide Hedging for Indian instruments unless admin allows it
            (!isIndianMarketSymbol?.(selectedSymbol) || hedgingSettings?.allowIndianInstruments) && (
              <button className={`mode-tab ${tradingMode === 'hedging' ? 'active' : ''}`} onClick={() => setTradingMode('hedging')} title="Forex/Crypto - Multiple positions allowed"><LuRepeat size={14} /> Hedging</button>
            )
          )}
          {allowedTradeModes?.netting && (
            <button className={`mode-tab ${tradingMode === 'netting' ? 'active' : ''}`} onClick={() => setTradingMode('netting')} title="Indian market order"><LuChartColumn size={14} /> Market</button>
          )}
          {allowedTradeModes?.binary && (
            <button className={`mode-tab ${tradingMode === 'binary' ? 'active' : ''}`} onClick={() => setTradingMode('binary')} title="Time-based UP/DOWN positions"><LuTimer size={14} /> Binary</button>
          )}
        </div>

        {/* HEDGING MODE */}
        {tradingMode === 'hedging' && (
          <>
            <div
              className={isPlacingOrder ? 'order-panel-executing' : undefined}
              aria-busy={isPlacingOrder}
              title={isPlacingOrder ? 'Order in progress…' : undefined}
            >
            <div className="order-type-tabs">
              <button className={`type-tab ${orderType === 'market' ? 'active' : ''}`} onClick={() => setOrderType('market')}>Market</button>
              <button className={`type-tab ${orderType === 'limit' ? 'active' : ''}`} onClick={() => setOrderType('limit')}>Limit</button>
              <button className={`type-tab ${orderType === 'stop' ? 'active' : ''}`} onClick={() => setOrderType('stop')}>Stop</button>
            </div>
            <div className="price-buttons">
              <button className={`price-btn sell ${orderSide === 'sell' ? 'active' : ''}`} onClick={() => setOrderSide('sell')}>
                <span className="side-label">SELL</span>
                <span className="side-price" style={{ fontSize: getPriceFontSize(selectedInstrument.bid || 0, selectedSymbol) }}>{formatPrice(selectedInstrument.bid || 0, selectedSymbol)}</span>
              </button>
              <button className={`price-btn buy ${orderSide === 'buy' ? 'active' : ''}`} onClick={() => setOrderSide('buy')}>
                <span className="side-label">BUY</span>
                <span className="side-price" style={{ fontSize: getPriceFontSize(selectedInstrument.ask || 0, selectedSymbol) }}>{formatPrice(selectedInstrument.ask || 0, selectedSymbol)}</span>
              </button>
            </div>
            {orderType !== 'market' && (
              <div className="order-input-group">
                <label>{orderType === 'limit' ? 'Limit Price' : 'Stop Price'}</label>
                <input type="number" step="0.01" value={orderType === 'limit' ? limitPrice : stopPrice} onChange={(e) => orderType === 'limit' ? setLimitPrice(e.target.value) : setStopPrice(e.target.value)} placeholder={(entryPrice || 0).toFixed(2)} />
              </div>
            )}
            <div className="order-input-group">
              <label>Volume (Lots)</label>
              <div className="volume-control">
                <button type="button" onClick={() => setVolume(prev => { const v = Math.max(effectiveMinLot, parseFloat(((parseFloat(prev) || effectiveMinLot) - lotStep).toFixed(lotDecimals))); return wholeLotsOnly ? String(Math.round(v)) : String(parseFloat(v.toFixed(lotDecimals))); })}>−</button>
                <input type="text" inputMode="decimal" value={volume} onChange={(e) => { const val = e.target.value; if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) setVolume(val); }} onBlur={(e) => { const val = parseFloat(e.target.value); if (e.target.value !== '' && !Number.isNaN(val)) { const clamped = Math.min(effectiveMaxLot, Math.max(effectiveMinLot, val)); const snapped = wholeLotsOnly ? Math.round(clamped) : parseFloat(clamped.toFixed(lotDecimals)); setVolume(String(snapped)); } }} />
                <button type="button" onClick={() => setVolume(prev => { const v = Math.min(effectiveMaxLot, parseFloat(((parseFloat(prev) || effectiveMinLot) + lotStep).toFixed(lotDecimals))); return wholeLotsOnly ? String(Math.round(v)) : String(parseFloat(v.toFixed(lotDecimals))); })}>+</button>
              </div>
              <span className="volume-hint" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{(parseFloat(volume) || effectiveMinLot).toFixed(lotDecimals)} lots</span>
            </div>
            <div className="order-input-group">
              <div className="margin-info"><span>Required Margin: {formatMargin(marginRequired)}</span></div>
            </div>
            <div className="order-input-group sl-tp">
              <label>Stop Loss</label>
              <div className="sl-tp-row">
                <input type="number" step="0.01" value={stopLoss || calculateSlPrice()} onChange={(e) => setStopLoss(e.target.value)} />
                <div className="pips-control">
                  <button onClick={() => setSlPips(Math.max(0, slPips - 10))}>−</button>
                  <span>{slPips}p</span>
                  <button onClick={() => setSlPips(slPips + 10)}>+</button>
                </div>
              </div>
            </div>
            <div className="order-input-group sl-tp">
              <label>Take Profit</label>
              <div className="sl-tp-row">
                <input type="number" step="0.01" value={takeProfit || calculateTpPrice()} onChange={(e) => setTakeProfit(e.target.value)} />
                <div className="pips-control">
                  <button onClick={() => setTpPips(Math.max(0, tpPips - 10))}>−</button>
                  <span>{tpPips}p</span>
                  <button onClick={() => setTpPips(tpPips + 10)}>+</button>
                </div>
              </div>
            </div>
            </div>
            {!lotOrderValidation.valid && lotOrderValidation.messages.length > 0 && (
              <div className="order-validation-warn" role="alert">
                {lotOrderValidation.messages.map((m, i) => (
                  <div key={i}>{m}</div>
                ))}
              </div>
            )}
            <button
              className={`order-submit-btn ${orderSide} ${isPlacingOrder ? 'order-pending' : ''} ${!lotOrderValidation.canSubmit && !isPlacingOrder ? 'order-submit-invalid' : ''}`}
              onClick={handlePlaceOrder}
              disabled={isPlacingOrder || !lotOrderValidation.canSubmit}
              title={!lotOrderValidation.canSubmit && !isPlacingOrder ? lotOrderValidation.messages.join(' ') : undefined}
            >
              {orderSide === 'buy' ? 'Open BUY Position' : 'Open SELL Position'}
            </button>
          </>
        )}

        {/* NETTING MODE */}
        {tradingMode === 'netting' && (
          <>
            <div
              className={isPlacingOrder ? 'order-panel-executing' : undefined}
              aria-busy={isPlacingOrder}
              title={isPlacingOrder ? 'Order in progress…' : undefined}
            >
            {nettingSegmentBlockMessage && (
              <div className="order-validation-warn" role="alert" style={{ margin: '0 0 12px' }}>
                {nettingSegmentBlockMessage}
              </div>
            )}
            <div className="order-type-tabs">
              <button className={`type-tab ${orderType === 'market' ? 'active' : ''}`} onClick={() => setOrderType('market')}>Market</button>
              <button className={`type-tab ${orderType === 'limit' ? 'active' : ''}`} onClick={() => setOrderType('limit')}>Limit</button>
              <button className={`type-tab ${orderType === 'slm' ? 'active' : ''}`} onClick={() => setOrderType('slm')}>SL-M</button>
            </div>
            {/* Remove session tabs as requested */}
            <div className="price-buttons">
              <button className={`price-btn sell ${orderSide === 'sell' ? 'active' : ''}`} onClick={() => setOrderSide('sell')}>
                <span className="side-label">SELL</span>
                <span className="side-price" style={{ fontSize: getPriceFontSize(selectedInstrument.bid || 0, selectedSymbol) }}>{formatPrice(selectedInstrument.bid || 0, selectedSymbol)}</span>
              </button>
              <button className={`price-btn buy ${orderSide === 'buy' ? 'active' : ''}`} onClick={() => setOrderSide('buy')}>
                <span className="side-label">BUY</span>
                <span className="side-price" style={{ fontSize: getPriceFontSize(selectedInstrument.ask || 0, selectedSymbol) }}>{formatPrice(selectedInstrument.ask || 0, selectedSymbol)}</span>
              </button>
            </div>
            {orderType !== 'market' && (
              <div className="order-input-group">
                <label>
                  {orderType === 'limit' ? 'Limit Price' : 'Trigger Price'}
                </label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={limitPrice} 
                  onChange={(e) => setLimitPrice(e.target.value)} 
                  placeholder={(() => {
                    const price = entryPrice || 0;
                    if (orderType === 'limit') {
                      const band = getNettingLimitAwayOffset(price, segmentSettings);
                      if (!band) return formatPrice(price, selectedSymbol);
                      const suggestedPrice = orderSide === 'buy' ? price - band.away : price + band.away;
                      return formatPrice(suggestedPrice, selectedSymbol);
                    }
                    // SL-M / Stop: use same offset logic as limit
                    const band = getNettingStopSlmAwayOffset(price, segmentSettings);
                    if (!band) return formatPrice(price, selectedSymbol);
                    const suggestedPrice = orderSide === 'buy' ? price + band.away : price - band.away;
                    return formatPrice(suggestedPrice, selectedSymbol);
                  })()}
                />
                {(() => {
                  const price = entryPrice || 0;
                  if (orderType === 'limit') {
                    const band = getNettingLimitAwayOffset(price, segmentSettings);
                    if (!band) return null;
                    return (
                      <span style={{ fontSize: '10px', color: '#71717a', marginTop: '4px', display: 'block' }}>
                        {orderSide === 'buy'
                          ? `Between ${formatPrice(price - band.away, selectedSymbol)} and market (${band.detail})`
                          : `Between market and ${formatPrice(price + band.away, selectedSymbol)} (${band.detail})`}
                      </span>
                    );
                  }
                  // SL-M / Stop: show "Between" hint like limit
                  const band = getNettingStopSlmAwayOffset(price, segmentSettings);
                  if (!band) return null;
                  return (
                    <span style={{ fontSize: '10px', color: '#71717a', marginTop: '4px', display: 'block' }}>
                      {orderSide === 'buy'
                        ? `Between market and ${formatPrice(price + band.away, selectedSymbol)} (${band.detail})`
                        : `Between ${formatPrice(price - band.away, selectedSymbol)} and market (${band.detail})`}
                    </span>
                  );
                })()}
              </div>
            )}
            <div className="order-input-group">
              <label>{volumeFieldLabel}</label>
              <div className="volume-control">
                <button
                  type="button"
                  onClick={() =>
                    setVolume((prev) => {
                      const cur = parseFloat(prev) || (nettingVolumeIsShares ? 1 : effectiveMinLot);
                      if (nettingVolumeIsShares) {
                        return String(Math.max(1, Math.round(cur) - 1));
                      }
                      { const v = Math.max(effectiveMinLot, parseFloat((cur - lotStep).toFixed(lotDecimals))); return wholeLotsOnly ? String(Math.round(v)) : String(parseFloat(v.toFixed(lotDecimals))); }
                    })
                  }
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode={nettingVolumeIsShares ? 'numeric' : 'decimal'}
                  value={volume}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (nettingVolumeIsShares) {
                      if (val === '' || /^\d+$/.test(val)) setVolume(val);
                      return;
                    }
                    if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) setVolume(val);
                  }}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (e.target.value === '' || Number.isNaN(val)) return;
                    if (nettingVolumeIsShares) {
                      setVolume(String(Math.max(1, Math.round(val))));
                      return;
                    }
                    const clamped = Math.min(effectiveMaxLot, Math.max(effectiveMinLot, val));
                    const snapped = wholeLotsOnly ? Math.round(clamped) : parseFloat(clamped.toFixed(lotDecimals));
                    setVolume(String(snapped));
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setVolume((prev) => {
                      const cur = parseFloat(prev) || (nettingVolumeIsShares ? 1 : effectiveMinLot);
                      if (nettingVolumeIsShares) {
                        return String(Math.round(cur) + 1);
                      }
                      { const v = Math.min(effectiveMaxLot, parseFloat((cur + lotStep).toFixed(lotDecimals))); return wholeLotsOnly ? String(Math.round(v)) : String(parseFloat(v.toFixed(lotDecimals))); }
                    })
                  }
                >
                  +
                </button>
              </div>
              <span className="volume-hint">
                {nettingVolumeIsShares
                  ? `${Math.round(parseFloat(volume) || 1)} ${volumeUnitPlural}`
                  : `${(parseFloat(volume) || effectiveMinLot).toFixed(lotDecimals)} ${volumeUnitPlural}`}
              </span>
              {/* F&O / indices: show exchange contract size (lots mode). Cash equity: lot size = shares per lot when applicable */}
              {Number(selectedInstrument?.lotSize) > 1 && (
                <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  1 lot = {selectedInstrument.lotSize} ·{' '}
                  {nettingVolumeIsShares
                    ? `${Math.round((parseFloat(volume) || 1) * selectedInstrument.lotSize)} qty`
                    : `${(parseFloat(volume) || 0) * selectedInstrument.lotSize} qty`}
                </div>
              )}
            </div>
            {['NSE_OPT', 'BSE_OPT', 'MCX_OPT'].includes(resolvedSegmentApiName) &&
              segmentSettings &&
              (() => {
                let strikePx = selectedInstrument?.strike || 0;
                const um = selectedSymbol.match(/^([A-Z]+)/i);
                const undSym = um ? um[1] : '';
                if (!strikePx) {
                  const symU = selectedSymbol.toUpperCase();
                  const rest = symU.replace(/^[A-Z]+/, '');
                  if (rest.length >= 7) {
                    const afterDate = rest.substring(5);
                    const sm = afterDate.match(/^(\d+)([CP]E)$/);
                    if (sm) strikePx = parseInt(sm[1], 10);
                  }
                }
                const undPx = resolveIndianUnderlyingLtp(undSym, getTickBySymbolAuto, livePrices);
                const hasRule =
                  (segmentSettings.buyingStrikeFar > 0 ||
                    segmentSettings.buyingStrikeFarPercent > 0 ||
                    segmentSettings.sellingStrikeFar > 0 ||
                    segmentSettings.sellingStrikeFarPercent > 0);
                if (!hasRule) return null;
                const band =
                  undPx > 0 && strikePx > 0
                    ? getOptionsStrikeMaxDistance(undPx, segmentSettings, orderSide)
                    : null;
                const dist =
                  undPx > 0 && strikePx > 0 ? Math.abs(strikePx - undPx) : null;
                return (
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#a1a1aa',
                      marginBottom: '10px',
                      padding: '8px 10px',
                      background: 'rgba(39, 39, 42, 0.6)',
                      borderRadius: '6px',
                      lineHeight: 1.45
                    }}
                  >
                    <strong style={{ color: '#e4e4e7' }}>Strike vs underlying (index)</strong>
                    <span style={{ display: 'block', marginTop: 2, fontSize: '10px', color: '#71717a' }}>
                      Uses option <strong style={{ color: '#a1a1aa' }}>strike</strong> ({strikePx || '—'}) vs{' '}
                      <strong style={{ color: '#a1a1aa' }}>underlying LTP</strong> — not the option premium (chart price).
                    </span>
                    {band && dist != null ? (
                      <>
                        {' '}
                        Strike {strikePx}, underlying ~{undPx.toFixed(2)}, |Δ|={dist.toFixed(0)}. Max for{' '}
                        {orderSide} ({band.detail}): {band.max.toFixed(2)}.
                        {dist > band.max ? (
                          <span style={{ color: '#f87171', display: 'block', marginTop: 4 }}>
                            Outside allowed band (server will reject).
                          </span>
                        ) : (
                          <span style={{ color: '#86efac', display: 'block', marginTop: 4 }}>
                            Within allowed band.
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ display: 'block', marginTop: 4 }}>
                        Underlying LTP not loaded — admin must subscribe{' '}
                        <strong style={{ color: '#e4e4e7' }}>
                          {OPTION_ROOT_TO_INDEX_TICKER[undSym?.toUpperCase()] || undSym || 'index'}
                        </strong>{' '}
                        (or the current-month future) in Zerodha settings so % strike limits can run.
                        Until then the server may skip the rule.
                      </span>
                    )}
                  </div>
                );
              })()}
            {/* TP / SL — always-open, side-by-side (green / red), like the
                reference ticket. Small placement hint under each. */}
            <div className="order-input-group sl-tp" style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ color: '#16a34a', fontWeight: 700, display: 'block', marginBottom: 4 }}>TP</label>
                <input
                  type="number" step="0.01" value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  placeholder="Target"
                  style={{ width: '100%', border: '1px solid rgba(22,163,74,0.45)', background: 'rgba(22,163,74,0.05)' }}
                />
                {(() => {
                  const ref = entryPrice || 0;
                  if (!(ref > 0)) return null;
                  const band = getNettingStopSlmAwayOffset(ref, segmentSettings);
                  const limit = band ? (orderSide === 'buy' ? ref + band.away : ref - band.away) : ref;
                  return (
                    <span style={{ fontSize: '10px', color: '#71717a', marginTop: '3px', display: 'block' }}>
                      {orderSide === 'buy' ? '≥ ' : '≤ '}{formatPrice(limit, selectedSymbol)}
                    </span>
                  );
                })()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ color: '#ef4444', fontWeight: 700, display: 'block', marginBottom: 4 }}>SL</label>
                <input
                  type="number" step="0.01" value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="Stop"
                  style={{ width: '100%', border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.05)' }}
                />
                {(() => {
                  const ref = entryPrice || 0;
                  if (!(ref > 0)) return null;
                  const band = getNettingStopSlmAwayOffset(ref, segmentSettings);
                  const limit = band ? (orderSide === 'buy' ? ref - band.away : ref + band.away) : ref;
                  return (
                    <span style={{ fontSize: '10px', color: '#71717a', marginTop: '3px', display: 'block' }}>
                      {orderSide === 'buy' ? '≤ ' : '≥ '}{formatPrice(limit, selectedSymbol)}
                    </span>
                  );
                })()}
              </div>
            </div>
            {/* Leverage UI removed — margin is admin-configured per segment.
                Leverage variable stays at default 100 internally for margin math. */}
            {/* Single clean "Margin required" line (reference-ticket style).
                calculateRequiredMargin('intraday') already accounts for expiry-day
                margin, so the value stays correct without the extra breakdown. */}
            <div className="trading-charges">
              <div className="charge-row" style={{ fontSize: '14px', padding: '2px 0' }}>
                <span style={{ fontWeight: 600 }}>Margin required</span>
                <span style={{ color: '#3b82f6', fontWeight: '700' }}>{formatMargin(calculateRequiredMargin('intraday'))}</span>
              </div>
            </div>
            </div>
            {!lotOrderValidation.valid && lotOrderValidation.messages.length > 0 && (
              <div className="order-validation-warn" role="alert">
                {lotOrderValidation.messages.map((m, i) => (
                  <div key={i}>{m}</div>
                ))}
              </div>
            )}
            <button
              className={`order-submit-btn ${orderSide} ${isPlacingOrder ? 'order-pending' : ''} ${!lotOrderValidation.canSubmit && !isPlacingOrder ? 'order-submit-invalid' : ''}`}
              onClick={handlePlaceOrder}
              disabled={isPlacingOrder || !lotOrderValidation.canSubmit}
              title={!lotOrderValidation.canSubmit && !isPlacingOrder ? lotOrderValidation.messages.join(' ') : undefined}
            >
              <>
                {orderSide === 'buy' ? 'BUY' : 'SELL'}{' '}
                {nettingVolumeIsShares ? Math.round(volumeNum) : volumeNum.toFixed(lotDecimals)} {volumeUnitPlural}
              </>
            </button>
          </>
        )}

        {/* BINARY MODE */}
        {tradingMode === 'binary' && (
          <>
            <div
              className={isPlacingOrder ? 'order-panel-executing' : undefined}
              aria-busy={isPlacingOrder}
              title={isPlacingOrder ? 'Order in progress…' : undefined}
            >
            <div className="binary-price-display">
              <span className="current-price-label">Current Price</span>
              <span className="current-price-value">{formatPrice(selectedInstrument.bid || 0, selectedSymbol)}</span>
            </div>
            <div className="binary-direction-buttons">
              <button className={`binary-btn up ${binaryDirection === 'up' ? 'active' : ''}`} onClick={() => setBinaryDirection('up')}>
                <span className="arrow">▲</span>
                <span>UP</span>
              </button>
              <button className={`binary-btn down ${binaryDirection === 'down' ? 'active' : ''}`} onClick={() => setBinaryDirection('down')}>
                <span className="arrow">▼</span>
                <span>DOWN</span>
              </button>
            </div>
            <div className="order-input-group">
              <label>
                Order Amount ({displayCurrency === 'INR' ? '₹' : '$'}) — limits ₹{binaryStakeMeta.minInr}–₹
                {binaryStakeMeta.maxInr}
              </label>
              <div className="volume-control">
                <button
                  type="button"
                  onClick={() => setBinaryAmount((a) => clampBinaryStakeDisplay(a - binaryStakeMeta.stepDisp))}
                >
                  −
                </button>
                <input
                  type="number"
                  min={binaryStakeMeta.minDisp}
                  max={binaryStakeMeta.maxDisp}
                  step={displayCurrency === 'INR' ? 1 : 'any'}
                  value={binaryAmount}
                  onChange={(e) => {
                    const raw = displayCurrency === 'INR' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                    if (!Number.isFinite(raw)) {
                      setBinaryAmount(clampBinaryStakeDisplay(binaryStakeMeta.minDisp));
                      return;
                    }
                    setBinaryAmount(clampBinaryStakeDisplay(raw));
                  }}
                />
                <button
                  type="button"
                  onClick={() => setBinaryAmount((a) => clampBinaryStakeDisplay(a + binaryStakeMeta.stepDisp))}
                >
                  +
                </button>
              </div>
            </div>
            <div className="order-input-group">
              <label>Expiry Time</label>
              <div className="expiry-selector">
                <div className="expiry-quick-options">
                  {(binarySettings?.allowedExpiries || [60, 300, 900, 3600]).map(expiry => {
                    // Format expiry label
                    let label;
                    if (expiry >= 86400) label = `${Math.floor(expiry / 86400)}d`;
                    else if (expiry >= 3600) label = `${Math.floor(expiry / 3600)}h`;
                    else if (expiry >= 60) label = `${Math.floor(expiry / 60)}m`;
                    else label = `${expiry}s`;
                    return (
                      <button 
                        key={expiry}
                        className={`expiry-btn ${binaryExpiry === expiry ? 'active' : ''}`} 
                        onClick={() => setBinaryExpiry(expiry)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="binary-payout-info">
              <div className="payout-row"><span>If you win:</span><span className="win-amount">+{displayCurrency === 'INR' ? '₹' : '$'}{(binaryAmount * (binarySettings?.payoutPercent || 85) / 100).toFixed(2)}</span></div>
              <div className="payout-row"><span>If you lose:</span><span className="lose-amount">-{displayCurrency === 'INR' ? '₹' : '$'}{binaryAmount.toFixed(2)}</span></div>
            </div>
            </div>
            {!lotOrderValidation.canSubmit && lotOrderValidation.messages.length > 0 && (
              <div className="order-validation-msgs" style={{ marginBottom: 8, fontSize: 12, color: 'var(--error, #ef4444)' }}>
                {lotOrderValidation.messages.map((m, i) => (
                  <div key={i}>{m}</div>
                ))}
              </div>
            )}
            <button
              className={`order-submit-btn binary ${binaryDirection} ${isPlacingOrder ? 'order-pending' : ''} ${!lotOrderValidation.canSubmit && !isPlacingOrder ? 'order-submit-invalid' : ''}`}
              onClick={handlePlaceOrder}
              disabled={isPlacingOrder || !lotOrderValidation.canSubmit}
              title={!lotOrderValidation.canSubmit && !isPlacingOrder ? lotOrderValidation.messages.join(' ') : undefined}
            >
              <>Place {binaryDirection.toUpperCase()} - {displayCurrency === 'INR' ? '₹' : '$'}{binaryAmount}</>
            </button>
            <div className="binary-timer-info">
              <span>Position expires in {binaryExpiry >= 3600 ? `${Math.floor(binaryExpiry / 3600)}h ${Math.floor((binaryExpiry % 3600) / 60)}m` : `${Math.floor(binaryExpiry / 60)}m ${binaryExpiry % 60}s`}</span>
            </div>
          </>
        )}

        <div className="order-summary">
          {tradingMode === 'hedging' && <span>{volumeNum.toFixed(lotDecimals)} lots @ {formatPrice(entryPrice, selectedSymbol)}</span>}
          {tradingMode === 'netting' && (
            <span>
              {nettingVolumeIsShares ? volumeNum : volumeNum.toFixed(lotDecimals)} {volumeUnitPlural} @{' '}
              {formatPrice(entryPrice, selectedSymbol)} ({orderSession})
            </span>
          )}
          {tradingMode === 'binary' && <span>{displayCurrency === 'INR' ? '₹' : '$'}{binaryAmount} on {binaryDirection.toUpperCase()} - {binaryExpiry >= 3600 ? `${Math.floor(binaryExpiry / 3600)}h` : `${Math.floor(binaryExpiry / 60)}m`} expiry</span>}
        </div>
    </>
  );

  const openMobileChartPanelBelow = (symbol) => {
    addChartTab(symbol);
    setMobileMarketTab('instruments');
    setMobileShowChartBelow(true);
  };

  const openMobileInstrumentChartOnly = (symbol, e) => {
    e?.stopPropagation();
    addChartTab(symbol);
    setMobileMarketTab('chart');
    setMobileShowChartBelow(false);
  };

  return (
    <div className="market-page-root">
      {/* Mobile Market Tabs — Symbols tab removed per request; users pick
          instruments via the option-chain modal (top-bar + button) instead. */}
      <div className="mobile-market-tabs">
        <button
          className={`mobile-market-tab ${mobileMarketTab === 'chart' ? 'active' : ''}`}
          onClick={() => {
            setMobileMarketTab('chart');
            setMobileShowChartBelow(false);
          }}
        >
          <span className="tab-icon"><LuChartColumn size={14} /></span>
          <span>Chart</span>
        </button>
        <button
          className={`mobile-market-tab ${mobileMarketTab === 'history' ? 'active' : ''}`}
          onClick={() => {
            setMobileMarketTab('history');
            setMobileShowChartBelow(false);
          }}
        >
          <span className="tab-icon">📋</span>
          <span>Positions</span>
        </button>
      </div>
      
      {/* Mobile Instruments Section */}
      <div className={`market-section instruments-section ${mobileMarketTab === 'instruments' ? 'active' : ''}`}>
        <div className="mobile-instruments-content">
          {renderDynamicTopSearchArea(true)}
          {renderSegmentTabsGroup()}
          {renderSegmentTabContent(true)}
        </div>
        {mobileShowChartBelow && (
          <div className="mobile-chart-below">
            <div className="mobile-chart-below-head">
              <span className="mobile-chart-below-title">
                Order
                <strong>{selectedSymbol}</strong>
              </span>
              <button
                type="button"
                className="mobile-chart-below-close"
                onClick={() => setMobileShowChartBelow(false)}
                aria-label="Close order panel"
              >
                <LuX size={18} />
              </button>
            </div>
            <div className="order-panel mobile-order-embedded mobi-order-compact">
              {renderOrderPanelContents()}
            </div>
          </div>
        )}
      </div>

      {/* Instruments Panel removed per request — challenge view uses the
          option-chain modal (top-bar + button) for symbol selection now. */}

      {/* Positions / Pending / Closed as cards, left of the chart. Desktop only
          (hidden <=768px, where the mobile Positions tab shows the same cards).
          All actions reuse the handlers the bottom table already uses. */}
      <PositionsSidePanel
        positions={scopedPositions}
        pending={scopedPendingOrders}
        closed={scopedTradeHistory}
        calculateProfit={calculateProfit}
        getCurrentPrice={getCurrentPrice}
        formatPrice={formatPrice}
        formatPnL={formatPnL}
        onExit={(pos) => handleClosePosition(pos, pos.volume)}
        onEditSlTp={openEditModal}
        onCancel={handleCancelPendingOrder}
      />

      {/* Mobile: this wrapper only participates in layout on Chart tab; otherwise it stole 50% height while children were display:none */}
      <div className={`market-main-area${mobileMarketTab === 'chart' ? ' mobile-market-main-active' : ''}`}>
      {/* Chart Section - wrapped for mobile tabs */}
      <div className={`market-section chart-section ${mobileMarketTab === 'chart' ? 'active' : ''}`}>
        <div className="chart-tabs-bar">
          <div className="chart-tabs">
            {chartTabs.map(symbol => (
              <div key={symbol} className={`chart-tab ${selectedSymbol === symbol ? 'active' : ''}`} onClick={() => setSelectedSymbol(symbol)}>
                <span>{symbol}</span>
                {chartTabs.length > 1 && <button className="close-tab" onClick={(e) => removeChartTab(symbol, e)}>×</button>}
              </div>
            ))}
            {/* Add-tab button lives INSIDE .chart-tabs so it sits right after
                the last chart tab instead of being floated to the far right. */}
            <button
              type="button"
              className="add-tab"
              title="Add instrument to chart"
              aria-label="Add instrument to chart"
              onClick={() => setPickerOpen(true)}
            >
              +
            </button>
          </div>
          {/* Named entry point to the same picker the + opens. It sits outside
              .chart-tabs, so it stays pinned at the right however many tabs are
              open — the tab strip scrolls, this does not. */}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            title="Open option chain"
            style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 28, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid rgba(31,216,122,0.55)', background: 'rgba(31,216,122,0.12)',
              color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap'
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 13 }}>&#9776;</span>
            Option Chain
          </button>
        </div>
        <div className="chart-container" ref={chartContainerRef}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}>
            {selectedInstrument && (
              <TVChartContainer
                symbol={selectedSymbol}
                dataSource={chartDataSource}
                theme={isDark ? 'Dark' : 'Light'}
                livePriceObj={selectedInstrument}
                positions={scopedPositions}
                orderSide={orderSide}
                isMobile={mobileMarketTab === 'chart'}
                volume={volume}
                onVolumeChange={setVolume}
                onBuyClick={() => {
                  setOrderSide('buy');
                  handlePlaceOrder('buy');
                }}
                onSellClick={() => {
                  setOrderSide('sell');
                  handlePlaceOrder('sell');
                }}
                onClosePosition={(pos, vol) => handleClosePosition(pos, vol)}
              />
            )}
          </div>
        </div>
        {/* Mobile Buy/Sell quick-action bar at bottom of chart */}
        <div className="mobi-chart-action-bar">
          <button
            type="button"
            className="mobi-chart-expand-handle"
            aria-label="Open full order panel"
            onClick={() => setMobileOrderSheetOpen(true)}
            onTouchStart={(e) => {
              const startY = e.touches[0].clientY;
              const handleMove = (ev) => {
                const dy = startY - ev.touches[0].clientY;
                if (dy > 30) {
                  setMobileOrderSheetOpen(true);
                  window.removeEventListener('touchmove', handleMove);
                  window.removeEventListener('touchend', handleEnd);
                }
              };
              const handleEnd = () => {
                window.removeEventListener('touchmove', handleMove);
                window.removeEventListener('touchend', handleEnd);
              };
              window.addEventListener('touchmove', handleMove, { passive: true });
              window.addEventListener('touchend', handleEnd);
            }}
          >
            <span className="mobi-chart-expand-bar" />
          </button>
          <button
            type="button"
            className="mobi-chart-sell-btn"
            onClick={() => {
              setOrderSide('sell');
              handlePlaceOrder('sell');
            }}
          >
            <span className="mobi-chart-action-label">SELL</span>
            <span className="mobi-chart-action-price">
              {formatPrice(selectedInstrument?.bid || 0, selectedSymbol)}
            </span>
          </button>
          <div className="mobi-chart-lot-wrap">
            <span className="mobi-chart-lot-label">Lots</span>
            <input
              type="text"
              inputMode="decimal"
              className="mobi-chart-lot-input"
              value={volume}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) setVolume(val);
              }}
              onBlur={(e) => {
                const parsed = parseFloat(e.target.value);
                if (e.target.value !== '' && !Number.isNaN(parsed)) {
                  const clamped = Math.min(effectiveMaxLot, Math.max(effectiveMinLot, parsed));
                  const snapped = wholeLotsOnly ? Math.round(clamped) : clamped;
                  setVolume(String(snapped));
                }
              }}
            />
          </div>
          <button
            type="button"
            className="mobi-chart-buy-btn"
            onClick={() => {
              setOrderSide('buy');
              handlePlaceOrder('buy');
            }}
          >
            <span className="mobi-chart-action-label">BUY</span>
            <span className="mobi-chart-action-price">
              {formatPrice(selectedInstrument?.ask || 0, selectedSymbol)}
            </span>
          </button>
        </div>

        {/* Mobile full-order-panel bottom sheet (opens on swipe-up or handle tap) */}
        {mobileOrderSheetOpen && (
          <>
            <div
              className="mobi-order-sheet-overlay"
              onClick={() => setMobileOrderSheetOpen(false)}
            />
            <div className="mobi-order-sheet" role="dialog">
              <div className="mobi-order-sheet-header">
                <span className="mobi-order-sheet-handle" aria-hidden />
                <button
                  type="button"
                  className="mobi-order-sheet-close"
                  aria-label="Close order panel"
                  onClick={() => setMobileOrderSheetOpen(false)}
                >
                  <LuX size={18} />
                </button>
              </div>
              <div className="mobi-order-sheet-body order-panel mobi-order-compact">
                {renderOrderPanelContents()}
              </div>
            </div>
          </>
        )}

      </div>

      {/* Edit Modal */}
      {/* Per-fill SL/TP Edit Modal (Phase 2 / Batch 2) */}
      {legEditModalOpen && legBeingEdited && (() => {
        // Resolve the reference price + segment settings for the band hint.
        // Reference price = parent position's currentPrice (live tick) → fall
        // back to the leg's own entry if the position hasn't ticked yet.
        // Segment settings: resolveSegForSymbol tries the in-scope value
        // first (for the currently-selected symbol), then the on-demand
        // cache populated by fetchSegSettingsForSymbol when the modal opened.
        // Returns null only if the fetch hasn't resolved yet OR no segment
        // matched — in which case the hint degrades to direction-only.
        const legSymbol = legBeingEdited.symbol;
        const legSide = legBeingEdited.side;
        const refPrice = Number(legEditParentPos?.currentPrice) > 0
          ? Number(legEditParentPos.currentPrice)
          : Number(legBeingEdited.entryPrice) || 0;
        const segForHint = resolveSegForSymbol(legSymbol);
        return (
          <div className="modal-overlay" onClick={closeLegEditModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Edit Active Position SL/TP</h3>
                <button className="modal-close" onClick={closeLegEditModal}>×</button>
              </div>
              <div className="modal-body">
                <div className="position-info">
                  <span className={`side-badge ${legBeingEdited.side}`}>{(legBeingEdited.side || '').toUpperCase()}</span>
                  <span className="symbol">{legBeingEdited.symbol}</span>
                  <span className="volume">{Number(legBeingEdited.volume).toFixed(2)} lots @ {Number(legBeingEdited.entryPrice).toFixed(4)}</span>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
                  Per-fill SL/TP is independent of the parent position's SL/TP.
                  When this leg's SL or TP is hit, only this fill closes —
                  realized PnL uses this fill's own entry, not the position avg.
                </div>
                <div className="modal-input-group">
                  <label>Stop Loss</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={legEditSL}
                    onChange={(e) => setLegEditSL(e.target.value)}
                    placeholder="Leave empty to clear"
                  />
                  {renderSLTPModalHint(legSide, refPrice, segForHint, 'sl', legSymbol)}
                </div>
                <div className="modal-input-group">
                  <label>Take Profit</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={legEditTP}
                    onChange={(e) => setLegEditTP(e.target.value)}
                    placeholder="Leave empty to clear"
                  />
                  {renderSLTPModalHint(legSide, refPrice, segForHint, 'tp', legSymbol)}
                </div>
              </div>
              <div className="modal-footer">
                <button className="modal-btn cancel" onClick={closeLegEditModal}>Cancel</button>
                <button className="modal-btn confirm" onClick={saveLegSLTP}>Save</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Per-leg close confirm modal (Fix 19b). Replaces window.confirm with
          a styled modal that mirrors the parent close-modal-pro look. No
          partial slider, no Close All — just confirm/cancel for closing
          this single fill. */}
      {legCloseConfirmOpen && legCloseConfirmLeg && (() => {
        const leg = legCloseConfirmLeg;
        const parent = legCloseConfirmParent;
        const isShares = parent?.mode === 'netting' &&
          isIndianCashEquitySegmentCode(resolveSegmentApiName(leg.symbol, parent || leg));
        const unitLabel = isShares ? 'shares' : 'lots';
        const legVol = Number(leg.volume) || 0;
        const legEntry = Number(leg.entryPrice) || 0;
        return (
          <div className="modal-overlay" onClick={closeLegConfirmModal}>
            <div className="modal-content close-modal-pro" onClick={e => e.stopPropagation()}>
              <div className="close-modal-header">
                <div className="close-position-badge">
                  <span className={`side-indicator ${leg.side}`}>{(leg.side || '').toUpperCase()}</span>
                  <span className="close-symbol">{leg.symbol}</span>
                  <span className="close-volume">{legVol.toFixed(2)} {unitLabel}</span>
                </div>
                <button className="modal-close" onClick={closeLegConfirmModal}>×</button>
              </div>
              <div className="close-modal-body">
                <div style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  marginBottom: 12,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: '#9ca3af'
                }}>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#6b7280' }}>Fill entry:</span>{' '}
                    <span style={{ color: '#e4e4e7', fontWeight: 600 }}>{formatPrice(legEntry, leg.symbol)}</span>
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#6b7280' }}>Close price:</span>{' '}
                    <span style={{ color: '#e4e4e7', fontWeight: 600 }}>{formatPrice(legCloseConfirmPrice, leg.symbol)}</span>
                  </div>
                  <div style={{ marginTop: 8, color: '#71717a' }}>
                    Realized P/L will use this fill's own entry — not the parent position average. The parent's avg recomputes after close.
                  </div>
                </div>
                <div className="close-actions-row">
                  <button
                    className="close-action-btn primary"
                    onClick={confirmLegClose}
                    disabled={legCloseConfirmBusy}
                    style={legCloseConfirmBusy ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                  >
                    {legCloseConfirmBusy ? 'Closing…' : 'Close Fill'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showEditModal && selectedPosition && (() => {
        // Resolve reference price + segment settings for the parent SL/TP hint.
        // refPrice = position's currentPrice (live tick) → falls back to entry/avg.
        // segForHint comes from resolveSegForSymbol — uses in-scope settings
        // when the position symbol matches the order panel, else the cache
        // populated by the modal-open useEffect above.
        const editRefPrice = Number(selectedPosition.currentPrice) > 0
          ? Number(selectedPosition.currentPrice)
          : Number(selectedPosition.entryPrice || selectedPosition.avgPrice) || 0;
        const editSegForHint = resolveSegForSymbol(selectedPosition.symbol);
        const editSide = selectedPosition.side;
        const editSymbol = selectedPosition.symbol;
        return (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>✏️ {selectedPosition.status === 'pending' ? 'Modify Pending Order' : 'Modify Position'}</h3>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="position-info">
                  <span className={`side-badge ${selectedPosition.side}`}>{selectedPosition.side?.toUpperCase()}</span>
                  <span className="symbol">{selectedPosition.symbol}</span>
                  <span className="volume">
                    {selectedPosition.volume}{' '}
                    {selectedPosition.mode === 'netting' &&
                    isIndianCashEquitySegmentCode(
                      resolveSegmentApiName(selectedPosition.symbol, selectedPosition)
                    )
                      ? 'shares'
                      : 'lots'}
                  </span>
                  {selectedPosition.status === 'pending' && <span className="order-type-badge">{selectedPosition.orderType?.toUpperCase()}</span>}
                </div>
                {selectedPosition.status === 'pending' && (
                  <div className="modal-input-group">
                    <label>Order Price</label>
                    <input type="number" step="0.00001" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="Enter order price" />
                  </div>
                )}
                <div className="modal-input-group">
                  <label>Stop Loss</label>
                  <input type="number" step="0.00001" value={editSL} onChange={(e) => setEditSL(e.target.value)} placeholder="Enter stop loss price" />
                  {renderSLTPModalHint(editSide, editRefPrice, editSegForHint, 'sl', editSymbol)}
                </div>
                <div className="modal-input-group">
                  <label>Take Profit</label>
                  <input type="number" step="0.00001" value={editTP} onChange={(e) => setEditTP(e.target.value)} placeholder="Enter take profit price" />
                  {renderSLTPModalHint(editSide, editRefPrice, editSegForHint, 'tp', editSymbol)}
                </div>
              </div>
              <div className="modal-footer">
                <button className="modal-btn cancel" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button className="modal-btn confirm" onClick={handleModifyPosition}>Save Changes</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Close Modal */}
      {showCloseModal && selectedPosition && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="modal-content close-modal-pro" onClick={e => e.stopPropagation()}>
            <div className="close-modal-header">
              <div className="close-position-badge">
                <span className={`side-indicator ${selectedPosition.side}`}>{selectedPosition.side?.toUpperCase()}</span>
                <span className="close-symbol">{selectedPosition.symbol}</span>
                <span className="close-volume">
                  {selectedPosition.volume}{' '}
                  {selectedPosition.mode === 'netting' &&
                  isIndianCashEquitySegmentCode(
                    resolveSegmentApiName(selectedPosition.symbol, selectedPosition)
                  )
                    ? 'shares'
                    : 'lots'}
                </span>
              </div>
              <button className="modal-close" onClick={() => setShowCloseModal(false)}>×</button>
            </div>
            <div className="close-modal-body">
              <div className="close-actions-row">
                <button className="close-action-btn primary" onClick={() => handleClosePosition(selectedPosition, selectedPosition.volume)}>Close Position</button>
                <button className="close-action-btn secondary" onClick={async () => {
                  // Direct close — no extra confirm popup (the user already opened
                  // this close modal, so the second confirm was redundant).
                  setShowCloseModal(false);
                  for (const pos of scopedPositions) { await handleClosePosition(pos, pos.volume); }
                }}>Close All</button>
              </div>
              <div className="partial-section">
                <div className="partial-header">Partial Close</div>
                <div className="partial-input-row">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selectedPosition.volume}
                    value={closeVolume}
                    onChange={(e) => setCloseVolume(e.target.value)}
                    placeholder={
                      selectedPosition.mode === 'netting' &&
                      isIndianCashEquitySegmentCode(
                        resolveSegmentApiName(selectedPosition.symbol, selectedPosition)
                      )
                        ? 'Quantity'
                        : 'Volume'
                    }
                  />
                  <button className="partial-close-btn" onClick={() => handleClosePosition(selectedPosition, parseFloat(closeVolume))}>Close</button>
                </div>
                <div className="partial-presets">
                  {(() => {
                    // Partial-close preset. For whole-lot instruments (options /
                    // index — total volume is an integer) the result must also be
                    // a whole lot: round to the NEAREST lot (7 × 50% → 4, not 3.5),
                    // clamped to at least 1 and never above the total. Fractional-lot
                    // instruments (e.g. 0.50-lot forex) keep the 2-decimal behaviour.
                    const preset = (pct) => {
                      const v = Number(selectedPosition.volume) || 0;
                      const raw = v * pct;
                      return Number.isInteger(v)
                        ? Math.min(v, Math.max(1, Math.round(raw)))
                        : Number(raw.toFixed(2));
                    };
                    return (
                      <>
                        <button onClick={() => setCloseVolume(preset(0.25))}>25%</button>
                        <button onClick={() => setCloseVolume(preset(0.5))}>50%</button>
                        <button onClick={() => setCloseVolume(preset(0.75))}>75%</button>
                        <button className="active" onClick={() => setCloseVolume(selectedPosition.volume)}>100%</button>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Panel — desktop: side panel; hidden on mobile (order form embeds under Symbols) */}
      <div className="market-section trade-section desktop-market-trade-section">
      <div className="order-panel">
          {renderOrderPanelContents()}
      </div>
      </div>
      </div>

      {/* History Section for mobile - Positions/Orders */}
      <div className={`market-section history-section ${mobileMarketTab === 'history' ? 'active' : ''}`}>
        <div className="mobile-positions-wrapper">
          <div className="positions-header">
            <h3>Open Positions ({scopedPositions.length})</h3>
            <span className={`total-pnl ${marketHeaderFloatingPnL >= 0 ? 'profit' : 'loss'}`}>
              {marketHeaderFloatingPnL >= 0 ? '+' : '-'}₹{Math.abs(marketHeaderFloatingPnL).toFixed(2)}
            </span>
          </div>
          {scopedPositions.length === 0 ? (
            <div className="no-positions">No open positions on this challenge</div>
          ) : (
            <div className="positions-list-mobile">
              {scopedPositions.map(pos => {
                const openPrice = pos.openPrice || pos.entryPrice || pos.avgPrice || 0;
                const vol = pos.volume || pos.lots || 0;
                const profit = calculateProfit(pos) || 0;
                const mobUnit =
                  pos.mode === 'netting' &&
                  isIndianCashEquitySegmentCode(resolveSegmentApiName(pos.symbol, pos))
                    ? 'shares'
                    : 'lots';
                const ltp = getCurrentPrice(pos);
                const comm = Number(pos.commissionInr || pos.commission || pos.openCommission || 0);
                const pnlColor = profit >= 0 ? '#10b981' : '#ef4444';
                const rowS = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginTop: 5 };
                const lblS = { color: 'var(--text-secondary, #94a3b8)' };
                const actBtn = (c) => ({ flex: 1, padding: '9px 0', fontSize: 12.5, fontWeight: 700, borderRadius: 9, background: `${c}14`, color: c, border: `1px solid ${c}55`, cursor: 'pointer' });
                return (
                  <div key={pos.positionId || pos._id || pos.symbol} className="position-card-mobile">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`pos-side ${pos.side || 'buy'}`}>{(pos.side || 'BUY').toUpperCase()}</span>
                      <span className="pos-symbol" style={{ flex: 1, fontWeight: 700 }}>{pos.symbol}</span>
                      <span style={{ fontWeight: 800, fontSize: 15, color: pnlColor }}>{formatPnL(profit, pos.symbol)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary, #94a3b8)', marginTop: 4 }}>
                      {vol} {mobUnit}{pos.openTime ? ` · ${new Date(pos.openTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </div>
                    <div style={{ height: 1, background: 'var(--border-color, #e5e7eb)', margin: '8px 0' }} />
                    <div style={rowS}><span style={lblS}>Entry</span><span style={{ fontWeight: 700 }}>{formatPrice(openPrice, pos.symbol)}</span></div>
                    <div style={rowS}><span style={lblS}>LTP</span><span style={{ fontWeight: 700, color: pnlColor }}>{formatPrice(ltp, pos.symbol)}</span></div>
                    <div style={rowS}><span style={lblS}>Commission</span><span style={{ fontWeight: 700 }}>₹{comm.toFixed(2)}</span></div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                      <button style={actBtn('#10b981')} onClick={(e) => { e.stopPropagation(); openEditModal(pos); }}>
                        {pos.takeProfit ? `TP ${formatPrice(pos.takeProfit, pos.symbol)}` : '＋ TP'}
                      </button>
                      <button style={actBtn('#f59e0b')} onClick={(e) => { e.stopPropagation(); openEditModal(pos); }}>
                        {pos.stopLoss ? `SL ${formatPrice(pos.stopLoss, pos.symbol)}` : '＋ SL'}
                      </button>
                      <button style={actBtn('#ef4444')} onClick={(e) => { e.stopPropagation(); handleClosePosition(pos, pos.volume); }}>
                        ↪ Exit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <InstrumentPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(symbol, inst) => {
          // When available, register the instrument in the user's local
          // categories AND explicitly subscribe it on the server. Without
          // this, chart tabs open for option symbols that aren't in
          // allInstruments yet, so the chart can't find metadata (lotSize,
          // tickSize, etc.) and renders blank. addZerodhaInstrument
          // handles both: server subscribe + local category push +
          // addChartTab.
          if (inst && inst.token) {
            try {
              // Map Zerodha segment → addInstrumentToCategory key.
              const t = String(inst.instrumentType || '').toUpperCase();
              const exch = String(inst.exchange || '').toUpperCase();
              let segKey = 'nseEq';
              if (exch === 'NFO') segKey = (t === 'FUT') ? 'nseFut' : 'nseOpt';
              else if (exch === 'BFO') segKey = (t === 'FUT') ? 'bseFut' : 'bseOpt';
              else if (exch === 'MCX') segKey = (t === 'FUT') ? 'mcxFut' : 'mcxOpt';
              else if (exch === 'BSE') segKey = 'bseEq';
              else if (exch === 'NSE') segKey = 'nseEq';
              addZerodhaInstrument(inst, segKey);
              return;
            } catch (_) {
              // Fall through to plain addChartTab on any unexpected shape.
            }
          }
          addChartTab(symbol);
        }}
        apiUrl={API_URL}
        getInstrumentWithLivePrice={getInstrumentWithLivePrice}
        zerodhaTicks={zerodhaTicks}
        getTickBySymbolAuto={getTickBySymbolAuto}
      />

    </div>
  );
}

export default MarketPage;
