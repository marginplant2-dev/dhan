import { Link } from 'react-router-dom';
import SeoLanding from '../components/SeoLanding';

/**
 * BANKNIFTY page. Deliberately not a copy of the NIFTY page — the lot size (35
 * vs 65) and the wider intraday range change how the same limits behave, and
 * that difference is the whole reason someone searches for one over the other.
 */
const COMPARE = [
  { row: 'Exchange', nifty: 'NSE', bn: 'NSE' },
  { row: 'Lot size', nifty: '65 units', bn: '35 units' },
  { row: 'Session', nifty: '9:15 AM – 3:30 PM IST', bn: '9:15 AM – 3:30 PM IST' },
  { row: 'Typical intraday range', nifty: 'Narrower', bn: 'Wider — moves faster' },
  { row: 'Options buy / sell', nifty: 'Allowed', bn: 'Allowed' },
  { row: 'Futures', nifty: 'Not allowed', bn: 'Not allowed' },
  { row: 'Overnight positions', nifty: 'Not allowed', bn: 'Not allowed' },
];

const FAQS = [
  {
    q: 'Can I trade BANKNIFTY options in a DhanFunded assessment?',
    a: 'Yes, on both the buy and sell side. BANKNIFTY futures are not permitted and positions cannot be held overnight.',
  },
  {
    q: 'What is the BANKNIFTY lot size?',
    a: 'BANKNIFTY trades in lots of 35 units. Whole lots only — the platform rejects fractional sizes.',
  },
  {
    q: 'Is BANKNIFTY harder to pass an assessment on than NIFTY?',
    a: 'The rules are identical; the instrument is not. BANKNIFTY has a wider intraday range, so the same number of lots produces larger swings and reaches the daily loss limit sooner. Many participants size down on BANKNIFTY for exactly this reason.',
  },
  {
    q: 'What is the daily loss limit on a BANKNIFTY assessment?',
    a: 'It is set by the programme, not the instrument — 4% on the 2-Step and 1-Step, 3% on Instant Funding. On a ₹1 Lakh account that is ₹4,000 and ₹3,000 respectively.',
  },
  {
    q: 'Are orders sent to NSE?',
    a: 'No. The price feed is live NSE data but execution is simulated and no order reaches the exchange.',
  },
];

export default function BankniftyPropFirmPage() {
  return (
    <SeoLanding
      seo={{
        path: '/banknifty-prop-firm',
        title: 'BANKNIFTY Prop Firm — Funded BANKNIFTY Trading | DhanFunded',
        description:
          'Trade BANKNIFTY index options in a rules-based assessment. Lot size 35, the same published loss limits as every programme, 80% performance share paid in INR every 14 days.',
      }}
      h1="BANKNIFTY Prop Firm — Funded Trading Assessment in India"
      intro={
        <>
          BANKNIFTY moves further in a session than NIFTY does, which changes how the same risk
          limits feel in practice. The rules below are identical to every other DhanFunded
          assessment — what differs is how quickly a BANKNIFTY position can reach them.
        </>
      }
      faqs={FAQS}
      cta={{
        heading: 'Start a BANKNIFTY assessment',
        body: 'Same published limits as every other programme. Pick the account size that matches how you actually size a position.',
      }}
    >
      <section className="pf-section pf-section--alt">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">BANKNIFTY next to NIFTY</h2>
          <p className="pf-lead mb-9" style={{ maxWidth: '62ch' }}>
            The rules do not change between instruments. The contract does, and that is what decides
            how many lots fit inside your daily limit.
          </p>

          <div className="pf-card overflow-hidden">
            <div className="pf-scroll-x">
              <table className="pf-table" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th scope="col">&nbsp;</th>
                    <th scope="col">NIFTY 50</th>
                    <th scope="col">BANKNIFTY</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((c) => (
                    <tr key={c.row}>
                      <th scope="row">{c.row}</th>
                      <td>{c.nifty}</td>
                      <td>{c.bn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-wrap" style={{ maxWidth: 780 }}>
          <h2 className="pf-h2 mb-4">Why the smaller lot does not mean smaller risk</h2>
          <p className="pf-body mb-4">
            A BANKNIFTY lot is 35 units against NIFTY&apos;s 65, which makes the position look
            smaller on the order ticket. But BANKNIFTY covers more points in a normal session, so
            the rupee swing per lot is often larger, not smaller.
          </p>
          <p className="pf-body mb-4">
            The daily loss limit does not adjust for this. On a ₹1 Lakh 2-Step account it is
            ₹4,000 whichever instrument you trade. That figure is reached faster on BANKNIFTY, and
            it is the most common reason an assessment ends early.
          </p>
          <p className="pf-body mb-6">
            There is no rule against trading BANKNIFTY, and no penalty for it. It simply needs the
            position sized against the limit rather than against the target.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/nifty-prop-firm" className="pf-btn pf-btn--ghost pf-btn--sm">NIFTY rules</Link>
            <Link to="/instruments" className="pf-btn pf-btn--ghost pf-btn--sm">All instruments</Link>
            <Link to="/prop-firm-india" className="pf-btn pf-btn--ghost pf-btn--sm">All programmes</Link>
          </div>
        </div>
      </section>
    </SeoLanding>
  );
}
