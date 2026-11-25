import { Facebook, Instagram, Mail, MessageCircle, Phone, Send, Youtube } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSiteSettings, digitsOnly } from '../hooks/useSiteSettings';
import TradingViewLegalNotice from './TradingViewLegalNotice';
import logoOnDark from '../../../assets/dhanfunded-wordmark-dark.png';

const COLUMNS = {
  Evaluations: [
    { label: 'Compare the challenges', href: '/challenges' },
    { label: 'Fees by account size', href: '/pricing' },
    { label: 'Tradable indices', href: '/instruments' },
    { label: 'How an evaluation runs', href: '/how-it-works' },
  ],
  DhanFunded: [
    { label: 'About DhanFunded', href: '/about' },
    { label: 'Questions and answers', href: '/faqs' },
    { label: 'Contact support', href: '/contact-us' },
    // Outbound on purpose: the reviews live on Trustpilot, and a real profile
    // is a trust signal both for readers and for search engines.
    { label: 'Our Trustpilot page', href: 'https://www.trustpilot.com/review/dhanfunded.com', external: true },
  ],
  Policies: [
    { label: 'Risk disclaimer', href: '/risk-disclaimer' },
    { label: 'Terms and conditions', href: '/terms' },
    { label: 'Refund policy', href: '/refund-policy' },
    { label: 'Privacy policy', href: '/privacy-policy' },
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

        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link to="/" className="inline-block mb-5">
              <img src={logoOnDark} alt="DhanFunded" width={1162} height={320} className="h-14 w-auto" />
            </Link>
            <p className="text-[.9rem] leading-relaxed mb-6" style={{ color: MUTED }}>
              Simulated trading evaluations for people who trade NIFTY, BANKNIFTY and
              SENSEX options. Clear the rules and we pay your profit share in rupees.
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
              <h2 className="text-[.78rem] font-bold uppercase tracking-[.14em] text-white mb-4">{title}</h2>
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

          {/* Required risk wording, kept in substance: not a broker/adviser, no
              exchange orders, simulated only, rewards per published terms, no
              guarantee of results, read the rules first, no advice. */}
          <p className="text-[.76rem] leading-relaxed" style={{ color: MUTED }}>
            <span className="font-semibold text-white">Risk notice:</span> every DhanFunded
            account is a simulation, used to measure how well and how consistently you trade. Orders are filled inside our own platform at live prices and
            are never sent to NSE, BSE or any other exchange. DhanFunded is not a stockbroker, an
            exchange, an investment adviser or a portfolio manager, it is not registered with SEBI,
            and nothing on this site is a tip, a recommendation or investment advice. Payouts are made
            only on the terms published for each programme. Trading carries risk, you can lose the
            whole fee you pay, and good results in the past, yours or anyone else&apos;s, say nothing
            certain about the future. Before you buy, read the{' '}
            <Link to="/terms" className="underline hover:text-white">terms</Link>, the{' '}
            <Link to="/risk-disclaimer" className="underline hover:text-white">risk disclaimer</Link> and
            the <Link to="/challenges" className="underline hover:text-white">rules for each challenge</Link>.
          </p>
        </div>
      </div>
    </footer>
  );
}
