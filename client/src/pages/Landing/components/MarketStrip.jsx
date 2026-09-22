import { memo, useCallback, useEffect, useState } from 'react';
import { ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react';

/* ── Market strip ────────────────────────────────────────────────────────────
   The band under the hero: what this platform actually trades and settles in,
   then a live-looking index tape. Chips name exchanges, indices and the
   payment rail — things the platform genuinely runs on. Swap in broker marks
   only where a real integration exists; a logo wall implies a tie-up.
   ──────────────────────────────────────────────────────────────────────────── */

const CHIPS = ['NSE', 'BSE', 'NIFTY 50', 'BANKNIFTY', 'SENSEX', 'Index F&O'];

const TICKERS = [
  { symbol: 'NIFTY 50', base: 22456.8 },
  { symbol: 'BANKNIFTY', base: 48320.5 },
  { symbol: 'SENSEX', base: 73852.4 },
  { symbol: 'NIFTY CE', base: 245.6, prefix: '₹' },
  { symbol: 'NIFTY PE', base: 182.3, prefix: '₹' },
  { symbol: 'BANKNIFTY CE', base: 312.8, prefix: '₹' },
  { symbol: 'BANKNIFTY PE', base: 198.4, prefix: '₹' },
  { symbol: 'SENSEX FUT', base: 73910.0 },
];

function tick(t) {
  const vol = t.base > 1000 ? 0.002 : 0.008;
  const move = (Math.random() - 0.48) * vol * t.base;
  const change = (move / t.base) * 100;
  return {
    symbol: t.symbol,
    price: (t.prefix || '') + (t.base + move).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    change: (change >= 0 ? '+' : '') + change.toFixed(2) + '%',
    up: change >= 0,
  };
}

const Ticker = memo(function Ticker() {
  const [rows, setRows] = useState(() => TICKERS.map(tick));
  const update = useCallback(() => {
    setRows(TICKERS.map((t) => { t.base += (Math.random() - 0.48) * t.base * 0.0003; return tick(t); }));
  }, []);
  useEffect(() => {
    const id = setInterval(update, 4000);
    return () => clearInterval(id);
  }, [update]);

  // Rendered twice so the -50% marquee loop is seamless.
  const strip = [...rows, ...rows];
  return (
    <div className="df-tape">
      <div className="pf-marquee">
        {strip.map((t, i) => (
          <div key={i} className="flex items-center gap-2.5 shrink-0">
            <span className="text-xs font-bold" style={{ color: 'var(--pf-text)' }}>{t.symbol}</span>
            <span className="text-xs tabular-nums" style={{ color: 'var(--pf-muted)' }}>{t.price}</span>
            <span
              className="flex items-center gap-0.5 text-xs font-semibold tabular-nums"
              style={{ color: t.up ? 'var(--pf-green)' : '#EF4444' }}
            >
              {t.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {t.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

export default function MarketStrip() {
  return (
    <section className="df-strip">
      <div className="pf-wrap">
        <div className="df-strip-row">
          <div className="df-strip-label">
            <span className="pf-tile pf-tile--soft" style={{ width: 36, height: 36, borderRadius: 11 }}>
              <ShieldCheck size={18} />
            </span>
            <span>
              <b>Built on Indian markets only</b>
              <em>NSE &amp; BSE index derivatives · INR fees and payouts</em>
            </span>
          </div>

          <div className="df-strip-chips">
            {CHIPS.map((c) => <span key={c} className="df-brand-chip">{c}</span>)}
            <span className="df-brand-chip">
              <img src="/landing/img/upi-logo.svg" alt="UPI" height={16} />
            </span>
          </div>
        </div>
      </div>

      <Ticker />
    </section>
  );
}
