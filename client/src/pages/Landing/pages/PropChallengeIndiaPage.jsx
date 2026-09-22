import { Link } from 'react-router-dom';
import SeoLanding from '../components/SeoLanding';
import { PROGRAMMES, COMMON_RULES } from '../data/programmes';

/**
 * Search intent here is the CHALLENGE ITSELF — what you have to hit, what ends
 * the account, how long you get, what happens after you pass.
 *
 * /prop-firm-india answers "who are these people"; this page answers "what
 * exactly do I have to do". Every number is read from programmes.js, the file
 * verified against the challenges collection, so this page cannot drift away
 * from what the platform enforces.
 */
const FAQS = [
  {
    q: 'What is a prop challenge?',
    a: 'A rules-based assessment. You pay a one-time fee, then trade a simulated account and have to reach a published profit target without breaching a daily loss limit or an overall loss limit. Clear it and you are issued a funded account; breach a limit and the assessment ends.',
  },
  {
    q: 'How long does the challenge take?',
    a: 'There is a maximum window — 60 days for the 2-Step, 45 days for the 1-Step and 30 days for Instant Funding — and a minimum of 5 trading days. There is no reward for rushing: the minimum exists so a single lucky session cannot pass an account.',
  },
  {
    q: 'What happens if I hit the daily loss limit?',
    a: 'The account is closed and the assessment is over. The limit is measured against the starting balance, so on a ₹1 Lakh 2-Step account a 4% daily limit is exactly ₹4,000 — a figure you can check before every trade.',
  },
  {
    q: 'Can I retry if I fail?',
    a: 'Yes. A failed account can be reset once for a reduced fee, which restarts it with a clean balance and no trades. After that a new assessment has to be purchased.',
  },
  {
    q: 'Is the trading real?',
    a: 'The market data is real and live from NSE and BSE. The execution is simulated — orders do not reach the exchange. DhanFunded is not a broker, exchange or SEBI-registered intermediary.',
  },
  {
    q: 'What do I get for passing?',
    a: 'A funded account. From there a payout can be requested every 14 days once the account is at least 5% in profit over a minimum of 5 trading days, paid in rupees to the bank account in your approved KYC.',
  },
];

const cell = { padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.08)', fontSize: 14 };
const head = { ...cell, fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', opacity: .65 };

export default function PropChallengeIndiaPage() {
  return (
    <SeoLanding
      seo={{
        path: '/prop-challenge-india',
        title: 'Prop Challenge India — Rules, Targets & Loss Limits | DhanFunded',
        description:
          'What a prop trading challenge in India actually asks of you: profit targets, daily and overall loss limits, time windows and what happens after you pass. Fees from ₹2,700, one-time.',
      }}
      h1="Prop Trading Challenge in India: the rules, in full"
      intro={
        <>
          A prop challenge is not a subscription and not a course. You pay once, trade a simulated
          account on live NSE and BSE index data, and have to reach a published profit target
          without breaching two loss limits. Every figure below is the figure the platform
          enforces — nothing here is rounded for marketing.
        </>
      }
      faqs={FAQS}
      cta={{
        heading: 'See the programmes side by side',
        body: 'Three routes with different targets, limits and windows. The fee is one-time in every case.',
      }}
    >
      <h2 className="pf-h2">What you have to hit</h2>
      <p className="pf-body">
        Three programmes, three sets of numbers. The rupee figures shown are for a ₹1 Lakh
        account; every limit scales with the account size you choose, from ₹1 Lakh up to ₹50 Lakh
        depending on the programme.
      </p>

      <div style={{ overflowX: 'auto', margin: '18px 0 8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }}>Programme</th>
              <th style={{ ...head, textAlign: 'left' }}>Profit target</th>
              <th style={{ ...head, textAlign: 'left' }}>Daily loss limit</th>
              <th style={{ ...head, textAlign: 'left' }}>Overall loss limit</th>
              <th style={{ ...head, textAlign: 'left' }}>Window</th>
              <th style={{ ...head, textAlign: 'left' }}>Fee</th>
            </tr>
          </thead>
          <tbody>
            {PROGRAMMES.map((p) => (
              <tr key={p.key}>
                <td style={{ ...cell, fontWeight: 700 }}>{p.name}</td>
                <td style={cell}>{p.target}<br /><span style={{ opacity: .6, fontSize: 12.5 }}>{p.targetRupees}</span></td>
                <td style={cell}>{p.daily}<br /><span style={{ opacity: .6, fontSize: 12.5 }}>{p.dailyRupees}</span></td>
                <td style={cell}>{p.overall}<br /><span style={{ opacity: .6, fontSize: 12.5 }}>{p.overallRupees}</span></td>
                <td style={cell}>{p.window}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{p.fee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="pf-h2">What ends a challenge</h2>
      <p className="pf-body">
        Two things, and only two: breaching the daily loss limit, or breaching the overall loss
        limit. Both are measured against the starting balance rather than a trailing high-water
        mark, which means the rupee figure that fails your account is fixed on day one and does
        not move as you make profit. The platform enforces them automatically — there is no
        discretionary review and no manual override.
      </p>
      <p className="pf-body">
        Running out of time does not fail you punitively; the assessment simply expires if the
        target has not been reached inside the window.
      </p>

      <h2 className="pf-h2">Rules that apply to every programme</h2>
      <div style={{ overflowX: 'auto', margin: '14px 0 8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
          <tbody>
            {COMMON_RULES.map((r) => (
              <tr key={r.rule}>
                <td style={{ ...cell, opacity: .8 }}>{r.rule}</td>
                <td style={{ ...cell, fontWeight: 700, textAlign: 'right' }}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pf-body">
        The minimum-trading-days rule and the cap on how much of the target can come from a single
        day exist for the same reason: the assessment is trying to measure consistency, so one
        outsized session cannot carry an account through on its own.
      </p>

      <h2 className="pf-h2">What you can trade</h2>
      <p className="pf-body">
        Index derivatives only — <Link to="/nifty-prop-firm">NIFTY</Link> and{' '}
        <Link to="/banknifty-prop-firm">BANKNIFTY</Link> on the NSE, and{' '}
        <Link to="/sensex-prop-firm">SENSEX</Link> on the BSE. No forex, no crypto, no
        commodities. Positions cannot be carried overnight or over a weekend, so every assessment
        is an intraday exercise.
      </p>

      <h2 className="pf-h2">After you pass</h2>
      <p className="pf-body">
        You are issued a{' '}
        <Link to="/funded-trading-account-india">funded trading account</Link>. There is no second
        fee at that point. A payout can be requested every 14 days once the account is at least 5%
        in profit across a minimum of 5 trading days, and the performance share — 80% on the
        1-Step and 2-Step, 70% on Instant Funding — is paid in rupees to the bank account in your
        approved KYC.
      </p>

      <h2 className="pf-h2">If you fail</h2>
      <p className="pf-body">
        A failed account can be reset once for a reduced fee, which restarts it with the original
        balance and no trade history. After that, a fresh assessment has to be purchased. Most
        people who fail do so on the daily limit rather than the overall one, which is why the
        daily figure is worth writing down before you start.
      </p>

      <h2 className="pf-h2">Where to read more</h2>
      <p className="pf-body">
        The <Link to="/how-it-works">how it works</Link> page walks through the flow end to end,{' '}
        <Link to="/pricing">pricing</Link> lists every size and fee, and{' '}
        <Link to="/prop-firm-india">prop firm in India</Link> covers what DhanFunded is and is
        not. For the legal position, see the{' '}
        <Link to="/risk-disclaimer">risk disclaimer</Link>.
      </p>
    </SeoLanding>
  );
}
