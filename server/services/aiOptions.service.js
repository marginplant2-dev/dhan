/**
 * AI Options analysis.
 *
 * Pipeline: Zerodha option chain → filter to the strikes that matter → Gemini →
 * a small, strictly-shaped list of contracts worth a look.
 *
 * The result is cached per (index, expiry) for the refresh window, so ONE
 * Gemini call serves every subscriber. Calling it per user would burn the API
 * quota and cost real money for identical answers.
 *
 * This produces market analysis for an educational tool. It is not advice, and
 * nothing here places an order.
 */
const zerodhaService = require('./zerodha.service');

const REFRESH_MS = 4.5 * 60 * 1000;      // matches "updated every 4-5 minutes"
const STRIKES_EACH_SIDE = 6;             // ATM +/- 6 strikes, both CE and PE
const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Only a fallback for a fresh install — the admin screen lists what Google
// actually serves today, because model names get retired without notice.
const DEFAULT_MODEL = 'gemini-flash-latest';

/**
 * The credential comes from Admin -> AI Subscriptions -> API Key; the env vars
 * stay as a fallback so an existing deployment keeps working. Cached briefly so
 * a burst of requests does not hit Mongo for every call.
 */
let _cfgCache = { at: 0, cfg: null };
async function geminiConfig() {
  if (Date.now() - _cfgCache.at < 30000 && _cfgCache.cfg) return _cfgCache.cfg;
  let doc = null;
  try { doc = await require('../models/AiOptionsConfig').getSingleton(); } catch { /* fall back to env */ }
  const cfg = {
    apiKey: (doc && doc.geminiApiKey) || process.env.GEMINI_API_KEY || '',
    model: (doc && doc.geminiModel) || process.env.GEMINI_MODEL || DEFAULT_MODEL,
  };
  _cfgCache = { at: Date.now(), cfg };
  return cfg;
}

/** Called after the admin saves a new key, so the next call uses it at once. */
function invalidateConfigCache() { _cfgCache = { at: 0, cfg: null }; }

const INDICES = {
  NIFTY:     { name: 'NIFTY',     label: 'NIFTY 50',   spot: 'NIFTY 50',   segment: 'nseOpt', exchange: 'NSE' },
  BANKNIFTY: { name: 'BANKNIFTY', label: 'BANK NIFTY', spot: 'NIFTY BANK', segment: 'nseOpt', exchange: 'NSE' },
  SENSEX:    { name: 'SENSEX',    label: 'SENSEX',     spot: 'SENSEX',     segment: 'bseOpt', exchange: 'BSE' },
};

const cache = new Map();   // "INDEX|EXPIRY" -> { at, data }
const inflight = new Map();

const isIndex = (k) => Object.prototype.hasOwnProperty.call(INDICES, String(k || '').toUpperCase());

/**
 * Every option contract Zerodha lists for this index.
 *
 * Cached, because this filters the exchange's whole instrument list — 34k rows
 * for NFO — and measured at ~450ms of pure CPU. Node runs one thread, so doing
 * that per page load stalls every other request on the server, trading
 * included. Zerodha publishes instruments once a day; ten minutes is ample.
 */
const CHAIN_TTL_MS = 10 * 60 * 1000;
const chainCache = new Map();     // INDEX -> { at, rows }
const chainInflight = new Map();

async function chainFor(indexKey) {
  const hit = chainCache.get(indexKey);
  if (hit && Date.now() - hit.at < CHAIN_TTL_MS) return hit.rows;
  if (chainInflight.has(indexKey)) return chainInflight.get(indexKey);

  const cfg = INDICES[indexKey];
  const p = zerodhaService.searchAllInstruments(cfg.name, cfg.segment, { exactName: true })
    .then((all) => {
      const rows = (all || []).filter(
        (i) => i.strike > 0 && i.expiry && (i.instrumentType === 'CE' || i.instrumentType === 'PE')
      );
      chainCache.set(indexKey, { at: Date.now(), rows });
      return rows;
    })
    .finally(() => chainInflight.delete(indexKey));
  chainInflight.set(indexKey, p);
  return p;
}

