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
    fmtPct(r.maxDailyDrawdownPercent) && { key: 'Daily Drawdown', value: fmtPct(r.maxDailyDrawdownPercent) },
    fmtPct(r.maxOverallDrawdownPercent) && { key: 'Max Drawdown', value: fmtPct(r.maxOverallDrawdownPercent) },
    r.maxOneDayProfitPercentOfTarget != null && { key: 'Max one-day profit', value: `${r.maxOneDayProfitPercentOfTarget}% of target` },
    fmtDays(r.tradingDaysRequired) && { key: 'Min Active Days', value: fmtDays(r.tradingDaysRequired) },
    { key: 'News-based participation', value: fmtBool(r.allowNewsTrading) }
  ].filter(Boolean);

  if (c.stepsCount === 2) {
    return [
      { label: 'Phase 1 — Qualifier', rules: baseRules(fmtPct(r.profitTargetPhase1Percent)) },
      { label: 'Phase 2 — Validator', rules: baseRules(fmtPct(r.profitTargetPhase2Percent)) }
    ];
  }
  if (c.stepsCount === 1) {
    return [{ label: 'Single phase', rules: baseRules(fmtPct(r.profitTargetPhase1Percent)) }];
  }
  // Instant (0-step)
  return [{ label: 'Funded from day one', rules: baseRules(fmtPct(r.profitTargetInstantPercent)) }];
}

function challengeTagline(c) {
  if (c.stepsCount === 0) return 'No evaluation. Get the account, start the same day.';
  if (c.stepsCount === 1) return 'One phase. Pass once and you\'re funded.';
  return 'Two phases, lower entry fee. Built for professionals.';
}

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
            Pick the path that <span className="text-[color:var(--pf-brand)]">fits your style</span>
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            Three challenges, one goal — get you funded. The rules are short, the numbers are
            published, and there are no hidden conditions.
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
            <div className="text-center text-[color:var(--pf-muted)] py-10">No challenges available right now. Please check back soon.</div>
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
                    {c.description || 'Participate in a simulated account provided by the platform. Follow the rules, hit the target, get paid.'}
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
                  <p className="text-sm text-[color:var(--pf-muted)]">Ready to take the {c.name.toLowerCase()}?</p>
                  <Link to="/pricing" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[color:var(--pf-brand)] text-white text-sm font-semibold hover:bg-[color:var(--pf-brand-2)] transition-all">
                    See pricing <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Notes */}
      <section className="py-14 md:py-20 px-6 bg-[#0A2130]">
        <div className="max-w-4xl mx-auto">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-white mb-8 text-center">
            A few things you should know
          </h2>
          <div className="space-y-5 max-w-3xl mx-auto">
            {[
              {
                t: 'Daily DD vs Max DD',
                d: 'Daily Drawdown resets every market day at 9:15 AM. Max Drawdown is the total loss limit from your peak — it never resets until you pass.',
              },
              {
                t: 'Why minimum active days?',
                d: 'We want consistency, not luck. Five days proves the strategy is repeatable. One lucky session does not make you a professional.',
              },
              {
                t: 'Max one-day profit rule',
                d: 'No single day can contribute more than 40% of your total target. This stops people from passing on one massive position.',
              },
              {
                t: 'Consistency rule (Instant only)',
                d: 'Your best market day cannot be more than 30% of total profits. Keeps the playing field fair for funded people.',
              },
              {
                t: 'News-based participation',
                d: 'Allowed on the 1-Step. Restricted on Instant accounts to manage risk. RBI policy, budget day, results — all fair game on 1-Step.',
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
            Made up your mind?
          </h2>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] mb-8">Head over to pricing, pick an account size, and let's get started.</p>
          <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm shadow-[0_6px_20px_rgba(31,216,122,0.3)] hover:bg-[color:var(--pf-brand-2)] transition-all">
            View Pricing <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
