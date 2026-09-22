import { useEffect, useRef, useState } from 'react';

/**
 * Live NIFTY / SENSEX / BANKNIFTY strip for the dashboard.
 *
 * Reads ticks through getTickBySymbolAuto (UserLayout's outlet context), which
 * re-renders on every socket tick, so the numbers move on their own. The three
 * indices are subscribed server-side under exactly these names.
 *
 * Change is computed from the previous close (`close`) rather than trusted
 * from `change`: the /api/zerodha/ltp snapshot carries change/changePercent,
 * but live socket ticks may not, and a stale `change` next to a fresh LTP would
 * show the wrong move. Falls back to the tick's own change when close is absent.
 * Styles: .itk-* in App.css.
 */

const INDICES = [
  { key: 'NIFTY 50', label: 'NIFTY' },
  { key: 'SENSEX', label: 'SENSEX' },
  { key: 'NIFTY BANK', label: 'BANKNIFTY' },
];

const fmt = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function readQuote(tick) {
  if (!tick) return null;
  const ltp = Number(tick.lastPrice || tick.last_price || tick.ltp || 0);
  if (!ltp) return null;
  const close = Number(tick.close || tick.ohlc?.close || 0);
  let change;
  let pct;
  if (close > 0) {
    change = ltp - close;
    pct = (change / close) * 100;
  } else {
    change = Number(tick.change || 0);
    pct = Number(tick.changePercent || 0);
  }
  return { ltp, change, pct };
}

function IndexCard({ label, quote }) {
  // Brief green/red flash when the LTP moves, the way terminals signal a tick.
  const prev = useRef(quote?.ltp);
  const [flash, setFlash] = useState('');
  useEffect(() => {
    if (!quote) return undefined;
    const before = prev.current;
    prev.current = quote.ltp;
    if (before == null || before === quote.ltp) return undefined;
    setFlash(quote.ltp > before ? 'is-tick-up' : 'is-tick-down');
    const t = setTimeout(() => setFlash(''), 650);
    return () => clearTimeout(t);
  }, [quote?.ltp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!quote) {
    return (
      <div className="itk-card is-empty" aria-label={`${label}: no price yet`}>
        <div className="itk-label">{label}</div>
        <div className="itk-ltp">—</div>
      </div>
    );
  }

  const up = quote.change >= 0;
  const sign = up ? '+' : '−';
  return (
    <div className={`itk-card ${up ? 'is-up' : 'is-down'}`}
         aria-label={`${label} ${fmt(quote.ltp)}, ${sign}${fmt(Math.abs(quote.change))} points, ${sign}${Math.abs(quote.pct).toFixed(2)} percent`}>
      <div className="itk-main">
        <div className="itk-label">{label}</div>
        <div className={`itk-ltp ${flash}`}>{fmt(quote.ltp)}</div>
      </div>
      <div className="itk-change">
        <span className="itk-pts">
          <span className="itk-arrow" aria-hidden="true">{up ? '▲' : '▼'}</span>
          {sign}{fmt(Math.abs(quote.change))}
        </span>
        <span className="itk-pct">{sign}{Math.abs(quote.pct).toFixed(2)}%</span>
      </div>
    </div>
  );
}

export default function IndexTicker({ getTickBySymbolAuto }) {
  return (
    <div className="itk" role="group" aria-label="Market indices">
      {INDICES.map((ix) => (
        <IndexCard key={ix.key} label={ix.label} quote={readQuote(getTickBySymbolAuto?.(ix.key))} />
      ))}
    </div>
  );
}
