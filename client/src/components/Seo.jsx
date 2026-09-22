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
    title:
      "DhanFunded — Prop Firm India | Funded NIFTY & BANKNIFTY Accounts",
    description:
      "India-only prop trading assessments on NSE and BSE index options — NIFTY, BANKNIFTY and SENSEX. Accounts from ₹1 Lakh to ₹50 Lakh, one-time fees from ₹2,700, 80% performance share paid in INR every 14 days. No forex, no crypto, no subscription.",
  },
  '/how-it-works': {
    title:
      "How DhanFunded Works — Assessment, Rules and Payout Steps",
    description:
      "The exact path from buying an assessment to your first payout: phase targets, the daily and overall loss limits that end an account, how a funded account is issued, and when you can request money.",
  },
  '/challenges': {
    title:
      "Compare 1-Step, 2-Step and Instant Funding — DhanFunded",
    description:
      "Side-by-side rules for all three DhanFunded programmes: 2-Step (8% then 5%, 60 days, ₹2,700), 1-Step (10%, 45 days) and Instant Funding (no assessment, 3% daily limit). Account sizes ₹1 Lakh to ₹50 Lakh.",
  },
  '/instruments': {
    title:
      "Tradable Instruments — NIFTY, BANKNIFTY, SENSEX | DhanFunded",
    description:
      "Every index derivative you can trade inside a DhanFunded assessment, with lot sizes and session timings for NIFTY, BANKNIFTY and SENSEX.",
  },
  '/pricing': {
    title:
      "DhanFunded Pricing — Assessment Fees from ₹2,700",
    description:
      "One-time fees with no subscription. 2-Step is ₹2,700, 1-Step ₹3,900 and Instant Funding ₹4,100 on a ₹1 Lakh account, with every loss limit and profit target published in rupees.",
  },
  '/faqs': {
    title:
      "DhanFunded FAQs — Rules, Payouts, KYC and Refunds",
    description:
      "Straight answers on drawdown limits, what fails an account, the 80% performance share, the 14-day payout cycle, KYC, and why assessment fees are non-refundable.",
  },
  '/about': {
    title:
      "About DhanFunded — Simulated Evaluation Built for India",
    description:
      "Why DhanFunded runs INR-denominated assessments on Indian index derivatives, how the simulated environment differs from live exchange trading, and what the platform does and does not do.",
  },
  '/contact-us': {
    title:
      "Contact DhanFunded — Support for Indian Participants",
    description:
      "Reach DhanFunded support about assessments, payouts, KYC or your account. Email and phone support for participants across India.",
  },
  '/blog': {
    title:
      "DhanFunded Blog — Funded Trading Guides for India",
    description:
      "Practical guides on passing a funded evaluation in India: sizing inside a daily loss limit, the rules that fail most accounts, how payouts actually reach your bank, and choosing between 1-Step and 2-Step.",
  },
  // Topic landing pages. SeoLanding passes title/description explicitly, but
  // keeping them here means a direct hit still gets the right tags before the
  // page component mounts.
  '/prop-firm-india': {
    title:
      "Prop Firm in India — Funded Accounts on NIFTY & BANKNIFTY | DhanFunded",
    description:
      "A prop firm assessment built for Indian index derivatives. Accounts from ₹1 Lakh to ₹50 Lakh, one-time fees from ₹2,700, 80% performance share and payouts every 14 days in INR.",
  },
  '/nifty-prop-firm': {
    title:
      "NIFTY Prop Firm — Funded NIFTY Options Account | DhanFunded",
    description:
      "Trade NIFTY 50 index options in a rules-based assessment. Lot size 65, a ₹4,000 daily loss limit on a ₹1 Lakh account, 80% performance share paid in INR every 14 days.",
  },
  '/banknifty-prop-firm': {
    title:
      "BANKNIFTY Prop Firm — Funded BANKNIFTY Trading | DhanFunded",
    description:
      "Trade BANKNIFTY index options in a rules-based assessment. Lot size 35, the same published loss limits as every programme, 80% performance share paid in INR every 14 days.",
  },
  '/sensex-prop-firm': {
    title:
      "SENSEX Prop Firm — Funded SENSEX Options Account | DhanFunded",
    description:
      "Trade BSE SENSEX index options in a rules-based assessment. Accounts from ₹1 Lakh, fees from ₹2,700, loss limits published in rupees, and 80% of the profit paid in INR every 14 days.",
  },
  '/funded-trading-account-india': {
    title:
      "Funded Trading Account in India — Get Funded from ₹2,700 | DhanFunded",
    description:
      "How to get a funded trading account in India: one assessment from ₹2,700 on a ₹1 Lakh account, loss limits published in rupees, and 80% of the profit paid to your Indian bank account every 14 days.",
  },
  '/instant-funding-prop-firm-india': {
    title:
      "Instant Funding Prop Firm India — No Evaluation, ₹4,100 | DhanFunded",
    description:
      "Instant funding in India with no assessment phase: from a one-time ₹4,100 on a ₹1 Lakh account (sizes up to ₹50 Lakh), a 3% daily and 6% overall loss limit, and 70% of the profit paid in INR every 14 days.",
  },
  '/prop-trading-india': {
    title:
      "Prop Trading in India — How It Works and What to Check | DhanFunded",
    description:
      "What proprietary trading means in India, how a simulated evaluation works on NSE and BSE index options, what it costs, what you can lose, and the five things to check before paying any firm a fee.",
  },
  '/inr-upi-prop-firm-india': {
    title:
      "Prop Firm That Pays in INR — UPI Fees, Indian Bank Payouts | DhanFunded",
    description:
      "An Indian prop firm evaluation priced in rupees: pay the one-time fee by UPI from \u20b92,700, trade NIFTY, BANKNIFTY and SENSEX, and receive your reward share in INR to your own bank account every 14 days. No dollars, no conversion, no LRS.",
  },
  '/indian-stock-market-prop-firm': {
    title:
      "Prop Firm for the Indian Stock Market — NSE & BSE Only | DhanFunded",
    description:
      "An evaluation built for NSE and BSE index options — NIFTY, BANKNIFTY and SENSEX during Indian market hours. No forex, no crypto, no US futures. One-time fee from \u20b92,700, rewards paid in INR.",
  },
  '/prop-challenge-india': {
    title:
      "Prop Challenge India \u2014 Rules, Targets & Loss Limits | DhanFunded",
    description:
      "What a prop trading challenge in India actually asks of you: profit targets, daily and overall loss limits, time windows and what happens after you pass. Fees from \u20b92,700, one-time.",
  },
  '/privacy-policy': {
    title: 'Privacy Policy | DhanFunded',
    description: 'How DhanFunded collects, uses, stores and protects your personal information.',
  },
  '/terms': {
    title: 'Terms & Conditions | DhanFunded',
    description: 'The terms governing your use of the DhanFunded assessment platform and funded accounts.',
  },
  '/refund-policy': {
    title: 'Refund Policy | DhanFunded',
    description: 'When assessment fees are refundable at DhanFunded, and how to request a refund.',
  },
  '/risk-disclaimer': {
    title: 'Risk Disclaimer | DhanFunded',
    description:
      'Important risk information about the DhanFunded simulated evaluation environment. Read before participating in any assessment.',
  },
  '/login': {
    title: 'Login | DhanFunded',
    description: 'Sign in to your DhanFunded account to continue your assessment or manage your funded account.',
  },
  '/register': {
    title: 'Create Account | DhanFunded',
    description: 'Create a free DhanFunded account and start an INR-denominated trading assessment on Indian indices.',
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
