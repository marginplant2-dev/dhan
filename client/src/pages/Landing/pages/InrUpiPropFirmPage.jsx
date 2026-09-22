import { Link } from 'react-router-dom';
import SeoLanding from '../components/SeoLanding';
import { PROGRAMMES } from '../data/programmes';

/**
 * Target query family: "prop firm that pays in INR", "prop firm UPI payment
 * india", "indian prop firm inr payout", "prop firm without LRS".
 *
 * The angle international firms cannot answer: every rupee stays domestic.
 * They quote USD, take card/crypto and pay into foreign wallets; a participant
 * in India then deals with conversion and the LRS paperwork on the way out.
 * Nothing here claims a tax position — that is for the reader's CA.
 */

const COMPARE = [
  { row: 'Fee is quoted in', pf: 'Indian rupees', intl: 'US dollars' },
  { row: 'You pay by', pf: 'UPI, bank transfer or card', intl: 'Card, crypto or wire' },
  { row: 'Money leaves India', pf: 'No — the payment is domestic', intl: 'Yes' },
  { row: 'LRS paperwork', pf: 'Not involved', intl: 'Applies to the remittance' },
  { row: 'Currency conversion cost', pf: 'None', intl: 'On the way in and out' },
  { row: 'Reward is paid to', pf: 'Your Indian bank account, in INR', intl: 'A wallet or foreign account' },
  { row: 'Instruments', pf: 'NIFTY, BANKNIFTY, SENSEX options', intl: 'Forex, CFDs, US futures' },
  { row: 'Market hours', pf: '9:15 am – 3:15 pm IST', intl: 'Overnight for India' },
];

const FAQS = [
  {
    q: 'Is the evaluation fee charged in rupees?',
    a: 'Yes. Every programme is priced in INR and paid in INR — ₹2,700 for the 2-Step, ₹3,900 for the 1-Step and ₹4,100 for Instant Funding on a ₹1 Lakh account. There is no dollar price and no conversion at any point.',
  },
  {
    q: 'Can I pay by UPI?',
    a: 'Yes. UPI, bank transfer and card are all accepted. A UPI payment is a domestic transfer, so it clears in seconds and costs you nothing extra.',
  },
  {
    q: 'Does paying for an evaluation use my LRS limit?',
    a: 'No. LRS applies when money is remitted out of India. DhanFunded is an Indian platform and the payment stays domestic, so the Liberalised Remittance Scheme is not involved. Paying an international prop firm is a remittance and is treated differently — check with your CA about your own position.',
  },
  {
    q: 'How is a reward paid out?',
    a: 'By bank transfer in Indian rupees to the account in your approved KYC, on a 14-day cycle. Payouts to a third-party account are not permitted, and no foreign wallet is involved.',
  },
  {
    q: 'Will I have to declare it?',
    a: 'Any reward you receive is your income and you are responsible for declaring it. DhanFunded is not a tax adviser and does not give tax advice — speak to a chartered accountant about how it should be reported in your return.',
  },
];

export default function InrUpiPropFirmPage() {
  return (
    <SeoLanding
      seo={{
        path: '/inr-upi-prop-firm-india',
        title: 'Prop Firm That Pays in INR — UPI Fees, Indian Bank Payouts | DhanFunded',
        description:
          'An Indian prop firm evaluation priced in rupees: pay the one-time fee by UPI from ₹2,700, trade NIFTY, BANKNIFTY and SENSEX, and receive your reward share in INR to your own bank account every 14 days. No dollars, no conversion, no LRS.',
      }}
      h1="A Prop Firm Where Every Rupee Stays in India"
      intro={
        <>
          Most prop firms an Indian participant finds are based abroad. The fee is in dollars, the
          payment leaves the country, the platform trades forex or US futures at hours that do not
          suit India, and the reward comes back through a foreign wallet. DhanFunded is the other
          kind: priced in rupees, paid by UPI, traded on NSE and BSE, and paid out to your own
          Indian bank account.
        </>
      }
      faqs={FAQS}
      cta={{
        heading: 'Pay in rupees, start today',
        body: 'One-time fee from ₹2,700 by UPI. Nothing recurring, and nothing to convert.',
      }}
    >
      <section className="pf-section pf-section--alt">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">Domestic vs international, side by side</h2>
          <p className="pf-lead mb-8" style={{ maxWidth: '62ch' }}>
            The rules of an evaluation are broadly similar wherever you go. What differs for someone
            sitting in India is everything around the money.
          </p>
          <div className="pf-card overflow-hidden">
            <div className="pf-scroll-x">
              <table className="pf-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th scope="col">&nbsp;</th>
                    <th scope="col">DhanFunded (India)</th>
                    <th scope="col">A typical international firm</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((c) => (
                    <tr key={c.row}>
                      <th scope="row">{c.row}</th>
                      <td>{c.pf}</td>
                      <td>{c.intl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="pf-small mt-4">
            The right-hand column describes the common pattern among firms that accept Indian
            participants; individual firms differ, so check each one's own terms.
          </p>
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">What it costs, in rupees</h2>
          <div className="pf-card overflow-hidden">
            <div className="pf-scroll-x">
              <table className="pf-table" style={{ minWidth: 620 }}>
                <thead>
                  <tr>
                    <th scope="col">Programme</th>
                    <th scope="col">One-time fee</th>
                    <th scope="col">Daily loss limit</th>
                    <th scope="col">Overall loss limit</th>
                    <th scope="col">Reward share</th>
                  </tr>
                </thead>
                <tbody>
                  {PROGRAMMES.map((p) => (
                    <tr key={p.key}>
                      <th scope="row">{p.name}</th>
                      <td>{p.fee}</td>
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
            Figures for a ₹1 Lakh account; larger sizes scale the same percentages. Full table on{' '}
            <Link to="/pricing" style={{ color: 'var(--pf-brand)' }}>pricing</Link>.
          </p>
        </div>
      </section>

      <section className="pf-section pf-section--alt">
        <div className="pf-wrap" style={{ maxWidth: 780 }}>
          <h2 className="pf-h2 mb-4">Stated plainly</h2>
          <p className="pf-body mb-6">
            DhanFunded is a software platform providing a simulated environment and a rules-based
            evaluation. It is not a broker, exchange member or investment adviser, is not registered
            with SEBI, and does not route orders to NSE or BSE. The fee buys access to the
            evaluation; any reward is a performance-based payment under the published programme
            terms, and how you declare it is between you and your CA.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/prop-firm-india" className="pf-btn pf-btn--ghost pf-btn--sm">Compare programmes</Link>
            <Link to="/funded-trading-account-india" className="pf-btn pf-btn--ghost pf-btn--sm">How payouts work</Link>
            <Link to="/terms" className="pf-btn pf-btn--ghost pf-btn--sm">Terms</Link>
          </div>
        </div>
      </section>
    </SeoLanding>
  );
}
