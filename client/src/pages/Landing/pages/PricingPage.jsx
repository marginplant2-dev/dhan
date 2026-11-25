import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Tag } from 'lucide-react';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import PricingTable from '../components/PricingTable';
import { PROGRAMMES } from '../data/programmes';

// Static plan-level features per type — these describe the *experience* (KYC,
// payouts, support) rather than per-tier numbers, so they don't live in the
// admin Challenge schema. Edit here if marketing copy changes.
const FEATURES_BY_TAB = {
  'Instant': [
    'There is no qualifying phase. The account is funded from your first session.',
    'You trade options on three indices: NIFTY, BANKNIFTY and SENSEX.',
    'Every account size uses the same percentages. Only the rupee amounts change.',
    'Once your KYC is approved, payouts are sent to your bank account.',
    'Stuck on something? Message support on WhatsApp.'
  ],
  '1-Step': [
    'One evaluation phase. Reach the target once and a funded account follows.',
    'Options on the same three indices as every route: NIFTY, BANKNIFTY and SENSEX.',
    'The target, both loss limits and the day count are fixed before you pay.',
    'Trading on news days, like RBI policy or the Union Budget, is open.',
    'Funded profits are paid out in rupees to an Indian bank account.'
  ],
  '2-Step': [
    'Phase 1 is the Qualifier. Phase 2, the Validator, comes after it.',
    'At the ₹1 Lakh size, this is the lowest fee of the three routes.',
    'Options on NIFTY, BANKNIFTY and SENSEX, the same as the other routes.',
    'Phase 2 asks for a smaller profit target than Phase 1.',
    'Funded profits are paid out in rupees to an Indian bank account.'
  ]
};

// Rupee examples below are worked from PROGRAMMES (one source for the marketing
// pages). Display order matches the plan picker: 2-Step, 1-Step, Instant.
const EXAMPLE_ROWS = [
  { label: 'Profit target', value: (p) => p.target, sub: (p) => p.targetRupees },
  { label: 'Daily loss limit', value: (p) => p.daily, sub: (p) => p.dailyRupees },
  { label: 'Overall loss limit', value: (p) => p.overall, sub: (p) => p.overallRupees },
  { label: 'Time allowed', value: (p) => p.window },
  { label: 'Your profit share', value: (p) => p.split }
];

