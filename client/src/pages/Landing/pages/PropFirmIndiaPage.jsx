import { Link } from 'react-router-dom';
import SeoLanding from '../components/SeoLanding';
import { PROGRAMMES } from '../data/programmes';

const INSTRUMENTS = [
  { n: 'NIFTY 50', e: 'NSE', lot: '65 units', to: '/nifty-prop-firm' },
  { n: 'BANKNIFTY', e: 'NSE', lot: '35 units', to: '/banknifty-prop-firm' },
  { n: 'SENSEX', e: 'BSE', lot: '20 units', to: '/instruments' },
];

const FAQS = [
  {
    q: 'Is DhanFunded a broker or a SEBI-registered intermediary?',
    a: 'No. DhanFunded is not a broker, exchange or investment adviser and is not SEBI registered. Orders placed in an assessment do not reach NSE or BSE — the market data is real, the execution is simulated.',
  },
  {
    q: 'What does an assessment cost?',
    a: 'The 2-Step assessment is ₹2,700 on a ₹1 Lakh account. The 1-Step is ₹3,900 and Instant Funding is ₹4,100. Every fee is one-time and non-refundable, and there is no further charge when a funded account is issued.',
  },
  {
    q: 'Which account size do I get?',
    a: '₹1 Lakh to ₹50 Lakh, depending on the programme: the 2-Step goes up to ₹10 Lakh, the 1-Step to ₹25 Lakh and Instant Funding to ₹50 Lakh. The loss limits and profit target scale with the size you choose, so every rule has an exact rupee value you can check before you place a trade.',
  },
  {
    q: 'How is the performance share paid?',
    a: 'In Indian rupees to the bank account in your approved KYC. The share is 80% on the 1-Step and 2-Step programmes and 70% on Instant Funding, and a payout can be requested every 14 days once the account is 5% in profit over at least 5 trading days.',
  },
  {
    q: 'What ends an account?',
    a: 'Breaching the daily loss limit or the overall loss limit for your programme. Both are published up front and measured against the starting balance, so you always know the exact rupee figure.',
  },
];

export default function PropFirmIndiaPage() {
  return (
    <SeoLanding
      seo={{
        path: '/prop-firm-india',
        title: 'Prop Firm in India — Funded Accounts on NIFTY & BANKNIFTY | DhanFunded',
        description:
          'A prop firm assessment built for Indian index derivatives. Accounts from ₹1 Lakh to ₹50 Lakh, one-time fees from ₹2,700, 80% performance share and payouts every 14 days in INR.',
      }}
      h1="Prop Trading Firm in India for NIFTY, BANKNIFTY and SENSEX"
      intro={
        <>
          DhanFunded runs rules-based assessments on Indian index derivatives. You pay a one-time
          fee, trade inside published loss limits in a simulated environment, and on clearing the
          assessment you receive a funded account whose performance share is paid to your Indian
          bank account in rupees. There is no subscription and no recurring charge.
        </>
      }
      faqs={FAQS}
      cta={{
        heading: 'Pick a programme and start',
        body: 'Every rule above is enforced by the platform, not by hand. Fees are one-time and the limits are the same for everyone.',
      }}
    >
      <section className="pf-section pf-section--alt">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">Three programmes, one set of published rules</h2>
          <p className="pf-lead mb-9" style={{ maxWidth: '62ch' }}>
            The difference between them is how much you pay up front and how much room you get
            before an account ends. Nothing is negotiated case by case.
          </p>

          <div className="pf-card overflow-hidden">
            <div className="pf-scroll-x">
              <table className="pf-table" style={{ minWidth: 720 }}>
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
                      <td>{p.target}</td>
                      <td>{p.daily}</td>
                      <td>{p.overall}</td>
                      <td>{p.window}</td>
                      <td>{p.split}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mt-6">
            {PROGRAMMES.map((p) => (
              <div key={p.key} className="pf-inset p-5">
                <h3 className="pf-h3 mb-2">{p.name}</h3>
                <p className="pf-body" style={{ margin: 0 }}>{p.who}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">What you actually trade</h2>
          <p className="pf-lead mb-8" style={{ maxWidth: '62ch' }}>
            Index options on the three benchmarks Indian intraday participants already follow.
            Futures, overnight positions, copy execution and algorithmic execution are not permitted
            inside an assessment.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {INSTRUMENTS.map((i) => (
              <Link key={i.n} to={i.to} className="pf-card pf-card--hover p-6" style={{ textDecoration: 'none' }}>
                <h3 className="pf-h3 mb-1">{i.n}</h3>
                <p className="pf-small" style={{ margin: '0 0 10px' }}>{i.e} · lot {i.lot}</p>
                <span style={{ color: 'var(--pf-brand)', fontWeight: 650, fontSize: '.9rem' }}>
                  Read the rules →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="pf-section pf-section--alt">
        <div className="pf-wrap" style={{ maxWidth: 780 }}>
          <h2 className="pf-h2 mb-4">Simulated, and stated plainly</h2>
          <p className="pf-body mb-4">
            Assessments run in a simulated environment. Prices come from the live market, but orders
            are not routed to NSE or BSE and no position exists on an exchange. What is measured is
            whether you can work inside a fixed set of risk limits.
          </p>
          <p className="pf-body mb-6">
            DhanFunded is not a broker, not an exchange member and not an investment adviser. No
            trading advice, tips or recommendations are provided. Participation involves the loss of
            the assessment fee if a rule is breached, and past performance does not indicate future
            results.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/how-it-works" className="pf-btn pf-btn--ghost pf-btn--sm">How it works</Link>
            <Link to="/risk-disclaimer" className="pf-btn pf-btn--ghost pf-btn--sm">Risk disclaimer</Link>
            <Link to="/faqs" className="pf-btn pf-btn--ghost pf-btn--sm">FAQs</Link>
          </div>
        </div>
      </section>
    </SeoLanding>
  );
}
