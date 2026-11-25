import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Per-route SEO metadata for the CSR landing site.
 *
 * index.html ships a full set of default tags (title, description, canonical,
 * OG, Twitter) so crawlers and the first paint always have something. This
 * component *mutates those same tags* rather than rendering new ones — React 19
 * would happily hoist a second <title>/<meta> into <head> alongside the static
 * pair, and duplicate canonical/og tags are worse than none.
 *
 * It also owns one <script type="application/ld+json" id="route-ld"> (WebPage +
 * BreadcrumbList for the current route), created once and rewritten on every
 * route change. prerender.mjs waits for it, so each prerendered page ships it.
 *
 * The bug this fixes: every route served `<link rel="canonical"
 * href="https://dhanfunded.com/">`, telling Google that /challenges, /pricing,
 * /faqs and all eight blog posts were duplicates of the homepage — while
 * sitemap.xml simultaneously listed them as 24 distinct URLs.
 *
 * Copy rules: titles ≤ 60 chars with the brand last, descriptions 140–155
 * chars, facts only from src/pages/Landing/data/programmes.js and page copy.
 */
const SITE = 'https://dhanfunded.com';
const OG_IMAGE = `${SITE}/landing/img/dhanfunded-og.png`;

// `crumb` is the short page name used in the BreadcrumbList.
const PAGES = {
  '/': {
    crumb: 'Home',
    title: 'Prop Firm India: Get a Funded Trading Account | DhanFunded',
    description:
      'An Indian prop firm for NIFTY, BANKNIFTY and SENSEX options traders. Pass a simulated evaluation, get a funded trading account, keep up to 80% of profit.',
  },
  '/how-it-works': {
    crumb: 'How it works',
    title: 'How a Prop Firm Evaluation Works, Step by Step | DhanFunded',
    description:
      'How a prop firm evaluation works: hit the target over 5+ trading days without breaching a loss limit, complete KYC, then request payouts every 14 days.',
  },
  '/challenges': {
    crumb: 'Challenges',
    title: 'Prop Firm Challenge India: 1-Step & 2-Step | DhanFunded',
    description:
      'Compare the 2-Step, 1-Step and Instant Funding prop firm challenges: profit targets, daily and overall loss limits, time allowed and profit share.',
  },
  '/instruments': {
    crumb: 'Instruments',
    title: 'NIFTY, BANKNIFTY & SENSEX Options Prop Trading | DhanFunded',
    description:
      'Prop trading on NIFTY, BANKNIFTY and SENSEX options, buy or sell, intraday only, squared off by 3:15 PM IST. No futures, forex, crypto or overnight holds.',
  },
  '/pricing': {
    crumb: 'Pricing',
    title: 'Prop Firm Challenge Fees India, From ₹3,000 | DhanFunded',
    description:
      'Prop firm challenge fees in rupees, from ₹3,000 for the 2-Step. See 1-Step and Instant Funding prices, account sizes up to ₹25 Lakh and every limit in INR.',
  },
  '/faqs': {
    crumb: 'FAQs',
    title: 'Prop Firm Rules & Payouts Explained: FAQs | DhanFunded',
    description:
      'Prop firm rules and payouts in plain words: what closes an account, the 40% best-day cap, when KYC is needed, the 14-day payout cycle and reset costs.',
  },
  '/about': {
    crumb: 'About us',
    title: 'About Us: Indian Prop Trading Firm | DhanFunded',
    description:
      'DhanFunded is an Indian prop trading firm built around NIFTY, BANKNIFTY and SENSEX: simulated evaluations, rules published in rupees and payouts in INR.',
  },
  '/contact-us': {
    crumb: 'Contact us',
    title: 'Contact Us: Indian Prop Trading Firm Support | DhanFunded',
    description:
      'Contact DhanFunded, the Indian prop trading firm, about an evaluation, a funded account, KYC or a payout. Reach support by email, phone or WhatsApp.',
  },

  '/privacy-policy': {
    crumb: 'Privacy Policy',
    title: 'Privacy Policy | DhanFunded',
    description:
      'How DhanFunded collects, uses, shares and protects your information, including KYC documents and trading activity, how long it is kept and your rights.',
  },
  '/terms': {
    crumb: 'Terms & Conditions',
    title: 'Terms & Conditions | DhanFunded',
    description:
      'The agreement between you and DhanFunded: your account, fees and what a purchase covers, refunds, lawful use, the risk of losing money and governing law.',
  },
  '/refund-policy': {
    crumb: 'Cancellation & Refund Policy',
    title: 'Cancellation & Refund Policy | DhanFunded',
    description:
      'When a DhanFunded order can be cancelled, how to report a problem with something you paid for, and how long an approved refund takes to reach your account.',
  },
  '/risk-disclaimer': {
    crumb: 'Risk Disclaimer',
    title: 'Risk Disclaimer | DhanFunded',
    description:
      'Read this before you pay. Trading carries a real risk of loss, DhanFunded runs simulated evaluations only, and nothing on this site is investment advice.',
  },
  '/login': {
    crumb: 'Sign in',
    title: 'Sign In | DhanFunded',
    description: 'Sign in to continue an evaluation, check objectives or request a payout on your funded account.',
  },
  '/register': {
    crumb: 'Create account',
    title: 'Create Your Account | DhanFunded',
    description: 'Open a free DhanFunded account, try the practice environment, and start an evaluation when you are ready.',
  },

  // Staff entrances. robots.txt already disallows these; the noindex flag is the
  // belt-and-braces for anyone who links to them directly.
  '/admin': { title: 'Admin Panel | DhanFunded', description: 'Restricted area.', noindex: true },
  '/subadmin': { title: 'Sub-Admin Panel | DhanFunded', description: 'Restricted area.', noindex: true },
  '/broker': { title: 'Broker Panel | DhanFunded', description: 'Restricted area.', noindex: true },
};

