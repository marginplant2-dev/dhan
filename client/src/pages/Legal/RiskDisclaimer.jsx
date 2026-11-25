import { Link } from 'react-router-dom';
import LegalPageShell from './LegalPageShell';

export default function RiskDisclaimer() {
  return (
    <LegalPageShell
      title="Risk Disclaimer"
      subtitle="Read this before you pay for an evaluation or place a trade on DhanFunded"
      lastUpdated="25 November 2026"
    >
      <section className="terms-section warning-section">
        <h2>Leveraged trading can lose you money quickly</h2>
        <p>
          <strong>
            Derivatives, forex, CFDs, cryptocurrencies and every other leveraged product carry a substantial risk of
            loss.
          </strong>{' '}
          Only take part with money you can afford to lose. Leverage makes gains bigger, and it makes losses bigger
          too.
        </p>
      </section>

      <section className="terms-section">
        <h2>1. We are not your adviser</h2>
        <p>
          Nothing on the Platform is financial, investment, tax or legal advice. DhanFunded supplies simulation
          and technology services. Our evaluations run in a simulated environment on Indian index derivatives such
          as NIFTY, BANKNIFTY and SENSEX, and you can see what is on offer on the{' '}
          <Link to="/instruments">instruments page</Link>. Every decision you make there is yours alone.
        </p>
      </section>

      <section className="terms-section">
        <h2>2. How the market can move against you</h2>
        <ul>
          <li>Prices can change very fast, so your order may fill at a worse price (slippage) or the price may jump past it (a gap).</li>
          <li>Results you had before are no prediction of results to come.</li>
          <li>Some instruments, and some times of the trading day, may have little liquidity.</li>
          <li>Outages, delays in the system and faults in data feeds supplied by third parties can all affect your orders.</li>
        </ul>
      </section>

      <section className="terms-section">
        <h2>3. Margin and leverage</h2>
        <p>
          When you trade on margin or with leverage, some products, or extreme market conditions, can leave you
          with a loss bigger than the deposit you started with. Keep a constant eye on margin requirements and on
          stop-out levels.
        </p>
      </section>

      <section className="terms-section">
        <h2>4. Your local laws and your tax</h2>
        <p>
          It is your job to follow the laws of the country where you live, and our services are not offered in
          every jurisdiction. How any trading gain or loss is taxed is also your responsibility. Ask a qualified
          professional for help.
        </p>
      </section>

      <section className="terms-section">
        <h2>5. Charts, news and data from other providers</h2>
        <p>
          Charts, news and data supplied by third parties, charting providers among them, are there for
          information only. We give no warranty that this outside content is accurate, complete or up to date.
        </p>
      </section>

      <section className="terms-section disclaimer-section">
        <h2>Your acknowledgement</h2>
        <p>
          When you use DhanFunded, you confirm that you understand these risks and that any trading you do is at
          your own risk. If you do not agree, please do not use the Platform. Our{' '}
          <Link to="/terms">Terms and Conditions</Link> set out the rest of the agreement, and the{' '}
          <Link to="/how-it-works">How it works</Link> page walks through the evaluation step by step.
        </p>
        <p>
          <strong>Trade responsibly, and try a demo account before you go live.</strong>
        </p>
      </section>
    </LegalPageShell>
  );
}
