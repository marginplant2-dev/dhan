import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingShell from './LandingShell';
import Navbar from './Navbar';
import Footer from './Footer';

/**
 * Shared chrome for the topic landing pages (/prop-firm-india, /nifty-prop-firm,
 * /banknifty-prop-firm). Only the layout is shared — every page supplies its own
 * copy, tables and FAQs, because near-identical pages that differ by one keyword
 * are doorway pages and get demoted, not ranked.
 *
 * `faqs` is also emitted as FAQPage structured data so the questions can surface
 * directly in search results.
 */
export default function SeoLanding({ seo, h1, intro, children, faqs = [], cta }) {
  return (
    <LandingShell seo={seo}>
      <Navbar />

      {faqs.length > 0 && (
        <script
          type="application/ld+json"
          // Only the questions actually answered on this page — schema that
          // claims more than the page shows is a manual-action risk.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: faqs.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
            }),
          }}
        />
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://dhanfunded.com/' },
              { '@type': 'ListItem', position: 2, name: h1, item: `https://dhanfunded.com${seo.path}` },
            ],
          }),
        }}
      />

      <section className="pf-section pt-32 md:pt-44">
        <div className="pf-wrap">
          <nav aria-label="Breadcrumb" className="pf-small mb-5">
            <Link to="/" style={{ color: 'var(--pf-brand)' }}>Home</Link>
            <span style={{ margin: '0 8px', color: 'var(--pf-faint)' }}>/</span>
            <span>{h1}</span>
          </nav>

          <h1 className="pf-h1 mb-6" style={{ maxWidth: '18ch' }}>{h1}</h1>
          <div className="pf-lead" style={{ maxWidth: '62ch' }}>{intro}</div>
        </div>
      </section>

      {children}

      {faqs.length > 0 && (
        <section className="pf-section pf-section--alt">
          <div className="pf-wrap" style={{ maxWidth: 820 }}>
            <h2 className="pf-h2 mb-8">Common questions</h2>
            <div className="flex flex-col gap-4">
              {faqs.map((f) => (
                <div key={f.q} className="pf-card p-6">
                  <h3 className="pf-h3 mb-2">{f.q}</h3>
                  <p className="pf-body" style={{ margin: 0 }}>{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="pf-section">
        <div className="pf-wrap text-center">
          <h2 className="pf-h2 mb-5">{cta?.heading || 'Ready to start?'}</h2>
          <p className="pf-lead mb-8" style={{ maxWidth: '52ch', marginInline: 'auto' }}>
            {cta?.body}
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/register" className="pf-btn pf-btn--primary pf-btn--lg">
              Start assessment <ArrowRight size={17} />
            </Link>
            <Link to="/pricing" className="pf-btn pf-btn--ghost pf-btn--lg">See all fees</Link>
          </div>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
