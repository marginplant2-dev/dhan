/**
 * The three live programmes, as configured in the admin panel.
 *
 * Every marketing page used to hardcode its own copy of these numbers, and they
 * had drifted away from what the platform actually enforces — the site was
 * advertising ₹2,600 / 5% daily / "sizes up to ₹20 Lakh" while the admin had
 * ₹2,700 / 4% daily. One file, one edit, no drift. (Account sizes come from
 * each challenge's `tiers`: ₹1 Lakh up to ₹50 Lakh depending on programme.)
 *
 * Verified against the `challenges` collection. When the admin adds a size or
 * changes a fee, update this file in the same breath.
 */

export const PROGRAMMES = [
  {
    key: '2-step',
    name: '2-Step Evaluation',
    fee: '₹2,700',
    feeValue: 2700,
    target: 'Phase 1: 8%, then 5%',
    targetRupees: '₹8,000, then ₹5,000',
    daily: '4%',
    dailyRupees: '₹4,000',
    overall: '10%',
    overallRupees: '₹10,000',
    window: '60 days',
    split: '80%',
    who: 'The widest overall loss limit of the three, and the cheapest fee. Most people starting out pick this.',
  },
  {
    key: '1-step',
    name: '1-Step Evaluation',
    fee: '₹3,900',
    feeValue: 3900,
    target: '10% in a single phase',
    targetRupees: '₹10,000',
    daily: '4%',
    dailyRupees: '₹4,000',
    overall: '8%',
    overallRupees: '₹8,000',
    window: '45 days',
    split: '80%',
    who: 'One phase instead of two, in exchange for a tighter overall limit and a higher target.',
  },
  {
    key: 'instant',
    name: 'Instant Funding',
    fee: '₹4,100',
    feeValue: 4100,
    target: '5% before a payout',
    targetRupees: '₹5,000',
    daily: '3%',
    dailyRupees: '₹3,000',
    overall: '6%',
    overallRupees: '₹6,000',
    window: '30 days',
    split: '70%',
    who: 'No assessment phase at all. The strictest daily limit, the highest fee and a 70% share.',
  },
];

/** Rules that are identical across all three programmes. */
export const COMMON_RULES = [
  { rule: 'Account sizes', value: '₹1 Lakh to ₹50 Lakh (by programme)' },
  { rule: 'Max loss on a single trade', value: '2% (₹2,000)' },
  { rule: 'Minimum trading days', value: '5' },
  { rule: 'Max profit from one day', value: '40% of the target' },
  { rule: 'Max leverage', value: '100x' },
  { rule: 'Positions held overnight / over the weekend', value: 'Not permitted' },
  { rule: 'Payout cycle once funded', value: 'Every 14 days' },
  { rule: 'Minimum profit to request a payout', value: '5%' },
];

export const CHEAPEST_FEE = '₹2,700';
export const ACCOUNT_SIZE = '₹1 Lakh to ₹50 Lakh';
