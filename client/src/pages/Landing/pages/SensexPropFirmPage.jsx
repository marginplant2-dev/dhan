import { Link } from 'react-router-dom';
import SeoLanding from '../components/SeoLanding';
import { PROGRAMMES } from '../data/programmes';

/**
 * Target query family: "sensex prop firm", "sensex options funded account",
 * "bse prop firm india", "sensex funded trading".
 *
 * The third instrument page. Its own angle: SENSEX is the BSE contract, and
 * the only one of the three whose weekly expiry sits on a different day — which
 * is the actual reason people search for it separately.
 */

const FAQS = [
  {
    q: 'Can I trade SENSEX options in a prop firm assessment?',
    a: 'Yes. SENSEX index options on BSE are available on every DhanFunded programme, alongside NIFTY and BANKNIFTY. The same loss limits and profit targets apply whichever index you choose.',
  },
  {
    q: 'What is the SENSEX lot size?',
    a: 'SENSEX options carry a smaller lot than BANKNIFTY, which is why participants working with a tight daily limit often prefer it. The exact contract specification shown inside the terminal always follows the current BSE circular.',
  },
  {
    q: 'Why trade SENSEX instead of NIFTY?',
    a: 'Two practical reasons. Its weekly expiry falls on a different day from the NSE indices, so an expiry-day approach can be run more than once a week. And the smaller lot means one contract moves your balance less, which matters when your daily limit is ₹3,000 to ₹4,000.',
  },
  {
    q: 'Are SENSEX futures allowed?',
    a: 'Assessments are built around index options. Futures, overnight positions, copy execution and algorithmic execution are not permitted inside an assessment.',
  },
  {
    q: 'When can I place SENSEX orders?',
    a: 'During the Indian market session, 9:15 am to 3:15 pm IST. Orders outside the session are rejected, and no position can be carried past the close.',
  },
];

export default function SensexPropFirmPage() {
  return (
    <SeoLanding
      seo={{
        path: '/sensex-prop-firm',
        title: 'SENSEX Prop Firm — Funded SENSEX Options Account | DhanFunded',
        description:
          'Trade BSE SENSEX index options in a rules-based assessment. Accounts from ₹1 Lakh, fees from ₹2,700, loss limits published in rupees, and 80% of the profit paid in INR every 14 days.',
      }}
      h1="SENSEX Prop Firm — Funded BSE Index Options"
      intro={
        <>
          SENSEX is the BSE side of a DhanFunded assessment. Same account sizes, same published
          loss limits, same 14-day payout cycle as NIFTY and BANKNIFTY — but a smaller contract and
          a weekly expiry on its own day, which is why a lot of intraday participants build their
          week around it.
        </>
      }
      faqs={FAQS}
      cta={{
        heading: 'Trade SENSEX in an assessment',
        body: 'Pick any programme — SENSEX, NIFTY and BANKNIFTY are all available on each of them.',
      }}
    >
      <section className="pf-section pf-section--alt">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">The rules you trade it under</h2>
          <p className="pf-lead mb-8" style={{ maxWidth: '62ch' }}>
            The index does not change the rules. These are the three programmes, priced on a
            ₹1,00,000 account, with every limit shown as money rather than a percentage.
          </p>
          <div className="pf-card overflow-hidden">
            <div className="pf-scroll-x">
              <table className="pf-table" style={{ minWidth: 680 }}>
                <thead>
                  <tr>
                    <th scope="col">Programme</th>
                    <th scope="col">Fee</th>
                    <th scope="col">Target</th>
                    <th scope="col">Daily loss</th>
                    <th scope="col">Overall loss</th>
                    <th scope="col">Window</th>
                    <th scope="col">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {PROGRAMMES.map((p) => (
                    <tr key={p.key}>
                      <th scope="row">{p.name}</th>
                      <td>{p.fee}</td>
                      <td>{p.targetRupees}</td>
                      <td>{p.dailyRupees}</td>
                      <td>{p.overallRupees}</td>
                      <td>{p.window}</td>
                      <td>{p.split}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">Where SENSEX differs from the NSE indices</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="pf-inset p-6">
              <h3 className="pf-h3 mb-2">It is a BSE contract</h3>
              <p className="pf-body" style={{ margin: 0 }}>
                NIFTY and BANKNIFTY are NSE. SENSEX is BSE, with its own expiry calendar and its own
                liquidity profile through the day.
              </p>
            </div>
            <div className="pf-inset p-6">
              <h3 className="pf-h3 mb-2">A smaller lot</h3>
              <p className="pf-body" style={{ margin: 0 }}>
                One contract moves your balance less than a BANKNIFTY lot does. On a ₹3,000 daily
                limit that difference decides how many mistakes a day can absorb.
              </p>
            </div>
            <div className="pf-inset p-6">
              <h3 className="pf-h3 mb-2">A different expiry day</h3>
              <p className="pf-body" style={{ margin: 0 }}>
                Its weekly expiry does not fall on the NSE day, so an expiry-day approach can be run
                on more than one session a week.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="pf-section pf-section--alt">
        <div className="pf-wrap" style={{ maxWidth: 780 }}>
          <h2 className="pf-h2 mb-4">Simulated, and stated plainly</h2>
          <p className="pf-body mb-6">
            SENSEX prices inside an assessment come from the live market, but orders are not routed
            to BSE and no position exists on an exchange. What is being measured is whether you can
            work inside a fixed set of risk limits. DhanFunded is not a broker, exchange member or
            investment adviser, and gives no trading advice or recommendations.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/nifty-prop-firm" className="pf-btn pf-btn--ghost pf-btn--sm">NIFTY rules</Link>
            <Link to="/banknifty-prop-firm" className="pf-btn pf-btn--ghost pf-btn--sm">BANKNIFTY rules</Link>
            <Link to="/instruments" className="pf-btn pf-btn--ghost pf-btn--sm">All instruments</Link>
          </div>
        </div>
      </section>
    </SeoLanding>
  );
}
