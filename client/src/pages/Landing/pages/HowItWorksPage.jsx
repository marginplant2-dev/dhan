import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const steps = [
  {
    number: '01',
    title: 'Choose Your Plan',
    desc: 'Pick a Qualifier tier that matches your learning style. Each plan comes with a defined simulated capital size, profit target, and clear risk rules. We offer 1-Step and 2-Step evaluations.',
  },
  {
    number: '02',
    title: 'Follow Rules',
    desc: 'Intraday on NIFTY/BANKNIFTY within our risk rules — Max Daily Loss, Max Drawdown, and mandatory Intraday Square-off by 3:15 PM. All activity happens in a simulated environment.',
  },
  {
    number: '03',
    title: 'Hit Your Targets',
    desc: 'Achieve your profit target while staying within loss limits. Consistency and discipline are rewarded, not just big wins. Take as many market days as you need within the plan validity.',
  },
  {
    number: '04',
    title: 'Earn Your Rewards',
    desc: 'Pass the evaluation, complete KYC verification, and unlock your performance-based reward payout directly to your verified Indian bank account. Simple, transparent, no hidden steps.',
  },
];

const rules = [
  { label: 'Max Daily Loss', value: '3% – 5%', desc: 'Maximum loss allowed in a single market day. Breaching this disqualifies the evaluation.' },
  { label: 'Max Total Drawdown', value: '8% – 12%', desc: 'Maximum cumulative loss from your peak balance. Stay within this limit throughout your evaluation.' },
  { label: 'Intraday Square-off', value: '3:15 PM', desc: 'All positions must be closed before 3:15 PM IST. No overnight holding allowed.' },
  { label: 'Profit Target', value: '8% – 15%', desc: 'The profit percentage you need to achieve to pass the evaluation successfully.' },
  { label: 'Minimum Active Days', value: '5 days', desc: 'You must be active for at least 5 separate days to qualify. This ensures consistency over time.' },
  { label: 'Instruments Allowed', value: 'NIFTY, BANKNIFTY, SENSEX', desc: 'Options buying and selling are both supported. Futures, overnight positions, copy execution and algo execution are not allowed.' },
];

export default function HowItWorksPage() {
  return (
    <LandingShell>
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-14 md:pt-44 md:pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">How It Works</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            From sign-up to <span className="text-[color:var(--pf-brand)]">payout</span> in four simple steps
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            Our evaluation process is designed to be straightforward. No complex procedures,
            no hidden requirements. Just prove your market discipline and earn your rewards.
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="py-12 md:py-20 px-6 bg-[color:var(--pf-card-alt)]">
        <div className="max-w-4xl mx-auto">
          {steps.map((step, i) => (
            <div key={step.number} className={`flex flex-col md:flex-row gap-6 md:gap-12 py-12 ${i < steps.length - 1 ? 'border-b border-[color:var(--pf-border)]' : ''}`}>
              <div className="shrink-0">
                <span className="text-sm font-bold text-[color:var(--pf-brand)]">{step.number}</span>
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-[color:var(--pf-text)] mb-3">{step.title}</h3>
                <p className="text-base text-[color:var(--pf-muted)] leading-relaxed max-w-xl">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Rules */}
      <section className="py-14 md:py-24 px-6 bg-[#0A2130]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 md:mb-16">
            <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-white mb-4">
              Evaluation <span className="text-[color:var(--pf-brand)]">Rules</span>
            </h2>
            <p className="text-base sm:text-lg text-[#9FB5AB]">Clear, documented, no surprises. Know exactly what's expected before you start.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {rules.map((r) => (
              <div key={r.label} className="bg-[#0E2A3A] border border-[rgba(255,255,255,0.08)] rounded-2xl p-6 sm:p-8">
                <p className="text-sm text-[#9FB5AB] mb-2">{r.label}</p>
                <div className="text-2xl sm:text-3xl font-extrabold text-white mb-3" style={{ letterSpacing: '-0.03em' }}>{r.value}</div>
                <p className="text-sm text-[#9FB5AB] leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-6">
            Understood the rules? <span className="text-[color:var(--pf-brand)]">Let's begin.</span>
          </h2>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] mb-8">Choose a plan and start your evaluation today.</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm shadow-[0_6px_20px_rgba(31,216,122,0.3)] hover:bg-[color:var(--pf-brand-2)] transition-all">
              View Plans <ArrowRight size={16} />
            </Link>
            <Link to="/faqs" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-[color:var(--pf-border)] text-[color:var(--pf-text)] font-semibold text-sm hover:border-[color:var(--pf-brand)] hover:text-[color:var(--pf-brand)] transition-all">
              Read FAQs
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
