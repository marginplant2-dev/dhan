/**
 * First-run content: the FAQ the public site reads from the database.
 *
 * Seeded only when the collection is empty, so anything the admin edits in
 * Content Management survives a restart. There is deliberately no blog seed —
 * posts are written in the admin panel, not shipped in code.
 */

const Faq = require('../models/Faq');

const FAQ_SEED = [
  // ── What this is ────────────────────────────────────────────────────────
  ['General', 'What exactly is DhanFunded?',
    'An evaluation desk. You trade Indian index derivatives on simulated capital against rules that are published before you pay, and if your results clear those rules you are given a funded account and paid a share of what it makes. We do not teach, tip or advise — we measure.'],
  ['General', 'Is any of this real money in the market?',
    'No. Prices come from live NSE and BSE feeds, but your orders stay inside our system and never reach an exchange. That is why we are not a broker and hold no client funds. The money that is real is what we pay out on a funded account.'],
  ['General', 'Can a platform like this operate in India?',
    'Yes. Running a simulated environment and paying people for measured performance is not broking, portfolio management or investment advice, so it needs no SEBI registration. We are careful about that line: no tips, no advice, no handling of your trading capital.'],
  ['General', 'Who tends to do well here?',
    'Traders who already have a method and lose patience with their own inconsistency. The rules reward a repeatable process over a lucky week — a trader who makes 2% five times over is worth more to us than one who makes 10% on a single position.'],
  ['General', 'I am still learning. Should I buy an evaluation?',
    'Not yet. Use the free practice account until your worst week fits inside the daily loss limit of the size you want. An evaluation fee spent on an untested method is simply a donation.'],
  ['General', 'What makes you different from the other firms?',
    'Every number you are judged on appears on the pricing page in rupees before you pay, and the same number appears in your dashboard while you trade. There is no rule that shows up only when you request a payout.'],
  ['General', 'How do I know you will actually pay?',
    'Payout conditions are fixed in writing: 14 days funded, five trading days used, 5% profit on the account, and no single day carrying more than 30% of that profit. Meet them and the request goes into the queue. Nothing about the terms changes after you pass.'],

  // ── Trading and rules ───────────────────────────────────────────────────
  ['Trading', 'What can I trade?',
    'NIFTY, BANKNIFTY and SENSEX derivatives — index futures and options on NSE and BSE. Nothing in forex, crypto, commodities or overseas markets, because those are not what this desk is built to measure.'],
  ['Trading', 'Which rules can end my account?',
    'Two losses and one clock. A daily loss beyond the programme\'s daily limit, a cumulative loss beyond its overall limit, or the evaluation running past its allowed days. Everything is measured against the starting balance, not against your best equity.'],
  ['Trading', 'Why is there a cap on how much I can make in one day?',
    'Because one outsized day tells us nothing about whether you can do it again. No single day may carry more than 40% of the profit target during an evaluation, or more than 30% of the profit on a funded account. The money stays in your balance; the day simply does not count towards passing.'],
  ['Trading', 'Is there a limit on a single trade?',
    'Yes. One closed trade may not lose more than 2% of the starting balance. It is the rule that stops a single position from deciding your evaluation.'],
  ['Trading', 'What happens the moment I breach something?',
    'Open positions are closed and the account moves to failed. You keep access to the full trade history, and you can restart the same account for half of what you originally paid.'],
  ['Trading', 'Any restriction on style, news or holding period?',
    'None. Scalp it, swing it through a policy announcement, hold as long as the session allows. We care about the limits, not the method.'],
  ['Trading', 'How many trading days do I need?',
    'Five days on which you actually placed a trade, in both the evaluation and before a payout. They do not need to be consecutive.'],

  // ── Money ───────────────────────────────────────────────────────────────
  ['Payouts', 'What share do I keep?',
    '80% on accounts funded through the 1-Step and 2-Step routes, 70% on Instant Funding. The difference reflects that Instant skips the evaluation entirely.'],
  ['Payouts', 'When can I request money?',
    'Once the account has been funded 14 days, has used five trading days, is up at least 5%, and no single day makes up more than 30% of that profit. Requests then run on a 14-day cycle.'],
  ['Payouts', 'How much can one request be?',
    'Up to 5% of the account size per request, paid in INR to a bank account in your own name. Third-party accounts are not paid.'],
  ['Payouts', 'What does an evaluation cost me in total?',
    'The fee on the pricing page, once. No monthly charge, no platform rent, no cut of a losing account, and no deduction from a payout beyond the profit share itself.'],
  ['Payouts', 'Is the fee refundable if I fail?',
    'No. It pays for the evaluation you took, not for its result. What a failed account does give you is a reset at half the original fee — and that half is calculated on the full fee, even if you bought with a coupon.'],
  ['Payouts', 'What does a reset do?',
    'Wipes every trade and returns the account to its starting balance and first phase. An Instant account resets straight back to funded, since it never had an evaluation to return to.'],

  // ── Account ─────────────────────────────────────────────────────────────
  ['Account', 'How do I start?',
    'Create an account with your email, verify it, and the practice environment opens immediately. Buying an evaluation is a separate, deliberate step.'],
  ['Account', 'How soon does an evaluation go live?',
    'As soon as the payment is approved — usually the same working day. You will see the account appear with its balance, objectives and limits already set.'],
  ['Account', 'How large can an account be?',
    'From ₹1 Lakh up to ₹25 Lakh depending on the programme. Scale up when your results, not your ambition, justify it.'],
  ['Account', 'Can I run more than one at a time?',
    'Yes. Each account carries its own balance, objectives and limits, and a breach on one does not touch another.'],
  ['Account', 'What do I get to see while trading?',
    'Live balance and equity, how much of the daily and overall limit is left, days traded, progress towards the target, and every trade you have taken — all in the dashboard, all live.'],
  ['Account', 'When is KYC needed?',
    'Only before your first payout, never to start an evaluation. PAN, Aadhaar and a bank account in your own name, verified digitally.'],
  ['Account', 'Does a funded account last forever?',
    'No. A funded account runs for 30 days, within which the payout cycles fall. It is a performance window, not a permanent seat.'],
  ['Account', 'Can I lose money I have already been paid?',
    'Never. A payout is settled and yours. The most an account can cost you is the fee you paid for it.'],
];

async function seedContentIfEmpty() {
  let faqs = 0;
  try {
    if ((await Faq.estimatedDocumentCount()) === 0) {
      await Faq.insertMany(
        FAQ_SEED.map(([category, question, answer], i) => ({ category, question, answer, order: i, enabled: true }))
      );
      faqs = FAQ_SEED.length;
    }
  } catch (e) {
    console.error('[contentSeed] failed:', e.message);
  }
  return { faqs, posts: 0 };
}

module.exports = { seedContentIfEmpty, FAQ_SEED };
