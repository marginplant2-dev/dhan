import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, CalendarClock, Landmark, ShieldCheck } from 'lucide-react';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { PROGRAMMES } from '../data/programmes';

/**
 * NOTE: this page previously listed eight named payouts, three named
 * testimonials and headline stats ("₹47,00,000+ paid", "312 evaluations") that
 * had no counterpart in the database — the platform had processed zero payouts.
 * They were removed rather than restyled, and must not come back: every number
 * on this page has to be one the database or the published rules can back.
 *
 * As soon as real payouts are approved, populate `payouts` below (or wire it to
 * the withdrawals API) and the table replaces the ledger preview on its own.
 */

// Shares come from the programme config, so this page cannot drift from what
// the platform pays. It said "up to 95%" while every programme paid 80% or 70%.
const topSplit = Math.max(...PROGRAMMES.map((p) => parseInt(p.split, 10) || 0));
const splitSentence = PROGRAMMES.map((p) => `${p.split} on ${p.name}`).join(', ');

// Programme terms — facts from the published challenge config, not performance claims.
const highlights = [
  { value: `Up to ${topSplit}%`, label: 'Performance share on a funded account' },
  { value: 'Every 14 days', label: 'Payout cycle once funded' },
  { value: '₹50 Lakh', label: 'Maximum account size' },
  { value: 'INR', label: 'Paid directly to your Indian bank account' },
];

/** Real, approved payouts only. Empty until the first one is paid. */
const payouts = [];

// What each published payout row will show — the columns, not invented data.
const LEDGER_COLUMNS = [
  { Icon: BadgeCheck, title: 'Participant', body: 'Initials and city, published with consent' },
  { Icon: ShieldCheck, title: 'Programme', body: '2-Step, 1-Step or Instant Funding' },
  { Icon: Landmark, title: 'Payout', body: 'The exact amount transferred, in ₹' },
  { Icon: CalendarClock, title: 'Time to payout', body: 'Days from funding to transfer' },
];

const TRUSTPILOT_URL = 'https://www.trustpilot.com/review/dhanfunded.com';