export default function PricingPage() {
  // Kept in sync with the plan picker below so the feature list matches the
  // plan type the visitor is looking at.
  const [tab, setTab] = useState('Instant');
  const [coupon, setCoupon] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);

  const applyCoupon = () => {
    const code = coupon.trim().toUpperCase();
    if (code) {
      setCoupon(code);
      setCouponApplied(true);
      setTimeout(() => setCouponApplied(false), 3000);
    }
  };

  return (
    <LandingShell>
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-12 md:pt-44 md:pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Pricing</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            Prop firm challenge fees, <span className="text-[color:var(--pf-brand)]">paid once</span>
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            Choose a route and an account size, then pay a single fee. GST is already in the price,
            nothing is billed again next month and there is no subscription to cancel. Accounts start
            at ₹1 Lakh, and the table below lists every size on sale today.
          </p>
        </div>
      </section>

      {/* Comparison table — same component the home page uses */}
      <PricingTable showHeading={false} onTabChange={setTab} className="pf-section--tight pb-4" />

      {/* What's included */}
      <section className="px-6 pb-16 md:pb-24">
        <div className="bg-[color:var(--pf-card-alt)] border border-[color:var(--pf-border)] rounded-2xl p-6 sm:p-8 max-w-3xl mx-auto">
          <h2 className="text-lg font-bold text-[color:var(--pf-text)] mb-2">
            Included with the {tab} plan
          </h2>
          <p className="text-sm text-[color:var(--pf-muted)] mb-5">These points hold for every account size in the plan.</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(FEATURES_BY_TAB[tab] || []).map((f) => (
              <li key={f} className="flex items-start gap-3">
                <Check size={16} className="text-[color:var(--pf-brand)] shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-sm text-[color:var(--pf-muted)]">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* What the fee buys */}
      <section className="px-6 pb-16 md:pb-24">
        <div className="max-w-3xl mx-auto">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-6">
            What your fee <span className="text-[color:var(--pf-brand)]">pays for</span>
          </h2>
          <div className="space-y-4 text-base text-[color:var(--pf-muted)] leading-relaxed">
            <p>
              The fee is the full cost of one attempt. It buys a simulated trading account of the size
              you chose, with the profit target and loss limits shown in the table, and a dashboard
              that tracks each objective while you trade. No order ever reaches NSE or BSE.
            </p>
            <p>
              Passing costs nothing extra. Clear the evaluation and a funded account is set up for
              you, and from then on you keep a share of the profit it makes: 80% on the 1-Step and
              2-Step routes, 70% on Instant Funding.
            </p>
            <p>
              A bigger account costs more because its targets and limits are bigger in rupees. The
              percentages stay the same at every size within a route, so the rules you read for
              ₹1 Lakh are the rules you trade at any size.
            </p>
          </div>
        </div>
      </section>

      {/* Worked rupee example */}
      <section className="py-14 md:py-24 px-6 bg-[color:var(--pf-card-alt)]">
        <div className="max-w-5xl mx-auto">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-4">
            A ₹1 Lakh account, <span className="text-[color:var(--pf-brand)]">worked out in rupees</span>
          </h2>
          <p className="text-base text-[color:var(--pf-muted)] leading-relaxed max-w-3xl mb-8">
            Each rule is a percentage of your starting balance. Percentages are easy to misjudge in
            the middle of a session, so here is what every route asks of a ₹1 Lakh account in rupees.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PROGRAMMES.map((p) => (
              <div key={p.key} className="bg-[color:var(--pf-card)] border border-[color:var(--pf-border)] rounded-2xl p-6">
                <h3 className="text-lg font-bold text-[color:var(--pf-text)] mb-4">{p.name}</h3>
                <dl className="space-y-3">
                  {EXAMPLE_ROWS.map((row) => (
                    <div key={row.label}>
                      <dt className="text-xs text-[color:var(--pf-muted)] mb-0.5">{row.label}</dt>
                      <dd className="text-sm font-bold text-[color:var(--pf-text)]">
                        {row.value(p)}
                        {row.sub && <span className="block text-xs font-medium text-[color:var(--pf-muted)] mt-0.5">{row.sub(p)}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          <div className="max-w-3xl mt-10 space-y-4 text-base text-[color:var(--pf-muted)] leading-relaxed">
            <p>
              The same maths works at any size. A ₹10 Lakh 1-Step account has a ₹1,00,000 target, a
              ₹40,000 daily loss limit and an ₹80,000 overall limit. A ₹5 Lakh 2-Step account needs
              ₹40,000 in Phase 1 and ₹25,000 in Phase 2, with ₹20,000 allowed per day and ₹50,000 in
              total.
            </p>
            <h3 className="text-lg font-bold text-[color:var(--pf-text)] pt-2">The one-day profit cap, in rupees</h3>
            <p>
              No single day can count for more than 40% of the target. On a ₹1 Lakh 1-Step, that is
              ₹4,000 of the ₹10,000 target. Make ₹6,000 in one session and the whole ₹6,000 stays in
              your balance, but only ₹4,000 of it counts towards passing. You would still need
              ₹6,000 of counted profit from other days, across at least 5 trading days in total.
            </p>
          </div>
        </div>
      </section>

      {/* Pass, breach or expiry */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-8">
            After you pay: <span className="text-[color:var(--pf-brand)]">pass, breach or time out</span>
          </h2>
          <div className="space-y-8 text-base text-[color:var(--pf-muted)] leading-relaxed">
            <div>
              <h3 className="text-lg font-bold text-[color:var(--pf-text)] mb-2">You reach the target</h3>
              <p>
                On the 2-Step, passing Phase 1 opens Phase 2, which starts again from the original
                balance with a 5% target. Clearing Phase 2, or the single phase of the 1-Step, moves
                you to a funded account. Instant Funding accounts are funded from the start, so their
                5% target is what stands between you and the first payout.
              </p>
              <p className="mt-3">
                Once funded, you request payouts from your dashboard every 14 days, after at least 5%
                profit on the account. Money is paid in rupees to your Indian bank account once KYC
                is done.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[color:var(--pf-text)] mb-2">You cross a loss limit</h3>
              <p>
                Going past the daily or the overall loss limit ends that account. Any open positions
                are closed automatically and no further trades can be placed on it. The fee covered
                that one attempt, so trying again means buying a new evaluation. Our{' '}
                <Link to="/refund-policy" className="text-[color:var(--pf-brand)] font-semibold hover:underline">refund policy</Link>{' '}
                explains when a fee can be returned.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[color:var(--pf-text)] mb-2">The time window closes</h3>
              <p>
                Every route has a set number of days, shown as the Assessment Window in the table:
                60 on the 2-Step, 45 on the 1-Step and 30 on Instant Funding. If the target has not
                been met when it closes, the account expires.
              </p>
            </div>
            <p>
              Still weighing up the routes? <Link to="/challenges" className="text-[color:var(--pf-brand)] font-semibold hover:underline">Compare the three challenges</Link>,
              read <Link to="/how-it-works" className="text-[color:var(--pf-brand)] font-semibold hover:underline">how the evaluation works</Link> step
              by step, or check <Link to="/instruments" className="text-[color:var(--pf-brand)] font-semibold hover:underline">lot sizes for NIFTY, BANKNIFTY and SENSEX</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* Coupon / Referral Section */}
      <section className="py-14 md:py-20 px-6 bg-[#0A2130]">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[rgba(31,216,122,0.15)] border border-[rgba(31,216,122,0.3)] mb-5">
            <Tag size={14} className="text-[color:var(--pf-brand)]" aria-hidden="true" />
            <span className="text-xs font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest">Coupon code</span>
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-white mb-4">
            Someone gave you a code? <span className="text-[color:var(--pf-brand)]">Enter it here.</span>
          </h2>
          <p className="text-base text-[#9FB5AB] mb-8 max-w-2xl mx-auto">
            Trading creators, mentors and other traders share referral codes. A code takes money
            off your fee, and the person who shared it is credited for sending you.
          </p>

          <div className="max-w-md mx-auto">
            <form
              onSubmit={(e) => { e.preventDefault(); applyCoupon(); }}
              className="flex gap-3"
            >
              <input
                type="text"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                placeholder="ENTER CODE"
                aria-label="Coupon code"
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                enterKeyHint="done"
                className="flex-1 min-w-0 px-5 py-3.5 rounded-full bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.12)] text-white text-base placeholder-[#9FB5AB] focus:outline-none focus:border-[#1FD87A] transition-all uppercase tracking-wider"
                style={{ fontSize: 16 }}
              />
              <button
                type="submit"
                className="px-6 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm hover:bg-[color:var(--pf-brand-2)] transition-all shrink-0"
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                Apply
              </button>
            </form>
            {couponApplied && (
              <p className="text-sm text-[#34D399] mt-3" role="status">
                Noted: "{coupon}". Enter it at checkout, where the discount is applied.
              </p>
            )}
            <p className="text-xs text-[#9FB5AB] mt-4">
              The code is validated at checkout. Partners who share codes are paid monthly.
            </p>
          </div>
        </div>
      </section>

      {/* Become an Affiliate / Influencer */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-6">
            Teach trading or run a market channel?
          </h2>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] mb-8 max-w-2xl mx-auto">
            Creators and trading educators in India can partner with us. You get a personal code to
            share with your audience, a dashboard listing the sign-ups made with it, and a monthly
            payout.
          </p>
          <Link to="/contact-us" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm shadow-[0_6px_20px_rgba(31,216,122,0.3)] hover:bg-[color:var(--pf-brand-2)] transition-all">
            Ask about partnering <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <p className="text-xs text-[color:var(--pf-muted)] mt-4">We usually reply within a day.</p>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
