# agent.md — DhanFunded Trading Platform

> ## ⚠️ READ-ME-FIRST FOR ALL AGENTS ⚠️
>
> **1. This file is your single source of truth.** Read it before touching any code in this repo. Do not go exploring the codebase blind — every architectural rule, segment routing quirk, P/L convention, and historical bug fix that bit us is documented below.
>
> **2. YOU MUST UPDATE THIS FILE WHEN YOU CHANGE CODE.** This is not optional. If you:
> - add/rename/remove a model, service, route, hook, store, or socket event → update the relevant "Quick Reference" section
> - change segment routing, P/L math, settings hierarchy, or price-feed routing → update §6, §8, §9, §10
> - fix a non-obvious bug → add a new entry to **§13 Recent Fixes & Gotchas** with **Symptom / Cause / Fix / Rule** so the next agent doesn't reintroduce it
> - add a new convention or break an old one → update §18 Conventions
>
> **3. Edit in place, in the same change as your code edit.** Do not defer. Do not create a separate doc. Do not assume "the next agent will figure it out" — that is exactly how the bugs in §13 happened the first time.
>
> **4. If something in this file is wrong or stale, fix it.** A wrong agent.md is worse than a missing one. Trust the code, then update the doc to match.
>
> **Purpose**: Single source of truth for AI agents working on this codebase. Read this first.

---

## 1. Project Overview

A multi-asset trading platform supporting:

- **3 trading modes**: Netting (Indian-style, one net position per symbol), Hedging (MT5-style, multiple positions per symbol coexist), Binary (UP/DOWN time-based betting).
- **Asset classes**: Indian equity/F&O (NSE/BSE/NFO/BFO/MCX via Zerodha), Forex/Stocks/Indices/Commodities (via MetaAPI), Crypto perpetuals & options (via Delta Exchange).
- **Multi-tier roles**: User, Broker, Sub-Admin, Admin, Super-Admin, IB (Introducing Broker), Copy-trade Master/Follower.

### Tech stack

| Layer    | Stack |
|----------|-------|
| Server   | Node.js, Express 5, MongoDB (mongoose 9), Socket.IO 4, Redis (ioredis), MetaAPI SDK, ws |
| Client   | React 19, Vite 7, react-router-dom 7, Zustand 5, socket.io-client, lightweight-charts, AmCharts5, TradingView widgets |
| Auth     | JWT, bcrypt, email OTP |
| Streaming| MetaAPI WS (forex/stocks/indices/commodities), Delta Exchange WS (crypto), Zerodha Kite WS (Indian) |

---

## 2. Repository Layout

```
dhanfunded/
├── server/
│   ├── index.js                 # 11302 lines — main Express + Socket.IO entry, most API routes inline
│   ├── engines/
│   │   ├── NettingEngine.js     # 3520 lines — netting (Indian-style) order/position engine
│   │   ├── HedgingEngine.js     # 1362 lines — hedging (MT5-style) engine
│   │   └── BinaryEngine.js      # 426 lines — binary options engine
│   ├── models/                  # Mongoose schemas (40+ models)
│   ├── routes/                  # Auth, IB, copyTrade, wallet, metaApiProxy, adminEmailTemplates
│   ├── services/                # Streaming, settlement, risk, commission, currency, etc.
│   ├── utils/                   # mt5Calculations, segmentDisplayNames, tradeEditLog
│   ├── cron/settlement.cron.js  # Daily/periodic jobs
│   ├── config/database.js       # Mongo connection
│   └── tests/                   # Unit tests for netting margin/caps
├── client/
│   └── src/
│       ├── main.jsx, App.jsx    # Router + ErrorBoundary
│       ├── pages/
│       │   ├── User/            # UserLayout.jsx (2658 lines), userConfig.js, pages/{Market,Orders,Wallet,...}
│       │   ├── Admin/           # AdminLayout + 25+ admin pages (NettingSegmentSettings is 130KB)
│       │   ├── Broker/          # Sub-broker tier pages
│       │   ├── SubAdmin/, SuperAdmin/
│       │   ├── Auth/, Landing/, Legal/, PropFunding/
│       ├── components/          # ChartPanel, Header, OrderPanel, OrderBook, InstrumentsPanel, StatusBar, TVChart, IndianChart, AmStockChart
│       ├── hooks/               # useBrokerInstruments, useDeltaExchange, useMetaApiPrices, useUserPreferences, useZerodhaTicks
│       ├── store/useStore.js    # Zustand global state
│       ├── services/            # socketService, brokerSymbolUtils, pricePersistence, sounds
│       └── constants/           # nettingSegmentUi (ORDERED_WATCHLIST_CATEGORY_KEYS)
├── charting_library-master/     # TradingView Charting Library (vendored)
├── DEPLOYMENT_GUIDE.md
└── agent.md                     # ← this file
```

---

## 3. Trading Modes

| Mode    | Position model | Use case | Engine file |
|---------|---------------|----------|-------------|
| Netting | One net position per symbol per user. Opposite-side orders reduce/flip. | Indian markets (NSE/BSE/NFO/BFO/MCX) and any user who prefers it for forex/crypto. | [server/engines/NettingEngine.js](server/engines/NettingEngine.js) |
| Hedging | Multiple positions per symbol coexist (buy + sell allowed simultaneously); each position has its own SL/TP. | MT5-style global trading. | [server/engines/HedgingEngine.js](server/engines/HedgingEngine.js) |
| Binary  | Fixed-amount UP/DOWN bets with expiry; payout = `amount × payoutPercent / 100`. | Time-based betting product. | [server/engines/BinaryEngine.js](server/engines/BinaryEngine.js) |

`mode` is sent on every order request (`POST /api/orders`) and the route handler in [server/index.js](server/index.js) dispatches to the matching engine.

---

## 4. The 15 Netting Segments

`NettingSegment.name` is one of:

```
NSE_EQ, NSE_FUT, NSE_OPT,
BSE_EQ, BSE_FUT, BSE_OPT,
MCX_FUT, MCX_OPT,
FOREX, STOCKS, INDICES, COMMODITIES,
CRYPTO, CRYPTO_PERPETUAL, CRYPTO_OPTIONS
```

`HedgingSegment` uses a smaller set (FOREX, STOCKS, CRYPTO, INDICES, COMMODITIES, NSE_EQ, …).

---

## 5. Settings Resolution Hierarchy

For every order, settings (leverage, lotSize, commission, spread, swap, margin, max lots, blocked flags) are resolved in this exact order:

```
1. UserSegmentSettings    (per user × per segment override)
        ↓ fall through if not present
2. NettingScriptOverride  (per symbol within a segment)
        ↓ fall through if not present
3. NettingSegment         (segment-wide default)
```

The resolver lives in `NettingEngine.getSegmentSettingsForTrade(userId, symbol, exchange, segment, instrumentType)`.

For hedging mode, replace each model with its `Hedging*` counterpart.

---

## 6. Segment Routing — `getSegmentNameForInstrument()` ⚠️ CRITICAL

