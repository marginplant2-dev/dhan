import LegalPageShell from './LegalPageShell';

export default function RiskDisclaimer() {
  return (
    <LegalPageShell
      title="Risk Disclaimer"
      subtitle="Please read carefully before using the Platform"
      lastUpdated="March 2025"
    >
      <section className="terms-section warning-section">
        <h2>High-risk activity</h2>
        <p>
          <strong>
            Participation in forex, CFDs, cryptocurrencies, derivatives, and other leveraged products involves substantial risk of
            loss.
          </strong>{' '}
          You should not participate with money you cannot afford to lose. Leverage can amplify both gains and losses.
        </p>
      </section>

      <section className="terms-section">
        <h2>1. No investment advice</h2>
        <p>
          Nothing on the Platform constitutes financial, investment, tax, or legal advice. DhanFunded provides simulation and
          technology services. All decisions are yours alone.
        </p>
      </section>

      <section className="terms-section">
        <h2>2. Market risks</h2>
        <ul>
          <li>Prices can move rapidly; slippage and gaps may occur</li>
          <li>Past performance does not predict future results</li>
          <li>Liquidity may be limited in some instruments or sessions</li>
          <li>Technical outages, latency, or third-party feed issues can affect orders</li>
        </ul>
      </section>

      <section className="terms-section">
        <h2>3. Leverage &amp; margin</h2>
        <p>
          Using margin or leverage means you can lose more than your initial deposit in some products or under extreme
          conditions. Monitor margin requirements and stop-out levels at all times.
        </p>
      </section>

      <section className="terms-section">
        <h2>4. Regulatory &amp; tax</h2>
        <p>
          You are responsible for compliance with laws in your country of residence. Services may not be available in all
          jurisdictions. Tax treatment of market gains or losses is your responsibility; consult a qualified
          professional.
        </p>
      </section>

      <section className="terms-section">
        <h2>5. Third-party data &amp; tools</h2>
        <p>
          Charts, news, or data from third parties (including charting providers) are for information only. We do not
          warrant accuracy, timeliness, or completeness of external content.
        </p>
      </section>

      <section className="terms-section disclaimer-section">
        <h2>Acknowledgement</h2>
        <p>
          By using DhanFunded, you acknowledge that you understand these risks and that you trade at your own risk. If you
          do not agree, do not use the Platform.
        </p>
        <p>
          <strong>Participate responsibly. Consider using a demo account before going live.</strong>
        </p>
      </section>
    </LegalPageShell>
  );
}
