import { useLandingTheme } from '../hooks/useLandingTheme';
import { LandingThemeContext } from '../hooks/landingThemeContext';
import Seo from '../../../components/Seo';
import '../landing.css';

// `seo` lets a page override the route-map defaults (blog posts pass their own
// title/excerpt). Kept as one <Seo> instance so canonical/og tags never double up.
export default function LandingShell({ children, seo }) {
  const value = useLandingTheme();
  return (
    <LandingThemeContext.Provider value={value}>
      <Seo {...seo} />
      <div className="landing-page min-h-screen" data-pf-theme={value.theme}>
        {children}
      </div>
    </LandingThemeContext.Provider>
  );
}
