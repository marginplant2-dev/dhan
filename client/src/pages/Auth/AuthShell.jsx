import { useEffect } from 'react';
import wordmark from '../../assets/dhanfunded-wordmark-dark.png';
import Seo from '../../components/Seo';
import './AuthClean.css';

/**
 * Shared dark shell for every auth screen — Login, Register, ForgotPassword,
 * AdminLogin, SubAdminLogin, BrokerLogin.
 *
 * The card is the brand navy, so this uses the transparent wordmark cut — no
 * plate behind it. The -onlight badge is only for genuinely white surfaces.
 *
 * Props:
 *   title    — big line ("Welcome back")
 *   subtitle — supporting line
 *   badge    — small gold pill above the title (used for Admin / Broker roles)
 *   legal    — optional fine print rendered under the card
 *   split    — show the brand panel beside the form (desktop only). Off for
 *              staff logins, where marketing copy would be out of place.
 *
 * To use a photograph instead of the designed panel, drop the file in
 * client/public/ and set one custom property in AuthClean.css:
 *     .ac-aside { --ac-hero: url('/auth-hero.jpg'); }
 */
export default function AuthShell({ title, subtitle, badge, legal, children, split = false }) {
  // These pages are the only full-height scrollable screens in the app shell;
  // the trading layout locks body overflow, so restore it while mounted.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    document.body.style.overflow = 'auto';
    // Without this the overscroll bounce (and any gap under a short card)
    // flashes the app's default body colour behind the page.
    document.body.style.background = '#05131B';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBg;
    };
  }, []);

  return (
    <div className={`ac-page${split ? ' ac-page--split' : ''}`}>
      <Seo />
      <div className="ac-bg" aria-hidden="true">
        <span className="ac-orb ac-orb-1" />
        <span className="ac-orb ac-orb-2" />
        <span className="ac-grid" />
      </div>

      {split && (
        <aside className="ac-aside">
          <div className="ac-aside-inner">
            <img className="ac-aside-mark" src={wordmark} alt="DhanFunded" />

            <p className="ac-aside-quote">
              Prove your discipline on NIFTY, BANKNIFTY and SENSEX — then trade
              a simulated account, not your savings.
            </p>

            <dl className="ac-aside-stats">
              <div>
                <dt>₹2,700</dt>
                <dd>Starting assessment fee</dd>
              </div>
              <div>
                <dt>₹50 Lakh</dt>
                <dd>Maximum funding</dd>
              </div>
              <div>
                <dt>INR</dt>
                <dd>Paid to your bank</dd>
              </div>
            </dl>
          </div>
        </aside>
      )}

      <div className="ac-main">
        <div className="ac-card">
          <div className="ac-header">
            <a className="ac-brand" href="/" aria-label="DhanFunded home">
              <img src={wordmark} alt="DhanFunded" />
            </a>
            {badge && <span className="ac-badge">{badge}</span>}
            {title && <h1 className="ac-title">{title}</h1>}
            {subtitle && <p className="ac-subtitle">{subtitle}</p>}
          </div>
          {children}
        </div>

        {legal && <p className="ac-legal">{legal}</p>}
      </div>
    </div>
  );
}
