import { Link } from 'react-router-dom';
import LegalPageShell from './LegalPageShell';

export default function PrivacyPolicy() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      subtitle="What DhanFunded collects about you, why we need it, and the choices you have"
      lastUpdated="25 November 2026"
    >
      <section className="terms-section disclaimer-section">
        <h2>At a glance</h2>
        <ul>
          <li>Your personal data is never sold.</li>
          <li>We collect what is needed to run your account, keep it secure, process payments and meet our legal duties.</li>
          <li>
            You can ask to see, correct or delete your data, using the details on our{' '}
            <Link to="/contact-us">contact page</Link>.
          </li>
        </ul>
      </section>

      <section className="terms-section">
        <h2>1. What this policy covers</h2>
        <p>
          DhanFunded (“we”, “us” or “our”) takes your privacy seriously. This policy explains what we do with
          personal data when you use our website, our apps or any related service. Together we call these the
          “Platform”.
        </p>
      </section>

      <section className="terms-section">
        <h2>2. The data we hold about you</h2>
        <ul>
          <li>
            <strong>Sign-up details:</strong> the name, email address, phone number, country and login credentials
            you give us when you register.
          </li>
          <li>
            <strong>How you use the Platform:</strong> your device type and browser, your IP address, a rough idea
            of your location, the pages you open and what you do on them.
          </li>
          <li>
            <strong>Trading and money records:</strong> your orders, positions and wallet activity, plus KYC
            documents in cases where compliance requires them.
          </li>
          <li>
            <strong>Support conversations:</strong> what you write to our support team, and our replies.
          </li>
        </ul>
      </section>

      <section className="terms-section">
        <h2>3. Why we use it</h2>
        <p>Your personal data helps us to:</p>
        <ul>
          <li>run the Platform, keep it working and make it better</li>
          <li>confirm that the person logging in is really you, and stop fraud</li>
          <li>handle deposits, withdrawals and trading activity</li>
          <li>satisfy legal, regulatory and audit requirements</li>
          <li>
            send you notices about the service and, where the law permits it, marketing messages, which you can opt
            out of where that option applies
          </li>
        </ul>
      </section>

      <section className="terms-section">
        <h2>4. Who else sees it</h2>
        <p>
          We never sell personal data. Some of it does reach companies that work for us, such as our hosting,
          email, analytics and payment processing providers, and each of them must keep it strictly confidential.
          We also hand information to the authorities when the law requires it, or when we need to protect our
          rights or the safety of our users.
        </p>
      </section>

      <section className="terms-section">
        <h2>5. Cookies and local storage</h2>
        <p>
          The Platform uses cookies and your browser’s local storage where they are needed: to keep you logged in,
          to remember your preferences, for security and for analytics. You can manage cookies in your browser
          settings. If you switch some of them off, parts of the Platform may stop working properly.
        </p>
      </section>

      <section className="terms-section">
        <h2>6. How long we keep it, and how we protect it</h2>
        <p>
          We hold your data while your account stays active, and for any longer period the law or our legitimate
          business needs require.
        </p>
        <p>
          We use technical and organisational safeguards to protect it. Still, sending data over the internet can
          never be made completely secure, whatever method is used.
        </p>
      </section>

      <section className="terms-section">
        <h2>7. Your rights over your data</h2>
        <p>
          Depending on the law where you live, you may be able to see your data, have it corrected or deleted, limit
          how we process it, or object to some kinds of processing. Make a request through the contact details
          shown on the Platform. Before we act on it, we may have to confirm who you are.
        </p>
      </section>

      <section className="terms-section disclaimer-section">
        <h2>8. Updates and privacy questions</h2>
        <p>
          This policy may change from time to time. If you keep using the Platform after a change, that means you
          accept the new version.
        </p>
        <p>
          For any privacy question, use one of the official support channels the Platform lists. They are also on our <Link to="/contact-us">contact page</Link>. How the Platform may be used is set out in
          our <Link to="/terms">Terms and Conditions</Link>.
        </p>
      </section>
    </LegalPageShell>
  );
}
