import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/* ── Hero ────────────────────────────────────────────────────────────────────
   One screen, one message: badge, headline, promise, two actions, four numbers.
   The decoration is light only — the emerald wash and the mark's dot grid, so
   nothing competes with the wordmark in the navbar. Everything is
   token-driven, so the navbar's light/dark switch carries the whole section,
   and landing.css freezes the motion under prefers-reduced-motion.
   ──────────────────────────────────────────────────────────────────────────── */

const STATS = [
  { k: '80%', v: 'Profit share' },
  { k: '₹50 Lakh', v: 'Max account' },
  { k: '14 days', v: 'Payout cycle' },
  { k: 'NSE · BSE', v: 'Index derivatives' },
];


export default function Hero() {
  return (
    <section id="home" className="df-hero">
      <span className="df-hero-glow df-hero-glow--green" aria-hidden />
      <span className="df-hero-glow df-hero-glow--cyan" aria-hidden />
      <span className="df-hero-grid" aria-hidden />


      <div className="pf-wrap relative pt-32 pb-14 md:pt-40 md:pb-20">
        <span className="df-badge df-in" style={{ animationDelay: '60ms' }}>
          <i className="df-badge-dot" />
          INDIA&apos;S INR PROP TRADING ASSESSMENT
        </span>

        <h1 className="df-h1 df-in" style={{ animationDelay: '140ms' }}>
          Your Skill,{' '}
          <span className="df-gradient-text">Our Capital.</span>
        </h1>

        <p className="df-hero-lead df-in" style={{ animationDelay: '220ms' }}>
          Clear one rules-based assessment on NIFTY, BANKNIFTY or SENSEX and trade a funded
          account of up to ₹50 Lakh. Keep 80% of your performance, paid in INR to your Indian
          bank every 14 days — the drawdown is ours to carry.
        </p>

        <div className="df-hero-cta df-in" style={{ animationDelay: '300ms' }}>
          <Link to="/pricing" className="pf-btn pf-btn--primary pf-btn--lg">
            Start Assessment <ArrowRight size={17} />
          </Link>
          <Link to="/how-it-works" className="pf-btn pf-btn--ghost pf-btn--lg">Learn more</Link>
        </div>

        <div className="df-stats df-in" style={{ animationDelay: '380ms' }}>
          {STATS.map((s) => (
            <div key={s.v} className="df-stat">
              <b>{s.k}</b>
              <span>{s.v}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