// Same page under a second URL (App.jsx mounts the homepage at /landing too).
const ALIASES = { '/landing': '/' };

/** Set (or create) a <meta> by its name/property attribute. */
function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** WebPage (+ BreadcrumbList off the homepage) for the route being shown. */
function routeSchema(url, name, description, crumb) {
  const webPage = {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name,
    description,
    inLanguage: 'en-IN',
    isPartOf: { '@id': `${SITE}/#website` },
  };
  if (url === `${SITE}/`) return { '@context': 'https://schema.org', ...webPage };

  webPage.breadcrumb = { '@id': `${url}#breadcrumb` };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      webPage,
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: crumb, item: url },
        ],
      },
    ],
  };
}

export default function Seo({ title, description, path, noindex }) {
  const { pathname } = useLocation();
  const raw = (path || pathname).replace(/(.)\/+$/, '$1');
  const route = ALIASES[raw] || raw;
  const known = PAGES[route];
  const page = known || PAGES['/'];
  const t = title || page.title;
  const d = description || page.description;
  // A route with no entry here and no title of its own would otherwise go out
  // as an indexable copy of the homepage's title and description.
  const noIndex = noindex ?? page.noindex ?? !(known || title);
  const crumb = known?.crumb || t.split(' | ')[0];
  const url = SITE + route;

  useEffect(() => {
    document.title = t;
    setMeta('name', 'title', t);
    setMeta('name', 'description', d);
    setMeta('name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow');

    setMeta('property', 'og:title', t);
    setMeta('property', 'og:description', d);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', OG_IMAGE);

    setMeta('name', 'twitter:title', t);
    setMeta('name', 'twitter:description', d);
    setMeta('name', 'twitter:url', url);
    setMeta('name', 'twitter:image', OG_IMAGE);

    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', url);

    // One node, found by id, so a route change (or the SPA booting over a
    // prerendered page that already has it) rewrites it instead of adding one.
    let ld = document.getElementById('route-ld');
    if (noIndex) {
      ld?.remove();
      return;
    }
    if (!ld) {
      ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.id = 'route-ld';
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify(routeSchema(url, t, d, crumb));
  }, [t, d, url, noIndex, crumb]);

  return null;
}
