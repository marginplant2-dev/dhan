import { Link } from 'react-router-dom';
import LandingShell from '../Landing/components/LandingShell';
import Navbar from '../Landing/components/Navbar';
import Footer from '../Landing/components/Footer';
import '../Landing/landing.css';

const legalNav = [
  { to: '/terms', label: 'Terms & Conditions' },
  { to: '/privacy-policy', label: 'Privacy Policy' },
  { to: '/refund-policy', label: 'Refund Policy' },
  { to: '/risk-disclaimer', label: 'Risk Disclaimer' }
];

// Public legal pages — same shell (top banner, navbar, footer) and palette as
// the rest of the marketing site so they feel like one product.
export default function LegalPageShell({ title, subtitle, lastUpdated, children }) {
  return (
    <LandingShell>
      <Navbar />

      <style>{`
        .legal-doc { font-size: 15px; line-height: 1.8; color: #3a4152; }
        .legal-doc .terms-section { margin: 0 0 8px; }
        .legal-doc h2 { font-size: 18px; font-weight: 700; color: #0A2130; margin: 26px 0 10px; }
        .legal-doc p { margin: 12px 0; }
        .legal-doc ul { margin: 12px 0; padding-left: 2px; list-style: none; }
        .legal-doc li { position: relative; margin: 11px 0; padding-left: 24px; }
        .legal-doc li::before { content: ""; position: absolute; left: 4px; top: 10px; width: 7px; height: 7px; border-radius: 50%; background: #35DC85; }
        .legal-doc strong { color: #0A2130; font-weight: 700; }
        .legal-doc .warning-section, .legal-doc .disclaimer-section {
          background: #FFF8EC; border: 1px solid #F6E4BF; border-radius: 12px; padding: 14px 18px; margin: 18px 0; }
        .legal-doc .warning-section ul, .legal-doc .disclaimer-section ul { margin-top: 6px; }
      `}</style>

      {/* Hero */}
      <section className="pt-28 pb-8 md:pt-40 md:pb-10 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-semibold text-[#35DC85] uppercase tracking-widest mb-3">Legal</p>
          <h1 style={{ fontSize: 'clamp(1.9rem, 4vw, 2.8rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="text-[color:var(--pf-text)] mb-3">
            {title}
          </h1>
          {subtitle && <p className="text-base text-[color:var(--pf-muted)]">{subtitle}</p>}
          {lastUpdated && (
            <span style={{ display: 'inline-block', marginTop: 12, fontSize: 12, fontWeight: 600, color: 'var(--pf-muted)', background: 'var(--pf-card-alt)', border: '1px solid var(--pf-border)', padding: '5px 13px', borderRadius: 999 }}>
              Last updated: {lastUpdated}
            </span>
          )}
        </div>
      </section>

      {/* Document */}
      <section className="pb-20 px-6">
        <div className="max-w-3xl mx-auto bg-[color:var(--pf-card)] border border-[color:var(--pf-border)] rounded-2xl p-6 sm:p-10 shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
          <div className="legal-doc">{children}</div>

          <div style={{ marginTop: 32, paddingTop: 22, borderTop: '1px solid #EEF1F7' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', justifyContent: 'center' }}>
              {legalNav.map((l) => (
                <Link key={l.to} to={l.to} style={{ fontSize: 13, color: '#35DC85', textDecoration: 'none', fontWeight: 600 }}>{l.label}</Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
