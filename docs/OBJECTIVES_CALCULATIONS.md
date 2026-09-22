# Objectives Panel — Calculation Logic (Admin Reference)

Yeh document explain karta hai ki **My Challenges** page ke **Objectives** section me
har metric kaise calculate hota hai. Sab code `server/routes/propTrading.js` ke andar
`GET /api/prop/challenge/:id` endpoint me hai.

User screenshot example ke saath samjho:

```
Challenge: 1-Step · Size ₹5,00,000
Rules:     Daily DD 4%, Max DD 10%, Profit Target 10%, Max 1-Day Profit 40%

Objectives:
  Minimum 5 Trading Days   :  2 / 5
  Max Daily Loss −₹20,000  :  −₹0 (0% of limit)
  Max Loss      −₹50,000   :  −₹0 (0% of limit)
  Profit Target  ₹50,000   :  +₹12,059 (24% of limit)
  Max One-Day Profit ₹20K  :  +₹23,617 (max ₹20,000)
```

---

## 1. Minimum Trading Days — `2 / 5`

**Source:** Closed positions ka unique date count.

```js
const tradingDaySet = new Set();
for (const p of allPositions) {           // open + closed combined
  const t = p.openTime || p.createdAt;
  if (t) tradingDaySet.add(new Date(t).toISOString().slice(0, 10));
}
const actualTradingDays = tradingDaySet.size;
```

**Logic:** Har trade ki opening date IST day me convert karke `Set` me daalo.
Set automatically duplicates remove karta hai. Final size = unique trading days count.

**Display:** `actualTradingDays / tradingDaysRequired` (e.g. `2 / 5`).

---

## 2. Max Daily Loss — `−₹0 (0% of limit)`

**Limit:** `Initial Balance × Daily DD %`  
For ₹5L account, 4% rule: limit = ₹20,000

**Calculation:**

```js
const equityForDD = Number(currentEquity);
const dayStartBalForLoss = Number(account.dayStartBalance)
                        || Number(account.dayStartEquity)
                        || equityForDD;

const dailyLossAmount = Math.max(0, dayStartBalForLoss - equityForDD);
const dailyUsed = initialBalance > 0
  ? (dailyLossAmount / initialBalance) * 100
  : 0;
```

**Logic:**
- `dayStartBalance` = aaj subah 00:05 IST cron ne walletBalance ka snapshot liya tha
- `currentEquity` = abhi ki real equity (balance + floating P&L)
- Drop = jo bhi dayStart se neeche giri hai equity → woh aaj ka loss
- `Math.max(0, ...)` ensure karta hai profit days pe -₹0 dikhe (positive number = no loss)

**Display:**
- ₹ amount: `dailyLossAmount`
- % of limit: `(dailyLossAmount / configuredLimit) × 100`
- Example: ₹10,979 loss vs ₹20K limit → "−₹10,979 (55% of limit)"

**Breach:** Jab `dailyUsed >= rules.maxDailyDrawdownPercent` → engine fail karta hai.

---

## 3. Max Loss — `−₹0 (0% of limit)`

**Limit:** `Initial Balance × Max DD %`  
For ₹5L account, 10% rule: limit = ₹50,000

**Calculation:**

```js
const overallLossAmount = Math.max(0, initialBalance - equityForDD);
const overallUsed = initialBalance > 0
  ? (overallLossAmount / initialBalance) * 100
  : 0;
```

**Logic:**
- `initialBalance` = fixed (never changes for the account lifetime)
- Drop from initial = cumulative net loss
- Floor at 0 — profit days me display `−₹0`

**Display:** Similar to Max Daily Loss but anchored on `initialBalance`.

**Breach:** Industry-standard STATIC floor — `currentEquity < initialBalance × (1 − maxDD%)` triggers fail.

---

## 4. Profit Target — `+₹12,059 (24% of limit)`

**Target:** `Initial Balance × Profit Target %`  
For ₹5L, 10% rule: target = ₹50,000

**Calculation (with Max 1-Day Cap applied):**

```js
const realisedInPhase = closedRaw.reduce((s, p) => s + Number(p.profit || 0), 0);
const floatingInPhase = openRaw.reduce((s, p) => s + Number(p.profit || 0), 0);

// Max 1-Day Profit cap = cap% × target% × phaseStartBalance
const capPercentForTarget = Number(rules.maxOneDayProfitPercentOfTarget) || 0;
const maxDayAbs = (capPercentForTarget / 100) * (targetPercent / 100) * phaseStartBalForProfit;

// Per-day aggregation
const dailyAgg = new Map();
for (const p of closedRaw) {
  const day = p.closeTime
    ? new Date(p.closeTime).toISOString().slice(0, 10)
    : null;
  if (!day) continue;
  dailyAgg.set(day, (dailyAgg.get(day) || 0) + Number(p.profit || 0));
}

// Today ka floating bhi add karo (intraday cap bites hard)
const todayKey = new Date().toISOString().slice(0, 10);
dailyAgg.set(todayKey, (dailyAgg.get(todayKey) || 0) + floatingInPhase);

// Cap apply karo per day
let validProfitForTarget = 0;
let ignoredProfitForTarget = 0;
for (const [, pnl] of dailyAgg) {
  if (pnl > 0) {
    validProfitForTarget += Math.min(pnl, maxDayAbs);          // cap positive days
    ignoredProfitForTarget += Math.max(0, pnl - maxDayAbs);    // overflow ignored
  } else {
    validProfitForTarget += pnl;                                // losses fully count
  }
}

const profitPercent = (validProfitForTarget / phaseStartBalForProfit) * 100;
```

