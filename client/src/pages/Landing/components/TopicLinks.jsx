import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

/**
 * Keyword-anchored internal links to the seven topic pages.
 *
 * They were reachable only from sitemap.xml and (since today) the footer.
 * Footer links carry little weight; a body link from the homepage — the page
 * with the most authority on the site — is what actually gets them crawled and
 * ranked. The anchor text is the query each page targets, because anchor text
 * is one of the few ranking signals a site fully controls.
 */

const LINKS = [
  { to: '/prop-firm-india', label: 'Prop firm in India', sub: 'All three programmes compared' },
  { to: '/prop-trading-india', label: 'Prop trading in India', sub: 'How the model works, and what to check' },
  { to: '/funded-trading-account-india', label: 'Funded trading account in India', sub: 'From fee to first payout' },
  { to: '/instant-funding-prop-firm-india', label: 'Instant funding prop firm', sub: 'No assessment phase' },
  { to: '/nifty-prop-firm', label: 'NIFTY prop firm', sub: 'Lot 65, limits in rupees' },
  { to: '/banknifty-prop-firm', label: 'BANKNIFTY prop firm', sub: 'Lot 35, faster limit burn' },
  { to: '/sensex-prop-firm', label: 'SENSEX prop firm', sub: 'BSE, smaller lot, own expiry' },
  { to: '/inr-upi-prop-firm-india', label: 'Fees in INR, payouts by bank', sub: 'UPI in, Indian bank out' },
  { to: '/indian-stock-market-prop-firm', label: 'Indian stock market only', sub: 'NSE & BSE — no forex, no crypto' },
  { to: '/blog', label: 'Guides for Indian traders', sub: 'Eight articles on passing an assessment' },
];

export default function TopicLinks() {
  return (
    <section className="pf-section" aria-labelledby="topic-links-heading">
      <div className="pf-wrap">
        <h2 id="topic-links-heading" className="pf-h2 mb-3">Explore by market and programme</h2>
        <p className="pf-lead mb-9" style={{ maxWidth: '58ch' }}>
          Every rule, fee and loss limit written out for the index or programme you are actually
          interested in.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="pf-card pf-card--hover p-5"
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <span
                className="flex items-start justify-between gap-2 font-bold mb-1"
                style={{ color: 'var(--pf-text)', fontSize: '.97rem' }}
              >
                {l.label}
                <ArrowUpRight size={15} style={{ color: 'var(--pf-brand)', flexShrink: 0, marginTop: 2 }} />
              </span>
              <span className="pf-small" style={{ display: 'block' }}>{l.sub}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
