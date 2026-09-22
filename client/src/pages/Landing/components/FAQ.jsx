import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    q: 'What is DhanFunded?',
    a: 'DhanFunded is a simulated assessment platform built for Indian intraday participants. You operate with virtual capital under published risk rules and earn a performance share on successful completion.',
  },
  {
    q: 'Is this legal in India?',
    a: 'Yes. DhanFunded runs as a simulated evaluation platform. It is not a broker or a SEBI-registered intermediary, and no orders reach the exchange. Simulated participation is legal in India.',
  },
  {
    q: 'Which instruments can I be assessed on?',
    a: 'NIFTY, BANKNIFTY and SENSEX options — both buying and selling. Futures, overnight positions, copy execution and algo execution are not permitted.',
  },
  {
    q: 'What are the risk rules?',
    a: 'Every plan carries a daily loss limit, a maximum loss limit and an intraday square-off at 3:15 PM IST. Breaching any hard limit ends the current assessment. All limits are shown in the assessments table above.',
  },
  {
    q: 'How do I get paid?',
    a: 'After you clear the assessment and complete KYC, your Pro Account becomes payout-eligible. Requests are submitted from your dashboard every 14 days and settled in INR to your verified Indian bank account.',
  },
  {
    q: 'Is the assessment fee refundable?',
    a: 'Assessment fees are non-refundable except in the case of a payment error. Our refund policy sets out the full terms.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState(0);

  return (
    <section className="pf-section">
      <div className="pf-wrap grid lg:grid-cols-3 gap-10 lg:gap-16">
        <div>
          <p className="pf-eyebrow mb-4">FAQs</p>
          <h2 className="pf-h2 mb-5">Questions, answered</h2>
          <p className="pf-lead mb-7">Everything worth knowing before you pay for an assessment.</p>
          <Link to="/faqs" className="pf-btn pf-btn--ghost">Read all FAQs</Link>
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