**Logic per Rules Spec:**
- Har positive day ka profit `maxDayAbs` (= cap) tak hi count hota hai
- Negative days fully count (loss reduces profit progress)
- Extra profit balance me dikhega (drawdown buffer ke liye useful), but target progress me NAHI count hota
- User ko target poora karne ke liye multiple days me profit kamana padega (no "lucky one big day")

**Example calculation:**

```
Challenge: 10% target (₹50,000) on ₹5L account
Cap: 40% × 10% × ₹5L = ₹20,000 per day

Daily P&L breakdown:
  03 Jun: +₹23,617  → counts ₹20,000 (capped), ₹3,617 ignored
  04 Jun: −₹3,500   → counts −₹3,500 (full loss)
  05 Jun: +₹4,000   → counts ₹4,000 (under cap)
  
Valid profit for target: 20,000 − 3,500 + 4,000 = ₹20,500
Profit progress: 20,500 / 50,000 = 41%

(Screenshot ke case me +₹12,059 means valid profit = 24% of ₹50K target)
```

**Pass condition:** `profitPercent >= targetPercent` AND no FAIL violations.

---

## 5. Max One-Day Profit — `+₹23,617 (max ₹20,000)`

**Cap:** `Max 1-Day % × Profit Target % × Initial Balance`  
For ₹5L, 40% × 10%: cap = ₹20,000

**Calculation:**

```js
const maxDayProfitAbs = (maxOneDayCap / 100) * (targetPercent / 100) * initialBalance;
const dailyPnlMap = account.dailyPnlMap || new Map();

let bestDayPnl = 0;
for (const [, pnl] of dailyPnlMap) {
  if (pnl > bestDayPnl) bestDayPnl = pnl;
}

const isPassing = bestDayPnl <= maxDayProfitAbs;
```

**Logic:**
- Engine har trade close pe `dailyPnlMap[IST_day] += closePnl` track karta hai
- Best day = sab days me se sab se profitable din ka net P&L
- Agar best day > cap → violation logged (account fail nahi hota, sirf warning)
- Display: `+₹<bestDay> (max ₹<cap>)`

**Important:** Ye rule **account fail nahi karta**. Sirf:
- Warning violation log hoti hai
- Profit Target progress me capped sum use hota hai (point #4 dekho)

User ko cap se zyada profit ek din me kamane pe extra profit balance me dikhega
(drawdown buffer ke liye useful), but target poora karne ke liye spread chahiye.

---

## Required Data Sources

| Field | Source | When updated |
|---|---|---|
| `initialBalance` | ChallengeAccount | Account creation (fixed) |
| `currentEquity` | ChallengeAccount.walletEquity | Every tick + trade close |
| `dayStartBalance` | ChallengeAccount | 00:05 IST cron + reactivate |
| `phaseStartBalance` | ChallengeAccount | Phase advance |
| `dailyPnlMap` | ChallengeAccount | Trade close (per IST day key) |
| `closedRaw` | ChallengePosition (status=closed) | Trade close |
| `openRaw` | ChallengePosition (status=open) | Trade open |
| `rules.*` | Challenge.rules | Admin config |

---

## Engine vs Display Consistency

**Engine** (breach detection) reads:
- `account.currentDailyDrawdownPercent` (stored, updated by `account.updateEquity()`)
- `account.currentOverallDrawdownPercent` (stored)

**Display** (Objectives panel) computes live:
- `dailyLossAmount` from `dayStartBalance − currentEquity`
- `overallLossAmount` from `initialBalance − currentEquity`

Both anchor on the SAME `dayStartBalance` field, so a reactivated account
shows 0% on both views simultaneously (no display lag vs engine state).

---

## File References

- **Main calculation:** `server/routes/propTrading.js` — `GET /api/prop/challenge/:id` (lines ~920-1100)
- **Engine breach check:** `server/services/propTradingEngine.js` — `checkDrawdownBreach()` (line ~726)
- **DD% storage:** `server/models/ChallengeAccount.js` — `updateEquity()` method (line ~315)
- **Daily reset cron:** `server/cron/settlement.cron.js` — `runChallengeDailyReset()` (line ~517)
- **Max 1-Day cap in pass-check:** `server/services/propTradingEngine.js` — `checkProfitTarget()` (line ~960)
