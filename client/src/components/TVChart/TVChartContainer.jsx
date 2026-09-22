import React, { useEffect, useRef, useState, useCallback } from 'react';
import Datafeed from './datafeed';

/*
 * Chart layout persistence — indicators, drawings, interval, chart type.
 *
 * The widget used to point at TradingView's PUBLIC demo storage server under
 * one shared user_id ('public_user') and never called save or load, while
 * `use_localstorage_for_settings` was disabled. Net effect: every refresh, and
 * every trip from the terminal to the dashboard and back, rebuilt a blank
 * chart. The layout now lives in this browser: saved on every change
 * (onAutoSaveNeeded) and on unmount, handed back as `saved_data` on the next
 * build. Bump the key's version if the stored shape ever needs discarding.
 */
const LAYOUT_KEY = 'pf-tv-layout-v1';
function readSavedLayout() {
    try {
        const raw = localStorage.getItem(LAYOUT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}
function saveLayout(widget) {
    try {
        widget.save((state) => {
            try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(state)); } catch { /* quota / blocked */ }
        });
    } catch { /* widget already torn down */ }
}

/**
 * Serialising the whole layout is a synchronous JSON.stringify plus a
 * localStorage write on the main thread. The chart asks for it after every
 * change — and dragging a drawing is a change on every mouse-move — so it has
 * to be collapsed into one write after the user stops, or the drawing tool
 * stutters against its own autosave.
 */
/**
 * True while the user has something selected on the chart — a drawing they
 * just made, or one they clicked to edit or delete.
 *
 * Anything we write into the drawing layer at that moment can clear their
 * selection, and a cleared selection is a Delete key that does nothing and a
 * floating toolbar that keeps disappearing. Our own markers can always wait.
 */
function userIsHoldingSomething(chart) {
  try {
    const selection = chart?.selection?.();
    if (!selection || typeof selection.allSources !== 'function') return false;
    return selection.allSources().length > 0;
  } catch {
    // Older library builds have no selection API — assume free.
    return false;
  }
}

let saveTimer = null;
function saveLayoutSoon(widget) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveLayout(widget), 2000);
}

