import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Map admin-defined Challenge docs into the phase/rule structure this page
// renders. stepsCount drives the layout: 0 = Instant (single phase), 1 = single
// qualifier, 2 = qualifier + validator.
function buildPhases(c) {
  const r = c.rules || {};
  const fmtPct = (v) => (v == null || v === '' ? null : `${v}%`);
  const fmtDays = (v) => (v == null || v === '' ? null : `${v} days`);
  const fmtBool = (v) => (v ? 'Allowed' : 'Not allowed');

  // Common rules shown on every phase block
  const baseRules = (target) => [
    target ? { key: 'Profit Target', value: target } : null,
    fmtPct(r.maxDailyDrawdownPercent) && { key: 'Daily loss limit', value: fmtPct(r.maxDailyDrawdownPercent) },
    fmtPct(r.maxOverallDrawdownPercent) && { key: 'Overall loss limit', value: fmtPct(r.maxOverallDrawdownPercent) },
    r.maxOneDayProfitPercentOfTarget != null && { key: 'Best-day cap', value: `${r.maxOneDayProfitPercentOfTarget}% of the target` },
    fmtDays(r.tradingDaysRequired) && { key: 'Minimum trading days', value: fmtDays(r.tradingDaysRequired) },
    { key: 'Trading through news', value: fmtBool(r.allowNewsTrading) }
  ].filter(Boolean);

  if (c.stepsCount === 2) {
    return [
      { label: 'Phase 1', rules: baseRules(fmtPct(r.profitTargetPhase1Percent)) },
      { label: 'Phase 2', rules: baseRules(fmtPct(r.profitTargetPhase2Percent)) }
    ];
  }
  if (c.stepsCount === 1) {
    return [{ label: 'One phase', rules: baseRules(fmtPct(r.profitTargetPhase1Percent)) }];
  }
  // Instant (0-step)
  return [{ label: 'No evaluation: funded straight away', rules: baseRules(fmtPct(r.profitTargetInstantPercent)) }];
}

function challengeTagline(c) {
  if (c.stepsCount === 0) return 'No evaluation phase. A funded account from day one, with tighter loss limits.';
  if (c.stepsCount === 1) return 'A single phase. Reach the target once to get funded.';
  return 'Two phases with targets of 8% and 5%, and the lowest entry fee.';
}

// "Which one should I pick" copy. Numbers match the live challenge rules
// (see data/programmes.js); update both if the admin changes a route.
const PICKS = [
  {
    who: 'If you want the most room',
    route: '2-Step Evaluation',
    body: 'Good for traders who are new to fixed rules or whose equity swings more. The 10% overall limit is the widest of the three, and the target comes in two smaller steps: 8%, then 5%. You get 60 days and the lowest fee at the ₹1 Lakh size. The trade-off is that you have to pass twice.',
  },
  {
    who: 'If you have a tested method',
    route: '1-Step Evaluation',
    body: 'Good for traders who already know their numbers and would rather prove them once. The target is 10% in a single phase with 45 days to reach it, but the overall limit is tighter at 8%. Once funded, the profit share is 80%, the same as the 2-Step.',
  },
  {
    who: 'If you keep losses small',
    route: 'Instant Funding',
    body: 'Good for disciplined traders who rarely lose more than a small slice of the account in a day. There is no qualifying phase, but the limits are the strictest: 3% a day and 6% overall. You need 5% profit before the first payout, the share is 70% and the fee is the highest of the three.',
  },
];

