import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const SESSION = '9:15 AM – 3:30 PM IST';
const ALLOWED = ['Buy options', 'Sell options'];
const NOT_ALLOWED = ['Futures', 'Overnight holds', 'Copy trading', 'Algo trading'];

const instruments = [
  {
    name: 'NIFTY 50',
    exchange: 'NSE',
    lot: 65,
    description: 'The National Stock Exchange\'s headline index, built from 50 large Indian companies across many sectors. NIFTY options are among the most actively traded contracts in India, and because the index spreads across so many industries it usually moves more steadily than a single-sector index. It suits both quick intraday scalps and trades held for most of the session.',
  },
  {
    name: 'BANKNIFTY',
    exchange: 'NSE',
    lot: 35,
    description: 'Follows the biggest and most heavily traded Indian bank stocks. Since it is built from one sector, an RBI announcement or a large bank\'s quarterly result can move it sharply, so its intraday ranges tend to be wider than NIFTY\'s. Traders who like fast momentum often prefer it, and its swings use up a loss limit faster.',
  },
  {
    name: 'SENSEX',
    exchange: 'BSE',
    lot: 20,
    description: 'BSE\'s flagship index of 30 large, established companies. Its lot is the smallest of the three at 20 units, so each ₹1 move in the premium is worth ₹20 per lot against ₹65 on NIFTY. That lets you size in smaller steps when your loss limits are tight.',
  },
];

const reasons = [
  {
    t: 'One rulebook, three markets',
    d: 'With only three instruments, every lot size, session time and limit fits on this page. Your attention goes on the chart instead of contract specifications for dozens of products.',
  },
  {
    t: 'Many companies in one price',
    d: 'An index blends many stocks, so one company\'s surprise result rarely moves it alone the way it can move a single share. The risk you take is the market\'s direction, not one firm\'s news.',
  },
  {
    t: 'Markets Indian traders already follow',
    d: 'These are the numbers on business channels, in your broker app and in the headlines on RBI policy and Budget days. You trade what you already watch.',
  },
];

const day = [
  { time: '9:15 AM IST', what: 'The exchange session opens and your daily loss limit starts fresh.' },
  { time: 'During the session', what: 'Buy or sell options on any of the three indices. Both loss limits are tracked on every trade.' },
  { time: '3:15 PM IST', what: 'The last moment to hold a position. New orders stop, and anything still open is squared off automatically.' },
  { time: '3:30 PM IST', what: 'The exchange session ends. Nothing is carried into the next day.' },
  { time: 'Weekends and holidays', what: 'No trading. The platform follows the exchange calendar.' },
];

const rules = [
  'Every trade is simulated. No order is ever sent to NSE or BSE.',
  'You can buy and sell options. Futures, copy trading and algo trading are not available.',
  'Close every position by 3:15 PM IST on each trading day.',
  'No position is held overnight or over a weekend, on any index.',
  'The daily and overall loss limits are the same whichever index you trade, and losses on all three count towards them.',
  'Trading is open on exchange trading days only, not on weekends or market holidays.',
];

