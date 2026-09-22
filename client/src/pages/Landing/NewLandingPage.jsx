import { lazy, Suspense } from 'react';

// Above the fold — eager, so the first paint is complete.
import LandingShell from './components/LandingShell';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import MarketStrip from './components/MarketStrip';
import WhatsAppFloat from './components/WhatsAppFloat';

// Below the fold — lazy, keeps the initial bundle small.
const HowItWorks = lazy(() => import('./components/HowItWorks'));
const TrustPanel = lazy(() => import('./components/TrustPanel'));
const PricingTable = lazy(() => import('./components/PricingTable'));
const ProcessSteps = lazy(() => import('./components/ProcessSteps'));
const WhyLoveUs = lazy(() => import('./components/WhyLoveUs'));
const TechBenefits = lazy(() => import('./components/TechBenefits'));
const TopicLinks = lazy(() => import('./components/TopicLinks'));
const FAQ = lazy(() => import('./components/FAQ'));
const CtaBand = lazy(() => import('./components/CtaBand'));
const Footer = lazy(() => import('./components/Footer'));

const Fallback = () => <div style={{ minHeight: 220 }} />;

/* Schema for what is actually on THIS page.
   It used to live in index.html, which every prerendered route inherits — so
   /privacy-policy advertised an AggregateOffer and every topic page carried the
   homepage's FAQs on top of its own. Describing the page you are on is the
   whole point, so it belongs here. */
const HOME_SCHEMA = [
  {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": "Funded Trader Evaluation",
    "provider": {
      "@type": "Organization",
      "name": "DhanFunded"
    },
    "areaServed": {
      "@type": "Country",
      "name": "India"
    },
    "description": "Simulated prop firm evaluation for Indian intraday people. NIFTY, BANKNIFTY and SENSEX futures and options. Account sizes from ₹1 Lakh to ₹50 Lakhs.",
    "offers": {
      "@type": "AggregateOffer",
      "priceCurrency": "INR",
      "lowPrice": "3000",
      "highPrice": "55000"
    }
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "How do I get funded on DhanFunded?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Pass our simulated evaluation on NIFTY, BANKNIFTY or SENSEX within the rules, and get funded up to ₹50 Lakhs. Once funded, you earn real performance payouts in INR to your Indian bank account."
        }
      },
      {
        "@type": "Question",
        "name": "What account sizes are available?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Funded account sizes range from ₹1 Lakh to ₹50 Lakhs, with 1-Step, 2-Step and Instant funding options."
        }
      },
      {
        "@type": "Question",
        "name": "Are payouts made in Indian Rupees (INR)?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. DhanFunded is a fully INR-based platform. All fees and payouts are in Indian Rupees, paid directly to your Indian bank account."
        }
      },
      {
        "@type": "Question",
        "name": "Which instruments can I practice on?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "You can practice on NIFTY, BANKNIFTY and SENSEX futures and options in a structured, simulated evaluation environment built for Indian intraday people."
        }
      }
    ]
  }
];

export default function NewLandingPage() {
  return (
    <LandingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_SCHEMA) }}
      />
      <Navbar />
      <Hero />
      <MarketStrip />

      <Suspense fallback={<Fallback />}>
        <HowItWorks />
        <TrustPanel />
        <PricingTable />
        <ProcessSteps />
        <WhyLoveUs />
        <TechBenefits />
        <TopicLinks />
        <FAQ />
        <CtaBand />
        <Footer />
      </Suspense>

      <WhatsAppFloat />
    </LandingShell>
  );
}
