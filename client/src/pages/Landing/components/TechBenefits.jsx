import { Activity, CalendarRange, Gauge, LineChart, Percent, Layers } from 'lucide-react';

/* ── mini widgets ────────────────────────────────────────────────────────── */
function ProgressDonut() {
  const pct = 0.62, r = 42, c = 2 * Math.PI * r;
  return (
    <div className="pf-inset p-5 grid place-items-center">
      <div className="relative w-[124px] h-[124px] grid place-items-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--pf-border)" strokeWidth="9" />
          <circle
            cx="50" cy="50" r={r} fill="none" stroke="var(--pf-brand)" strokeWidth="9" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          />
        </svg>
        <div className="relative text-center">
          <div className="text-[1.45rem] font-extrabold leading-none" style={{ color: 'var(--pf-text)' }}>62%</div>
          <div className="pf-small">of target</div>
        </div>
      </div>
    </div>
  );
}

function RiskSpark() {
  // Static, deliberately calm equity curve — decoration, not live data.
  const pts = [6, 22, 14, 30, 24, 41, 34, 52, 46, 63, 58, 72];
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * 100},${52 - (v / 80) * 44}`).join(' L ');
  return (
    <div className="pf-inset p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[.72rem] font-bold tracking-[.13em]" style={{ color: 'var(--pf-faint)' }}>LIVE RISK</span>
        <span className="pf-chip" style={{ background: 'var(--pf-green-soft)', color: 'var(--pf-green)', padding: '4px 10px', fontSize: '.7rem' }}>
          WITHIN LIMITS
        </span>
      </div>
      <svg viewBox="0 0 100 56" className="w-full h-[86px]" preserveAspectRatio="none">
        <path d={`M ${d}`} fill="none" stroke="var(--pf-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function ObjectiveList() {
  const rows = [
    { label: 'Daily loss used', value: '18%', tone: 'var(--pf-green)' },
    { label: 'Max loss used', value: '31%', tone: 'var(--pf-amber)' },
    { label: 'Active days', value: '4 / 5', tone: 'var(--pf-brand)' },
  ];
  return (
    <div className="pf-inset p-5 space-y-3">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between">
          <span className="text-[.82rem]" style={{ color: 'var(--pf-muted)' }}>{r.label}</span>
          <span className="text-[.85rem] font-bold" style={{ color: r.tone }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const MAIN = [
  {
    Icon: Gauge, tile: 'pf-tile--violet', title: 'Live Objectives Tracker',
    desc: 'Profit target, daily loss, maximum loss and active days are recalculated on every tick — you always know exactly where you stand.',
    Art: ProgressDonut,
  },
  {
    Icon: Activity, tile: 'pf-tile--brand', title: 'Automated Risk Engine',
    desc: 'Drawdown limits are enforced by the platform. Breach a limit and positions are squared off at the exact price that triggered it.',
    Art: RiskSpark,
  },
  {
    Icon: LineChart, tile: 'pf-tile--amber', title: 'Performance Analytics',
    desc: 'Per-day P&L, win rate and consistency broken down per account, so you can see which habits are actually costing you.',
    Art: ObjectiveList,
  },
];

const SECONDARY = [
  {
    Icon: CalendarRange, tile: 'pf-tile--soft', title: 'Unhurried Assessment Windows',
    desc: 'Take the days you need. We would rather see a real process than a rushed one.',
  },
  {
    Icon: Layers, tile: 'pf-tile--pink', title: 'Realistic Simulated Fills',
    desc: 'Indian instruments with spreads, margins and lot sizes modelled on standard broker conditions.',
  },
  {
    Icon: Percent, tile: 'pf-tile--green', title: 'Performance-Based Payouts',
    desc: 'Clear the objectives, request your share. The split and cycle are fixed up front.',
  },
];

export default function TechBenefits() {
  return (
    <section className="pf-section pf-section--alt">
      <div className="pf-wrap">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="pf-eyebrow mb-4">Under the hood</p>
          <h2 className="pf-h2 mb-5">Technology &amp; Benefits</h2>
          <p className="pf-lead">The platform does the rule-keeping so you can concentrate on the process.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3 mb-5">
          {MAIN.map(({ Icon, tile, title, desc, Art }) => (
            <article key={title} className="pf-card pf-card--hover p-7 flex flex-col">
              <span className={`pf-tile ${tile} mb-5`}><Icon size={21} /></span>
              <h3 className="pf-h3 mb-2.5">{title}</h3>
              <p className="pf-body mb-6">{desc}</p>
              <div className="mt-auto"><Art /></div>
            </article>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          {SECONDARY.map(({ Icon, tile, title, desc }) => (
            <article key={title} className="pf-card pf-card--hover p-7">
              <span className={`pf-tile ${tile} mb-5`}><Icon size={21} /></span>
              <h3 className="pf-h3 mb-2.5">{title}</h3>
              <p className="pf-body">{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
