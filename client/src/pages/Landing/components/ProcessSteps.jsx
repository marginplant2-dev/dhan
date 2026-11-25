import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, CircleCheck, LineChart, Wallet } from 'lucide-react';

const STEPS = [
  {
    n: '01', Icon: CircleCheck, tile: 'pf-tile--brand', title: 'Pass the final phase',
    desc: 'Meet the last profit target inside its limits, with trades on at least five separate days. Instant Funding has no evaluation, so it starts at step two.',
  },
  {
    n: '02', Icon: BadgeCheck, tile: 'pf-tile--ink', title: 'Funded account goes live',
    desc: 'It appears in your dashboard at the size you passed, with a fresh balance and its own daily and overall loss limits.',
    badge: 'Under 24 hours',
  },
  {
    n: '03', Icon: LineChart, tile: 'pf-tile--green', title: 'Qualify for a payout',
    desc: 'Stay funded for 14 days, trade on five of them, reach 5% profit, and make sure no single day is more than 30% of that profit.',
    badge: '14-day cycle',
  },
  {
    n: '04', Icon: Wallet, tile: 'pf-tile--soft', title: 'Get paid in rupees',
    desc: 'Complete KYC, then request from the dashboard. With ₹5,000 profit on a ₹1 Lakh account, an 80% share is ₹4,000 to your bank.',
    badge: 'Every 14 days',
  },
];

export default function ProcessSteps() {
  return (
    <section className="pf-section pf-section--alt">
      <div className="pf-wrap">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="pf-eyebrow mb-4">Funded accounts</p>
          <h2 className="pf-h2 mb-5">How prop firm payouts work here</h2>
          <p className="pf-lead">
            You keep 80% of the profit on 1-Step and 2-Step accounts and 70% on Instant Funding.
            The exact conditions are listed in the{' '}
            <Link to="/faqs" className="font-semibold text-[color:var(--pf-brand)] underline underline-offset-2">payout FAQs</Link>.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ n, Icon, tile, title, desc, badge }, i) => (
            <article key={n} className="pf-card pf-card--hover p-6 relative flex flex-col">
              <div className="flex items-start justify-between mb-5">
                <span className={`pf-tile ${tile}`}><Icon size={21} /></span>
                <span className="pf-numeral">{n}</span>
              </div>
              <h3 className="pf-h3 mb-3">{title}</h3>
              <p className="pf-body">{desc}</p>
              {badge && <span className="pf-chip pf-chip--outline mt-5 self-start">{badge}</span>}

              {/* connector arrow between cards (desktop only) */}
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="hidden lg:grid place-items-center absolute top-1/2 -right-[13px] w-6 h-6 rounded-full -translate-y-1/2 z-10"
                  style={{ background: 'var(--pf-card)', border: '1px solid var(--pf-border)', color: 'var(--pf-brand)' }}
                >
                  <ArrowRight size={13} />
                </span>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
