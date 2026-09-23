import { ArrowRight, BadgeCheck, CircleCheck, LineChart, Wallet } from 'lucide-react';

const STEPS = [
  {
    n: '01', Icon: CircleCheck, tile: 'pf-tile--brand', title: 'Clear the Assessment',
    desc: 'Finish the phase your programme asks for, inside its limits, with at least five trading days used.',
  },
  {
    n: '02', Icon: BadgeCheck, tile: 'pf-tile--ink', title: 'Get Your Pro Account',
    desc: 'Objectives are verified and the funded account appears in your dashboard — usually the same working day.',
    badge: 'Under 24 hours',
  },
  {
    n: '03', Icon: LineChart, tile: 'pf-tile--green', title: 'Perform',
    desc: 'Trade the funded account against its own limits, which are tighter than the evaluation on two of the three programmes.',
    badge: '14-day cycle',
  },
  {
    n: '04', Icon: Wallet, tile: 'pf-tile--soft', title: 'Request Payouts',
    desc: 'Once the cycle and conditions are met, raise the request from the dashboard and take your share in INR.',
    badge: 'Every 14 days',
  },
];

export default function ProcessSteps() {
  return (
    <section className="pf-section pf-section--alt">
      <div className="pf-wrap">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="pf-eyebrow mb-4">After you pass</p>
          <h2 className="pf-h2">After you pass</h2>
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
