import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/* Shown only if GET /api/faqs (Admin → Content) returns nothing or fails. The
   live page, and the prerendered HTML, normally carry the database set seeded
   from server/services/contentSeed.service.js. Figures match data/programmes.js. */
const FALLBACK_FAQ = {
  'General': [
    { q: 'What is DhanFunded?', a: 'An Indian prop firm that runs simulated trading evaluations on NIFTY, BANKNIFTY and SENSEX options. You pay a one-time fee, trade a virtual account at live prices under published rules, and if you pass you trade a funded account and keep 80% of its profit (70% on Instant Funding).' },
    { q: 'Is DhanFunded a broker, or registered with SEBI?', a: 'Neither. DhanFunded is not a stockbroker, not an investment adviser and not registered with SEBI. Orders are filled inside our simulated environment and never reach NSE or BSE. We do not hold your trading capital, give tips or manage money for anyone.' },
    { q: 'Should I buy an evaluation if I am still learning?', a: 'Probably not yet. Use the free practice account first. Once your worst losing day fits inside the daily limit of the size you want, which is ₹4,000 on a ₹1 Lakh 2-Step account, the fee is better spent.' },
  ],
  'Trading': [
    { q: 'Can I trade BANKNIFTY options in the evaluation?', a: 'Yes. NIFTY, BANKNIFTY and SENSEX options can all be bought or sold. Futures, positions kept overnight or over a weekend, copy strategies and algos are not permitted, and there is no forex, crypto, commodities or foreign market on offer.' },
    { q: 'What happens if I break the daily loss limit?', a: 'The account fails at that moment, open positions are closed and trading stops. The daily limit is 4% of the starting balance on the 2-Step and 1-Step evaluations and 3% on Instant Funding, so ₹4,000 or ₹3,000 on ₹1 Lakh. Your trade history stays visible, and you can reset the account for half the original fee.' },
    { q: 'How is the overall loss limit counted?', a: 'From the starting balance, not from your highest equity. It is 10% on the 2-Step, 8% on the 1-Step and 6% on Instant Funding: ₹10,000, ₹8,000 and ₹6,000 on a ₹1 Lakh account. Separately, one closed trade may not lose more than 2%, which is ₹2,000 on that size.' },
    { q: 'What is the consistency rule?', a: 'During an evaluation no single day may supply more than 40% of the profit target. On a ₹1 Lakh 2-Step Phase 1, where the target is ₹8,000, that cap is ₹3,200. On a funded account the cap is 30% of the profit. Money above the cap stays in your balance; that day just does not count towards passing.' },
    { q: 'Do I have to close everything by 3:15 PM?', a: 'Yes. All trading is intraday. Any position still open at 3:15 PM IST is squared off automatically.' },
    { q: 'How many trading days and how much time do I get?', a: 'At least five days with a trade on them, in any order. The 2-Step gives you 60 days and the 1-Step 45 days. If the time runs out before you reach the target, the evaluation ends.' },
  ],
  'Payouts': [
    { q: 'How do prop firm payouts work in India?', a: 'You are paid in rupees by bank transfer to an Indian account in your own name; third-party accounts are not paid. KYC with PAN and Aadhaar comes before the first payout. On 1-Step and 2-Step funded accounts you keep 80% of the profit, on Instant Funding 70%.' },
    { q: 'When can I ask for my first payout?', a: 'When four things are true: the account has been funded for 14 days, you have traded on five days, it is up at least 5%, and no single day makes up more than 30% of that profit. From then on you can request every 14 days.' },
    { q: 'Is there a limit on each payout?', a: 'Yes. One request can be up to 5% of the account size, so ₹5,000 on a ₹1 Lakh account.' },
    { q: 'Are there monthly charges or hidden fees?', a: 'No. You pay the fee shown on the pricing page once per account. There is no subscription and no platform charge, and nothing comes out of a payout except the profit share.' },
    { q: 'Can I get a refund on the evaluation fee?', a: 'Not unless a payment was charged in error. The fee covers the evaluation whether you pass or fail. A failed account can be reset for 50% of the original fee, worked out on the full price even if you used a coupon.' },
  ],
  'Account': [
    { q: 'How quickly can I start?', a: 'Sign up with your email, verify it, and the free practice account opens straight away. A paid evaluation goes live once its payment is approved, usually the same working day.' },
    { q: 'When do I need to complete KYC?', a: 'Only before your first payout. You can buy and trade an evaluation without it. You will need your PAN, Aadhaar and a bank account in your own name.' },
    { q: 'What account sizes can I choose?', a: 'From ₹1 Lakh up to ₹25 Lakh, depending on the programme. The pricing page lists the fee for every size.' },
    { q: 'Can I hold more than one account?', a: 'Yes. Each one has its own balance, target and limits, and breaking a rule on one leaves the others untouched.' },
  ],
};

function FAQItem({ faq, isOpen, onToggle }) {
  return (
    <div className={`border rounded-2xl overflow-hidden transition-all mb-3 ${isOpen ? 'border-[#1FD87A] bg-[rgba(31,216,122,0.03)]' : 'border-[color:var(--pf-border)] bg-[color:var(--pf-card)] hover:border-[rgba(31,216,122,0.3)]'}`}>
      <button type="button" aria-expanded={isOpen} className="w-full flex items-center justify-between px-6 py-5 text-left gap-4" onClick={onToggle}>
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
            Prop firm rules and <span className="text-[color:var(--pf-brand)]">payouts</span>, answered
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            What you can trade, what ends an evaluation, how the consistency rule is counted and when
            money reaches your bank. The figures match the{' '}
            <Link to="/challenges" className="text-[color:var(--pf-brand)] hover:underline">challenge rules</Link> and the{' '}
            <Link to="/pricing" className="text-[color:var(--pf-brand)] hover:underline">fee table</Link>. Not covered here?{' '}
            <Link to="/contact-us" className="text-[color:var(--pf-brand)] hover:underline">Ask the support team</Link>.
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
                type="button"
                aria-pressed={activeCategory === cat}
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

          {/* Questions. Every category stays in the DOM (inactive ones hidden), so
              the prerendered HTML carries all answers, not just the first tab. */}
          {Object.entries(faqCategories).map(([cat, faqs]) => (
            <div key={cat} hidden={cat !== activeCategory}>
              {faqs.map((faq, i) => {
                const key = `${cat}-${i}`;
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
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 md:py-20 px-6 bg-[#0A2130]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-white mb-4">
            Didn&apos;t find your answer?
          </h2>
          <p className="text-base text-[#9FB5AB] mb-8">Send us an email or a WhatsApp message, or call during support hours. Include your account ID and we can check the exact trade or rule.</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link to="/contact-us" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm hover:bg-[color:var(--pf-brand-2)] transition-all">
              Contact support
            </Link>
            <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-[rgba(255,255,255,0.15)] text-white font-semibold text-sm hover:border-[color:var(--pf-brand)] hover:text-[color:var(--pf-brand)] transition-all">
              Compare fees
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
