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
    "description": "Simulated prop firm evaluation for Indian intraday traders on NIFTY, BANKNIFTY and SENSEX options. Account sizes from ₹1 Lakh to ₹25 Lakh, fees from ₹3,000.",
    // Only the floor is known in code (programmes.js lists the ₹1 Lakh fees);
    // larger tiers are priced in the admin, so no highPrice is claimed.
    "offers": {
      "@type": "AggregateOffer",
      "priceCurrency": "INR",
      "lowPrice": "3000"
    }
  }
  // No FAQPage: Google only shows FAQ rich results for gov/health sites, and
  // this copy had drifted from the visible FAQ (it still said "futures").
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
        <FAQ />
        <CtaBand />
        <Footer />
      </Suspense>

      <WhatsAppFloat />
    </LandingShell>
  );
}
