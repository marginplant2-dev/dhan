import { Link } from 'react-router-dom';
import SeoLanding from '../components/SeoLanding';
import { PROGRAMMES, COMMON_RULES } from '../data/programmes';

/**
 * Target query family: "funded trading account india", "how to get a funded
 * account in india", "funded trader program india".
 *
 * Deliberately NOT a rewrite of /prop-firm-india. That page compares the three
 * programmes; this one answers the question that comes after — what a funded
 * account actually is here, and how the money reaches your bank.
 */

const STEPS = [
  {
    n: '1',
    h: 'Buy one assessment',
    p: 'One-time fee from ₹2,700. No subscription, no monthly charge, and no second payment when a funded account is issued.',
  },
  {
    n: '2',
    h: 'Trade inside the published limits',
    p: 'Live NSE and BSE prices, simulated execution. Your daily and overall loss limits are fixed in rupees from day one.',
  },
  {
    n: '3',
    h: 'Reach the profit target',
    p: '8% then 5% on the 2-Step, 10% in one phase on the 1-Step. Instant Funding has no assessment phase at all.',
  },
  {
    n: '4',
    h: 'The funded account is issued',
    p: 'A fresh account at the size you bought, with its own isolated balance. Nothing carries over from the assessment except the pass.',
  },
  {
    n: '5',
    h: 'Request a payout every 14 days',
    p: 'Once the account is 5% in profit over at least 5 trading days, your share is paid in INR to the bank account in your KYC.',
  },
];

const FAQS = [
  {
    q: 'How do I get a funded trading account in India?',
    a: 'Clear one assessment. You buy a single assessment for a one-time fee from ₹2,700, reach the published profit target without breaching the daily or overall loss limit, and a funded account of the same size is issued to you. There is no second fee at that point.',
  },
  {
    q: 'Is the funded account real money on an exchange?',
    a: 'No. Every account on DhanFunded — assessment and funded — runs in a simulated environment on live NSE and BSE prices. Orders are not routed to an exchange. The payout you receive is real INR, paid by DhanFunded under the published programme terms.',
  },
  {
    q: 'When can I withdraw, and how does the money arrive?',
    a: 'A payout can be requested every 14 days, once the account is at least 5% in profit and you have traded on at least 5 days. It is paid in Indian rupees by bank transfer to the account in your approved KYC. Payouts to a third-party account are not permitted.',
  },
  {
    q: 'What account size do I get?',
    a: '₹1 Lakh to ₹50 Lakh, depending on the programme: the 2-Step goes up to ₹10 Lakh, the 1-Step to ₹25 Lakh and Instant Funding to ₹50 Lakh. The loss limits and profit target scale with the size you choose, so every rule has an exact rupee value you can check before you place a trade.',
  },
  {
    q: 'What happens if I breach a limit on a funded account?',
    a: 'The account ends. The platform enforces the limits automatically, so a breach is closed out at the moment it happens rather than reviewed afterwards. Starting again means buying a new assessment.',
  },
  {
    q: 'Do I need my own trading capital?',
    a: 'Beyond the one-time assessment fee, no. You never deposit trading capital and you are never asked to cover a loss.',
  },
];

export default function FundedAccountIndiaPage() {
  return (
    <SeoLanding
      seo={{
        path: '/funded-trading-account-india',
        title: 'Funded Trading Account in India — Get Funded from ₹2,700 | DhanFunded',
        description:
          'How to get a funded trading account in India: one assessment from ₹2,700 on a ₹1 Lakh account, loss limits published in rupees, and 80% of the profit paid to your Indian bank account every 14 days.',
      }}
      h1="Funded Trading Account in India"
      intro={
        <>
          A funded account here means one thing: you cleared a rules-based assessment on NIFTY,
          BANKNIFTY or SENSEX, and you now trade an account whose profit share is paid to you in
          rupees. You pay once for the assessment, you never deposit trading capital, and every
          limit that can end the account is published before you start.
        </>
      }
      faqs={FAQS}
      cta={{
        heading: 'Start with one assessment',
        body: 'The fee is one-time. Clear it and the funded account costs nothing extra.',
      }}
    >
      <section className="pf-section pf-section--alt">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">From fee to first payout</h2>
          <p className="pf-lead mb-9" style={{ maxWidth: '62ch' }}>
            Five steps, and none of them involve a sales call or a negotiated exception.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {STEPS.map((s) => (
              <div key={s.n} className="pf-card p-6">
                <span
                  className="pf-tile mb-3"
                  style={{ width: 34, height: 34, background: 'var(--pf-green-soft)', color: 'var(--pf-green)', fontWeight: 800 }}
                >
                  {s.n}
                </span>
                <h3 className="pf-h3 mb-2">{s.h}</h3>
                <p className="pf-body" style={{ margin: 0 }}>{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">What the limits work out to in rupees</h2>
          <p className="pf-lead mb-8" style={{ maxWidth: '62ch' }}>
            Percentages are easy to misread when you are sizing a position, so here they are as
            money. Shown for a ₹1,00,000 account; the daily limit is measured against the balance
            you started the day with.
          </p>
          <div className="pf-card overflow-hidden">
            <div className="pf-scroll-x">
              <table className="pf-table" style={{ minWidth: 680 }}>
                <thead>
                  <tr>
                    <th scope="col">Programme</th>
                    <th scope="col">Fee</th>
                    <th scope="col">Target</th>
                    <th scope="col">Daily loss limit</th>
                    <th scope="col">Overall loss limit</th>
                    <th scope="col">Your share</th>
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
        </div>
      </section>

      <section className="pf-section pf-section--alt">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">Rules that are the same on every programme</h2>
          <div className="pf-card overflow-hidden" style={{ maxWidth: 720 }}>
            <div className="pf-scroll-x">
              <table className="pf-table" style={{ minWidth: 480 }}>
                <tbody>
                  {COMMON_RULES.map((r) => (
                    <tr key={r.rule}>
                      <th scope="row">{r.rule}</th>
                      <td>{r.value}</td>
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
          <h2 className="pf-h2 mb-4">The part most pages leave out</h2>
          <p className="pf-body mb-4">
            A funded account is not a job and it is not capital lent to you. It is a simulated
            account sized to match what you proved in the assessment, and DhanFunded pays your share
            of the profit it records. Nothing is routed to NSE or BSE, no position exists on an
            exchange, and DhanFunded is not a broker, exchange member or investment adviser.
          </p>
          <p className="pf-body mb-6">
            That also makes the risk specific and limited: you can lose the assessment fee, and you
            can lose the account by breaching a limit. You cannot lose more than the fee you paid,
            and you will never be asked to add funds.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/prop-firm-india" className="pf-btn pf-btn--ghost pf-btn--sm">Compare programmes</Link>
            <Link to="/blog/how-payouts-work" className="pf-btn pf-btn--ghost pf-btn--sm">How payouts work</Link>
            <Link to="/risk-disclaimer" className="pf-btn pf-btn--ghost pf-btn--sm">Risk disclaimer</Link>
          </div>
        </div>
      </section>
    </SeoLanding>
  );
}
