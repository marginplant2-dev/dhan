/**
 * One-time seed for the admin-managed FAQ + Blog content. Mirrors the copy that
 * used to be hardcoded on the public /faqs and /blog pages so switching to the
 * DB-driven version shows the SAME content. Seeds only when a collection is
 * empty, so admin edits/deletes are never overwritten on restart.
 */
const Faq = require('../models/Faq');
const BlogPost = require('../models/BlogPost');

const FAQ_SEED = [
  // General
  ['General', 'What is DhanFunded?', 'DhanFunded is a simulated prop firm evaluation platform built for Indian intraday traders. You trade with virtual capital under defined rules and earn rewards upon successful completion. We are not a broker and do not execute live trades on NSE or BSE.'],
  ['General', 'How does DhanFunded work?', 'You choose an account size, follow the trading rules, and demonstrate consistent performance. Based on your performance, you gain access to larger trading capital and reward opportunities.'],
  ['General', 'Is DhanFunded a real trading platform?', 'DhanFunded operates in a simulated trading environment designed for skill evaluation and learning. It does not execute trades in live markets on your behalf — the market data is real, but the orders never reach the exchange.'],
  ['General', 'Is this legal in India?', 'Yes. DhanFunded operates as a simulated evaluation platform. It is not a broker or SEBI-registered intermediary. Simulated trading is legal in India. We provide a skill evaluation service, not investment advice or brokerage services.'],
  ['General', 'Who is this platform for?', 'This platform is built for serious Indian intraday traders who want to prove their trading discipline and earn performance-based rewards without risking their own capital. Whether you trade NIFTY, BANKNIFTY or SENSEX — if you have a consistent strategy, this is for you.'],
  ['General', 'Is this suitable for beginners?', 'Yes. DhanFunded is designed for both beginners and experienced traders. Beginners can start with smaller account sizes and gradually scale up as they gain confidence and consistency.'],
  ['General', 'Why choose DhanFunded over others?', 'Transparent rules, fast onboarding, Indian market focus, scalable account sizes and a structured evaluation system. DhanFunded is built specifically for Indian traders who want to grow with discipline and proper risk management.'],
  ['General', 'Is DhanFunded safe and trustworthy?', 'We focus on transparency, clear rules and structured processes to build a reliable ecosystem for traders. Every fee, rule, drawdown limit and payout timeline is published up-front. We prioritise fairness and long-term trust over short-term marketing tactics.'],
  // Trading
  ['Trading', 'Which instruments can I trade?', 'You can trade NIFTY, BANKNIFTY, and SENSEX options — both buying and selling are supported. Futures, overnight positions, copy trading and algo trading are not allowed. All trading happens in a simulated environment with real-time market data.'],
  ['Trading', 'What are the risk rules?', 'Each plan has a Max Daily Loss limit (3-5%), a Max Total Drawdown limit (8-12%), and mandatory intraday square-off at 3:15 PM IST. Breaking any rule disqualifies the current evaluation. These rules are designed to promote disciplined trading.'],
  ['Trading', 'What is the loss limit?', 'Each account comes with predefined risk parameters — a daily loss limit and an overall drawdown limit. Both are shown in your dashboard from day one and they exist to enforce disciplined trading and proper risk management.'],
  ['Trading', 'What happens if I break a rule?', 'If you breach the daily loss limit, max drawdown, or fail to close positions by 3:15 PM, your evaluation is disqualified. You can purchase a new plan and restart. There are no penalties beyond losing the evaluation attempt.'],
  ['Trading', 'Can I trade anytime during market hours?', 'Yes. You can trade during official Indian market hours (9:15 AM to 3:15 PM IST) using whichever style suits your strategy, as long as you follow the platform rules. All positions must be squared off before 3:15 PM.'],
  ['Trading', 'Can I use my own trading strategy?', 'Yes. You are free to use your own strategy as long as it follows the platform guidelines and risk-management rules. Discretionary trading is encouraged; copy trading and algo trading are not permitted.'],
  ['Trading', 'Is the market data real?', 'Yes, we use real-time market data feeds from NSE. However, all orders are simulated — no actual trades are placed on the exchange. This gives you a realistic experience without real market risk.'],
  // Payouts
  ['Payouts', 'How do I get paid?', 'After passing the evaluation and completing KYC verification, you become eligible for performance-based rewards paid directly to your verified Indian bank account. Payouts are processed within 5-7 business days.'],
  ['Payouts', 'How are profits shared?', 'DhanFunded offers profit-sharing of up to 80% of simulated profits, rewarding traders based on performance. The exact split depends on your plan tier and is shown before purchase.'],
  ['Payouts', 'Can I withdraw profits anytime?', 'Profit withdrawals follow a structured payout schedule designed to ensure consistency and fair usage. Specific timelines and conditions are clearly defined in your dashboard so you always know when the next withdrawal window opens.'],
  ['Payouts', 'Is there any hidden fee involved?', 'No. DhanFunded follows a transparent pricing model. All fees are clearly mentioned before you purchase any account — there are no recurring charges, no FX conversion fees and no surprise deductions on payouts.'],
  ['Payouts', 'Is my evaluation fee refundable?', 'Evaluation fees are non-refundable except in case of payment errors. However, upon successful completion and first approved payout, your evaluation fee benefit is credited back as part of your reward.'],
  ['Payouts', 'What is the profit split?', 'Traders who successfully pass the evaluation receive up to 80% of the simulated profits as performance rewards. The exact split depends on your plan tier and is clearly stated before purchase.'],
  // Account
  ['Account', 'How do I create an account?', 'Click "Get Started" on any page, fill in your basic details (name, email, phone), verify your email, and you are ready to purchase an evaluation plan. The entire process takes less than 2 minutes.'],
  ['Account', 'How long does it take to get started?', 'Account setup and activation typically happen within 24 hours of payment, so you can start your trading challenge quickly without unnecessary waiting.'],
  ['Account', 'How much capital can I access?', 'Depending on the plan, you can access trading capital up to ₹25,00,000 and beyond, allowing you to scale your trading potential without risking large personal funds.'],
  ['Account', 'Do I need prior trading experience to join?', 'No, but having basic knowledge of trading helps. Beginners can start with smaller account sizes and improve their skills while learning risk management on the platform.'],
  ['Account', 'How do I track my performance?', 'You get access to a dashboard where you can monitor profit and loss, current risk-limit usage, full trade history and your progress toward the profit target — all updated in real time.'],
  ['Account', 'What documents do I need for KYC?', 'You will need a valid PAN card, Aadhaar card, and a bank account in your name. KYC is required only after you pass the evaluation and before your first payout. We verify these digitally.'],
  ['Account', 'Can I have multiple evaluations at once?', 'Yes, you can run multiple evaluation accounts simultaneously. Each plan operates independently with its own rules, capital, and tracking.'],
  ['Account', 'Is there any max payout cap per account?', 'Yes. The maximum withdrawal cap is 10% of the account size per funded account. For example, on a ₹25,00,000 account the maximum withdrawal is ₹2,50,000. Payouts are split into 14-day cycles within the 30-day funded account life.']
];

