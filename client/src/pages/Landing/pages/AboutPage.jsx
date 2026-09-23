import { Link } from 'react-router-dom';
import { ArrowRight, Banknote, Code2, Headphones, ShieldCheck } from 'lucide-react';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

/**
 * This section used to be a dated founding story — an apartment, an office
 * move, headcount, "never delayed a payout". None of it was true of this
 * platform, and a page that takes money should not invent its own history.
 * What replaces it is how the thing actually works, which needs no dates.
 */
const milestones = [
  {
    date: 'The premise',
    title: 'Capital is not the scarce part',
    desc: 'Plenty of Indian traders have a method that works and an account too small for it to matter. What is missing is capital willing to back a tested process on the instruments they already trade.',
  },
  {
    date: 'The measure',
    title: 'A rule is only fair if you can read it first',
    desc: 'Every target, every limit and every payout condition is a rupee figure published before you pay, and the same figure your dashboard counts down while you trade. Nothing appears for the first time at payout.',
  },
  {
    date: 'The environment',
    title: 'Live prices, simulated capital',
    desc: 'Quotes come from NSE and BSE as they happen; orders stay inside the platform. The risk stays ours to carry, and we hold none of your trading capital.',
  },
  {
    date: 'The enforcement',
    title: 'The platform applies the limits, not a person',
    desc: 'Daily and overall limits are checked on every tick and acted on at the price that broke them. No reviewer decides afterwards whether your account survived.',
  },
  {
    date: 'The payout',
    title: 'Fixed cycle, fixed share, INR',
    desc: 'Fourteen days funded, five trading days used, 5% profit, and no single day carrying more than 30% of it. Meet those and your share goes to a bank account in your own name.',
  },
  {
    date: 'The scope',
    title: 'What we deliberately do not do',
    desc: 'No tips, no advice, no managed accounts, no forex or crypto, no monthly subscription. A narrow product is easier to keep honest than a broad one.',
  },
];

const reasons = [
  {
    title: 'One market, properly',
    desc: 'NIFTY, BANKNIFTY and SENSEX derivatives, Indian hours, Indian settlement. Better to cover one market well than list forty badly.',
  },
  {
    title: 'Rupees at both ends',
    desc: 'You pay in rupees and you are paid in rupees, into an account in your own name. Nothing is converted, so nothing is lost converting it.',
  },
  {
    title: 'Limits you can quote back to us',
    desc: 'Targets, drawdowns, the one-day cap and the payout conditions live on the pricing and challenge pages. A rule that is not written there is not applied to your account.',
  },
  {
    title: 'A person reads your message',
    desc: 'Support is email, phone and WhatsApp, answered by people who can open your account and tell you which tick broke which limit.',
  },
  {
    title: 'Judged by numbers alone',
    desc: 'No interview, no sales call, no discretionary approval. Your objectives either clear inside the limits or they do not.',
  },
  {
    title: 'Built to stay narrow',
    desc: 'No upsells, no subscription, and no promise that the rules bend for a good week. The product is an evaluation and a payout.',
  },
];

/**
 * The page previously listed four named executives with photographs and
 * biographies. None of them corresponded to a real person — one card even
 * paired "Venkata Srinivas" with a file named Rajesh.jpeg. Invented leadership
 * on a page that charges people money is the kind of claim that gets a payment
 * gateway pulled, so it is replaced with the functions that genuinely exist.
 *
 * When there are real people to name, put them back: name, role, a one-line
 * background that can be verified, and their own photograph.
 */
const functions = [
  {
    icon: 'risk',
    title: 'Risk and rules',
    body: 'Every drawdown limit, profit target and consistency check is set here and enforced by the platform itself — not applied by hand, and not adjusted per account.',
  },
  {
    icon: 'engineering',
    title: 'Platform engineering',
    body: 'The simulated evaluation engine, the order flow, the live NSE and BSE feeds, and the dashboards that show you where you stand against each rule.',
  },
  {
    icon: 'payouts',
    title: 'Payouts and KYC',
    body: 'Verification of funded participants, review of payout requests against the published cycle, and the bank transfer itself in INR.',
  },
  {
    icon: 'support',
    title: 'Support',
    body: 'Questions on rules, assessments and account status — answered by email at support@dhanfunded.com, usually the same working day.',
  },
];

