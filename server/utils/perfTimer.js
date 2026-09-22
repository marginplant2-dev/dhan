/**
 * Lightweight per-step timing for hot paths. Opt-in via `TRADE_PROFILE=1` env
 * var so it stays zero-cost in production unless turned on explicitly.
 *
 * Usage:
 *   const t = perfTimer.start('executeOrder');
 *   t.mark('instrument');
 *   // ... work ...
 *   t.mark('segmentSettings');
 *   t.end();
 *
 * When TRADE_PROFILE is unset, all methods are no-ops (single boolean branch).
 */
const ENABLED = process.env.TRADE_PROFILE === '1';

function start(label) {
  if (!ENABLED) return NOOP;
  const t0 = Date.now();
  let last = t0;
  const steps = [];
  return {
    mark(name) {
      const now = Date.now();
      steps.push({ name, dt: now - last });
      last = now;
    },
    end(extra = '') {
      const total = Date.now() - t0;
      const detail = steps.map(s => `${s.name}=${s.dt}ms`).join(' ');
      console.log(`[perf:${label}] TOTAL=${total}ms ${detail}${extra ? ' ' + extra : ''}`);
      return total;
    },
  };
}

const NOOP = { mark() {}, end() { return 0; } };

module.exports = { start };