const TVChartContainer = ({
    symbol,
    dataSource = 'zerodha',
    theme = 'Light',
    livePriceObj,
    positions = [],
    orderSide = 'buy',
    onBuyClick,
    onSellClick,
    onClosePosition,
    isMobile = false,
    volume,
    onVolumeChange,
}) => {
    const chartContainerRef = useRef(null);
    const tvWidgetRef = useRef(null);
    // Tracks the symbol the live widget currently shows, so a symbol change can
    // call setSymbol() on the existing widget instead of destroying + rebuilding
    // it (a full rebuild took ~1-2s on every switch — the "chart opens slow").
    const currentSymbolRef = useRef(null);
    const [widgetReady, setWidgetReady] = useState(false);
    const positionLinesRef = useRef({});
    // Track text shape IDs + their prices so we can reposition on scroll
    const textShapeMapRef = useRef({}); // { shapeId: { price } }
    const rangeSubRef = useRef(null);
    const repositionIntervalRef = useRef(null);
    // LTP line refs
    const ltpLineRef = useRef(null);
    const ltpLabelRef = useRef(null);
    /** Shape of the open positions the lines were last built from. */
    const positionSigRef = useRef('');
    /** Last price the LTP shapes were moved to — skips no-op chart mutations. */
    const lastLtpRef = useRef(null);
    /** When they were last moved, so a busy tape cannot churn the layer. */
    const lastLtpAtRef = useRef(0);
    /** Prevents stacked LTP shapes when live ticks race async createShape */
    const ltpSetupGenRef = useRef(0);

    // Refs to hold latest callback props (avoids stale closure in TradingView listeners)
    const onBuyClickRef = useRef(onBuyClick);
    const onSellClickRef = useRef(onSellClick);
    const onClosePositionRef = useRef(onClosePosition);
    const onVolumeChangeRef = useRef(onVolumeChange);
    // Ref to the volume input element inside the TV header (so we can sync the value)
    const volumeInputRef = useRef(null);

    // Keep refs in sync with latest props
    useEffect(() => { onBuyClickRef.current = onBuyClick; }, [onBuyClick]);
    useEffect(() => { onSellClickRef.current = onSellClick; }, [onSellClick]);
    useEffect(() => { onClosePositionRef.current = onClosePosition; }, [onClosePosition]);
    useEffect(() => { onVolumeChangeRef.current = onVolumeChange; }, [onVolumeChange]);

    // Sync external volume prop changes into the input element (avoids caret jump)
    useEffect(() => {
        if (volumeInputRef.current && volumeInputRef.current.value !== String(volume ?? '')) {
            volumeInputRef.current.value = String(volume ?? '');
        }
    }, [volume]);

    // Initialize TV Widget
    useEffect(() => {
        if (!chartContainerRef.current) return;
        setWidgetReady(false);

        const encodedSymbol = `${dataSource}|${symbol}`;
        const savedLayout = readSavedLayout();

        const widgetOptions = {
            symbol: encodedSymbol,
            datafeed: Datafeed,
            interval: '5',
            container: chartContainerRef.current,
            library_path: '/charting_library/',
            locale: 'en',
            timezone: 'Asia/Kolkata',
            disabled_features: [
                'use_localstorage_for_settings',
                'header_symbol_search',
                'header_compare',
                'display_market_status',
                // keep control_bar ENABLED so bottom zoom (+/−/scroll/reset) is visible
                'timeframes_toolbar',
            ],
            enabled_features: [
                'study_templates',
                'hide_left_toolbar_by_default',
                'items_favoriting',
                'show_exchange_logos',
            ],
            // Restore the user's last layout (see readSavedLayout above).
            ...(savedLayout ? { saved_data: savedLayout } : {}),
            // Seconds the library waits after a change before asking us to save. At 1
            // it fired constantly while drawing; the write itself is debounced too.
            auto_save_delay: 5,
            fullscreen: false,
            autosize: true,
            theme: theme,
            // Pure black/white background — Fix 16. The TradingView default
            // dark theme uses #131722 (a very dark blue-grey); product wanted
            // pure #000000 in dark mode. Light mode stays #ffffff. Both the
            // candle pane AND the price/time axis backgrounds are overridden
            // so the entire chart surface is one solid color.
            toolbar_bg: theme === 'Dark' ? '#000000' : '#ffffff',
            overrides: {
                'paneProperties.background': theme === 'Dark' ? '#000000' : '#ffffff',
                'paneProperties.backgroundType': 'solid',
                // Faint grid lines that read on the new pure-black/white panes.
                'paneProperties.vertGridProperties.color': theme === 'Dark' ? '#1a1a1a' : '#e6e6e6',
                'paneProperties.horzGridProperties.color': theme === 'Dark' ? '#1a1a1a' : '#e6e6e6',
                // Price/time scale backgrounds — without these the axis gutters
                // keep the TradingView default and look mismatched against
                // the pure-black/white pane.
                'scalesProperties.backgroundColor': theme === 'Dark' ? '#000000' : '#ffffff',
                'scalesProperties.lineColor': theme === 'Dark' ? '#1a1a1a' : '#e6e6e6',
                'scalesProperties.textColor': theme === 'Dark' ? '#d1d4dc' : '#363a45',
            },
        };

        const widget = new window.TradingView.widget(widgetOptions);
        tvWidgetRef.current = widget;

        widget.onChartReady(() => {
            setWidgetReady(true);
            currentSymbolRef.current = encodedSymbol;

            try {
                const chart = widget.activeChart();
                // A restored layout brings back the symbol it was saved on —
                // the instrument the terminal has selected now wins.
                if (savedLayout && chart.symbol() !== encodedSymbol) chart.setSymbol(encodedSymbol);
                // It also carries the colours of the theme it was saved in;
                // re-assert the current theme's so dark/light stays correct.
                if (savedLayout) widget.applyOverrides(widgetOptions.overrides);
            } catch (_) { /* older library build */ }

            // Persist on every change: indicator added, drawing moved, interval…
            try { widget.subscribe('onAutoSaveNeeded', () => saveLayoutSoon(widget)); } catch (_) {}

            // Force IST timezone — the constructor option may not always take effect.
            try {
                widget.activeChart().getTimezoneApi().setTimezone('Asia/Kolkata');
            } catch (_) { /* v31+ only */ }

            if (!isMobile) {
                widget.headerReady().then(() => {
                    const buyBtn = widget.createButton();
                    buyBtn.setAttribute('title', 'Quick Buy');
                    buyBtn.innerHTML = '<div style="color:#22c55e;font-weight:bold;padding:0 8px;cursor:pointer;">Buy</div>';
                    buyBtn.addEventListener('click', () => { if (onBuyClickRef.current) onBuyClickRef.current('buy'); });

                    // Lot size input between Buy and Sell
                    const lotBtn = widget.createButton();
                    lotBtn.setAttribute('title', 'Lot size');
                    const lotLabel = document.createElement('span');
                    lotLabel.textContent = 'Lots:';
                    lotLabel.style.cssText = 'color:#9ca3af;font-size:12px;font-weight:600;padding-right:6px;';
                    const lotInput = document.createElement('input');
                    lotInput.type = 'text';
                    lotInput.inputMode = 'decimal';
                    lotInput.value = String(volume ?? '1');
                    lotInput.style.cssText = 'width:56px;padding:3px 6px;border:1px solid rgba(255,255,255,0.15);border-radius:4px;background:rgba(255,255,255,0.04);color:#fff;font-size:12px;font-weight:600;text-align:center;outline:none;';
                    lotInput.addEventListener('click', (e) => e.stopPropagation());
                    lotInput.addEventListener('mousedown', (e) => e.stopPropagation());
                    lotInput.addEventListener('input', (e) => {
                        const val = e.target.value;
                        if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                            if (onVolumeChangeRef.current) onVolumeChangeRef.current(val);
                        }
                    });
                    lotInput.addEventListener('blur', (e) => {
                        const parsed = parseFloat(e.target.value);
                        if (e.target.value !== '' && !Number.isNaN(parsed) && onVolumeChangeRef.current) {
                            onVolumeChangeRef.current(String(parsed));
                        }
                    });
                    volumeInputRef.current = lotInput;
                    lotBtn.innerHTML = '';
                    lotBtn.style.cssText = 'display:flex;align-items:center;padding:0 8px;';
                    lotBtn.appendChild(lotLabel);
                    lotBtn.appendChild(lotInput);

                    const sellBtn = widget.createButton();
                    sellBtn.setAttribute('title', 'Quick Sell');
                    sellBtn.innerHTML = '<div style="color:#ef4444;font-weight:bold;padding:0 8px;cursor:pointer;">Sell</div>';
                    sellBtn.addEventListener('click', () => { if (onSellClickRef.current) onSellClickRef.current('sell'); });
                });
            }

            // Subscribe to visible range changes to keep text boxes pinned to left edge
            try {
                const chart = widget.activeChart();
                const sub = chart.onVisibleRangeChanged();
                sub.subscribe(null, (range) => {
                    repositionTextShapes(range);
                });
                rangeSubRef.current = sub;

                // Backup for the cases the event misses. It used to run every 300 ms and
                // move the label whether or not anything had changed, which kept the
                // chart mutating under the user's cursor. Now it only acts on a range
                // that actually moved, and far less often.
                let lastRangeKey = '';
                repositionIntervalRef.current = setInterval(() => {
                    try {
                        const r = chart.getVisibleRange();
                        if (!r) return;
                        const key = `${r.from}|${r.to}`;
                        if (key === lastRangeKey) return;
                        lastRangeKey = key;
                        repositionTextShapes(r);
                    } catch {}
                }, 2000);
            } catch {}

            updatePositionsLines(positions);
        });

        return () => {
            ltpSetupGenRef.current += 1;
            ltpLineRef.current = null;
            ltpLabelRef.current = null;
            if (repositionIntervalRef.current) clearInterval(repositionIntervalRef.current);
            if (rangeSubRef.current) {
                try { rangeSubRef.current.unsubscribe(null); } catch {}
            }
            if (tvWidgetRef.current) {
                // Capture the very latest state — leaving the terminal right
                // after adding an indicator must not lose it.
                saveLayout(tvWidgetRef.current);
                tvWidgetRef.current.remove();
                tvWidgetRef.current = null;
            }
            currentSymbolRef.current = null;
        };
        // Rebuild the widget ONLY on theme change (or mount). Symbol/dataSource
        // changes are handled by the lightweight setSymbol effect below, so
        // switching instruments no longer tears down and reloads the whole
        // TradingView widget. `symbol`/`dataSource` are intentionally omitted.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [theme]);

    // Fast symbol switch: drive the existing widget with setSymbol() instead of
    // recreating it. Falls back to a rebuild only if the widget isn't ready.
    useEffect(() => {
        if (!widgetReady || !tvWidgetRef.current) return;
        const encodedSymbol = `${dataSource}|${symbol}`;
        if (currentSymbolRef.current === encodedSymbol) return;
        try {
            const chart = tvWidgetRef.current.activeChart();
            chart.setSymbol(encodedSymbol, () => {
                currentSymbolRef.current = encodedSymbol;
            });
        } catch (_) { /* widget not ready yet — the create effect will catch up */ }
    }, [symbol, dataSource, widgetReady]);

    // Reposition all text shape boxes to the current left edge of the visible range
    const repositionTextShapes = useCallback((range) => {
        if (!tvWidgetRef.current) return;
        let chart;
        try { chart = tvWidgetRef.current.activeChart(); } catch { return; }
        if (userIsHoldingSomething(chart)) return;

        const leftTime = range?.from;
        if (!leftTime) return;

        // Add offset so the label sits clearly inside the visible area (not at the very edge)
        const totalRange = (range?.to || leftTime + 600) - leftTime;
        const offsetTime = leftTime + Math.max(5, totalRange * 0.02);

        for (const [shapeId, info] of Object.entries(textShapeMapRef.current)) {
            try {
                const shapeApi = chart.getShapeById(shapeId);
                if (shapeApi) {
                    shapeApi.setPoints([{ time: offsetTime, price: info.price }]);
                }
            } catch {}
        }
    }, []);

    // Sync price side
    useEffect(() => {
        Datafeed.setPriceSide(orderSide === 'buy' ? 'ask' : 'bid');
    }, [orderSide]);

    // Feed live price
    useEffect(() => {
        if (!livePriceObj) return;
        const encodedSymbol = `${dataSource}|${symbol}`;
        Datafeed.updateLivePrice(encodedSymbol, livePriceObj);
    }, [livePriceObj, symbol, dataSource]);

    // LTP price line on chart (single line + one text label; axis price tag disabled to avoid duplicates)
    useEffect(() => {
        if (!widgetReady || !tvWidgetRef.current || !livePriceObj) return;

        const ltp = livePriceObj.lastPrice || livePriceObj.last_price
            || ((livePriceObj.bid || 0) + (livePriceObj.ask || 0)) / 2 || 0;
        if (!ltp || ltp <= 0) return;

        let chart;
        try { chart = tvWidgetRef.current.activeChart(); } catch { return; }
        if (!chart) return;

        // The user comes first: while they hold a drawing, the drawing layer is
        // theirs alone.
        if (userIsHoldingSomething(chart)) return;

        // Otherwise move the marker at most once a second. The price scale
        // already shows the live price to the tick; this line is a convenience,
        // and it is not worth a chart mutation five times a second.
        if (ltpLineRef.current) {
            if (lastLtpRef.current === ltp) return;
            const sinceLast = Date.now() - (lastLtpAtRef.current || 0);
            if (sinceLast < 1000) return;
        }
        lastLtpAtRef.current = Date.now();

        const setupGen = ++ltpSetupGenRef.current;

        // Try to update existing LTP line + label (fast path — no async)
        if (ltpLineRef.current) {
            try {
                const lineApi = chart.getShapeById(ltpLineRef.current);
                if (lineApi) {
                    lineApi.setPoints([{ price: ltp }]);
                    if (ltpLabelRef.current) {
                        const labelApi = chart.getShapeById(ltpLabelRef.current);
                        if (labelApi) {
                            const pts = labelApi.getPoints?.() || [];
                            const t = pts[0]?.time || Math.floor(Date.now() / 1000);
                            labelApi.setPoints([{ time: t, price: ltp }]);
                            if (typeof labelApi.setText === 'function') {
                                labelApi.setText(`  LTP: ${ltp}  `);
                            }
                            textShapeMapRef.current[ltpLabelRef.current] = { price: ltp };
                        }
                    }
                    lastLtpRef.current = ltp;
                    return;
                }
            } catch {}
        }

        // First time or shape was lost — create (async); drop stale runs so we never stack yellow labels
        (async () => {
            if (setupGen !== ltpSetupGenRef.current) return;

            if (ltpLineRef.current) {
                try { chart.removeEntity(ltpLineRef.current); } catch {}
                ltpLineRef.current = null;
            }
            if (ltpLabelRef.current) {
                try { chart.removeEntity(ltpLabelRef.current); } catch {}
                delete textShapeMapRef.current[ltpLabelRef.current];
                ltpLabelRef.current = null;
            }

            if (setupGen !== ltpSetupGenRef.current) return;

            try {
                const lineId = await chart.createShape(
                    { price: ltp },
                    {
                        shape: 'horizontal_line',
                        lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                        overrides: {
                            linecolor: '#FFB300',
                            linestyle: 1,
                            linewidth: 1,
                            showLabel: false,
                            showPrice: false,
                            textcolor: '#FFB300',
                        }
                    }
                );
                if (setupGen !== ltpSetupGenRef.current) {
                    if (lineId) try { chart.removeEntity(lineId); } catch {}
                    return;
                }
                if (lineId) ltpLineRef.current = lineId;
            } catch {}

            try {
                let anchorTime;
                try {
                    const range = chart.getVisibleRange();
                    const totalRange = (range?.to || range?.from + 600) - (range?.from || 0);
                    anchorTime = (range?.from || Math.floor(Date.now() / 1000) - 3600) + Math.max(5, totalRange * 0.02);
                } catch {
                    anchorTime = Math.floor(Date.now() / 1000) - 3600;
                }

                const ltpText = `  LTP: ${ltp}  `;
                const textId = await chart.createShape(
                    { time: anchorTime, price: ltp },
                    {
                        shape: 'text',
                        lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                        text: ltpText,
                        overrides: {
                            color: '#000000',
                            fontsize: 10,
                            bold: true,
                            fillBackground: true,
                            backgroundColor: '#FFB300',
                            backgroundTransparency: 10,
                            drawBorder: true,
                            borderColor: '#FFB300',
                            fixedSize: false,
                        }
                    }
                );
                if (setupGen !== ltpSetupGenRef.current) {
                    if (textId) try { chart.removeEntity(textId); } catch {}
                    return;
                }
                if (textId) {
                    ltpLabelRef.current = textId;
                    textShapeMapRef.current[textId] = { price: ltp };
                }
                lastLtpRef.current = ltp;
            } catch {}
        })();
    }, [livePriceObj, widgetReady]);

    // Update position lines.
    //
    // Everything here except the P/L number is structural, and the structure
    // rarely changes. Comparing it first is what keeps a tick from tearing down
    // and rebuilding every line under the user's cursor.
    useEffect(() => {
        if (!widgetReady) return;

        const mine = (positions || []).filter(p => p.symbol === symbol);
        const sig = mine
            .map(p => [p._id, p.side, p.entryPrice ?? p.avgPrice, p.volume, p.stopLoss, p.takeProfit].join(':'))
            .join('|');

        if (sig === positionSigRef.current) {
            refreshPositionPnl(mine);
            return;
        }
        positionSigRef.current = sig;
        updatePositionsLines(positions).then((drawn) => {
            if (drawn === false) positionSigRef.current = '';
        });
    }, [positions, widgetReady, symbol]);

    /**
     * Only the P/L text moved, so write it straight onto the existing line —
     * no removal, no recreation, nothing for a selected drawing to lose.
     */
    const refreshPositionPnl = useCallback((myPositions) => {
        let chart;
        try { chart = tvWidgetRef.current?.activeChart(); } catch { return; }
        if (!chart) return;

        for (const pos of myPositions) {
            const profitVal = pos.profit ?? 0;
            const profitText = profitVal >= 0
                ? `+₹${profitVal.toFixed(2)}`
                : `-₹${Math.abs(profitVal).toFixed(2)}`;
            const text = `${pos.side === 'buy' ? '▲ BUY' : '▼ SELL'} ${pos.volume} lot  |  P/L: ${profitText}`;

            // createPositionLine() gives an object with setText; the shape
            // fallback gives an id whose label lives under `<id>_label`.
            const line = positionLinesRef.current[pos._id];
            try {
                if (line && typeof line.setText === 'function') {
                    line.setText(text);
                    continue;
                }
                const labelId = positionLinesRef.current[`${pos._id}_label`];
                if (labelId) {
                    const api = chart.getShapeById(labelId);
                    if (api && typeof api.setText === 'function') api.setText(`  ${text}  `);
                }
            } catch { /* shape went away between renders */ }
        }
    }, []);

    const updatePositionsLines = useCallback(async (posList) => {
        if (!tvWidgetRef.current || !widgetReady) return;

        let chart;
        try { chart = tvWidgetRef.current.activeChart(); } catch { return; }
        if (!chart) return;
        // Rebuilding every position line would clear whatever the user is
        // holding, so defer. Returning false tells the caller not to record
        // this state as drawn — the next tick retries, within milliseconds of
        // the user letting go.
        if (userIsHoldingSomething(chart)) return false;

        const myPositions = posList.filter(p => p.symbol === symbol);

        // Cleanup existing
        for (const key of Object.keys(positionLinesRef.current)) {
            try {
                const lineObj = positionLinesRef.current[key];
                if (lineObj && typeof lineObj === 'object' && lineObj.remove) lineObj.remove();
                else if (typeof lineObj === 'string' || typeof lineObj === 'number') chart.removeEntity(lineObj);
            } catch {}
        }
        positionLinesRef.current = {};
        // Keep LTP text shape in the map so scroll-reposition still works (LTP entities are not in positionLinesRef)
        const ltpTextId = ltpLabelRef.current;
        const ltpPreserve = {};
        if (ltpTextId) {
            const p = textShapeMapRef.current[ltpTextId]?.price;
            if (p != null && Number.isFinite(p)) ltpPreserve[ltpTextId] = { price: p };
        }
        textShapeMapRef.current = ltpPreserve;

        // Get leftmost visible bar time for initial text shape placement
        let anchorTime;
        try {
            const range = chart.getVisibleRange();
            anchorTime = (range?.from || Math.floor(Date.now() / 1000) - 3600) + 2;
        } catch {
            anchorTime = Math.floor(Date.now() / 1000) - 3600;
        }

        for (const pos of myPositions) {
            const entryPrice = pos.entryPrice || pos.avgPrice;
            if (!entryPrice) continue;

            const isBuy = pos.side === 'buy';
            const color = isBuy ? '#26a69a' : '#ef5350';
            // Close-button bg matches the pane (pure black / white) so it
            // blends with the new chart background from Fix 16.
            const bgColor = theme === 'Dark' ? '#000000' : '#ffffff';
            const profitVal = pos.profit ?? 0;
            const profitColor = profitVal >= 0 ? '#26a69a' : '#ef5350';
            const profitText = profitVal >= 0
                ? `+₹${profitVal.toFixed(2)}`
                : `-₹${Math.abs(profitVal).toFixed(2)}`;

            // ---- Try createPositionLine (Learning Platform tier) ----
            try {
                const line = await chart.createPositionLine();
                line
                    .setText(`${isBuy ? '▲ BUY' : '▼ SELL'} ${pos.volume} lot  |  P/L: ${profitText}`)
                    .setTooltip(`Entry: ${entryPrice} | Volume: ${pos.volume}`)
                    .setProtectTooltip('Set SL/TP')
                    .setCloseTooltip('Close Position')
                    .setReverseTooltip('Reverse Position')
                    .setQuantity(String(pos.volume))
                    .setPrice(entryPrice)
                    .setExtendLeft(false)
                    .setLineStyle(0)
                    .setLineLength(80)
                    .setLineColor(color)
                    .setBodyFont('bold 11px Inter, sans-serif')
                    .setBodyTextColor('#ffffff')
                    .setBodyBorderColor(color)
                    .setBodyBackgroundColor(color)
                    .setQuantityFont('bold 11px Inter, sans-serif')
                    .setQuantityTextColor('#ffffff')
                    .setQuantityBorderColor(color)
                    .setQuantityBackgroundColor(color)
                    .setCloseButtonBorderColor(color)
                    .setCloseButtonBackgroundColor(bgColor)
                    .setCloseButtonIconColor(color);

                line.onClose(() => { if (onClosePositionRef.current) onClosePositionRef.current(pos, pos.volume); });
                positionLinesRef.current[pos._id] = line;

                if (pos.stopLoss) {
                    try {
                        const sl = await chart.createOrderLine();
                        sl.setText('SL').setQuantity(String(pos.volume)).setPrice(pos.stopLoss)
                          .setExtendLeft(false).setLineStyle(2).setLineLength(50).setLineColor('#ef5350')
                          .setBodyFont('bold 10px Inter').setBodyTextColor('#fff').setBodyBorderColor('#ef5350').setBodyBackgroundColor('#ef5350')
                          .setQuantityFont('bold 10px Inter').setQuantityTextColor('#fff').setQuantityBorderColor('#ef5350').setQuantityBackgroundColor('#ef5350');
                        positionLinesRef.current[`${pos._id}_sl`] = sl;
                    } catch {}
                }
                if (pos.takeProfit) {
                    try {
                        const tp = await chart.createOrderLine();
                        tp.setText('TP').setQuantity(String(pos.volume)).setPrice(pos.takeProfit)
                          .setExtendLeft(false).setLineStyle(2).setLineLength(50).setLineColor('#26a69a')
                          .setBodyFont('bold 10px Inter').setBodyTextColor('#fff').setBodyBorderColor('#26a69a').setBodyBackgroundColor('#26a69a')
                          .setQuantityFont('bold 10px Inter').setQuantityTextColor('#fff').setQuantityBorderColor('#26a69a').setQuantityBackgroundColor('#26a69a');
                        positionLinesRef.current[`${pos._id}_tp`] = tp;
                    } catch {}
                }

            } catch (err) {
                // ---- Fallback: horizontal_line + text shape with auto-reposition ----
                console.warn('Position line unavailable (Learning Platform tier), using shape fallback');

                // 1. Dashed horizontal line at entry price (no label — the text shape IS the label)
                try {
                    const lineId = await chart.createShape(
                        { price: entryPrice },
                        {
                            shape: 'horizontal_line',
                            lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                            overrides: {
                                linecolor: color,
                                linestyle: 2,
                                linewidth: 1,
                                showLabel: false,
                                showPrice: true,
                                textcolor: color,
                            }
                        }
                    );
                    if (lineId) positionLinesRef.current[pos._id] = lineId;
                } catch {}

                // 2. Text shape with colored background box — shows quantity + PnL
                //    This is repositioned to the left edge on every scroll via onVisibleRangeChanged
                try {
                    const labelText = `  ${isBuy ? '▲ BUY' : '▼ SELL'}  ${pos.volume}  |  ${profitText}  `;
                    const textId = await chart.createShape(
                        { time: anchorTime, price: entryPrice },
                        {
                            shape: 'text',
                            lock: true,
                            disableSelection: true,
                            disableSave: true,
                            disableUndo: true,
                            text: labelText,
                            overrides: {
                                color: '#ffffff',
                                fontsize: 11,
                                bold: true,
                                fillBackground: true,
                                backgroundColor: color,
                                backgroundTransparency: 5,
                                drawBorder: true,
                                borderColor: color,
                                fixedSize: false,
                            }
                        }
                    );
                    if (textId) {
                        positionLinesRef.current[`${pos._id}_label`] = textId;
                        textShapeMapRef.current[textId] = { price: entryPrice };
                    }
                } catch (textErr) {
                    console.warn('Text shape fallback failed:', textErr.message);
                }

                // SL line + label
                if (pos.stopLoss) {
                    try {
                        const slId = await chart.createShape(
                            { price: pos.stopLoss },
                            {
                                shape: 'horizontal_line',
                                lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                                overrides: {
                                    linecolor: '#ef5350', linestyle: 2, linewidth: 1,
                                    showLabel: false, showPrice: true, textcolor: '#ef5350',
                                }
                            }
                        );
                        if (slId) positionLinesRef.current[`${pos._id}_sl`] = slId;
                    } catch {}

                    try {
                        const slTextId = await chart.createShape(
                            { time: anchorTime, price: pos.stopLoss },
                            {
                                shape: 'text',
                                lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                                text: `  SL  ${pos.volume}  `,
                                overrides: {
                                    color: '#ffffff', fontsize: 10, bold: true,
                                    fillBackground: true, backgroundColor: '#ef5350',
                                    backgroundTransparency: 5,
                                    drawBorder: true, borderColor: '#ef5350',
                                    fixedSize: false,
                                }
                            }
                        );
                        if (slTextId) {
                            positionLinesRef.current[`${pos._id}_sl_label`] = slTextId;
                            textShapeMapRef.current[slTextId] = { price: pos.stopLoss };
                        }
                    } catch {}
                }

                // TP line + label
                if (pos.takeProfit) {
                    try {
                        const tpId = await chart.createShape(
                            { price: pos.takeProfit },
                            {
                                shape: 'horizontal_line',
                                lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                                overrides: {
                                    linecolor: '#26a69a', linestyle: 2, linewidth: 1,
                                    showLabel: false, showPrice: true, textcolor: '#26a69a',
                                }
                            }
                        );
                        if (tpId) positionLinesRef.current[`${pos._id}_tp`] = tpId;
                    } catch {}

                    try {
                        const tpTextId = await chart.createShape(
                            { time: anchorTime, price: pos.takeProfit },
                            {
                                shape: 'text',
                                lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                                text: `  TP  ${pos.volume}  `,
                                overrides: {
                                    color: '#ffffff', fontsize: 10, bold: true,
                                    fillBackground: true, backgroundColor: '#26a69a',
                                    backgroundTransparency: 5,
                                    drawBorder: true, borderColor: '#26a69a',
                                    fixedSize: false,
                                }
                            }
                        );
                        if (tpTextId) {
                            positionLinesRef.current[`${pos._id}_tp_label`] = tpTextId;
                            textShapeMapRef.current[tpTextId] = { price: pos.takeProfit };
                        }
                    } catch {}
                }
            }
        }
    }, [widgetReady, symbol, theme]);

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div
                ref={chartContainerRef}
                style={{ flex: 1, width: '100%', height: '100%' }}
                className="tv-chart-container"
            />
        </div>
    );
};

export default TVChartContainer;
