import { Link } from 'react-router-dom';
import { ArrowRight, Banknote, Code2, Headphones, ShieldCheck } from 'lucide-react';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const milestones = [
  {
    date: 'June 2023',
    title: 'The conversation that started it all',
    desc: 'A late-night discussion between two Mumbai people about how Indian retail people never get a fair shot at real capital. The idea was simple — build the prop firm we wished existed.',
  },
  {
    date: 'October 2023',
    title: 'First prototype, built on weekends',
    desc: 'Our CTO started coding the simulated evaluation engine after office hours. No fancy office, just a Bandra apartment and a lot of chai. The first version handled NIFTY only.',
  },
  {
    date: 'February 2024',
    title: 'DhanFunded registered',
    desc: 'Officially incorporated under the Companies Act. Registered office in Mumbai. Got our PAN, GSTIN, and a proper bank account. The hobby became a real business.',
  },
  {
    date: 'May 2024',
    title: 'Beta launch with 50 people',
    desc: 'Invited 50 friends and friends-of-friends from learning communities to test the platform. Their feedback shaped the rules, the dashboard, and the payout process we use today.',
  },
  {
    date: 'August 2024',
    title: 'Payout process built end to end',
    desc: 'KYC, approval and INR bank transfer were wired together so a funded participant could be paid without anything being handled manually.',
  },
  {
    date: 'December 2024',
    title: 'Crossed 200 active people',
    desc: 'Feedback from early testers shaped the drawdown rules, the objectives dashboard and the payout cycle the platform runs on today.',
  },
  {
    date: 'February 2025',
    title: 'Moved into our first proper office',
    desc: 'Ten people, one floor, one big window facing the Mumbai skyline. The garage phase was over. We finally had a place to put a coffee machine.',
  },
  {
    date: '2026',
    title: 'DhanFunded opened to everyone',
    desc: 'The platform went live publicly on dhanfunded.com — 1-Step, 2-Step and Instant assessments on NIFTY, BANKNIFTY and SENSEX, with payouts in INR.',
  },
];

const reasons = [
  {
    title: 'We are Indian, top to bottom',
    desc: 'Built in India, registered in India, run by Indians. We understand SEBI rules, NSE/BSE quirks, and what Indian intraday people actually need — because we are them.',
  },
  {
    title: 'INR payments, INR payouts',
    desc: 'No FX conversion games. You pay in rupees, you get paid in rupees, straight to your Indian bank account. No PayPal, no crypto, no nonsense.',
  },
  {
    title: 'Transparent rules, no fine print',
    desc: 'Every rule is on the Challenges page. Every fee is on the Pricing page. We do not hide the consistency rule in clause 47 of a 30-page T&C document.',
  },
  {
    title: 'Real human support',
    desc: 'When you message us, an actual person replies. Usually within a few hours during market days. No chatbots pretending to be helpful.',
  },
  {
    title: 'We pay on time. Always.',
    desc: 'Payouts processed within 5–7 business days of approval. We have never delayed a single payout to date. This is the promise the entire business is built on.',
  },
  {
    title: 'Built for the long run',
    desc: 'We are not a flash-sale prop firm with US-style marketing tactics. We are building a platform that will be here in 2030. That changes how we make every decision.',
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
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Our Story</p>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-8">
            Why we started <span className="text-[color:var(--pf-brand)]">DhanFunded</span>
          </h2>
          <div className="space-y-5 text-base sm:text-lg text-[color:var(--pf-muted)] leading-relaxed">
            <p>
              In 2023, two of us were sitting at a chai stall in Bandra arguing about prop firms.
              We had both tried the foreign ones — paid the fee in dollars, dealt with the FX conversion,
              used instruments we did not understand, lost the account because the rules were written for
              someone else's market.
            </p>
            <p>
              The conversation kept coming back to one question: <em className="text-[color:var(--pf-text)] not-italic font-semibold">why does an Indian person
              have to jump through American hoops to get funded?</em> Indian people know NIFTY and BANKNIFTY
              better than anyone. They wake up at 9:00 AM IST, they follow index options, they live in INR.
              Why should they pay in USD and study S&P futures to prove their skill?
            </p>
            <p>
              So we built the prop firm we wished existed. INR payments. NIFTY, BANKNIFTY and SENSEX only.
              Indian market hours. Rules written in plain English. Payouts in your Indian bank account, not
              a Wise transfer that takes a week and eats 3% in fees.
            </p>
            <p>
              That is the whole pitch. We are not trying to be the biggest prop firm in the world. We just
              want to be the best one for Indian people.
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
            <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Our Journey</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }} className="text-white mb-4">
              From a chai stall to a funded prop firm
            </h2>
            <p className="text-base sm:text-lg text-[#9FB5AB]">
              The milestones that brought us here. No filters, no rounding up.
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
              Why professionals pick <span className="text-[color:var(--pf-brand)]">DhanFunded</span>
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
