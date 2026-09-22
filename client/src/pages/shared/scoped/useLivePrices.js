import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

/**
 * Subscribe to the same price streams admin's TradeManagement listens to:
 *   - `prices_batch`   (MetaAPI bulk — Forex / Crypto / Indices / Commodities)
 *   - `price_tick`     (MetaAPI per-symbol)
 *   - `zerodha-tick`   (Zerodha Indian NSE/BSE/MCX/NFO)
 *
 * The hook is additionally annotated with connection status so UI can
 * distinguish three states:
 *   1. Socket disconnected entirely
 *   2. Socket connected, but no tick has arrived yet
 *      (usually means MetaAPI/Zerodha feed is down server-side)
 *   3. Live — ticks arriving, symbol map populated
 *
 * Returns the `livePrices` map directly (back-compat with callers that
 * destructure `livePrices`). The map also carries non-enumerable metadata
 * via attached properties (`__connected`, `__lastTickAt`) on a sibling
 * `status` object exposed through `livePrices.__status`.
 */
export default function useLivePrices(apiUrl) {
  const [livePrices, setLivePrices] = useState({});
  const [status, setStatus] = useState({ connected: false, lastTickAt: 0 });
  const socketRef = useRef(null);

  useEffect(() => {
    if (!apiUrl) return undefined;
    const sock = io(apiUrl, { transports: ['websocket', 'polling'], reconnection: true });
    socketRef.current = sock;

    const markTick = () => setStatus(s => ({ ...s, lastTickAt: Date.now() }));

    sock.on('connect', () => {
      setStatus(s => ({ ...s, connected: true }));
      sock.emit('subscribeZerodhaTicks');
    });
    sock.on('disconnect', () => setStatus(s => ({ ...s, connected: false })));
    sock.on('connect_error', () => setStatus(s => ({ ...s, connected: false })));

    sock.on('prices_batch', (prices) => {
      if (!prices || typeof prices !== 'object') return;
      markTick();
      setLivePrices((prev) => {
        const next = { ...prev };
        for (const [symbol, data] of Object.entries(prices)) {
          next[symbol] = {
            bid: data.bid || data.price || 0,
            ask: data.ask || data.price || 0,
            price: data.bid || data.price || 0,
          };
        }
        return next;
      });
    });

    sock.on('price_tick', (p) => {
      if (!p || !p.symbol) return;
      markTick();
      setLivePrices((prev) => ({
        ...prev,
        [p.symbol]: { bid: p.bid || 0, ask: p.ask || 0, price: p.bid || 0 },
      }));
    });

    // Delta Exchange streams (crypto futures / options — BTCUSD, ETHUSD, etc.)
    // emit on separate event names. Without these handlers the client never
    // sees Delta-sourced ticks even though the server has them.
    sock.on('delta_prices_batch', (prices) => {
      if (!prices || typeof prices !== 'object') return;
      markTick();
      setLivePrices((prev) => {
        const next = { ...prev };
        for (const [symbol, data] of Object.entries(prices)) {
          const bid = Number(data.bid) || Number(data.last) || Number(data.mark_price) || 0;
          const ask = Number(data.ask) || Number(data.last) || Number(data.mark_price) || 0;
          const last = Number(data.last) || Number(data.mark_price) || bid || 0;
          if (bid === 0 && ask === 0 && last === 0) continue;
          next[symbol] = { bid: bid || last, ask: ask || last, price: last };
        }
        return next;
      });
    });

    sock.on('delta_price_tick', (p) => {
      if (!p || !p.symbol) return;
      const bid = Number(p.bid) || Number(p.last) || Number(p.mark_price) || 0;
      const ask = Number(p.ask) || Number(p.last) || Number(p.mark_price) || 0;
      const last = Number(p.last) || Number(p.mark_price) || bid || 0;
      if (bid === 0 && ask === 0 && last === 0) return;
      markTick();
      setLivePrices((prev) => ({
        ...prev,
        [p.symbol]: { bid: bid || last, ask: ask || last, price: last },
      }));
    });

    sock.emit('subscribeZerodhaTicks');

    sock.on('zerodha-tick', (ticks) => {
      if (!Array.isArray(ticks) || ticks.length === 0) return;
      markTick();
      setLivePrices((prev) => {
        const next = { ...prev };
        for (const t of ticks) {
          const sym = t.symbol || t.tradingsymbol;
          if (!sym) continue;
          next[sym] = {
            bid: t.bid || t.lastPrice || 0,
            ask: t.ask || t.lastPrice || 0,
            price: t.lastPrice || t.bid || 0,
          };
        }
        return next;
      });
    });

    return () => {
      try { sock.emit('unsubscribeZerodhaTicks'); } catch { /* ignore */ }
      sock.disconnect();
      socketRef.current = null;
    };
  }, [apiUrl]);

  // Attach status metadata so consumers can inspect connection health
  // without breaking existing `const livePrices = useLivePrices()` callers.
  Object.defineProperty(livePrices, '__status', {
    value: status,
    enumerable: false,
    configurable: true,
  });

  return livePrices;
}
