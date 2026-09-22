import { Link } from 'react-router-dom';
import SeoLanding from '../components/SeoLanding';
import { PROGRAMMES } from '../data/programmes';

/**
 * Target query family: "instant funding prop firm india", "prop firm without
 * challenge", "no evaluation funded account india", "instant funding account".
 *
 * The honest angle is the trade-off, not the pitch: skipping the assessment
 * costs more up front and buys the tightest daily limit on the platform.
 */

const INSTANT = PROGRAMMES.find((p) => p.key === 'instant');
const TWO_STEP = PROGRAMMES.find((p) => p.key === '2-step');

const FAQS = [
  {
    q: 'What is instant funding?',
    a: 'A funded account issued as soon as your payment is confirmed, with no assessment phase to clear first. On DhanFunded the fee is ₹4,100 for a ₹1,00,000 account and you can place your first trade the same day.',
  },
  {
    q: 'What is the catch compared to an evaluation?',
    a: 'Three things, all published. The daily loss limit is 3% (₹3,000) instead of 4%, the overall limit is 6% (₹6,000) instead of 10%, and your share of the profit is 70% instead of 80%. The fee is also the highest of the three programmes.',
  },
  {
    q: 'Do I still have a profit target?',
    a: 'Not to keep the account, but yes to be paid. The account must be 5% (₹5,000) in profit before a payout can be requested, and you must have traded on at least 5 days.',
  },
  {
    q: 'How soon can I withdraw?',
    a: 'Payouts run on a 14-day cycle. The first request can be made 14 days after the account is issued, provided the 5% profit and 5 trading day conditions are met.',
  },
  {
    q: 'Is instant funding better than a 2-Step evaluation?',
    a: 'It is better if you want to start immediately and can work inside a 3% daily limit. The 2-Step costs ₹1,400 less, gives you a 10% overall limit and pays 80%, but you have to clear two phases first. Neither is a discount on the other — they suit different temperaments.',
  },
  {
    q: 'Can I hold a position overnight?',
    a: 'No. Positions must be closed within the session on every DhanFunded programme, including instant funding. Weekend holding is not permitted either.',
  },
];

export default function InstantFundingIndiaPage() {
  return (
    <SeoLanding
      seo={{
        path: '/instant-funding-prop-firm-india',
        title: 'Instant Funding Prop Firm India — No Evaluation, ₹4,100 | DhanFunded',
        description:
          'Instant funding in India with no assessment phase: from a one-time ₹4,100 on a ₹1 Lakh account (sizes up to ₹50 Lakh), a 3% daily and 6% overall loss limit, and 70% of the profit paid in INR every 14 days.',
      }}
      h1="Instant Funding Prop Firm in India"
      intro={
        <>
          Instant Funding skips the assessment entirely. You pay once, the account is
          issued, and you trade NIFTY, BANKNIFTY or SENSEX the same day. What you trade is a tighter
          set of limits than the evaluation programmes — that is the whole trade, stated up front.
        </>
      }
      faqs={FAQS}
      cta={{
        heading: 'Start trading today',
        body: 'No phases, no waiting period, no second payment. The limits below are the ones the platform enforces.',
      }}
    >
      <section className="pf-section pf-section--alt">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">Instant Funding, in full</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { k: INSTANT.fee, v: 'One-time fee, ₹1 Lakh account' },
              { k: INSTANT.dailyRupees, v: 'Daily loss limit (3%)' },
              { k: INSTANT.overallRupees, v: 'Overall loss limit (6%)' },
              { k: INSTANT.split, v: 'Your share of profit' },
            ].map((s) => (
              <div key={s.v} className="pf-card p-6">
                <div className="text-[1.5rem] font-extrabold tracking-[-.03em]" style={{ color: 'var(--pf-text)' }}>{s.k}</div>
                <div className="pf-small mt-1">{s.v}</div>
              </div>
            ))}
          </div>
          <p className="pf-body" style={{ maxWidth: '64ch' }}>
            The daily limit resets with the balance you start each day on. The overall limit is
            measured from the balance you began with and never moves. Breach either one and the
            account ends — the platform closes it at the moment it happens, so there is no review,
            no appeal queue and no surprise a week later.
          </p>
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">Instant Funding vs a 2-Step evaluation</h2>
          <p className="pf-lead mb-8" style={{ maxWidth: '62ch' }}>
            The two ends of the range. Pick on the basis of how much room you need, not on which one
            sounds faster.
          </p>
          <div className="pf-card overflow-hidden">
            <div className="pf-scroll-x">
              <table className="pf-table" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th scope="col">&nbsp;</th>
                    <th scope="col">Instant Funding</th>
                    <th scope="col">2-Step Evaluation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><th scope="row">Fee</th><td>{INSTANT.fee}</td><td>{TWO_STEP.fee}</td></tr>
                  <tr><th scope="row">Assessment to clear</th><td>None</td><td>Two phases, 8% then 5%</td></tr>
                  <tr><th scope="row">Daily loss limit</th><td>{INSTANT.dailyRupees}</td><td>{TWO_STEP.dailyRupees}</td></tr>
                  <tr><th scope="row">Overall loss limit</th><td>{INSTANT.overallRupees}</td><td>{TWO_STEP.overallRupees}</td></tr>
                  <tr><th scope="row">Window</th><td>{INSTANT.window}</td><td>{TWO_STEP.window}</td></tr>
                  <tr><th scope="row">Profit share</th><td>{INSTANT.split}</td><td>{TWO_STEP.split}</td></tr>
                  <tr><th scope="row">Profit needed before a payout</th><td>{INSTANT.targetRupees}</td><td>{INSTANT.targetRupees}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="pf-small mt-4">
            The 1-Step sits between them — see the{' '}
            <Link to="/prop-firm-india" style={{ color: 'var(--pf-brand)' }}>full comparison</Link>.
          </p>
        </div>
      </section>

      <section className="pf-section pf-section--alt">
        <div className="pf-wrap" style={{ maxWidth: 780 }}>
          <h2 className="pf-h2 mb-4">Who this actually suits</h2>
          <p className="pf-body mb-4">
            People who already trade intraday with a fixed daily stop, and whose worst day sits
            comfortably inside ₹3,000 on a ₹1 Lakh account. If your typical losing day is larger than
            that, instant funding will end your account faster than an evaluation would, and the
            higher fee makes that an expensive way to find out.
          </p>
          <p className="pf-body mb-6">
            Assessments and funded accounts alike run in a simulated environment on live market data.
            DhanFunded is not a broker, exchange member or investment adviser, and no orders reach
            NSE or BSE.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/funded-trading-account-india" className="pf-btn pf-btn--ghost pf-btn--sm">Funded accounts explained</Link>
            <Link to="/pricing" className="pf-btn pf-btn--ghost pf-btn--sm">All fees</Link>
            <Link to="/faqs" className="pf-btn pf-btn--ghost pf-btn--sm">FAQs</Link>
          </div>
        </div>
      </section>
    </SeoLanding>
  );
}