/**
 * Upcoming expiry dates (YYYY-MM-DD), soonest first.
 *
 * Every visitor calls this on load and on each index switch, subscriber or not,
 * so the derived list is cached too — deriving it walked the whole chain.
 */
const expiryCache = new Map();    // INDEX -> { at, dates }

async function getExpiries(indexKey) {
  const key = String(indexKey || '').toUpperCase();
  if (!isIndex(key)) throw new Error('Unknown index');

  const hit = expiryCache.get(key);
  if (hit && Date.now() - hit.at < CHAIN_TTL_MS) return hit.dates;

  const chain = await chainFor(key);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dates = [...new Set(chain.map((i) => String(i.expiry).slice(0, 10)))]
    .filter((d) => new Date(d) >= today)
    .sort()
    .slice(0, 6);
  expiryCache.set(key, { at: Date.now(), dates });
  return dates;
}

/**
 * Spot price of the index itself.
 *
 * getPrice() only knows instruments the socket is subscribed to, and the
 * indices are not among them — it returns null. The REST quote answers for any
 * instrument and keeps returning the last traded price after the close, which
 * is what we want outside market hours.
 */
async function spotOf(indexKey) {
  const cfg = INDICES[indexKey];

  const tick = zerodhaService.getPrice(cfg.spot);
  const fromTick = Number(tick && (tick.lastPrice ?? tick.ltp ?? tick.last_price)) || 0;
  if (fromTick) return fromTick;

  const inst = { exchange: cfg.exchange, symbol: cfg.spot };
  const q = await zerodhaService.getQuotes([inst]).catch(() => ({}));
  const v = q[`${cfg.exchange}:${cfg.spot}`];
  // Falls back to the previous close so a data gap does not blank the page.
  return Number(v?.last_price) || Number(v?.ohlc?.close) || 0;
}

/**
 * The listed strikes within N of the money. Strikes far from spot are noise
 * for this purpose and only make the prompt bigger.
 */
function pickStrikeWindow(allStrikes, spot, eachSide) {
  const strikes = [...new Set(allStrikes)].filter((n) => n > 0).sort((a, b) => a - b);
  if (!strikes.length) return new Set();
  let atm = 0;
  for (let i = 1; i < strikes.length; i++) {
    if (Math.abs(strikes[i] - spot) < Math.abs(strikes[atm] - spot)) atm = i;
  }
  return new Set(strikes.slice(Math.max(0, atm - eachSide), atm + eachSide + 1));
}

/**
 * The strikes around the money for one expiry, priced. Anything far OTM is
 * noise for this purpose and only makes the prompt bigger.
 */
async function nearMoneyContracts(indexKey, expiry, spot) {
  const chain = (await chainFor(indexKey)).filter((i) => String(i.expiry).slice(0, 10) === expiry);
  if (!chain.length) return [];

  const wanted = pickStrikeWindow(chain.map((i) => i.strike), spot, STRIKES_EACH_SIDE);
  if (!wanted.size) return [];

  const picked = chain.filter((i) => wanted.has(i.strike));
  // getQuotes wants instrument objects; the keys it returns are "EXCH:SYMBOL".
  const quotes = await zerodhaService.getQuotes(
    picked.map((i) => ({ exchange: i.exchange, symbol: i.symbol }))
  ).catch(() => ({}));

  return picked.map((i) => {
    const q = quotes[`${i.exchange}:${i.symbol}`] || {};
    return {
      symbol: i.symbol,
      strike: i.strike,
      type: i.instrumentType,
      expiry,
      lotSize: i.lotSize,
      ltp: Number(q.last_price ?? q.ltp ?? 0) || 0,
      oi: Number(q.oi ?? 0) || 0,
      volume: Number(q.volume ?? q.volume_traded ?? 0) || 0,
      change: Number(q.net_change ?? 0) || 0,
    };
  }).filter((c) => c.ltp > 0);
}

