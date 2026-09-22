import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const instruments = [
  {
    name: 'NIFTY 50',
    exchange: 'NSE',
    type: 'Index Futures & Options',
    description: 'India\'s benchmark index tracking the top 50 companies listed on NSE. The most liquid and widely followed index derivative in India — perfect for intraday scalping and swing strategies.',
    lotSize: '65 units',
    tradingHours: '9:15 AM – 3:30 PM IST',
    marginRequired: 'As per plan capital',
    allowed: ['Options Buy', 'Options Sell'],
    notAllowed: ['Futures', 'Overnight Positions', 'Copy Execution', 'Algo Execution'],
  },
  {
    name: 'BANKNIFTY',
    exchange: 'NSE',
    type: 'Index Futures & Options',
    description: 'Tracks the performance of the 12 most liquid and large capitalised banking stocks. Known for higher volatility and wider intraday ranges — favoured by experienced people who thrive on momentum.',
    lotSize: '35 units',
    tradingHours: '9:15 AM – 3:30 PM IST',
    marginRequired: 'As per plan capital',
    allowed: ['Options Buy', 'Options Sell'],
    notAllowed: ['Futures', 'Overnight Positions', 'Copy Execution', 'Algo Execution'],
  },
  {
    name: 'SENSEX',
    exchange: 'BSE',
    type: 'Index Futures & Options',
    description: 'The oldest index in India, representing 30 well-established companies on BSE. Lower lot size makes it accessible for people who prefer tighter risk management and smaller position sizes.',
    lotSize: '20 units',
    tradingHours: '9:15 AM – 3:30 PM IST',
    marginRequired: 'As per plan capital',
    allowed: ['Options Buy', 'Options Sell'],
    notAllowed: ['Futures', 'Overnight Positions', 'Copy Execution', 'Algo Execution'],
  },
];

const rules = [
  'All activity is simulated — no real orders are placed on NSE or BSE.',
  'Options buying and selling are both allowed. Futures, copy execution and algo execution are not supported.',
  'All positions must be squared off before 3:15 PM IST every market day.',
  'No overnight or positional holding permitted across any instrument.',
  'Max Daily Loss and Max Drawdown limits apply across all instruments equally.',
  'Market access is only available on market days — no weekends or exchange holidays.',
];

export default function InstrumentsPage() {
  return (
    <LandingShell>
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-12 md:pt-44 md:pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Instruments</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            India's top <span className="text-[color:var(--pf-brand)]">indices</span>
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            We focus on what Indian intraday people know best — NIFTY, BANKNIFTY, and SENSEX.
            No forex, no crypto, no distractions. Just the instruments that matter to you.
          </p>
        </div>
      </section>

      {/* Instruments Detail */}
      <section className="pb-24 px-6">
        <div className="max-w-5xl mx-auto space-y-8">
          {instruments.map((inst, idx) => (
            <div key={inst.name} className="border border-[color:var(--pf-border)] rounded-2xl overflow-hidden">
              {/* Header */}
              <div className={`px-6 sm:px-10 py-8 ${idx === 0 ? 'bg-[#0A2130] text-white' : 'bg-[color:var(--pf-card-alt)] text-[color:var(--pf-text)]'}`}>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <h2 className="text-2xl sm:text-3xl font-extrabold" style={{ letterSpacing: '-0.02em' }}>{inst.name}</h2>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${idx === 0 ? 'bg-[color:var(--pf-brand)] text-white' : 'bg-[color:var(--pf-card-alt)] text-[color:var(--pf-muted)]'}`}>
                    {inst.exchange}
                  </span>
                  <span className={`text-xs font-medium ${idx === 0 ? 'text-[#9FB5AB]' : 'text-[color:var(--pf-muted)]'}`}>{inst.type}</span>
                </div>
                <p className={`text-sm sm:text-base leading-relaxed max-w-3xl ${idx === 0 ? 'text-[#9FB5AB]' : 'text-[color:var(--pf-muted)]'}`}>
                  {inst.description}
                </p>
              </div>

              {/* Details */}
              <div className="px-6 sm:px-10 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6 border-t border-[color:var(--pf-border)]">
                <div>
                  <p className="text-xs text-[color:var(--pf-muted)] mb-1">Lot Size</p>
                  <p className="text-sm font-bold text-[color:var(--pf-text)]">{inst.lotSize}</p>
                </div>
                <div>
                  <p className="text-xs text-[color:var(--pf-muted)] mb-1">Market Hours</p>
                  <p className="text-sm font-bold text-[color:var(--pf-text)]">{inst.tradingHours}</p>
                </div>
                <div>
                  <p className="text-xs text-[color:var(--pf-muted)] mb-1">Allowed</p>
                  <p className="text-sm font-bold text-[color:var(--pf-text)]">{inst.allowed.join(', ')}</p>
                </div>
                <div>
                  <p className="text-xs text-[color:var(--pf-muted)] mb-1">Not Allowed</p>
                  <p className="text-sm font-bold text-red-500">{inst.notAllowed.join(', ')}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Platform Rules */}
      <section className="py-14 md:py-24 px-6 bg-[color:var(--pf-card-alt)]">
        <div className="max-w-4xl mx-auto">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-8 md:mb-10">
            <span className="text-[color:var(--pf-brand)]">Rules</span> that apply across all instruments
          </h2>
          <div className="space-y-4">
            {rules.map((rule, i) => (
              <div key={i} className="flex gap-4 items-start">
                <span className="text-sm font-bold text-[color:var(--pf-brand)] shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <p className="text-base text-[color:var(--pf-muted)] leading-relaxed">{rule}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-6">
            Ready to participate on <span className="text-[color:var(--pf-brand)]">NIFTY, BANKNIFTY & SENSEX</span>?
          </h2>
          <p className="text-base text-[color:var(--pf-muted)] mb-8">Pick a plan that matches your style and start your evaluation today.</p>
          <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm shadow-[0_6px_20px_rgba(31,216,122,0.3)] hover:bg-[color:var(--pf-brand-2)] transition-all">
            View Plans <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
