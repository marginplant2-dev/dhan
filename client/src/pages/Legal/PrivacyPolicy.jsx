import LegalPageShell from './LegalPageShell';

export default function PrivacyPolicy() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your information"
      lastUpdated="March 2025"
    >
      <section className="terms-section">
        <h2>1. Introduction</h2>
        <p>
          DhanFunded (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) respects your privacy. This policy describes how we handle
          personal data when you use our website, applications, and related services (the &quot;Platform&quot;).
        </p>
      </section>

      <section className="terms-section">
        <h2>2. Information we collect</h2>
        <ul>
          <li>
            <strong>Account data:</strong> name, email, phone, country, and credentials you provide at registration.
          </li>
          <li>
            <strong>Usage data:</strong> device type, browser, IP address, approximate location, pages viewed, and
            interactions with the Platform.
          </li>
          <li>
            <strong>Market &amp; financial data:</strong> orders, positions, wallet activity, and KYC documents where
            required for compliance.
          </li>
          <li>
            <strong>Communications:</strong> messages you send to support and responses we send to you.
          </li>
        </ul>
      </section>

      <section className="terms-section">
        <h2>3. How we use information</h2>
        <p>We use personal data to:</p>
        <ul>
          <li>Provide, operate, and improve the Platform</li>
          <li>Authenticate users and prevent fraud</li>
          <li>Process deposits, withdrawals, and market activity</li>
          <li>Meet legal, regulatory, and audit requirements</li>
          <li>Send service-related notices and, where permitted, marketing (you may opt out where applicable)</li>
        </ul>
      </section>

      <section className="terms-section">
        <h2>4. Sharing &amp; disclosure</h2>
        <p>
          We do not sell your personal data. We may share information with service providers (hosting, email, analytics,
          payment processors) under strict confidentiality, and with authorities when required by law or to protect our
          rights and users&apos; safety.
        </p>
      </section>

      <section className="terms-section">
        <h2>5. Cookies &amp; similar technologies</h2>
        <p>
          We use cookies and local storage where needed for login sessions, preferences, security, and analytics. You can
          control cookies through your browser settings; disabling some cookies may limit Platform functionality.
        </p>
      </section>

      <section className="terms-section">
        <h2>6. Data retention &amp; security</h2>
        <p>
          We retain data as long as your account is active and as required by law or legitimate business needs. We apply
          technical and organizational measures to protect data; no method of transmission over the internet is 100%
          secure.
        </p>
      </section>

      <section className="terms-section">
        <h2>7. Your rights</h2>
        <p>
          Depending on your jurisdiction, you may have rights to access, correct, delete, or restrict processing of your
          data, or to object to certain processing. Contact us using the details on the Platform to make a request. We may
          need to verify your identity before responding.
        </p>
      </section>

      <section className="terms-section disclaimer-section">
        <h2>8. Changes &amp; contact</h2>
        <p>
          We may update this policy from time to time. Continued use after changes constitutes acceptance of the updated
          policy. For privacy questions, contact us through the official support channels listed on the Platform.
        </p>
      </section>
    </LegalPageShell>
  );
}