const PROMPT = `You analyse Indian index option chains for an educational trading tool.

Given the live chain below, pick the 3-4 contracts with the most interesting
risk/reward for a short-term view, and explain each in one sentence a retail
trader understands. Use only the data provided — do not invent prices or OI.

Reply with JSON ONLY, no markdown fence, in exactly this shape:
{"suggestions":[{"symbol":"<tradingsymbol from the data>","strike":<number>,
"type":"CE"|"PE","score":<1-10, one decimal>,"expectedMoveLow":<percent number>,
"expectedMoveHigh":<percent number>,"confidence":"High"|"Medium"|"Low",
"rationale":"<one sentence, max 140 chars>"}]}

Order the list best first. score must reflect your genuine conviction: reserve
8+ for a setup the data strongly supports, and do not mark everything High.`;

/**
 * Pull the answer out of a Gemini reply.
 *
 * Reasoning models return several parts, and the leading ones can be thoughts
 * with no text at all — reading parts[0].text silently yields undefined. Join
 * every real text part instead, and skip the ones flagged as thinking.
 */
function extractText(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim();
}

/** Why a reply came back empty, in words worth showing an admin. */
function emptyReplyReason(json) {
  const c = json?.candidates?.[0];
  const finish = c?.finishReason || '';
  if (finish === 'MAX_TOKENS') return 'the model hit its output limit while thinking';
  if (finish === 'SAFETY') return 'the model blocked the reply on safety grounds';
  if (json?.promptFeedback?.blockReason) return `prompt blocked (${json.promptFeedback.blockReason})`;
  return finish ? `finishReason ${finish}` : 'no text part in the reply';
}

async function askGemini(payload) {
  const { apiKey, model } = await geminiConfig();
  if (!apiKey) throw new Error('Gemini API key is not set — add it in Admin → AI Subscriptions → API Key');

  const res = await fetch(`${GEMINI_URL(model)}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${PROMPT}\n\nDATA:\n${JSON.stringify(payload)}` }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const text = extractText(json);
  if (!text) throw new Error(`Gemini returned no analysis — ${emptyReplyReason(json)}`);
  // responseMimeType should give clean JSON, but a fenced reply still happens.
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch { throw new Error('Gemini returned unparseable JSON'); }
  return Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
}

/**
 * Keep only suggestions that name a contract we actually sent, and re-attach
 * OUR price rather than trusting the model's. A hallucinated strike is dropped
 * instead of being shown to a paying user.
 */
