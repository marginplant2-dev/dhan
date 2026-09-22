import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Tag } from 'lucide-react';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import PricingTable from '../components/PricingTable';

// Static plan-level features per type — these describe the *experience* (KYC,
// payouts, support) rather than per-tier numbers, so they don't live in the
// admin Challenge schema. Edit here if marketing copy changes.
const FEATURES_BY_TAB = {
  'Instant': [
    'No evaluation. Account is live from day one.',
    'NIFTY, BANKNIFTY and SENSEX — that\'s it. No unnecessary clutter.',
    'Same risk rules across all account sizes.',
    'Payouts go straight to your bank after KYC.',
    'WhatsApp support. We actually reply.'
  ],
  '1-Step': [
    'Single phase — no second round.',
    'Same instruments — NIFTY, BANKNIFTY, SENSEX.',
    'Targets and limits are written clearly. No surprises later.',
    'Pass once and you move straight to a funded account.',
    'Take your time. No deadline pressure.'
  ],
  '2-Step': [
    'Two phases — Qualifier first, then Validator.',
    'Cheapest entry point if you\'re testing the waters.',
    'Same NIFTY, BANKNIFTY and SENSEX instruments.',
    'Phase 2 has slightly easier targets — you earned it.',
    'Payouts in INR, straight to your Indian bank account.'
  ]
};

export default function PricingPage() {
  // Kept in sync with the plan picker below so the feature list matches the
  // plan type the visitor is looking at.
  const [tab, setTab] = useState('Instant');
  const [coupon, setCoupon] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);

  const applyCoupon = () => {
    const code = coupon.trim().toUpperCase();
    if (code) {
      setCoupon(code);
      setCouponApplied(true);
      setTimeout(() => setCouponApplied(false), 3000);
    }
  };

  return (
    <LandingShell>
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-12 md:pt-44 md:pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Pricing</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            One fee. <span className="text-[color:var(--pf-brand)]">No monthly charges.</span>
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            We kept it simple. Pick a plan, pay once, start your evaluation.
            Account sizes from 1 Lakh up to 50 Lakhs.
          </p>
        </div>
      </section>

      {/* Comparison table — same component the home page uses */}
      <PricingTable showHeading={false} onTabChange={setTab} className="pf-section--tight pb-4" />

      {/* What's included */}
      <section className="px-6 pb-16 md:pb-24">
        <div className="bg-[color:var(--pf-card-alt)] border border-[color:var(--pf-border)] rounded-2xl p-6 sm:p-8 max-w-3xl mx-auto">
          <h3 className="text-lg font-bold text-[color:var(--pf-text)] mb-2">
            What you get with {tab}
          </h3>
          <p className="text-sm text-[color:var(--pf-muted)] mb-5">Same across every account size in this plan.</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(FEATURES_BY_TAB[tab] || []).map((f) => (
              <li key={f} className="flex items-start gap-3">
                <Check size={16} className="text-[color:var(--pf-brand)] shrink-0 mt-0.5" />
                <span className="text-sm text-[color:var(--pf-muted)]">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Coupon / Referral Section */}
      <section className="py-14 md:py-20 px-6 bg-[#0A2130]">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[rgba(31,216,122,0.15)] border border-[rgba(31,216,122,0.3)] mb-5">
            <Tag size={14} className="text-[color:var(--pf-brand)]" />
            <span className="text-xs font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest">Coupon code</span>
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-white mb-4">
            Got a code from someone? <span className="text-[color:var(--pf-brand)]">Use it here.</span>
          </h2>
          <p className="text-base text-[#9FB5AB] mb-8 max-w-2xl mx-auto">
            If a YouTuber, mentor or friend shared their code, drop it in.
            You save on the fee, they get credited for the referral. Fair on both sides.
          </p>

          <div className="max-w-md mx-auto">
            <form
              onSubmit={(e) => { e.preventDefault(); applyCoupon(); }}
              className="flex gap-3"
            >
              <input
                type="text"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                placeholder="ENTER CODE"
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                enterKeyHint="done"
                className="flex-1 min-w-0 px-5 py-3.5 rounded-full bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.12)] text-white text-base placeholder-[#9FB5AB] focus:outline-none focus:border-[#1FD87A] transition-all uppercase tracking-wider"
                style={{ fontSize: 16 }}
              />
              <button
                type="submit"
                className="px-6 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm hover:bg-[color:var(--pf-brand-2)] transition-all shrink-0"
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                Apply
              </button>
            </form>
            {couponApplied && (
              <p className="text-sm text-[#34D399] mt-3">
                Got it. "{coupon}" will show up at checkout.
              </p>
            )}
            <p className="text-xs text-[#9FB5AB] mt-4">
              Codes are checked at checkout. We pay our partners every month, on time.
            </p>
          </div>
        </div>
      </section>

      {/* Become an Affiliate / Influencer */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-6">
            Run a market channel or mentor?
          </h2>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] mb-8 max-w-2xl mx-auto">
            We work with creators and educators across India. You get your own code, a dashboard
            to see who signed up, and a payout every month. No paperwork drama.
          </p>
          <Link to="/contact-us" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm shadow-[0_6px_20px_rgba(31,216,122,0.3)] hover:bg-[color:var(--pf-brand-2)] transition-all">
            Talk to us <ArrowRight size={16} />
          </Link>
          <p className="text-xs text-[color:var(--pf-muted)] mt-4">Usually replies within a day.</p>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
