import { Link } from 'react-router-dom';
import SeoLanding from '../components/SeoLanding';

/**
 * NIFTY-specific page. The differentiator against the BANKNIFTY page is real,
 * not cosmetic: a different lot size means the same percentage loss limit is a
 * different number of lots, which is the thing people actually need to work out
 * before they size a position.
 */
// Figures for the ₹1 Lakh size; larger tiers scale the same percentages.
const LIMITS = [
  { size: '2-Step Evaluation', fee: '₹2,700', daily: '₹4,000', overall: '₹10,000', target: '₹8,000, then ₹5,000' },
  { size: '1-Step Evaluation', fee: '₹3,900', daily: '₹4,000', overall: '₹8,000', target: '₹10,000' },
  { size: 'Instant Funding', fee: '₹4,100', daily: '₹3,000', overall: '₹6,000', target: '₹5,000 before a payout' },
];

const FAQS = [
  {
    q: 'Can I trade NIFTY options in a DhanFunded assessment?',
    a: 'Yes. NIFTY 50 index options are permitted on both the buy and sell side. NIFTY futures are not permitted, and no position may be carried overnight.',
  },
  {
    q: 'What is the NIFTY lot size on the platform?',
    a: 'NIFTY 50 trades in lots of 65 units, in line with the NSE contract. Whole lots only — fractional sizing is not accepted.',
  },
  {
    q: 'What is the daily loss limit on a NIFTY assessment?',
    a: 'It depends on the programme, not the instrument. On the 2-Step and 1-Step it is 4% of the balance you started the day with — ₹4,000 on a ₹1 Lakh account. Instant Funding is 3%, or ₹3,000.',
  },
  {
    q: 'When can I trade NIFTY?',
    a: 'During the NSE session, 9:15 AM to 3:30 PM IST. Open positions are squared off at the close — the platform does not carry positions overnight.',
  },
  {
    q: 'Is this real NIFTY trading?',
    a: 'The price feed is live NSE data, but orders are simulated and never reach the exchange. The assessment measures whether you can work inside the published risk limits, not whether you can move real size in the market.',
  },
];

export default function NiftyPropFirmPage() {
  return (
    <SeoLanding
      seo={{
        path: '/nifty-prop-firm',
        title: 'NIFTY Prop Firm — Funded NIFTY Options Account | DhanFunded',
        description:
          'Trade NIFTY 50 index options in a rules-based assessment. Lot size 65, a ₹4,000 daily loss limit on a ₹1 Lakh account, 80% performance share paid in INR every 14 days.',
      }}
      h1="NIFTY Prop Firm — Trade NIFTY With a Funded Account"
      intro={
        <>
          NIFTY 50 is the most liquid index derivative in India, and it is the instrument most
          participants use to clear an assessment. This page sets out exactly what is permitted on
          NIFTY inside DhanFunded, what the loss limits work out to in rupees, and what ends an
          account.
        </>
      }
      faqs={FAQS}
      cta={{
        heading: 'Start a NIFTY assessment',
        body: 'Pick an account size, and the daily and overall limits above become your working numbers from day one.',
      }}
    >
      <section className="pf-section pf-section--alt">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">NIFTY limits in rupees, not percentages</h2>
          <p className="pf-lead mb-9" style={{ maxWidth: '62ch' }}>
            Percentages are hard to trade against. On a ₹1,00,000 account, here is what each
            programme's rules come to in the rupee figures you actually watch on the platform.
          </p>

          <div className="pf-card overflow-hidden">
            <div className="pf-scroll-x">
              <table className="pf-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th scope="col">Programme</th>
                    <th scope="col">Fee</th>
                    <th scope="col">Target</th>
                    <th scope="col">Daily loss limit</th>
                    <th scope="col">Overall loss limit</th>
                  </tr>
                </thead>
                <tbody>
                  {LIMITS.map((l) => (
                    <tr key={l.size}>
                      <th scope="row">{l.size}</th>
                      <td>{l.fee}</td>
                      <td>{l.target}</td>
                      <td>{l.daily}</td>
                      <td>{l.overall}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="pf-small mt-4">
            All figures are for the ₹1,00,000 account — see{' '}
            <Link to="/pricing" style={{ color: 'var(--pf-brand)' }}>pricing</Link> for the full rules.
          </p>
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-8">What is and is not allowed on NIFTY</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="pf-card p-6">
              <h3 className="pf-h3 mb-3" style={{ color: 'var(--pf-green)' }}>Allowed</h3>
              <ul className="pf-body" style={{ margin: 0, paddingLeft: 18 }}>
                <li>NIFTY 50 index options — buying</li>
                <li>NIFTY 50 index options — selling</li>
                <li>Intraday positions within the NSE session</li>
                <li>Whole lots of 65 units</li>
              </ul>
            </div>
            <div className="pf-card p-6">
              <h3 className="pf-h3 mb-3" style={{ color: '#C0392B' }}>Not allowed</h3>
              <ul className="pf-body" style={{ margin: 0, paddingLeft: 18 }}>
                <li>NIFTY futures</li>
                <li>Positions carried overnight</li>
                <li>Copy execution from another account</li>
                <li>Algorithmic or automated execution</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="pf-section pf-section--alt">
        <div className="pf-wrap" style={{ maxWidth: 780 }}>
          <h2 className="pf-h2 mb-4">The rule that ends most NIFTY accounts</h2>
          <p className="pf-body mb-4">
            It is rarely the profit target. It is the daily loss limit, and usually on a day when a
            position was sized for the target rather than for the limit. On a ₹5 Lakh 2-Step account
            the daily limit is ₹25,000 — roughly the move you can absorb in a single oversized
            NIFTY option position on a volatile expiry.
          </p>
          <p className="pf-body mb-6">
            The limit is measured against the day&apos;s opening balance and checked continuously,
            not at the close. Once it is breached the account ends, regardless of what the position
            would have done later.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/banknifty-prop-firm" className="pf-btn pf-btn--ghost pf-btn--sm">BANKNIFTY rules</Link>
            <Link to="/how-it-works" className="pf-btn pf-btn--ghost pf-btn--sm">How it works</Link>
            <Link to="/prop-firm-india" className="pf-btn pf-btn--ghost pf-btn--sm">All programmes</Link>
          </div>
        </div>
      </section>
    </SeoLanding>
  );
}