export default function ResultsPage() {
  return (
    <LandingShell>
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-12 md:pt-44 md:pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Results</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            Every payout, published <span className="text-[color:var(--pf-brand)]">openly</span>.
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            No stock photos, no invented testimonials, no numbers we cannot back up. Each
            payout we approve is added here as it is transferred — so what you read on this
            page is exactly what funded traders have been paid.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="pb-12 md:pb-20 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-6">
          {highlights.map((h) => (
            <div key={h.label} className="border border-[color:var(--pf-border)] rounded-2xl p-6 text-center">
              <div className="text-2xl sm:text-3xl font-extrabold text-[color:var(--pf-text)] mb-2" style={{ letterSpacing: '-0.03em' }}>{h.value}</div>
              <p className="text-sm text-[color:var(--pf-muted)]">{h.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Payout ledger */}
      <section className="py-14 md:py-24 px-6 bg-[#0A2130]">
        <div className="max-w-5xl mx-auto">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-white mb-4 text-center">
            Payout <span className="text-[color:var(--pf-brand)]">ledger</span>
          </h2>
          <p className="text-base text-[#9FB5AB] text-center mb-8 md:mb-12">
            Privacy-first: initials and city only, published with the participant's consent.
          </p>

          {payouts.length === 0 ? (
            <div className="rounded-2xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] overflow-hidden">
              <div className="px-6 sm:px-10 pt-10 pb-8 text-center">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase bg-[rgba(52,211,153,0.12)] text-[#34D399]">
                  <span className="w-2 h-2 rounded-full bg-[#34D399] animate-pulse" />
                  Ledger open
                </span>
                <h3 className="text-xl sm:text-2xl font-extrabold text-white mt-5 mb-3" style={{ letterSpacing: '-0.02em' }}>
                  The first funded payouts will be published here
                </h3>
                <p className="text-sm sm:text-base text-[#9FB5AB] max-w-xl mx-auto leading-relaxed">
                  Every approved payout is added the day it is transferred — nothing backdated,
                  rounded up or staged. This is what each entry will show:
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-[rgba(255,255,255,0.08)]">
                {LEDGER_COLUMNS.map(({ Icon, title, body }, i) => (
                  <div
                    key={title}
                    className={`px-5 py-6 text-center ${i % 2 === 0 ? 'border-r' : 'lg:border-r'} ${i < 2 ? 'border-b lg:border-b-0' : ''} ${i === 3 ? 'lg:border-r-0' : ''} border-[rgba(255,255,255,0.08)]`}
                  >
                    <Icon size={20} className="mx-auto mb-2.5 text-[color:var(--pf-brand)]" />
                    <div className="text-sm font-bold text-white mb-1">{title}</div>
                    <div className="text-xs text-[#9FB5AB] leading-relaxed">{body}</div>
                  </div>
                ))}
              </div>

              <div className="px-6 py-7 border-t border-[rgba(255,255,255,0.08)] flex flex-col sm:flex-row gap-3 items-center justify-center">
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm hover:bg-[color:var(--pf-brand-2)] transition-all"
                >
                  Start your evaluation <ArrowRight size={15} />
                </Link>
                <a
                  href={TRUSTPILOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-7 py-3 rounded-full border border-[rgba(255,255,255,0.18)] text-white font-semibold text-sm hover:border-[rgba(255,255,255,0.4)] transition-all"
                >
                  Read reviews on Trustpilot
                </a>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.08)]">
                    <th className="text-xs font-semibold text-[#9FB5AB] uppercase tracking-wider pb-4">Participant</th>
                    <th className="text-xs font-semibold text-[#9FB5AB] uppercase tracking-wider pb-4">Plan</th>
                    <th className="text-xs font-semibold text-[#9FB5AB] uppercase tracking-wider pb-4">Payout</th>
                    <th className="text-xs font-semibold text-[#9FB5AB] uppercase tracking-wider pb-4">Duration</th>
                    <th className="text-xs font-semibold text-[#9FB5AB] uppercase tracking-wider pb-4">Month</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p, i) => (
                    <tr key={i} className="border-b border-[rgba(255,255,255,0.05)]">
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[color:var(--pf-brand)] flex items-center justify-center text-white text-xs font-bold shrink-0">{p.initials}</div>
                          <div>
                            <div className="text-sm font-semibold text-white">{p.name}</div>
                            <div className="text-xs text-[#9FB5AB]">{p.city}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-sm text-[#9FB5AB]">{p.plan}</td>
                      <td className="py-4 pr-4 text-sm font-bold text-[#34D399]">{p.amount}</td>
                      <td className="py-4 pr-4 text-sm text-[#9FB5AB]">{p.days}</td>
                      <td className="py-4 text-sm text-[#9FB5AB]">{p.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* How a payout actually happens */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-4 text-center">
            How a payout <span className="text-[color:var(--pf-brand)]">actually works</span>
          </h2>
          <p className="text-base text-[color:var(--pf-muted)] text-center max-w-2xl mx-auto mb-10 md:mb-14">
            The same rules apply to everyone, and they are enforced by the platform rather than decided case by case.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              ['Clear the assessment', 'Hit the performance target without breaching the daily or overall loss limit. The dashboard tracks every objective live.'],
              ['Get a funded account', `A funded account is issued with its own balance, with no second fee. Your performance share is ${splitSentence}.`],
              ['Request the payout', 'Once the account is at least 5% in profit over a minimum of 5 trading days, request a payout from your dashboard every 14 days. It is reviewed, then transferred in INR to your bank account.'],
            ].map(([title, body], i) => (
              <div key={title} className="border border-[color:var(--pf-border)] rounded-2xl p-6 sm:p-8">
                <div className="text-xs font-bold tracking-[.16em] text-[color:var(--pf-brand)] mb-3">STEP {i + 1}</div>
                <h3 className="text-base font-bold text-[color:var(--pf-text)] mb-2.5">{title}</h3>
                <p className="text-sm text-[color:var(--pf-muted)] leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 md:py-20 px-6 bg-[color:var(--pf-card-alt)]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-6">
            Be one of the first on the ledger
          </h2>
          <p className="text-base text-[color:var(--pf-muted)] mb-8">Start your evaluation, follow the rules with discipline, and earn real rewards.</p>
          <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm shadow-[0_6px_20px_rgba(31,216,122,0.3)] hover:bg-[color:var(--pf-brand-2)] transition-all">
            View Plans <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
