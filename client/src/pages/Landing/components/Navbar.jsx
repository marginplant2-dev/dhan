import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowRight, ChevronDown, Menu, X } from 'lucide-react';
// On a white bar the wordmark artwork can only work with its navy plate behind
// it — the metallic lettering is built for a dark backdrop and goes hollow once
// the plate is cut away. So the bar carries the mark plus the name set in type:
// no plate, no box, and crisp at every size. The artwork itself still leads
// every dark surface (hero, footer, dashboards, emails, OG card).
import mark from '../../../assets/dhanfunded-mark.png';

const LINKS = [
  { label: 'Home', to: '/' },
  { label: 'How it Works', to: '/how-it-works' },
  { label: 'Assessments', to: '/pricing' },
  { label: 'Challenges', to: '/challenges' },
  
  { label: 'Contact us', to: '/contact-us' },
];

const MORE = [
  { label: 'Prop Firm India', to: '/prop-firm-india' },
  { label: 'NIFTY Prop Firm', to: '/nifty-prop-firm' },
  { label: 'BANKNIFTY Prop Firm', to: '/banknifty-prop-firm' },
  { label: 'About us', to: '/about' },
  { label: 'Instruments', to: '/instruments' },
  { label: 'FAQs', to: '/faqs' },
  { label: 'Blog', to: '/blog' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeMenus = () => { setMobileOpen(false); setMoreOpen(false); };

  // Click-away for the "More" dropdown.
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e) => { if (!moreRef.current?.contains(e.target)) setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [moreOpen]);

  // whitespace-nowrap: without it these flex items shrink and break mid-phrase
  // ("How it / Works", "Contact / us") instead of keeping the row on one line.
  const linkClass = ({ isActive }) =>
    `text-[.95rem] whitespace-nowrap transition-colors ${isActive ? 'font-semibold' : 'font-medium'}`;
  const linkStyle = ({ isActive }) => ({ color: isActive ? 'var(--pf-brand)' : 'var(--pf-text)' });

  return (
    <header className="df-nav fixed left-0 top-0 w-full z-50">
      <nav
        className={`df-navbar flex items-center justify-between gap-4${scrolled ? ' df-navbar--scrolled' : ''}`}
      >

        <Link to="/" className="df-brand shrink-0" aria-label="DhanFunded — home">
          <img src={mark} alt="" width={512} height={512} />
          <span className="df-brand-name">Dhan<i>Funded</i></span>
        </Link>

        {/* xl, not lg: with nowrap links the full row needs ~1100px, which
            overflows a 1024px viewport. Below xl the hamburger takes over. */}
        <div className="hidden xl:flex items-center gap-6 2xl:gap-9">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'} className={linkClass} style={linkStyle} onClick={closeMenus}>
              {l.label}
            </NavLink>
          ))}

          <div className="relative shrink-0" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="flex items-center gap-1 text-[.95rem] font-medium whitespace-nowrap"
              style={{ color: 'var(--pf-text)' }}
              aria-expanded={moreOpen}
            >
              About us
              <ChevronDown size={15} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            </button>
            {moreOpen && (
              <div
                className="pf-card absolute right-0 top-[calc(100%+14px)] min-w-[190px] p-2 pf-rise"
                style={{ borderRadius: 16 }}
              >
                {MORE.map((m) => (
                  <Link
                    key={m.to}
                    to={m.to}
                    onClick={closeMenus}
                    className="block px-3.5 py-2.5 rounded-xl text-[.9rem] font-medium transition-colors"
                    style={{ color: 'var(--pf-muted)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pf-brand-soft)'; e.currentTarget.style.color = 'var(--pf-brand)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--pf-muted)'; }}
                  >
                    {m.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">

          {/* The `hidden` utility CANNOT be put on the Link itself: .pf-btn sets
              display:inline-flex from landing.css, which loads after Tailwind's
              utilities and wins on equal specificity — so the button stayed
              visible at every width. Hiding a plain wrapper works because
              nothing else sets display on it. */}
          <span className="hidden xl:inline-flex">
            <Link to="/login" className="pf-btn pf-btn--ghost pf-btn--sm">Login</Link>
          </span>
          <Link to="/register" className="pf-btn pf-btn--primary pf-btn--sm whitespace-nowrap">
            <span className="hidden sm:inline">Get Started</span>
            <span className="sm:hidden">Start</span>
            <ArrowRight size={15} className="hidden sm:block" />
          </Link>

          <button
            type="button"
            className="xl:hidden grid place-items-center w-10 h-10 rounded-full"
            style={{ color: 'var(--pf-text)' }}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="df-mobile-sheet xl:hidden">
          <div className="flex flex-col">
            {[...LINKS, ...MORE].map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={closeMenus}
                className="py-3 text-[1rem] font-medium"
                style={({ isActive }) => ({
                  color: isActive ? 'var(--pf-brand)' : 'var(--pf-text)',
                  borderBottom: '1px solid var(--pf-border)',
                })}
              >
                {l.label}
              </NavLink>
            ))}
            <Link to="/login" className="pf-btn pf-btn--ghost mt-5">Login</Link>
          </div>
        </div>
      )}
    </header>
  );
}
