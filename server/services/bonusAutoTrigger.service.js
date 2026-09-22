'use strict';

/**
 * Bonus auto-trigger — Fix 21 Phase 2 (revised in Fix 21c.7 to fall back
 * from first_deposit to regular_deposit).
 *
 * Called from the admin wallet endpoint right after a balance ADD succeeds.
 * Looks for the first matching active BonusTemplate and grants it to the user.
 *
 * Trigger logic:
 *   1. If this IS the user's first deposit, look for an active `first_deposit`
 *      template that matches the amount. If found → grant it.
 *   2. If no first_deposit template matched (none configured, or amount below
 *      its min), fall back to looking for an active `regular_deposit` template.
 *      This way a user who makes their first deposit still gets *some* bonus
 *      when admin only set up regular templates.
 *   3. If this is NOT a first deposit, only `regular_deposit` templates apply
 *      (a user can never re-trigger a first_deposit template).
 *   4. Pick the newest matching template (sorted createdAt desc), respecting
 *      minDeposit and endDate.
 *   5. Compute the bonus (% or fixed), apply maxBonus cap, write to
 *      wallet.credit, create a UserBonus row.
 *
 * Returns the granted UserBonus row, or null if no template matched.
 *
 * IMPORTANT: this function MUTATES the User model in place but does NOT save
 * it. The caller is responsible for `await user.save()` so the wallet
 * mutation and the user's other balance/equity changes get persisted in
 * one shot. The UserBonus row IS saved here.
 *
 * @param {object} user                    Mongoose User doc (mutable)
 * @param {number} depositAmountInr        the deposit amount in ₹ (after USD→INR conversion if needed)
 * @param {boolean} isFirstDeposit         did this deposit just flip firstDepositAt?
 * @param {number} liveUsdInrRate          for converting INR bonus → USD-equivalent for wallet.credit storage
 * @returns {Promise<object|null>}         the UserBonus row, or null
 */
async function maybeGrantDepositBonus(user, depositAmountInr, isFirstDeposit, liveUsdInrRate) {
  if (!user || !(depositAmountInr > 0)) return null;
  const BonusTemplate = require('../models/BonusTemplate');
  const UserBonus = require('../models/UserBonus');

  const now = new Date();

  const findTemplate = async (type) => {
    const docs = await BonusTemplate.find({
      type,
      status: 'active',
      minDeposit: { $lte: depositAmountInr },
      $or: [
        { endDate: null },
        { endDate: { $exists: false } },
        { endDate: { $gte: now } }
      ]
    }).sort({ createdAt: -1 }).limit(1);
    return docs && docs.length ? docs[0] : null;
  };

  // 1. If first deposit → try first_deposit first.
  // 2. Always fall back to regular_deposit if first_deposit didn't match
  //    (or if this isn't a first deposit at all).
  let template = null;
  if (isFirstDeposit) {
    template = await findTemplate('first_deposit');
  }
  if (!template) {
    template = await findTemplate('regular_deposit');
  }
  if (!template) return null;

  // Compute bonus amount in INR
  let amountInr = 0;
  if (template.bonusType === 'percentage') {
    amountInr = (depositAmountInr * Number(template.bonusValue)) / 100;
  } else {
    amountInr = Number(template.bonusValue);
  }
  if (template.maxBonus != null && template.maxBonus > 0) {
    amountInr = Math.min(amountInr, template.maxBonus);
  }
  if (!(amountInr > 0)) return null;

  // Convert to USD-equivalent for wallet.credit storage (Fix 20 stores in USD)
  const creditUsd = amountInr / liveUsdInrRate;

  // Mutate wallet.credit + recompute equity. The caller will save.
  const currentCredit = Number(user.wallet.credit || 0);
  user.wallet.credit = currentCredit + creditUsd;
  const floatingPnl =
    Number(user.wallet.equity || 0) -
    Number(user.wallet.balance || 0) -
    currentCredit;
  user.updateEquity(floatingPnl);

  // Persist the UserBonus row (this one we DO save here)
  const expiresAt = new Date(Date.now() + (Number(template.duration) || 30) * 24 * 60 * 60 * 1000);
  const bonus = await UserBonus.create({
    userId: user.oderId,
    templateId: template._id,
    templateName: template.name,
    type: template.type,
    amount: amountInr,
    depositAmount: depositAmountInr,
    wagerRequirement: template.wagerRequirement,
    wagerProgress: 0,
    status: 'active',
    grantedAt: new Date(),
    expiresAt,
    notes: `Auto-granted on ${isFirstDeposit ? 'first' : 'regular'} deposit of ₹${depositAmountInr.toFixed(2)}`
  });

  // Bump usedCount on the template
  template.usedCount = (template.usedCount || 0) + 1;
  await template.save();

  return bonus;
}

module.exports = {
  maybeGrantDepositBonus
};
