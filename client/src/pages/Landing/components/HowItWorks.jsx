import { Target, Trophy, UserPlus, Wallet } from 'lucide-react';

/* ── the little illustration that sits at the bottom of each step card ───── */
function FormSkeleton() {
  return (
    <div className="pf-inset p-4 space-y-2.5">
      <div className="h-2.5 rounded-full" style={{ background: 'var(--pf-border)', width: '72%' }} />
      <div className="h-2.5 rounded-full" style={{ background: 'var(--pf-border)', width: '90%' }} />
      <div className="h-9 rounded-lg mt-3.5" style={{ background: 'var(--pf-brand)' }} />
    </div>
  );
}

function ScoreGauge() {
  const pct = 0.85;
  const r = 34, c = Math.PI * r; // half-circle circumference
  return (
    <div className="pf-inset p-4 grid place-items-center">
      <svg viewBox="0 0 100 56" className="w-[132px]">
        <path d="M14 48 A34 34 0 0 1 86 48" fill="none" stroke="var(--pf-border)" strokeWidth="7" strokeLinecap="round" />
        <path
          d="M14 48 A34 34 0 0 1 86 48" fill="none" stroke="var(--pf-brand)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        />
        <text x="50" y="45" textAnchor="middle" fontSize="19" fontWeight="800" fill="var(--pf-text)">8.5</text>
      </svg>
      <span className="pf-small -mt-1">Discipline score / 10</span>
    </div>
  );
}

function FundedBadge() {
  return (
    <div className="pf-inset p-4 grid place-items-center gap-2" style={{ minHeight: 118 }}>
      <Trophy size={40} style={{ color: 'var(--pf-amber)' }} strokeWidth={1.6} />
      <span className="pf-chip" style={{ background: 'var(--pf-amber-soft)', color: 'var(--pf-amber)' }}>Pro Account unlocked</span>
    </div>
  );
}

function PayoutBar() {
  return (
    <div className="pf-inset p-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="pf-tile" style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--pf-green-soft)', color: 'var(--pf-green)' }}>
          <Wallet size={15} />
        </span>
        <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--pf-border)' }}>
          <div className="h-full rounded-full" style={{ width: '78%', background: 'var(--pf-green)' }} />
        </div>
        <span className="text-[.8rem] font-bold" style={{ color: 'var(--pf-green)' }}>+₹25k</span>
      </div>
      <div className="h-2.5 rounded-full" style={{ background: 'var(--pf-border)', width: '55%' }} />
    </div>
  );
}

const STEPS = [
  {
    n: '01', title: 'Pick a size you can defend', tile: 'pf-tile--brand', Icon: UserPlus,
    desc: 'Open an account with an email, look at the limits for each size in rupees, and buy the one your worst week already fits inside.',
    Art: FormSkeleton,
  },
  {
    n: '02', title: 'Trade it like it is yours', tile: 'pf-tile--soft', Icon: Target,
    desc: 'Live NSE and BSE prices, simulated capital, and a dashboard that shows exactly how much of each limit you have left as you trade.',
    Art: ScoreGauge,
  },
  {
    n: '03', title: 'Clear it and get funded', tile: 'pf-tile--amber', Icon: Trophy,
    desc: 'Meet the target inside the limits and a funded account is issued the same day — fresh balance, new objectives, nothing to negotiate.',
    Art: FundedBadge,
  },
  {
    n: '04', title: 'Get paid every fortnight', tile: 'pf-tile--green', Icon: Wallet,
    desc: 'Request your share on a 14-day cycle. It lands in your own Indian bank account by UPI or transfer — no conversion, no waiting on a review window.',
    Art: PayoutBar,
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="pf-section">
      <div className="pf-wrap">
        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <p className="pf-eyebrow mb-4">The roadmap</p>
          <h2 className="pf-h2 mb-5">Four steps, no surprises</h2>
          <p className="pf-lead">
            Four steps from sign-up to payout. Every rule, target and limit is published
            before you pay — nothing is decided after the fact.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ n, title, desc, tile, Icon, Art }) => (
            <article key={n} className="pf-card pf-card--hover p-6 flex flex-col">
              <div className="flex items-start justify-between mb-5">
                <span className="pf-numeral">{n}</span>
                <span className={`pf-tile ${tile}`}><Icon size={21} /></span>
              </div>
              <h3 className="pf-h3 mb-3">{title}</h3>
              <p className="pf-body mb-6">{desc}</p>
              <div className="mt-auto"><Art /></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
