import { Link } from 'react-router-dom';
import { Activity, Gauge, Layers, LineChart, Target, Zap } from 'lucide-react';
import { PROGRAMMES } from '../data/programmes';

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
          <div className="pf-small">to target</div>
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
        <span className="text-[.72rem] font-bold tracking-[.13em]" style={{ color: 'var(--pf-faint)' }}>EQUITY</span>
        <span className="pf-chip" style={{ background: 'var(--pf-green-soft)', color: 'var(--pf-green)', padding: '4px 10px', fontSize: '.7rem' }}>
          INSIDE LIMITS
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
    { label: "Today's limit used", value: '18%', tone: 'var(--pf-green)' },
    { label: 'Overall limit used', value: '31%', tone: 'var(--pf-amber)' },
    { label: 'Trading days', value: '4 / 5', tone: 'var(--pf-brand)' },
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
    Icon: Gauge, tile: 'pf-tile--violet', title: 'See your numbers as you trade',
    desc: "Progress to target, room left in today's loss limit, room left overall and trading days used all update as prices move.",
    Art: ProgressDonut,
  },
  {
    Icon: Activity, tile: 'pf-tile--brand', title: 'Rules applied by the system',
    desc: 'The platform applies each loss limit the instant it is reached, not in a manual check afterwards. Open positions close at the price that hit the limit.',
    Art: RiskSpark,
  },
  {
    Icon: LineChart, tile: 'pf-tile--amber', title: 'Stats for every account',
    desc: 'Win rate, profit and loss by day, and your largest single day are kept per account, so a costly habit shows up early.',
    Art: ObjectiveList,
  },
];

// One card per programme, built from the shared programme data so the fees
// and limits here never drift from the pricing table.
const PROGRAMME_CARD = {
  '2-step': { Icon: Layers, tile: 'pf-tile--soft', lead: 'Two phases, the widest overall limit and the lowest fee.' },
  '1-step': { Icon: Target, tile: 'pf-tile--pink', lead: 'A single phase with a higher target and a tighter overall limit.' },
  instant: { Icon: Zap, tile: 'pf-tile--green', lead: 'No evaluation: you trade a funded account from day one.' },
};

export default function TechBenefits() {
  return (
    <section className="pf-section pf-section--alt">
      <div className="pf-wrap">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="pf-eyebrow mb-4">Programmes and dashboard</p>
          <h2 className="pf-h2 mb-5">Three ways to get funded, one dashboard</h2>
          <p className="pf-lead">
            Whichever programme you choose, the same dashboard checks every rule for you while you
            trade. Compare them side by side on the{' '}
            <Link to="/challenges" className="font-semibold text-[color:var(--pf-brand)] underline underline-offset-2">challenges page</Link>
            , or see every account size on{' '}
            <Link to="/pricing" className="font-semibold text-[color:var(--pf-brand)] underline underline-offset-2">pricing</Link>.
          </p>
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
          {PROGRAMMES.map((p) => {
            const { Icon, tile, lead } = PROGRAMME_CARD[p.key];
            const instant = p.key === 'instant';
            return (
              <article key={p.key} className="pf-card pf-card--hover p-7">
                <span className={`pf-tile ${tile} mb-5`}><Icon size={21} /></span>
                <h3 className="pf-h3 mb-2.5">{p.name}</h3>
                <p className="pf-body">
                  {lead} On a ₹1 Lakh account: {instant ? 'profit needed before a payout' : 'target'}{' '}
                  {p.targetRupees}; daily limit {p.dailyRupees}; overall limit {p.overallRupees}
                  {instant ? '' : `; up to ${p.window} to pass`}. Profit share {p.split}, fee from {p.fee}.
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
