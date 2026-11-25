import { Link } from 'react-router-dom';
import { ArrowRight, Banknote, Code2, Headphones, ShieldCheck } from 'lucide-react';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

/**
 * No founding story, headcount, office address or named team on this page:
 * none of that can be verified, and a page that takes money should not invent
 * its own history. It describes how the platform works instead. Every figure
 * comes from data/programmes.js or the server's rule defaults.
 *
 * When there are real people to name, add them: name, role, a one-line
 * background that can be verified, and their own photograph.
 */
const facts = [
  {
    label: 'Simulated',
    title: 'Your orders never reach an exchange',
    desc: 'Prices stream live from NSE and BSE, but every order is filled by DhanFunded’s own engine. Nothing you place touches the real market. The only real money involved is the fee you pay and the payouts we send.',
  },
  {
    label: 'Not a broker',
    title: 'No broking, no advice, no managed money',
    desc: 'DhanFunded is not a stockbroker, an investment adviser or a portfolio manager, and it is not registered with SEBI. We give no tips or research calls and never hold your trading capital.',
  },
  {
    label: 'Published rules',
    title: 'Every limit is written down in rupees',
    desc: 'Profit targets, daily and overall loss limits, the 2% cap on one trade, the consistency rule and the payout conditions are on the challenges and pricing pages before you pay. Your dashboard tracks the same numbers live.',
  },
  {
    label: 'Enforcement',
    title: 'Software applies the limits, not a person',
    desc: 'Loss limits are checked on every price tick, and an account that crosses one is closed at that price. Positions still open at 3:15 PM IST are squared off automatically. Nobody reviews a breach later and decides your fate by hand.',
  },
  {
    label: 'Payouts',
    title: 'A fixed schedule, paid in INR',
    desc: 'After 14 days funded, five trading days and 5% profit, with no single day above 30% of it, you can request a payout every 14 days. Each request can be up to 5% of the account size, sent after KYC to a bank account in your name.',
  },
  {
    label: 'Scope',
    title: 'What you will not find here',
    desc: 'Forex, crypto, commodities, foreign indices, futures, overnight positions, copy trading, algos or a monthly subscription. A narrow product is easier to check and easier to keep honest.',
  },
];

const reasons = [
  {
    title: 'Only Indian index options',
    desc: 'NIFTY, BANKNIFTY and SENSEX, traded in Indian market hours. The platform is not spread across forty markets it cannot cover well.',
  },
  {
    title: 'Rupees in, rupees out',
    desc: 'Fees start at ₹3,000 for a ₹1 Lakh 2-Step evaluation, paid once. Payouts land in an Indian bank account in your name, with no currency conversion either way.',
  },
  {
    title: 'Rules you can hold us to',
    desc: 'If a rule is not written on the challenges or pricing page, it is not applied to your account. You can quote the page back to us.',
  },
  {
    title: 'Passed on numbers only',
    desc: 'There is no interview, sales call or manual approval. The target and the limits decide whether an evaluation is passed.',
  },
  {
    title: 'A reset costs half',
    desc: 'A failed account can be restarted for 50% of its original fee, so on a ₹3,000 evaluation a reset is ₹1,500, not another full fee.',
  },
  {
    title: 'Support that can see your account',
    desc: 'Email, phone and WhatsApp are answered by the support team, who can look up your account and show you which trade crossed which limit.',
  },
];

const functions = [
  {
    icon: 'risk',
    title: 'Rules and risk',
    body: 'Sets the target, loss limits and consistency rule for each programme. The trading engine applies them the same way to every account; nobody changes them for one trader.',
  },
  {
    icon: 'engineering',
    title: 'Trading platform',
    body: 'Runs the simulated order engine, the live NSE and BSE price feeds, and the dashboard showing your balance, equity and how much of each limit is left.',
  },
  {
    icon: 'payouts',
    title: 'KYC and payouts',
    body: 'Checks PAN, Aadhaar and bank details before a first payout, matches each request to the 14-day cycle, and sends the money in rupees.',
  },
  {
    icon: 'support',
    title: 'Trader support',
    body: 'Answers questions about rules, accounts and payouts. Write to support@dhanfunded.com; replies usually come the same working day.',
  },
];

