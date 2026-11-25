import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

// Homepage short list. The full set lives on /faqs (DB-backed, see FAQsPage).
// Every figure here is taken from data/programmes.js or the server rules.
const FAQS = [
  {
    q: 'How does DhanFunded work?',
    a: 'You buy an evaluation once, then trade NIFTY, BANKNIFTY or SENSEX options on a simulated account at live prices. Hit the profit target without breaking a loss limit and you get a funded account, where you keep 80% of the profit (70% on Instant Funding).',
  },
  {
    q: 'Is DhanFunded a SEBI-registered broker?',
    a: 'No. DhanFunded is not a stockbroker or an investment adviser and is not registered with SEBI. Your orders are filled inside our simulation and never reach NSE or BSE. The fee pays for an evaluation of your trading, not for access to the market.',
  },
  {
    q: 'Can I trade BANKNIFTY options in the evaluation?',
    a: 'Yes. BANKNIFTY, NIFTY and SENSEX options are all open, for buying and for selling. You cannot trade futures, carry a position overnight, or run copy or algo strategies.',
  },
  {
    q: 'What happens if I break the daily loss limit?',
    a: 'The evaluation ends there. On a ₹1 Lakh 2-Step account the daily limit is 4% of the starting balance, so a ₹4,000 loss in one day closes it. Each plan also has an overall loss limit, and anything still open at 3:15 PM IST is squared off automatically.',
  },
  {
    q: 'How do payouts work in India?',
    a: 'Finish KYC and your funded account can request its first payout after 14 days funded, five trading days and 5% profit, with no single day above 30% of that profit. After that you can request every 14 days. The money is paid in INR to a verified bank account in your name.',
  },
  {
    q: 'Can I get my evaluation fee back?',
    a: 'Only if a payment was taken in error. Pass or fail, the fee covers the evaluation itself. A failed account can be reset for half the original fee, which is ₹1,350 on a ₹2,700 evaluation.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState(0);

  return (
    <section className="pf-section">
      <div className="pf-wrap grid lg:grid-cols-3 gap-10 lg:gap-16">
        <div>
          <p className="pf-eyebrow mb-4">FAQs</p>
          <h2 className="pf-h2 mb-5">Prop firm questions, answered before you pay</h2>
          <p className="pf-lead mb-7">What you can trade, what closes an account and how the money reaches your bank.</p>
          <Link to="/faqs" className="pf-btn pf-btn--ghost">See every question</Link>
        </div>

        <div className="lg:col-span-2 space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div
                key={f.q}
                className="pf-card pf-card--flat overflow-hidden"
                style={{ borderRadius: 18, borderColor: isOpen ? 'var(--pf-brand)' : 'var(--pf-border)' }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-[.98rem] font-semibold" style={{ color: isOpen ? 'var(--pf-brand)' : 'var(--pf-text)' }}>
                    {f.q}
                  </span>
                  <ChevronDown
                    size={17}
                    className={`shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                    style={{ color: isOpen ? 'var(--pf-brand)' : 'var(--pf-faint)' }}
                  />
                </button>
                <div
                  className="overflow-hidden"
                  style={{ maxHeight: isOpen ? 320 : 0, opacity: isOpen ? 1 : 0, transition: 'max-height .38s ease, opacity .28s ease' }}
                >
                  <p className="pf-body px-5 pb-5">{f.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