export default function AboutPage() {
  return (
    <LandingShell>
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-14 md:pt-44 md:pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">About Us</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            We started this because nobody else was <span className="text-[color:var(--pf-brand)]">building it for India</span>
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            DhanFunded Edutech Services is a homegrown prop firm evaluation
            platform. Built in Mumbai, run by Indians, for Indian intraday people.
          </p>
        </div>
      </section>

      {/* Why we started */}
      <section className="py-14 md:py-20 px-6 bg-[color:var(--pf-card-alt)]">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Why this exists</p>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-8">
            What this platform is <span className="text-[color:var(--pf-brand)]">DhanFunded</span>
          </h2>
          <div className="space-y-5 text-base sm:text-lg text-[color:var(--pf-muted)] leading-relaxed">
            <p>
              Most funded-trader programmes an Indian trader can reach were built for a different
              market. The fee is charged in dollars, the instruments are someone else's index, and
              the rules are tuned to a session that opens when ours has closed.
            </p>
            <p>
              The question that produced this platform was a narrow one:
              <em className="text-[color:var(--pf-text)] not-italic font-semibold"> what would an evaluation
              look like if it were designed around NIFTY, BANKNIFTY and SENSEX from the first line?</em>
              Indian hours. Contracts traders here already follow. Limits quoted in rupees rather than
              converted into them.
            </p>
            <p>
              That is what this is. One market, covered properly. Fees and payouts in INR to an Indian
              bank account. Every target and limit published before you pay, and enforced by the platform
              rather than argued about afterwards.
            </p>
            <p>
              It is not built to be the largest programme available. It is built to be the one whose
              rules an Indian index trader can read, plan around and hold us to.
            </p>
          </div>
        </div>
      </section>

      {/* Office / Team Photos */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-16">
            <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Our Office</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-4">
              The people, the place, the work
            </h2>
            <p className="text-base sm:text-lg text-[color:var(--pf-muted)]">
              A small team building rules-based assessments for Indian index markets.
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
                alt="A team working together over laptops and notes"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Growth Journey / Milestones */}
      <section className="py-14 md:py-24 px-6 bg-[#0A2130]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-16">
            <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">How it works</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }} className="text-white mb-4">
              How this platform is put together
            </h2>
            <p className="text-base sm:text-lg text-[#9FB5AB]">
              No founding legend — just the six decisions the product is built on.
            </p>
          </div>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-3 sm:left-4 top-2 bottom-2 w-px bg-[rgba(255,255,255,0.1)]" />

            <div className="space-y-8">
              {milestones.map((m, i) => (
                <div key={i} className="relative pl-12 sm:pl-16">
                  {/* Dot */}
                  <div className="absolute left-0 top-2 w-6 sm:w-8 h-6 sm:h-8 rounded-full bg-[color:var(--pf-brand)] border-4 border-[#0A2130] flex items-center justify-center">
                    <span className="text-[10px] sm:text-xs font-bold text-white">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <p className="text-xs font-bold text-[color:var(--pf-brand)] uppercase tracking-widest mb-1">{m.date}</p>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{m.title}</h3>
                  <p className="text-sm sm:text-base text-[#9FB5AB] leading-relaxed">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-16">
            <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Why Us</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-4">
              Why traders stay with <span className="text-[color:var(--pf-brand)]">DhanFunded</span>
            </h2>
            <p className="text-base sm:text-lg text-[color:var(--pf-muted)]">
              No marketing fluff. These are the actual reasons people stick with us.
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

      {/* Team */}
      <section className="py-14 md:py-24 px-6 bg-[color:var(--pf-card-alt)]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 md:mb-16">
            <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">How it is run</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-4">
              What the team handles
            </h2>
            <p className="text-base sm:text-lg text-[color:var(--pf-muted)]">A small team. Every part of the platform has someone accountable for it.</p>
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
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-6">
            Want to be part of the next milestone?
          </h2>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] mb-8">Pick an account size, clear the assessment, and trade funded capital on NIFTY, BANKNIFTY and SENSEX.</p>
          <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm shadow-[0_6px_20px_rgba(31,216,122,0.3)] hover:bg-[color:var(--pf-brand-2)] transition-all">
            View Plans <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
