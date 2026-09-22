const express = require('express');
const router = express.Router();
const Challenge = require('../models/Challenge');
const ChallengeAccount = require('../models/ChallengeAccount');
const ChallengePosition = require('../models/ChallengePosition');
const PropSettings = require('../models/PropSettings');
const { resolveAdminFromRequest, getScopedUserIds } = require('../middleware/adminPermission');

// Day-bucket key in IST — MUST stay identical to propTradingEngine.istDayKey so
// the Objectives panel buckets trading days EXACTLY like the engine that decides
// pass/fail. Indian sessions closing between 00:00–05:30 IST fall on the previous
// UTC day; bucketing in UTC (the old behaviour) made the panel's trading-day
// count, Today's PnL and per-day profit cap disagree with the engine for those
// trades — e.g. a trade at 02:00 IST counted as "yesterday" on the panel but
// "today" in the engine, so Min-Trading-Days and the Max-One-Day-Profit cap
// could read differently here than what actually passes the challenge.
function istDayKey(d = new Date()) {
  const ist = new Date(new Date(d).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.toISOString().slice(0, 10);
}

// Admin auth middleware (reuses existing admin resolution)
async function verifyAdminToken(req, res, next) {
  try {
    const admin = await resolveAdminFromRequest(req);
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
}

// Helper: get user IDs scoped to this admin
async function getAdminUserIds(admin) {
  return getScopedUserIds(admin);
}

// ==================== ADMIN ROUTES ====================

// GET /api/prop/admin/settings
router.get('/admin/settings', verifyAdminToken, async (req, res) => {
  try {
    const settings = await PropSettings.getSettings(req.admin._id);
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/prop/admin/settings
router.put('/admin/settings', verifyAdminToken, async (req, res) => {
  try {
    const { challengeModeEnabled, displayName, description, termsAndConditions, autoCloseAtMarketClose } = req.body;
    const settings = await PropSettings.updateSettings({
      challengeModeEnabled,
      displayName,
      description,
      termsAndConditions,
      autoCloseAtMarketClose
    }, req.admin._id);
    res.json({ success: true, message: 'Settings updated', settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/prop/admin/challenges - Create new challenge
router.post('/admin/challenges', verifyAdminToken, async (req, res) => {
  try {
    const challengeData = { ...req.body };
    challengeData.adminId = req.admin._id;
    const challenge = await Challenge.create(challengeData);
    res.json({ success: true, message: 'Challenge created', challenge });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/prop/admin/challenges - Get all challenges
router.get('/admin/challenges', verifyAdminToken, async (req, res) => {
  try {
    const challengeQuery = { adminId: req.admin._id };
    const challenges = await Challenge.find(challengeQuery).sort({ sortOrder: 1, fundSize: 1 });
    res.json({ success: true, challenges });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/prop/admin/challenges/:id - Update challenge
router.put('/admin/challenges/:id', verifyAdminToken, async (req, res) => {
  try {
    const existing = await Challenge.findById(req.params.id);
    if (!existing || existing.adminId?.toString() !== req.admin._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const challenge = await Challenge.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }
    res.json({ success: true, message: 'Challenge updated', challenge });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE /api/prop/admin/challenges/:id - Delete challenge
router.delete('/admin/challenges/:id', verifyAdminToken, async (req, res) => {
  try {
    const existingChallenge = await Challenge.findById(req.params.id);
    if (!existingChallenge || existingChallenge.adminId?.toString() !== req.admin._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const accountsCount = await ChallengeAccount.countDocuments({ challengeId: req.params.id });
    if (accountsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete. ${accountsCount} accounts are using this challenge.`
      });
    }
    await Challenge.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Challenge deleted' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/prop/admin/accounts - Get all challenge accounts
router.get('/admin/accounts', verifyAdminToken, async (req, res) => {
  try {
    const { status, challengeId, limit = 50, offset = 0 } = req.query;
    // Demo accounts are a user-facing practice sandbox, not business data —
    // they never appear anywhere in admin.
    let query = { accountType: { $ne: 'DEMO' } };
    if (status) query.status = status;
    if (challengeId) query.challengeId = challengeId;

    const acctUserIds = await getAdminUserIds(req.admin);
    if (acctUserIds) query.userId = { $in: acctUserIds };

    const accounts = await ChallengeAccount.find(query)
      .populate('userId', 'name email oderId')
      .populate('challengeId', 'name fundSize stepsCount')
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();

    // ── Enrich with LIVE values from positions ────────────────────────────
    // The admin table previously showed the stored watermark fields
    // (currentBalance / currentEquity / currentDailyDrawdownPercent /
    // currentOverallDrawdownPercent / currentProfitPercent). Those are only
    // updated on trade-close / equity-refresh, so they DRIFT from what the user
    // sees on their own dashboard (which recomputes from positions in real time).
    // We now recompute the exact same figures here — realised P&L (closed after
    // the current cycle cutoff) + floating P&L (open) → balance, equity, daily &
    // overall DD, profit % — so admin numbers match the user's screen 1:1.
    const ids = accounts.map(a => a._id);
    const [openPositions, closedPositions] = await Promise.all([
      ChallengePosition.find({ challengeAccountId: { $in: ids }, status: 'open' }).lean(),
      ChallengePosition.find({ challengeAccountId: { $in: ids }, status: 'closed' }).lean()
    ]);
    const cutoffByAccount = {};
    for (const a of accounts) {
      const ps = a.phaseStartedAt ? new Date(a.phaseStartedAt).getTime() : 0;
      const lw = a.lastWithdrawalDate ? new Date(a.lastWithdrawalDate).getTime() : 0;
      cutoffByAccount[String(a._id)] = Math.max(ps, lw);
    }
    const byAccount = {};
    const mkLive = () => ({ floatingPnl: 0, openCount: 0, closedPnl: 0, dailyClosed: {} });
    for (const pos of openPositions) {
      const key = String(pos.challengeAccountId);
      if (!byAccount[key]) byAccount[key] = mkLive();
      byAccount[key].floatingPnl += Number(pos.profit) || 0;
      byAccount[key].openCount += 1;
    }
    for (const pos of closedPositions) {
      const key = String(pos.challengeAccountId);
      const cutoff = cutoffByAccount[key] || 0;
      if (cutoff && pos.closeTime && new Date(pos.closeTime).getTime() < cutoff) continue;
      if (!byAccount[key]) byAccount[key] = mkLive();
      byAccount[key].closedPnl += Number(pos.profit) || 0;
      if (pos.closeTime) {
        const d = istDayKey(pos.closeTime);
        byAccount[key].dailyClosed[d] = (byAccount[key].dailyClosed[d] || 0) + (Number(pos.profit) || 0);
      }
    }
    const enriched = accounts.map(a => {
      const live = byAccount[String(a._id)] || mkLive();
      const initialBalance = Number(a.initialBalance || 0);
      const realisedPnl = live.closedPnl;
      const totalPnl = realisedPnl + live.floatingPnl;
      const computedBalance = initialBalance + realisedPnl;
      const liveEquity = computedBalance + live.floatingPnl;
      const todaysNet = Number((live.dailyClosed || {})[istDayKey()] || 0) + Number(live.floatingPnl || 0);
      const dailyDDPercent = initialBalance > 0 ? (Math.max(0, -todaysNet) / initialBalance) * 100 : 0;
      const overallDDPercent = initialBalance > 0 ? (Math.max(0, initialBalance - liveEquity) / initialBalance) * 100 : 0;
      const profitPercent = initialBalance > 0 ? (totalPnl / initialBalance) * 100 : 0;
      return {
        ...a,
        currentBalance: computedBalance,
        currentEquity: liveEquity,
        currentDailyDrawdownPercent: dailyDDPercent,
        currentOverallDrawdownPercent: overallDDPercent,
        currentProfitPercent: profitPercent,
        floatingPnl: live.floatingPnl,
        realisedPnl,
        totalPnl,
        openCount: live.openCount
      };
    });

    const total = await ChallengeAccount.countDocuments(query);
    res.json({ success: true, accounts: enriched, total });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/prop/admin/top-traders — "Top Traders of the Day" board.
// Ranks every account that traded TODAY and YESTERDAY (IST) by that day's P&L,
// and flags anyone brushing up against the max-one-day-profit rule so admin can
// eyeball suspicious single-day spikes before a pass/payout.
router.get('/admin/top-traders', verifyAdminToken, async (req, res) => {
  try {
    const scopeUserIds = await getAdminUserIds(req.admin);
    const accountFilter = { accountType: { $ne: 'DEMO' } };
    if (scopeUserIds) accountFilter.userId = { $in: scopeUserIds };

    const accounts = await ChallengeAccount.find(accountFilter)
      .populate('userId', 'name email oderId')
      .populate('challengeId', 'name stepsCount rules.profitTargetPhase1Percent rules.profitTargetPhase2Percent rules.profitTargetInstantPercent rules.maxOneDayProfitPercentOfTarget')
      .lean();
    const accById = {};
    for (const a of accounts) accById[String(a._id)] = a;
    const ids = accounts.map(a => a._id);

    const todayKey = istDayKey();
    const yesterdayKey = istDayKey(new Date(Date.now() - 86400000));

    // Closed trades from the last ~48h cover both IST days in full; open trades
    // contribute floating P&L to TODAY only.
    const since = new Date(Date.now() - 48 * 3600 * 1000);
    const [closed, open] = await Promise.all([
      ChallengePosition.find({ challengeAccountId: { $in: ids }, status: 'closed', closeTime: { $gte: since } }).lean(),
      ChallengePosition.find({ challengeAccountId: { $in: ids }, status: 'open' }).lean()
    ]);

    // bucket[day][accountId] = { pnl, trades, symbols{}, first, last }
    const bucket = { [todayKey]: {}, [yesterdayKey]: {} };
    const touch = (day, accId) => {
      if (!bucket[day][accId]) bucket[day][accId] = { pnl: 0, trades: 0, symbols: {}, first: null, last: null };
      return bucket[day][accId];
    };
    for (const p of closed) {
      if (!p.closeTime) continue;
      const day = istDayKey(p.closeTime);
      if (day !== todayKey && day !== yesterdayKey) continue;
      const b = touch(day, String(p.challengeAccountId));
      b.pnl += Number(p.profit) || 0;
      b.trades += 1;
      if (p.symbol) b.symbols[p.symbol] = (b.symbols[p.symbol] || 0) + 1;
      const openT = p.openTime ? new Date(p.openTime).getTime() : (p.createdAt ? new Date(p.createdAt).getTime() : null);
      const closeT = new Date(p.closeTime).getTime();
      if (openT && (b.first == null || openT < b.first)) b.first = openT;
      if (b.last == null || closeT > b.last) b.last = closeT;
    }
    // Today's floating from still-open positions.
    for (const p of open) {
      const b = touch(todayKey, String(p.challengeAccountId));
      b.pnl += Number(p.profit) || 0;
      if (p.symbol) b.symbols[p.symbol] = (b.symbols[p.symbol] || 0) + 1;
      const openT = p.openTime ? new Date(p.openTime).getTime() : null;
      if (openT && istDayKey(p.openTime) === todayKey) {
        b.trades += 1;
        if (b.first == null || openT < b.first) b.first = openT;
      }
    }

    const fmtTime = (ms) => {
      if (!ms) return '—';
      // HH:MM in IST
      const d = new Date(ms + 5.5 * 3600 * 1000);
      return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
    };
    const fmtAcc = (a) => {
      const steps = a.challengeId?.stepsCount;
      const label = steps === 0 ? 'Instant' : steps === 1 ? '1-Step' : '2-Step';
      const fs = Number(a.initialBalance) || 0;
      const money = fs >= 10000000 ? `₹${(fs / 10000000).toFixed(fs % 10000000 ? 1 : 0)}Cr`
        : fs >= 100000 ? `₹${(fs / 100000).toFixed(fs % 100000 ? 1 : 0)}L`
        : `₹${fs.toLocaleString('en-IN')}`;
      return `${label} · ${money}`;
    };
    const targetPctOf = (a) => {
      const r = a.challengeId?.rules || {};
      const steps = a.challengeId?.stepsCount;
      if (steps === 0) return Number(r.profitTargetInstantPercent) || 0;
      return a.currentPhase === 1 ? (Number(r.profitTargetPhase1Percent) || 0) : (Number(r.profitTargetPhase2Percent) || 0);
    };

    const buildRows = (day) => {
      const out = [];
      for (const [accId, b] of Object.entries(bucket[day] || {})) {
        const a = accById[accId];
        if (!a) continue;
        // Match the user's Objectives panel EXACTLY: profit target and the
        // one-day cap are both computed off phaseStartBalance, not initialBalance
        // (they differ after a phase advance). This keeps the board's % identical
        // to what the trader sees on their own screen.
        const phaseStart = Number(a.phaseStartBalance) || Number(a.initialBalance) || 0;
        const tPct = targetPctOf(a);
        const targetAmt = (tPct / 100) * phaseStart;
        const capPct = Number(a.challengeId?.rules?.maxOneDayProfitPercentOfTarget) || 0;
        const pctOfTarget = targetAmt > 0 ? (b.pnl / targetAmt) * 100 : 0;
        // Status: FLAG when the day's profit hit/exceeded the one-day cap;
        // WATCH when it's a big chunk (>35% of target) made in ≤3 trades.
        let status = 'OK';
        if (b.pnl > 0 && capPct > 0 && pctOfTarget >= capPct) status = 'FLAG';
        else if (b.pnl > 0 && pctOfTarget > 35 && b.trades <= 3) status = 'WATCH';
        const topSymbol = Object.entries(b.symbols).sort((x, y) => y[1] - x[1])[0]?.[0] || '—';
        out.push({
          accountId: accId,
          accountCode: a.accountId,
          trader: a.userId?.name || a.userId?.oderId || 'Unknown',
          email: a.userId?.email || '',
          accountLabel: fmtAcc(a),
          symbol: topSymbol,
          trades: b.trades,
          dayPnl: Number(b.pnl.toFixed(2)),
          pctOfTarget: Number(pctOfTarget.toFixed(0)),
          capPct,
          firstTrade: fmtTime(b.first),
          lastTrade: fmtTime(b.last),
          status
        });
      }
      out.sort((x, y) => y.dayPnl - x.dayPnl);
      return out;
    };

    res.json({
      success: true,
      todayKey,
      yesterdayKey,
      today: buildRows(todayKey),
      yesterday: buildRows(yesterdayKey)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/prop/admin/account/:id/trailing-dd — turn the trailing-drawdown
// rule ON/OFF for ONE account (Instant/Funded only). Default is OFF for every
// account; admin opts in per account. Enabling seeds peak/floor/lock from the
// account's current closed equity so the floor starts correctly.
router.post('/admin/account/:id/trailing-dd', verifyAdminToken, async (req, res) => {
  try {
    const enabled = req.body?.enabled === true || req.body?.enabled === 'true';
    const account = await ChallengeAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
    if (account.accountType !== 'FUNDED') {
      return res.status(400).json({ success: false, message: 'Trailing drawdown applies to Instant / Funded accounts only.' });
    }

    account.trailingDrawdown = account.trailingDrawdown || {};
    account.trailingDrawdown.enabled = enabled;
    if (enabled) {
      // Seed from current CLOSED equity (currentBalance = initial + realised).
      const initial = Number(account.initialBalance) || 0;
      const trailAbs = 0.06 * initial;
      const closedEquity = Number(account.currentBalance) || initial;
      const peak = Math.max(closedEquity, Number(account.trailingDrawdown.peakEquity) || 0, initial);
      account.trailingDrawdown.peakEquity = peak;
      let floor = peak - trailAbs;
      let locked = false;
      if (floor >= initial) { floor = initial; locked = true; }
      account.trailingDrawdown.trailingFloor = floor;
      account.trailingDrawdown.isLocked = locked;
    }
    account.markModified('trailingDrawdown');
    await account.save();
    res.json({ success: true, message: `Trailing drawdown ${enabled ? 'enabled' : 'disabled'}`, trailingDrawdown: account.trailingDrawdown });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/prop/purchase-intent — log that a user tapped "Pay via UPI" on a
// plan (buying intent). Upserts one lead row per user+challenge+tier so repeat
// taps just bump the counter. Never blocks the buy flow (best-effort).
router.post('/purchase-intent', verifyUserToken, async (req, res) => {
  try {
    const PurchaseIntent = require('../models/PurchaseIntent');
    const { challengeId, tierIndex = 0, accountType = '', fundSize = 0, fee = 0, challengeName = '' } = req.body || {};
    if (!challengeId) return res.status(400).json({ success: false, message: 'challengeId required' });
    await PurchaseIntent.findOneAndUpdate(
      { oderId: req.user.oderId || String(req.user._id), challengeId, tierIndex: Number(tierIndex) || 0 },
      {
        $set: {
          userId: req.user._id,
          userName: req.user.name || '',
          phone: req.user.phone || '',
          email: req.user.email || '',
          challengeName, accountType, fundSize: Number(fundSize) || 0, fee: Number(fee) || 0,
          lastClickedAt: new Date(),
        },
        $inc: { clickCount: 1 },
        $setOnInsert: { createdAt: new Date(), status: 'intent' },
      },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (e) {
    // Best-effort — never surface to the buyer.
    res.json({ success: false, message: e.message });
  }
});

// GET /api/prop/admin/purchase-intents — leads list for the admin dashboard.
// Marks each lead 'purchased' if that user later created a challenge_purchase
// for the same challenge, so the team can focus on the ones who dropped off.
router.get('/admin/purchase-intents', verifyAdminToken, async (req, res) => {
  try {
    const PurchaseIntent = require('../models/PurchaseIntent');
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
    const rows = await PurchaseIntent.find({}).sort({ lastClickedAt: -1 }).limit(limit).lean();

    // 'purchased' is set only when the user actually submits a buy-request for
    // that plan (see /buy-request). Everyone else is a real follow-up lead.
    const enriched = rows.map(r => ({ ...r, purchased: r.status === 'purchased' }));
    const pending = enriched.filter(r => !r.purchased).length;
    res.json({ success: true, rows: enriched, total: enriched.length, pending });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// POST /api/prop/admin/force-pass/:id
router.post('/admin/force-pass/:id', verifyAdminToken, async (req, res) => {
  try {
    const account = await ChallengeAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    account.status = 'PASSED';
    account.passedAt = new Date();
    account.violations.push({
      rule: 'ADMIN_FORCE_PASS',
      description: `Forced pass by admin ${req.admin._id}`,
      severity: 'WARNING'
    });
    await account.save();
    propTradingEngine.sendAccountResultEmail(account, 'passed').catch(() => {}); // Email 5 (best-effort)

    // Create the funded account via the engine so it's a PROPER funded account:
    //  - sub-wallet fields (walletBalance / walletEquity / walletFreeMargin) —
    //    WITHOUT these the account had 0 free margin, so openPosition rejected
    //    every trade with "insufficient margin" (this was the reported bug).
    //  - fundedAt (payout-age gate), payoutCount, fresh DD / trading-day trackers.
    //  - inherits the user's ACTUAL tier fund size (account.initialBalance), not
    //    the challenge.fundSize base (which dropped ₹10L-tier users to ₹1L).
    //  - funded lifetime from fundedSettings.accountLifetimeDays.
    // createFundedAccount() also sets account.fundedAccountId and saves it.
    const fundedAccount = await propTradingEngine.createFundedAccount(account);

    res.json({ success: true, message: 'Challenge force passed', account, fundedAccount });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/prop/admin/force-fail/:id
router.post('/admin/force-fail/:id', verifyAdminToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const account = await ChallengeAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    account.status = 'FAILED';
    account.failedAt = new Date();
    account.failReason = reason || 'Admin force fail';
    account.violations.push({
      rule: 'ADMIN_FAIL',
      description: account.failReason,
      severity: 'FAIL',
      timestamp: new Date()
    });
    await account.save();
    propTradingEngine.sendAccountResultEmail(account, 'breached').catch(() => {}); // Email 4 (best-effort)
    res.json({ success: true, message: 'Challenge force failed', account });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/prop/admin/extend-time/:id
router.post('/admin/extend-time/:id', verifyAdminToken, async (req, res) => {
  try {
    const { days } = req.body;
    if (!days || days <= 0) {
      return res.status(400).json({ success: false, message: 'Days must be positive' });
    }
    const account = await ChallengeAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    // Base off the current expiry; fall back to "now" if it's missing/invalid
    // (e.g. an Instant funded account created without an expiry) so we never
    // produce an Invalid Date / NaN.
    const base = account.expiresAt ? new Date(account.expiresAt) : new Date();
    const newExpiry = isNaN(base.getTime()) ? new Date() : base;
    newExpiry.setDate(newExpiry.getDate() + Number(days));
    account.expiresAt = newExpiry;
    account.violations.push({
      rule: 'ADMIN_EXTEND_TIME',
      description: `Extended ${days} days by admin ${req.admin._id}`,
      severity: 'WARNING'
    });
    await account.save();
    res.json({ success: true, message: `Extended by ${days} days`, account });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/prop/admin/reset/:id
router.post('/admin/reset/:id', verifyAdminToken, async (req, res) => {
  try {
    const account = await ChallengeAccount.findById(req.params.id).populate('challengeId');
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    const challenge = account.challengeId;
    // Instant challenges (stepsCount === 0) are FUNDED from day one — an admin
    // reset must restore them to that SAME funded state, not a plain ACTIVE
    // evaluation. Otherwise the account shows a confusing "Active badge / Funded
    // phase" mix and disappears from Passed Challenges (which lists FUNDED /
    // PASSED), so the user loses their withdraw option. Mirrors the paid-reset
    // logic in challengeReset.service. (BUG 2)
    const isInstant = challenge.stepsCount === 0;
    const expiryDays = challenge.rules?.challengeExpiryDays;
    const expiresAt = new Date();
    if (isInstant && (expiryDays === null || expiryDays === undefined)) {
      expiresAt.setFullYear(expiresAt.getFullYear() + 50);
    } else {
      const n = Number(expiryDays);
      expiresAt.setDate(expiresAt.getDate() + (Number.isFinite(n) && n > 0 ? n : 30));
    }

    account.status = isInstant ? 'FUNDED' : 'ACTIVE';
    account.accountType = isInstant ? 'FUNDED' : 'CHALLENGE';
    account.currentPhase = isInstant ? 0 : 1;
    account.fundedAt = isInstant ? new Date() : null;
    account.currentBalance = challenge.fundSize;
    account.currentEquity = challenge.fundSize;
    account.phaseStartBalance = challenge.fundSize;
    account.dayStartEquity = challenge.fundSize;
    account.lowestEquityToday = challenge.fundSize;
    account.lowestEquityOverall = challenge.fundSize;
    account.highestEquity = challenge.fundSize;
    account.currentDailyDrawdownPercent = 0;
    account.currentOverallDrawdownPercent = 0;
    account.maxDailyDrawdownHit = 0;
    account.maxOverallDrawdownHit = 0;
    account.currentProfitPercent = 0;
    account.totalProfitLoss = 0;
    account.tradesToday = 0;
    account.openTradesCount = 0;
    account.totalTrades = 0;
    account.tradingDaysCount = 0;
    account.warningsCount = 0;
    account.failReason = null;
    account.failedAt = null;
    account.passedAt = null;
    account.expiresAt = expiresAt;
    // Silent reset — no violation entry visible to the user.
    // (Admin-side audit lives in saveAdminTradeEditLog / activity logs.)
    account.violations = [];
    await account.save();
    res.json({ success: true, message: 'Challenge reset', account });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE /api/prop/admin/account/:id — permanently remove an account + all
// related history. Used to clear test accounts or mistakenly-created ones
// from the admin Prop Trading dashboard. Wipes:
//   - the ChallengeAccount document itself
//   - every ChallengePosition (open & closed) on this account
//   - all related Transactions: the original challenge purchase record and
//     any payout / withdrawal records tied to this account (matched by
//     accountId code OR ObjectId reference, both stored shapes are covered)
// Does NOT touch the user's main wallet or User document — only this
// challenge's footprint disappears.
router.delete('/admin/account/:id', verifyAdminToken, async (req, res) => {
  try {
    const account = await ChallengeAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    const ChallengePosition = require('../models/ChallengePosition');
    const Transaction = require('../models/Transaction');

    const positionsDeleted = await ChallengePosition.deleteMany({ challengeAccountId: account._id });

    // Transactions can reference an account either by code (string accountId
    // like CH669388 — older payout flow) or ObjectId reference (newer
    // challengePurchaseInfo). Match both so nothing gets orphaned.
    const txFilter = {
      $or: [
        { 'paymentMethod.challengeAccountId': account.accountId },
        { 'paymentMethod.challengeAccountCode': account.accountId },
        { 'challengePurchaseInfo.challengeAccountId': account._id }
      ]
    };
    const transactionsDeleted = await Transaction.deleteMany(txFilter);

    const snapshot = {
      accountId: account.accountId,
      userId: account.userId,
      status: account.status,
      positionsDeleted: positionsDeleted.deletedCount || 0,
      transactionsDeleted: transactionsDeleted.deletedCount || 0
    };
    await ChallengeAccount.deleteOne({ _id: account._id });

    console.log(`[Admin] Deleted challenge account ${snapshot.accountId} (user ${snapshot.userId}) — ${snapshot.positionsDeleted} positions, ${snapshot.transactionsDeleted} transactions purged`);
    res.json({ success: true, message: 'Account deleted', ...snapshot });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/prop/admin/accounts/bulk-delete — remove many challenge accounts at
// once (Accounts multi-select). Same cleanup as the single delete: positions +
// linked transactions + the account doc, for every id.
router.post('/admin/accounts/bulk-delete', verifyAdminToken, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    if (ids.length === 0) return res.status(400).json({ success: false, message: 'No account ids provided' });

    const ChallengePosition = require('../models/ChallengePosition');
    const Transaction = require('../models/Transaction');
    const accounts = await ChallengeAccount.find({ _id: { $in: ids } }).select('_id accountId');
    let deleted = 0;
    for (const account of accounts) {
      await ChallengePosition.deleteMany({ challengeAccountId: account._id });
      await Transaction.deleteMany({
        $or: [
          { 'paymentMethod.challengeAccountId': account.accountId },
          { 'paymentMethod.challengeAccountCode': account.accountId },
          { 'challengePurchaseInfo.challengeAccountId': account._id }
        ]
      });
      await ChallengeAccount.deleteOne({ _id: account._id });
      deleted += 1;
    }
    console.log(`[Admin] Bulk-deleted ${deleted} challenge account(s)`);
    res.json({ success: true, deleted });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/prop/admin/dashboard - Admin dashboard stats
router.get('/admin/dashboard', verifyAdminToken, async (req, res) => {
  try {
    let accountFilter = { accountType: { $ne: 'DEMO' } };
    const statsUserIds = await getAdminUserIds(req.admin);
    if (statsUserIds) accountFilter.userId = { $in: statsUserIds };

    const challengeFilter = { isActive: true, adminId: req.admin._id };
    const totalChallenges = await Challenge.countDocuments(challengeFilter);
    const totalAccounts = await ChallengeAccount.countDocuments(accountFilter);
    const activeAccounts = await ChallengeAccount.countDocuments({ ...accountFilter, status: 'ACTIVE' });
    const passedAccounts = await ChallengeAccount.countDocuments({ ...accountFilter, status: 'PASSED' });
    const failedAccounts = await ChallengeAccount.countDocuments({ ...accountFilter, status: 'FAILED' });
    const fundedAccounts = await ChallengeAccount.countDocuments({ ...accountFilter, status: 'FUNDED' });

    const settings = await PropSettings.getSettings(req.admin._id);

    res.json({
      success: true,
      stats: {
        challengeModeEnabled: settings.challengeModeEnabled,
        totalChallenges,
        totalAccounts,
        activeAccounts,
        passedAccounts,
        failedAccounts,
        fundedAccounts
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== USER ROUTES ====================

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const propTradingEngine = require('../services/propTradingEngine');
const JWT_SECRET = process.env.JWT_SECRET || 'BharatFundedTrade-secret-key-2024';

// User auth middleware
async function verifyUserToken(req, res, next) {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(token, JWT_SECRET);
    // .lean() — this runs on every prop request; we only read fields off req.user
    // (never .save() it here), so skip the full Mongoose document hydration.
    const user = await User.findById(decoded.id).lean();
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// GET /api/prop/status - Public: check if challenge mode enabled
router.get('/status', async (req, res) => {
  try {
    // Check global settings
    let settings = await PropSettings.findOne({});
    
    // If challengeModeEnabled is explicitly true, use that
    // Otherwise, auto-enable if there are active challenges
    let isEnabled = settings?.challengeModeEnabled === true;
    if (!isEnabled) {
      const activeCount = await Challenge.countDocuments({ isActive: true });
      isEnabled = activeCount > 0;
    }
    
    res.json({
      success: true,
      enabled: isEnabled,
      displayName: settings?.displayName || 'Prop Trading Challenge',
      description: settings?.description || ''
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/prop/payment-config — Public: which purchase methods this
// deployment can actually offer. Booleans only, never any key material.
//
// Clients (especially the mobile app, which can't read server env) use this to
// decide whether to render the "Pay Online" buttons at all. Without it an app
// build would show a Razorpay/Cashfree button that dead-ends on a 503 the
// moment the user taps it. Manual UPI is always available as long as an admin
// UPI id exists, so it is reported separately.
router.get('/payment-config', async (req, res) => {
  try {
    const razorpay = require('../services/razorpay.service');
    const cashfree = require('../services/cashfree.service');
    let upiAvailable = false;
    try {
      const AdminPaymentDetail = require('../models/AdminPaymentDetail');
      upiAvailable = (await AdminPaymentDetail.countDocuments({
        type: 'upi', isActive: { $ne: false }
      })) > 0;
    } catch (_) { /* model shape differs → leave false, UI still allows UPI */ }

    res.json({
      success: true,
      razorpay: razorpay.isConfigured(),
      cashfree: cashfree.isConfigured(),
      cashfreeEnv: cashfree.isConfigured() ? cashfree.getEnv() : null,
      upi: upiAvailable
    });
  } catch (error) {
    // Never fail the purchase screen over this — report "gateways off".
    res.json({ success: true, razorpay: false, cashfree: false, cashfreeEnv: null, upi: true });
  }
});

// GET /api/prop/challenges - Public: list active challenges. The `tiers`
// array MUST be projected — without it the user sees only the legacy
// single (fundSize, challengeFee) pair and multi-tier admin pricing is
// invisible on the evaluation-plans grid.
router.get('/challenges', async (req, res) => {
  try {
    const challenges = await Challenge.find({ isActive: true })
      .select('name description stepsCount fundSize challengeFee tiers currency rules.maxDailyDrawdownPercent rules.maxOverallDrawdownPercent rules.maxLossPerTradePercent rules.profitTargetPhase1Percent rules.profitTargetPhase2Percent rules.profitTargetInstantPercent rules.maxOneDayProfitPercentOfTarget rules.consistencyRulePercent rules.minTradesRequired rules.maxTradesPerDay rules.minLotSize rules.maxLotSize rules.allowFractionalLots rules.challengeExpiryDays rules.stopLossMandatory rules.takeProfitMandatory rules.allowWeekendHolding rules.allowNewsTrading rules.maxLeverage rules.tradingDaysRequired fundedSettings.profitSplitPercent fundedSettings.withdrawalFrequencyDays sortOrder')
      .sort({ sortOrder: 1, fundSize: 1 });
    res.json({ success: true, challenges });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/prop/buy - DEPRECATED. The wallet-deduction flow has been
// replaced by the direct-UPI buy-request flow at /api/prop/buy-request.
// Kept here so any legacy client surfaces a clear migration message.
router.post('/buy', verifyUserToken, async (req, res) => {
  res.status(410).json({
    success: false,
    message: 'Wallet-based challenge purchase is no longer supported. Use POST /api/prop/buy-request with UPI payment proof.'
  });
});

// POST /api/prop/buy-request - User: submit a challenge purchase request
// with UPI payment proof. Creates a pending Transaction + ChallengeAccount
// (status PENDING). Admin reviews + approves in Bank & Fund Management →
// Challenge Buys tab to activate the account.
router.post('/buy-request', verifyUserToken, async (req, res) => {
  try {
    const {
      challengeId, tierIndex, couponCode,
      adminUpiId, transactionRef, screenshotBase64, note
    } = req.body;
    if (!challengeId) return res.status(400).json({ success: false, message: 'challengeId required' });
    if (!adminUpiId) return res.status(400).json({ success: false, message: 'adminUpiId required' });
    if (!transactionRef) return res.status(400).json({ success: false, message: 'transactionRef required' });

    const result = await propTradingEngine.requestChallengeBuy(req.user._id, {
      challengeId,
      tierIndex: Number.isInteger(tierIndex) ? tierIndex : (tierIndex != null ? Number(tierIndex) : 0),
      couponCode: couponCode ? String(couponCode).trim().toUpperCase() : null,
      paymentProof: {
        adminUpiId,
        transactionRef,
        screenshotBase64: screenshotBase64 || '',
        note: note || ''
      }
    });

    // Mark this user's purchase-intent lead as PURCHASED (best-effort) so the
    // admin follow-up list only flags people who actually dropped off.
    try {
      const PurchaseIntent = require('../models/PurchaseIntent');
      await PurchaseIntent.updateMany(
        { oderId: req.user.oderId || String(req.user._id), challengeId },
        { $set: { status: 'purchased', purchasedAt: new Date() } }
      );
    } catch (_) { /* best-effort */ }

    // Fire-and-forget admin notification email to the support inbox so the
    // team sees the new buy without polling the panel.
    try {
      const emailService = require('../services/email.service');
      const User = require('../models/User');
      const Challenge = require('../models/Challenge');
      const u = await User.findById(req.user._id).select('name email phone oderId').lean();
      const ch = await Challenge.findById(challengeId).select('name fundSize challengeFee tiers').lean();
      const tier = ch?.tiers?.[result?.tierIndex ?? 0] || {};
      const fundSize = tier.fundSize || ch?.fundSize || 0;
      const fee = result?.transaction?.amount || tier.challengeFee || ch?.challengeFee || 0;
      emailService.sendAdminNotification({
        type: 'challenge_buy',
        title: `New challenge buy from ${u?.name || u?.oderId || 'a user'}`,
        subtitle: `${ch?.name || 'Challenge'} · ₹${Number(fundSize).toLocaleString('en-IN')} account · awaiting your approval`,
        user: u,
        fields: [
          { label: 'Challenge', value: ch?.name || '(unknown)' },
          { label: 'Account Size', value: `₹${Number(fundSize).toLocaleString('en-IN')}` },
          { label: 'Fee Paid', value: `₹${Number(fee).toLocaleString('en-IN')}` },
          { label: 'UPI ID', value: adminUpiId },
          { label: 'UTR / Ref', value: transactionRef },
          result?.coupon?.applied && { label: 'Coupon', value: `${result.coupon.code} (-₹${Number(result.coupon.discountAmount || 0).toFixed(2)})` },
          note && { label: 'User Note', value: note }
        ].filter(Boolean),
        actionUrl: `${process.env.ADMIN_URL || 'https://admin.dhanfunded.com'}/admin/funds/challenge-buys`,
        actionLabel: 'Review & Approve'
      }).catch(() => {});

      // User-facing: "purchase received — approval in progress" (Email 2).
      if (u?.email) {
        emailService.sendTemplatedEmail('challenge_pending', u.email, {
          userName: u.name || u.oderId || 'Trader',
          challengeName: ch?.name || 'Challenge',
          accountSize: Number(fundSize).toLocaleString('en-IN')
        }).catch(() => {});
      }
    } catch (_) { /* notification is best-effort, never block the response */ }

    const msg = result.coupon?.applied
      ? `Payment request submitted with coupon ${result.coupon.code} (₹${Number(result.coupon.discountAmount || 0).toFixed(2)} off). Admin will approve shortly.`
      : 'Payment request submitted. Admin will approve shortly.';
    res.status(201).json({
      success: true,
      message: msg,
      accountId: result.account.accountId,
      transactionId: result.transaction._id,
      coupon: result.coupon || null
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── Razorpay (automated gateway) challenge purchase ───────────────
// Flow: create-order → (browser) Razorpay Checkout → verify (signature).
// The webhook at /api/prop/razorpay/webhook (registered in index.js with a raw
// body) is the authoritative fallback that activates even if the browser never
// calls /verify. Both paths are idempotent (approveChallengeBuy guards status).

// POST /api/prop/razorpay/create-order — server computes the fee, creates a
// PENDING account + transaction, then a Razorpay order sized to that fee.
router.post('/razorpay/create-order', verifyUserToken, async (req, res) => {
  try {
    const razorpay = require('../services/razorpay.service');
    if (!razorpay.isConfigured()) {
      return res.status(503).json({ success: false, message: 'Online payment is not available right now. Please use the manual UPI option.' });
    }
    const { challengeId, tierIndex, couponCode } = req.body;
    if (!challengeId) return res.status(400).json({ success: false, message: 'challengeId required' });

    // 1) Create the pending account + transaction (server-side fee, coupon reserved).
    const result = await propTradingEngine.requestChallengeBuy(req.user._id, {
      challengeId,
      tierIndex: Number.isInteger(tierIndex) ? tierIndex : (tierIndex != null ? Number(tierIndex) : 0),
      couponCode: couponCode ? String(couponCode).trim().toUpperCase() : null,
      paymentMethod: 'razorpay'
    });
    const tx = result.transaction;
    const fee = Number(result.fee) || 0;

    // Free (₹0 after coupon) → no gateway; activate immediately.
    if (fee <= 0) {
      await challengeApprovalService.approveChallengeBuy(tx._id, 'system:free');
      return res.json({ success: true, free: true, accountId: result.account.accountId });
    }

    // 2) Razorpay order; receipt = our tx id so the webhook can reconcile.
    const order = await razorpay.createOrder({
      amountInr: fee,
      receipt: String(tx._id),
      notes: { txId: String(tx._id), accountId: result.account.accountId, oderId: req.user.oderId || '' }
    });
    tx.paymentDetails = tx.paymentDetails || {};
    tx.paymentDetails.razorpayOrderId = order.id;
    await tx.save();

    return res.json({
      success: true,
      keyId: razorpay.getKeyId(),
      orderId: order.id,
      amount: order.amount,       // paise (already fee×100)
      currency: order.currency,
      transactionId: tx._id,
      accountId: result.account.accountId,
      coupon: result.coupon || null,
      prefill: { name: req.user.name || '', email: req.user.email || '', contact: req.user.phone || '' }
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// POST /api/prop/razorpay/verify — checkout callback. HMAC-verify the signature,
// then activate. Idempotent with the webhook.
router.post('/razorpay/verify', verifyUserToken, async (req, res) => {
  try {
    const razorpay = require('../services/razorpay.service');
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment fields' });
    }
    if (!razorpay.verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature })) {
      return res.status(400).json({ success: false, message: 'Payment signature verification failed' });
    }

    const tx = await Transaction.findOne({ type: 'challenge_purchase', 'paymentDetails.razorpayOrderId': razorpay_order_id });
    if (!tx) return res.status(404).json({ success: false, message: 'Order not found' });
    if (String(tx.oderId) !== String(req.user.oderId)) {
      return res.status(403).json({ success: false, message: 'Not your order' });
    }

    tx.paymentDetails.razorpayPaymentId = razorpay_payment_id;
    tx.paymentDetails.razorpaySignature = razorpay_signature;
    await tx.save();

    if (tx.status === 'pending') {
      await challengeApprovalService.approveChallengeBuy(tx._id, 'razorpay');
    }
    return res.json({
      success: true,
      message: 'Payment verified — your challenge account is now active.',
      accountId: tx.challengePurchaseInfo?.challengeAccountId || null
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ─── Cashfree (automated gateway) challenge purchase ───────────────
// Flow: create-order → (browser) Cashfree Checkout (payment_session_id) →
// verify (server re-fetches order status) → activate. The webhook at
// /api/prop/cashfree/webhook (registered in index.js with a raw body) is the
// authoritative fallback that activates even if the browser never calls
// /verify. Both paths are idempotent (approveChallengeBuy guards status).

// POST /api/prop/cashfree/create-order — server computes the fee, creates a
// PENDING account + transaction, then a Cashfree order sized to that fee.
router.post('/cashfree/create-order', verifyUserToken, async (req, res) => {
  try {
    const cashfree = require('../services/cashfree.service');
    if (!cashfree.isConfigured()) {
      return res.status(503).json({ success: false, message: 'Online payment is not available right now. Please use the manual UPI option.' });
    }
    const { challengeId, tierIndex, couponCode } = req.body;
    if (!challengeId) return res.status(400).json({ success: false, message: 'challengeId required' });

    // 1) Create the pending account + transaction (server-side fee, coupon reserved).
    const result = await propTradingEngine.requestChallengeBuy(req.user._id, {
      challengeId,
      tierIndex: Number.isInteger(tierIndex) ? tierIndex : (tierIndex != null ? Number(tierIndex) : 0),
      couponCode: couponCode ? String(couponCode).trim().toUpperCase() : null,
      paymentMethod: 'cashfree'
    });
    const tx = result.transaction;
    const fee = Number(result.fee) || 0;

    // Free (₹0 after coupon) → no gateway; activate immediately.
    if (fee <= 0) {
      await challengeApprovalService.approveChallengeBuy(tx._id, 'system:free');
      return res.json({ success: true, free: true, accountId: result.account.accountId });
    }

    // 2) Cashfree order; order_id = CF_<tx id> so the webhook/verify can reconcile.
    const cfOrderId = `CF_${tx._id}`;
    const apiOrigin = process.env.API_URL || 'https://api.dhanfunded.com';
    const frontendOrigin = process.env.FRONTEND_URL || 'https://dhanfunded.com';
    const order = await cashfree.createOrder({
      amountInr: fee,
      orderId: cfOrderId,
      customer: {
        id: req.user.oderId || String(req.user._id),
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone
      },
      returnUrl: `${frontendOrigin}/app/my-challenges?cf_order={order_id}`,
      notifyUrl: `${apiOrigin}/api/prop/cashfree/webhook`,
      notes: { txId: String(tx._id), accountId: result.account.accountId }
    });

    tx.paymentDetails = tx.paymentDetails || {};
    tx.paymentDetails.cashfreeOrderId = cfOrderId;
    await tx.save();

    return res.json({
      success: true,
      paymentSessionId: order.payment_session_id,
      cfOrderId,
      env: cashfree.getEnv(),
      amount: fee,
      transactionId: tx._id,
      accountId: result.account.accountId,
      coupon: result.coupon || null
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// POST /api/prop/cashfree/verify — checkout callback. Re-fetch the order from
// Cashfree (server-authoritative) and activate only when order_status === PAID.
router.post('/cashfree/verify', verifyUserToken, async (req, res) => {
  try {
    const cashfree = require('../services/cashfree.service');
    const { cfOrderId } = req.body;
    if (!cfOrderId) return res.status(400).json({ success: false, message: 'cfOrderId required' });

    const tx = await Transaction.findOne({ type: 'challenge_purchase', 'paymentDetails.cashfreeOrderId': cfOrderId });
    if (!tx) return res.status(404).json({ success: false, message: 'Order not found' });
    if (String(tx.oderId) !== String(req.user.oderId)) {
      return res.status(403).json({ success: false, message: 'Not your order' });
    }

    const order = await cashfree.getOrder(cfOrderId);
    if (order.order_status !== 'PAID') {
      return res.status(400).json({ success: false, status: order.order_status, message: 'Payment not completed yet. If money was debited it activates automatically within a minute.' });
    }

    if (tx.status === 'pending') {
      await challengeApprovalService.approveChallengeBuy(tx._id, 'cashfree');
    }
    return res.json({
      success: true,
      message: 'Payment verified — your challenge account is now active.',
      accountId: tx.challengePurchaseInfo?.challengeAccountId || null
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ─── Demo account (free practice) ──────────────────────────────────
// Every user can spin up a single demo account from their home page.
// Demo accounts use accountType='DEMO' on ChallengeAccount and skip
// every funded/challenge gate (DD breach, expiry, profit target, etc.)
// — see propTradingEngine for the bypass logic.
const demoService = require('../services/demo.service');
const DemoSettings = require('../models/DemoSettings');

// GET /api/prop/demo — get-or-create the user's demo account
router.get('/demo', verifyUserToken, async (req, res) => {
  try {
    const demo = await demoService.getOrCreateDemo(req.user._id);
    const settings = await DemoSettings.getSettings();
    res.json({
      success: true,
      demo,
      settings: {
        enabled: settings.enabled,
        fundSize: settings.fundSize,
        leverage: settings.leverage,
        resetCooldownHours: settings.resetCooldownHours,
        notes: settings.notes
      }
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// POST /api/prop/demo/reset — reset balance to initial fund (cooldown applies)
router.post('/demo/reset', verifyUserToken, async (req, res) => {
  try {
    const demo = await demoService.resetDemo(req.user._id);
    res.json({ success: true, demo });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// GET /api/prop/admin/demo-settings — admin reads current settings
router.get('/admin/demo-settings', verifyAdminToken, async (req, res) => {
  try {
    const settings = await DemoSettings.getSettings();
    res.json({ success: true, settings });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/prop/admin/demo-settings — admin updates settings
router.put('/admin/demo-settings', verifyAdminToken, async (req, res) => {
  try {
    const settings = await DemoSettings.getSettings();
    const allowed = ['enabled', 'fundSize', 'leverage', 'resetCooldownHours', 'allowedSegments', 'notes'];
    for (const k of allowed) {
      if (req.body[k] !== undefined) settings[k] = req.body[k];
    }
    await settings.save();
    res.json({ success: true, settings });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// GET /api/prop/my-accounts - User: list user's challenge accounts
router.get('/my-accounts', verifyUserToken, async (req, res) => {
  try {
    // DEMO is deliberately excluded: it is a free practice sandbox, not a
    // purchased account, and it would otherwise show up as an "active
    // challenge" on the dashboard, in My Challenges and in billing history.
    // Its own card fetches it from /api/prop/demo.
    const accounts = await ChallengeAccount.find({ userId: req.user._id, accountType: { $ne: 'DEMO' } })
      .populate('challengeId', 'name fundSize stepsCount challengeFee fundedSettings rules.maxDailyDrawdownPercent rules.maxOverallDrawdownPercent rules.profitTargetPhase1Percent rules.profitTargetPhase2Percent rules.profitTargetInstantPercent rules.maxOneDayProfitPercentOfTarget rules.challengeExpiryDays rules.minLotSize rules.maxLotSize rules.allowFractionalLots')
      .sort({ createdAt: -1 })
      .lean();

    // Attach live position summary so the card can show real-time values
    // computed from actual position data instead of stale stored balances.
    const ids = accounts.map(a => a._id);
    const [openPositions, closedPositions] = await Promise.all([
      ChallengePosition.find({ challengeAccountId: { $in: ids }, status: 'open' }).lean(),
      ChallengePosition.find({ challengeAccountId: { $in: ids }, status: 'closed' }).lean()
    ]);

    // Per-account cycle cutoff: realised P&L only counts trades closed AFTER the
    // current cycle started. The cycle restarts on a phase advance
    // (phaseStartedAt) AND on a payout approval (lastWithdrawalDate, which resets
    // the wallet to initial). Without this, a funded account that already paid
    // out kept showing the OLD profit/balance (e.g. ₹54L instead of the reset
    // ₹50L) because every historical closed trade was still summed in.
    const cutoffByAccount = {};
    for (const a of accounts) {
      const ps = a.phaseStartedAt ? new Date(a.phaseStartedAt).getTime() : 0;
      const lw = a.lastWithdrawalDate ? new Date(a.lastWithdrawalDate).getTime() : 0;
      cutoffByAccount[String(a._id)] = Math.max(ps, lw);
    }

    const byAccount = {};
    const mkLive = () => ({ positions: [], floatingPnl: 0, openCount: 0, closedPnl: 0, dailyClosed: {} });
    for (const pos of openPositions) {
      const key = String(pos.challengeAccountId);
      if (!byAccount[key]) byAccount[key] = mkLive();
      byAccount[key].positions.push(pos);
      byAccount[key].floatingPnl += Number(pos.profit) || 0;
      byAccount[key].openCount += 1;
    }
    for (const pos of closedPositions) {
      const key = String(pos.challengeAccountId);
      // Skip trades closed before this account's current cycle (pre-payout /
      // pre-phase-advance) so they don't inflate the reset balance.
      const cutoff = cutoffByAccount[key] || 0;
      if (cutoff && pos.closeTime && new Date(pos.closeTime).getTime() < cutoff) continue;
      if (!byAccount[key]) byAccount[key] = mkLive();
      byAccount[key].closedPnl += Number(pos.profit) || 0;
      // Per-IST-day realised P&L — same bucketing the Objectives panel uses, so
      // the card's capped Target Progress matches it exactly (no dailyPnlMap drift).
      if (pos.closeTime) {
        const d = istDayKey(pos.closeTime);
        byAccount[key].dailyClosed[d] = (byAccount[key].dailyClosed[d] || 0) + (Number(pos.profit) || 0);
      }
    }

    const enriched = accounts.map(a => {
      const live = byAccount[String(a._id)] || mkLive();
      const initialBalance = Number(a.initialBalance || 0);
      const realisedPnl = live.closedPnl;
      const totalPnl = realisedPnl + live.floatingPnl;
      const computedBalance = initialBalance + realisedPnl;
      const liveEquity = computedBalance + live.floatingPnl;

      // ── Capped profit toward target (one-day-profit cap applied per day),
      // matching the Objectives panel + pass engine. The stored
      // currentProfitPercent is UNCAPPED and can be stale, so the card's
      // Target Progress bar must use THIS — otherwise a single big day shows
      // the bar "100% achieved" when only the capped slice actually counts.
      const ch = a.challengeId || {};
      const r = ch.rules || {};
      const phaseStartBalance = Number(a.phaseStartBalance) || initialBalance;
      const tPct = ch.stepsCount === 0
        ? Number(r.profitTargetInstantPercent || 0)
        : a.currentPhase === 1
          ? Number(r.profitTargetPhase1Percent || 0)
          : Number(r.profitTargetPhase2Percent || 0);
      const capPct = Number(r.maxOneDayProfitPercentOfTarget) || 0;
      // Capped profit toward target — computed from CLOSED positions bucketed by
      // IST day (+ today's floating bundled into today's bucket), IDENTICAL to
      // the Objectives panel, so the card's Target Progress always matches it.
      // (Stored currentProfitPercent / dailyPnlMap can drift; positions are the
      // authoritative source.)
      const dailyClosed = { ...(live.dailyClosed || {}) };
      const todayK = istDayKey();
      dailyClosed[todayK] = (dailyClosed[todayK] || 0) + live.floatingPnl;
      let cappedProfit = realisedPnl + live.floatingPnl; // default = uncapped total
      if (tPct > 0 && phaseStartBalance > 0) {
        const maxDayAbs = capPct > 0
          ? (capPct / 100) * (tPct / 100) * phaseStartBalance
          : Infinity; // no cap rule → uncapped, but still computed FRESH (not stale)
        cappedProfit = 0;
        for (const k of Object.keys(dailyClosed)) {
          const pnl = Number(dailyClosed[k]) || 0;
          cappedProfit += pnl > 0 ? Math.min(pnl, maxDayAbs) : pnl;
        }
      }
      const cappedProfitPercent = phaseStartBalance > 0 ? (cappedProfit / phaseStartBalance) * 100 : 0;

      // ── DD bars (match the Objectives panel exactly):
      //  Daily   = max(0, −today's P&L)  — TODAY's (IST) realised + floating P&L
      //            from positions, NOT the stale/re-anchorable dayStartBalance.
      //            Resets every IST day; 0 when today is flat/in-profit.
      //  Overall = max(0, initial − liveEquity).
      const todaysClosed = Number((live.dailyClosed || {})[istDayKey()] || 0); // realised today (IST)
      const todaysNet = todaysClosed + Number(live.floatingPnl || 0);
      const dailyDDPercent = initialBalance > 0 ? (Math.max(0, -todaysNet) / initialBalance) * 100 : 0;
      const overallDDPercent = initialBalance > 0 ? (Math.max(0, initialBalance - liveEquity) / initialBalance) * 100 : 0;

      return {
        ...a,
        walletBalance: computedBalance,
        currentBalance: computedBalance,
        openPositions: live.positions,
        openCount: live.openCount,
        floatingPnl: live.floatingPnl,
        liveEquity,
        realisedPnl,
        totalPnl,
        // Fresh DD % for the card's Daily DD / Overall DD bars (matches the
        // Objectives panel — 0 when in profit). Frontend uses these, not the
        // stored watermark fields.
        dailyDDPercent,
        overallDDPercent,
        // Authoritative capped profit % for the Target Progress bar (matches
        // Objectives panel / pass engine). Frontend uses this, not the stored
        // currentProfitPercent.
        cappedProfitPercent,
        cappedProfitAmount: Number(cappedProfit.toFixed(2)),
        targetPercent: tPct
      };
    });

    res.json({ success: true, accounts: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/prop/my-positions - ALL positions for this user across every
// challenge account, normalised into trade-history shape so OrdersPage
// can render them alongside main-wallet trades with an Account column.
router.get('/my-positions', verifyUserToken, async (req, res) => {
  try {
    const accounts = await ChallengeAccount.find({ userId: req.user._id })
      .select('_id accountId challengeId accountType')
      .populate('challengeId', 'name')
      .lean();
    const accMap = {};
    for (const a of accounts) {
      accMap[String(a._id)] = {
        accountId: a.accountId,
        challengeName: a.challengeId?.name || (a.accountType === 'DEMO' ? 'Demo' : 'Challenge')
      };
    }
    const ids = accounts.map(a => a._id);
    if (ids.length === 0) return res.json({ success: true, open: [], closed: [] });

    const [open, pending, closed] = await Promise.all([
      ChallengePosition.find({ challengeAccountId: { $in: ids }, status: 'open' })
        .sort({ openTime: -1 }).lean(),
      ChallengePosition.find({ challengeAccountId: { $in: ids }, status: 'pending' })
        .sort({ createdAt: -1 }).lean(),
      ChallengePosition.find({ challengeAccountId: { $in: ids }, status: 'closed' })
        .sort({ closeTime: -1 }).limit(200).lean()
    ]);

    const annotate = (p) => {
      const meta = accMap[String(p.challengeAccountId)] || {};
      return {
        ...p,
        accountContext: 'challenge',
        challengeAccountId: String(p.challengeAccountId),
        challengeAccountCode: meta.accountId,
        challengeName: meta.challengeName
      };
    };

    res.json({ success: true, open: open.map(annotate), pending: pending.map(annotate), closed: closed.map(annotate) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/prop/accounts/:id/positions - list open + recent closed positions
router.get('/accounts/:id/positions', verifyUserToken, async (req, res) => {
  try {
    const account = await ChallengeAccount.findOne({ _id: req.params.id, userId: req.user._id });
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    const [open, closed] = await Promise.all([
      ChallengePosition.find({ challengeAccountId: account._id, status: 'open' }).sort({ openTime: -1 }).lean(),
      ChallengePosition.find({ challengeAccountId: account._id, status: 'closed' }).sort({ closeTime: -1 }).limit(50).lean()
    ]);

    res.json({ success: true, open, closed });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/prop/account/:id/insights - rich analytics payload for the
// detail dashboard: equity curve (reconstructed from realised closed-
// position PnL), per-day breakdown for the calendar/summary, open +
// closed positions, and performance metrics (win rate, profit factor,
// expectancy, avg RRR, Sharpe, avg duration).
//
// All series are derived from existing ChallengePosition + ChallengeAccount
// data — no new schema fields, no background job. The client polls every
// 10–15s so numbers stay fresh as trades open/close.
router.get('/account/:id/insights', verifyUserToken, async (req, res) => {
  try {
    const account = await ChallengeAccount.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('challengeId');
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    const challenge = account.challengeId || {};
    const rules = challenge.rules || {};

    // ── Phase boundary: only show closed trades from the CURRENT phase in
    // the Trading Journal. Without this, a user who passed phase 1 would
    // still see all of phase 1's trades mixed into the phase-2 calendar.
    //
    // Self-heal for legacy accounts that advanced to phase 2+ before this
    // field existed: derive the boundary from the trade where cumulative
    // equity first reached `phaseStartBalance` (which was set to equity
    // at the moment of phase advance), and persist it.
    let phaseStartedAt = account.phaseStartedAt;
    if (!phaseStartedAt && Number(account.currentPhase) > 1) {
      const allClosed = await ChallengePosition.find({
        challengeAccountId: account._id,
        status: 'closed'
      }).sort({ closeTime: 1 }).lean();

      const initBal = Number(account.initialBalance) || 0;
      const target = Number(account.phaseStartBalance) || initBal;

      // Strategy 1: first trade whose closing running balance >= target.
      let running = initBal;
      const EPS = 1.0;
      for (const p of allClosed) {
        running += Number(p.profit) || 0;
        if (running >= target - EPS) {
          phaseStartedAt = p.closeTime;
          break;
        }
      }

      // Strategy 2: peak running balance — used when the user had open
      // positions at phase advance (their floating PnL is part of
      // phaseStartBalance but crystallises into `profit` later) or took
      // a phase-2 loss, so cumulative never quite reaches the target.
      if (!phaseStartedAt) {
        let peak = initBal;
        let peakTime = null;
        running = initBal;
        for (const p of allClosed) {
          running += Number(p.profit) || 0;
          if (running > peak) {
            peak = running;
            peakTime = p.closeTime;
          }
        }
        // Only trust peak if it's within 5% of target — guards against
        // accidentally backfilling accounts that barely traded.
        if (peakTime && peak >= target * 0.95) {
          phaseStartedAt = peakTime;
        }
      }

      if (phaseStartedAt) {
        account.phaseStartedAt = phaseStartedAt;
        await account.save();
      }
    }
    // Phase 1 / instant accounts that pre-date this field: fall back to
    // the account creation date so nothing is filtered out.
    if (!phaseStartedAt) phaseStartedAt = account.createdAt;

    // A payout approval resets the wallet to initial and starts a fresh cycle,
    // so the current cycle begins at the LATER of phaseStartedAt and the last
    // withdrawal — otherwise a funded account that paid out keeps showing its
    // pre-payout profit on the objectives panel.
    let cycleStart = phaseStartedAt;
    if (account.lastWithdrawalDate) {
      const lw = new Date(account.lastWithdrawalDate);
      if (!cycleStart || lw > new Date(cycleStart)) cycleStart = lw;
    }

    const closedQuery = { challengeAccountId: account._id, status: 'closed' };
    if (cycleStart) closedQuery.closeTime = { $gte: cycleStart };

    const [openRaw, closedRaw] = await Promise.all([
      // Open positions are always shown — they represent live risk regardless
      // of which phase they were opened in.
      ChallengePosition.find({ challengeAccountId: account._id, status: 'open' })
        .sort({ openTime: -1 })
        .lean(),
      ChallengePosition.find(closedQuery)
        .sort({ closeTime: 1 }) // ascending for equity-curve accumulation
        .lean()
    ]);

    const initialBalance = Number(account.initialBalance) || 0;
    // Balance computed FRESH = phase-start balance + realised P&L of this
    // phase's closed trades — NOT the stored walletBalance, which can drift
    // out of sync with the actual position P&L (it showed ₹1,390 less than the
    // real closed-trade sum), making the dashboard disagree with the My
    // Challenges card + Daily Summary. Deriving from positions guarantees match.
    const phaseStartBal = Number(account.phaseStartBalance) || initialBalance;
    const currentBalance = phaseStartBal + closedRaw.reduce((sum, p) => sum + (Number(p.profit) || 0), 0);
    // Equity = balance + open-position floating PnL (matches the card view).
    const unrealizedPnl = Number(
      openRaw.reduce((sum, p) => sum + (Number(p.profit) || 0), 0)
    );
    const currentEquity = currentBalance + unrealizedPnl;

    // ── Equity curve: start at the current phase's starting balance
    // (= initialBalance for phase 1, = equity-at-phase-advance for phase 2+),
    // apply each closed position's realised PnL in order. Final point ==
    // currentBalance (sanity check).
    const phaseStartBalance = Number(account.phaseStartBalance) || initialBalance;
    const equityCurve = [
      { t: phaseStartedAt || account.createdAt || new Date(), equity: phaseStartBalance }
    ];
    let running = phaseStartBalance;
    for (const p of closedRaw) {
      running += Number(p.profit) || 0;
      equityCurve.push({
        t: p.closeTime || p.updatedAt || new Date(),
        equity: Number(running.toFixed(2))
      });
    }
    // Tail point: live equity (balance + floating). Only add if distinct
    // from the last anchor so we don't stutter the line.
    if (equityCurve[equityCurve.length - 1].equity !== currentEquity) {
      equityCurve.push({ t: new Date(), equity: Number(currentEquity.toFixed(2)) });
    }

    // ── Daily breakdown: group closed positions by IST close-date so the
    // calendar + Min-Trading-Days count match the engine (which buckets in
    // IST via dailyPnlMap / uniqueTradingDays). Previously bucketed in UTC.
    const dailyMap = new Map();
    for (const p of closedRaw) {
      if (!p.closeTime) continue;
      const key = istDayKey(p.closeTime);
      if (!dailyMap.has(key)) {
        dailyMap.set(key, { date: key, pnl: 0, trades: 0, wins: 0, losses: 0, volume: 0 });
      }
      const d = dailyMap.get(key);
      const profit = Number(p.profit) || 0;
      d.pnl += profit;
      d.trades += 1;
      if (profit > 0) d.wins += 1;
      else if (profit < 0) d.losses += 1;
      d.volume += Number(p.volume) || 0;
    }
    const dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // ── Today's PnL: today's closed-position realised PnL + current
    // floating PnL. "Today" is the IST trading day (matches the engine).
    const todayKey = istDayKey();
    const todaysClosedPnl = dailyMap.get(todayKey)?.pnl || 0;
    const todaysPnl = todaysClosedPnl + unrealizedPnl;

    // ── Performance metrics. Only closed positions feed these (open
    // positions have floating, not realised, results).
    const totalClosed = closedRaw.length;
    const wins = closedRaw.filter(p => (p.profit || 0) > 0);
    const losses = closedRaw.filter(p => (p.profit || 0) < 0);
    const grossProfit = wins.reduce((s, p) => s + (p.profit || 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, p) => s + (p.profit || 0), 0));
    const avgWin = wins.length ? grossProfit / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    const winRate = totalClosed ? (wins.length / totalClosed) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
    const expectancy = totalClosed
      ? (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss
      : 0;

    // Average trade duration (seconds) over closed positions.
    let avgDurationSec = 0;
    if (totalClosed > 0) {
      let totalMs = 0;
      let counted = 0;
      for (const p of closedRaw) {
        if (p.openTime && p.closeTime) {
          totalMs += new Date(p.closeTime) - new Date(p.openTime);
          counted += 1;
        }
      }
      avgDurationSec = counted > 0 ? Math.round(totalMs / counted / 1000) : 0;
    }

    // Average RRR: for positions that had both SL + TP set at open, the
    // nominal R:R is |TP-entry| / |entry-SL|. Positions without both are
    // skipped so the metric isn't skewed by empty fields.
    let avgRRR = 0;
    {
      const rrrs = [];
      for (const p of closedRaw) {
        const entry = Number(p.entryPrice);
        const sl = Number(p.stopLoss);
        const tp = Number(p.takeProfit);
        if (entry > 0 && sl > 0 && tp > 0) {
          const risk = Math.abs(entry - sl);
          const reward = Math.abs(tp - entry);
          if (risk > 0) rrrs.push(reward / risk);
        }
      }
      if (rrrs.length) avgRRR = rrrs.reduce((s, x) => s + x, 0) / rrrs.length;
    }

    // Annualised Sharpe ratio from daily returns vs initial balance.
    // Needs ≥ 2 distinct trading days to be meaningful.
    let sharpe = 0;
    if (dailyBreakdown.length >= 2 && initialBalance > 0) {
      const dailyReturns = dailyBreakdown.map(d => d.pnl / initialBalance);
      const mean = dailyReturns.reduce((s, x) => s + x, 0) / dailyReturns.length;
      const variance =
        dailyReturns.reduce((s, x) => s + (x - mean) ** 2, 0) / dailyReturns.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev > 0) sharpe = (mean / stdDev) * Math.sqrt(252);
    }

    // ── Consistency score: the biggest single-day profit shouldn't
    // dominate total profit. Score = 100 × (1 − bestDay/totalProfit),
    // clamped to [0, 100]. Only defined if totalProfit > 0.
    let consistencyScore = null;
    let consistencyDaysTraded = dailyBreakdown.length;
    {
      const totalProfit = dailyBreakdown.reduce((s, d) => s + Math.max(0, d.pnl), 0);
      if (totalProfit > 0) {
        const best = dailyBreakdown.reduce((m, d) => Math.max(m, d.pnl), 0);
        const ratio = best / totalProfit;
        consistencyScore = Math.max(0, Math.min(100, Math.round((1 - ratio) * 100)));
      }
    }

    // ── Objectives table: the public, per-challenge gates a user must
    // clear to pass / avoid failing. Each entry is self-describing so the
    // UI can render it directly.
    const dailyMax = Number(rules.maxDailyDrawdownPercent || 5);
    const overallMax = Number(rules.maxOverallDrawdownPercent || 10);
    const tradingDaysRequired = Number(rules.tradingDaysRequired || 0);
    const targetPercent = challenge.stepsCount === 0
      ? Number(rules.profitTargetInstantPercent || 0)
      : account.currentPhase === 1
        ? Number(rules.profitTargetPhase1Percent || 8)
        : Number(rules.profitTargetPhase2Percent || 5);
    // DD shown on the Objectives panel must align with the Daily DD bar on
    // My Challenges page (engine view) — both should anchor on the SAME
    // start-of-day reference. Engine uses account.dayStartBalance (set by
    // 00:05 IST cron + reactivate); we mirror that here.
    //
    // Why dayStartBalance and not todaysPnl from dailyPnlMap:
    //   - After reactivate, dayStartBalance is reset to current balance →
    //     post-reactivate trades are what count for "today's loss" (matches
    //     engine view that also reads 0% right after reactivate).
    //   - dailyPnlMap still holds pre-reactivate closed trades, so reading
    //     from it would show a phantom loss even though the user is
    //     starting fresh from the engine's perspective.
    //   - On a normal trading day (no reactivate), dayStartBalance is set
    //     at 00:05 IST and the math is identical to the dailyPnlMap-based
    //     calc.
    const equityForDD = Number(currentEquity);
    // Daily loss = max(0, −today's P&L). Computed from TODAY's (IST) realised +
    // floating P&L directly (positions), NOT the stored dayStartBalance — that
    // field can be stale or re-anchored mid-day (e.g. by a balance resync) and
    // then wrongly reads ₹0 on a real loss day. Resets every IST day and matches
    // the Daily Summary the user sees.
    const todaysNetPnl = Number(todaysClosedPnl || 0) + Number(unrealizedPnl || 0);
    const dailyLossAmount = Math.max(0, -todaysNetPnl);
    const overallLossAmount = Math.max(0, initialBalance - equityForDD);
    const dailyUsed = initialBalance > 0 ? (dailyLossAmount / initialBalance) * 100 : 0;
    const overallUsed = initialBalance > 0 ? (overallLossAmount / initialBalance) * 100 : 0;

    // Profit-% for the CURRENT phase. We derive it from the filtered
    // closedRaw + open positions rather than the stored
    // account.currentProfitPercent because that stored field is only
    // updated on trade-close-equity-refresh. For legacy phase-2 accounts
    // backfilled via phaseStartedAt, the stored value can be stale (still
    // 0 from the phase advance reset). Deriving it here keeps the
    // Objectives panel consistent with the Trading Journal calendar.
    const phaseStartBalForProfit = Number(account.phaseStartBalance) || initialBalance;
    const realisedInPhase = closedRaw.reduce((s, p) => s + (Number(p.profit) || 0), 0);
    const floatingInPhase = openRaw.reduce((s, p) => s + (Number(p.profit) || 0), 0);
    // Apply Max 1-Day Profit cap per rules spec: positive days capped at
    // (cap% × target% × phaseStartBalance), negative days fully counted,
    // today's floating treated as part of today's tally. The capped sum is
    // what counts toward the Profit Target; the raw total still shows in
    // BALANCE / Today's PnL so the user sees their actual P&L.
    const capPercentForTarget = Number(rules.maxOneDayProfitPercentOfTarget) || 0;
    const targetPctForCap = challenge.stepsCount === 0
      ? Number(rules.profitTargetInstantPercent || 0)
      : account.currentPhase === 1
        ? Number(rules.profitTargetPhase1Percent || 8)
        : Number(rules.profitTargetPhase2Percent || 5);
    let validProfitForTarget = realisedInPhase + floatingInPhase;
    let ignoredProfitForTarget = 0;
    if (capPercentForTarget > 0 && targetPctForCap > 0 && phaseStartBalForProfit > 0) {
      const maxDayAbs = (capPercentForTarget / 100) * (targetPctForCap / 100) * phaseStartBalForProfit;
      const dailyAgg = new Map();
      for (const p of closedRaw) {
        const day = p.closeTime ? istDayKey(p.closeTime) : null;
        if (!day) continue;
        dailyAgg.set(day, (dailyAgg.get(day) || 0) + (Number(p.profit) || 0));
      }
      // Bundle today's floating into today's bucket so the cap still bites
      // on intraday unrealised P&L. IST day to match the engine's dailyPnlMap.
      const todayKey = istDayKey();
      dailyAgg.set(todayKey, (dailyAgg.get(todayKey) || 0) + floatingInPhase);
      validProfitForTarget = 0;
      for (const [, pnl] of dailyAgg) {
        if (pnl > 0) {
          validProfitForTarget += Math.min(pnl, maxDayAbs);
          ignoredProfitForTarget += Math.max(0, pnl - maxDayAbs);
        } else {
          validProfitForTarget += pnl;
        }
      }
    }
    const profitPercent = phaseStartBalForProfit > 0
      ? Number(((validProfitForTarget / phaseStartBalForProfit) * 100).toFixed(2))
      : 0;

    const pctAmount = (pct) => Number(((pct / 100) * initialBalance).toFixed(2));

    // Compute actual unique trading days from real position data (open + closed)
    // instead of the stored uniqueTradingDays array which can get out of sync.
    const allPositions = [...openRaw, ...closedRaw];
    const tradingDaySet = new Set();
    for (const p of allPositions) {
      const t = p.openTime || p.createdAt;
      if (t) tradingDaySet.add(istDayKey(t));
    }
    const actualTradingDays = tradingDaySet.size;

    // Helper: each "do not violate" objective uses 3 states:
    //   'failed'  — the rule has been breached (red ✕).
    //   'pending' — the user hasn't traded enough yet to meaningfully
    //               evaluate the rule (grey dash). Specifically, we hide
    //               the "passed" tick until the user has completed at
    //               least one trading day in the current phase. Without
    //               this, a brand-new phase shows ✓ on every do-not-
    //               violate rule which misleads the trader into thinking
    //               they've already cleared something.
    //   'passed'  — actively passing (green ✓).
    // `passed` boolean is kept for backwards compatibility.
    const phaseHasActivity = consistencyDaysTraded > 0 || closedRaw.length > 0;
    const dnvStatus = (isPassing) => {
      if (!isPassing) return 'failed';
      return phaseHasActivity ? 'passed' : 'pending';
    };

    const objectives = [];
    if (tradingDaysRequired > 0) {
      const passed = consistencyDaysTraded >= tradingDaysRequired;
      // Trading-days is a "must-achieve" goal — when not yet met, show
      // failed (red ✕) rather than pending, because the user's intent
      // is clearly an active requirement to complete.
      objectives.push({
        key: 'trading-days',
        label: `Minimum ${tradingDaysRequired} Trading Day${tradingDaysRequired === 1 ? '' : 's'}`,
        target: tradingDaysRequired,
        actual: consistencyDaysTraded,
        unit: 'days',
        passed,
        status: passed ? 'passed' : 'failed'
      });
    }
    {
      const isPassing = dailyUsed < dailyMax;
      objectives.push({
        key: 'max-daily-loss',
        label: `Max Daily Loss −₹${pctAmount(dailyMax).toLocaleString('en-IN')}`,
        target: dailyMax,
        actual: dailyUsed,
        // Authoritative ₹ amount — frontend uses this directly to display
        // "−₹X (Y% of limit)" without round-tripping via initialBalance.
        actualAmount: dailyLossAmount,
        limitAmount: (initialBalance * dailyMax) / 100,
        unit: '%',
        passed: isPassing,
        status: dnvStatus(isPassing)
      });
    }
    {
      const isPassing = overallUsed < overallMax;
      objectives.push({
        key: 'max-loss',
        label: `Max Loss −₹${pctAmount(overallMax).toLocaleString('en-IN')}`,
        target: overallMax,
        actual: overallUsed,
        actualAmount: overallLossAmount,
        limitAmount: (initialBalance * overallMax) / 100,
        unit: '%',
        passed: isPassing,
        status: dnvStatus(isPassing)
      });
    }
    if (account.accountType !== 'FUNDED' && targetPercent > 0) {
      const passed = profitPercent >= targetPercent;
      // Profit-target is a "must-achieve" goal — show red ✕ until met,
      // matching the existing 1-step UX users are familiar with.
      // Use the CAPPED profit (1-day rule applied) as the headline ₹ amount
      // because that's what counts toward passing — matches profitPercent.
      // Raw P&L still shows on the BALANCE / Today's PnL cards so the user's
      // actual money is never hidden.
      const cappedSignedAmount = Number(validProfitForTarget.toFixed(2));
      objectives.push({
        key: 'profit-target',
        label: `Profit Target ₹${pctAmount(targetPercent).toLocaleString('en-IN')}`,
        target: targetPercent,
        actual: profitPercent,
        actualAmount: cappedSignedAmount,
        limitAmount: (initialBalance * targetPercent) / 100,
        ignoredAmount: Number(ignoredProfitForTarget.toFixed(2)),
        unit: '%',
        passed,
        status: passed ? 'passed' : 'failed'
      });
    }

    // Max one-day profit objective — RESETS DAILY. Shows TODAY's (IST) realised
    // profit vs the per-day cap, NOT the all-time best day. Yesterday's big day
    // no longer keeps this red: the cross-day cap is already enforced by the
    // Profit Target (which counts only up to the cap per day and "ignores" the
    // excess), so this meter is the live "today within cap?" check and starts
    // at ₹0 every new trading day (just like Max Daily Loss).
    const maxOneDayCap = Number(rules.maxOneDayProfitPercentOfTarget || 0);
    if (maxOneDayCap > 0 && targetPercent > 0) {
      const maxDayProfitAbs = (maxOneDayCap / 100) * (targetPercent / 100) * initialBalance;
      const todayProfit = Math.max(0, Number(todaysClosedPnl) || 0);
      const isPassing = todayProfit <= maxDayProfitAbs;
      objectives.push({
        key: 'max-one-day-profit',
        label: `Max One-Day Profit ₹${maxDayProfitAbs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        target: maxOneDayCap,
        actual: maxDayProfitAbs > 0 ? Number(((todayProfit / maxDayProfitAbs) * 100).toFixed(1)) : 0,
        // Authoritative ₹ amounts — TODAY's profit vs the daily cap (resets daily).
        actualAmount: todayProfit,
        limitAmount: maxDayProfitAbs,
        unit: '% used',
        // ≤ cap (incl. ₹0 fresh day) → green ✓, like Max Daily Loss 0%. Over → red.
        passed: isPassing,
        status: todayProfit > maxDayProfitAbs ? 'failed' : 'passed'
      });
    }

    // Consistency rule objective removed from user-facing Objectives panel
    // per product request — engine still enforces it via challengePropEngine
    // / propTradingEngine internals, but it is no longer surfaced here.

    res.json({
      success: true,
      overview: {
        balance: Number(currentBalance.toFixed(2)),
        equity: Number(currentEquity.toFixed(2)),
        unrealizedPnl: Number(unrealizedPnl.toFixed(2)),
        todaysPnl: Number(todaysPnl.toFixed(2)),
        initialBalance: Number(initialBalance.toFixed(2)),
        totalPnl: Number((currentEquity - initialBalance).toFixed(2)),
        totalPnlPercent: initialBalance > 0
          ? Number((((currentEquity - initialBalance) / initialBalance) * 100).toFixed(2))
          : 0
      },
      objectives,
      stats: {
        winRate: Number(winRate.toFixed(2)),
        avgProfit: Number(avgWin.toFixed(2)),
        avgLoss: Number(avgLoss.toFixed(2)),
        numTrades: totalClosed,
        avgDurationSec,
        sharpe: Number(sharpe.toFixed(2)),
        avgRRR: Number(avgRRR.toFixed(2)),
        profitFactor: Number.isFinite(profitFactor) ? Number(profitFactor.toFixed(2)) : 999,
        expectancy: Number(expectancy.toFixed(2))
      },
      consistency: {
        score: consistencyScore,
        daysTraded: consistencyDaysTraded
      },
      equityCurve,
      dailyBreakdown,
      openTrades: openRaw,
      closedTrades: closedRaw.slice(-100).reverse(), // latest 100, newest first
      meta: {
        challengeName: challenge.name || 'Challenge',
        fundSize: Number(challenge.fundSize) || initialBalance,
        stepsCount: challenge.stepsCount || account.totalPhases || 2,
        currency: challenge.currency || 'INR',
        status: account.status,
        phase: account.currentPhase,
        totalPhases: account.totalPhases,
        createdAt: account.createdAt,
        expiresAt: account.expiresAt
      }
    });
  } catch (error) {
    console.error('[/account/:id/insights] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/prop/positions/:positionId/sltp - modify SL/TP on an open
// challenge position. Pass `stopLoss` and/or `takeProfit` in the body;
// set to null/0 to clear. Values are stored as-is and evaluated on the
// next tick by challengePropEngine.refreshEquity().
router.put('/positions/:positionId/sltp', verifyUserToken, async (req, res) => {
  try {
    const { stopLoss, takeProfit } = req.body;
    const normalise = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n;
    };
    const hasSL = Object.prototype.hasOwnProperty.call(req.body, 'stopLoss');
    const hasTP = Object.prototype.hasOwnProperty.call(req.body, 'takeProfit');
    if (!hasSL && !hasTP) {
      return res.status(400).json({ success: false, message: 'Provide stopLoss and/or takeProfit' });
    }

    const position = await ChallengePosition.findOne({
      positionId: req.params.positionId,
      userId: req.user._id,
      status: 'open'
    });
    if (!position) {
      return res.status(404).json({ success: false, message: 'Position not found or already closed' });
    }

    const newSL = hasSL ? normalise(stopLoss) : (position.stopLoss != null ? Number(position.stopLoss) : null);
    const newTP = hasTP ? normalise(takeProfit) : (position.takeProfit != null ? Number(position.takeProfit) : null);

    // Reject SL/TP that's already on the WRONG side of the live close price —
    // otherwise the very next tick fires it instantly ("auto-executes without
    // the price moving"). A BUY closes at the BID, a SELL at the ASK, EXACTLY
    // the prices refreshEquity() compares against, so the validation matches the
    // trigger. SL below / TP above for BUY; SL above / TP below for SELL.
    const side = String(position.side || '').toLowerCase();
    const zerodhaService = require('../services/zerodha.service');
    const allPrices = typeof zerodhaService.getAllPrices === 'function' ? zerodhaService.getAllPrices() : {};
    const lp = allPrices[position.symbol] || {};
    const lastLike = Number(lp.lastPrice) || Number(lp.last_price) || Number(lp.ltp) || Number(lp.last) || 0;
    const closePx = side === 'buy'
      ? (Number(lp.bid) || lastLike || Number(position.currentPrice) || Number(position.entryPrice) || 0)
      : (Number(lp.ask) || lastLike || Number(position.currentPrice) || Number(position.entryPrice) || 0);
    if (closePx > 0) {
      const px = closePx.toFixed(2);
      if (side === 'buy') {
        if (newSL != null && newSL >= closePx) return res.status(400).json({ success: false, message: `Stop Loss must be BELOW the current price ₹${px} for a BUY — otherwise it triggers instantly.` });
        if (newTP != null && newTP <= closePx) return res.status(400).json({ success: false, message: `Take Profit must be ABOVE the current price ₹${px} for a BUY — otherwise it triggers instantly.` });
      } else if (side === 'sell') {
        if (newSL != null && newSL <= closePx) return res.status(400).json({ success: false, message: `Stop Loss must be ABOVE the current price ₹${px} for a SELL — otherwise it triggers instantly.` });
        if (newTP != null && newTP >= closePx) return res.status(400).json({ success: false, message: `Take Profit must be BELOW the current price ₹${px} for a SELL — otherwise it triggers instantly.` });
      }
    }

    if (hasSL) position.stopLoss = normalise(stopLoss);
    if (hasTP) position.takeProfit = normalise(takeProfit);
    await position.save();

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(String(req.user._id)).emit('challengePositionUpdate', {
          challengeAccountId: position.challengeAccountId,
          positionId: position.positionId,
          stopLoss: position.stopLoss,
          takeProfit: position.takeProfit
        });
      }
    } catch (_) { /* io optional */ }

    res.json({ success: true, position });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/prop/positions/:positionId/close - close a challenge position
router.post('/positions/:positionId/close', verifyUserToken, async (req, res) => {
  try {
    const { closePrice, closeVolume } = req.body;
    if (!closePrice || Number(closePrice) <= 0) {
      return res.status(400).json({ success: false, message: 'closePrice required' });
    }

    const position = await ChallengePosition.findOne({
      positionId: req.params.positionId,
      userId: req.user._id,
      status: 'open'
    });
    if (!position) return res.status(404).json({ success: false, message: 'Position not found or already closed' });

    // Partial close: closeVolume < the position's volume closes only that many
    // lots and leaves the rest open. Omitted / >= full volume → full close.
    const closeOpts = {};
    if (closeVolume != null && Number(closeVolume) > 0) {
      closeOpts.closeVolume = Number(closeVolume);
    }

    const challengePropEngine = require('../services/challengePropEngine.service');
    const result = await challengePropEngine.closePosition(req.params.positionId, Number(closePrice), 'user', closeOpts);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    // Broadcast account update so other tabs / pages refresh.
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(String(req.user._id)).emit('challengeAccountUpdate', {
          challengeAccountId: position.challengeAccountId,
          account: result.account,
          closedPosition: result.position
        });
      }
    } catch (_) { /* io optional */ }

    res.json({
      success: true,
      position: result.position,
      account: result.account,
      failed: result.failed,
      phaseCompleted: result.phaseCompleted,
      funded: result.funded
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/prop/positions/:positionId/cancel - cancel a PENDING limit/stop
// order before it triggers. Releases its reserved margin. No P&L / commission.
router.post('/positions/:positionId/cancel', verifyUserToken, async (req, res) => {
  try {
    const position = await ChallengePosition.findOne({
      positionId: req.params.positionId,
      userId: req.user._id,
      status: 'pending'
    });
    if (!position) return res.status(404).json({ success: false, message: 'Pending order not found or already processed' });

    const challengePropEngine = require('../services/challengePropEngine.service');
    const result = await challengePropEngine.cancelPendingOrder(req.params.positionId, req.user._id);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(String(req.user._id)).emit('challengeAccountUpdate', {
          challengeAccountId: position.challengeAccountId,
          account: result.account,
          cancelledOrder: result.position
        });
      }
    } catch (_) { /* io optional */ }

    res.json({ success: true, position: result.position, account: result.account });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/prop/account/:id/dashboard - User: detailed account dashboard
router.get('/account/:id/dashboard', verifyUserToken, async (req, res) => {
  try {
    const dashboard = await propTradingEngine.getAccountDashboard(req.params.id, req.user._id);
    if (!dashboard) return res.status(404).json({ success: false, message: 'Account not found' });
    res.json({ success: true, ...dashboard });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/prop/validate-trade - User: validate before opening a trade
router.post('/validate-trade', verifyUserToken, async (req, res) => {
  try {
    const { challengeAccountId, symbol, segment, quantity, lots, sl, stopLoss, tp } = req.body;
    if (!challengeAccountId) return res.status(400).json({ success: false, message: 'challengeAccountId required' });

    const result = await propTradingEngine.validateTradeOpen(challengeAccountId, {
      symbol, segment, quantity: quantity || lots, sl, stopLoss, tp
    });

    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.error, code: result.code });
    }
    res.json({ success: true, message: 'Trade allowed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/prop/trade-opened - User: notify that a trade was opened
router.post('/trade-opened', verifyUserToken, async (req, res) => {
  try {
    const { challengeAccountId } = req.body;
    if (!challengeAccountId) return res.status(400).json({ success: false, message: 'challengeAccountId required' });

    const account = await propTradingEngine.onTradeOpened(challengeAccountId);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
    res.json({ success: true, tradesToday: account.tradesToday, openTradesCount: account.openTradesCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/prop/trade-closed - User: notify that a trade was closed
router.post('/trade-closed', verifyUserToken, async (req, res) => {
  try {
    const { challengeAccountId, pnl } = req.body;
    if (!challengeAccountId) return res.status(400).json({ success: false, message: 'challengeAccountId required' });

    const result = await propTradingEngine.onTradeClosed(challengeAccountId, Number(pnl) || 0);
    if (!result) return res.status(404).json({ success: false, message: 'Account not found' });

    res.json({
      success: true,
      failed: result.failed || false,
      failReason: result.reason || null,
      phaseCompleted: result.phaseCompleted || false,
      funded: result.funded || false,
      balance: result.account.currentBalance,
      equity: result.account.currentEquity,
      status: result.account.status
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/prop/withdraw - User: request a profit payout. Creates a pending
// Transaction that the admin must approve; nothing moves into the main wallet
// until approval.
router.post('/withdraw', verifyUserToken, async (req, res) => {
  try {
    const { challengeAccountId, upiId, holderName, note, amount, qrImage } = req.body;
    if (!challengeAccountId) return res.status(400).json({ success: false, message: 'challengeAccountId required' });
    if (!upiId) return res.status(400).json({ success: false, message: 'upiId required' });
    if (!holderName) return res.status(400).json({ success: false, message: 'holderName required' });

    const result = await propTradingEngine.withdrawProfit(challengeAccountId, req.user._id, {
      upiId,
      holderName,
      note: note || '',
      amount: amount != null ? Number(amount) : null,
      qrImage: qrImage || ''
    });

    // User-facing: "withdrawal request received" (Email 6). Best-effort.
    try {
      const emailService = require('../services/email.service');
      const u = await User.findById(req.user._id).select('name email oderId').lean();
      if (u?.email) {
        emailService.sendTemplatedEmail('withdrawal_received', u.email, {
          userName: u.name || u.oderId || 'Trader',
          amount: Number(result.requestedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          requestDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        }).catch(() => {});
      }
    } catch (_) { /* email best-effort */ }

    res.json({
      success: true,
      pending: true,
      message: `Payout request of ₹${result.requestedAmount.toFixed(2)} submitted for admin approval`,
      transactionId: result.transactionId,
      requestedAmount: result.requestedAmount,
      profit: result.profit,
      splitPercent: result.splitPercent
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/prop/my-payouts — user's own payout history (used by the
// Passed Challenges page to show pending-payout banners on funded
// account cards).
router.get('/my-payouts', verifyUserToken, async (req, res) => {
  try {
    const Transaction = require('../models/Transaction');
    // Search by both display oderId and MongoDB _id (old transactions stored _id)
    const possibleIds = [String(req.user.oderId), String(req.user._id)].filter(Boolean);
    const txs = await Transaction.find({
      oderId: { $in: possibleIds },
      type: 'withdrawal',
      'paymentDetails.kind': 'prop_payout'
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, payouts: txs });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ============ ADMIN PAYOUT QUEUE ============
// (Transaction, User, ChallengeAccount already required at the top of the
//  file — reusing those. Don't re-require or Node throws a "const already
//  declared" error at module load and the server refuses to boot.)
const Transaction = require('../models/Transaction');
const challengeApprovalService = require('../services/challengeApproval.service');

// (User-facing payment-methods are served by GET /api/admin-payment-details
//  in server/index.js — that endpoint returns { bankAccounts, upiIds,
//  cryptoWallets } and is what the deposit page already uses. No new
//  route needed here.)

// ============ ADMIN CHALLENGE BUYS QUEUE ============

// GET /api/prop/admin/challenge-buys — list pending challenge_purchase
// transactions for admin review.
router.get('/admin/challenge-buys', async (req, res) => {
  try {
    const result = await challengeApprovalService.list({
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit
    });
    // Enrich each row with the buyer's display name.
    const enriched = await Promise.all(result.rows.map(async (tx) => {
      const user = await User.findOne({ oderId: tx.oderId }).select('name email oderId').lean().catch(() => null);
      return { ...tx, user };
    }));
    res.json({
      success: true,
      data: { rows: enriched, summary: result.summary, pagination: result.pagination }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/prop/admin/transactions/:txId/proof — one payment screenshot.
// The admin queues list rows without the base64 image (it made the Challenge
// Buys response 1.6 MB); the screenshot is loaded only when "View" is clicked.
router.get('/admin/transactions/:txId/proof', verifyAdminToken, async (req, res) => {
  try {
    const tx = await require('../models/Transaction').findById(req.params.txId).select('proofImage').lean();
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' });
    res.json({ success: true, proofImage: tx.proofImage || '' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/prop/admin/challenge-buys/:txId/approve
router.post('/admin/challenge-buys/:txId/approve', async (req, res) => {
  try {
    const result = await challengeApprovalService.approveChallengeBuy(req.params.txId, req.body?.adminId || 'admin');
    res.json({ success: true, message: 'Challenge purchase approved', ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/prop/admin/challenge-buys/:txId/reject
router.post('/admin/challenge-buys/:txId/reject', async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'reason required' });
    const result = await challengeApprovalService.rejectChallengeBuy(req.params.txId, req.body?.adminId || 'admin', reason);
    res.json({ success: true, message: 'Challenge purchase rejected', ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==================== CHALLENGE RESET (paid retry of a FAILED account) ====
// A user whose evaluation FAILED can pay 50% of the challenge fee to wipe every
// trade and restart the SAME account fresh at its initial balance. The reset
// only takes effect once admin verifies the payment (screenshot + UTR).

// Reset helpers live in a shared service so the Deposits-inbox approval
// path (index.js) resets the account exactly like the dedicated routes here.
const { computeResetFee, resetChallengeAccountFresh } = require('../services/challengeReset.service');

// GET /api/prop/account/:id/reset-info — eligibility + fee for the reset modal.
router.get('/account/:id/reset-info', verifyUserToken, async (req, res) => {
  try {
    const account = await ChallengeAccount.findById(req.params.id).populate('challengeId');
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
    if (String(account.userId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not your account' });
    }
    const { baseFee, resetFee } = computeResetFee(account);
    const pending = await Transaction.findOne({
      type: 'challenge_reset', status: 'pending',
      'challengePurchaseInfo.challengeAccountId': account._id
    }).lean();
    // Reset is a ONE-TIME offer. If it's already been used once, the account is
    // no longer eligible — the user must buy a new challenge. (BUG 1)
    const resetUsed = (Number(account.resetCount) || 0) >= 1;
    res.json({
      success: true,
      eligible: account.status === 'FAILED' && !resetUsed,
      resetUsed,
      status: account.status,
      accountCode: account.accountId,
      fundSize: account.initialBalance,
      baseFee,
      resetFee,
      pendingRequest: pending
        ? { id: pending._id, createdAt: pending.createdAt, amount: pending.amount }
        : null
    });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// POST /api/prop/reset-request — user submits reset payment proof (screenshot + UTR).
router.post('/reset-request', verifyUserToken, async (req, res) => {
  try {
    const { accountId, adminUpiId, transactionRef, screenshotBase64, note } = req.body;
    if (!accountId) return res.status(400).json({ success: false, message: 'accountId required' });
    if (!adminUpiId) return res.status(400).json({ success: false, message: 'adminUpiId required' });
    if (!transactionRef || !String(transactionRef).trim()) {
      return res.status(400).json({ success: false, message: 'transactionRef (UTR) required' });
    }

    const account = await ChallengeAccount.findById(accountId).populate('challengeId');
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
    if (String(account.userId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not your account' });
    }
    if (account.status !== 'FAILED') {
      return res.status(400).json({ success: false, message: 'Only a failed account can be reset' });
    }
    // One-time reset guard (BUG 1) — block a second paid reset on the same
    // account. Server-side enforcement so it holds even if the UI is bypassed.
    if ((Number(account.resetCount) || 0) >= 1) {
      return res.status(400).json({
        success: false,
        message: 'This account has already been reset once. Please purchase a new challenge to continue.'
      });
    }

    const existing = await Transaction.findOne({
      type: 'challenge_reset', status: 'pending',
      'challengePurchaseInfo.challengeAccountId': account._id
    });
    if (existing) return res.status(409).json({ success: false, message: 'A reset request is already pending for this account' });

    const { baseFee, resetFee } = computeResetFee(account);
    if (!resetFee || resetFee <= 0) return res.status(400).json({ success: false, message: 'Unable to determine reset fee' });

    const tx = await Transaction.create({
      oderId: req.user.oderId || String(req.user._id),
      type: 'challenge_reset',
      accountType: 'main',
      amount: resetFee,
      currency: 'INR',
      method: 'upi',
      status: 'pending',
      userName: req.user.name || '',
      userNote: note || '',
      proofImage: screenshotBase64 || '',
      paymentDetails: {
        kind: 'challenge_reset',
        upiId: adminUpiId,
        utrNumber: String(transactionRef).trim(),
        challengeAccountId: account.accountId,
        challengeAccountCode: account.accountId
      },
      challengePurchaseInfo: {
        challengeId: account.challengeId?._id || account.challengeId,
        challengeAccountId: account._id,
        challengeName: account.challengeId?.name || '',
        fundSize: account.initialBalance,
        originalFee: baseFee,
        finalFee: resetFee
      }
    });

    try {
      const emailService = require('../services/email.service');
      emailService.sendAdminNotification({
        type: 'challenge_reset',
        title: `Reset request from ${req.user.name || req.user.oderId || 'a user'}`,
        subtitle: `${account.accountId} · ₹${Number(resetFee).toLocaleString('en-IN')} reset fee · awaiting approval`,
        user: { name: req.user.name, email: req.user.email, oderId: req.user.oderId },
        fields: [
          { label: 'Account', value: account.accountId },
          { label: 'Account Size', value: `₹${Number(account.initialBalance).toLocaleString('en-IN')}` },
          { label: 'Reset Fee', value: `₹${Number(resetFee).toLocaleString('en-IN')}` },
          { label: 'UPI ID', value: adminUpiId },
          { label: 'UTR / Ref', value: String(transactionRef).trim() }
        ],
        actionUrl: `${process.env.ADMIN_URL || 'https://admin.dhanfunded.com'}/admin/funds/challenge-resets`,
        actionLabel: 'Review & Approve'
      }).catch(() => {});
    } catch (_) { /* notification is best-effort */ }

    res.status(201).json({
      success: true,
      message: 'Reset request submitted. Your account will restart once admin verifies the payment.',
      transactionId: tx._id,
      resetFee
    });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// GET /api/prop/admin/reset-requests — admin review queue.
router.get('/admin/reset-requests', async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const filter = { type: 'challenge_reset' };
    if (status && status !== 'all') filter.status = status;
    // No base64 screenshots in the list — "View" fetches one on demand.
    const rows = await Transaction.find(filter).select('-proofImage').sort({ createdAt: -1 }).limit(200).lean();
    const withProof = new Set((await Transaction.find({ _id: { $in: rows.map((r) => r._id) }, proofImage: { $nin: ['', null] } })
      .select('_id').lean()).map((r) => String(r._id)));
    const enriched = await Promise.all(rows.map(async (tx) => {
      const user = await User.findOne({ oderId: tx.oderId }).select('name email oderId').lean().catch(() => null);
      return { ...tx, user, hasProof: withProof.has(String(tx._id)) };
    }));
    const [pending, approved, rejected, pendingAgg] = await Promise.all([
      Transaction.countDocuments({ type: 'challenge_reset', status: 'pending' }),
      Transaction.countDocuments({ type: 'challenge_reset', status: 'approved' }),
      Transaction.countDocuments({ type: 'challenge_reset', status: 'rejected' }),
      Transaction.aggregate([
        { $match: { type: 'challenge_reset', status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);
    res.json({
      success: true,
      data: { rows: enriched, summary: { pending, approved, rejected, totalPending: pendingAgg[0]?.total || 0 } }
    });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// POST /api/prop/admin/reset-requests/:txId/approve — verify payment + reset account.
router.post('/admin/reset-requests/:txId/approve', async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.txId);
    if (!tx || tx.type !== 'challenge_reset') return res.status(404).json({ success: false, message: 'Reset request not found' });
    if (tx.status !== 'pending') return res.status(400).json({ success: false, message: `Already ${tx.status}` });

    const account = await ChallengeAccount.findById(tx.challengePurchaseInfo?.challengeAccountId).populate('challengeId');
    if (!account) return res.status(404).json({ success: false, message: 'Linked account not found' });

    await resetChallengeAccountFresh(account, account.challengeId);

    tx.status = 'approved';
    tx.processedBy = req.body?.adminId || 'admin';
    tx.processedAt = new Date();
    await tx.save();

    res.json({ success: true, message: 'Reset approved — account is active again', accountId: account.accountId });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// POST /api/prop/admin/reset-requests/:txId/reject
router.post('/admin/reset-requests/:txId/reject', async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'reason required' });
    const tx = await Transaction.findById(req.params.txId);
    if (!tx || tx.type !== 'challenge_reset') return res.status(404).json({ success: false, message: 'Reset request not found' });
    if (tx.status !== 'pending') return res.status(400).json({ success: false, message: `Already ${tx.status}` });
    tx.status = 'rejected';
    tx.rejectionReason = reason;
    tx.processedBy = req.body?.adminId || 'admin';
    tx.processedAt = new Date();
    await tx.save();
    res.json({ success: true, message: 'Reset request rejected' });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// GET /api/prop/admin/payouts — list pending prop-payout requests with
// enriched user + challenge-account info so the admin dashboard can show
// KYC badge, cooldown status, profit split, etc.
router.get('/admin/payouts', async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const query = { type: 'withdrawal', 'paymentDetails.kind': 'prop_payout' };
    if (status && status !== 'all') query.status = status;

    const txs = await Transaction.find(query).sort({ createdAt: -1 }).limit(200).lean();

    const enriched = await Promise.all(txs.map(async (tx) => {
      const user = await User.findById(tx.oderId).select('oderId name email kycStatus kycVerified walletINR').lean().catch(() => null);
      const chAccId = tx.paymentDetails?.challengeAccountId;
      let challengeAccount = null;
      if (chAccId) {
        challengeAccount = await ChallengeAccount.findById(chAccId).select('accountId status profitSplitPercent walletBalance currentBalance initialBalance lastWithdrawalDate').lean().catch(() => null);
      }
      return {
        _id: tx._id,
        createdAt: tx.createdAt,
        status: tx.status,
        requestedAmount: tx.amount,
        userNote: tx.userNote,
        user: user ? {
          _id: user._id,
          oderId: user.oderId,
          name: user.name,
          email: user.email,
          kycStatus: user.kycStatus || 'not_submitted',
          kycVerified: !!user.kycVerified,
          walletINRBalance: user.walletINR?.balance || 0
        } : null,
        challengeAccount,
        profit: tx.paymentDetails?.profit,
        splitPercent: tx.paymentDetails?.splitPercent,
        upiId: tx.withdrawalInfo?.upiDetails?.upiId || tx.paymentDetails?.upiId || '',
        holderName: tx.withdrawalInfo?.upiDetails?.name || tx.userName || '',
        proofImage: tx.proofImage || '',
        adminNote: tx.adminNote || '',
        rejectionReason: tx.rejectionReason || '',
        processedAt: tx.processedAt
      };
    }));

    res.json({ success: true, payouts: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/prop/admin/payouts/:id/approve
// body: { customAmount?, overrideCooldown?, adminNote? }
// Credits User.walletINR (and wallet.balance for immediate trading) with the
// approved amount and resets the challenge account's walletBalance to
// initialBalance so the next payout cycle starts fresh.
router.post('/admin/payouts/:id/approve', async (req, res) => {
  try {
    const { customAmount, overrideCooldown, overrideGates, adminNote } = req.body || {};
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ success: false, message: 'Payout request not found' });
    if (tx.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Request is ${tx.status}` });
    }

    let chAccId = tx.paymentDetails?.challengeAccountId;
    // Fallback: old transactions may lack challengeAccountId (Mongoose strict
    // mode stripped it before the schema was updated). Try to find the funded
    // account for this user so admin approval still works.
    if (!chAccId) {
      const fallbackAcc = await ChallengeAccount.findOne({
        userId: tx.oderId,
        status: 'FUNDED'
      });
      if (fallbackAcc) {
        chAccId = String(fallbackAcc._id);
        // Patch the transaction so future lookups work
        tx.paymentDetails = tx.paymentDetails || {};
        tx.paymentDetails.challengeAccountId = chAccId;
        tx.paymentDetails.challengeAccountCode = fallbackAcc.accountId;
        tx.paymentDetails.kind = 'prop_payout';
      }
    }
    if (!chAccId) return res.status(400).json({ success: false, message: 'Missing challenge account reference' });

    const account = await ChallengeAccount.findById(chAccId);
    if (!account) return res.status(404).json({ success: false, message: 'Challenge account not found' });

    const Challenge = require('../models/Challenge');
    const challenge = await Challenge.findById(account.challengeId);
    const fs = challenge?.fundedSettings || {};

    // Cooldown check (bypassable with overrideCooldown flag)
    if (!overrideCooldown && account.lastWithdrawalDate) {
      const cooldownDays = fs.withdrawalFrequencyDays || 0;
      if (cooldownDays > 0) {
        const daysSince = (Date.now() - new Date(account.lastWithdrawalDate).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < cooldownDays) {
          return res.status(400).json({
            success: false,
            message: `Cooldown not met (${Math.ceil(cooldownDays - daysSince)} more day(s)). Pass overrideCooldown:true to bypass.`
          });
        }
      }
    }

    // ─── Defence-in-depth: re-check the same payout gates as the user route.
    // A stale tab or direct API call could otherwise bypass them. All
    // bypassable with overrideGates:true for legitimate manual approvals.
    if (!overrideGates) {
      const initial = Number(account.initialBalance) || 0;
      const balanceNow = Number(account.walletBalance) || Number(account.currentBalance) || 0;
      const fundedAtMs = account.fundedAt ? new Date(account.fundedAt).getTime() : null;

      if (fs.minDaysSinceFundedForPayout && fundedAtMs) {
        const ageDays = (Date.now() - fundedAtMs) / 86400000;
        if (ageDays < fs.minDaysSinceFundedForPayout) {
          const wait = Math.ceil(fs.minDaysSinceFundedForPayout - ageDays);
          return res.status(400).json({ success: false, message: `Min-funded-age not met (${wait} more day(s)). Pass overrideGates:true to bypass.` });
        }
      }

      const tradingDays = Array.isArray(account.uniqueTradingDays) ? account.uniqueTradingDays.length : 0;
      if (fs.minTradingDaysForPayout && tradingDays < fs.minTradingDaysForPayout) {
        return res.status(400).json({ success: false, message: `Min trading days not met (${tradingDays}/${fs.minTradingDaysForPayout}). Pass overrideGates:true to bypass.` });
      }

      if (fs.minProfitPercentForPayout && initial > 0) {
        const profitPct = ((balanceNow - initial) / initial) * 100;
        if (profitPct < fs.minProfitPercentForPayout) {
          return res.status(400).json({ success: false, message: `Min profit not met (${profitPct.toFixed(2)}% < ${fs.minProfitPercentForPayout}%). Pass overrideGates:true to bypass.` });
        }
      }
    }

    // Cap enforcement on payout amount (default 8% of initial per cycle).
    let amountToPay = Number(customAmount) > 0 ? Number(customAmount) : Number(tx.amount);
    if (!amountToPay || amountToPay <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payout amount' });
    }
    // Per-cycle payout cap — defaults to 5% of initial when the challenge has
    // none set, so the cap is ALWAYS enforced and matches the displayed value.
    const capPercent = Number(fs.maxWithdrawalPercent) || 5;
    if (!overrideGates && capPercent > 0 && Number(account.initialBalance) > 0) {
      const capAmount = (Number(account.initialBalance) * capPercent) / 100;
      if (amountToPay > capAmount) {
        return res.status(400).json({
          success: false,
          message: `Payout exceeds cap of ${capPercent}% (₹${capAmount.toFixed(2)}). Lower the amount or pass overrideGates:true.`
        });
      }
    }

    // NOTE: We no longer credit the user's wallet on payout approval.
    // Admin transfers the amount manually via UPI to the user's
    // withdrawalInfo.upiDetails.upiId. We just mark the Transaction
    // approved and reset the challenge account's sub-wallet so the
    // next payout cycle starts fresh.
    const initial = Number(account.initialBalance) || 0;
    account.walletBalance = initial;
    account.walletEquity = initial;
    account.walletMargin = 0;
    account.walletFreeMargin = initial;
    account.walletMarginLevel = 0;
    account.currentBalance = initial;
    account.currentEquity = initial;
    account.phaseStartBalance = initial;
    account.totalWithdrawn = (Number(account.totalWithdrawn) || 0) + amountToPay;
    account.lastWithdrawalDate = new Date();
    account.payoutCount = (Number(account.payoutCount) || 0) + 1;
    // Reset DD watermarks + dailyPnlMap so the next 14-day cycle starts clean:
    // best-day consistency is per-cycle, DD comparison is vs the reset balance.
    account.lowestEquityToday = initial;
    account.lowestEquityOverall = initial;
    account.highestEquity = initial;
    account.dayStartEquity = initial;
    account.currentDailyDrawdownPercent = 0;
    account.currentOverallDrawdownPercent = 0;
    account.currentProfitPercent = 0;
    if (account.dailyPnlMap && typeof account.dailyPnlMap.clear === 'function') {
      account.dailyPnlMap.clear();
      account.markModified('dailyPnlMap');
    }
    await account.save();

    tx.status = 'approved';
    tx.amount = amountToPay;
    tx.adminNote = adminNote || '';
    tx.processedBy = 'admin';
    tx.processedAt = new Date();
    await tx.save();

    // User-facing: "payout processed successfully" (Email 7). Best-effort.
    try {
      const emailService = require('../services/email.service');
      const u = await User.findById(account.userId).select('name email oderId').lean();
      if (u?.email) {
        emailService.sendTemplatedEmail('payout_processed', u.email, {
          userName: u.name || u.oderId || 'Trader',
          amount: Number(amountToPay).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          paymentDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          paymentMethod: 'UPI / Bank Transfer',
          referenceId: String(tx._id)
        }).catch(() => {});
      }
    } catch (_) { /* email best-effort */ }

    // Auto-reject any duplicate pending payout requests from this user
    // (caused by the old schema bug that allowed multiple submissions).
    const dupes = await Transaction.updateMany(
      { _id: { $ne: tx._id }, oderId: tx.oderId, type: 'withdrawal', status: 'pending' },
      { $set: { status: 'rejected', rejectionReason: 'Auto-rejected: duplicate request (another payout already approved)', processedBy: 'system', processedAt: new Date() } }
    );

    res.json({
      success: true,
      message: `Payout ₹${amountToPay.toFixed(2)} approved. Transfer to user's UPI: ${tx.withdrawalInfo?.upiDetails?.upiId || tx.paymentDetails?.upiId || '(not set)'}` +
        (dupes.modifiedCount > 0 ? ` (${dupes.modifiedCount} duplicate request(s) auto-rejected)` : ''),
      transaction: tx
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/prop/admin/payouts/:id/reject
// body: { reason }
router.post('/admin/payouts/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ success: false, message: 'Payout request not found' });
    if (tx.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Request is ${tx.status}` });
    }

    tx.status = 'rejected';
    tx.rejectionReason = String(reason).trim();
    tx.processedBy = 'admin';
    tx.processedAt = new Date();
    await tx.save();

    res.json({ success: true, message: 'Payout request rejected', transaction: tx });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
