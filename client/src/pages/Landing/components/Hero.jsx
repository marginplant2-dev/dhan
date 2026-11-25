import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { CHEAPEST_FEE } from '../data/programmes';

/* ── Hero ────────────────────────────────────────────────────────────────────
   One screen, one message: badge, headline, promise, two actions, four numbers.
   The decoration is light only — the emerald wash and the mark's dot grid, so
   nothing competes with the wordmark in the navbar. Everything is
   token-driven, so the navbar's light/dark switch carries the whole section,
   and landing.css freezes the motion under prefers-reduced-motion.
   ──────────────────────────────────────────────────────────────────────────── */

const STATS = [
  { k: '80%', v: 'Top profit share' },
  { k: '₹25 Lakh', v: 'Largest account' },
  { k: '14 days', v: 'Between payouts' },
  { k: CHEAPEST_FEE, v: 'Lowest fee' },
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
          NIFTY · BANKNIFTY · SENSEX
        </span>

        <h1 className="df-h1 df-in" style={{ animationDelay: '140ms' }}>
          Get funded by an{' '}
          <span className="df-gradient-text">Indian prop firm</span>
        </h1>

        <p className="df-hero-lead df-in" style={{ animationDelay: '220ms' }}>
          DhanFunded is a prop firm for traders in India. Pass a simulated evaluation on index
          options and you get a funded trading account worth up to ₹25 Lakh. You pay a one-time
          fee instead of risking your own capital, and up to 80% of the profit you make is
          yours, sent in rupees to your own bank account.
        </p>

        <div className="df-hero-cta df-in" style={{ animationDelay: '300ms' }}>
          {/* Same destination as the header's Get Started, so the page's main
              call to action and the one in the nav do not send people to two
              different places. */}
          <Link to="/register" className="pf-btn pf-btn--primary pf-btn--lg">
            Get Started <ArrowRight size={17} />
          </Link>
          <Link to="/how-it-works" className="pf-btn pf-btn--ghost pf-btn--lg">See how it works</Link>
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
