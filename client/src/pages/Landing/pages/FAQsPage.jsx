import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Fallback shown only if the admin-managed API returns nothing (or is down) —
// the live content comes from GET /api/faqs (managed in Admin → Content).
const FALLBACK_FAQ = {
  'General': [
    { q: 'What is DhanFunded?', a: 'DhanFunded is a simulated prop firm evaluation platform built for Indian intraday people. You participate with virtual capital under defined rules and earn rewards upon successful completion. We are not a broker and do not execute live orders on NSE or BSE.' },
    { q: 'How does DhanFunded work?', a: 'You choose an account size, follow the evaluation rules, and demonstrate consistent performance. Based on your performance, you gain access to larger simulated capital and reward opportunities.' },
    { q: 'Is DhanFunded a real learning platform?', a: 'DhanFunded operates in a simulated environment designed for skill evaluation and learning. It does not execute orders in live markets on your behalf — the market data is real, but the orders never reach the exchange.' },
    { q: 'Is this legal in India?', a: 'Yes. DhanFunded operates as a simulated evaluation platform. It is not a broker or SEBI-registered intermediary. Simulated participation is legal in India. We provide a skill evaluation service, not investment advice or brokerage services.' },
    { q: 'Who is this platform for?', a: 'This platform is built for serious Indian intraday people who want to prove their market discipline and earn performance-based rewards without risking their own capital. Whether you follow NIFTY, BANKNIFTY or SENSEX — if you have a consistent strategy, this is for you.' },
    { q: 'Is this suitable for beginners?', a: 'Yes. DhanFunded is designed for both beginners and experienced people. Beginners can start with smaller account sizes and gradually scale up as they gain confidence and consistency.' },
    { q: 'Why choose DhanFunded over others?', a: 'Transparent rules, fast onboarding, Indian market focus, scalable account sizes and a structured evaluation system. DhanFunded is built specifically for Indian people who want to grow with discipline and proper risk management.' },
    { q: 'Is DhanFunded safe and trustworthy?', a: 'We focus on transparency, clear rules and structured processes to build a reliable ecosystem for people. Every fee, rule, drawdown limit and payout timeline is published up-front. We prioritise fairness and long-term trust over short-term marketing tactics.' },
  ],
  'Evaluation': [
    { q: 'Which instruments can I be assessed on?', a: 'You can participate on NIFTY, BANKNIFTY, and SENSEX options — both buying and selling are supported. Futures, overnight positions, copy execution and algo execution are not allowed. All activity happens in a simulated environment with real-time market data.' },
    { q: 'What are the risk rules?', a: 'Each plan has a Max Daily Loss limit (3-5%), a Max Total Drawdown limit (8-12%), and mandatory intraday square-off at 3:15 PM IST. Breaking any rule disqualifies the current evaluation. These rules are designed to promote discipline.' },
    { q: 'What is the loss limit?', a: 'Each account comes with predefined risk parameters — a daily loss limit and an overall drawdown limit. Both are shown in your dashboard from day one and they exist to enforce discipline and proper risk management.' },
    { q: 'What happens if I break a rule?', a: 'If you breach the daily loss limit, max drawdown, or fail to close positions by 3:15 PM, your evaluation is disqualified. You can purchase a new plan and restart. There are no penalties beyond losing the evaluation attempt.' },
    { q: 'Can I participate anytime during market hours?', a: 'Yes. You can participate during official Indian market hours (9:15 AM to 3:15 PM IST) using whichever style suits your strategy, as long as you follow the platform rules. All positions must be squared off before 3:15 PM.' },
    { q: 'Can I use my own strategy?', a: 'Yes. You are free to use your own strategy as long as it follows the platform guidelines and risk-management rules. Discretionary decision-making is encouraged; copy execution and algo execution are not permitted.' },
    { q: 'Is the market data real?', a: 'Yes, we use real-time market data feeds from NSE. However, all orders are simulated — no actual orders are placed on the exchange. This gives you a realistic experience without real market risk.' },
  ],
  'Payouts': [
    { q: 'How do I get paid?', a: 'After passing the evaluation and completing KYC verification, you become eligible for performance-based rewards paid directly to your verified Indian bank account. Payouts are processed within 5-7 business days.' },
    { q: 'How are profits shared?', a: 'DhanFunded offers a reward share of up to 80% of simulated profits, rewarding people based on performance. The exact split depends on your plan tier and is shown before purchase.' },
    { q: 'Can I withdraw profits anytime?', a: 'Profit withdrawals follow a structured payout schedule designed to ensure consistency and fair usage. Specific timelines and conditions are clearly defined in your dashboard so you always know when the next withdrawal window opens.' },
    { q: 'Is there any hidden fee involved?', a: 'No. DhanFunded follows a transparent pricing model. All fees are clearly mentioned before you purchase any account — there are no recurring charges, no FX conversion fees and no surprise deductions on payouts.' },
    { q: 'Is my evaluation fee refundable?', a: 'Evaluation fees are non-refundable except in case of payment errors.' },
    { q: 'What is the profit split?', a: 'People who successfully pass the evaluation receive up to 80% of the simulated profits as performance rewards. The exact split depends on your plan tier and is clearly stated before purchase.' },
  ],
  'Account': [
    { q: 'How do I create an account?', a: 'Click "Get Started" on any page, fill in your basic details (name, email, phone), verify your email, and you are ready to purchase an evaluation plan. The entire process takes less than 2 minutes.' },
    { q: 'How long does it take to get started?', a: 'Account setup and activation typically happen within 24 hours of payment, so you can start your evaluation challenge quickly without unnecessary waiting.' },
    { q: 'How much capital can I access?', a: 'Depending on the plan, you can access simulated capital up to ₹25,00,000 and beyond, allowing you to scale your potential without risking large personal funds.' },
    { q: 'Do I need prior market experience to join?', a: 'No, but having basic knowledge of the markets helps. Beginners can start with smaller account sizes and improve their skills while learning risk management on the platform.' },
    { q: 'How do I track my performance?', a: 'You get access to a dashboard where you can monitor profit and loss, current risk-limit usage, full activity history and your progress toward the profit target — all updated in real time.' },
    { q: 'What documents do I need for KYC?', a: 'You will need a valid PAN card, Aadhaar card, and a bank account in your name. KYC is required only after you pass the evaluation and before your first payout. We verify these digitally.' },
    { q: 'Can I have multiple evaluations at once?', a: 'Yes, you can run multiple evaluation accounts simultaneously. Each plan operates independently with its own rules, capital, and tracking.' },
    { q: 'Is there any max payout cap per account?', a: 'Yes. The maximum withdrawal cap is 10% of the account size per funded account. For example, on a ₹25,00,000 account the maximum withdrawal is ₹2,50,000. Payouts are split into 14-day cycles within the 30-day funded account life.' },
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