const H2 = { fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' };
const LINK = 'text-[color:var(--pf-brand)] font-semibold hover:underline';

export default function AboutPage() {
  return (
    <LandingShell>
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-14 md:pt-44 md:pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">About DhanFunded</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            An Indian prop trading firm for <span className="text-[color:var(--pf-brand)]">NIFTY, BANKNIFTY and SENSEX</span> traders
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            DhanFunded tests how you trade on a simulated account at live prices. Pass the published
            rules and you get a funded account, with your share of its profit paid in rupees.
          </p>
        </div>
      </section>

      {/* What it is / who it is for */}
      <section className="py-14 md:py-20 px-6 bg-[color:var(--pf-card-alt)]">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">What we do</p>
          <h2 style={H2} className="text-[color:var(--pf-text)] mb-8">
            What DhanFunded is, and <span className="text-[color:var(--pf-brand)]">who it suits</span>
          </h2>
          <div className="space-y-5 text-base sm:text-lg text-[color:var(--pf-muted)] leading-relaxed">
            <p>
              DhanFunded is an evaluation platform for retail traders in India who trade index options.
              You choose a programme and an account size from ₹1 Lakh, pay a one-time fee in
              rupees, and trade NIFTY, BANKNIFTY and SENSEX options on a simulated account that moves
              with live NSE and BSE prices.
            </p>
            <p>
              Each evaluation has a profit target and two loss limits. On a ₹1 Lakh 2-Step account,
              Phase 1 asks for ₹8,000 of profit and Phase 2 for ₹5,000, without losing more
              than ₹4,000 in a day or ₹10,000 in total. Pass both and you trade a funded
              account where you keep 80% of the profit. The{' '}
              <Link to="/challenges" className={LINK}>1-Step, 2-Step and Instant Funding routes</Link> are
              compared side by side, and the{' '}
              <Link to="/how-it-works" className={LINK}>step-by-step guide</Link> shows what happens from
              payment to payout.
            </p>
            <p>
              <em className="text-[color:var(--pf-text)] not-italic font-semibold">It suits traders who
              already have a tested method</em> and want to be paid for running it with discipline. If you
              are still working one out, start on the free practice account instead of a paid evaluation.
            </p>
            <p>
              It is not a course, a tips service, a broker or a fund manager, and an evaluation result is
              not a promise of future profit. The{' '}
              <Link to="/risk-disclaimer" className={LINK}>risk disclaimer</Link> sets out exactly what a
              simulated account is and is not.
            </p>
          </div>
        </div>
      </section>

      {/* Photos */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-16">
            <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Indian hours</p>
            <h2 style={H2} className="text-[color:var(--pf-text)] mb-4">
              Built around the Indian trading day
            </h2>
            <p className="text-base sm:text-lg text-[color:var(--pf-muted)]">
              The indices you already follow, the session you already trade, and every limit quoted in rupees.
            </p>
          </div>

          {/* Photo grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <div className="md:col-span-2 aspect-[16/10] rounded-2xl overflow-hidden bg-[color:var(--pf-card-alt)] border border-[color:var(--pf-border)] flex items-center justify-center relative">
              <img
                src="/landing/img/about-markets.jpg"
                loading="lazy"
                decoding="async"
                alt="Index charts on a laptop and phone beside printed candlestick sheets"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="aspect-[16/10] md:aspect-auto rounded-2xl overflow-hidden bg-[color:var(--pf-card-alt)] border border-[color:var(--pf-border)] flex items-center justify-center relative">
              <img
                src="/landing/img/about-team.jpg"
                loading="lazy"
                decoding="async"
                alt="People working together over laptops and notes"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* How it is run */}
      <section className="py-14 md:py-24 px-6 bg-[#0A2130]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-16">
            <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Before you sign up</p>
            <h2 style={H2} className="text-white mb-4">
              Six things to know about how DhanFunded runs
            </h2>
            <p className="text-base sm:text-lg text-[#9FB5AB]">
              What the platform is, what it is not, and how rules and payouts are enforced.
            </p>
          </div>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-3 sm:left-4 top-2 bottom-2 w-px bg-[rgba(255,255,255,0.1)]" />

            <div className="space-y-8">
              {facts.map((m, i) => (
                <div key={m.title} className="relative pl-12 sm:pl-16">
                  {/* Dot */}
                  <div className="absolute left-0 top-2 w-6 sm:w-8 h-6 sm:h-8 rounded-full bg-[color:var(--pf-brand)] border-4 border-[#0A2130] flex items-center justify-center">
                    <span className="text-[10px] sm:text-xs font-bold text-white">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <p className="text-xs font-bold text-[color:var(--pf-brand)] uppercase tracking-widest mb-1">{m.label}</p>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{m.title}</h3>
                  <p className="text-sm sm:text-base text-[#9FB5AB] leading-relaxed">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Reasons */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-16">
            <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">The practical side</p>
            <h2 style={H2} className="text-[color:var(--pf-text)] mb-4">
              Why Indian index traders pick <span className="text-[color:var(--pf-brand)]">DhanFunded</span>
            </h2>
            <p className="text-base sm:text-lg text-[color:var(--pf-muted)]">
              Each point comes from how the platform is set up, and you can check every one before paying.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {reasons.map((r, i) => (
              <div key={r.title} className="bg-[color:var(--pf-card)] border border-[color:var(--pf-border)] rounded-2xl p-6 sm:p-8 shadow-[0_2px_16px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)] transition-all">
                <span className="text-sm font-bold text-[color:var(--pf-brand)]">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="text-lg font-bold text-[color:var(--pf-text)] mt-3 mb-3">{r.title}</h3>
                <p className="text-sm sm:text-base text-[color:var(--pf-muted)] leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team functions */}
      <section className="py-14 md:py-24 px-6 bg-[color:var(--pf-card-alt)]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 md:mb-16">
            <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Who does what</p>
            <h2 style={H2} className="text-[color:var(--pf-text)] mb-4">
              The four jobs behind every account
            </h2>
            <p className="text-base sm:text-lg text-[color:var(--pf-muted)]">
              Questions go to whoever owns that part. For phone and WhatsApp details, see the{' '}
              <Link to="/contact-us" className={LINK}>contact page</Link>.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {functions.map((f) => (
              <div key={f.title} className="bg-[color:var(--pf-card)] border border-[color:var(--pf-border)] rounded-2xl p-6 sm:p-8 flex gap-5 items-start">
                <span
                  aria-hidden="true"
                  className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center"
                  style={{ background: 'var(--pf-brand-soft)', color: 'var(--pf-brand)' }}
                >
                  {f.icon === 'risk' && <ShieldCheck size={22} />}
                  {f.icon === 'engineering' && <Code2 size={22} />}
                  {f.icon === 'payouts' && <Banknote size={22} />}
                  {f.icon === 'support' && <Headphones size={22} />}
                </span>
                <div>
                  <h3 className="text-lg font-bold text-[color:var(--pf-text)] mb-2">{f.title}</h3>
                  <p className="text-sm text-[color:var(--pf-muted)] leading-relaxed">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 style={{ ...H2, lineHeight: 1.1 }} className="text-[color:var(--pf-text)] mb-6">
            Read the rules, then decide
          </h2>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] mb-8">
            Check the fee and limits for each account size, or look through the{' '}
            <Link to="/faqs" className={LINK}>questions traders ask most</Link> first.
          </p>
          <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm shadow-[0_6px_20px_rgba(31,216,122,0.3)] hover:bg-[color:var(--pf-brand-2)] transition-all">
            See fees by account size <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
