import { Link } from 'react-router-dom';
import SeoLanding from '../components/SeoLanding';
import { PROGRAMMES } from '../data/programmes';

/**
 * Target query family: "prop trading india", "proprietary trading firm india",
 * "what is prop trading", "prop trading kya hai", "is prop trading safe".
 *
 * Informational intent, not commercial. It earns its place by answering the
 * question honestly — including the parts that are a reason not to pay a fee —
 * and links to the commercial pages rather than pretending to be one.
 */

const CHECKS = [
  {
    h: 'Are the rules published before you pay?',
    p: 'Every limit that can end your account should be visible, in rupees, on a public page. If the daily limit only appears in a PDF after payment, that is the whole answer.',
  },
  {
    h: 'Is there a hidden consistency rule?',
    p: 'Some firms void a pass if one day contributed too much of the profit. It is a legitimate rule, but it has to be stated up front. DhanFunded caps a single day at 40% of the target and says so before you buy.',
  },
  {
    h: 'Is the fee one-time, or a subscription?',
    p: 'A monthly charge that continues while you are still evaluating changes the maths completely. Check whether the funded account itself costs extra.',
  },
  {
    h: 'How and when does money actually leave?',
    p: 'Look for a fixed cycle, a stated minimum profit, and payment to your own bank account. Vague "on request" wording usually means discretion sits with the firm.',
  },
  {
    h: 'Is it simulated, and does the firm say so?',
    p: 'Most evaluation platforms in India, DhanFunded included, are simulated on live prices — nothing reaches NSE or BSE. That is not a problem in itself. A firm that is vague about it is.',
  },
];

const FAQS = [
  {
    q: 'What is prop trading?',
    a: 'Proprietary trading means trading a firm\'s capital rather than your own, and sharing the profit with it. The modern retail version is an evaluation: you pay a one-time fee, prove you can work inside a fixed set of risk limits, and are then given a larger account whose profit you share.',
  },
  {
    q: 'How does prop trading work in India?',
    a: 'Indian platforms run the evaluation in a simulated environment on live NSE and BSE prices. You trade index derivatives — NIFTY, BANKNIFTY, SENSEX — against published daily and overall loss limits. Clear the target without breaching a limit and a funded account is issued; the profit share is paid in INR to your bank account.',
  },
  {
    q: 'Is DhanFunded SEBI registered?',
    a: 'No, and no evaluation platform of this type is. DhanFunded is not a broker, exchange member, investment adviser or portfolio manager. It does not route orders to an exchange, does not hold client funds for trading, and gives no advice or recommendations. What you buy is entry to a skill assessment with published rules.',
  },
  {
    q: 'What does it cost to start?',
    a: 'On DhanFunded, ₹2,700 for the 2-Step assessment on a ₹1,00,000 account. The 1-Step is ₹3,900 and Instant Funding is ₹4,100. All three are one-time fees with no subscription.',
  },
  {
    q: 'What can I lose?',
    a: 'The assessment fee, and the account if you breach a limit. You never deposit trading capital, you are never asked to cover a loss, and you cannot lose more than the fee you paid. The fee is non-refundable once the account is issued.',
  },
  {
    q: 'How many people clear an assessment?',
    a: 'Across the industry, most do not — a rules-based evaluation is designed to be hard, and the daily loss limit ends far more accounts than the profit target does. Treat any firm quoting a high pass rate with scepticism.',
  },
];

export default function PropTradingIndiaPage() {
  return (
    <SeoLanding
      seo={{
        path: '/prop-trading-india',
        title: 'Prop Trading in India — How It Works and What to Check | DhanFunded',
        description:
          'What proprietary trading means in India, how a simulated evaluation actually works on NSE and BSE index options, what it costs, what you can lose, and the five things to check before paying any firm a fee.',
      }}
      h1="Prop Trading in India — How It Actually Works"
      intro={
        <>
          Proprietary trading means trading someone else's capital and sharing the profit. In India
          that has settled into one common shape: pay a one-time fee, clear a rules-based assessment
          on index derivatives, and receive a funded account paid out in rupees. This page explains
          the model, what it costs, and what to check before you hand any firm money — including us.
        </>
      }
      faqs={FAQS}
      cta={{
        heading: 'If the model suits you, start small',
        body: 'The 2-Step assessment is the cheapest way to find out whether you can work inside a fixed daily limit.',
      }}
    >
      <section className="pf-section pf-section--alt">
        <div className="pf-wrap" style={{ maxWidth: 820 }}>
          <h2 className="pf-h2 mb-4">The model in four sentences</h2>
          <p className="pf-body mb-3">
            You pay a one-time assessment fee. You trade index options on live NSE and BSE prices
            inside a daily loss limit and an overall loss limit, both fixed in rupees before you
            start.
          </p>
          <p className="pf-body mb-3">
            Reach the profit target without breaching either limit and a funded account of the same
            size is issued to you at no further cost. From then on you keep an agreed share of the
            profit the account records — 80% on the evaluation programmes, 70% on instant funding —
            paid to your Indian bank account on a 14-day cycle.
          </p>
          <p className="pf-body">
            Breach a limit at any point, in the assessment or afterwards, and the account ends. That
            is the entire arrangement; everything else is detail.
          </p>
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">What an assessment costs in India</h2>
          <p className="pf-lead mb-8" style={{ maxWidth: '62ch' }}>
            DhanFunded's own figures, on a ₹1,00,000 account. Use them as a yardstick when you
            compare firms — the fee alone tells you very little without the limits beside it.
          </p>
          <div className="pf-card overflow-hidden">
            <div className="pf-scroll-x">
              <table className="pf-table" style={{ minWidth: 680 }}>
                <thead>
                  <tr>
                    <th scope="col">Programme</th>
                    <th scope="col">One-time fee</th>
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

      <section className="pf-section pf-section--alt">
        <div className="pf-wrap">
          <h2 className="pf-h2 mb-4">Five things to check before paying any prop firm</h2>
          <p className="pf-lead mb-8" style={{ maxWidth: '62ch' }}>
            This list is not written to favour us. Run it against this site as strictly as you would
            against any other.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {CHECKS.map((c, i) => (
              <div key={c.h} className="pf-card p-6">
                <span className="pf-small" style={{ color: 'var(--pf-brand)', fontWeight: 700 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="pf-h3 mt-1 mb-2">{c.h}</h3>
                <p className="pf-body" style={{ margin: 0 }}>{c.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-wrap" style={{ maxWidth: 780 }}>
          <h2 className="pf-h2 mb-4">Where DhanFunded stands</h2>
          <p className="pf-body mb-4">
            Indian market only — NIFTY, BANKNIFTY and SENSEX index options, priced and paid in
            rupees. No forex, no crypto, no USD conversion on the way in or out. Assessments run in
            a simulated environment on live market data; orders are not routed to NSE or BSE and no
            position exists on an exchange.
          </p>
          <p className="pf-body mb-6">
            DhanFunded is not a broker, exchange member, investment adviser or portfolio manager and
            is not SEBI registered. No trading advice, tips or recommendations are provided.
            Participation risks the assessment fee, and past performance does not indicate future
            results.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/prop-firm-india" className="pf-btn pf-btn--ghost pf-btn--sm">Compare programmes</Link>
            <Link to="/funded-trading-account-india" className="pf-btn pf-btn--ghost pf-btn--sm">Funded accounts</Link>
            <Link to="/blog/how-prop-firms-work" className="pf-btn pf-btn--ghost pf-btn--sm">How prop firms work</Link>
          </div>
        </div>
      </section>
    </SeoLanding>
  );
}
