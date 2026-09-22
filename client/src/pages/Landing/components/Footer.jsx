import { Facebook, Instagram, Mail, MessageCircle, Phone, Send, Youtube } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSiteSettings, digitsOnly } from '../hooks/useSiteSettings';
import TradingViewLegalNotice from './TradingViewLegalNotice';
import logoOnDark from '../../../assets/dhanfunded-wordmark-dark.png';

const COLUMNS = {
  Platform: [
    { label: 'How it works', href: '/how-it-works' },
    { label: 'Assessments', href: '/pricing' },
    { label: 'Challenges', href: '/challenges' },
    { label: 'Instruments', href: '/instruments' },
    
  ],
  Company: [
    { label: 'About us', href: '/about' },
    // Outbound on purpose: the reviews live on Trustpilot, and a real profile
    // is a trust signal both for readers and for search engines.
    { label: 'Reviews on Trustpilot', href: 'https://www.trustpilot.com/review/dhanfunded.com', external: true },
    { label: 'FAQs', href: '/faqs' },
    { label: 'Blog', href: '/blog' },
    { label: 'Contact us', href: '/contact-us' },
  ],
  // The topic pages were reachable only from sitemap.xml — nothing on the site
  // linked to them, so crawlers treated them as orphans and users never saw them.
  Markets: [
    { label: 'Prop firm in India', href: '/prop-firm-india' },
    { label: 'Prop trading in India', href: '/prop-trading-india' },
    { label: 'Prop challenge rules', href: '/prop-challenge-india' },
    { label: 'Funded trading account', href: '/funded-trading-account-india' },
    { label: 'Instant funding', href: '/instant-funding-prop-firm-india' },
    { label: 'NIFTY prop firm', href: '/nifty-prop-firm' },
    { label: 'BANKNIFTY prop firm', href: '/banknifty-prop-firm' },
    { label: 'SENSEX prop firm', href: '/sensex-prop-firm' },
    { label: 'INR fees & UPI payouts', href: '/inr-upi-prop-firm-india' },
    { label: 'Indian stock market only', href: '/indian-stock-market-prop-firm' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy-policy' },
    { label: 'Terms & Conditions', href: '/terms' },
    { label: 'Refund Policy', href: '/refund-policy' },
    { label: 'Risk Disclaimer', href: '/risk-disclaimer' },
  ],
};

/* The footer stays dark in both themes — it is the page's closing anchor.
   INK is the logo's own navy; the wordmark cut is transparent, so it sits on
   this (or any other dark surface) without a halo. */
const INK = '#05131B', LINE = 'rgba(120,230,170,.14)', MUTED = '#9FB5AB';

export default function Footer() {
  const site = useSiteSettings();
  // Edited in Admin → Settings → General → Social Links. A blank field drops
  // its icon rather than linking nowhere.
  const socials = [
    { Icon: Youtube, label: 'YouTube', href: site.socialYoutube },
    { Icon: Instagram, label: 'Instagram', href: site.socialInstagram },
    { Icon: Facebook, label: 'Facebook', href: site.socialFacebook },
    { Icon: Send, label: 'Telegram', href: site.socialTelegram },
    { Icon: MessageCircle, label: 'WhatsApp', href: digitsOnly(site.supportWhatsapp) ? `https://wa.me/${digitsOnly(site.supportWhatsapp)}` : '' },
  ].filter((s) => s.href);

  return (
    <footer style={{ background: INK, borderTop: `1px solid ${LINE}` }}>
      <div className="pf-wrap py-14 md:py-20">

        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
          <div>
            <Link to="/" className="inline-block mb-5">
              <img src={logoOnDark} alt="DhanFunded" width={1162} height={320} className="h-14 w-auto" />
            </Link>
            <p className="text-[.9rem] leading-relaxed mb-6" style={{ color: MUTED }}>
              Trade. Prove. Get Funded. Structured, simulated assessments for serious
              Indian intraday participants — with payouts in INR.
            </p>

            <div className="space-y-2.5 mb-6">
              <a href={`mailto:${site.supportEmail}`} className="flex items-center gap-2.5 text-[.88rem] hover:text-white transition-colors" style={{ color: MUTED }}>
                <Mail size={15} /> {site.supportEmail}
              </a>
              <a href={`tel:${digitsOnly(site.supportPhone)}`} className="flex items-center gap-2.5 text-[.88rem] hover:text-white transition-colors" style={{ color: MUTED }}>
                <Phone size={15} /> {site.supportPhone}
              </a>
            </div>

            <div className="flex gap-2.5">
              {socials.map(({ Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="grid place-items-center w-9 h-9 rounded-xl transition-colors hover:text-white"
                  style={{ background: 'rgba(255,255,255,.05)', border: `1px solid ${LINE}`, color: MUTED }}
                >
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>

          {Object.entries(COLUMNS).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-[.78rem] font-bold uppercase tracking-[.14em] text-white mb-4">{title}</h4>
              <ul className="space-y-2.5">
                {links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[.9rem] hover:text-white transition-colors"
                        style={{ color: MUTED }}
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link to={l.href} className="text-[.9rem] hover:text-white transition-colors" style={{ color: MUTED }}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Attribution required by TradingView for the embedded charts/widgets. */}
        <div className="mt-12"><TradingViewLegalNotice /></div>

        <div className="pt-8" style={{ borderTop: `1px solid ${LINE}` }}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 mb-5">
            <p className="text-[.85rem]" style={{ color: MUTED }}>
              © {new Date().getFullYear()} DhanFunded. All rights reserved.
            </p>
            {site.legalEntityName && (
              <p className="text-[.85rem]" style={{ color: MUTED }}>{site.legalEntityName}</p>
            )}
          </div>

          <p className="text-[.76rem] leading-relaxed" style={{ color: MUTED }}>
            <span className="font-semibold text-white">Disclaimer:</span> DhanFunded is an evaluation
            platform and is not a stock broker, exchange, investment advisor or portfolio manager. The
            platform does not facilitate or execute live orders on the NSE, BSE or any other exchange.
            All activity takes place in a simulated environment designed to assess participants' skill
            and consistency. Rewards follow the published terms of the evaluation and funding programme.
            Participation involves risk and past performance does not guarantee future results. Please
            review our Terms &amp; Conditions, Risk Disclaimer and Programme Rules before participating.
            No investment or financial advisory services are offered through this platform.
          </p>
        </div>
      </div>
    </footer>
  );
}
