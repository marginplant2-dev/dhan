import { Link } from 'react-router-dom';
import LegalPageShell from './LegalPageShell';

export default function RefundPolicy() {
  return (
    <LegalPageShell
      title="Cancellation and Refund Policy"
      subtitle="When an order can be cancelled, how to report a problem and how long a refund takes"
      lastUpdated="25 November 2026"
    >
      <section className="terms-section">
        <p>
          This policy is issued by VENKATA SRINIVASREDDY MEDAPATI. Our aim is to help customers wherever we can,
          so the rules on cancellation are kept generous. They are set out below.
        </p>
      </section>

      <section className="terms-section disclaimer-section">
        <h2>Key time limits</h2>
        <ul>
          <li><strong>Cancelling:</strong> ask straight after you place the order.</li>
          <li><strong>Damaged, defective or not as described:</strong> tell us on the day you receive it.</li>
          <li><strong>Approved refunds:</strong> 16–30 days to reach you.</li>
        </ul>
      </section>

      <section className="terms-section">
        <h2>1. Cancelling an order</h2>
        <p>
          We consider a cancellation only if you ask for it straight after placing the order. If the order has
          already gone to the vendor or merchant, and they have begun shipping it, your cancellation request may be
          turned down.
        </p>
      </section>

      <section className="terms-section">
        <h2>2. Perishable items</h2>
        <p>
          Perishable items, such as flowers and food, cannot be cancelled. If you can show that the quality of what
          was delivered is poor, a refund or a replacement can still be given.
        </p>
      </section>

      <section className="terms-section">
        <h2>3. Damaged, defective or not what you expected</h2>
        <ul>
          <li>
            If an item reaches you damaged or defective, tell our Customer Service team on the day you receive it.
            We act on the request once the merchant has checked the item on their side and confirmed the problem.
          </li>
          <li>
            If the product does not match what the site showed, or falls short of what you expected, raise it with
            Customer Service on the day you receive it. The team will look into your complaint and then decide what
            should be done.
          </li>
        </ul>
        <p>
          You can reach Customer Service through our <Link to="/contact-us">contact page</Link>.
        </p>
      </section>

      <section className="terms-section">
        <h2>4. Items covered by a manufacturer’s warranty</h2>
        <p>If a product comes with a warranty from its manufacturer, take any complaint about it to the manufacturer.</p>
      </section>

      <section className="terms-section">
        <h2>5. How long a refund takes</h2>
        <p>
          Once VENKATA SRINIVASREDDY MEDAPATI approves a refund, processing it and getting the money to you takes 16
          to 30 days.
        </p>
        <p>
          Our <Link to="/terms">Terms and Conditions</Link> also explain when you can claim a refund if we cannot
          provide a Service you paid for.
        </p>
      </section>
    </LegalPageShell>
  );
}