function reconcile(suggestions, contracts) {
  const bySymbol = new Map(contracts.map((c) => [c.symbol, c]));
  const seen = new Set();
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));

  return suggestions
    .map((s) => {
      const c = bySymbol.get(String(s.symbol || '').trim());
      if (!c || seen.has(c.symbol)) return null;
      seen.add(c.symbol);
      const conf = ['High', 'Medium', 'Low'].includes(s.confidence) ? s.confidence : 'Medium';
      return {
        symbol: c.symbol,
        underlying: c.symbol.replace(/\d.*$/, ''),
        strike: c.strike,
        type: c.type,
        expiry: c.expiry,
        ltp: c.ltp,
        lotSize: c.lotSize,
        score: clamp(s.score, 1, 10),
        expectedMoveLow: clamp(s.expectedMoveLow, 0, 500),
        expectedMoveHigh: clamp(s.expectedMoveHigh, 0, 500),
        confidence: conf,
        rationale: String(s.rationale || '').slice(0, 200),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

async function build(indexKey, expiry) {
  const spot = await spotOf(indexKey);
  if (!spot) throw new Error('Could not read the index price from Zerodha — check the broker connection');

  const contracts = await nearMoneyContracts(indexKey, expiry, spot);
  if (!contracts.length) {
    throw new Error('No traded contracts near the money for that expiry yet — try the next expiry');
  }

  const raw = await askGemini({
    index: INDICES[indexKey].label,
    spot,
    expiry,
    asOf: new Date().toISOString(),
    contracts: contracts.map(({ symbol, strike, type, ltp, oi, volume, change }) =>
      ({ symbol, strike, type, ltp, oi, volume, change })),
  });

  return {
    index: indexKey,
    indexLabel: INDICES[indexKey].label,
    expiry,
    spot,
    asOf: new Date().toISOString(),
    nextUpdateAt: new Date(Date.now() + REFRESH_MS).toISOString(),
    suggestions: reconcile(raw, contracts),
  };
}

/**
 * Cached analysis for one index+expiry. Concurrent callers share the in-flight
 * request, so a burst of users still costs exactly one Gemini call.
 */
async function getSuggestions(indexKeyRaw, expiry) {
  const indexKey = String(indexKeyRaw || '').toUpperCase();
  if (!isIndex(indexKey)) throw new Error('Unknown index');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiry || ''))) throw new Error('expiry must be YYYY-MM-DD');

  const key = `${indexKey}|${expiry}`;
  const hit = cache.get(key);
  const fresh = hit && Date.now() - hit.at < REFRESH_MS;
  if (fresh) return hit.data;

  if (!inflight.has(key)) {
    const p = build(indexKey, expiry)
      .then((data) => { cache.set(key, { at: Date.now(), data }); return data; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    // A rebuild nobody is waiting on must not crash the process.
    p.catch(() => {});
  }

  // A build takes ~14s on a reasoning model. Rather than make the first caller
  // after expiry sit through it, hand back the copy we already have and let the
  // refresh land for the next one. Only a cold cache actually waits.
  if (hit) return hit.data;
  return inflight.get(key);
}

/**
 * Prove a key works by actually calling Gemini with it. Used before a key is
 * saved, so the admin screen can only go green on a credential that answered.
 */
async function verifyGemini(apiKey, model) {
  const useModel = model || DEFAULT_MODEL;
  const res = await fetch(`${GEMINI_URL(useModel)}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Reply with the single word: ok' }] }],
      // Reasoning models spend maxOutputTokens on thinking before they write, so
      // a tight ceiling returns an empty answer even when the key is fine.
      generationConfig: { temperature: 0, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(body)?.error?.message || msg; } catch { /* keep the status */ }
    throw new Error(msg);
  }
  const json = await res.json();
  const text = extractText(json);
  if (!text) throw new Error(`Gemini answered but returned no content — ${emptyReplyReason(json)}`);
  return text;
}

/**
 * The models this key can actually call today, newest-looking first. Anything
 * that cannot do generateContent is not useful to us and is dropped.
 */
async function listGeminiModels(apiKey) {
  const res = await fetch(`${MODELS_URL}?key=${apiKey}&pageSize=200`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(body)?.error?.message || msg; } catch { /* keep the status */ }
    throw new Error(msg);
  }
  const json = await res.json();
  return (json.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({
      id: String(m.name || '').replace(/^models\//, ''),
      label: m.displayName || '',
    }))
    .filter((m) => m.id && !/embedding|aqa|imagen|veo|tts/i.test(m.id))
    // Flash models are the cheap fast ones this feature wants, so float them up.
    .sort((a, b) => (b.id.includes('flash') - a.id.includes('flash')) || a.id.localeCompare(b.id));
}

module.exports = { INDICES, REFRESH_MS, DEFAULT_MODEL, getExpiries, getSuggestions, spotOf,
  verifyGemini, listGeminiModels, invalidateConfigCache,
  // exported for the self-check in scripts/aiOptions.selfcheck.js
  _pickStrikeWindow: pickStrikeWindow, _reconcile: reconcile,
  _extractText: extractText, _emptyReplyReason: emptyReplyReason };
