import { Link } from 'react-router-dom';
import SeoLanding from '../components/SeoLanding';
import { PROGRAMMES } from '../data/programmes';

/**
 * Target query family: "prop firm for indian stock market", "nse bse prop
 * firm", "prop firm without forex", "indian market prop firm no crypto".
 *
 * The gap in the results for these queries: almost everything ranking is a
 * forex/CFD firm that merely accepts Indian sign-ups. Someone searching for
 * the Indian stock market specifically is not served by any of them.
 */

const INSTRUMENTS = [
  { name: 'NIFTY 50', exchange: 'NSE', lot: '65', note: 'The most liquid index option in India; the default choice for an evaluation.' },
  { name: 'BANKNIFTY', exchange: 'NSE', lot: '35', note: 'Moves faster than NIFTY — the same loss limit is reached in fewer points.' },
  { name: 'SENSEX', exchange: 'BSE', lot: 'Per BSE circular', note: 'A smaller contract and a weekly expiry on its own day.' },
];

const NOT_OFFERED = [
  ['Forex pairs', 'Not offered. This platform is built around Indian index derivatives only.'],
  ['Crypto', 'Not offered, in any programme.'],
  ['US futures / CFDs', 'Not offered. Nothing here trades on CME or any foreign venue.'],
  ['Equity delivery', 'Not offered. The evaluation is intraday index options.'],
  ['Overnight positions', 'Not permitted — every position closes within the session.'],
];

const FAQS = [
  {
    q: 'Is there a prop firm for the Indian stock market specifically?',
    a: 'Yes. DhanFunded runs its evaluations only on Indian index derivatives — NIFTY and BANKNIFTY on NSE, SENSEX on BSE. No forex, no crypto and no foreign futures are offered on any programme.',
  },
  {
    q: 'Why does that matter if international firms accept Indian traders?',
    a: 'Because what you practise is what you get assessed on. An international firm evaluates you on forex or US futures during their session — often late at night in IST — and pays in dollars. If your edge is in NIFTY or BANKNIFTY during Indian market hours, an evaluation on those same instruments is the only one that measures it.',
  },
  {
    q: 'What are the trading hours?',
    a: '9:15 am to 3:15 pm IST, the Indian market session. Orders outside the session are rejected, and no position can be carried past the close or over the weekend.',
  },
  {
    q: 'Are the prices real?',
    a: 'The market data is live NSE and BSE data. Execution is simulated — orders are matched inside the software and never reach an exchange, so no position exists outside the platform.',
  },
  {
    q: 'What does it cost to start?',
    a: 'A one-time fee from ₹2,700 for a ₹1 Lakh account on the 2-Step programme. There is no subscription and no second payment when a funded account is issued.',
  },
];

export default function IndianStockMarketPropFirmPage() {
  return (
    <SeoLanding
      seo={{
        path: '/indian-stock-market-prop-firm',
        title: 'Prop Firm for the Indian Stock Market — NSE & BSE Only | DhanFunded',
        description:
          'An evaluation built for NSE and BSE index options — NIFTY, BANKNIFTY and SENSEX during Indian market hours. No forex, no crypto, no US futures. One-time fee from ₹2,700, rewards paid in INR.',
      }}
      h1="A Prop Firm Built for the Indian Stock Market"
      intro={
        <>
          Search for a prop firm in India and nearly everything that comes back is a forex or CFD
          firm that happens to accept Indian sign-ups. If what you actually trade is NIFTY,
          BANKNIFTY or SENSEX between 9:15 and 3:15, none of that is built for you. This one is:
          Indian indices, Indian hours, Indian rupees.
        </>
      }
      faqs={FAQS}
      cta={{
        heading: 'Get assessed on what you actually trade',
        body: 'NIFTY, BANKNIFTY and SENSEX — one-time fee from ₹2,700.',
      }}
    >
      <section className="pf-section pf-section--alt">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">What you trade</h2>
          <div className="pf-card overflow-hidden">
            <div className="pf-scroll-x">
              <table className="pf-table" style={{ minWidth: 620 }}>
                <thead>
                  <tr>
                    <th scope="col">Index</th>
                    <th scope="col">Exchange</th>
                    <th scope="col">Lot</th>
                    <th scope="col">Why people pick it</th>
                  </tr>
                </thead>
                <tbody>
                  {INSTRUMENTS.map((i) => (
                    <tr key={i.name}>
                      <th scope="row">{i.name}</th>
                      <td>{i.exchange}</td>
                      <td>{i.lot}</td>
                      <td>{i.note}</td>
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
          <h2 className="pf-h2 mb-4">What is deliberately not here</h2>
          <p className="pf-lead mb-8" style={{ maxWidth: '62ch' }}>
            A shorter list than most firms advertise, and that is the point.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {NOT_OFFERED.map(([k, v]) => (
              <div key={k} className="pf-inset p-5">
                <h3 className="pf-h3 mb-1">{k}</h3>
                <p className="pf-body" style={{ margin: 0 }}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pf-section pf-section--alt">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">The three programmes</h2>
          <div className="pf-card overflow-hidden">
            <div className="pf-scroll-x">
              <table className="pf-table" style={{ minWidth: 660 }}>
                <thead>
                  <tr>
                    <th scope="col">Programme</th>
                    <th scope="col">Fee</th>
                    <th scope="col">Target</th>
                    <th scope="col">Daily loss</th>
                    <th scope="col">Overall loss</th>
                    <th scope="col">Reward share</th>
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
                      <td>{p.split}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="pf-small mt-4">
            Figures for a ₹1 Lakh account. Sizes run up to ₹50 Lakh depending on the programme — see{' '}
            <Link to="/pricing" style={{ color: 'var(--pf-brand)' }}>pricing</Link>.
          </p>
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-wrap" style={{ maxWidth: 780 }}>
          <h2 className="pf-h2 mb-4">Stated plainly</h2>
          <p className="pf-body mb-6">
            DhanFunded is a software platform providing a simulated environment and a rules-based
            evaluation. It is not a broker, exchange member or investment adviser, is not registered
            with SEBI, and does not route orders to NSE or BSE. The market data is real; the
            execution is not.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/nifty-prop-firm" className="pf-btn pf-btn--ghost pf-btn--sm">NIFTY rules</Link>
            <Link to="/banknifty-prop-firm" className="pf-btn pf-btn--ghost pf-btn--sm">BANKNIFTY rules</Link>
            <Link to="/sensex-prop-firm" className="pf-btn pf-btn--ghost pf-btn--sm">SENSEX rules</Link>
            <Link to="/inr-upi-prop-firm-india" className="pf-btn pf-btn--ghost pf-btn--sm">Fees &amp; payouts in INR</Link>
          </div>
        </div>
      </section>
    </SeoLanding>
  );
}