const DECIDE = [
  'If a normal losing day costs you more than 3% of your capital, Instant Funding will be hard to keep alive. Look at the 1-Step or the 2-Step.',
  'If your account has ever sat more than 8% below where it started before recovering, the 2-Step gives you more room than the 1-Step.',
  'If budget decides it, the 2-Step has the lowest entry fee. Compare every size on the pricing page.',
  'If you would rather skip the evaluation and can accept a 70% share, Instant Funding is the shortest road to a payout.',
];

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/prop/challenges`)
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.challenges)) {
          // Display order: Instant, 1-Step, 2-Step (Instant first as the
          // headline product).
          const order = { 0: 0, 1: 1, 2: 2 };
          const sorted = [...data.challenges].sort((a, b) => (order[a.stepsCount] ?? 9) - (order[b.stepsCount] ?? 9));
          setChallenges(sorted);
        }
      })
      .catch(() => { /* network/API failure leaves the list empty — we render an empty state */ })
      .finally(() => setLoading(false));
  }, []);

  return (
    <LandingShell>
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-12 md:pt-44 md:pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Challenges</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            Choose your prop firm challenge: <span className="text-[color:var(--pf-brand)]">2-Step, 1-Step or Instant</span>
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            All three routes trade the same NIFTY, BANKNIFTY and SENSEX options in a simulated
            account. What differs is how many phases you sit, how much you are allowed to lose on
            the way and what share of the profit you keep. The current rules for each route load
            below, straight from the platform.
          </p>
        </div>
      </section>

      {/* Challenges */}
      <section className="pb-16 md:pb-24 px-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {loading && (
            <div className="text-center text-[color:var(--pf-muted)] py-10">Loading challenges…</div>
          )}
          {!loading && challenges.length === 0 && (
            <div className="text-center text-[color:var(--pf-muted)] py-10">
              No challenges are listed at the moment. Try again shortly, or <Link to="/contact-us" className="text-[color:var(--pf-brand)] font-semibold hover:underline">contact us</Link>.
            </div>
          )}
          {!loading && challenges.map((c, idx) => {
            const phases = buildPhases(c);
            return (
              <div
                key={c._id || c.name}
                className={`rounded-2xl overflow-hidden border ${
                  idx === 0 ? 'border-[#1FD87A] shadow-[0_8px_40px_rgba(31,216,122,0.12)]' : 'border-[color:var(--pf-border)] shadow-[0_2px_16px_rgba(0,0,0,0.04)]'
                }`}
              >
                {/* Header */}
                <div className="px-6 sm:px-10 py-8 bg-[color:var(--pf-card-alt)] border-b border-[color:var(--pf-border)]">
                  <div className="flex flex-wrap items-baseline gap-3 mb-2">
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-[color:var(--pf-text)]" style={{ letterSpacing: '-0.02em' }}>{c.name}</h2>
                    <span className="text-sm text-[color:var(--pf-brand)] font-medium">{challengeTagline(c)}</span>
                  </div>
                  <p className="text-sm sm:text-base text-[color:var(--pf-muted)] leading-relaxed max-w-3xl">
                    {c.description || 'A simulated account with a profit target and two loss limits. Meet the target without crossing either limit and you earn a share of the profit.'}
                  </p>
                </div>

                {/* Phases */}
                <div className="divide-y divide-[color:var(--pf-border)]">
                  {phases.map((phase) => (
                    <div key={phase.label} className="px-6 sm:px-10 py-6">
                      <p className="text-xs font-bold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">{phase.label}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                        {phase.rules.map((rule) => (
                          <div key={rule.key}>
                            <p className="text-xs text-[color:var(--pf-muted)] mb-1">{rule.key}</p>
                            <p className="text-sm sm:text-base font-bold text-[color:var(--pf-text)]">{rule.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="px-6 sm:px-10 py-5 bg-[color:var(--pf-card-alt)] border-t border-[color:var(--pf-border)] flex flex-wrap gap-4 items-center justify-between">
                  <p className="text-sm text-[color:var(--pf-muted)]">Fees for every {c.name} account size</p>
                  <Link to="/pricing" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[color:var(--pf-brand)] text-white text-sm font-semibold hover:bg-[color:var(--pf-brand-2)] transition-all">
                    See pricing <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Which one to pick */}
      <section className="pb-16 md:pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-4">
            Which challenge <span className="text-[color:var(--pf-brand)]">should I pick?</span>
          </h2>
          <p className="text-base text-[color:var(--pf-muted)] leading-relaxed max-w-3xl mb-8">
            Start from how you trade, not from the fee. The right route is the one whose loss
            limits your normal bad days fit inside.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PICKS.map((p) => (
              <div key={p.route} className="bg-[color:var(--pf-card-alt)] border border-[color:var(--pf-border)] rounded-2xl p-6">
                <p className="text-xs font-bold text-[color:var(--pf-brand)] uppercase tracking-widest mb-2">{p.who}</p>
                <h3 className="text-lg font-bold text-[color:var(--pf-text)] mb-3">{p.route}</h3>
                <p className="text-sm text-[color:var(--pf-muted)] leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>

          <h3 className="text-lg font-bold text-[color:var(--pf-text)] mt-12 mb-4">A quick way to decide</h3>
          <ul className="space-y-3 max-w-3xl">
            {DECIDE.map((line) => (
              <li key={line} className="flex gap-3 items-start text-base text-[color:var(--pf-muted)] leading-relaxed">
                <span className="w-2 h-2 rounded-full shrink-0 mt-2.5 bg-[color:var(--pf-brand)]" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Rules on every route */}
      <section className="py-14 md:py-20 px-6 bg-[#0A2130]">
        <div className="max-w-4xl mx-auto">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-white mb-8 text-center">
            Rules that apply on every route
          </h2>
          <div className="space-y-5 max-w-3xl mx-auto">
            {[
              {
                t: 'Daily limit and overall limit',
                d: 'The daily limit resets at 9:15 AM every trading day. The overall limit never resets: it is a fixed floor below your starting balance. On a ₹1 Lakh 1-Step account that floor sits at ₹92,000 for the life of the account.',
              },
              {
                t: 'At least 5 trading days',
                d: 'We ask for five so that a pass reflects a repeatable approach and not one good session. The days can be spread out, and you can use as many as you like within the time window.',
              },
              {
                t: 'The 40% one-day cap',
                d: 'One day can count for at most 40% of the target. Anything above that stays in your balance but does not count towards passing. In Phase 1 of a ₹1 Lakh 2-Step, where the target is ₹8,000, that works out to ₹3,200 a day.',
              },
              {
                t: 'The payout consistency check',
                d: 'When a funded account asks for a payout, the best single day can make up at most 30% of the profit being paid. It is the one-day cap again, applied at the point money is paid out.',
              },
              {
                t: 'Trading on news days',
                d: 'Each card above shows whether news-day trading is allowed on that route. Where it is, RBI policy days, the Union Budget and company results are open to trade like any other session.',
              },
              {
                t: 'Intraday only',
                d: (
                  <>
                    Close every position by 3:15 PM IST. Nothing is carried overnight or over a weekend. Lot sizes
                    and session times for each index are on the{' '}
                    <Link to="/instruments" className="text-[color:var(--pf-brand)] font-semibold hover:underline">instruments page</Link>.
                  </>
                ),
              },
            ].map((item) => (
              <div key={item.t} className="border border-[rgba(255,255,255,0.08)] rounded-2xl p-5 sm:p-6 bg-[#0E2A3A]">
                <h3 className="text-base font-bold text-white mb-2">{item.t}</h3>
                <p className="text-sm text-[#9FB5AB] leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-6">
            Know which route you want?
          </h2>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] mb-8">
            The pricing page lists the fee for every account size on each route. Still deciding? Read{' '}
            <Link to="/how-it-works" className="text-[color:var(--pf-brand)] font-semibold hover:underline">how the evaluation works</Link>{' '}
            or the <Link to="/faqs" className="text-[color:var(--pf-brand)] font-semibold hover:underline">prop firm rules FAQ</Link>.
          </p>
          <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm shadow-[0_6px_20px_rgba(31,216,122,0.3)] hover:bg-[color:var(--pf-brand-2)] transition-all">
            See fees by account size <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
