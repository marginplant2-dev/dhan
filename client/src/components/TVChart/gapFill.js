/* ── Gap filling ───────────────────────────────────────────────────────────
 * An exchange does not publish a candle for an interval in which nothing
 * traded. That is routine for an option strike away from the money: a quiet
 * ten minutes simply has no rows. TradingView plots what it is given, so those
 * missing rows show up as holes in the middle of the series — the thing users
 * report as "chart me gap".
 *
 * Both sources of the hole are closed here, in the datafeed, so every chart in
 * the app benefits: the history returned by getBars, and the live series, where
 * a tick arriving after a quiet stretch used to jump straight to the current
 * bucket and leave everything between it and the last bar empty.
 *
 * A filled bar is flat at the previous close with zero volume — the honest
 * representation of "price did not move because nothing traded". Filling only
 * happens inside the instrument's own session, so nights, weekends and the
 * post-close stretch stay empty exactly as they are on Zerodha or Upstox.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
// A browser should never be asked to draw more than this many invented bars.
export const MAX_FILLED_BARS = 3000;
// Beyond a week apart, the "gap" is a listing break, not a quiet patch.
const MAX_FILL_SPAN_MS = 7 * 24 * 60 * 60 * 1000;

/** 'HHMM-HHMM' → minutes-of-day window. null for '24x7' and anything odd. */
export function parseSession(session) {
    const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(String(session || ''));
    if (!m) return null;
    return { startMin: (+m[1]) * 60 + (+m[2]), endMin: (+m[3]) * 60 + (+m[4]) };
}

/** Sessions here are always IST, which is a fixed offset — no DST to handle. */
export function inSession(timeMs, win) {
    const d = new Date(timeMs + IST_OFFSET_MS);
    const day = d.getUTCDay();
    if (day === 0 || day === 6) return false;
    const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    return mins >= win.startMin && mins < win.endMin;
}

/** Bars for every in-session interval strictly between two known bars. */
export function bridge(prevBar, nextTimeMs, step, win, budget) {
    const out = [];
    if (nextTimeMs - prevBar.time > MAX_FILL_SPAN_MS) return out;
    for (let t = prevBar.time + step; t < nextTimeMs && out.length < budget; t += step) {
        if (!inSession(t, win)) continue;
        out.push({
            time: t,
            open: prevBar.close, high: prevBar.close,
            low: prevBar.close, close: prevBar.close,
            volume: 0,
        });
    }
    return out;
}

export function fillSessionGaps(bars, seconds, session) {
    const win = parseSession(session);
    // Daily bars would need the exchange holiday calendar to fill correctly,
    // and 24x7 instruments have no session to fill against.
    if (!win || seconds >= 86400 || !Array.isArray(bars) || bars.length < 2) return bars;

    const step = seconds * 1000;
    const out = [];
    let budget = MAX_FILLED_BARS;
    for (let i = 0; i < bars.length; i++) {
        out.push(bars[i]);
        const next = bars[i + 1];
        if (!next || budget <= 0) continue;
        const filled = bridge(bars[i], next.time, step, win, budget);
        budget -= filled.length;
        for (const b of filled) out.push(b);
    }
    return out;
}
