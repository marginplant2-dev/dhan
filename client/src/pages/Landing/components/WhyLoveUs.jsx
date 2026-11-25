import { Link } from 'react-router-dom';
import { CalendarCheck, Clock, Percent, Scale, ShieldAlert, TrendingDown } from 'lucide-react';

// The rules that end or hold back an account, with rupee figures worked out on
// a ₹1 Lakh account. Percentages come from data/programmes.js — keep in step.
const ITEMS = [
  {
    Icon: TrendingDown, tile: 'pf-tile--soft', title: 'Daily loss limit',
    desc: '4% on 1-Step and 2-Step, 3% on Instant Funding: ₹4,000 or ₹3,000 on a ₹1 Lakh account. Open losses count too, not just closed trades.',
  },
  {
    Icon: ShieldAlert, tile: 'pf-tile--ink', title: 'Overall loss limit',
    desc: '10% on 2-Step, 8% on 1-Step and 6% on Instant. On ₹1 Lakh, a 2-Step account ends if it drops below ₹90,000.',
  },
  {
    Icon: Scale, tile: 'pf-tile--green', title: '2% cap on any one trade',
    desc: 'A single trade may not lose more than 2% of the account, which is ₹2,000 on ₹1 Lakh. Size positions with that in mind.',
  },
  {
    Icon: Percent, tile: 'pf-tile--amber', title: 'No single day above 40%',
    desc: 'In an evaluation, one day may count for no more than 40% of the target. On a ₹10,000 target that is ₹4,000; anything above stays in your balance but holds up the pass.',
  },
  {
    Icon: CalendarCheck, tile: 'pf-tile--violet', title: 'Five trading days minimum',
    desc: 'A target hit in one or two sessions does not pass. You need trades on at least five different days.',
  },
  {
    Icon: Clock, tile: 'pf-tile--pink', title: 'Closed by 3:15 PM IST',
    desc: 'Every position is squared off at 3:15 PM IST. Nothing is held overnight or over a weekend.',
  },
];

export default function WhyLoveUs() {
  return (
    <section className="pf-section">
      <div className="pf-wrap">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="pf-eyebrow mb-4">Rules that matter</p>
          <h2 className="pf-h2 mb-5">Six rules to know before you pay</h2>
          <p className="pf-lead">
            Read these six before you buy an account. Every other condition is written down in the{' '}
            <Link to="/faqs" className="font-semibold text-[color:var(--pf-brand)] underline underline-offset-2">FAQs</Link>
            {' '}and the{' '}
            <Link to="/terms" className="font-semibold text-[color:var(--pf-brand)] underline underline-offset-2">terms</Link>.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map(({ Icon, tile, title, desc }) => (
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
