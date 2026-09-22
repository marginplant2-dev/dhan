# Prop-Trading Logic — Complete Flow & Spec (DhanFunded)

> **Purpose of this file.** A single, authoritative spec of the entire prop-trading
> system — both the **user side** and the **admin side** — extracted from the actual
> code. Use it as a hand-off doc, an audit reference, or as a prompt to an AI when
> extending/debugging the prop module. Numeric values are the **code defaults**;
> the admin can override most of them per-challenge in `rules` / `fundedSettings`.
>
> **Core files**
> - Models: `server/models/Challenge.js`, `server/models/ChallengeAccount.js`, `server/models/ChallengePosition.js`
> - Engines: `server/services/propTradingEngine.js`, `server/services/challengePropEngine.service.js`
> - Approval: `server/services/challengeApproval.service.js`
> - Routes: `server/routes/propTrading.js` (+ payout/purchase approval in `server/index.js`)
> - Cron: `server/cron/settlement.cron.js`
> - User UI: `client/src/pages/User/pages/{MarketPage,PassedChallengesPage,...}.jsx`
> - Admin UI: `client/src/pages/Admin/pages/{PropTrading,TradeManagement,...}.jsx`

---

## 0. Mental Model (read this first)

A **Challenge** is a product the admin defines (fund size, fee, rules). A user **buys**
a challenge → an isolated **ChallengeAccount** is created with a **virtual sub-wallet**
(its own balance/equity/margin — the user's real wallet is never touched while trading).
The user trades inside that sub-wallet. Depending on `stepsCount`:

- **0 (Instant)** → on approval the account is **FUNDED** immediately (no evaluation).
- **1 (1-Step)** → trade to hit the profit target → **PASSED** → a **separate FUNDED account** is minted.
- **2 (2-Step)** → hit phase-1 target → **reset to a fresh phase 2** → hit phase-2 target → **FUNDED**.

A **FUNDED** account earns the trader real money: profit is split (default trader-favourable)
and paid out via **admin-approved withdrawals**, capped per cycle, gated by age/consistency/etc.

Everything is bucketed by **IST (Asia/Kolkata)** day, not UTC.

---

## 1. DATA MODELS

### 1.1 `Challenge` (`server/models/Challenge.js`)

- **`stepsCount`** (enum `0|1|2`, default `2`): `0`=Instant→FUNDED on approval, `1`=1-step, `2`=2-step.
- **Pricing**: `tiers[]` (`{ fundSize, challengeFee, label, isPopular }`) with legacy fallback `fundSize` / `challengeFee`.

#### `rules` (evaluation-phase constraints)

| Field | Default | Meaning |
|---|---|---|
| maxDailyDrawdownPercent | 5 | Daily loss cap (% of initial). Breach → **FAILED**. |
| maxDailyDrawdownAmount | null | Fixed ₹ cap (overrides %). |
| maxOverallDrawdownPercent | 10 | Cumulative loss cap (% of initial). Breach → **FAILED**. |
| maxOverallDrawdownAmount | null | Fixed ₹ cap (overrides %). |
| maxLossPerTradePercent | 2 | Per-trade loss cap (not actively enforced). |
| profitTargetPhase1Percent | null | Phase-1 target %. |
| profitTargetPhase2Percent | null | Phase-2 target %. |
| profitTargetInstantPercent | null | Instant target %. |
| maxOneDayProfitPercentOfTarget | null | Single-day profit **cap** as % of target (caps counted profit, does **not** fail). |
| consistencyRulePercent | null | Best day ≤ N% of profit — **NOT** an evaluation pass-blocker (payout-only concept). |
| minTradesRequired | 1 | Min trades to pass. |
| maxTradesPerDay / maxTotalTrades / maxConcurrentTrades | null | Opt-in caps. |
| minLotSize / maxLotSize | 0.01 / 100 | Order size bounds. |
| allowFractionalLots | false | Whole lots only by default (Indian instruments). |
| tradingDaysRequired | null | Unique IST trading days needed to pass. |
| challengeExpiryDays | 30 | Evaluation lifetime. |
| maxLeverage | 100 | Leverage cap. |
| allowedSymbols / allowedSegments | [] | Whitelists (empty = all). |
| allowWeekendHolding / allowNewsTrading | false / true | Market behaviour flags. |

#### `fundedSettings` (apply only when `status='FUNDED'`)

| Field | Default | Meaning |
|---|---|---|
| profitSplitPercent | 100* | Trader's % of profit per payout (*admin commonly sets 80; `createFundedAccount` falls back to **80** if unset). |
| maxWithdrawalPercent | 5 | Per-cycle payout cap (% of initial). |
| withdrawalFrequencyDays | 14 | Cooldown between payouts. |
| minProfitPercentForPayout | 5 | Min profit % before a payout is allowed. |
| maxDailyDrawdownPercent | 4 | Funded daily DD (tighter than eval's 5). |
| maxOverallDrawdownPercent | 10 | Funded overall DD. |
| minDaysSinceFundedForPayout | 14 | Days since `fundedAt` before first payout. |
| minTradingDaysForPayout | 5 | Unique IST trading days before payout. |
| consistencyMaxDayPercent | 30 | Best day ≤ 30% of total profit (checked **at payout**). |
| accountLifetimeDays | 30 | Funded account auto-EXPIRES after N days. |

### 1.2 `ChallengeAccount` (`server/models/ChallengeAccount.js`)

- **`accountId`** unique (`CH######` eval, `FND######`/`CH######` funded).
- **`accountType`**: `CHALLENGE | FUNDED | DEMO`.
- **`status`** enum lifecycle:
  - `PENDING` — buy-request awaiting admin approval (no clock running).
  - `ACTIVE` — evaluation in progress.
  - `PASSED` — target hit, funded account minted (frozen record).
  - `FUNDED` — live, payout-eligible.
  - `FAILED` — DD breach / FAIL violation.
  - `EXPIRED` — past `expiresAt`.
  - `CANCELLED` — purchase rejected.
- **Phase**: `currentPhase` (1→2), `totalPhases` (0 funded, else `stepsCount`), `phaseStartedAt` (current-phase anchor; filters the journal; reset on phase advance).

**Isolated sub-wallet** (trades touch ONLY these, never `User.wallet`):
`initialBalance` (base for all %), `currentBalance` (=walletBalance), `currentEquity` (balance+floating),
`walletBalance`, `walletEquity`, `walletMargin`, `walletFreeMargin` (equity−margin), `walletMarginLevel`.

**Daily / risk trackers**: `dayStartEquity`, `dayStartBalance` (00:05 IST snapshot), `lowestEquityToday`,
`lowestEquityOverall`, `highestEquity`, `currentDailyDrawdownPercent`, `currentOverallDrawdownPercent`,
`tradesToday`, `dailyPnlMap` (`Map<IST-YYYY-MM-DD, realisedPnl>`), `uniqueTradingDays[]`.

**Profit/progress**: `currentProfitPercent = (currentEquity − phaseStartBalance)/phaseStartBalance×100`,
`totalProfitLoss`, `phaseStartBalance`.

**Counters**: `totalTrades`, `tradingDaysCount`, `openTradesCount`, `lastTradingDay`.

**Violations**: `violations[] {rule, description, severity: WARNING|FAIL, ...}`, `warningsCount`, `failReason`, `failedAt`, `passedAt`.
WARNING = flagged but doesn't fail; FAIL = account → FAILED immediately.

**Payment/coupon**: `paymentStatus`, `pendingPurchaseTransactionId`, `couponSnapshot {code, ibId, ibUserId, discountPercent, originalFee, discountAmount, finalFee, challengePurchaseCommissionPercent, ibCommissionAmount, ibCommissionId, redeemedAt}` (immutable audit copy).

**Funded linkage / payout**: `fundedAccountId` (→ the separate FUNDED account), `fundedAt`, `profitSplitPercent`,
`totalWithdrawn`, `lastWithdrawalDate` (cooldown + cycle reset), `payoutCount`, `expiresAt`, `expiredAt`.

**Key methods**
- `updateEquity(newEquity)` — mark-to-market; updates lows/high, recomputes daily/overall DD and `currentProfitPercent`.
- `resetDailyStats()` — snapshots `dayStartEquity/Balance`, resets `lowestEquityToday`, `tradesToday`, daily DD.
- `addViolation(rule, desc, severity)` — logs; FAIL flips status → FAILED.

---

## 2. PURCHASE → ACTIVATION

### 2.1 User buys (`propTradingEngine.requestChallengeBuy` — current UPI flow)
1. Validate challenge + tier (read-only). 2. Validate coupon (IB or global). 3. **Reserve** coupon slot atomically.
4. Create `ChallengeAccount` **PENDING** with wallet fields pre-filled (`walletBalance=walletFreeMargin=fundSize`), `paymentStatus='PAYMENT_PENDING'`, `expiresAt=null`.
5. Create `Transaction` `type='challenge_purchase'` `status='pending'` with `challengePurchaseInfo {challengeId, challengeAccountId, fundSize, originalFee, finalFee, coupon...}`.
6. Link `account.pendingPurchaseTransactionId`. **No money moves** — admin approval activates.

(Legacy `buyChallenge` deducts `User.wallet.balance` immediately and creates the account ACTIVE/FUNDED in one step.)

### 2.2 Admin approval (`challengeApproval.service.approveChallengeBuy`)
1. Load tx + linked account. 2. Finalize coupon (IB → `redeemCoupon` creates IBCommission + credits IB wallet; global → analytics) and write `account.couponSnapshot`.
3. **Activate**:
   - **Instant (0-step)** → `status='FUNDED'`, `accountType='FUNDED'`, `fundedAt=now`, `expiresAt=now+accountLifetimeDays`, `payoutCount=0`.
   - **1/2-step** → `status='ACTIVE'`, `expiresAt=now+challengeExpiryDays`.
4. `dayStartEquity=dayStartBalance=initialBalance`. 5. tx `status='approved'`. 6. Email "account is LIVE".

---

## 3. TRADING (open / close / mark-to-market)

### 3.1 Open (`challengePropEngine.openPosition` + `propTradingEngine.validateTradeOpen`)
Validation gates (vs `challenge.rules`): account ACTIVE/FUNDED; not past expiry; leverage ≤ max; tradesToday/totalTrades/concurrent caps; lot min/max + whole-lot rule; allowed symbols/segments; **daily-profit cap** (EVAL only — if today's realised ≥ cap, reject new opens with `DAILY_PROFIT_CAP_REACHED`, closes still allowed).

**SL/TP validation** (so it can't fire instantly): BUY → SL below live bid, TP above live ask; SELL → SL above live ask, TP below live bid (checked vs live Zerodha bid/ask at order time).

**Market hours**: NSE/NFO/BSE/BFO 09:15–15:15 IST (no new opens after 15:15), CDS until 16:55, MCX 24/7, weekends rejected.

**Margin & commission**: from admin NettingSegment config; `effectiveQty = quantity || volume×lotSize`; admin spread applied (BUY pays more / SELL receives less); option BUY = premium, option SELL = configured margin, futures = intraday margin; require `walletFreeMargin ≥ margin + openCommission`. Creates a `ChallengePosition`, reserves margin, bumps counters, adds the IST day to `uniqueTradingDays`.

### 3.2 Close (`challengePropEngine.closePosition(positionId, closePrice, reason)`)
`reason ∈ {user, auto-sl, auto-tp, challenge-failed, auto-market-close, challenge-expired, phase_advance}`.
1. `realisedPnl = priceDiff × effectiveQty` (BUY: close−entry, SELL: entry−close). 2. minus close commission.
3. Settle sub-wallet: `walletBalance += realisedPnl − closeComm`, release margin, recompute equity/free-margin/`currentBalance/Equity`.
4. Mark position closed. 5. `dailyPnlMap[istDay] += netPnl`.
6. Call `propTradingEngine.onTradeClosed(accountId, netPnl, { balanceAlreadySettled: true })` — **flag prevents double-counting** the P&L (the wallet was already settled here). `onTradeClosed` then runs DD breach → max-one-day → (ACTIVE only) profit-target check.

### 3.3 Mark-to-market (`challengePropEngine.refreshEquity(accountId, livePrices)`) — every tick
For each open position: `floatingPnl = priceDiff × effectiveQty`; `walletEquity = walletBalance + Σ floating`.
**SL/TP triggers**: BUY closes at **bid** (SL: bid≤sl, TP: bid≥tp), SELL closes at **ask** (SL: ask≥sl, TP: ask≤tp).
Then `updateEquity` + DD breach; on breach **auto-close ALL** positions at the exact mark price that caused it (so realised reconciles with the floating that failed it).

---

## 4. RULE ENGINE (`propTradingEngine.js`)

### 4.1 `checkDrawdownBreach` — FAIL conditions
```
dailyBase  = max(dayStartBalance, dayStartEquity)
dailyDD%   = max(0, dailyBase − lowestEquityToday) / initialBalance × 100   → breach if ≥ maxDailyDrawdownPercent
overallDD% = (initialBalance − lowestEquityOverall) / initialBalance × 100  → breach if ≥ maxOverallDrawdownPercent
```
On breach: status→FAILED, FAIL violation, auto-close all positions, Email "Failed". Idempotent (skips if not ACTIVE/FUNDED).

### 4.2 `checkMaxOneDayProfit` — cap, not fail
```
maxDayAbs = (maxOneDayProfitPercentOfTarget/100) × (targetPercent/100) × phaseStartBalance
```
A day over the cap only earns a **WARNING** (auto-healed if later losses pull it back under). It never fails the account; it just limits how much of that day counts toward the target.

### 4.3 `checkConsistencyRule` — **payout gate only**
`bestDayRatio = bestDay / totalPositiveProfit × 100`; fails if `> consistencyMaxDayPercent`. **Removed from the evaluation pass gates** — it only blocks funded payouts.

### 4.4 `checkProfitTarget` — pass logic (ACTIVE only; also run by the sweep)
```
capped = capPercent>0 ? Σ_days min(dayPnl, maxDayAbs)  (negatives counted in full) : totalPnl
effectiveProfitPercent = capped / phaseStartBalance × 100
```
PASS requires: `effectiveProfitPercent ≥ targetPercent` **AND** no FAIL violation **AND** `totalTrades ≥ minTradesRequired` **AND** `uniqueTradingDays.length ≥ tradingDaysRequired`. (Consistency is **not** a gate here.)

### 4.5 `syncRealizedFromPositions(account)` — heal stale trackers
Before judging a pass, rebuild `dailyPnlMap` + `currentProfitPercent` from **actual closed positions** in the current phase, and `uniqueTradingDays` + `totalTrades` from real positions — so the engine judges on the same data the UI shows (fixes "panel says 100% but won't pass").

---

## 5. PASS / PHASE-ADVANCE / FUNDING

- **Instant (0-step)** → FUNDED on approval (§2.2).
- **1-Step** → target hit → `createFundedAccount()` mints a **new** FUNDED account (fresh at `initialBalance`, `fundedAt=now`, 30-day life, all trackers zero); original → `PASSED`, `fundedAccountId` linked.
- **2-Step** → phase-1 target hit → **phase advance** (NOT funding):
  square off phase-1 open positions; **reset** `currentBalance/Equity/wallet*` and `phaseStartBalance` to `initialBalance`; zero `totalProfitLoss/openTradesCount/tradesToday/totalTrades/tradingDaysCount/dailyPnlMap/uniqueTradingDays`; reset DD watermarks; keep only FAIL violations; `currentPhase=2`, `phaseStartedAt=now`. Phase-2 target hit → FUNDED. **Each phase is an independent evaluation — no profit carries over.**
- **Pass sweep** (`runChallengePassSweep`, every 3 min): re-evaluates ACTIVE accounts **with zero open positions** (real open count, not the stored counter) via `syncRealizedFromPositions` + `checkProfitTarget`. Safety net so a met target always reaches FUNDED even if the exact close-moment trigger was missed.

> **Two-account model:** a passed evaluation account stays `PASSED` (frozen record) and a **separate** FUNDED account does the live trading/withdrawals. The Passed-Challenges UI hides a PASSED card once its `fundedAccountId` exists, to avoid a confusing duplicate.

---

## 6. FUNDED PAYOUT / WITHDRAWAL

### 6.1 Request (`propTradingEngine.withdrawProfit`, `POST /api/prop/withdraw`)
Five gates (first unmet wins): (1) age since `fundedAt` ≥ `minDaysSinceFundedForPayout`; (2) `uniqueTradingDays ≥ minTradingDaysForPayout`; (3) profit% ≥ `minProfitPercentForPayout`; (4) consistency `bestDay ≤ consistencyMaxDayPercent`; (5) cooldown since `lastWithdrawalDate` ≥ `withdrawalFrequencyDays`. No second pending request allowed.
```
profit       = walletBalance − initialBalance
traderShare  = profit × profitSplitPercent/100
cycleCap     = initialBalance × maxWithdrawalPercent/100        (default 5%)
withdrawable = min(traderShare, cycleCap)                       (and min(userAmount, …) if specified)
```
Creates a pending `Transaction` `type='withdrawal'`, `paymentDetails.kind='prop_payout'`. **The frontend modal and the backend both enforce this cap** (the modal shows the 5%-capped figure, not the raw split).

### 6.2 Approval (admin; `server/index.js` prop_payout branch / `propTrading.js` payout route)
Credits `User.walletINR`; then **resets the funded sub-wallet** to `initialBalance` (`walletBalance/Equity/FreeMargin/currentBalance/Equity/phaseStartBalance`), `totalWithdrawn += amount`, `lastWithdrawalDate=now`, `payoutCount += 1`; auto-rejects other pending prop payouts for that user.

### 6.3 "Current cycle" accounting
After a payout the cycle restarts. `my-accounts` and the objectives endpoint compute current-cycle profit from **closed positions with `closeTime ≥ max(phaseStartedAt, lastWithdrawalDate)`** — so a paid-out funded account correctly shows the reset balance and fresh profit, not the pre-payout figure.

---

## 7. CRON (`server/cron/settlement.cron.js`)
- **Daily reset @ 00:05 IST** (`runChallengeDailyReset`): snapshot `dayStartEquity/Balance`, reset `lowestEquityToday`, `tradesToday`, daily DD on every ACTIVE/FUNDED account.
- **Pass sweep / 3 min** (`runChallengePassSweep`): see §5.
- **Expiry sweep / 30 min** (`runChallengeExpirySweep`): force-close open positions at live LTP, flip past-`expiresAt` accounts → EXPIRED.
- **Market-close square-off @ 15:15 IST**: close Indian-exchange positions (skip 24/7 markets).
- **Option expiry settlement / 2 min**: intrinsic settlement on expiry day.

---

## 8. ADMIN CONTROLS
- **Force-pass** → mark PASSED + `createFundedAccount()` (seeds wallet fields properly).
- **Force-fail** → mark FAILED + reason + FAIL violation.
- **Extend time** → add days to `expiresAt`.
- **Reset** → back to ACTIVE at `initialBalance`, counters/violations cleared.
- **Delete** → wipe account + its positions + its transactions (User.wallet untouched).
- **Dashboard stats**, **challenge CRUD**, **buy-request approve/reject**, **payout approve/reject**.
- **`my-accounts` enrichment**: server returns `cappedProfitPercent`, `dailyDDPercent`, `overallDDPercent`, live balance/equity computed from positions with the **cycle cutoff** above.

---

## 9. KEY ENDPOINTS

**User** (`/api/prop/*`): `status`, `challenges`, `buy-request`, `demo` / `demo/reset`, `my-accounts`, `my-positions`, `my-payouts`, `accounts/:id/positions`, `account/:id/insights`, `positions/:positionId/sltp` (PUT), `positions/:positionId/close` (POST), `withdraw` (POST).

**Admin**: `admin/settings`, `admin/demo-settings`, `admin/challenges` (CRUD), `admin/accounts`, `admin/force-pass/:id`, `admin/force-fail/:id`, `admin/extend-time/:id`, `admin/reset/:id`, `admin/account/:id` (DELETE), `admin/dashboard`, `admin/challenge-buys` (+ approve/reject), `admin/payouts` (+ approve/reject).

---

## 10. KEY FORMULAS (exact)
```
currentProfitPercent  = (currentEquity − phaseStartBalance) / phaseStartBalance × 100
dailyDD%              = max(0, max(dayStartBalance,dayStartEquity) − lowestEquityToday) / initialBalance × 100
overallDD%            = (initialBalance − lowestEquityOverall) / initialBalance × 100
maxDayAbs            = (maxOneDayProfitPercentOfTarget/100) × (targetPercent/100) × phaseStartBalance
cappedProfit         = Σ_days [ dayPnl>0 ? min(dayPnl, maxDayAbs) : dayPnl ]
effectiveProfit%     = cappedProfit / phaseStartBalance × 100        (PASS if ≥ targetPercent + other gates)
withdrawable         = min(profit × profitSplitPercent/100,  initialBalance × maxWithdrawalPercent/100)
```

---

## 11. EDGE CASES / GOTCHAS
1. **IST everywhere** — day bucketing, daily reset, pass gates all use Asia/Kolkata, not UTC.
2. **Isolated sub-wallet** — trading never touches `User.wallet`; only approved payouts credit `User.walletINR`.
3. **Phase 2 is independent** — full reset to `initialBalance`, phase-1 P&L wiped.
4. **Daily DD anchor** uses `max(dayStartBalance, dayStartEquity)` to avoid phantom overnight DD.
5. **Consistency is payout-only**, never an evaluation pass-blocker (the max-one-day cap handles "spread your profit").
6. **Pass judged on realised, settled state** — close-time or the zero-open-positions sweep; transient floating gains don't trigger funding.
7. **Funded size inherits `initialBalance`** (tier-aware), not `challenge.fundSize` base.
8. **Daily-profit cap blocks new opens only** (EVAL) once today's realised ≥ cap; closes stay allowed; resets next IST day.
9. **SL/TP can't be set on the wrong side** of the live price (else it would fire on the next tick) — validated on open and on modify.
10. **`balanceAlreadySettled`** flag on `onTradeClosed` prevents the recurring double-count of P&L.
11. **Two-account model**: PASSED (frozen record) + separate FUNDED (live). Cards de-duplicate once linked.
12. **Coupon snapshot** is immutable for IB-commission audit even after a coupon changes/expires; orphan commissions (deleted buyer account) are still surfaced from the IBCommission ledger so totals reconcile with the wallet.
