import { Link } from 'react-router-dom';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Seo from '../../../components/Seo';
import mark from '../../../assets/dhanfunded-mark.png';

/**
 * A real 404.
 *
 * Every unknown URL used to render the homepage at HTTP 200, so any typo or
 * stale link was an indexable duplicate of the front page — Google could
 * collect an unbounded number of them. This page is noindexed, so those URLs
 * drop out of the index while still being useful to a person who lands on one.
 *
 * The links are followable on purpose: a visitor (and a crawler) should be able
 * to get back to the real pages from here.
 */
const SUGGESTIONS = [
  { to: '/', label: 'Home' },
  { to: '/how-it-works', label: 'How the evaluation works' },
  { to: '/pricing', label: 'Programmes and fees' },
  { to: '/prop-firm-india', label: 'Prop firm in India' },
  { to: '/faqs', label: 'Frequently asked questions' },
  { to: '/contact-us', label: 'Contact support' },
];

export default function NotFoundPage() {
  return (
    <LandingShell>
      <Seo
        path="/404"
        title="Page not found | DhanFunded"
        description="This page does not exist. Find the evaluation programmes, rules and support pages from here."
        noindex
      />
      <Navbar />

      <main className="pf-wrap" style={{ padding: '80px 0 96px', minHeight: '52vh' }}>
        <img src={mark} alt="" width={56} height={56} style={{ width: 56, height: 56, marginBottom: 18 }} />
        <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', opacity: .6 }}>
          Error 404
        </p>
        <h1 className="pf-h1" style={{ maxWidth: '16ch', margin: '10px 0 14px' }}>
          This page does not exist
        </h1>
        <p className="pf-lead" style={{ maxWidth: '58ch' }}>
          The link may be out of date, or the address may have a typo. Everything below is
          still where it was.
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: '28px 0 0', display: 'grid', gap: 10, maxWidth: 420 }}>
          {SUGGESTIONS.map((s) => (
            <li key={s.to}>
              <Link to={s.to} style={{ fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <Footer />
    </LandingShell>
  );
}