const BLOG_SEED = [
  {
    slug: 'best-prop-firm-india-2026', category: 'Prop Firm Guide', readTime: '10 min read', date: 'June 6, 2026', featured: true,
    title: 'Best Prop Firm in India 2026: How to Choose a Funded Trading Challenge',
    excerpt: 'Looking for the best prop firm in India and the best prop challenge to get funded? Here is an honest, no-hype guide to what actually matters — INR payouts, transparent rules, and reliable funding — so you pick the right platform.',
    body: [
      'If you are searching for the best prop firm in India or the best prop trading challenge in 2026, you have probably noticed there are dozens of options and almost no honest comparisons. Most "top prop firm" lists are paid placements. This guide is different — it explains exactly what to look for so you can judge any Indian prop firm, including DhanFunded, on facts rather than marketing.',
      'First, what is a prop trading challenge? A proprietary trading firm gives skilled traders access to its capital. You pay a one-time evaluation fee, take a challenge with clear rules (a profit target, a maximum loss, and a minimum number of trading days), and if you pass you get a funded account. You then trade and keep the majority of the profits as a payout. For Indian traders, the key is that the best prop firm pays in INR directly to an Indian bank account — no USD conversion, no foreign gateways.',
      'What makes a prop firm "the best" for India? Five things. One: INR-based fees and payouts, so you are not losing money to currency conversion. Two: instruments you actually trade — NIFTY, BANKNIFTY and SENSEX futures and options, not just forex. Three: transparent, plainly-written rules with no hidden consistency or hedging traps. Four: a published, reliable payout process with a fixed profit split. Five: account sizes that can scale your edge — from ₹1 Lakh up to ₹50 Lakhs.',
      'Equally important is what to avoid. Be cautious of firms that hide their rules until after you pay, that bury a "consistency rule" or "hedging restriction" that disqualifies most traders, that delay payouts beyond their published timeline, or that only show influencer screenshots instead of a clear, repeatable payout process. A good prop firm publishes its rules, its profit split, and its payout timeline up front and does not change them after you pass.',
      'How does DhanFunded fit this checklist? It is a fully INR-based evaluation platform built specifically for Indian intraday traders. You trade NIFTY, BANKNIFTY and SENSEX in a structured simulated environment using real market data, with 1-Step, 2-Step and Instant funding options and account sizes up to ₹50 Lakhs. The rules — profit target, daily drawdown, overall drawdown, minimum trading days, and the one-day-profit cap — are written in plain English and visible before you buy. Payouts are in INR to your verified Indian bank account on a published timeline.',
      'Our honest advice: do not choose a prop firm because an influencer recommended it. Read the full rule set, make sure you can afford the evaluation fee, and confirm the payout terms before you trade a single rupee. The best prop challenge for you is the one whose rules match your trading style and whose payout process you can verify. If you trade Indian indices intraday and want INR funding with transparent rules, DhanFunded is built exactly for that — but the right move is always to read the rules first and start with a plan you have already tested.'
    ]
  },
  {
    slug: 'best-nifty-prop-trading-challenge-india', category: 'NIFTY Trading', readTime: '9 min read', date: 'June 10, 2026',
    title: 'Best NIFTY Prop Trading Challenge: How to Get a Funded NIFTY Account in India',
    excerpt: 'Want a funded NIFTY account? This guide covers the best NIFTY prop trading challenge format, the exact rules you need to pass, and how to trade NIFTY, BANKNIFTY and SENSEX on firm capital with INR payouts.',
    body: [
      'NIFTY is the single most-traded index in India, so it is no surprise that "best NIFTY prop trading challenge" and "NIFTY funded account India" are among the most common searches from serious intraday traders. The idea is simple: instead of risking your own savings on NIFTY, you pass an evaluation that proves your skill and trade the index on a firm-funded account, keeping most of the profit.',
      'A NIFTY prop challenge is a structured evaluation. You get a simulated account of a fixed size — say ₹5 Lakhs or ₹10 Lakhs — and a set of rules. A typical rule set is: hit a profit target (often 8-10%), never breach the daily drawdown (3-4%) or the overall drawdown (10%), and trade for a minimum number of days. Pass cleanly and the account converts to a funded account that pays real performance payouts.',
      'To pass a NIFTY challenge, strategy matters far less than discipline. The traders who pass are not the ones with the best entries — they are the ones who size positions correctly and respect the daily loss cap. On a ₹10 Lakh account with a 4% daily limit, that is ₹40,000 of room; smart traders stop themselves at half of that. Trade one instrument well rather than opening NIFTY, BANKNIFTY and SENSEX at once — Indian indices are correlated, and a single news event can move all three against you.',
      'What should the best NIFTY funded account offer in India? INR fees and INR payouts, the actual NSE/BSE index products (NIFTY, BANKNIFTY, SENSEX futures and options), leverage and lot sizes that match the exchange, transparent rules with no hidden disqualifiers, and a published payout timeline. If a firm cannot show you these clearly before you pay, keep looking.',
      'DhanFunded runs exactly this kind of evaluation for Indian index traders. You trade NIFTY, BANKNIFTY and SENSEX in a simulated environment driven by real market data, choose from 1-Step, 2-Step or Instant funding, and scale up to a ₹50 Lakh account. Every rule — profit target, daily and overall drawdown, minimum trading days, and the per-day profit cap — is shown up front, and approved payouts are paid in INR straight to your Indian bank account.',
      'If you are an Indian intraday trader with a tested NIFTY or BANKNIFTY strategy, a funded challenge is the most efficient way to scale your edge without risking your own capital. Start with an account size you are comfortable with, read the rules end to end, trade your plan, and treat the daily drawdown as a hard line you never cross. That discipline — not a magic indicator — is what turns a NIFTY prop challenge into a funded account and a steady INR payout.'
    ]
  },
  {
    slug: 'how-prop-firms-work', category: 'Prop Firm Basics', readTime: '8 min read', date: 'April 22, 2025',
    title: 'How Prop Firms Work — A Complete Guide for Indian Traders',
    excerpt: 'Prop firms give skilled traders access to firm capital instead of forcing them to risk their own savings. The trader passes a structured evaluation that proves their discipline, the firm provides the capital, and they share the profits.',
    body: [
      'A proprietary trading firm — or "prop firm" — is a company that gives traders access to its own capital to trade. Instead of using your savings, you trade with firm money. In return, the firm keeps a share of the profits and the trader keeps the rest. This model has existed for decades on Wall Street; the modern retail prop firm simply opened it up to anyone who can prove their skill.',
      'The way it works is simple. You pay a one-time evaluation fee to take a challenge. The challenge has clear rules — a profit target you have to hit, a maximum loss you cannot cross, and a minimum number of trading days. If you pass, you get a funded account. If you do not, you can buy another evaluation and try again.',
      'For Indian traders specifically, prop firms solve a real problem: most retail traders never have enough capital to scale their strategy. A trader with a ₹50,000 account who makes 5% a month is a great trader, but ₹2,500 a month does not change anyone\'s life. The same trader on a ₹10,00,000 funded account is making ₹50,000 a month — and now we are talking about a real income.',
      'At DhanFunded, the entire evaluation is simulated. We do not place real orders on NSE or BSE. The market data is real, the rules are real, the payouts are real — but the trading environment is a simulator built specifically for evaluating skill. That is why we can offer this service legally as an educational and evaluation platform.'
    ]
  },
  {
    slug: 'risk-management-funded-traders', category: 'Risk Management', readTime: '10 min read', date: 'April 18, 2025',
    title: 'Best Risk Management Practices for Funded Traders',
    excerpt: 'The traders who pass evaluations and keep their funded accounts are not the ones with the best entries. They are the ones who never let a single trade ruin their day. Risk management is the only edge that compounds.',
    body: [
      'Every funded trader who has held an account for more than three months will tell you the same thing: the goal is not to make the most money on a winning day. The goal is to lose the least on a losing day. Drawdown limits exist for a reason, and the traders who respect them are the ones who survive.',
      'The first rule we recommend is the 1% rule. Never risk more than 1% of your account on a single trade. On a ₹10,00,000 funded account, that is ₹10,000 of risk. If your stop-loss is 20 points away on NIFTY futures, that math forces a smaller position size — which is exactly the point.',
      'The second rule is the daily loss cap. Every challenge at DhanFunded has a Daily Drawdown limit (3-4%). Hit that limit and you are out. Smart traders set their personal daily stop at half the official limit. If the rule is 4%, you stop at 2%. That margin of safety is what protects you from one bad day turning into a disqualified evaluation.',
      'The third — and least talked about — rule is position concentration. Never have more than two open positions at once during evaluation. We see traders open NIFTY long, BANKNIFTY long, and SENSEX long simultaneously, then watch all three move against them on a single news event. Diversification is a myth in correlated Indian indices. Trade one thing well.',
      'Risk management is boring. That is the entire point. Boring traders pass evaluations. Exciting traders blow them up.'
    ]
  },
  {
    slug: 'why-traders-fail-challenges', category: 'Trader Psychology', readTime: '11 min read', date: 'April 14, 2025',
    title: 'Common Reasons Traders Fail Prop Firm Challenges',
    excerpt: 'After watching hundreds of evaluations, the same patterns keep showing up. Most failures have nothing to do with strategy. They are mistakes of impatience, oversizing, and ignoring the rules everyone agreed to before starting.',
    body: [
      'We track every evaluation that runs on the platform. After 312 successful passes and several hundred failures, the patterns are remarkably consistent. The vast majority of traders fail for one of five reasons — and almost none of them involve a bad strategy.',
      'Reason one: oversizing. A trader gets two losses in a row, doubles their position size to "make it back," and breaches the daily drawdown on the third trade. This is the single most common failure mode. The fix is mechanical — your position size is locked at the start of the day, and you do not change it until the next session.',
      'Reason two: revenge trading. After a losing trade, the trader immediately enters another trade without setup confirmation. Their next move is emotional, not technical. By the third revenge trade, they have crossed the daily limit. The fix is to walk away from the screen for 30 minutes after any loss bigger than 1%.',
      'Reason three: ignoring the time-of-day pattern. Indian intraday markets have rhythms. The first 15 minutes are choppy, lunchtime is dead, and the last hour can be violent. Traders who try to scalp at 1:30 PM almost always overtrade and lose to commissions and noise.',
      'Reason four: not reading the rules. We have had traders breach the consistency rule on Instant accounts because they did not know it existed. They had one massive day that contributed 60% of their total profit. The 30% consistency cap kicked in and the account was disqualified. Read the rules. They are short. They are written in plain English.',
      'Reason five: chasing news events. RBI policy day, budget day, results — these are not days for evaluation trading. The volatility looks like opportunity but is actually a tax on traders who think they can predict the unpredictable. Stay flat or trade tiny size.'
    ]
  },
  {
    slug: 'how-payouts-work', category: 'Payouts', readTime: '9 min read', date: 'April 8, 2025',
    title: 'How Payouts Work at DhanFunded',
    excerpt: 'You passed the evaluation. Now what? Here is exactly how payouts work — KYC, processing time, profit split, and how the money gets to your bank account. No marketing fluff, just the actual process.',
    body: [
      'The payout process at DhanFunded begins the moment you finish your evaluation with a passing result. You will get a notification on your registered email and inside the dashboard. From there, the process is in four clear stages.',
      'Stage one is KYC verification. We need a self-attested copy of your PAN card, your Aadhaar card, and a cancelled cheque or bank statement showing your name and account number. This usually takes 24 to 48 hours to verify. We do this digitally — there is no in-person meeting, no notarisation, nothing complicated. Once verified, your KYC stays on file for all future payouts.',
      'Stage two is the cooling period. After your evaluation passes, there is a 7-day cooling period before the first payout becomes available. This exists to make sure the result is genuine and not the outcome of a single lucky session. If you trade during this period and stay within the rules, the cooling period is part of your trading record.',
      'Stage three is the profit split. DhanFunded pays out up to 80% of simulated profits depending on your plan tier. The split is fixed and visible in your dashboard from day one. We do not change it after you pass. We do not have hidden fees that reduce the payout amount.',
      'Stage four is the bank transfer. Payouts go directly to your verified Indian bank account through IMPS or NEFT. The money usually lands in 24 to 48 hours after we initiate the transfer. We do not use foreign payment gateways, we do not deduct USD conversion fees, and we do not delay payouts beyond the published timeline. To date, every single payout we have promised has been paid on time.',
      'Your evaluation fee is also credited back as part of your first approved payout. So if you paid ₹12,600 for the 5L 1-Step plan, that ₹12,600 comes back to you on the first payout cycle. After that, every subsequent payout is pure profit share.'
    ]
  },
  {
    slug: 'psychology-consistent-traders', category: 'Trader Psychology', readTime: '12 min read', date: 'April 2, 2025',
    title: 'The Psychology of Consistent Traders',
    excerpt: 'Consistency in trading is 90% mental and 10% technical. The traders who survive and thrive are not the ones who found the perfect indicator. They are the ones who learned to manage themselves before managing the market.',
    body: [
      'In trading, consistency is rarer than profitability. Plenty of traders make money. Very few do it consistently for years. The difference is almost entirely psychological — the ability to follow your own rules even when your emotions are screaming at you to break them.',
      'The first habit of consistent traders is process orientation. They do not measure success by the P&L of a single day. They measure it by whether they followed their plan. A losing day where they followed their rules is a good day. A winning day where they got lucky is a warning sign. This sounds backwards until you have lived it for a year.',
      'The second habit is journaling. Every consistent trader we have worked with keeps a written record. Not a fancy spreadsheet — just notes after each session. What did I plan to trade? What did I actually trade? Why did I deviate? The patterns become obvious after 30 days of honest journaling.',
      'The third habit is detachment from individual trades. Consistent traders do not get attached to outcomes. They take the setup, place the trade, and accept whatever the market delivers. If they win, fine. If they lose, fine. The next trade gets the same treatment. This emotional flatness is not natural — it is built through deliberate practice.',
      'The fourth habit is acceptance of small wins. Consistent traders are happy with 0.5% to 1% per day on average. They do not chase 5% days. They know that compounding 0.5% over 200 trading days produces a return that no single big day can match — and it does so without the drawdown that big swings always bring.',
      'The hardest part is patience with the process. Most traders who fail in the first three months would have made it if they had stayed disciplined for six. The market does not reward speed. It rewards staying power.'
    ]
  },
  {
    slug: 'funded-vs-personal-capital', category: 'Strategy', readTime: '13 min read', date: 'March 26, 2025',
    title: 'Funded Capital vs Personal Capital — Which Is Right for You?',
    excerpt: 'Trading your own money feels different from trading firm capital. The risk is real, the emotions are sharper, the constraints are different. Here is an honest comparison so you can choose what fits your situation.',
    body: [
      'Most retail traders eventually face this question: should I trade my own money, or should I get funded? Both paths have real advantages and real costs. The right choice depends on your capital position, your risk tolerance, and your discipline level.',
      'Trading your own capital gives you complete control. There are no rules except the ones you set. You can hold positions overnight, you can scale into trades, you can take a 5% loss and recover next month. The downside is obvious — every loss is real, and most retail traders do not have the capital base to compound meaningfully. A 30% return on a ₹2,00,000 account is ₹60,000 a year. Useful, but not life-changing.',
      'Funded trading flips this. You get access to capital you could not afford to deploy yourself, but you trade under rules. Daily drawdown caps, profit targets, intraday-only restrictions on most plans. The freedom is constrained, but the upside is multiplied. A 30% return on a ₹10,00,000 funded account at 80% profit split is ₹2,40,000 a year — for the trader. That is meaningful income.',
      'There is also a psychological layer. When you trade your own money, every loss feels personal. It is your savings, your bills, your future. That emotional weight makes most retail traders worse, not better. Funded capital removes this weight. You still want to trade well — your livelihood depends on staying funded — but a single losing day does not threaten your family\'s grocery budget. That separation often makes traders more disciplined, not less.',
      'The honest answer is most serious traders do both. They keep a personal account for long-term positions and full creative freedom, and they use a funded account to scale their best intraday strategies. The funded account becomes a cash flow stream. The personal account becomes a wealth-building stream. Different goals, different tools.',
      'If you are an Indian intraday trader with a tested strategy and the discipline to follow rules, a funded account is the most efficient way to scale your edge. If you are still learning, work on your own capital first. The rules of a prop firm will expose any weakness in your strategy faster than the market alone ever will.'
    ]
  }
];

async function seedContentIfEmpty() {
  let faqs = 0;
  let posts = 0;
  try {
    if ((await Faq.estimatedDocumentCount()) === 0) {
      await Faq.insertMany(
        FAQ_SEED.map(([category, question, answer], i) => ({ category, question, answer, order: i, enabled: true }))
      );
      faqs = FAQ_SEED.length;
    }
    if ((await BlogPost.estimatedDocumentCount()) === 0) {
      await BlogPost.insertMany(
        BLOG_SEED.map((p, i) => ({
          slug: p.slug,
          title: p.title,
          excerpt: p.excerpt,
          body: p.body.join('\n\n'),
          category: p.category,
          readTime: p.readTime,
          date: p.date,
          order: i,
          featured: !!p.featured,
          enabled: true
        }))
      );
      posts = BLOG_SEED.length;
    }
  } catch (e) {
    console.error('[contentSeed] failed:', e.message);
  }
  return { faqs, posts };
}

module.exports = { seedContentIfEmpty, FAQ_SEED, BLOG_SEED };
