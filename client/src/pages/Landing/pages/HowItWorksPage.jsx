import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

// Inline link inside the guide's paragraphs.
const L = ({ to, children }) => (
  <Link to={to} className="font-semibold text-[color:var(--pf-brand)] underline underline-offset-2">{children}</Link>
);

const h2Style = { fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' };

/* Figures match data/programmes.js (verified against the challenges
   collection). Rupee examples are worked out on a ₹1 Lakh account. */
const steps = [
  {
    number: '01',
    title: 'Create your account',
    body: [
      'Register with your email address and confirm it. The practice environment opens right away, so you can get used to the order screen and the dashboard before you spend anything.',
      'No KYC is needed at this stage. Identity checks only come up when you ask for your first payout.',
    ],
  },
  {
    number: '02',
    title: 'Choose a programme and an account size',
    body: [
      'There are three programmes. The 2-Step Evaluation has two profit targets and the lowest fee, from ₹3,000. The 1-Step Evaluation has one higher target and costs from ₹3,800. Instant Funding, from ₹4,900, has no evaluation at all: you get a funded account once payment is approved, with stricter loss limits and a 70% profit share instead of 80%.',
      <>Account sizes run from ₹1 Lakh to ₹25 Lakh, depending on the programme. A sensible way to choose is to look at the daily loss limit in rupees for each size and pick one where your normal losing day fits well inside it. Every size and fee is listed on the <L to="/pricing">pricing page</L>, and the <L to="/challenges">challenges page</L> puts the three programmes next to each other.</>,
      <>You pay the fee once. It is not refunded, except where a payment went wrong, as the <L to="/refund-policy">refund policy</L> explains. The evaluation starts as soon as the payment is approved, which is usually the same working day.</>,
    ],
  },
  {
    number: '03',
    title: 'Learn what you can trade, and when',
    body: [
      <>You trade NIFTY, BANKNIFTY and SENSEX options, and you can buy or sell them. Trades use simulated money at live market prices; nothing is sent to the exchange. The <L to="/instruments">instruments page</L> covers each index in more detail.</>,
      'Orders open at 9:15 AM IST. At 3:15 PM IST every open position is squared off automatically, so nothing is carried overnight or over a weekend. Futures, copy trading and algorithmic execution are not allowed. Leverage is capped at 100x, and no single trade may lose more than 2% of the account, which is ₹2,000 on ₹1 Lakh.',
    ],
  },
  {
    number: '04',
    title: 'Work out your target and loss limits in rupees',
    body: [
      'Take a ₹1 Lakh 2-Step Evaluation. Phase 1 asks for 8% profit, or ₹8,000. Phase 2 asks for 5%, or ₹5,000. In both phases the daily loss limit is 4% (₹4,000) and the overall loss limit is 10% (₹10,000), so in Phase 1 your account value may not fall below ₹90,000. The evaluation window is 60 days.',
      'The daily limit counts losses on open positions, not only trades you have closed. A position sitting ₹4,000 in the red can end the account even before you exit it.',
      'One more rule shapes how you pace yourself: no single day may count for more than 40% of the phase target. In Phase 1 that is ₹3,200, which is 40% of ₹8,000. Profit above that is not taken away and stays in your balance, but the pass waits until the rule is met.',
      'The other programmes use the same rules with different numbers. On ₹1 Lakh, the 1-Step needs ₹10,000 (10%) inside a ₹4,000 daily limit and an ₹8,000 overall limit, over 45 days. Instant Funding needs ₹5,000 (5%) profit before a payout, with a ₹3,000 daily limit and a ₹6,000 overall limit.',
    ],
  },
  {
    number: '05',
    title: 'Pass the evaluation',
    body: [
      'A phase is passed when you reach its target, have traded on at least five separate days, and have stayed inside both loss limits and the 40% day rule. On the 2-Step, passing Phase 1 opens Phase 2, and passing Phase 2 completes the evaluation. The 1-Step has only the one phase.',
      'If you cross a loss limit, or the evaluation runs past its allowed days, that account ends. You can reset a failed account for half the original fee. The half is worked out on the full fee, even if you bought with a coupon.',
    ],
  },
  {
    number: '06',
    title: 'Trade your funded account',
    body: [
      'Once the final phase is passed, a funded account is created in your dashboard automatically. It is the same size as the account you passed and starts from a fresh balance. Instant Funding accounts begin at this step.',
      'The funded account carries its own daily and overall loss limits, shown on the dashboard, and the same intraday rules as before: index options only, everything squared off at 3:15 PM IST, no overnight positions.',
    ],
  },
  {
    number: '07',
    title: 'Complete KYC',
    body: [
      'Before the first payout you verify who you are. Keep your PAN, your Aadhaar and the details of a bank account in your own name ready. Verification is done digitally.',
    ],
  },
  {
    number: '08',
    title: 'Request your payout',
    body: [
      'A payout request can be raised once four conditions are met: the account has been funded for 14 days, you have traded on at least five days, profit has reached 5% of the account size, and no single day makes up more than 30% of that profit. After that, you can ask again every 14 days.',
      'An example: a ₹1 Lakh funded account from the 2-Step shows ₹6,000 profit. Your best day can be no more than ₹1,800, which is 30% of ₹6,000. Your 80% share comes to ₹4,800. On Instant Funding the share is 70%, so the same profit would pay ₹4,200.',
      <>You raise the request from the dashboard. It is checked against the conditions above, then paid in rupees to your bank account by UPI or bank transfer. More detail on payouts is on the <L to="/faqs">FAQs page</L>.</>,
    ],
  },
];

const rules = [
  { label: 'Daily loss limit', value: '3% – 4%', desc: '4% on the 1-Step and 2-Step, 3% on Instant Funding. Losses on open positions count towards it.' },
  { label: 'Overall loss limit', value: '6% – 10%', desc: '10% on the 2-Step, 8% on the 1-Step and 6% on Instant Funding. Crossing it ends the account.' },
  { label: 'Profit target', value: '5% – 10%', desc: '8% and then 5% on the 2-Step, 10% on the 1-Step, and 5% before a payout on Instant Funding.' },
  { label: 'Intraday cut-off', value: '3:15 PM', desc: 'Open trades are closed for you at 3:15 PM IST. Holding overnight or over a weekend is not possible.' },
  { label: 'Trading days needed', value: '5 days', desc: 'Trades on five separate days, both to pass an evaluation and to qualify for a payout.' },
  { label: 'What you can trade', value: 'NIFTY, BANKNIFTY, SENSEX', desc: 'Index options, bought or sold. No futures, no copy trading and no algorithmic execution.' },
];

export default function HowItWorksPage() {
  return (
    <LandingShell>
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-14 md:pt-44 md:pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Step-by-step guide</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            How our prop firm <span className="text-[color:var(--pf-brand)]">evaluation works</span>
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            This guide follows one account from registration to the money reaching your bank, with
            rupee figures for a ₹1 Lakh account at each stage. If you want a funded trading account
            in India, these are the steps in the order they happen.
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="py-12 md:py-20 px-6 bg-[color:var(--pf-card-alt)]">
        <div className="max-w-4xl mx-auto">
          <h2 style={h2Style} className="text-[color:var(--pf-text)] text-center mb-4">
            Eight steps from sign-up to <span className="text-[color:var(--pf-brand)]">payout</span>
          </h2>
          {steps.map((step, i) => (
            <div key={step.number} className={`flex flex-col md:flex-row gap-6 md:gap-12 py-12 ${i < steps.length - 1 ? 'border-b border-[color:var(--pf-border)]' : ''}`}>
              <div className="shrink-0">
                <span className="text-sm font-bold text-[color:var(--pf-brand)]">{step.number}</span>
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-[color:var(--pf-text)] mb-3">{step.title}</h3>
                {step.body.map((para, j) => (
                  <p key={j} className="text-base text-[color:var(--pf-muted)] leading-relaxed max-w-xl mb-4 last:mb-0">{para}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Rules */}
      <section className="py-14 md:py-24 px-6 bg-[#0A2130]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 md:mb-16">
            <h2 style={h2Style} className="text-white mb-4">
              The rules <span className="text-[color:var(--pf-brand)]">at a glance</span>
            </h2>
            <p className="text-base sm:text-lg text-[#9FB5AB]">Ranges cover all three programmes. Each account size has its own rupee figures on the pricing page.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {rules.map((r) => (
              <div key={r.label} className="bg-[#0E2A3A] border border-[rgba(255,255,255,0.08)] rounded-2xl p-6 sm:p-8">
                <h3 className="text-sm font-normal text-[#9FB5AB] mb-2">{r.label}</h3>
                <div className="text-2xl sm:text-3xl font-extrabold text-white mb-3" style={{ letterSpacing: '-0.03em' }}>{r.value}</div>
                <p className="text-sm text-[#9FB5AB] leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 style={h2Style} className="text-[color:var(--pf-text)] mb-6">
            Rules clear? <span className="text-[color:var(--pf-brand)]">Pick your programme.</span>
          </h2>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] mb-8">Fees start at ₹3,000, paid once, with every limit shown in rupees before you check out.</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm shadow-[0_6px_20px_rgba(31,216,122,0.3)] hover:bg-[color:var(--pf-brand-2)] transition-all">
              See fees and sizes <ArrowRight size={16} />
            </Link>
            <Link to="/faqs" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-[color:var(--pf-border)] text-[color:var(--pf-text)] font-semibold text-sm hover:border-[color:var(--pf-brand)] hover:text-[color:var(--pf-brand)] transition-all">
              Read the FAQs
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