const H2_STYLE = { fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' };

export default function InstrumentsPage() {
  return (
    <LandingShell>
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-12 md:pt-44 md:pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Instruments</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            Prop trading on NIFTY, BANKNIFTY and <span className="text-[color:var(--pf-brand)]">SENSEX options</span>
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            Every DhanFunded account trades options on three Indian indices, with no forex and no
            crypto. Below you will find the lot size, session times and rules for each one, plus
            rupee examples for sizing a trade against your loss limits.
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
                  <span className={`text-xs font-medium ${idx === 0 ? 'text-[#9FB5AB]' : 'text-[color:var(--pf-muted)]'}`}>Index options</span>
                </div>
                <p className={`text-sm sm:text-base leading-relaxed max-w-3xl ${idx === 0 ? 'text-[#9FB5AB]' : 'text-[color:var(--pf-muted)]'}`}>
                  {inst.description}
                </p>
                <p className={`text-sm font-semibold mt-3 ${idx === 0 ? 'text-white' : 'text-[color:var(--pf-text)]'}`}>
                  One lot is {inst.lot} units, so a ₹10 move in the option premium changes your P&amp;L by ₹{(inst.lot * 10).toLocaleString('en-IN')}.
                </p>
              </div>

              {/* Details */}
              <div className="px-6 sm:px-10 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6 border-t border-[color:var(--pf-border)]">
                <div>
                  <p className="text-xs text-[color:var(--pf-muted)] mb-1">One lot</p>
                  <p className="text-sm font-bold text-[color:var(--pf-text)]">{inst.lot} units</p>
                </div>
                <div>
                  <p className="text-xs text-[color:var(--pf-muted)] mb-1">Exchange session</p>
                  <p className="text-sm font-bold text-[color:var(--pf-text)]">{SESSION}</p>
                </div>
                <div>
                  <p className="text-xs text-[color:var(--pf-muted)] mb-1">You can</p>
                  <p className="text-sm font-bold text-[color:var(--pf-text)]">{ALLOWED.join(', ')}</p>
                </div>
                <div>
                  <p className="text-xs text-[color:var(--pf-muted)] mb-1">You can't</p>
                  <p className="text-sm font-bold text-red-500">{NOT_ALLOWED.join(', ')}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why index options */}
      <section className="pb-16 md:pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 style={H2_STYLE} className="text-[color:var(--pf-text)] mb-8">
            Why we stick to <span className="text-[color:var(--pf-brand)]">index options</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {reasons.map((r) => (
              <div key={r.t} className="bg-[color:var(--pf-card-alt)] border border-[color:var(--pf-border)] rounded-2xl p-6">
                <h3 className="text-lg font-bold text-[color:var(--pf-text)] mb-2">{r.t}</h3>
                <p className="text-sm text-[color:var(--pf-muted)] leading-relaxed">{r.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* A trading day */}
      <section className="py-14 md:py-24 px-6 bg-[color:var(--pf-card-alt)]">
        <div className="max-w-4xl mx-auto">
          <h2 style={H2_STYLE} className="text-[color:var(--pf-text)] mb-8 md:mb-10">
            A trading day, <span className="text-[color:var(--pf-brand)]">from open to close</span>
          </h2>
          <ol className="space-y-5">
            {day.map((d) => (
              <li key={d.time} className="flex flex-col sm:flex-row gap-1 sm:gap-6">
                <span className="text-sm font-bold text-[color:var(--pf-brand)] sm:w-44 shrink-0">{d.time}</span>
                <span className="text-base text-[color:var(--pf-muted)] leading-relaxed">{d.what}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Sizing against limits */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 style={H2_STYLE} className="text-[color:var(--pf-text)] mb-6">
            Sizing a trade against <span className="text-[color:var(--pf-brand)]">your loss limits</span>
          </h2>
          <div className="space-y-4 text-base text-[color:var(--pf-muted)] leading-relaxed">
            <p>
              Loss limits are counted in rupees, so turn every position into rupees before you place
              it. On a ₹1 Lakh 1-Step or 2-Step account the daily limit is ₹4,000 (4%). On a ₹1 Lakh
              Instant Funding account it is ₹3,000 (3%).
            </p>
            <ul className="space-y-3">
              <li className="flex gap-3 items-start">
                <span className="w-2 h-2 rounded-full shrink-0 mt-2.5 bg-[color:var(--pf-brand)]" aria-hidden="true" />
                <span><strong className="text-[color:var(--pf-text)]">NIFTY, one lot of 65:</strong> a ₹20 drop in the premium costs ₹1,300. Three losses like that come to ₹3,900, just under the ₹4,000 daily limit.</span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-2 h-2 rounded-full shrink-0 mt-2.5 bg-[color:var(--pf-brand)]" aria-hidden="true" />
                <span><strong className="text-[color:var(--pf-text)]">BANKNIFTY, one lot of 35:</strong> a ₹40 drop costs ₹1,400. Two of those make ₹2,800, close to the whole ₹3,000 Instant Funding limit.</span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-2 h-2 rounded-full shrink-0 mt-2.5 bg-[color:var(--pf-brand)]" aria-hidden="true" />
                <span><strong className="text-[color:var(--pf-text)]">SENSEX, one lot of 20:</strong> a ₹50 drop costs ₹1,000, so three of them use up the full ₹3,000 Instant Funding limit.</span>
              </li>
            </ul>
            <p>
              Selling an option brings in premium up front, but a sharp move against a short option
              can cost several times that premium. Option sellers can hit a limit much faster than
              buyers, so size short positions with extra care.
            </p>
            <p>
              The rupee limits for every account size are on the{' '}
              <Link to="/pricing" className="text-[color:var(--pf-brand)] font-semibold hover:underline">pricing page</Link>.
              The examples here are arithmetic, not trading advice.
            </p>
          </div>
        </div>
      </section>

      {/* Platform Rules */}
      <section className="py-14 md:py-24 px-6 bg-[color:var(--pf-card-alt)]">
        <div className="max-w-4xl mx-auto">
          <h2 style={H2_STYLE} className="text-[color:var(--pf-text)] mb-8 md:mb-10">
            Rules on <span className="text-[color:var(--pf-brand)]">all three indices</span>
          </h2>
          <ol className="space-y-4">
            {rules.map((rule, i) => (
              <li key={rule} className="flex gap-4 items-start">
                <span className="text-sm font-bold text-[color:var(--pf-brand)] shrink-0 mt-0.5" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <p className="text-base text-[color:var(--pf-muted)] leading-relaxed">{rule}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 md:py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 style={H2_STYLE} className="text-[color:var(--pf-text)] mb-6">
            Ready to trade <span className="text-[color:var(--pf-brand)]">NIFTY, BANKNIFTY and SENSEX</span> options?
          </h2>
          <p className="text-base text-[color:var(--pf-muted)] mb-8">
            Choose the <Link to="/challenges" className="text-[color:var(--pf-brand)] font-semibold hover:underline">challenge route</Link> that
            fits how you trade, then pick an account size. New to evaluations? See{' '}
            <Link to="/how-it-works" className="text-[color:var(--pf-brand)] font-semibold hover:underline">how it works</Link>.
          </p>
          <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm shadow-[0_6px_20px_rgba(31,216,122,0.3)] hover:bg-[color:var(--pf-brand-2)] transition-all">
            See plans and fees <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