Defined at [server/engines/NettingEngine.js:958](server/engines/NettingEngine.js#L958). It decides which of the 15 segments applies to an instrument given `(exchange, segment, instrumentType, symbol)`.

**Order of checks (must not be reordered):**

1. **Delta Exchange short-circuit** (lines 969-983): `ex === 'DELTA' || 'FX_DELTA'` → CRYPTO_OPTIONS (if `C-`/`P-` prefix or option segment) else CRYPTO_PERPETUAL.
2. **Explicit exchange/segment trust** (lines 985-994): If client passed `exchange='FOREX'`, `'STOCKS'`, `'COMMODITIES'`, `'INDICES'`, `'CRYPTO'`, `'CRYPTO_PERPETUAL'`, or `'CRYPTO_OPTIONS'`, return that immediately. **This step exists specifically so a MetaAPI forex broker's `BTCUSD` (which is forex BTC/USD, not the Delta perpetual) is routed to FOREX, not CRYPTO_PERPETUAL.**
3. **Delta-style option ticker detection** (line 998): `/^[CP]-/i` → CRYPTO_OPTIONS.
4. **Major crypto perpetual regexes** (lines 1002-1013): `^(BTC|ETH|...)USD(T)?(\.P)?$` → CRYPTO_PERPETUAL.
5. **Symbol-pattern derivations** (lines 1015-1031): `isForexSymbol`, `isCryptoSymbol`, `isCommoditySymbol`, `isIndexSymbol`. Forex pattern catches cross pairs by detecting any symbol ending in a 3-letter forex code (USD/EUR/GBP/JPY/AUD/CAD/CHF/NZD).
6. **Indian exchange routing** (lines 1035-1052): `ex === 'NSE'/'BSE'/'MCX'/'NFO'/'BFO'` → maps to *_EQ/*_FUT/*_OPT using `isFutures`/`isOptions` flags.
7. **Commodity/Index pattern fallback before forex** (lines 1056-1057): MetaAPI tags XAUUSD as `exchange=FOREX`; this rule reroutes to COMMODITIES so the right brokerage is applied.
8. **Forex/Crypto/Stocks pattern fallback** (lines 1060-1065).
9. **Default**: NSE_EQ.

> **🚨 If you add a new segment or exchange, edit ALL the relevant branches AND update this section.**

---

## 7. Price Feed Routing

| Asset                          | Source              | Service file                                       | Broadcast room        |
|--------------------------------|---------------------|----------------------------------------------------|-----------------------|
| Forex / Indices / Commodities / International stocks | MetaAPI WS + REST   | [server/services/metaApiStreaming.js](server/services/metaApiStreaming.js), [metaApiMarketData.service.js](server/services/metaApiMarketData.service.js) | `prices` |
| Crypto perpetuals & options    | Delta Exchange      | [server/services/deltaExchangeStreaming.js](server/services/deltaExchangeStreaming.js) | `prices` |
| Indian equity & F&O            | Zerodha Kite WS     | [server/services/zerodha.service.js](server/services/zerodha.service.js) | `zerodha-ticks` |
| Yahoo fallback                 | Yahoo Finance       | [server/services/yahooFinanceFallback.js](server/services/yahooFinanceFallback.js) | (used when MetaAPI unavailable) |

### MetaAPI vs Delta conflict (`BTCUSD`, `ETHUSD`)

Both feeds can quote a symbol called `BTCUSD`. **Routing is decided by the `exchange` field on the watchlist instrument**, not by the symbol:

- `exchange = 'FOREX'` → MetaAPI feed, FOREX segment settings apply.
- `exchange = 'CRYPTO_PERPETUAL'` (or source = `delta_exchange`) → Delta feed, CRYPTO_PERPETUAL segment settings apply.

The client must therefore set an explicit `exchange` on every instrument it adds to the watchlist (see §10).

`isDeltaSymbol()` in [server/services/deltaExchangeStreaming.js](server/services/deltaExchangeStreaming.js) (~line 397) matches `^[A-Z]+USD$`, so it will catch forex `BTCUSD` too — that's why explicit exchange must take precedence in routing (see §6 step 2).

---

## 8. Order Flow (End-to-End)

```
Client (MarketPage.jsx → handlePlaceOrder)
   │
   │  POST /api/orders
   │  {
   │    mode: 'netting' | 'hedging' | 'binary',
   │    userId, symbol, side, volume, price,
   │    orderType, exchange, segment, lotSize,
   │    stopLoss, takeProfit, leverage, session,
   │    marketData: { bid, ask }, spreadPreApplied
   │  }
   ▼
server/index.js  (route handler around line ~778)
   │
   │  switch (mode):
   │    netting → nettingEngine.executeOrder()
   │    hedging → hedgingEngine.executeOrder()
   │    binary  → binaryEngine.executeOrder()
   ▼
NettingEngine.executeOrder()
   1. Look up Zerodha instrument metadata (lotSize, expiry, instrumentType)
   2. getSegmentNameForInstrument() — determines segment (see §6)
   3. getSegmentSettingsForTrade() — resolves effective settings (see §5)
   4. Check market hours via MarketControl
   5. Compute quantity = volume × lotSize
   6. Compute margin (mode: fixed ₹/percent/multiplier), commission, spread
   7. Validate min/max lots, leverage, free margin
   8. Look up existing position for symbol:
        - same side  → weighted-average price update
        - opp side   → reduce or flip
        - none       → create new
   9. Wallet.updateOne (deduct margin + commission)
  10. Position.create / update
  11. Trade.create (audit log)
  12. io.to(userId).emit('positionUpdate', ...)
   ▼
Client receives positionUpdate → UI re-renders
```

Pricing flows independently: streaming services keep `prices` cache fresh and broadcast to socket rooms. Client-side P/L is computed in real time from cached prices (see §9). Server only persists realized P/L on close + nightly cron.

---

## 9. P/L Calculation Conventions ⚠️ CRITICAL

The exact formula depends on whether the instrument is **Indian** or **Global** (forex/crypto/indices/commodities). Both client and server must agree.

### Server (NettingEngine.calculatePnL)

- **Indian instruments**: `pnl_INR = priceDiff × position.quantity` where `quantity = lots × lotSize`. Stored in INR; converted to USD via `currencyRateService.getUsdInr()` for the unified wallet.
- **Forex/Crypto/Indices**: MT5 formula in [server/utils/mt5Calculations.js](server/utils/mt5Calculations.js): `pnl_USD = priceDiff × contractSize × volume` (JPY pairs divide by 100).

### Client — table P/L

[client/src/pages/User/pages/MarketPage.jsx:1827](client/src/pages/User/pages/MarketPage.jsx#L1827) `calculateProfit(pos)`:

```js
if (isIndianPositionPnl(pos)) {
  // mirrors server formula
  const quantity = pos.quantity || (pos.volume * (pos.lotSize || 1)) || 0;
  return priceDiff * quantity;
}
// Forex/Crypto/Indices
const vol = pos.volume || 0;
if (symbol.includes('JPY')) return (priceDiff * 100000 * vol) / 100;
return priceDiff * getContractSize(symbol) * vol;
```

### Client — header total P/L

[client/src/pages/User/UserLayout.jsx:1102-1133](client/src/pages/User/UserLayout.jsx#L1102-L1133):

```js
const posExchange = (position.exchange || '').toUpperCase();
const isIndianPos = posExchange === 'NSE' || posExchange === 'BSE' || posExchange === 'NFO' ||
  posExchange === 'BFO' || posExchange === 'MCX' ||
  symbol.includes('NIFTY') || symbol.includes('BANKNIFTY') || symbol.includes('SENSEX') ||
  symbol.includes('FINNIFTY') || symbol.endsWith('CE') || symbol.endsWith('PE') ||
  /* …forex/crypto exclusion fallback… */;

if (isIndianPos) {
  const quantity = position.quantity || (position.volume * (position.lotSize || 1)) || 0;
  pnl = priceDiff * quantity;
} else {
  let contractSize = 100000;
  if (symbol.includes('BTC') || symbol.includes('ETH')) contractSize = 1;
  else if (symbol.includes('ADA')) contractSize = 1000;
  else if (symbol === 'XAUUSD' || symbol === 'XPTUSD') contractSize = 100;
  else if (symbol === 'XAGUSD') contractSize = 5000;
  else if (symbol === 'US100' || symbol === 'US30' || symbol === 'US2000') contractSize = 1;
  pnl = symbol.includes('JPY') ? (priceDiff * 100000 * vol) / 100 : priceDiff * contractSize * vol;
}
```

> **NEVER** use `symbol.length <= 15` as the Indian-instrument heuristic — it falsely rejects long F&O symbols like `BANKNIFTY26MAR54000CE` (21 chars) and falls through to the forex contract-size branch, producing huge bogus P/Ls.
>
> Always derive Indian-ness from `position.exchange` first, then from suffix patterns (CE/PE) and well-known index names. The current code in both files already does this; preserve that ordering.

---

## 10. Client Watchlist & `exchange` Field ⚠️

Every instrument the client puts in the watchlist must carry an explicit `exchange` field so the server's segment router (§6) and price-feed router (§7) make the right decision.

**Defaults** in [client/src/pages/User/userConfig.js](client/src/pages/User/userConfig.js):

```js
DEFAULT_FOREX:   { symbol: 'EURUSD', name: 'Euro/USD',  category: 'forex',     exchange: 'FOREX' }
DEFAULT_INDICES: { symbol: 'US30',   name: 'Dow Jones',  category: 'indices',   exchange: 'INDICES' }
DEFAULT_COM:     { symbol: 'XAUUSD', name: 'Gold',       category: 'commodity', exchange: 'COMMODITIES' }
```

**`/api/instruments`** ([server/index.js:302-405](server/index.js#L302)) injects an `exchange` field on every MetaAPI instrument it returns:

```js
exchange: cat === 'forex' || cat === 'forex_yen' ? 'FOREX'
        : cat === 'stocks' ? 'STOCKS'
        : cat === 'indices' ? 'INDICES'
        : cat === 'metals'  || cat === 'energy'  ? 'COMMODITIES'
        : '',
```

**`addBrokerInstrumentToWatchlist`** in [client/src/pages/User/pages/MarketPage.jsx](client/src/pages/User/pages/MarketPage.jsx) (~line 485) re-derives `exchange` from `category` if the broker payload is missing it.

**`instrumentExchange` resolution** in MarketPage.jsx (~line 1564-1616) — used when constructing the order payload — has cascading rules: Delta source → category string → watchlist key → MCX-symbol pattern fallback. Keep these in sync if you add new categories.

---

## 11. Models Quick Reference

| Model                       | Purpose / key fields |
|-----------------------------|----------------------|
| `User`                      | `oderId` (6-digit user id), `email`, `phone`, `wallet`, `allowedTradeModes`, `allowedCurrencies` |
| `Position`                  | `userId`, `symbol`, `side`, `volume` (lots), `quantity` (= lots × lotSize), `entryPrice`, `currentPrice`, `stopLoss`, `takeProfit`, `margin`, `swap`, `commission`, `exchange`, `segment`, `session`, `mode` |
| `Trade`                     | Closed trade history (audit log) |
| `Transaction` / `Wallet` / `WalletTransaction` | Funds + ledger |
| `NettingSegment` / `HedgingSegment` | Segment-wide defaults (commission/leverage/lots/spread/swap/marginMode/expiry) |
| `NettingScriptOverride` / `HedgingScriptOverride` | Per-symbol override of segment defaults |
| `UserSegmentSettings`       | Per-user × per-segment override (highest precedence) |
| `RiskSettings` / `UserRiskSettings` | Global + per-user risk limits (margin call, stop out, exit-only) |
| `ExpirySettings`            | F&O contract display rules (`show`, `openNextBeforeDays`, per-script tweaks) |
| `ChargeSettings`            | Brokerage tiers / spreads / leverage / fees |
| `MarketControl`             | Trading hours, tradingDays, holidays, special sessions per market |
| `ZerodhaSettings`           | Kite tokens + subscribed instruments |
| `Symbol`                    | Master symbol registry |
| `IB` / `IBCommission` / `IBCopySettings` | Introducing-broker tier |
| `CopyMaster` / `CopyFollower` / `CopyTrade` | Copy trading |
| `KYC`, `FundRequest`, `PaymentMethod`, `AdminPaymentDetail` | Funds & onboarding |
| `Notification`, `Banner`, `EmailTemplate` | Comms |
| `AdminActivityLog`, `UserActivityLog`, `AdminTradeEditLog` | Audit trails |

---

## 12. Services Quick Reference

| Service                              | Purpose |
|--------------------------------------|---------|
| `metaApiStreaming.js`                | MetaAPI WS connection, in-memory bid/ask cache, broadcast to `prices` room |
| `metaApiMarketData.service.js`       | REST fallback price fetch from MetaAPI |
| `deltaExchangeStreaming.js`          | Delta Exchange WS for crypto perpetuals & options. `isDeltaSymbol()` ~line 397 — pattern `^[A-Z]+USD$` (catches forex BTCUSD too — see §7) |
| `zerodha.service.js`                 | Kite WS for Indian instruments, LTP cache, broadcast to `zerodha-ticks` room |
| `indianFnOExpiryFilter.js`           | `istDayKey()`, `mapAdminSegmentToExpirySettingsKey()`, `filterZerodhaInstrumentsByExpirySettings()`, `computeVisibleExpiryDates()`. **`istDayKey` MUST be exported** (it is consumed by `nettingExpiryDay.js`) — see §13 fix #4. |
| `nettingExpiryDay.js`                | Determines whether a netting position expires today (IST) and triggers settlement |
| `settlement.service.js`              | Daily settlement bookkeeping; reset monthly IB stats; copy-trade fees |
| `riskManagement.service.js`          | Margin call & stop-out enforcement |
| `commission.service.js`              | Brokerage calculator (per-lot / per-crore / percent) |
| `currencyRateService.js`             | Live USD/INR rate, 60s cache |
| `copyTrade.service.js`               | Replicate master trades to followers, deduct subscription fees |
| `tradeHooks.service.js`              | Post-trade webhooks (IB tracking, copy events) |
| `pnlSharing.service.js`              | Admin/user P&L split calculation |
| `wallet.service.js`                  | Wallet CRUD + transfers |
| `email.service.js` / `emailOtp.service.js` / `emailTemplate.service.js` | Notifications |
| `yahooFinanceFallback.js`            | Last-resort price fallback |

---

## 13. Recent Fixes & Gotchas

These are the lessons baked into the current code. **Do not regress them.** When you fix a new bug, append a row.

### Fix 1 — Forex `exchange` must beat symbol patterns

**Symptom**: A forex `BTCUSD` from MetaAPI was being routed through CRYPTO_PERPETUAL settings (wrong commission, wrong leverage).
**Cause**: `getSegmentNameForInstrument()` was running the `*USD` perpetual regex before checking the explicit `exchange='FOREX'` flag.
**Fix**: Inserted the explicit-exchange short-circuits at [server/engines/NettingEngine.js:985-994](server/engines/NettingEngine.js#L985-L994), running BEFORE the crypto regexes. Also inserted server-side `exchange` injection on `/api/instruments` and category-based defaults on the client (§10).
**Rule**: Client must always send explicit `exchange`. Server router must always trust explicit exchange before pattern matching.

### Fix 2 — Indian forex pair detection

**Symptom**: Cross-pairs like `BTCAUD`, `ETHGBP`, `XRPJPY` were misclassified as crypto.
**Fix**: `isForexSymbol` at [server/engines/NettingEngine.js:1018-1020](server/engines/NettingEngine.js#L1018-L1020) now also matches any symbol ending in a 3-letter forex code (`USD`, `EUR`, `GBP`, `JPY`, `AUD`, `CAD`, `CHF`, `NZD`).

### Fix 3 — Header P/L using forex contract size for Indian F&O

**Symptom**: BANKNIFTY26MAR54000CE position showed table P/L `₹-0.44` but header P/L `₹-3,667,873.75`.
**Cause**: The "is Indian" heuristic in `UserLayout.jsx` used `symbol.length <= 15` which BANKNIFTY26MAR54000CE (21 chars) failed, so it fell through to `contractSize = 100000` (forex default) and computed `-0.44 × 100000 × 1`.
**Fix**: Replaced with exchange-field-first detection plus CE/PE suffix and known index names ([client/src/pages/User/UserLayout.jsx:1102-1133](client/src/pages/User/UserLayout.jsx#L1102-L1133)). Indian branch uses `position.quantity` directly (mirrors server).

### Fix 4 — `istDayKey is not a function` on close

**Symptom**: Closing a netting F&O position threw `Close failed: istDayKey is not a function`.
**Cause**: `istDayKey` was defined inside [server/services/indianFnOExpiryFilter.js](server/services/indianFnOExpiryFilter.js) but **omitted from `module.exports`**, so `nettingExpiryDay.js` got `undefined`.
**Fix**: Added `istDayKey` to the exports list at [server/services/indianFnOExpiryFilter.js:175-183](server/services/indianFnOExpiryFilter.js#L175-L183).
**Rule**: When you add a helper to a service file, double-check `module.exports`.

### Fix 5 — Table P/L showing micro values

**Symptom**: Table P/L printed `-0.44` instead of the rupee amount.
**Cause**: `cs = pos.lotSize || 1` — when `lotSize` was null/0, `cs` defaulted to `1`, so `priceDiff × 1 × volume` lost the lot multiplier.
**Fix**: Use `pos.quantity` directly (already includes `lots × lotSize`), see [MarketPage.jsx:1827-1843](client/src/pages/User/pages/MarketPage.jsx#L1827-L1843).

### Fix 6 — XAUUSD priced as forex

**Symptom**: Gold (XAUUSD) charged `$9/lot` (forex brokerage) instead of the COMMODITIES rate.
**Cause**: MetaAPI labels XAU as `exchange='FOREX'` and the router was respecting that.
**Fix**: Added the commodity-symbol-pattern fallback at [server/engines/NettingEngine.js:1056](server/engines/NettingEngine.js#L1056) — runs after Indian routing but before forex/crypto fallback, so symbols matching `XAU/XAG/GOLD/SILVER/OIL/BRENT/WTI` always get COMMODITIES.

### Fix 7 — Options strike-percentage validator using option premium as "underlying"

**Symptom**: NIFTY 22700 CE order rejected with `Strike 22700 is 22291 from underlying 409.35; max allowed 20.47 (5% of underlying)`. The "underlying" was nowhere near NIFTY (~22500); 409.35 was actually the **option premium of another NIFTY option**. Every strike was rejected because no strike sat within 5% of 409.

**Cause**: Three layered bugs in the underlying-LTP resolver:
1. **Client `getTickBySymbolAuto`** ([useZerodhaTicks.js:226-231](client/src/hooks/useZerodhaTicks.js#L226-L231)) had a partial-match fallback `i.symbol.startsWith(symbol)` that, when called with `'NIFTY'`, returned the first subscribed NIFTY contract — almost always an option whose `lastPrice` is the premium.
2. **Client validators** in [MarketPage.jsx:1180-1196](client/src/pages/User/pages/MarketPage.jsx#L1180-L1196) and [MarketPage.jsx:2581-2599](client/src/pages/User/pages/MarketPage.jsx#L2581-L2599) passed the bare option-root (`'NIFTY'`) plus hard-coded month strings (`'NIFTY26MARFUT'`, `'NIFTY24MARFUT'`) — neither matches the actual Zerodha index ticker `'NIFTY 50'` and the months drift out of date.
3. **Server `enrichIndianInstrumentForNetting`** ([NettingEngine.js:209](server/engines/NettingEngine.js#L209)) had `pick = fut || eq || sameRoot[0]` — if no future or equity was subscribed for the root, it grabbed any same-root entry, which was another option whose `lastPrice` is the premium. **Same bug also existed in `resolveUnderlyingQuoteSymbolForOption`** at line 317, which is used for **option intrinsic settlement at expiry** — would have computed wildly wrong P&L.

**Fix** (covers `NSE_OPT`, `BSE_OPT`, AND `MCX_OPT`):
- Added `OPTION_ROOT_TO_INDEX_NAME` mapping at [server/engines/NettingEngine.js:35-46](server/engines/NettingEngine.js#L35-L46) (`NIFTY → 'NIFTY 50'`, `BANKNIFTY → 'NIFTY BANK'`, `FINNIFTY → 'NIFTY FIN SERVICE'`, `MIDCPNIFTY → 'NIFTY MID SELECT'`, `SENSEX/BANKEX/SENSEX50` map to themselves / `'SNSX50'`). MCX commodities (`CRUDEOIL`, `GOLD`, `SILVER`, `NATURALGAS`, …) are intentionally **not** in the mapping — they have no index, so the resolver naturally lands on their futures contract which IS the correct underlying for MCX options.
- Added `_buildCurrentFutureCandidates(root)` helper at [server/engines/NettingEngine.js:48-67](server/engines/NettingEngine.js#L48-L67) which derives the current month + next 2 months in IST (e.g. `['NIFTY26APRFUT', 'NIFTY26MAYFUT', 'NIFTY26JUNFUT']`, `['CRUDEOIL26APRFUT', …]`).
- Rewrote `enrichIndianInstrumentForNetting` ([server/engines/NettingEngine.js:233-308](server/engines/NettingEngine.js#L233-L308)) and `resolveUnderlyingQuoteSymbolForOption` ([server/engines/NettingEngine.js:312-358](server/engines/NettingEngine.js#L312-L358)) so the order of preference is **index-by-name → index-by-root-segment → FUT → EQ → null**. **Never** falls back to another same-root option.
- The `isIndexEntry()` predicate (used by both `indexByName` and `indexByRootSegment`) requires `segment` to include `'INDICES'` OR `instrumentType` to be empty (not CE/PE/FUT/EQ/OPT). This is critical for `SENSEX`/`BANKEX` where the option-root and the index-name are the same string — without the segment filter, `subs.find(name === 'SENSEX')` could return a SENSEX option. With the filter, it only matches the actual index entry.
- Fixed `getTickBySymbolAuto` partial-match in [client/src/hooks/useZerodhaTicks.js:226-241](client/src/hooks/useZerodhaTicks.js#L226-L241) to skip option contracts unless the caller explicitly asked for an option (regex `/\d+[CP]E$/`).
- Added `OPTION_ROOT_TO_INDEX_TICKER` mapping + `buildCurrentFutureCandidates` + `resolveIndianUnderlyingLtp` helpers in [client/src/pages/User/pages/MarketPage.jsx:88-149](client/src/pages/User/pages/MarketPage.jsx#L88-L149). Both validators apply uniformly to `NSE_OPT`/`BSE_OPT`/`MCX_OPT` (the segment list is at [MarketPage.jsx:1220](client/src/pages/User/pages/MarketPage.jsx#L1220) and [MarketPage.jsx:2566](client/src/pages/User/pages/MarketPage.jsx#L2566)). The "not loaded" hint shows the **actual** ticker the admin needs to subscribe (e.g. `'NIFTY 50'`, `'CRUDEOIL26APRFUT'`).

**Rule** (do not regress):
- The "underlying" of an Indian option is the **index spot** (NIFTY/BANKNIFTY/SENSEX/BANKEX) or its **futures contract** (MCX commodities, stock options). **Never** another option's `lastPrice`. Any resolver that touches options must filter by `instrumentType === 'FUT'/'EQ'` or `segment === 'INDICES'` and reject same-root options.
- For NSE indices the Zerodha index `name` differs from the option-root `name` (`NIFTY` vs `'NIFTY 50'`) — translate via `OPTION_ROOT_TO_INDEX_NAME` (server) / `OPTION_ROOT_TO_INDEX_TICKER` (client).
- For BSE indices (`SENSEX`, `BANKEX`) the option-root and index-name happen to match — you MUST also filter `segment === 'INDICES'` or you'll pick a same-name option by accident.
- For MCX commodity options (`CRUDEOIL`, `GOLD`, `SILVER`, `NATURALGAS`, `COPPER`, `ZINC`, `ALUMINIUM`, etc.) there is no index. The futures contract IS the underlying, so the resolver naturally lands on `fut` and admin only needs to subscribe the current-month future.
- Never hard-code expiry months. Build them dynamically from current IST date.
- For the validator to actually run, admin must subscribe one of: the index ticker (`'NIFTY 50'` etc.), the current-month future, or (for stock options) the equity. Otherwise the band check is silently skipped server-side.

### Fix 9 — Per-user margin-call / stop-out overrides were silently ignored

**Symptom**: Admin → Risk Management lets admin set per-user `marginCallLevel` / `stopOutLevel`. The values were saved correctly, but the live stop-out check at runtime always used the global defaults — admin overrides had **no effect** even after a server restart.

**Cause** (two stacked bugs in [server/services/riskManagement.service.js:216](server/services/riskManagement.service.js#L216) and [server/models/UserRiskSettings.js:86-94](server/models/UserRiskSettings.js#L86-L94)):
1. `checkStopOut` queried `UserRiskSettings.findOne({ oderId: userOderId })`. The schema field is `userId` (an ObjectId), not `oderId`. The query **always returned `null`**, so `userSettings?.stopOutLevel` was always undefined and fell through to the global default.
2. The canonical resolver `UserRiskSettings.getEffectiveSettings()` was the right thing to call — but its `merge()` body **omitted `marginCallLevel` and `stopOutLevel` entirely**. So even if you switched callers to use it, you'd still get back an object missing those keys, and the stop-out check would silently fall back to its own hard-coded literals.

**Fix**:
- [server/models/UserRiskSettings.js:86-99](server/models/UserRiskSettings.js#L86-L99) — `merge()` now includes `marginCallLevel` (default 100) and `stopOutLevel` (default 50) in the returned object.
- [server/services/riskManagement.service.js:212-221](server/services/riskManagement.service.js#L212-L221) — `checkStopOut` now calls `UserRiskSettings.getEffectiveSettings(userOderId)` and reads `effective.marginCallLevel` / `effective.stopOutLevel`. The function takes a user-`oderId` string OR an ObjectId and resolves to the user before looking up the override.
- [server/services/riskManagement.service.js:277-285](server/services/riskManagement.service.js#L277-L285) — Fixed dead branch: `dailyLossAchieved = balance - equity` referenced an undefined `balance`. Now uses `user.wallet.balance`. (`maxDailyLoss` is still not in the schema, so the branch is dead until that field lands, but it no longer crashes.)
- [server/services/riskManagement.service.js:298-301](server/services/riskManagement.service.js#L298-L301) — `partialStopOutLevel` now read from `effective` instead of stale `userSettings`/`globalSettings` references that were removed by the refactor.
- Added regression test [server/tests/userRiskSettingsMerge.test.js](server/tests/userRiskSettingsMerge.test.js) — pure unit test (no DB) asserting that the merge always returns `marginCallLevel`/`stopOutLevel` and that user values override globals.

**Rule** (do not regress):
- **Always** call `UserRiskSettings.getEffectiveSettings(userOrderIdOrObjectId)` when reading any risk setting at runtime. Never call `UserRiskSettings.findOne(...)` directly — the wrong field name will silently return null.
- When you add a new field to `RiskSettings` / `UserRiskSettings`, you MUST also add it to the `merge()` body in `getEffectiveSettings`. Otherwise it will be silently dropped and any caller reading from `effective.fieldName` will get `undefined`.
- The `userRiskSettingsMerge.test.js` regression test mirrors `merge()` exactly. If you update one, update the other or the test will go stale.

### How risk management actually works (so future you doesn't get confused)

- **Margin level is account-wide**, not per-position. Formula: `(equity − estimatedCloseCommissions) / totalUsedMargin × 100`. `totalUsedMargin` is the sum of `marginUsed` across **all open positions** in BOTH the hedging engine AND the netting engine. There is no per-segment margin level.
- **Computed from "used margin", not balance**. `walletData.margin` = sum of margins held against currently-open trades, **not** `balance - free`.
- The check fires every **1 second** in [server/services/metaApiStreaming.js:644-653](server/services/metaApiStreaming.js#L644-L653) → `syncOpenPositionsAndLedgerRisk()` → `reconcileWalletEquityForUser` → `maybeLiquidateUser` → `checkStopOut`.
- `marginCallLevel` (default 100%) → emits a `marginCall` socket event with a warning. **Does not close anything.**
- `stopOutLevel` (default 50%) → starts closing positions one at a time, **largest loss first**, across hedging + netting, until margin level recovers above the threshold or no positions remain. Account-wide, never per-position.
- `ledgerBalanceClose` (drawdown %) → separate path in `maybeLiquidateUser`: closes **ALL** positions when `(balance − equity) / balance × 100 ≥ threshold`.
- Per-segment AND per-trade-mode `marginCallLevel`/`stopOutLevel` were dead config and have been **removed**. Margin-call / stop-out are account-wide only; configure them at `/admin/risk-management` (which writes to `RiskSettings` global + `UserRiskSettings` per-user override). Removed from: [HedgingSegment.js](server/models/HedgingSegment.js), [NettingSegment.js](server/models/NettingSegment.js), [Settings.js](server/models/Settings.js) (TradeModeSettings), [HedgingEngine.js](server/engines/HedgingEngine.js) `getSettings()` fallback, [database.js](server/config/database.js) seed, [Admin.jsx](client/src/pages/Admin/Admin.jsx) trade-mode form, and [NettingSegmentSettings.jsx](client/src/pages/Admin/pages/NettingSegmentSettings.jsx) orphan `riskManagement` block. The **per-symbol** `MarginSetting` in [ChargeSettings.js](server/models/ChargeSettings.js) was kept — it's still actively read at [server/index.js:6184](server/index.js#L6184) for pre-trade margin-call rejection on hedging orders.

### Fix 21c — Bonus auto-trigger on user deposit approvals + UI surfaces + credit lifecycle docs

**Three things in one batch**: (a) extend the Phase 2 auto-trigger to the OTHER deposit path (real user deposit-request approvals, not just admin manual wallet adjusts), (b) surface the granted bonus in the user's WalletPage and the admin Fund Management views, (c) document the credit lifecycle so future-me doesn't get confused about why credit doesn't drain on close.

#### 21c.1. The missing deposit path

Phase 2 (Fix 21b.4) wired `maybeGrantDepositBonus` into `POST /api/admin/users/:userId/wallet` — the endpoint admin uses to manually add money to a user's balance. **But that's only one of two deposit code paths.** The real production path is:

1. User opens WalletPage → fills out the deposit form → uploads proof → server creates a `Transaction` doc with `status: 'pending'`.
2. Admin opens Fund Management → Deposit Requests tab → clicks Accept on the pending row → server runs `PUT /api/admin/transactions/:id` with `{ status: 'approved' }` → that endpoint mutates `user.wallet.balance` and saves.

Phase 2 missed this second endpoint completely. Real user deposits were never auto-bonused. Only manual admin top-ups were.

**Fix** ([server/index.js:2227-2258](server/index.js#L2227-L2258)): wire `maybeGrantDepositBonus` into the approval branch of `PUT /api/admin/transactions/:id`, immediately after the line that does `user.wallet.balance += usdAmount`. The wiring is identical to the manual wallet endpoint:

```js
// ============ AUTO-TRIGGER BONUS ON APPROVED DEPOSIT — Fix 21c ============
try {
  const isFirstDeposit = !user.firstDepositAt;
  if (isFirstDeposit) user.firstDepositAt = new Date();
  const inrAmount = txCurrency === 'INR' ? amount : amount * EXCHANGE_RATE.USD_TO_INR;
  const { getCachedUsdInrRate } = require('./services/currencyRateService');
  const liveUsdInrRate = getCachedUsdInrRate();
  const { maybeGrantDepositBonus } = require('./services/bonusAutoTrigger.service');
  const autoBonus = await maybeGrantDepositBonus(user, inrAmount, isFirstDeposit, liveUsdInrRate);
  if (autoBonus) {
    transaction.bonusAmount = autoBonus.amount;
    transaction.bonusTemplateName = autoBonus.templateName || '';
  }
} catch (bonusErr) {
  console.error('[BonusAutoTrigger] Failed on deposit approval:', bonusErr.message);
}
```

The try/catch is critical for the same reason as Phase 2: a bug in the bonus path must never block a deposit approval — admin would lose the ability to credit users.

**Snapshot fields on the Transaction** ([server/models/Transaction.js:78-83](server/models/Transaction.js#L78-L83)): added two new fields so the granted bonus is permanently bound to the deposit row that triggered it:
```js
bonusAmount: { type: Number, default: 0, min: 0 },
bonusTemplateName: { type: String, default: '' },
```
This is a denormalization on purpose — the canonical record lives in `UserBonus`, but having an inline snapshot lets the Transaction history pages render "deposit X got ₹Y bonus from template Z" without joining. If the underlying template gets renamed/deleted later, the snapshot still tells the truth about what was granted at the time.

#### 21c.2. Live "eligible bonus" hint on the deposit form

**Goal**: as the user types an amount in the WalletPage deposit form, show them how much bonus they'd get if this deposit were approved right now. No more guessing. No more "wait, was the first-deposit bonus 50% or 100%?".

**New endpoint** ([server/index.js:4193-...](server/index.js#L4193)) — `GET /api/user/eligible-bonus?userId=X&amount=Y&currency=USD|INR`:
- Looks up the user, checks `firstDepositAt` to decide first vs regular deposit type
- Queries active `BonusTemplate` matching the appropriate type + minDeposit ≤ amount
- Computes the would-be bonus amount with the same math as `maybeGrantDepositBonus` (percentage / fixed + maxBonus cap)
- Returns `{ success, bonus, templateName, type, isFirstDeposit }` — `bonus: 0` if no template matches
- This endpoint is purely a preview — it does NOT mutate anything

**WalletPage wiring** ([client/src/pages/User/pages/WalletPage.jsx](client/src/pages/User/pages/WalletPage.jsx)):
1. New state: `eligibleBonus: { amount, templateName, isFirstDeposit }`
2. Debounced (300ms) effect that fires whenever `amount`, `currency`, or `activeTab` changes — calls the new endpoint and updates state
3. Hint UI directly under the amount input: a yellow-tinted card that reads `🎁 Eligible bonus: ₹X (TemplateName)` plus a `FIRST DEPOSIT` badge when applicable. Only shown when amount > 0 AND `eligibleBonus.amount > 0` AND `activeTab === 'deposit'`.

The 300ms debounce avoids hammering the API on every keystroke. The hint disappears the instant the user switches to the withdrawal tab or zeros out the amount field.

#### 21c.3. Bonus history surfaces

**WalletPage transaction history** ([client/src/pages/User/pages/WalletPage.jsx](client/src/pages/User/pages/WalletPage.jsx)): each transaction row that has `tx.bonusAmount > 0` now shows an inline yellow `🎁 +₹X BONUS` chip next to the amount. Lets the user audit their own bonus history without leaving the wallet page. Renders nothing for non-bonus rows.

**Admin Fund Management — main deposit table** ([client/src/pages/Admin/pages/FundManagement.jsx:5-20](client/src/pages/Admin/pages/FundManagement.jsx#L5-L20), [FundManagement.jsx:962-976](client/src/pages/Admin/pages/FundManagement.jsx#L962-L976)): added a new `'bonus'` column to `DEFAULT_DEPOSIT_COLUMNS` between the Amount and Status columns, with a matching `case 'bonus'` in the `renderCell` switch. The column reads `tx.bonusAmount` / `tx.bonusTemplateName` directly from the API response (the API already serializes these via the standard Transaction document). Renders `🎁 +₹X` for rows that got a bonus and an em-dash for rows that didn't. The column is only added to the deposit table — withdrawal rows can never have a bonus, so their column config is unchanged.

**Admin Fund Management — per-user ledger modal** ([client/src/pages/Admin/pages/FundManagement.jsx:1352-1389](client/src/pages/Admin/pages/FundManagement.jsx#L1352-L1389)): the ledger modal table (the per-user Transaction History view that opens when admin clicks the Ledger button on any row) ALSO got a Bonus column. Same render logic as the main table.

**Why two surfaces in the admin UI?** The main table is the live "deposit requests waiting for me" queue — admin sees the bonus PREVIEW before clicking Accept (well, actually the bonus is only set AFTER approval, so it shows on already-approved rows in the same table after they age out of pending). The ledger modal is the per-user historical drilldown — same column shows the running history. Both are useful; both share the renderCell function so there's no duplication.

#### 21c.4. Credit lifecycle — how it actually works

This is the explanation the user asked for: *"tell me credit is add to equity and apply on user trade then user close that trade how credit is used and goes to zero, can you explain me that what working of that credit"*. Documenting it here so it doesn't get re-asked.

**The equity formula** ([server/models/User.js:182](server/models/User.js#L182)):
```
equity      = balance + credit + unrealizedPnL
freeMargin  = equity − marginUsed
marginLevel = (equity / marginUsed) × 100
```
Credit is just an additive component of equity. It is NOT a separate balance the user can withdraw — it's a "phantom equity boost" that lets them open larger positions than their cash balance would otherwise allow.

**Lifecycle of one ₹5000 first-deposit bonus**:

1. **Bonus granted**. Admin approves the user's first ₹5000 INR deposit. The auto-trigger fires:
   - `wallet.balance += $60.24` (₹5000 / 83 USD/INR)
   - `wallet.credit += $60.24` (the bonus, also $60.24 because the template was 100%)
   - `wallet.equity = $60.24 + $60.24 + $0 = $120.48`
   - `wallet.freeMargin = $120.48 − $0 = $120.48`
   
   Net effect: the user has $120 of buying power even though they only deposited ₹5000.

2. **User opens a trade**. Buys 0.1 lot XAUUSD. The engine calls `user.useMargin($amount)` ([server/models/User.js useMargin](server/models/User.js)):
   - `marginUsed += $50` (the broker margin requirement for that trade)
   - `freeMargin = equity − marginUsed = $120 − $50 = $70`
   - `balance` is UNCHANGED. `credit` is UNCHANGED.
   
   **Important**: margin doesn't draw from balance OR from credit. It draws from `freeMargin`, which is the difference between equity and currently-used margin. The bonus credit just lifts the equity ceiling — it doesn't get "spent".

3. **Price moves**. Floating PnL goes to +$15. The streaming layer recomputes equity:
   - `equity = $60.24 + $60.24 + $15 = $135.48`
   - `freeMargin = $135.48 − $50 = $85.48`
   - `balance` and `credit` are still unchanged. Floating PnL never touches them.

4. **User closes the trade with +$15 profit**. The engine calls `user.releaseMargin($50)` then `user.settlePnL($15)`:
   - `marginUsed -= $50` → marginUsed = $0
   - `balance += $15` → balance = $75.24
   - `credit` is UNCHANGED. (This is the key insight.)
   - `equity = $75.24 + $60.24 + $0 = $135.48` ← matches the pre-close equity, as it should
   - `freeMargin = $135.48 − $0 = $135.48`

   **The credit did NOT get consumed by the close.** The realized PnL went into `balance`, not into `credit`. The bonus stays at $60.24 forever (until something else removes it — see below).

5. **What if the trade closed at a LOSS of $40?**
   - `marginUsed -= $50`
   - `balance += -$40` → balance = $20.24 (still positive — fine)
   - `credit` is unchanged at $60.24
   - `equity = $20.24 + $60.24 + $0 = $80.48`
   
   Note that the loss came out of balance first. Credit stayed put.

6. **What if the loss was big enough to wipe out the balance?** Say PnL = −$80:
   - `balance + (−$80)` = $60.24 − $80 = **negative**
   - The negative-balance protection in `settlePnL` ([server/models/User.js settlePnL](server/models/User.js)) caps balance at 0
   - `balance` → 0
   - `credit` is STILL $60.24
   - `equity` = $0 + $60.24 + $0 = $60.24
   
   The user's cash is gone, but they still have $60 of equity from the unconsumed bonus credit. This is the MT5 "credit absorbs losses after balance is gone" behavior — the bonus protects the user from going below zero.

   **NOTE**: in the current implementation, credit is NOT decremented when balance goes to 0 — the negative-balance cap just truncates the loss. So the bonus credit doesn't actually absorb losses; it just sits there as a permanent equity boost. If we wanted true MT5-style "credit absorbs the overflow", we'd need to extend `settlePnL` to also decrement `credit` by the truncated amount. We deliberately did NOT do this in Fix 21 — the user wanted the simpler "credit is permanent equity boost until admin removes it" model.

**When does credit go to zero, then?** Only via one of these explicit paths:
- Admin opens Wallet Adjust → Subtract → target = `credit` → server decrements `wallet.credit`. **Manual admin action.**
- Admin opens Bonus Management → cancels the user's UserBonus row. The cancel handler decrements `wallet.credit` by the bonus amount and marks the UserBonus row as `cancelled`.
- The UserBonus row hits its `expiresAt` (if the template had one set). A future scheduled job would expire it and decrement credit. **Not currently implemented** — no expiry job runs today, so credit never expires automatically. Templates with `validityDays` set will store the expiry on UserBonus but nothing acts on it yet.
- The user is deleted. (Cascade.)

**Summary table**:

| Event | balance | credit | equity | margin |
|---|---|---|---|---|
| Deposit ₹5000 + 100% bonus | +$60 | +$60 | +$120 | 0 |
| Open 0.1 lot XAUUSD | unchanged | unchanged | unchanged | +$50 |
| Price moves +$15 unrealized | unchanged | unchanged | +$15 | unchanged |
| Close at +$15 profit | +$15 | unchanged | unchanged (pnl already in equity) | -$50 |
| Close at -$40 loss instead | -$40 | unchanged | -$15 from float to realized | -$50 |
| Admin cancels bonus | unchanged | -$60 | -$60 | unchanged |
| Admin subtracts credit manually | unchanged | -$X | -$X | unchanged |

**Rule** (do not regress):
- `settlePnL` MUST settle into `balance`, NOT into `credit`. If a future change moves PnL into credit, the bonus would behave as a wagering bonus (consumable) instead of a buying-power boost (permanent), and that's not what the user asked for.
- The negative-balance cap MUST stay. Without it, a big loss could drive balance into the negatives, which breaks the equity formula and the UI display.
- The auto-trigger snapshot fields on Transaction (`bonusAmount`, `bonusTemplateName`) are denormalized for display only — the canonical bonus state lives in `UserBonus`. Don't query Transaction.bonusAmount to compute totals; query UserBonus instead.

#### 21c.5. MT5 parity — credit absorbs losses (revised lifecycle)

**User feedback after the initial Fix 21c ship**: *"i want that credit work like how mt5 work compare both logic and show me"*. Original 21c had credit acting as a permanent equity boost — losses only ate balance, never credit. Real MT5 brokers behave differently: when a loss exhausts the balance, the overflow eats credit until credit hits 0, only then does the broker absorb the rest.

**MT5 behavior (real broker)**:
1. Profit → goes to **Balance**. Credit untouched.
2. Loss → comes out of **Balance** first.
3. If `loss > Balance` → overflow eats **Credit** until credit is 0.
4. If `loss > Balance + Credit` → broker eats the rest (negative balance protection).
5. Withdrawals: only Balance is withdrawable. Credit can NEVER be withdrawn.
6. Equity = `Balance + Credit + Floating PnL` (always).

**Our previous behavior (Fix 21c original)**:
1. Profit → Balance ✓ (matches)
2. Small loss → Balance ✓ (matches)
3. Loss > Balance → balance capped at 0, **credit untouched** ✗ (doesn't match)
4. Loss > Balance + Credit → broker absorbs rest ✓ (matches by accident)
5. Withdrawals → only Balance ✓ (matches)
6. Equity formula ✓ (matches)

**Side-by-side**:

| Scenario | Real MT5 | Old (21c orig) | New (21c.5) |
|---|---|---|---|
| Bal=50, Cred=30, profit +20 | Bal 70, Cred 30 | Bal 70, Cred 30 | Bal 70, Cred 30 |
| Bal=50, Cred=30, loss −20 | Bal 30, Cred 30 | Bal 30, Cred 30 | Bal 30, Cred 30 |
| Bal=50, Cred=30, loss −70 | Bal 0, Cred 10 (20 absorbed) | Bal 0, Cred 30 (broker absorbed all 20) | Bal 0, Cred 10 (20 absorbed) ✓ |
| Bal=50, Cred=30, loss −200 | Bal 0, Cred 0 (broker ate 120) | Bal 0, Cred 30 (broker ate 150) | Bal 0, Cred 0 (broker ate 120) ✓ |

**Fix** ([server/models/User.js:227-280](server/models/User.js#L227-L280)): rewrote `settlePnL` to do MT5-style cascade:

```js
this.wallet.balance += pnl;
if (this.wallet.balance < 0) {
  const overflow = Math.abs(this.wallet.balance);
  this.wallet.balance = 0;
  if (creditBefore > 0) {
    const absorbedByCredit = Math.min(overflow, creditBefore);
    this.wallet.credit = creditBefore - absorbedByCredit;
    // remainingOverflow (if any) → broker absorbs
  }
}
const creditBurned = creditBefore - this.wallet.credit;
this.wallet.equity += pnl - creditBurned;
```

The equity adjustment subtracts `creditBurned` because credit decreased, and credit is part of equity. Without this, equity would lag credit until the next tick recalc and show a momentarily inflated value.

**Test** ([server/tests/settlePnLCreditAbsorption.test.js](server/tests/settlePnLCreditAbsorption.test.js)): 18 assertions across 8 scenarios — profit, small loss, loss > balance, catastrophic loss, exact-equal-to-balance, exact-equal-to-balance+credit, no-credit case, stats counters. All pass.

**Rule** (do not regress):
- The cascade order is: Balance → Credit → Broker. Never reverse it (credit is not the first line of defense).
- The credit decrement MUST happen inside `settlePnL`, NOT in a separate cleanup pass — otherwise the equity adjustment is wrong.
- Profits do NOT touch credit. Only losses do, and only after balance is exhausted.
- Withdrawals (in [server/index.js withdrawal path](server/index.js)) MUST continue to debit `wallet.balance` only — never `wallet.credit`. Credit stays non-withdrawable.

#### 21c.6. WalletPage hint — always show, never silently hide

**User-reported bug**: deposited ₹100 INR with a `first_deposit` template configured at `minDeposit=50`, expected to see the eligible-bonus card under the amount input. Saw nothing.

**Root cause**: the user's `firstDepositAt` was already set (they had ₹1000 credit from a previous bonus), so the eligible-bonus endpoint correctly looked for a `regular_deposit` template — but admin only configured a `first_deposit` template. Bonus = 0. The card was rendered conditionally on `eligibleBonus.amount > 0`, so it just disappeared. No feedback.

**Fix — endpoint** ([server/index.js:4193-...](server/index.js#L4193)): when the primary template type doesn't match, also query the OPPOSITE type as a fallback and return its name + amount in `fallbackType` / `fallbackTemplateName` / `fallbackBonus` fields. The user now gets enough info to understand WHY they don't qualify.

**Fix — UI** ([client/src/pages/User/pages/WalletPage.jsx](client/src/pages/User/pages/WalletPage.jsx)): the hint card now renders WHENEVER `amount > 0` on the deposit tab, regardless of whether a bonus matches. Three rendering branches:
1. **Match**: yellow card with `🎁 Eligible bonus: ₹X (TemplateName)`.
2. **No match but fallback exists**: gray card with explanation — "you've already used the first-deposit bonus" or "no first-deposit template configured".
3. **No match and no fallback**: gray card with "no active bonus templates configured for your account".

The card ALWAYS includes a permanent disclaimer block at the bottom explaining how credit works (added to equity, boosts free margin, profits go to balance, losses absorbed up to credit, not withdrawable). This is the documentation the user asked for, surfaced inline at the moment of deposit so they can't miss it.

**Rule** (do not regress):
- The hint card MUST render whenever `activeTab === 'deposit' && amount > 0`. Never gate on `eligibleBonus.amount > 0` — that hides feedback when the user needs it most.
- The credit lifecycle disclaimer is permanent (always shown when card is visible). Don't remove it under "cleaner UI" PRs — it's the only inline documentation users see.

**Verified**:
```
node -c server/index.js                              → OK
node -c server/models/User.js                        → OK
node server/tests/settlePnLCreditAbsorption.test.js  → OK (18 assertions)
node server/tests/userRiskSettingsMerge.test.js      → OK
node server/tests/optionsStrikePercent.test.js       → OK
client build                                          → OK
sanity:
  Transaction.bonusAmount path exists                → OK
  /api/user/eligible-bonus returns fallback fields   → OK
  WalletPage card renders when bonus=0               → OK (manual test)
  settlePnL credit cascade matches MT5               → OK (8 unit scenarios)
```

### Fix 21b — Bonus Management bug fixes + Phase 2 (auto-trigger on deposit)

**Three bugs fixed in Fix 21 and one new feature** (Phase 2 auto-trigger).

#### 21b.1. `next is not a function` on template create

**Symptom**: clicking Create Bonus in the modal alerted `localhost says: next is not a function`. The template was never written.

**Cause**: the BonusTemplate / UserBonus schemas used the legacy callback-based pre-save hook syntax (`schema.pre('save', function (next) { ... next(); })`). Mongoose 9.x dropped support for this — `next` is no longer passed to the callback.

**Fix** ([server/models/BonusTemplate.js:81-89](server/models/BonusTemplate.js#L81-L89), [server/models/UserBonus.js:67-75](server/models/UserBonus.js#L67-L75)): replaced both schemas' manual `createdAt`/`updatedAt` field declarations + pre-save hooks with `{ timestamps: true }` schema option. This is the convention used by 31 other models in the project (see `Trade.js`, `Settings.js`, etc.). Mongoose auto-maintains both fields and there's no callback to break.

#### 21b.2. Page layout — header floating in middle of viewport

**Symptom**: the entire Bonus Management page (header + tabs + empty state) was vertically and horizontally centered in the admin content area. Looked broken.

**Cause**: I used `<div className="page-content">` as the root. The `page-content` class is defined in [App.css:406-414](client/src/App.css#L406-L414) as a USER-side empty-state placeholder with `display: flex; align-items: center; justify-content: center;` — it's meant for "this page doesn't exist yet" stub pages. Using it inside an admin page wrapped the entire content in that flex container, vertically and horizontally centering it.

**Fix** ([client/src/pages/Admin/pages/BonusManagement.jsx:259-265](client/src/pages/Admin/pages/BonusManagement.jsx#L259-L265)): removed the `className="page-content"` and replaced with a plain `<div style={{ padding: '20px' }}>` matching how other admin pages (e.g., RiskManagement) structure their root.

**Rule**: never use `className="page-content"` in an admin page. It's a user-side flex centering class. Use a plain styled div with padding instead.

#### 21b.3. Removed Max Withdrawal + Usage Limit fields per user request

**Removed from form** ([client/src/pages/Admin/pages/BonusManagement.jsx](client/src/pages/Admin/pages/BonusManagement.jsx)): the `maxWithdrawal` and `usageLimit` fields from the Create/Edit Template modal, the EMPTY_FORM defaults, and the openEditModal seed. The card display also drops the `Used: X / usageLimit` denominator (still shows the running counter, just without the "out of N" suffix).

**Schema retention**: the underlying `BonusTemplate.maxWithdrawal` and `BonusTemplate.usageLimit` fields are KEPT in the schema as nullable optional fields. They're just not exposed in the admin UI anymore. This way:
- Existing data with these fields set isn't broken
- The server endpoint still accepts them (defaulted to null) so any future API client can pass them
- If product changes its mind, re-exposing in the UI is a one-line change

**Rule**: when removing a UI field, keep the schema field if it has any chance of being needed later. Schema removal is destructive; UI hiding is cheap to reverse.

#### 21b.4. Phase 2 — auto-trigger bonus on deposit

**Goal**: when admin adds money to a user's balance via the wallet adjust endpoint, automatically scan active BonusTemplates and grant the matching one. No more manual grant for the common path — admin just sets up "First Deposit 100% up to ₹25k" once, and every new user who deposits gets the bonus automatically.

**New User field** ([server/models/User.js:44-49](server/models/User.js#L44-L49)):
```js
firstDepositAt: { type: Date, default: null }
```
Set the FIRST time the server adds money to `wallet.balance` via the admin wallet endpoint. Used to decide between `first_deposit` template (fires once) and `regular_deposit` template (fires every subsequent deposit).

**New helper** ([server/services/bonusAutoTrigger.service.js](server/services/bonusAutoTrigger.service.js)) — `maybeGrantDepositBonus(user, depositAmountInr, isFirstDeposit, liveUsdInrRate)`:
1. Decides `wantedType = isFirstDeposit ? 'first_deposit' : 'regular_deposit'`
2. Queries active templates: `{ type: wantedType, status: 'active', minDeposit: { $lte: depositAmountInr }, endDate: null OR >= now }`. Sorted newest-first, limit 1 — first match wins.
3. Computes `amountInr` from `bonusType`/`bonusValue` + applies `maxBonus` cap.
4. **Mutates** `user.wallet.credit` (in USD-equivalent) and calls `user.updateEquity(...)`. Does NOT save the user — caller is responsible for `await user.save()` so the deposit + bonus persist atomically.
5. Creates a `UserBonus` row (this one IS saved here)
6. Increments `template.usedCount`
7. Returns the UserBonus row, or `null` if no template matched

**Wired into the wallet endpoint** ([server/index.js:4297-4322](server/index.js#L4297-L4322)) — after the balance has been mutated by the existing add path and before `user.save()`:

```js
let autoBonus = null;
if (typeNorm === 'add') {
  const isFirstDeposit = !user.firstDepositAt;
  if (isFirstDeposit) user.firstDepositAt = new Date();
  try {
    const { maybeGrantDepositBonus } = require('./services/bonusAutoTrigger.service');
    autoBonus = await maybeGrantDepositBonus(user, inrAmount, isFirstDeposit, liveUsdInrRate);
  } catch (bonusErr) {
    console.error('[BonusAutoTrigger] Failed to grant bonus:', bonusErr.message);
    // Don't fail the deposit — admin can grant manually if this errors
  }
}
await user.save();
```

**Defensive failure**: the auto-trigger is wrapped in try/catch so a bug in the bonus path can never block a deposit. Worst case the bonus isn't auto-granted and the admin has to grant it manually via the Add/Deduct tab. The error is logged.

**Response augmentation** ([server/index.js:4365-4376](server/index.js#L4365-L4376)): when an `autoBonus` is granted, the success message gets a `\n🎁 Bonus auto-applied: ₹X (TemplateName)` line and the response body includes an `autoBonus` field for any client that wants to handle it specifically.

**The auto-trigger path uses the SAME bonus math** as the manual grant endpoint. Both paths share the percentage/fixed calc, the maxBonus cap, the USD-equivalent storage conversion, the equity recompute, and the `usedCount` increment. They differ only in:
- Manual grant: admin picks `templateId` + provides `depositAmount`
- Auto-trigger: server picks the first matching template based on the actual deposit amount + first/regular flag

**End-to-end flow**:

1. Admin creates template "First Deposit 100% up to ₹25k" (type: `first_deposit`, percentage: 100, minDeposit: 500, maxBonus: 25000)
2. Admin opens user `123456` → Adjust Wallet → `Add Funds`, currency `INR`, amount `5000`
3. Server: `wallet.balance += $60.24` (5000/83), `walletINR.totalDeposits += 5000`, etc.
4. **Auto-trigger fires**: `firstDepositAt` was null → `isFirstDeposit = true` → finds the matching template → computes `100% × 5000 = 5000` → capped at 25000 (no change) → `wallet.credit += $60.24` → creates UserBonus row
5. `user.save()` persists everything in one shot
6. Admin sees toast: *"credited ₹5000 INR (~$60.24 USD in trading wallet)\n🎁 Bonus auto-applied: ₹5000.00 (First Deposit 100% up to ₹25k)"*
7. User logs in → footer shows `Bal: ₹5000 | Credit: ₹5000 | Equity: ₹10000` etc.
8. Same user deposits again later → `firstDepositAt` is set → `isFirstDeposit = false` → server looks for `regular_deposit` template instead → grants that one (or null if none configured)

**Rule** (do not regress):
- The `firstDepositAt` field is set on the FIRST `'add'` operation. Don't move that logic into the helper — it has to happen in the endpoint scope so the calling endpoint can persist it via the existing `user.save()`.
- The helper MUTATES the user but does NOT save. The endpoint always saves once at the end. Don't call `user.save()` inside the helper or you'll get a double-save with race-condition risk.
- The helper IS allowed to save the BonusTemplate (incrementing `usedCount`) and the UserBonus row (creating it) — those are separate documents. Only the User mutation is deferred.
- The auto-trigger MUST be in a try/catch. A bug in the bonus path must never block a deposit — that would cause real damage (admin can't add money to user). The current code logs and continues.
- If you add a third trigger type (e.g., `inactivity_reload`), extend the helper's `wantedType` decision logic, NOT the endpoint. The endpoint just calls the helper.
- The helper picks the FIRST matching template, sorted by `createdAt` desc. If admin has overlapping templates (two first_deposit templates both matching the same minDeposit), the newer one wins. Document this behavior in admin help text if confusion arises.

**Verified**:

```
node -c server/index.js                              → OK
all 6 unit tests                                     → OK
client build                                         → OK (bundle: index-C6V1m8NF.js)
sanity checks:
  bonusAutoTrigger module loads                      → OK
  maybeGrantDepositBonus is fn                       → OK
  User.firstDepositAt path exists                    → OK
  BonusTemplate validateSync after timestamps fix    → OK
  UserBonus validateSync after timestamps fix        → OK
```

### Fix 21 — Bonus Management (MT5-style templates + per-user grants)

**Goal**: full MT5-style bonus management. Admin defines reusable bonus templates ("First Deposit 100% up to ₹25k", "Diwali Reload Bonus", etc.), then grants them to users either manually or via deposit triggers (Phase 2). Each grant lands on `user.wallet.credit` (the field Fix 20 wired into the footer + equity calculation), so the existing credit infrastructure does all the heavy lifting — Fix 21 is purely the templating + audit layer on top.

**Phase 1 scope** (this commit) — manual grant only. Auto-trigger on deposit is deferred to Phase 2 because it requires hooking into the deposit flow + tracking "is this the user's first deposit" state on the User model. The admin UI is fully functional and the grant button works against any user.

**New schemas**:

- [server/models/BonusTemplate.js](server/models/BonusTemplate.js) — admin-defined reusable bonus rule. Fields: `name`, `type` (`first_deposit`/`regular_deposit`/`reload`/`special`), `bonusType` (`percentage`/`fixed`), `bonusValue`, `minDeposit`, `maxBonus`, `maxWithdrawal`, `wagerRequirement`, `duration` (days), `usageLimit`, `endDate`, `status`, `description`, `usedCount` (running counter, server-incremented on every grant), `createdBy`. Indexed on `(status, type)`.

- [server/models/UserBonus.js](server/models/UserBonus.js) — one row per "bonus granted to a user". Snapshots the template fields at grant time (`templateName`, `type`, `wagerRequirement`) so the row keeps displaying correctly even if the template is later deleted or edited. Fields: `userId` (User.oderId), `templateId` (nullable for custom grants), `templateName`, `type`, `amount` (₹), `depositAmount`, `wagerRequirement`, `wagerProgress`, `status` (`pending`/`active`/`completed`/`expired`/`cancelled`), `grantedAt`, `expiresAt`, `completedAt`, `cancelledAt`, `notes`, `grantedBy`, `cancelledBy`. Indexed on `(userId, status)` and `templateId`.

**New routes** ([server/index.js:3868-4159](server/index.js#L3868-L4159)):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/bonus-templates` | List all templates |
| `POST` | `/api/admin/bonus-templates` | Create template |
| `PUT` | `/api/admin/bonus-templates/:id` | Update template (preserves `usedCount`) |
| `DELETE` | `/api/admin/bonus-templates/:id` | Delete template (existing UserBonus rows are unaffected — they snapshot the template fields) |
| `GET` | `/api/admin/user-bonuses` | Paginated list with optional `userId`/`status`/`type` filters |
| `POST` | `/api/admin/user-bonuses/grant` | Grant a bonus (template-based OR custom amount). Bumps `wallet.credit`, creates UserBonus row, increments `template.usedCount` |
| `POST` | `/api/admin/user-bonuses/:id/cancel` | Cancel an active bonus. Subtracts the same INR amount from `wallet.credit` (clamped to 0). Sets `status: 'cancelled'` |

**Grant flow** (`POST /api/admin/user-bonuses/grant`):

1. Validate user exists
2. If `templateId` is provided:
   - Load template, verify `status === 'active'`, not past `endDate`, `usedCount < usageLimit`
   - Verify `depositAmount >= template.minDeposit`
   - Compute `amountInr` from `bonusType`/`bonusValue`/`depositAmount` + apply `maxBonus` cap
3. Else (custom grant): use `amount` from body directly
4. Convert `amountInr` → USD-equivalent: `creditUsd = amountInr / liveUsdInrRate`
5. `user.wallet.credit += creditUsd` and call `user.updateEquity(floatingPnl)` to recompute equity + free margin
6. Create `UserBonus` row with `expiresAt = now + duration days`
7. Increment `template.usedCount` and save

**Cancel flow** mirrors the grant but in reverse — subtracts `amount/liveUsdInrRate` from `credit`, clamps to 0, sets `status: 'cancelled'` and `cancelledAt`.

**Why INR-only at the API surface but USD-equivalent at storage**: per Fix 20, `wallet.credit` is stored as USD-equivalent so the existing equity / free-margin / margin-level math (which is in USD) doesn't need any rewrites. The admin enters in INR, the server converts at the live rate, the user sees INR in the footer (where the conversion is reversed). Round-trip-consistent.

**Admin page** ([client/src/pages/Admin/pages/BonusManagement.jsx](client/src/pages/Admin/pages/BonusManagement.jsx)) — single new page with three tabs:

1. **Bonus Templates** — grid of cards (one per template). Each card shows name, type badge, bonus %, min deposit, max bonus, wager, duration, used count, status. ✎ edit and 🗑 delete buttons. "+ Create Bonus" button opens a 12-field modal.
2. **User Bonuses** — sortable table of all granted bonuses with columns: Granted, User, Template, Type, Amount (₹), Wager, Expires, Status, Cancel button. Pulls from `/api/admin/user-bonuses`.
3. **Add/Deduct Bonus** — form with userId field, template dropdown (active templates only), depositAmount input (when template is selected), custom amount input (when template is blank), notes, and a Grant button.

**Wiring**:

- [client/src/pages/Admin/pages/index.js:24](client/src/pages/Admin/pages/index.js#L24) — `export { default as BonusManagement }`
- [client/src/App.jsx:32](client/src/App.jsx#L32) — added to the lazy import block
- [client/src/App.jsx:4812](client/src/App.jsx#L4812) — new route `/admin/bonus-management`
- [client/src/pages/Admin/adminConfig.js:23](client/src/pages/Admin/adminConfig.js#L23) — new sidebar entry between PnL Sharing and Zerodha Connect, icon 🎁

**Dependency on Fix 20**: this fix REQUIRES Fix 20 to be in place. Specifically:
- `User.wallet.credit` field (already in the schema since the start)
- `User.updateEquity()` method including credit in the equity formula
- `UserLayout` reading `data.wallet.credit` instead of hard-coding 0 (the bug fix from Fix 20)
- The Credit segment in the footer that displays the bonus

If you reverted Fix 20, the bonus would still be granted (the row created, the `wallet.credit` field updated) but the user wouldn't see it in the footer and the equity math wouldn't include it.

**What's NOT in Phase 1 (deferred)**:

- **Auto-trigger on deposit**: when a user makes their first deposit, automatically scan active `first_deposit` templates and grant the matching one. Requires a `firstDepositAt` field on User. Same for `regular_deposit` on subsequent deposits. Will need a hook in the existing balance-add path (`/api/admin/users/:userId/wallet` with `target: 'balance'`).
- **Wager progress tracking**: increment `wagerProgress` on every closed trade. Auto-flip status from `active` → `completed` when `wagerProgress >= wagerRequirement * amount`.
- **Auto-expiry cron**: scheduled job that marks `active` bonuses as `expired` when `expiresAt < now`. The expiry would also subtract the unused portion from `wallet.credit`.
- **User-facing bonus history**: a section on the user's WalletPage showing their active bonuses + wager progress. For Phase 1, users only see the aggregate `Credit:` segment in the footer.
- **Reload bonus** semantics (Phase 2 trigger): the `reload` type currently behaves identically to `regular_deposit`. Phase 2 needs to define "user is inactive for X days then deposits" as the trigger condition.

**Verified**:

```
node -c server/index.js                                  → OK
all 6 unit tests                                         → OK
client build                                             → OK (bundle: index-D9JGgc33.js)
schema sanity:
  BonusTemplate.type enum:    first_deposit,regular_deposit,reload,special
  BonusTemplate.bonusType enum: percentage,fixed
  UserBonus.status enum:       pending,active,completed,expired,cancelled
  UserBonus.type enum:         first_deposit,regular_deposit,reload,special
```

**Rule** (do not regress):
- The grant endpoint MUST call `user.updateEquity(...)` after mutating `wallet.credit`. Without it, the user's footer Credit segment updates but the Equity / Free Margin segments stay stale until the next position-poll cycle. Same applies to cancel.
- Always snapshot `templateName`, `type`, `wagerRequirement` onto the `UserBonus` row at grant time. Never look them up from the template at display time — the template might have been deleted or edited and the historical record should be accurate.
- The grant endpoint MUST validate `usageLimit` BEFORE incrementing `usedCount`. Otherwise the limit is off-by-one.
- The cancel endpoint clamps `wallet.credit` at 0 with `Math.max(0, ...)`. Without the clamp, if the user has already used some of their bonus credit on margin and the admin cancels, `wallet.credit` could go negative and break every downstream margin calculation. The clamp is defensive — the credit may not be fully reversible.
- New bonus types added to either schema enum MUST also be added to the `TYPE_LABELS` and `TYPE_COLORS` maps in `BonusManagement.jsx`. Otherwise the badge renders raw enum text and looks broken.
- The page is INR-only (per Fix 20). Don't add a USD toggle to the bonus form — the user explicitly rejected USD for bonuses in Fix 20.
- When you build Phase 2 (auto-trigger on deposit), the trigger code should call the SAME grant endpoint (`POST /api/admin/user-bonuses/grant`) so all the validation, equity recompute, and `usedCount` increment logic stays in one place. Don't bypass it by writing directly to the schemas.

### Fix 20 — MT5-style bonus credit (admin grant + footer display, INR-only)

**Goal**: let admins grant a "bonus credit" to users (like MT5's bonus/credit feature). Credit counts toward equity and free margin per the MT5 convention but is NOT withdrawable. INR-only entry and display — no USD option in the bonus path.

**Pre-existing infrastructure** (already in place before Fix 20):
- `User.wallet.credit` field — exists in schema since the start, defaults to 0
- `User.updateEquity(unrealizedPnL)` already computes `equity = balance + credit + unrealizedPnL` per MT5 spec
- The free-margin / margin-level / stop-out math already uses equity, so credit naturally flows through
- App.jsx footer was already reading `walletData.credit` (just needed to be forced to INR)
- The admin wallet adjust endpoint at [server/index.js:3868](server/index.js#L3868) already existed for balance adjustments

**The bug that was hiding all of this**: [client/src/pages/User/UserLayout.jsx:1049](client/src/pages/User/UserLayout.jsx#L1049) had `const credit = 0;` hard-coded. Even though the server returned `wallet.credit` correctly and the recompute math at lines 1147/1166 used `balance + credit + totalPnL`, the credit was always being fed in as 0. Fixing this single line surfaced the entire credit flow.

**Server changes** ([server/index.js:3868-3960](server/index.js#L3868-L3960)) — extended the admin wallet adjust endpoint:
- New `target` body param: `'balance'` (default, back-compat) or `'credit'`
- When `target === 'credit'`:
  - Mutates `user.wallet.credit` instead of `user.wallet.balance`
  - Calls `user.updateEquity(floatingPnl)` to recompute equity + free margin from the new credit
  - Does NOT touch `walletUSD`/`walletINR` ledgers (credit is not real cash)
  - Subtract validates against current credit (not balance) — admin can't deduct more bonus than the user has
  - Returns `{ target: 'credit' }` in the response so the client knows which side was modified
- The existing balance path is unchanged for back-compat. Existing admin UI flows that don't pass `target` default to `'balance'` and behave exactly as before.

**Client UserLayout fixes** ([client/src/pages/User/UserLayout.jsx:1048-1062](client/src/pages/User/UserLayout.jsx#L1048-L1062)):
- `const credit = Number(data.wallet.credit) || 0;` (was `const credit = 0;`)
- The no-positions branch now computes `equity = balance + credit` instead of `equity = balance` and writes the credit into `walletData`
- The recompute branch at lines 1147/1166 already used `balance + credit + totalPnL` correctly — it just needed credit to be non-zero

**Footer Credit segments — INR-only** ([client/src/pages/User/UserLayout.jsx:2519-2535](client/src/pages/User/UserLayout.jsx#L2519-L2535) desktop, [2645-2655](client/src/pages/User/UserLayout.jsx#L2645-L2655) mobile, [client/src/App.jsx:4568-4577](client/src/App.jsx#L4568-L4577) App.jsx):
- New Credit segment renders ONLY when `walletData.credit > 0`
- Always displayed in **INR** regardless of the `displayCurrency` toggle. Format: `₹<credit × (usdInrRate + usdMarkup)>`. Color: amber `#fbbf24` so users can spot it as bonus.
- Position in the bar: between `Bal:` and `Equity:` so the visual reading order matches the math (`Bal + Credit → Equity`)

**Why INR-only**: the user explicitly said "i want all currency in inr and in bonus management also work in inr not in usd". Two reasons make this the right call:
1. The product is India-targeted — rupees are the primary mental model for users
2. Round-trip consistency — if admin grants ₹83000 bonus, the user should see ₹83000 (not "$1000" with the USD/INR toggle). Locking to INR removes any conversion confusion.

**Admin UI changes** ([client/src/pages/Admin/pages/UserManagement.jsx:131](client/src/pages/Admin/pages/UserManagement.jsx#L131), [1665-1748](client/src/pages/Admin/pages/UserManagement.jsx#L1665-L1748)):
- New "Target" selector in the wallet adjust modal: `[Balance]` vs `[Credit (Bonus)]`
- When admin clicks `Credit (Bonus)`:
  - `currency` is auto-set to `'INR'`
  - The currency selector (USD/INR buttons) is **hidden** entirely
  - The Amount label shows "Amount (₹) — INR only for bonus" with an amber tag
  - The placeholder changes to "Enter bonus amount in ₹"
  - The Add/Subtract dropdown labels switch to "Add Bonus"/"Deduct Bonus"
  - A small explanation appears: "Bonus credit counts toward equity & free margin (MT5 convention) but is NOT withdrawable. INR only — amount entered in ₹ and displayed in ₹ in the user's footer."
- When admin clicks `Balance`, the currency selector reappears and the modal behaves exactly as before (USD or INR adjust against `wallet.balance` and the multi-currency ledgers)
- The default `target` is `'balance'` so existing admin workflows are unchanged

**Conversion at the server**: when the admin sends `currency: 'INR'`, the server already converts via `usdAmount = adjustAmount / liveUsdInrRate` (line 3905). For bonus credit, the `usdAmount` is what gets stored in `wallet.credit`. Display in the user's footer reverses the conversion: `creditUsd × usdInrRate` to show INR. Round-trip-consistent.

**Multi-currency ledger isolation**: the credit path explicitly does NOT touch `walletUSD.balance` or `walletINR.balance`. Only `wallet.credit` (the trading-account credit field) is mutated. Bonus is bookkeeping inside the trading account; it doesn't affect deposit/withdrawal accounting.

**Rule** (do not regress):
- Bonus credit is INR-only at the UI layer. Don't add a USD button to the credit path in the admin modal — the user explicitly rejected USD for bonuses.
- The footer Credit display MUST always use INR formatting regardless of the `displayCurrency` toggle. Don't make it follow the toggle "for consistency" — that would break the round-trip with the admin entry.
- Credit storage stays in the underlying USD-equivalent (`wallet.credit`) so the existing equity/margin/free-margin math doesn't need to change. Only the display layer enforces INR.
- The credit path in the admin endpoint MUST call `user.updateEquity(...)` after mutating the credit field. Without it, `wallet.equity` stays stale and the user's footer shows the old equity until the next position-tick recompute.
- The credit path MUST NOT touch `walletUSD` or `walletINR`. Bonus is not real cash — it has no place in the multi-currency deposit/withdrawal ledger. If you ever build a bonus-to-balance "convert" feature, that's a separate flow.
- The Credit segment in the footer renders only when `credit > 0`. Don't show "Credit: ₹0" — it's noise. If you want a permanent slot, mark it visibly as "no bonus".

### Fix 19b — Per-leg close confirm modal (replaces window.confirm)

**Symptom**: User reported the per-fill ✕ button on Active Trade rows showed an ugly browser `window.confirm` dialog ("localhost:5173 says Close BUY 1.00 lot leg of ETHUSD?"). Wanted a styled modal that matches the parent close-modal-pro look — but **without** the partial-close slider and the Close All button (those don't make sense for a single fill).

**Fix** — replaced `window.confirm` with a stripped-down version of the parent close modal in both MarketPage and OrdersPage. The new modal reuses the existing `close-modal-pro` CSS class (so it matches the parent visually) but renders only:
- Header: side badge + symbol + leg volume
- Body: a small info panel showing fill entry, close price, and a hint that realized PnL uses the fill's own entry
- Single primary "Close Fill" button (becomes "Closing…" + disabled while the POST is in flight)

**No partial slider, no Close All** — closing 0.5 of a 1-lot leg would just create an even smaller leg (which the FIFO engine already supports via the parent close modal's partial path), and "Close All" has a different meaning (all positions, not all legs of one position).

**MarketPage state additions** ([client/src/pages/User/pages/MarketPage.jsx:524-535](client/src/pages/User/pages/MarketPage.jsx#L524-L535)):
```js
const [legCloseConfirmOpen, setLegCloseConfirmOpen] = useState(false);
const [legCloseConfirmLeg, setLegCloseConfirmLeg] = useState(null);
const [legCloseConfirmParent, setLegCloseConfirmParent] = useState(null);
const [legCloseConfirmPrice, setLegCloseConfirmPrice] = useState(0);
const [legCloseConfirmBusy, setLegCloseConfirmBusy] = useState(false);
```

**Refactored handler** ([MarketPage.jsx:closeLegHandler + confirmLegClose](client/src/pages/User/pages/MarketPage.jsx#L702-L772)) — split the old single-function handler into:
- `closeLegHandler(leg, parentPos)` — resolves the price up-front, opens the modal. No longer async, no longer makes the POST.
- `confirmLegClose()` — the actual POST, called by the modal's Close button. Manages the busy flag so the button can show a "Closing…" state during the round-trip.
- `closeLegConfirmModal()` — clears state on cancel.

The price resolution logic (try `livePrices[leg.symbol]`, fall back to `parentPos.currentPrice` etc.) was preserved as-is — it still runs before the modal opens so the modal can display the resolved price.

**Modal JSX** ([MarketPage.jsx:4187-4248](client/src/pages/User/pages/MarketPage.jsx#L4187-L4248)) — wrapped in an IIFE so it can compute `unitLabel` (`'shares'` for Indian cash equity, `'lots'` otherwise) from the resolved segment without polluting the parent component scope. Reuses the existing `close-modal-pro`, `close-modal-header`, `close-position-badge`, `close-modal-body`, `close-actions-row`, `close-action-btn` CSS classes — no new styles needed.

**OrdersPage parity** ([OrdersPage.jsx:65-72, 488-540, 1255-1316](client/src/pages/User/pages/OrdersPage.jsx#L488-L540)) — same pattern. No `parentPos` because OrdersPage uses its own `legsPosition` state for the modal context. The unit label is hardcoded to `'lots'` because OrdersPage doesn't track the Indian cash equity segment-mode flag.

**Sound preserved**: the `tradingSounds.playPartialClose()` call from Fix 19 fires inside `confirmLegClose` on success, `tradingSounds.playError()` on failure. The modal-based flow doesn't change the audio behavior.

**Rule** (do not regress):
- Don't add a "Close All" button to the per-leg modal. "Close All legs of this position" is already what the parent close modal's "Close Position" button does — duplicating it here would confuse users.
- Don't add a partial slider. Closing a partial of one leg would either need new server-side support OR would just route through the existing partial-close path on the parent (which doesn't know about leg granularity). Keep it simple: one button, closes the whole leg.
- The busy flag (`legCloseConfirmBusy`) is critical — without it, double-clicking the Close Fill button would fire two parallel close requests and the second one would see `type !== 'open'` and fail with a 400. The button MUST be disabled while the POST is in flight.
- Keep the modal styled with `close-modal-pro` so any future restyle of the parent close modal automatically applies here too. Don't fork the CSS.

### Fix 19 — Audible feedback on every close path (partial, per-fill, SL/TP)

**Symptom**: User reported that partial closes and SL/TP hits play no sound. Only the standard full close from the close modal made the trade-closed beep. They asked for sound on every close action.

**Audit of close paths and their pre-fix sound state**:

| Path | Trigger | Sound before | Sound after |
|---|---|---|---|
| User clicks "Close Position" in close modal | `handleClosePosition` (UserLayout:1475) — full vol | `playTradeClosed` ✅ | `playTradeClosed` ✅ |
| User enters partial vol in close modal | Same — `volumeToClose < position.volume` | `playTradeClosed` (no distinction) | **`playPartialClose` (NEW softer 2-tone)** |
| User clicks ✕ on Active Trade leg row | MarketPage `closeLegHandler` → `POST /api/positions/close-leg` | ❌ none | **`playPartialClose`** |
| User clicks ✕ on leg row in OrdersPage | OrdersPage `closeLegHandler` | ❌ none | **`playPartialClose`** |
| Per-fill SL fires server-side | `metaApiStreaming._checkPerFillSLTP` emits `legClosedBySLTP` socket | ❌ none | **`playSLHit` (NEW sharp drop)** |
| Per-fill TP fires server-side | Same emit | ❌ none | **`playTPHit` (NEW ascending major-third)** |
| Position-level SL fires | `metaApiStreaming._checkPerFillSLTP` parent loop emits `positionClosedBySLTP` | ❌ none | **`playSLHit`** |
| Position-level TP fires | Same emit | ❌ none | **`playTPHit`** |
| Account-wide stop-out | `riskManagement.checkStopOut` emits `stopOut` socket | notification only | **`playSLHit` + notification** |

**New sound variants** ([client/src/utils/sounds.js:120-167](client/src/utils/sounds.js#L120-L167)):

- **`playPartialClose()`** — softer 2-tone descending beep (880Hz → 698Hz), ~70ms each. Quieter and shorter than `playTradeClosed` so users can audibly distinguish a partial close from a full close.
- **`playSLHit()`** — sharp square-wave attack (D♯5) followed by a sine drop to G♯4. The square wave gives it a buzzy "loss" feel distinct from any other sound. Use for: per-fill SL, position-level SL, account stop-out.
- **`playTPHit()`** — bright ascending sine pair (C5 → E5, a major third). Feels like a positive cash-register chime. Use for: per-fill TP, position-level TP.

**Trigger sites** (5 files touched):

1. [client/src/pages/User/UserLayout.jsx:1559-1570](client/src/pages/User/UserLayout.jsx#L1559-L1570) — `handleClosePosition` now branches: `closingVol < position.volume` → `playPartialClose`, otherwise `playTradeClosed`. Uses a 1e-9 epsilon to avoid float compare bugs.

2. [client/src/pages/User/pages/MarketPage.jsx:closeLegHandler](client/src/pages/User/pages/MarketPage.jsx#L702-L725) — added `tradingSounds.playPartialClose()` on success and `tradingSounds.playError()` on failure (was silent on both before).

3. [client/src/pages/User/pages/OrdersPage.jsx:closeLegHandler](client/src/pages/User/pages/OrdersPage.jsx#L487-L510) — same. Required adding `import tradingSounds from '../../../utils/sounds'` at the top of the file.

4. [client/src/services/socketService.js:139-188](client/src/services/socketService.js#L139-L188) — added 2 new socket listeners (`legClosedBySLTP`, `positionClosedBySLTP`) plus extended the existing `stopOut` listener with `playSLHit()`. Each new listener:
   - Plays the appropriate sound based on `data.reason` (`'tp'` → TPHit, `'sl'` → SLHit, fallback → standard close)
   - Dispatches a `tradeNotification` custom event with profit info so the UI's notification system shows a toast

5. The socket events themselves (`legClosedBySLTP`, `positionClosedBySLTP`) were already being emitted by [server/services/metaApiStreaming.js:_checkPerFillSLTP](server/services/metaApiStreaming.js#L398-L569) — Fix 11 added them but no client listener existed. Fix 19 closes the loop.

**Why partial close uses a distinct sound from full close**: a user partial-closing 0.5 of a 2-lot position still has a 1.5-lot position open. If the sound were identical to a full close, they might think the whole position closed. The softer/shorter beep tells them "something closed but not everything". Same logic for per-fill close (✕ on a leg row) — it's conceptually a partial action against the parent position.

**Rule** (do not regress):
- Every close code path that the user can experience MUST play a sound. The 9 paths in the table above are the canonical list. If you add a new close path (e.g., a new API endpoint that closes positions), wire `tradingSounds.playXxx()` into both the success and error branches.
- Server-side automated closes MUST emit a socket event (`legClosedBySLTP`, `positionClosedBySLTP`, or similar) so the client can react. Without the event, the user only sees the change on the next position-poll cycle and hears nothing.
- The `playPartialClose` / `playSLHit` / `playTPHit` variants are intentionally distinct timbres. Don't unify them — the audible difference is the whole point. If you add a new sound variant, follow the same pattern: short (<200ms total), envelope-shaped, single call, no looping.
- The `socketService.js` listeners use `try { ... } catch (_) {}` around each `tradingSounds.playXxx()` call. Keep that pattern — Web Audio can throw if the user hasn't interacted with the page yet, and a silent failure is better than a broken socket handler.

### Fix 18 — History grouping (parent row + expandable children)

**Symptom**: User reported that closed Active Trades and FIFO-consumed legs weren't appearing in History at all, and that there was no remark explaining WHY a position closed (SL? TP? user? aggregate?). They wanted: "if 1 trade is closed → show in history with remark; if average position close then merge all partial close and info is shown under that trade info in history of partial close".

**Root cause** (three problems stacked):
1. The History endpoint at [server/index.js:1149](server/index.js#L1149) filtered `type ∈ {'close', 'partial_close', 'binary'}` — so the `'consumed'` type added in Fix 10 was silently excluded. Every FIFO-consumed leg never appeared in History.
2. There was no concept of grouping. A full close that FIFO-consumed 5 legs created 1 audit row + 5 consumed rows — and the 5 consumed rows were either invisible (filter) or would have been 5 unrelated standalone rows.
3. Position-level SL/TP fired by the monitor closed N legs as N independent `'close'` rows with no parent summary — the user would see N rows for one event with no way to tell they were related.

**Schema additions** ([server/models/Trade.js:64-78](server/models/Trade.js#L64-L78)):
- `groupId: { type: String, default: null, index: true }` — generated by the server when a single close action produces multiple Trade docs. Atomic closes (user clicks ✕ on one leg, single per-fill SL/TP) leave it null.
- `isHistoryParent: { type: Boolean, default: false }` — exactly ONE doc per group is marked `true`. That doc appears in the flat History list. The others are children, fetched on demand.

**Filter rule for the flat History list**:
```js
$or: [
  { groupId: null },                  // atomic closes
  { groupId: { $exists: false } },    // legacy pre-Fix-18 rows
  { isHistoryParent: true }           // explicit parents
]
```

**Close paths and their grouping** (5 distinct flows):

| Path | Where | Group? | Parent row | Children |
|---|---|---|---|---|
| User full close via close modal | [NettingEngine.js:closePosition full-close branch](server/engines/NettingEngine.js#L2966-L3009) | yes — `fullCloseGroupId` | the existing `type:'close'` audit row marked parent | FIFO-consumed legs inherit groupId via `_consumeOpenLegsFIFO(..., groupId)` |
| User partial close via close modal | [NettingEngine.js:partial-reduce branch](server/engines/NettingEngine.js#L3140-L3179) | yes — `partialGroupId` | the `type:'partial_close'` audit row marked parent | FIFO-consumed legs |
| User clicks ✕ on one Active Trade row | [NettingEngine.js:closePositionLeg](server/engines/NettingEngine.js#L3650-L3660) called from `POST /api/positions/close-leg` with no groupId | no | the leg itself becomes atomic `type:'close'` | none |
| Per-fill SL/TP fires on one leg | [metaApiStreaming.js:_checkPerFillSLTP per-fill loop](server/services/metaApiStreaming.js#L398-L457) | no — single leg, atomic | leg becomes `type:'close'`, `closedBy:'sl'/'tp'` | none |
| Position-level SL/TP fires | [metaApiStreaming.js:_checkPerFillSLTP parent loop](server/services/metaApiStreaming.js#L485-L569) | yes — `posGroupId` generated, then used for each closePositionLeg call | NEW summary `type:'close'` row inserted with `isHistoryParent:true`, `entryPrice = parent.avgPrice`, `volume = sum(legs)`, `profit = sum(leg profits)` | each closePositionLeg call writes a child row |

**Standardized remark labels** (locked-in matrix from the user clarification):

| Cause | Stored remark | History color |
|---|---|---|
| User clicked ✕ on a leg row | `'User (per-fill)'` | gray |
| User clicked X on close modal (full or partial) | `'User'` | gray |
| Per-fill SL fired (monitor) | `'SL (per-fill)'` | red |
| Per-fill TP fired (monitor) | `'TP (per-fill)'` | green |
| Position-level SL fired | `'SL'` | red |
| Position-level TP fired | `'TP'` | green |
| FIFO-consumed by aggregate close | `'Aggregate Close'` | gray |
| Account-wide stop-out | `'Stop Out'` | dark red |
| Auto square-off (intraday MIS rollover) | `'Auto Square-Off'` | amber |
| Admin closed | (existing) `'Admin'` | gray |
| Expiry settlement | (existing) `'Expiry'` | gray |

**Endpoint changes** ([server/index.js:1149-1218](server/index.js#L1149-L1218)):
- `GET /api/trades/:userId` — filter widened to include `'consumed'` AND the `groupId/isHistoryParent` `$or` clause. Children of groups are now hidden from the flat list.
- `GET /api/trades/group/:userId/:groupId` — **NEW**. Returns all docs sharing a groupId where `isHistoryParent !== true`, sorted oldest-first. Used by the client when the user expands a parent row.

**Client — MarketPage History tab** ([MarketPage.jsx:380-420](client/src/pages/User/pages/MarketPage.jsx#L380-L420), [3902-4040](client/src/pages/User/pages/MarketPage.jsx#L3902-L4040)):
- New state: `expandedHistoryGroupId`, `historyChildrenByGroup` (cache), `historyChildrenLoadingFor`.
- New `fetchHistoryGroupChildren(groupId)` callback hits the new endpoint and caches by groupId so re-expand is instant.
- Each parent History row gets a chevron `▸/▾` button if `trade.groupId` is set. Clicking it toggles `expandedHistoryGroupId`. Atomic rows (no groupId) don't get a chevron — they're terminal.
- When expanded, an inline child sub-table renders beneath the parent with columns: `Time | Type | Vol | Entry | Close | P/L | Remark`. Type labels: `Consumed`, `Partial`, `Close`. Color-coded same as the parent row remark.
- Remark colors widened in the parent row to handle the new labels (`SL (per-fill)`, `TP (per-fill)`, `Aggregate Close`, `Auto Square-Off`).

**Client — OrdersPage History** ([OrdersPage.jsx:368-405, 732-740, 764-772](client/src/pages/User/pages/OrdersPage.jsx#L368-L405)):
- The existing legs modal (opened by clicking a History row) was reused. `fetchNettingLegs` now branches: if `pos.groupId` is set, it fetches `/api/trades/group/...` (children of THIS specific close action). Otherwise it falls back to the legacy `/api/trades/legs/:userId/:orderId` path which returns ALL legs for the parent position (used for open positions and pre-Fix-18 history rows).
- Remark colors widened in both the mobile card and desktop table renderers.

**Backwards compatibility**:
- Existing Trade docs created before Fix 18 have no `groupId` field (Mongoose returns undefined for missing fields). The flat-list filter's `$or: [{ groupId: null }, { groupId: { $exists: false } }]` covers both cases — legacy rows still appear as standalone entries.
- The remark labels are additive — old data with `remark: 'SL'` (without the `(per-fill)` suffix) still color-codes correctly because the client's color logic checks both variants.
- No migration needed.

**Rule** (do not regress):
- A row is in the flat History list iff `groupId IS NULL OR isHistoryParent === true`. Don't add a new close path that writes Trade docs without honoring this. Atomic = no groupId. Group = exactly one parent + N children.
- When you add a new close site that creates multiple Trade docs in one action, generate ONE groupId at the top of the action and pass it to every doc-creating call. Set `isHistoryParent: true` on exactly one doc (the summary row).
- The `'consumed'` type is in the History endpoint filter SO legacy data still appears. Don't remove it from the type whitelist or pre-Fix-18 consumed legs disappear.
- The FIFO consumption helper (`_consumeOpenLegsFIFO`) takes `groupId` as its 5th parameter. If you call it with only 4 parameters (the legacy signature), the consumed legs become standalone history rows and the parent → children grouping breaks.
- The position-level SL/TP monitor MUST insert a parent summary row after walking legs, otherwise the user sees N independent leg-close rows for one event. The summary's `entryPrice` should be `parent.avgPrice` (the position's averaged entry, not any single leg's entry) so the row matches the user's mental model of "the position closed".
- If you add a new remark label, also add it to the color-mapping in BOTH MarketPage's history render AND OrdersPage's mobile card + desktop table renderers (3 sites).

### Fix 17 — Auto-square-off at 15:30 + per-side option expiry-day margin

**Two unrelated issues bundled.**

#### 17a. NSE / NFO / BFO auto-square-off moved from 15:15 → 15:30

**Symptom**: User reported intraday positions were getting auto-removed at 15:15 IST while the market was still open until 15:30 — they were losing the last 15 minutes of trading. Also pointed out that the last LTP tick arrives at 15:30 (close), so closing 15 minutes earlier could miss the actual session close price.

**What was happening**: Two distinct "remove" code paths exist —
1. **Auto square-off** (intraday MIS → either CF conversion or close) at [server/engines/NettingEngine.js:85-93](server/engines/NettingEngine.js#L85-L93). Was using 15:15 because that's Zerodha's convention (15-min buffer before close).
2. **Option expiry settlement** (when an option contract expires today and gets settled at intrinsic value) at [server/engines/NettingEngine.js:438-447](server/engines/NettingEngine.js#L438-L447). Already used 15:30 (correct).

The user was seeing #1 fire and assumed it was #2.

**Fix**: changed `squareOffTime` from `'15:15'` → `'15:30'` for `NSE`, `NFO`, `BFO` in [NettingEngine.js:85-93](server/engines/NettingEngine.js#L85-L93). MCX kept its `23:25` extended-hours value. Also updated four other 15:15 defaults that copy the same intent:
- [server/engines/NettingEngine.js:1501](server/engines/NettingEngine.js#L1501) `getSettings()` fallback
- [server/config/database.js:56](server/config/database.js#L56) seed
- [server/models/Settings.js:26](server/models/Settings.js#L26) schema default
- [client/src/pages/Admin/Admin.jsx:218](client/src/pages/Admin/Admin.jsx#L218) trade-mode form initial state

**Trade-off accepted**: zero buffer between auto-close trigger and the LTP cutoff. If LTP feed has any latency, the very last close might miss the actual session close by a tick. The product team accepted this — giving users the full 15 extra minutes is more important than cushioning against feed lag.

**Rule** (do not regress):
- The five 15:30 defaults must stay in sync. If you change one, change all five — there is no single source of truth for this value yet (could be refactored, but the duplication is small).
- Don't reintroduce `15:15` as a default anywhere for NSE/NFO/BFO — it was deliberately rejected.
- MCX `squareOffTime` of `23:25` is correct for MCX's extended-hours convention. Don't bring it forward to 23:30.

#### 17b. Per-side option expiry-day margin

**Symptom**: User noticed that the segment "Expiry Day" settings group has a single field `expiryDayIntradayMargin` (label "Expiry day margin (times)") that's used for futures AND options AND buy AND sell. The non-expiry-day path already has 4 fields (`optionBuyIntraday`, `optionBuyOvernight`, `optionSellIntraday`, `optionSellOvernight`) — but on expiry day, those 4 collapse into 1. User wants buy/sell variants on expiry day too.

**Design — strict FUT / OPT separation (Fix 17b clarification)**:
- Added two new schema fields: `expiryDayOptionBuyMargin`, `expiryDayOptionSellMargin` — both **option-only**
- Kept the existing `expiryDayIntradayMargin` field — now **futures-only**
- **No cross-fallback**: option orders never look at the futures field, futures orders never look at the option fields. The user explicitly asked for this separation.
- Backwards-compatible at the data layer (no migration needed — existing data keeps the field but the reader simply doesn't consult it for option orders)
- Admin UI gates each field:
  - `expiryDayIntradayMargin` has `futureOnly: true` → shows N/A on `NSE_OPT`, `BSE_OPT`, `MCX_OPT`, `CRYPTO_OPTIONS`
  - `expiryDayOptionBuyMargin` + `expiryDayOptionSellMargin` have `optionOnly: true` → show N/A on `NSE_FUT`, `BSE_FUT`, `MCX_FUT`

**Schema additions** (3 schemas, identical fields on each):
- [server/models/NettingSegment.js:317-336](server/models/NettingSegment.js#L317-L336)
- [server/models/NettingScriptOverride.js:265-279](server/models/NettingScriptOverride.js#L265-L279)
- [server/models/UserSegmentSettings.js:432-444](server/models/UserSegmentSettings.js#L432-L444)

**Merge** (`UserSegmentSettings.getEffectiveSettingsForUser`):
- [server/models/UserSegmentSettings.js:769-783](server/models/UserSegmentSettings.js#L769-L783) — `expBuyUserScript` / `expSellUserScript` flags + `fixedExpiryDayOptionBuy/SellAsPercent` flags computed from segment-level percent mode.
- [server/models/UserSegmentSettings.js:1063-1080](server/models/UserSegmentSettings.js#L1063-L1080) — new fields included in the merged output object with the standard `userSetting → scriptOverride → pickLotCapBase(segment)` precedence chain.

**Reader update** ([server/engines/NettingEngine.js:412-468](server/engines/NettingEngine.js#L412-L468)):
The signature of `resolveExpiryDayMarginAmount` changed from `(segmentSettings, { volume, quantity, price })` to `(segmentSettings, ctx)` where `ctx = { volume, quantity, price, side, isOptionsInstrument }`. **Strict FUT/OPT separation** (no cross-fallback):
1. If `isOptionsInstrument === true` → use the side-specific field ONLY (`expiryDayOptionBuyMargin` for BUY, `expiryDayOptionSellMargin` for SELL). If both are blank → return `null`. The futures field is NEVER consulted for option orders.
2. Else (futures path) → use `expiryDayIntradayMargin` ONLY with `fixedExpiryDayIntradayAsPercent`. The option fields are NEVER consulted for futures orders.

**Call sites** updated to pass `side` + `isOptionsInstrument`:
- [server/engines/NettingEngine.js:2581-2599](server/engines/NettingEngine.js#L2581-L2599) — `executeOrder` (new orders)
- [server/engines/NettingEngine.js:3777-3790](server/engines/NettingEngine.js#L3777-L3790) — pending-order trigger / market-order replay path

**Admin UI** ([client/src/pages/Admin/pages/NettingSegmentSettings.jsx:236-264](client/src/pages/Admin/pages/NettingSegmentSettings.jsx#L236-L264)):
- Renamed the existing field's label from "Expiry day margin (times)" to "Expiry day margin (futures)" with `futureOnly: true` flag
- Added two new fields with `optionOnly: true`: "Expiry day option BUY margin" and "Expiry day option SELL margin"
- Extended `isFieldNA` ([NettingSegmentSettings.jsx:709-720](client/src/pages/Admin/pages/NettingSegmentSettings.jsx#L709-L720)) to honor `field.futureOnly` (N/A on segments where `optionApplies === true`) and `field.optionOnly` (N/A on segments where `optionApplies === false`). Existing `expiryHoldApplies` segment-level gate still applies first (so the entire group is hidden on FOREX/STOCKS/EQ/CRYPTO_PERPETUAL/INDICES/COMMODITIES).

**Admin endpoint** ([server/index.js:9163-9192](server/index.js#L9163-L9192)):
- Added `expiryDayOptionBuyMargin`, `expiryDayOptionSellMargin` to the destructure + the `findByIdAndUpdate` payload for the `UserSegmentSettings` PUT route.
- The `NettingSegment` and `NettingScriptOverride` PUT routes use `{ ...req.body }` so they pass through automatically.

**Tests** ([server/tests/nettingMarginAndCaps.unit.js](server/tests/nettingMarginAndCaps.unit.js)):
- Original 3 single-field assertions kept (regression coverage for the futures path).
- Per-side assertions:
  - BUY uses `expiryDayOptionBuyMargin` (not the SELL field, not the futures field)
  - SELL uses `expiryDayOptionSellMargin`
  - **Strict separation**: options with both per-side fields blank → returns `null` (no fallback to futures field)
  - **Futures (`isOptionsInstrument: false`) ignores per-side fields entirely**, even when set
  - Per-side percent mode (`fixedExpiryDayOptionBuyAsPercent: true`)
  - **Strict separation**: per-side override of `0` (blank) → returns `null`, does NOT fall back to futures field

**Rule** (do not regress):
- `resolveExpiryDayMarginAmount` MUST be called with the full `ctx` object (`{ volume, quantity, price, side, isOptionsInstrument }`). Calling it with just `{ volume, quantity, price }` (the old signature) silently degrades — for option orders, `isOptionsInstrument === undefined` falls into the futures-path branch and reads the WRONG field. If you add a third call site, copy the full ctx.
- **Strict FUT/OPT separation**: option orders use ONLY the per-side fields, futures orders use ONLY the single field. There is NO cross-fallback. Don't add a "if option per-side is blank, try futures field" branch — the user explicitly rejected that and the unit test locks the strict behavior in.
- A per-side value of `0` (or `null`) is treated as "blank" and the function returns `null` for option orders. Only `> 0` activates the option path. Same for the futures field.
- The admin UI gates fields with `field.optionOnly` and `field.futureOnly` flags consumed by `isFieldNA`. If you add a new expiry-day field, set the appropriate flag — otherwise it shows on segments where it has no meaning and admin gets confused.
- When you add a new field to `NettingSegment`, you MUST also add it to `NettingScriptOverride`, `UserSegmentSettings`, AND wire it into the `getEffectiveSettingsForUser` merge. Otherwise the script-override and user-override layers silently break for that field. The 3 schemas + merge is the canonical 4-touch pattern.

### Fix 16 — TradingView chart background pure black/white per theme

**Symptom**: User wanted the TradingView chart pane to be solid **black** in dark mode and solid **white** in light mode. The default dark theme uses TradingView's `#131722` (a very dark blue-grey) which read as "navy" against the rest of the app's pure-black surfaces.

**Fix** ([client/src/components/TVChart/TVChartContainer.jsx:71-92](client/src/components/TVChart/TVChartContainer.jsx#L71-L92)): widened the existing `paneProperties.background` override block from "pane only" to a full set of overrides covering the candle pane, the price/time scale gutters, the grid lines, and the toolbar. All five colors flip on `theme === 'Dark'`:

| Override | Dark | Light |
|---|---|---|
| `toolbar_bg` | `#000000` | `#ffffff` |
| `paneProperties.background` | `#000000` | `#ffffff` |
| `paneProperties.vertGridProperties.color` | `#1a1a1a` | `#e6e6e6` |
| `paneProperties.horzGridProperties.color` | `#1a1a1a` | `#e6e6e6` |
| `scalesProperties.backgroundColor` | `#000000` | `#ffffff` |
| `scalesProperties.lineColor` | `#1a1a1a` | `#e6e6e6` |
| `scalesProperties.textColor` | `#d1d4dc` | `#363a45` |

**Why all five overrides instead of just the pane**: changing only `paneProperties.background` leaves the price-axis (right side) and time-axis (bottom) gutters at the TradingView default colors, which look mismatched against a pure-black or pure-white pane. The grid lines also need slightly adjusted contrast — `#1a1a1a` on black is barely visible (intentional, so candles dominate) and `#e6e6e6` on white is the same idea inverted.

Also updated the position-line close-button background at [TVChartContainer.jsx:344](client/src/components/TVChart/TVChartContainer.jsx#L344) from `#1e222d` → `#000000` so it blends with the new pane background.

**Theme wiring**: the `theme` prop comes from MarketPage's `isDark` toggle at [MarketPage.jsx:3472](client/src/pages/User/pages/MarketPage.jsx#L3472) (`theme={isDark ? 'Dark' : 'Light'}`), which is sourced from `useOutletContext()` and reflects the global dark/light mode toggle in the user layout. No additional wiring needed.

**Rule** (do not regress):
- Always update **both** the pane color AND the scale (axis) colors when changing chart background. They live under different override paths and are easy to miss.
- The grid line colors should be a **slightly different shade** from the background (not the same), or the grid disappears entirely. Use `#1a1a1a` against `#000000` and `#e6e6e6` against `#ffffff` as the baseline.
- The position-line close-button `bgColor` (in `updatePositionsLines`) MUST match the pane background, otherwise the round close button stands out as a visible square instead of looking like part of the line.
- Don't use `#131722` anywhere — that's the TradingView default and the product team explicitly rejected it in favor of pure black.

### Fix 15 — Resizable order-book panel (click-to-grab, click-to-drop)

**Goal**: let the user resize the bottom Positions/Pending/History/Cancelled panel by tap-grabbing a handle, moving the mouse, and tap-dropping with a second click. Smooth motion (no stuttering, no transition lag).

**Why click-to-grab instead of standard drag**: the user explicitly asked for *"when i click and then move up that order book move up but when i second click it lies their where my mouse movement is click"* — i.e., a stateful toggle pattern, not a hold-and-release drag. Some users prefer this for accessibility / touchpad ergonomics (no need to hold a button while moving).

**State** ([client/src/pages/User/pages/MarketPage.jsx:373-426](client/src/pages/User/pages/MarketPage.jsx#L373-L426)):
- `orderBookHeight` — current height in pixels (default 250 to match the original CSS)
- `isResizingOrderBook` — boolean: are we in resize mode right now?
- `orderBookResizeRafRef` — RAF id for throttling pointer-driven state updates

**Effect** ([MarketPage.jsx:382-426](client/src/pages/User/pages/MarketPage.jsx#L382-L426)) — only runs when `isResizingOrderBook === true`:
- `mousemove` listener: computes `newHeight = clamp(120, maxH, viewportH − e.clientY − statusBarH)` where `maxH = viewportH − 200` (keeps at least 200px reserved for the chart). Wraps the state update in `requestAnimationFrame` so we never re-render faster than the browser can paint, regardless of mouse polling rate (matters for high-DPI mice that fire 1000+ events/sec).
- `click` listener: any click anywhere on the page exits resize mode.
- **Critical detail**: listeners are attached via `setTimeout(..., 0)` so the same click that flipped `isResizingOrderBook` to `true` doesn't immediately get caught by the new window listener and flip it back. Without this, the panel would never enter resize mode.
- Cleanup removes all listeners and cancels any pending RAF.

**JSX** ([MarketPage.jsx:3520-3573](client/src/pages/User/pages/MarketPage.jsx#L3520-L3573)) — a thin 8px-tall handle inserted ABOVE `<div className="order-book">`:
- `onClick` enters resize mode (only if not already resizing). Calls `e.stopPropagation()` so this click doesn't immediately bubble to a parent that might also handle clicks.
- Visual: gradient background (subtle white when idle, blue when active) + a small 36×3 horizontal pill in the center as a grab indicator. Cursor is `ns-resize`.
- The order book itself gets `style={{ height, maxHeight, transition }}` where transition is `none` during active drag (to follow the mouse with zero lag) and `0.12s ease-out` otherwise (so any non-drag programmatic height change is still smooth).

**The CSS at [client/src/App.css:1788-1796](client/src/App.css#L1788-L1796) still defines `height: 250px; max-height: 250px;`** — the inline `style` overrides it. I deliberately did NOT touch the CSS so the default-state behavior (and any other consumer of `.order-book`) stays exactly as-is. Inline style wins specificity wars.

**Smoothness**:
- 60fps cap via RAF — no jank from mouse polling > 60Hz
- Zero CSS transition during drag — panel position is exactly where the mouse is, no easing lag
- 0.12s ease-out transition only when NOT dragging — handles edge cases like the panel "letting go" or any programmatic height change
- `userSelect: 'none'` on the handle to prevent text-selection drag artifacts

**Min/max bounds**:
- Min: 120px (keeps at least the tab row + a few rows of data visible)
- Max: `viewportH − 200` (keeps at least 200px reserved for the chart above)
- These are computed from `window.innerHeight` on every move so they auto-adapt to viewport resize

**Press-and-hold drag (Fix 15b)** — replaced the click-to-grab/click-to-drop toggle with the standard `mousedown → drag → mouseup` pattern. Reasons:
- More intuitive for keyboard/mouse users (matches every other resizable splitter on the web).
- No need for the entry-click-ignore flag — `mousedown` and `mouseup` are separate event types, so there's no risk of the entry event bubbling to the exit handler.
- Works naturally with native browser drag affordances (cursor stays as `ns-resize` for the entire hold).

Implementation:
- Handle uses `onMouseDown={(e) => { e.preventDefault(); setIsResizingOrderBook(true); }}`. The `preventDefault` stops the browser from starting a text-selection drag elsewhere on the page.
- Overlay uses `onMouseUp={() => setIsResizingOrderBook(false)}` plus `onMouseLeave` as a defensive secondary release (covers cursor exiting the viewport without releasing the button).
- Window `blur` listener in the same `useEffect` releases resize mode if the browser window loses focus — covers the edge case of releasing the mouse button OUTSIDE the browser window (where neither overlay handler can fire).
- The `orderBookResizeIgnoreFirstClickRef` flag from Fix 15a was removed — no longer needed because mousedown/mouseup are distinct event types.

**Iframe-overlay (Fix 15a)** — initial implementation used `window.addEventListener('mousemove', ...)`, which silently broke when the cursor entered the TradingView `<iframe>`. Iframes capture pointer events from their parent page, so the resize panel got "stuck" the moment the user moved up over the chart.

The fix: while `isResizingOrderBook === true`, render a transparent full-viewport overlay `<div>` with `position: fixed; inset: 0; zIndex: 99999; cursor: ns-resize` AT THE TOP of the JSX tree so it stacks above the iframe. Move the `mousemove`/`click` handlers from `window` to React props on the overlay (`onMouseMove`, `onClick`). The overlay catches every mouse event regardless of what's underneath because it's the topmost element in the stacking context.

- [client/src/pages/User/pages/MarketPage.jsx:373-415](client/src/pages/User/pages/MarketPage.jsx#L373-L415) — state + RAF cleanup effect (no more window listeners). New `orderBookResizeIgnoreFirstClickRef` flag is set on entry and cleared in the next macrotask via `setTimeout(0)` so the bubbled entry click is ignored by the overlay's `onClick`.
- [client/src/pages/User/pages/MarketPage.jsx:3520-3553](client/src/pages/User/pages/MarketPage.jsx#L3520-L3553) — overlay JSX, conditionally rendered when `isResizingOrderBook === true`. Inline style: `position: fixed; inset: 0; zIndex: 99999; cursor: ns-resize; background: transparent; userSelect: none`. The transparent background keeps the chart fully visible while resizing — the user sees the chart through the overlay but their cursor's events go to the overlay.
- New helper `computeOrderBookHeightFromY(clientY)` ([MarketPage.jsx:392-398](client/src/pages/User/pages/MarketPage.jsx#L392-L398)) extracts the height-from-Y math so both the overlay handler and any future caller (touch handlers, keyboard nudges) use the same clamping rules.

**Rule** (do not regress):
- The handle MUST use `onMouseDown` (not `onClick`) and call `e.preventDefault()` inside it. Without preventDefault, the browser starts a text-selection drag and the overlay's mousemove will track the wrong target. Without onMouseDown specifically (using onClick instead), the user has to click-release-click instead of holding.
- The overlay MUST be at z-index higher than ANY iframe on the page. The TradingView widget renders inside an iframe at typical z-index 1-100, so 99999 is safe. If you ever add a modal at z-index 100000+, this overlay needs to also exceed that or the modal will swallow resize events.
- The overlay MUST have `pointerEvents: auto` (the default) — never set `pointerEvents: none` or events fall through to the iframe and the bug returns.
- The overlay MUST handle BOTH `onMouseUp` AND `onMouseLeave`. mouseUp covers the normal release case; mouseLeave covers when the cursor exits the viewport with the button still held. Plus the window `blur` listener for the truly-outside-browser-window case.
- The transition during `isResizingOrderBook === true` MUST be `none`. Any easing introduces visible lag between mouse position and panel position.
- Use RAF throttling, not setState directly on every mousemove. Without throttling, a 1000Hz mouse fires 1000 React renders per second.
- DO NOT switch back to `window.addEventListener` for the mousemove handler. Iframes capture pointer events from window-level listeners. The overlay is the only reliable way to keep the resize working over the chart.

### Fix 14 — Swap is always a deduction + SL/TP placement hint in order panel

**Two unrelated issues bundled into one fix.**

#### 14a. Swap sign

**Symptom**: Position rows in MarketPage showed `SWAP +₹3.00` (green, like a credit). User expected swap to behave like commission — always a debit.

**Cause**: `calculateSwap` returned `swapValue * lots * contractSize` (with the same sign as the admin's `swapLong`/`swapShort` setting). MT5 convention is that swap CAN be a credit on favorable carry trades, so the original code preserved the admin's sign. But the product team chose for this app to treat swap as a fixed fee — admins shouldn't have to remember to enter negative numbers, and users shouldn't ever see swap as a credit.

**Fix** (engine — both engines):
- [server/engines/NettingEngine.js:1582-1611](server/engines/NettingEngine.js#L1582-L1611) — `calculateSwap` now computes the raw value the same way as before, then returns `-Math.abs(raw)`. Whatever sign the admin enters in `swapLong`/`swapShort`, the result is always a debit.
- [server/engines/HedgingEngine.js:308-326](server/engines/HedgingEngine.js#L308-L326) — same change to keep the two engines consistent.

**Verified**:

```
NE positive points input (swapLong=0.5):    -0.5  ✓
NE negative points input (swapLong=-0.5):   -0.5  ✓
NE positive money input (swapLong=5,2lots): -10   ✓
NE negative percent input:                  -2.74 ✓
NE zero input:                               0    ✓ (no charge)
HE positive points input (swapLong=1):      -1    ✓
```

The downstream code at [NettingEngine.js:1693-1700](server/engines/NettingEngine.js#L1693-L1700) (and the hedging equivalent) does `wallet.balance += swapAmount` — adding a negative is a debit, so the wallet correctly drops by the absolute value.

**Rule** (do not regress):
- `calculateSwap` is the SOLE source of swap signs in both engines. If you add a new swap-related code path, route it through this method instead of duplicating the math.
- Admin can enter `swapLong`/`swapShort` as positive or negative — both produce a debit. Document this in admin help text if you ever build it.
- This deviates from MT5 standard. If a future product decision wants per-symbol "favorable carry" credits, you'll need a flag like `chargeOnly: true` and to lift the `-Math.abs` behind it.

#### 14b. SL/TP placement hint in the order entry panel

**Symptom**: User asked for the SL and TP input fields in the order entry panel to show the allowed band the same way the Limit Price field already does (e.g., *"Between $67777.3800 and market (1% (≈684.62))"*).

**Cause**: Pre-fix, the SL and TP inputs at [client/src/pages/User/pages/MarketPage.jsx:2840-2865](client/src/pages/User/pages/MarketPage.jsx#L2840-L2865) had no band hint at all. Server-side validation (Fix 12) would reject SL/TP that violated the limit-away band, but users only saw the error AFTER submitting the order.

**Fix** ([client/src/pages/User/pages/MarketPage.jsx:2849-2918](client/src/pages/User/pages/MarketPage.jsx#L2849-L2918)): added a hint span beneath each input that mirrors the existing limit-price band hint at lines 2668-2691. Reuses the existing helper `getNettingStopSlmAwayOffset` so the band math stays in one place. Reflects the same constraint as the server-side `validateSLTPPlacement` (Fix 12):

| Position side | Field | Hint when limit-away configured | Hint when not configured |
|---|---|---|---|
| BUY | SL | *"At or below \<market − away\> (1% (≈684.62))"* | *"Must be below \<market\>"* |
| BUY | TP | *"At or above \<market + away\> (1% (≈684.62))"* | *"Must be above \<market\>"* |
| SELL | SL | *"At or above \<market + away\> (...)"* | *"Must be above \<market\>"* |
| SELL | TP | *"At or below \<market − away\> (...)"* | *"Must be below \<market\>"* |

The hint only renders when `entryPrice > 0` (i.e., a live tick has arrived). Reference price = `entryPrice` (the order panel's tracked current price), same as the existing limit-price hint.

**Why this is display-only**: the actual rejection still happens server-side in `executeOrder` via `validateSLTPPlacement`. The hint is purely UX — telling the user what value would pass before they submit. If you change the server-side band rules, you must also update `getNettingStopSlmAwayOffset` (or the underlying `limitAwayPercent`/`limitAwayPoints` reads) so the two stay in sync.

**Rule** (do not regress):
- The hint helper `getNettingStopSlmAwayOffset` (and `getNettingLimitAwayOffset`) at [MarketPage.jsx:58-86](client/src/pages/User/pages/MarketPage.jsx#L58-L86) mirrors the server's reading of `limitAwayPoints`/`limitAwayPercent`. If you add a third precedence rule (e.g., script override), update both client and server in lockstep.
- The band hint is for the order-entry SL/TP only. The per-fill leg edit modal (Fix 11) and parent position modify modal don't have this hint yet — see follow-up below.

**Follow-up extension (Fix 14c)**: the band hint was extended to the **per-fill leg edit modal** and the **parent position modify modal** in MarketPage, plus the per-fill leg edit modal in OrdersPage.

- New reusable helper `renderSLTPModalHint(side, refPrice, segSettings, kind, symbol)` at [client/src/pages/User/pages/MarketPage.jsx:478-518](client/src/pages/User/pages/MarketPage.jsx#L478-L518) — pure JSX-returning callback. Same band math as the order panel hint, but degrades to a direction-only fallback when `segSettings` is null. Reused by both leg-edit and parent-modify modals.
- **Per-fill leg edit modal** ([MarketPage.jsx:3744-3808](client/src/pages/User/pages/MarketPage.jsx#L3744-L3808)) — wrapped in an IIFE that resolves `refPrice = legEditParentPos.currentPrice || legBeingEdited.entryPrice` and `segForHint = (legSymbol === selectedSymbol) ? segmentSettings : null`. The match check is necessary because the in-scope `segmentSettings` is for the currently-selected order-panel symbol, which may differ from the leg's symbol. When they don't match, the hint degrades to direction-only — server-side validation still applies on submit.
- **Parent position modify modal** ([MarketPage.jsx:3854-3911](client/src/pages/User/pages/MarketPage.jsx#L3854-L3911)) — same wrapper pattern. `refPrice = selectedPosition.currentPrice || entryPrice || avgPrice`, same symbol-match check for `segForHint`.
- **OrdersPage leg edit modal** ([OrdersPage.jsx:1044-1131](client/src/pages/User/pages/OrdersPage.jsx#L1044-L1131)) — has no `segmentSettings` context (it's a standalone page that doesn't load order-panel state), so the inline `renderHint` helper is **direction-only** by design. The server still enforces both direction AND limit-away on submit via `validateSLTPPlacement` (Fix 12).

**Why not fetch segment settings on demand** *(applied to Fix 14d below — superseded)*: there's an existing `GET /api/user/segment-settings/:segmentName` endpoint, but it requires the segment NAME, not the symbol. The symbol-match-or-direction-only fallback covered the common case without any new API calls. Fix 14d below adds the missing symbol-based endpoint and per-symbol cache, so this limitation no longer exists.

**Rule** (do not regress):
- If you add a third place that renders SL/TP inputs in a modal, reuse `renderSLTPModalHint` from MarketPage. Resolve `segSettings` via `resolveSegForSymbol(symbol)` so it picks up either the in-scope value or the cache.
- The hint is purely UX. Server-side `validateSLTPPlacement` (Fix 12) is the source of truth — never weaken or remove that to "match" the hint.

#### 14d. SL/TP modal hints work for any symbol via on-demand segment-settings fetch

**Goal**: lift the symbol-match limitation in 14c so the SL/TP modal hint shows the full limit-away band even when the position being edited is for a different symbol than the one currently open in the order panel (the "80% case" → "100% case").

**Server** — new endpoint:
- [server/index.js:1196-1232](server/index.js#L1196-L1232) — `GET /api/user/segment-settings/by-symbol/:symbol?userId=...&exchange=...&segment=...&instrumentType=...`
- Reuses `nettingEngine.getSegmentSettingsForTrade(userId, symbol, exchange, segment, instrumentType)` so the symbol → segment resolution stays in one place. The optional `exchange`/`segment`/`instrumentType` query params disambiguate Indian futures/options (which can't be resolved from symbol pattern alone — `NIFTY26APRFUT` would otherwise default to `NSE_EQ`).
- Returns `{ success: true, settings: <obj or null> }`. Never 404s — the client treats null as "no segment matched, degrade to direction-only hint".

**MarketPage cache**:
- [client/src/pages/User/pages/MarketPage.jsx:430-485](client/src/pages/User/pages/MarketPage.jsx#L430-L485) — new state `segSettingsBySymbol` (keyed by uppercased symbol) plus `fetchSegSettingsForSymbol(symbol, hints)` and `resolveSegForSymbol(symbol)` callbacks.
  - `resolveSegForSymbol` priority: (1) in-scope `segmentSettings` if symbol matches `selectedSymbol` (free, no fetch), (2) cached value, (3) `null` → direction-only.
  - `fetchSegSettingsForSymbol` is idempotent — checks `Object.prototype.hasOwnProperty.call(cache, key)` so a previously-cached null sentinel doesn't trigger a retry on every render.
- [client/src/pages/User/pages/MarketPage.jsx:415-428](client/src/pages/User/pages/MarketPage.jsx#L415-L428) — `useEffect` watching `[showEditModal, selectedPosition]` warms the cache when the parent position modify modal opens. The modal is opened from outside MarketPage (UserLayout owns the state), so the effect is the only hook point.
- [client/src/pages/User/pages/MarketPage.jsx:497-513](client/src/pages/User/pages/MarketPage.jsx#L497-L513) — `openLegEditModal` triggers a cache warm-up when the leg's symbol differs from the order panel's selected symbol. Hints are passed from the parent position so Indian instruments resolve.
- The two modal call sites in [MarketPage.jsx:3766](client/src/pages/User/pages/MarketPage.jsx#L3766) and [MarketPage.jsx:3870](client/src/pages/User/pages/MarketPage.jsx#L3870) now call `resolveSegForSymbol(symbol)` instead of the old inline `(symbol === selectedSymbol) ? segmentSettings : null` check.

**OrdersPage cache** ([client/src/pages/User/pages/OrdersPage.jsx:60-86](client/src/pages/User/pages/OrdersPage.jsx#L60-L86) + [openLegEdit:392-407](client/src/pages/User/pages/OrdersPage.jsx#L392-L407) + [hint at lines 1058-1130](client/src/pages/User/pages/OrdersPage.jsx#L1058-L1130)):
- Same `segSettingsBySymbol` state and `fetchSegSettingsForSymbol` shape. OrdersPage doesn't have an order-panel `selectedSymbol`, so EVERY modal open triggers a fetch (cached after first).
- `openLegEdit` triggers the fetch with parent position's exchange/segment hints from `legsPosition` so Indian instruments resolve.
- The inline `computeBand` helper inside the modal IIFE mirrors `getNettingStopSlmAwayOffset` from MarketPage (kept inline to avoid a cross-file import). Same precedence: points first, then percent fallback.
- Hint upgrades from direction-only to full-band as soon as the fetch resolves. First-open is direction-only for ~50ms, then re-renders with the band.

**Cache invalidation**: there is none. The cache lives for the lifetime of the page mount. Admin segment settings rarely change, and if they do, a page reload clears the cache. If you want live invalidation, hook a socket event from admin segment-settings updates to clear the affected key.

**Verified end-to-end**:
- `node -c server/index.js` → parses OK
- All 5 unit tests pass
- Symbol resolution sanity check: `XAUUSD → COMMODITIES`, `EURUSD → FOREX`, `NIFTY26APRFUT NSE → NSE_FUT`, `NIFTY26APRCE NFO → NSE_OPT`
- Client builds clean (bundle: `index-Cl0HkDGp.js`)

**Rule** (do not regress):
- The new endpoint `GET /api/user/segment-settings/by-symbol/:symbol` must always return `{ success: true, settings }` even when no segment matches — return `settings: null` instead of 404. Otherwise the client degrades to a generic error path instead of the direction-only hint fallback.
- Always pass `exchange`, `segment`, `instrumentType` hints from the parent position when calling `fetchSegSettingsForSymbol`. Indian futures/options can't be resolved from symbol pattern alone — `NIFTY26APRFUT` looks like a stock equity to the symbol-pattern matcher and would resolve to `NSE_EQ` (wrong) without the `NSE` exchange hint.
- The cache value `null` is a SENTINEL meaning "fetched but no segment matched". Don't strip it from the cache or you'll re-trigger the fetch on every render. Use `Object.prototype.hasOwnProperty.call(cache, key)` to distinguish "never fetched" from "fetched and empty".
- The cache doesn't auto-invalidate. If admin changes segment settings while a user has the page open, the user sees stale data until they reload. This is an accepted trade-off — segment settings rarely change at runtime.

### Fix 13 — Netting legs modal showed wrong side on close-action rows

**Symptom**: In OrdersPage → click an open netting position → Netting Entries modal. The `Partial` and `Close` rows displayed the parent's side (BUY) instead of the close-action side. For a BUY position with a partial close, the row showed BUY but it was actually a SELL action against the position. User asked: "in that trade info their is show partial buy but it is partial sell fix that".

**Cause**: The display had the right intent but wrong logic at [client/src/pages/User/pages/OrdersPage.jsx:940-942](client/src/pages/User/pages/OrdersPage.jsx#L940-L942) (before fix):

```js
const legSide = isPartialClose || isCloseLeg
  ? (leg.side || (legsPosition.side === 'buy' ? 'sell' : 'buy'))
  : (leg.side || legsPosition.side);
```

The `||` only falls through to "compute the opposite" when `leg.side` is falsy. But the server stores `side: existingPosition.side` on close audit rows ([NettingEngine.js:2972](server/engines/NettingEngine.js#L2972) full close, [NettingEngine.js:3121](server/engines/NettingEngine.js#L3121) partial close — both with the comment *"Original position side BUY/SELL — not the closing action"*). So `leg.side` is always truthy and the fallback never fires.

**Fix** ([client/src/pages/User/pages/OrdersPage.jsx:936-952](client/src/pages/User/pages/OrdersPage.jsx#L936-L952)): for any close-action row (`partial_close`, `close`, OR `consumed` from Fix 10), **always** override the display side to the opposite of `legsPosition.side`. The schema isn't touched — `leg.side` still holds the position-side for back-compat with any consumer that needs it; only the display layer is patched.

```js
const isCloseAction = isPartialClose || isCloseLeg || isConsumed;
const legSide = isCloseAction
  ? (legsPosition.side === 'buy' ? 'sell' : 'buy')
  : (leg.side || legsPosition.side);
```

**Why not fix the server too**: changing the stored `side` on close audit rows would silently change the semantics of `Trade.side` for every existing partial_close/close/consumed row in production DBs. Display-only fix has zero migration risk.

**MarketPage Active Trades sub-table is unaffected**: it filters legs to `type === 'open'` only at [MarketPage.jsx:389](client/src/pages/User/pages/MarketPage.jsx#L389), so close-action rows never reach the rendering path there.

**Rule** (do not regress):
- The Trade collection's `side` field on close-action rows (`partial_close`, `close`, `consumed`) stores the **position's** side, not the **action's** side. This is an audit decision, not a display decision. Any UI that shows close-action rows MUST flip the displayed side to `opposite-of-parent-side` like OrdersPage does. If you add a third place that renders close-action legs (e.g., the History tab in MarketPage's bottom panel), copy the same `isCloseAction` flip.
- If you ever change the server to store the action side instead of the position side, you'll need a migration to fix existing data AND you can simplify this display logic to just `leg.side`.

### Fix 12 — SL/TP placement validation (direction + limit-away band)

**Goal**: reject SL/TP values that are on the wrong side of the price OR too close to it. Two layered checks:

1. **Direction check** — sanity. For BUY: SL must be **strictly below** the reference price, TP **strictly above**. For SELL: SL **strictly above**, TP **strictly below**. Equal-to-price is rejected (`SL >= ref` for BUY, etc.) — matches the user's spec ("sl is not same entry price").
2. **Limit-away gap** — when the segment has `limitAwayPercent` or `limitAwayPoints` set, SL/TP must be at least that distance from the reference price. This is the same minimum-distance band that's already enforced for limit/stop pending order prices in `executeOrder`. Without this, a user could set a stop one tick away from current and have it fire on noise.

The reference price is the **execution/current** price (not the original entry on existing positions) — that's the only reference that matters for "won't fire immediately" semantics. For fresh orders execution ≈ entry, so the user-facing wording "below buy entry price" still holds.

**Helper**: new pure method `NettingEngine.validateSLTPPlacement(side, referencePrice, sl, tp, segmentSettings)` at [server/engines/NettingEngine.js:545-655](server/engines/NettingEngine.js#L545-L655). Returns `null` on success or a human-readable error string. No DB, no awaits — easy to call from anywhere SL/TP can be set.

**Three call sites** (every place SL/TP is written):

1. **`executeOrder` (new orders with SL/TP)** — [server/engines/NettingEngine.js:2491-2503](server/engines/NettingEngine.js#L2491-L2503). Reference price = the order's execution price (`price`), or the live `lastPrice` if `price` is somehow zero. Throws on validation failure, before any state mutation.

2. **`modifyPosition` (parent position SL/TP edit)** — [server/engines/NettingEngine.js:3622-3645](server/engines/NettingEngine.js#L3622-L3645). Reference price = `position.currentPrice` (live tick), falling back to `position.avgPrice`. Loads segment settings via `getSegmentSettingsForTrade` so the limit-away band is enforced. The "next" SL/TP after the proposed mutation is what gets validated (so a partial update — e.g. only modifying TP — still correctly validates against the existing SL).

3. **`PUT /api/trades/legs/:tradeId` (per-fill SL/TP edit, Fix 11)** — [server/index.js:1219-1280](server/index.js#L1219-L1280). Reference price = parent `NettingPosition.currentPrice` falling back to `leg.entryPrice`. Loads segment settings the same way. Returns HTTP 400 with the validation error message on failure (instead of 500 — these are user errors, not server bugs).

**Why no client-side mirror?** The server is the source of truth. Adding client-side checks would be duplicate logic that drifts. The server returns clean error messages and the existing modal save handlers already `alert(data.error)` on failure, so the user sees the message immediately. If you want instant feedback (red border before submit), you can mirror the helper into a small JS function — but the test below locks the contract.

**Test**: [server/tests/sltpPlacementValidation.test.js](server/tests/sltpPlacementValidation.test.js) — pure unit test, 28 assertions across 9 scenario groups:
- Direction-only checks (BUY/SELL × SL/TP × correct/wrong side, including "equal to price")
- Null/undefined/empty SL or TP skipped silently
- Reference price 0/null skipped silently (no false rejections when current price isn't loaded yet)
- Limit-away percent (`5%` of 100 = ±5 band)
- Limit-away points (overrides percent if both set; e.g. `10 points`)
- No limit-away configured → only direction enforced
- Side variants — case insensitive (`'BUY'`, `'Sell'`)
- Invalid inputs (non-numeric SL/TP)
- Realistic integration: BUY @ 4000 with 1% band → SL must be ≤ 3960, TP ≥ 4040

**Rule** (do not regress):
- Every site that writes `stopLoss` or `takeProfit` to a `NettingPosition`, `HedgingPosition`, or `Trade` doc MUST call `validateSLTPPlacement` first. The helper is intentionally pure and side-effect free — there is no excuse not to.
- The reference price for validation is **current** (or execution for fresh orders), NOT the historical entry. Passing `entryPrice` for a position that's been open a while will reject reasonable trailing-stop edits.
- Direction is enforced **strictly** (`>`/`<`, never `>=`/`<=`). Allowing SL == ref would let users place a stop that fires on the very next tick.
- If you add a new field that should also affect SL/TP placement (e.g. an absolute "minimum stop distance" in pips), extend `validateSLTPPlacement` and the unit test in lockstep.

### Fix 11 — Per-fill SL/TP, automation, and per-fill close (Batch 2 of 2)

**Goal**: builds on Fix 10. Each Active Trade row now has its own editable SL/TP, the server actively monitors prices and auto-closes legs when SL/TP is hit, and users can manually close a single leg via a ✕ button. Plus the OrdersPage legs modal gains the same affordances. Netting mode only.

**Critical pre-existing gap closed**: before this fix, the codebase had **NO automated SL/TP enforcement at all** — for either positions or fills. The `Trade.closedBy` enum had `'sl'` and `'tp'` values, the `NettingPosition.stopLoss`/`takeProfit` fields existed, but **nothing watched the price tick to fire close orders**. Users could set SL/TP and they would just sit there. Fix 11 adds the missing monitor and routes both per-fill and parent-level SL/TP through it.

**PnL semantics — two coexisting conventions** (decision D in [the plan](/Users/tarundewangan/.claude/plans/harmonic-stirring-turtle.md)):
- **Aggregate / opposite-side close** (Fix 10): realized PnL = `(closePrice − parent.avgPrice) × closedVol`. Existing engine behavior, unchanged.
- **Per-fill close** (Fix 11): realized PnL = `(closePrice − leg.entryPrice) × leg.volume`. Used by the SL/TP monitor and the per-row ✕ button.

The two conventions disagree when fills had different entry prices. After a mix of both close types, `parent.avgPrice` may drift from the time-weighted mean of the remaining open legs — that drift is **accepted by design**. The position view continues to display `parent.avgPrice` (the historical entry-time mean) and the active trades view continues to display each leg's own entry. Both are valid interpretations of different things.

**Schema** — no changes needed. The `Trade` schema already had `stopLoss`, `takeProfit`, and a `closedBy` enum that includes `'sl'`/`'tp'`/`'aggregate_close'`/`'system'`. Fix 10 added `'consumed'` and `'aggregate_close'`. Fix 11 reuses everything.

**Server changes**:

1. **Per-fill SL/TP storage on open** — [server/engines/NettingEngine.js:2832-2855](server/engines/NettingEngine.js#L2832-L2855) and [server/engines/NettingEngine.js:2856-2876](server/engines/NettingEngine.js#L2856-L2876): both the new-position and same-side-add Trade leg writes now copy `stopLoss`/`takeProfit` from the order. Previously only the parent NettingPosition got them.

2. **`PUT /api/trades/legs/:tradeId`** — [server/index.js:1196-1226](server/index.js#L1196-L1226): updates `{ stopLoss, takeProfit }` on a single open netting Trade leg. Validates `userId` ownership, only allows updates when `type === 'open'` and `closedAt == null`. Treats `undefined` as "leave alone" and explicit `null` as "clear the field".

3. **`closePositionLeg(userId, tradeId, closePrice, options)`** — new public method on `NettingEngine` at [server/engines/NettingEngine.js:3331-3479](server/engines/NettingEngine.js#L3331-L3479). The hard part:
   - Looks up the leg + parent. Validates ownership, type, and that legVol ≤ parentVol.
   - Realized PnL uses `leg.entryPrice` (NOT `parent.avgPrice`) — done by spoofing a position-shape object into `calculatePnL`.
   - Recomputes parent's avg via `newAvg = (oldVol*oldAvg − legVol*legEntry) / (oldVol − legVol)`. Drifts by design.
   - Margin and quantity decremented proportionally.
   - If this was the last open leg → `parent.status = 'closed'`.
   - Marks the leg `type: 'close'` with `closedBy: 'sl'/'tp'/'user'/'stop_out'/'system'` and stores `profit: rawProfit` (unlike `'consumed'` legs which keep profit=0).
   - Settles wallet via `releaseMargin` + `settlePnL`.
   - Per-`tradeId` lock via `this._legCloseLocks` Set (added in the constructor) prevents the SL/TP monitor from racing with a manual user close.

4. **`POST /api/positions/close-leg`** — [server/index.js:1196-1217](server/index.js#L1196-L1217): thin wrapper that accepts `{ userId, tradeId, currentPrice, closeReason }` and calls `nettingEngine.closePositionLeg`.

5. **SL/TP price-tick monitor** — [server/services/metaApiStreaming.js:330-540](server/services/metaApiStreaming.js#L330-L540): new private method `_checkPerFillSLTP(userId, priceResolver)` called from `syncOpenPositionsAndLedgerRisk` (which already runs every 1 second, see Fix 9). Two passes:
   - **Per-fill pass**: walks every open netting `Trade` leg with `stopLoss > 0` or `takeProfit > 0` set. For BUY legs: SL hit when `bid <= stopLoss`, TP hit when `bid >= takeProfit`. For SELL legs: SL hit when `ask >= stopLoss`, TP hit when `ask <= takeProfit`. When triggered, calls `closePositionLeg` with the SL/TP price as the close price (standard "stop filled at the stop price" simulation) and emits a `legClosedBySLTP` socket event.
   - **Parent-level pass**: walks every open netting position with `stopLoss > 0` or `takeProfit > 0` set. When triggered, closes EVERY remaining open leg of that parent via `closePositionLeg` (each leg uses its own entry for PnL — sum equals the parent-avg math iff the weighted-mean invariant still holds). Emits a `positionClosedBySLTP` socket event.

   This is the FIRST place SL/TP automation has ever lived in the codebase. It also fixes parent-position SL/TP automation, which has been silently broken since the beginning.

**Client changes — MarketPage** ([client/src/pages/User/pages/MarketPage.jsx](client/src/pages/User/pages/MarketPage.jsx)):

- **New state** at [lines 426-431](client/src/pages/User/pages/MarketPage.jsx#L426-L431): `legEditModalOpen`, `legBeingEdited`, `legEditSL`, `legEditTP`, `legEditParentPos`.
- **Handlers** at [lines 433-525](client/src/pages/User/pages/MarketPage.jsx#L433-L525): `openLegEditModal`, `closeLegEditModal`, `saveLegSLTP` (PUTs to `/api/trades/legs/:tradeId`), `closeLegHandler` (POSTs to `/api/positions/close-leg`).
- **Updated Active Trades sub-table** at [lines 3453-3526](client/src/pages/User/pages/MarketPage.jsx#L3453-L3526): added S/L, T/P, and Actions columns. Each row gets a ✎ (edit per-fill SL/TP) and ✕ (close this fill) button.
- **New leg-edit modal** at [lines 3697-3744](client/src/pages/User/pages/MarketPage.jsx#L3697-L3744): inline modal with SL/TP inputs, calls `saveLegSLTP` on confirm. Has a hint explaining the per-fill PnL convention.

**Client changes — OrdersPage parity** ([client/src/pages/User/pages/OrdersPage.jsx](client/src/pages/User/pages/OrdersPage.jsx)):

- **New state** at [lines 55-58](client/src/pages/User/pages/OrdersPage.jsx#L55-L58): per-leg edit modal state, mirroring MarketPage.
- **Handlers** at [lines 367-441](client/src/pages/User/pages/OrdersPage.jsx#L367-L441): `refetchCurrentLegs`, `openLegEdit`, `closeLegEditModal`, `saveLegSLTP`, `closeLegHandler`.
- **Legs modal table** at [lines 826-952](client/src/pages/User/pages/OrdersPage.jsx#L826-L952): added S/L, T/P, and Actions columns. Edit/close buttons only render for `type === 'open'` legs (not for closed/partial_close/consumed audit rows). Added a `'Consumed'` type label and color (gray) for FIFO-consumed legs from Fix 10.
- **New leg-edit modal** at [lines 901-952](client/src/pages/User/pages/OrdersPage.jsx#L901-L952): same shape as MarketPage's.

**Tests**:
- [server/tests/closePositionLegMath.test.js](server/tests/closePositionLegMath.test.js) — pure unit test (no DB) covering 7 scenarios:
  - Two-leg case: closing the older leg drifts parent.avgPrice toward the younger leg's entry.
  - Last-leg case: closing the only remaining leg flips `parent.status = 'closed'`.
  - Per-fill PnL convention vs parent-avg convention — demonstrates they DIFFER (10 vs 6 in the chosen example) and locks in that we use the per-fill version.
  - SELL position symmetry (priceDiff reversed).
  - Sum invariant across 4 sequential leg closes — avg recomputes correctly each time.
  - Margin proportionality (close 2 of 5 → release 2/5 of margin).
  - Floating-point safety (1 − 1e-12 treated as fully closed via EPS).

  **If you change the algorithm in `closePositionLeg`, mirror the change in this test or it will go stale.**

**Rule** (do not regress):
- The SL/TP monitor lives ONLY in `metaApiStreaming._checkPerFillSLTP`. It is the only place in the codebase that automatically closes trades on price levels. If you add a new automated close trigger, hook it into the same loop or use the same per-`tradeId` lock pattern from `_legCloseLocks` to avoid races.
- **Never** mutate a `'consumed'` leg's `profit` field to non-zero — Fix 10 says PnL was settled at the aggregate level for those, and adding leg-level profit would double-count in any History summation. `closePositionLeg` only ever fires on `type === 'open'` legs (validates this on entry), so the two paths can't collide.
- The per-fill close path uses `leg.entryPrice` for PnL. The aggregate close path uses `parent.avgPrice`. Don't unify them — see decision D in the plan.
- Per-fill SL/TP triggers fill-by-fill: BUY → check `bid` against SL/TP; SELL → check `ask`. Don't reverse these.
- The `closePositionLeg` lock uses `this._legCloseLocks.add(tradeId)` and clears it in `finally`. If you wrap calls in another try/catch, make sure the finally still runs or you'll leak locks.
- When you add a new netting leg-creation site, **copy the SL/TP onto the Trade leg** the same way `executeOrder` does — otherwise the per-fill SL/TP feature silently won't work for that path.

### Fix 10 — Active Trades sub-view + FIFO leg consumption (Batch 1 of 2)

**Goal**: surface the individual fills that built up an aggregated netting position. The user wanted a Zerodha-style drilldown: the existing **Position** view stays as one row with the averaged entry, and an inline **Active Trades** sub-section shows each fill (open `Trade` leg) underneath when expanded. Netting mode only — hedging is already 1:1 with fills.

**Key insight (no new schema needed for storage)**: every `executeOrder` already creates a `Trade` doc per fill linked to the parent `NettingPosition` via `oderId`. The endpoint `GET /api/trades/legs/:userId/:orderId` ([server/index.js:1181](server/index.js#L1181)) was already returning them. The work was visualizing this and keeping it consistent when the parent's volume drops.

**The invariant**: `sum(open Trade legs.volume) === parent.volume` MUST hold for every netting position whose row is expanded. Same-side adds already maintained this (each fill creates a new leg). But opposite-side reductions, partial closes, and stop-outs decremented `parent.volume` without touching the legs — so the Active Trades view would have shown stale "phantom" lots. **Phase 1.5** fixes this with FIFO consumption.

**Schema additions** (additive, no migration needed):
- [server/models/Trade.js:38-46](server/models/Trade.js#L38-L46) — `type` enum gains `'consumed'` for legs whose volume was eaten by an aggregate close.
- [server/models/Trade.js:55-59](server/models/Trade.js#L55-L59) — `closedBy` enum gains `'aggregate_close'` (distinct from `'system'` so the History tab can render it differently from automated risk actions).

**FIFO consumption helper**: new private method `NettingEngine._consumeOpenLegsFIFO(parentOderId, userId, closingVolume, avgPriceAtClose)` at [server/engines/NettingEngine.js:459-540](server/engines/NettingEngine.js#L459-L540). It walks `Trade.find({ oderId, type: 'open' }).sort({ executedAt: 1 })` and consumes `closingVolume` units oldest-first. Fully consumed legs become `type: 'consumed'`, `closePrice: parent.avgPrice`, `closedBy: 'aggregate_close'`, `profit: 0` (PnL was settled at the aggregate level — leg-level profit stays 0 to avoid double counting). Partially consumed legs stay `type: 'open'` with reduced `volume` and proportionally scaled `quantity`. Uses a `1e-9` epsilon to absorb floating-point sums (test 7 in `nettingFifoLegConsumption.test.js`).

**Hook points**:
- [server/engines/NettingEngine.js:3138-3150](server/engines/NettingEngine.js#L3138-L3150) — partial-reduce branch (sell 1 against buy 10): consume 1 lot FIFO.
- [server/engines/NettingEngine.js:3069-3082](server/engines/NettingEngine.js#L3069-L3082) — full-close-and-reverse branch (sell 10 against buy 10, OR sell 15 → close 10, open new SELL 5): consume ALL open legs of the closed parent. The new reverse position gets a fresh `'open'` leg via the existing reverse-side `openTrade` doc.

**PnL semantics for aggregate closes** (unchanged): realized PnL = `(closePrice − parent.avgPrice) × closedVol`, settled by `user.settlePnL` at [NettingEngine.js:3111](server/engines/NettingEngine.js#L3111). The leg consumption is purely additional bookkeeping — no double settlement.

**Client — inline Active Trades drilldown**:
- [client/src/pages/User/pages/MarketPage.jsx:1](client/src/pages/User/pages/MarketPage.jsx#L1) — added `Fragment` to the React imports.
- [client/src/pages/User/pages/MarketPage.jsx:372-424](client/src/pages/User/pages/MarketPage.jsx#L372-L424) — added `expandedPositionId`, `legsByPosition`, `legsLoadingFor` state; `fetchLegsForPosition` callback hits `GET /api/trades/legs/:userId/:positionOderId` and filters to `type === 'open'`; `toggleExpandPosition` flips the chevron; a `useEffect` refetches whenever the `positions` array changes (so an opposite-side aggregate reduction immediately updates the expanded leg list).
- [client/src/pages/User/pages/MarketPage.jsx:3194-3346](client/src/pages/User/pages/MarketPage.jsx#L3194-L3346) — wrapped each position row in a `<Fragment>` so it can render an optional second `<tr className="active-trades-row">` beneath. The chevron `▸ / ▾` only appears on `pos.mode === 'netting'` rows. The expanded sub-table has columns: Time, Side, Vol, Entry, Current, P/L. Each leg's P/L is recomputed live: `(currentPrice − leg.entryPrice) × sideMul × legVol × contractSize`.

**Migration script**: [server/migrations/2026-04-08_drop_dead_margin_fields.js](server/migrations/2026-04-08_drop_dead_margin_fields.js) — one-shot `$unset` on `hedgingsegments`, `nettingsegments`, `trademodesettings` for the now-removed `marginCallLevel`/`stopOutLevel` (Fix 9 left these as orphan keys on existing docs). Idempotent. Skips collections that don't exist on a fresh DB. Run with `node server/migrations/2026-04-08_drop_dead_margin_fields.js`.

**Test**: [server/tests/nettingFifoLegConsumption.test.js](server/tests/nettingFifoLegConsumption.test.js) — pure unit test (no DB, no Mongoose) that mirrors the FIFO algorithm. 9 scenarios including the user's exact "buy 10, sell 1, expect 9" case, partial leg consumption, sort-order independence, full-close (legs sum exactly equals consumption), over-consume (returns leftover with warning), and the floating-point edge case `0.1 + 0.2 = 0.30000000000000004`. **If you change the algorithm in `_consumeOpenLegsFIFO`, mirror the change in this test or it will go stale.**

**Rule** (do not regress):
- The Active Trades expanded view ONLY appears for `pos.mode === 'netting'`. Hedging positions are already 1:1 with their `HedgingPosition` doc — drilling down would show the same row twice.
- Aggregate-close PnL uses `parent.avgPrice`. Per-fill close PnL (Batch 2: SL/TP automation, per-row ✕) will use the **fill's own entry**. These two conventions coexist by design — see decision D in [the plan](/Users/tarundewangan/.claude/plans/harmonic-stirring-turtle.md). After a mix of both close types, `parent.avgPrice` may drift from the weighted mean of remaining open legs. That's accepted: position view shows the historical entry-time mean, active trades view shows each leg's own entry.
- When you add a new code path that decrements `parent.volume`, you MUST also call `_consumeOpenLegsFIFO` with the same volume, OR the Active Trades view will show phantom lots. The two existing call sites are the partial-reduce and full-close-and-reverse branches in `executeOrder`.
- Never store anything on a `'consumed'` leg's `profit` field — that PnL was already settled at the aggregate level. Setting it would double-count in any History aggregation.

**What's still missing (Batch 2 — separate commit)**:
- Per-fill SL/TP storage (write SL/TP onto the open Trade leg, not just the parent)
- Per-fill SL/TP edit modal in MarketPage / OrdersPage
- Server-side SL/TP price-tick monitor (currently NO automation exists for either positions or fills — `closedBy: 'sl'/'tp'` enum is ready but nothing calls it)
- New `closePositionLeg(userId, tradeId, closePrice, reason)` method that uses **fill's own entry** for PnL (decision D)
- Per-row ✕ button on each Active Trade row
- OrdersPage parity (currently OrdersPage has its own legs-modal at lines 778-902; should pick up the same affordances)

### Fix 8 — Negative free margin / equity in status bar (display-only clamp)

**Symptom**: User saw `Free: ₹-93,857.16` and even `Equity: ₹-22,749.22` in the status bar and thought free margin should "never go negative."

**Cause**: Not a bug — the math is correct per MT5 standard:
- `Free Margin = Equity − Margin` and **CAN** go negative (signals margin call / stop out).
- `Equity = Balance + Credit + Floating P/L` and **CAN** go negative if floating losses exceed balance (account is fully blown).
- All four code paths already use the right formula: [App.jsx:1712](client/src/App.jsx#L1712), [App.jsx:1923](client/src/App.jsx#L1923), [UserLayout.jsx:1167](client/src/pages/User/UserLayout.jsx#L1167), [UserLayout.jsx:1554](client/src/pages/User/UserLayout.jsx#L1554), and the server [User.updateEquity](server/models/User.js#L182).

**Fix** (display-only — keeps the underlying state untouched so margin-call / stop-out logic still triggers):
- Wrapped each Free / Equity status-bar span in an IIFE that clamps display to `0` when the raw value is negative and renders a red badge instead:
  - `MARGIN CALL` (red `#e02424`) when `freeMargin < 0`
  - `STOP OUT` (dark red `#7a0e0e`) when `equity < 0`
- Three sites updated: [App.jsx:4582-4626](client/src/App.jsx#L4582-L4626) (desktop footer), [UserLayout.jsx:2509-2578](client/src/pages/User/UserLayout.jsx#L2509-L2578) (desktop footer), and [UserLayout.jsx:2618-2680](client/src/pages/User/UserLayout.jsx#L2618-L2680) (mobile expanded footer).

**Rule** (do not regress):
- The clamp is **display-only**. Never mutate `walletData.equity` / `walletData.freeMargin` to clamp them — order-validation code (e.g., [App.jsx:2323](client/src/App.jsx#L2323)) and the server's stop-out logic depend on the *raw* signed value to know when to block new trades or auto-liquidate.
- If you add a new place that displays Free/Equity, copy the same `Math.max(0, raw)` + badge pattern. Don't introduce a `Math.max` in the state setter.
- The proper *behavioural* fix (so equity never reaches negative in the first place) is server-side stop-out at a margin-level threshold (e.g., 50%) — not yet implemented. Until then, the badges are the user-facing indicator.

---

## 14. Socket.IO Events Cheat Sheet

| Direction | Event                 | Room / Target            | Payload |
|-----------|-----------------------|--------------------------|---------|
| C → S     | `join`                | -                        | `userId` (server `socket.join(userId)`) |
| C → S     | `subscribePrices`     | joins `prices`           | `[symbols]` |
| C → S     | `subscribeZerodhaTicks` | joins `zerodha-ticks`  | - |
| S → C     | `positionUpdate`      | `userId` room            | `{ positions, walletDelta }` |
| S → C     | `priceUpdate`         | `prices` room            | `{ symbol, bid, ask, ... }` |
| S → C     | `zerodha-tick`        | `zerodha-ticks` room     | `[ticks]` |

Socket config: `pingTimeout: 60000`, `pingInterval: 25000`, `perMessageDeflate` ≥1KB, `maxHttpBufferSize: 1MB`.

---

## 15. API Endpoints Cheat Sheet

Inline in [server/index.js](server/index.js):

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/health` | Status |
| GET    | `/api/instruments` | MetaAPI instrument list (with injected `exchange`) |
| POST   | `/api/instruments/prices` | Batch price lookup |
| GET    | `/api/delta/instruments` | Delta Exchange instrument list |
| GET    | `/api/zerodha/status` | Zerodha config & connection state |
| GET    | `/api/zerodha/instruments/subscribed` | token→symbol map |
| GET    | `/api/zerodha/ltp` | Last-traded-price snapshot |
| POST   | `/api/orders` | **Main order entry** (mode-routed) |
| GET    | `/api/orders/pending/:userId` | Pending limit/stop orders |
| GET    | `/api/orders/cancelled/:userId` | Cancelled orders |
| GET    | `/api/positions/all/:userId` | All open positions for user |
| GET    | `/api/trades/:userId` | Trade history (paginated) |
| GET    | `/api/wallet/...` | Wallet ops |
| GET    | `/api/transactions` | Tx history |
| GET    | `/api/exchange-rate` | Live USD/INR |
| GET/POST `/api/admin/*` | Admin dashboards (segment settings, charge settings, market control, etc.) |

In route files:

| Mount | File |
|-------|------|
| `/api/auth/*`                | [server/routes/auth.js](server/routes/auth.js) |
| `/api/ib/*`                  | [server/routes/ib.js](server/routes/ib.js) |
| `/api/copy-trade/*`          | [server/routes/copyTrade.js](server/routes/copyTrade.js) |
| `/api/wallet/*`              | [server/routes/wallet.js](server/routes/wallet.js) |
| `/api/metaapi/*`             | [server/routes/metaApiProxy.js](server/routes/metaApiProxy.js) |
| `/api/admin/email-templates` | [server/routes/adminEmailTemplates.js](server/routes/adminEmailTemplates.js) |

---

## 16. Client Hooks

| Hook | What it does | Returns |
|------|--------------|---------|
| `useMetaApiPrices` | Subscribes to MetaAPI socket prices, exposes `executeOrder` helper | `{ prices, isConnected, error, getPrice, getAllPrices, executeOrder, oneClickPending }` |
| `useZerodhaTicks` | Subscribes to Zerodha ticks, caches in localStorage (7-day TTL) | `{ ticks, isConnected, subscribedInstruments, zerodhaStatus, fetchStatus }` |
| `useBrokerInstruments` | Fetches `/api/instruments`, debounced search, refresh every 30s | `{ allInstruments, searchResults, categories, searchInstruments, getByCategory, getInstrument }` |
| `useDeltaExchange` | Delta crypto futures/options list + prices | `{ instruments, prices, fetchInstruments, searchInstruments, debouncedSearch }` |
| `useUserPreferences` | Syncs user prefs (theme, watchlist, chart settings) with `/api/auth/preferences` | `{ preferences, updatePreference, addToWatchlist, removeFromWatchlist }` |

---

## 17. Zustand Store ([client/src/store/useStore.js](client/src/store/useStore.js))

Holds: `theme` (persisted), `selectedInstrument`, `instruments[]`, `orderType`, `orderSide`, `volume`, `leverage`, `takeProfit`, `stopLoss`, `positions[]` (rarely used — MarketPage owns local state), `pendingOrders[]`, `orderHistory[]`, wallet snapshot (`balance`, `credit`, `equity`, `margin`, `freeMargin`), and UI flags (`instrumentsPanelOpen`, `orderPanelOpen`, `activeBottomTab`, `instrumentFilter`, `searchQuery`).

---

## 18. Conventions

- **CommonJS** on the server (`type: "commonjs"`). **ESM** on the client (Vite `type: "module"`).
- Currency: Indian P/L is in **INR**, everything else in **USD**. Wallet equity is normalized to USD using `currencyRateService.getUsdInr()` server-side, and `usdInrRate + usdMarkup` client-side.
- IDs: Users have a 6-digit `oderId` (yes, with the typo) used everywhere as the public user identifier.
- Volume vs quantity: `volume` = lots (e.g., 1, 0.5). `quantity` = lots × lotSize (e.g., 25 for 1 lot of NIFTY). For Indian P/L, **always use `quantity`**.
- Lot size: stored on the position document at trade time. Don't try to look it up later — use `pos.lotSize` or `pos.quantity / pos.volume`.
- Spread: applied client-side at order construction (`spreadPreApplied: true`), server respects that flag.
- Symbol case: server normalizes to uppercase (`sym = symbol.toUpperCase()`). Client tends to keep original. Compare case-insensitively.

---

## 19. Running & Testing

```bash
# Server
cd server
npm install
npm start          # node index.js
npm run dev        # node --watch index.js
npm test           # tests/nettingMarginAndCaps.unit.js
npm run test:risk  # scripts/verify-risk-logic.js

# Client
cd client
npm install
npm run dev        # vite
npm run build      # vite build
npm run lint
```

Env: server reads from `.env` (not committed). Client reads `import.meta.env.VITE_API_URL`.

---

## 20. How to Update This File

When you change anything in the codebase:

1. **Locate the relevant section above.** If your change touches segment routing, edit §6. P/L? §9. Models? §11. New service? §12. Add a new gotcha? §13.
2. **Edit in place** — don't append to the bottom.
3. **Update line numbers** if you add/remove code in cited files. Use the format `[file.js:LINE](file.js#LLINE)` so VSCode can jump to it.
4. **Add a row to §13** if your fix corrects a real bug — future agents need to know what NOT to regress.
5. **If you add a section**, also link it in the table of contents implied by the headings (the section numbers).
6. Keep it concrete. Replace stale advice rather than stacking it.

> The purpose of this file is to save the next agent from re-exploring 30,000+ lines of code. Treat it as production documentation.

---

## 21. INR-Only Conversion (2026-04-21)

Platform was converted from a dual USD/INR hybrid to **INR-only** across every layer.
Scope notes:

- Every forex pair, USD-metal (XAUUSD/XAGUSD/XPTUSD), USD-crypto (BTCUSD/ETHUSD/…)
  and US index (US30/US100/US500/NAS100/…) has been removed from client watchlists,
  server `getInstrumentName`, admin instrument maps, and the hedging/netting engines'
  symbol categorizers. Only **NSE/BSE Indian stocks + NIFTY50/BANKNIFTY/FINNIFTY/SENSEX**
  remain as tradable instruments.
- `server/services/currencyRateService.js` is now a stub (`getCachedUsdInrRate()`
  returns `1`). This neutralizes every `amount * usdInrRate` / `amount / usdInrRate`
  call site in `NettingEngine.js`, `BinaryEngine.js`, `HedgingEngine.js`, etc. —
  they become identity ops without needing line-by-line surgery.
- Client `displayCurrency` is hardcoded to `'INR'`; all `'$'` literals collapsed to `'₹'`.
- Admin "USD to INR Conversion Settings" / markup panel removed. Sidebar no longer
  has a Currency sub-item.
- `GET /api/exchange-rate` now returns `{ USD_TO_INR: 1, INR_TO_USD: 1 }` (kept for
  legacy clients still polling it, but does nothing).
- `User.walletUSD`, `User.allowedCurrencies`, `Transaction.currency: 'USD'` default,
  `Symbol.marginCurrency: 'USD'` default, `AppSettings.usdMarkup` — all removed or
  flipped to INR.
- New migration script: `server/scripts/migrate-usd-to-inr.js` folds any legacy USD
  balances into INR at the live rate and stamps `migrationFlags.usdToInr=true`.
- New client helper: `client/src/utils/formatCurrency.js` (`formatINR`).
- Deposit/withdraw endpoints, admin wallet-adjust endpoint, crypto payment methods
  (USDT-TRC20/ERC20 rails) — all removed from the user / admin flow.

---

## 22. White-Label → DhanFunded (2026-08-13)

Brand was switched from *Bharath Funded Trader* to **DhanFunded** (`dhanfunded.com`).
**Text/asset only — no engine, route, schema or calculation logic was touched.**

| Item | Value |
|---|---|
| Brand name | `DhanFunded` |
| Slogan | `Your Skill. Our Capital.` |
| Domains | `dhanfunded.com`, `api.dhanfunded.com`, `admin.dhanfunded.com` |
| Support | `support@dhanfunded.com`, `noreply@dhanfunded.com` |
| Brand blue | `#2B4EFF` (plate gradient `#4C7CFF → #1A34D2`) |

**Assets** (all newly generated, old `bharat *` PNG/SVG files deleted):
`client/public/favicon.svg`, `favicon.png` (512), `icon-192.png`, `apple-touch-icon.png`,
`client/public/landing/img/dhanfunded-og.png`,
`client/src/assets/dhanfunded-logo-{dark,light}.svg` (mirrored into `public/landing/img/`).
Naming rule: **suffix = ink colour** — `-dark` (dark ink) on light surfaces, `-light`
(white ink) on dark surfaces. The old PNGs had the inverse, misleading convention.

**Renamed namespaces** (global, consistent across client):
`bharatfunded-*` → `dhanfunded-*` (localStorage keys), `__bharatfunded_*` →
`__dhanfunded_*`, `bft-*` → `pf-*` (CSS classes + keyframes), sw.js cache `bft-v1` → `pf-v1`.
⚠️ Renaming the storage keys logs every existing session out **once** on first load.

**Deliberately NOT renamed** (would break running systems):
- `BharatFundedTrade-secret-key-2024` — JWT fallback secret; rotating it invalidates all live tokens.
- `BharatFundedMobile` — the APK's User-Agent contract (`server/index.js`, `routes/auth.js`).
- `mongodb://…/bharatfundedtrade` — DB name; renaming points at an empty database.
- `admin@bharatfundedtrade.com` / `Admin@BharatFunded2024` (`scripts/seedAdmin.js`) — seeded credentials.
- `@guest.bharatfundedtrade.com` — generated guest-user email domain in the three engines.

> **Rule:** brand text lives in `client/src/pages/Landing/landingConfig.js`,
> `useSiteSettings.js` DEFAULTS, `server/models/AppSettings.js` (`siteName`) and the
> admin-editable Settings panel. Add new brand strings there, not inline in components.
