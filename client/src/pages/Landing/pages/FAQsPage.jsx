import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Fallback shown only if the admin-managed API returns nothing (or is down) —
// the live content comes from GET /api/faqs (managed in Admin → Content).
/* Shown only if /api/faqs cannot be reached — the page normally renders the
   full set from the database (see server/services/contentSeed.service.js). */
const FALLBACK_FAQ = {
  'General': [
    { q: 'What exactly is DhanFunded?', a: 'An evaluation desk. You trade Indian index derivatives on simulated capital against rules published before you pay, and if your results clear those rules you are given a funded account and paid a share of what it makes.' },
    { q: 'Is any of this real money in the market?', a: 'No. Prices come from live NSE and BSE feeds, but your orders stay inside our system and never reach an exchange. We are not a broker and hold none of your trading capital. What is real is the payout on a funded account.' },
    { q: 'Can a platform like this operate in India?', a: 'Yes. A simulated environment that pays for measured performance is not broking, portfolio management or investment advice, so it needs no SEBI registration. We give no tips and no advice, and we never handle your trading capital.' },
  ],
  'Trading': [
    { q: 'What can I trade?', a: 'NIFTY, BANKNIFTY and SENSEX derivatives on NSE and BSE. Nothing in forex, crypto, commodities or overseas markets.' },
    { q: 'Which rules can end my account?', a: 'A daily loss beyond the programme limit, a cumulative loss beyond the overall limit, or the evaluation running past its allowed days. All of it measured against the starting balance.' },
    { q: 'Why cap what I can make in one day?', a: 'Because one outsized day says nothing about whether you can repeat it. No day may carry more than 40% of the target during an evaluation, or 30% of the profit on a funded account. The money stays in your balance either way.' },
  ],
  'Payouts': [
    { q: 'What share do I keep?', a: '80% on accounts funded through the 1-Step and 2-Step routes, and 70% on Instant Funding, which skips the evaluation entirely.' },
    { q: 'When can I request money?', a: 'After 14 days funded, five trading days used, at least 5% profit, and no single day making up more than 30% of it. Requests then run on a 14-day cycle.' },
    { q: 'Is the evaluation fee refundable?', a: 'No — it pays for the evaluation you took, not its result. A failed account can be reset for half the original fee, calculated on the full fee even if you bought with a coupon.' },
  ],
  'Account': [
    { q: 'How soon can I start?', a: 'Create an account, verify your email, and the practice environment opens straight away. An evaluation goes live as soon as its payment is approved, usually the same working day.' },
    { q: 'When is KYC needed?', a: 'Only before your first payout, never to start an evaluation. PAN, Aadhaar and a bank account in your own name, verified digitally.' },
    { q: 'Can I run more than one account?', a: 'Yes. Each carries its own balance, objectives and limits, and a breach on one does not touch another.' },
  ],
};

function FAQItem({ faq, isOpen, onToggle }) {
  return (
    <div className={`border rounded-2xl overflow-hidden transition-all mb-3 ${isOpen ? 'border-[#1FD87A] bg-[rgba(31,216,122,0.03)]' : 'border-[color:var(--pf-border)] bg-[color:var(--pf-card)] hover:border-[rgba(31,216,122,0.3)]'}`}>
      <button className="w-full flex items-center justify-between px-6 py-5 text-left gap-4" onClick={onToggle}>
        <span className={`text-sm sm:text-base font-semibold transition-colors ${isOpen ? 'text-[color:var(--pf-brand)]' : 'text-[color:var(--pf-text)]'}`}>{faq.q}</span>
        <ChevronDown size={18} className={`shrink-0 transition-all duration-300 ${isOpen ? 'rotate-180 text-[color:var(--pf-brand)]' : 'text-[color:var(--pf-muted)]'}`} />
      </button>
      <div className="overflow-hidden" style={{ maxHeight: isOpen ? '1500px' : '0', opacity: isOpen ? 1 : 0, transition: 'max-height 0.4s ease, opacity 0.3s ease' }}>
        <div className="px-6 pb-5">
          <div className="h-px bg-[rgba(31,216,122,0.1)] mb-4" />
          <p className="text-sm sm:text-base text-[color:var(--pf-muted)] leading-relaxed">{faq.a}</p>
        </div>
      </div>
    </div>
  );
}

export default function FAQsPage() {
  const [openIndex, setOpenIndex] = useState('General-0');
  const [activeCategory, setActiveCategory] = useState('General');
  const [faqCategories, setFaqCategories] = useState(FALLBACK_FAQ);

  // Live, admin-managed FAQs. Group the flat list by category; fall back to the
  // hardcoded copy if the API returns nothing so the page is never blank.
  useEffect(() => {
    fetch(`${API_URL}/api/faqs`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && Array.isArray(d.faqs) && d.faqs.length) {
          const grouped = {};
          for (const f of d.faqs) {
            (grouped[f.category] = grouped[f.category] || []).push({ q: f.question, a: f.answer });
          }
          setFaqCategories(grouped);
          setActiveCategory(Object.keys(grouped)[0]);
        }
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  return (
    <LandingShell>
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-12 md:pt-44 md:pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">FAQs</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            Frequently asked <span className="text-[color:var(--pf-brand)]">questions</span>
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            Everything you need to know about DhanFunded. Can't find what you're looking for?{' '}
            <Link to="/contact-us" className="text-[color:var(--pf-brand)] hover:underline">Contact our team</Link>.
          </p>
        </div>
      </section>

      {/* FAQs */}
      <section className="pb-24 px-6">
        <div className="max-w-4xl mx-auto">

          {/* Category tabs */}
          <div className="flex flex-wrap gap-2 mb-8 md:mb-10 justify-center">
            {Object.keys(faqCategories).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                  activeCategory === cat
                    ? 'bg-[color:var(--pf-brand)] text-white'
                    : 'bg-[color:var(--pf-card-alt)] text-[color:var(--pf-muted)] hover:text-[color:var(--pf-text)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Questions */}
          <div>
            {(faqCategories[activeCategory] || []).map((faq, i) => {
              const key = `${activeCategory}-${i}`;
              return (
                <FAQItem
                  key={key}
                  faq={faq}
                  isOpen={openIndex === key}
                  onToggle={() => setOpenIndex(openIndex === key ? null : key)}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 md:py-20 px-6 bg-[#0A2130]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-white mb-4">
            Still have questions?
          </h2>
          <p className="text-base text-[#9FB5AB] mb-8">Our support team is available to help you with any queries.</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link to="/contact-us" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm hover:bg-[color:var(--pf-brand-2)] transition-all">
              Contact Support
            </Link>
            <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-[rgba(255,255,255,0.15)] text-white font-semibold text-sm hover:border-[color:var(--pf-brand)] hover:text-[color:var(--pf-brand)] transition-all">
              View Plans
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
