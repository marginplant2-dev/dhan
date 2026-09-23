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
 * The bug this fixes: every route served `<link rel="canonical"
 * href="https://dhanfunded.com/">`, telling Google that /challenges, /pricing,
 * /faqs and all eight blog posts were duplicates of the homepage — while
 * sitemap.xml simultaneously listed them as 24 distinct URLs.
 */
const SITE = 'https://dhanfunded.com';
const OG_IMAGE = `${SITE}/landing/img/dhanfunded-og.png`;

const PAGES = {
  '/': {
    title: "DhanFunded — Simulated Index Trading Evaluations in India",
    description:
      "Show what your strategy can do on NIFTY, BANKNIFTY and SENSEX without staking your own money. Rules published in rupees before you pay, account sizes from ₹1 Lakh, and 80% of what you make paid to an Indian bank every fortnight.",
  },
  '/how-it-works': {
    title: "How an Evaluation Runs at DhanFunded — Step by Step",
    description:
      "What happens between paying for an evaluation and receiving money: the targets each phase asks for, the two loss limits that close an account, how a funded account is issued, and what has to be true before a payout is released.",
  },
  '/challenges': {
    title: "1-Step, 2-Step or Instant — Which DhanFunded Programme Fits",
    description:
      "Three routes to a funded account, compared line by line: targets, daily and overall limits, time allowed and profit share. Pick by how you trade, not by the fee.",
  },
  '/instruments': {
    title: "What You Can Trade — NIFTY, BANKNIFTY and SENSEX Derivatives",
    description:
      "The index derivatives available inside a DhanFunded evaluation, with contract sizes and session timings. Indian indices only — nothing in forex, crypto or overseas markets.",
  },
  '/pricing': {
    title: "DhanFunded Evaluation Fees — Pay Once, Per Account Size",
    description:
      "Every account size with its one-time fee, target and loss limits in rupees. No monthly billing, no platform charge, and the same numbers on the page as in your dashboard.",
  },
  '/faqs': {
    title: "DhanFunded Questions — Rules, Payouts, KYC, Resets",
    description:
      "Plain answers to what traders actually ask: what ends an account, how the consistency rule is measured, when a payout can be requested, what a reset costs, and why the environment is simulated.",
  },
  '/about': {
    title: "About DhanFunded — Why We Evaluate Instead of Teach",
    description:
      "A simulated evaluation desk for Indian index traders: what the platform is, what it deliberately is not, and how a rules-first environment separates a disciplined strategy from a lucky week.",
  },
  '/contact-us': {
    title: "Talk to DhanFunded — Support for Traders and Payouts",
    description:
      "Questions about an evaluation, a funded account, KYC or a payout request? Reach the DhanFunded team by email, phone or WhatsApp.",
  },

  '/privacy-policy': {
    title: 'Privacy Policy | DhanFunded',
    description: 'What personal information DhanFunded collects, why it is collected, how long it is kept and how it is protected.',
  },
  '/terms': {
    title: 'Terms & Conditions | DhanFunded',
    description: 'The agreement covering DhanFunded evaluations, funded accounts, payouts and account closure.',
  },
  '/refund-policy': {
    title: 'Refund Policy | DhanFunded',
    description: 'When an evaluation fee can be refunded, when it cannot, and how to raise a refund request.',
  },
  '/risk-disclaimer': {
    title: 'Risk Disclaimer | DhanFunded',
    description:
      'What a simulated evaluation is and is not. Read this before paying for an evaluation or trading a funded account at DhanFunded.',
  },
  '/login': {
    title: 'Sign In | DhanFunded',
    description: 'Sign in to continue an evaluation, check objectives or request a payout on your funded account.',
  },
  '/register': {
    title: 'Create Your Account | DhanFunded',
    description: 'Open a free DhanFunded account, try the practice environment, and start an evaluation when you are ready.',
  },

  // Staff entrances. robots.txt already disallows these; the noindex flag is the
  // belt-and-braces for anyone who links to them directly.
  '/admin': { title: 'Admin Panel | DhanFunded', description: 'Restricted area.', noindex: true },
  '/subadmin': { title: 'Sub-Admin Panel | DhanFunded', description: 'Restricted area.', noindex: true },
  '/broker': { title: 'Broker Panel | DhanFunded', description: 'Restricted area.', noindex: true },
};

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

export default function Seo({ title, description, path, noindex }) {
  const { pathname } = useLocation();
  const route = path || pathname;
  const page = PAGES[route] || PAGES['/'];
  const t = title || page.title;
  const d = description || page.description;
  const noIndex = noindex ?? page.noindex ?? false;
  // Trailing slash only on the root, so /pricing and /pricing/ don't split.
  const url = SITE + (route === '/' ? '/' : route.replace(/\/+$/, ''));

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
  }, [t, d, url, noIndex]);

  return null;
}
