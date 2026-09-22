// NOT RENDERED ANYWHERE — the offer strip was removed from the top of every
// landing page. Kept so the admin banner UI has something to switch back on:
// re-add <TopBanner /> above <Navbar /> and restore the navbar's top offset.
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTopBannerStore, selectBannerVisible } from '../hooks/useTopBannerStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Default offer shown when no admin-configured banner is active (or the
// backend is unreachable). An active banner from the API overrides this.
// Edit the wording/discount/code here to change the default promo.
const DEFAULT_BANNER = {
  code: 'WELCOME10',
  discountPercent: 10,
  bannerText: '',
  firstTimeOnly: true,
};

export default function TopBanner() {
  const [banner, setBanner] = useState(DEFAULT_BANNER);
  const visible = useTopBannerStore(selectBannerVisible);
  const setHasBanner = useTopBannerStore((s) => s.setHasBanner);
  const dismiss = useTopBannerStore((s) => s.dismiss);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/global-coupons/banner`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        // Real admin banner takes priority; otherwise keep the default.
        if (d?.success && d.banner) setBanner(d.banner);
      })
      .catch(() => { /* silent — fall back to the default banner */ });
    return () => { cancelled = true; };
  }, []);

  // Tell the Navbar there's an offer to make room for (default always exists).
  useEffect(() => {
    setHasBanner(!!banner);
  }, [banner, setHasBanner]);

  if (!visible || !banner) return null;

  const custom = banner.bannerText && banner.bannerText.trim();
  // The full sentence wraps to two lines on a 390px screen, doubling the strip's
  // height. Phones get a trimmed version; the qualifier is on the pricing page
  // anyway. One line, both widths.
  const text = custom || `Get ${banner.discountPercent}% OFF on all Challenges${banner.firstTimeOnly ? ' (first-time users)' : ''} — use code`;
  const shortText = custom || `${banner.discountPercent}% OFF — use code`;

  return (
    // Was hardcoded near-black, which sat as a dark stripe across the top of the
    // (now default) light site. The brand gold is the same in both themes —
    // identical treatment to .pf-btn--primary — so the strip belongs either way.
    <div
      className="fixed top-0 left-0 right-0 z-[60] text-xs sm:text-sm font-medium"
      style={{
        background: 'linear-gradient(180deg, var(--pf-gold-2), var(--pf-gold))',
        color: 'var(--pf-on-gold)',
      }}
    >
      <div className="max-w-6xl mx-auto pl-4 pr-10 py-1.5 sm:py-2.5 flex items-center justify-center gap-2 sm:gap-3 relative">
        <span className="text-center leading-snug whitespace-nowrap overflow-hidden text-ellipsis">
          🎉 <span className="hidden sm:inline">{text}</span><span className="sm:hidden">{shortText}</span>{' '}
          <span
            className="inline-block font-bold px-1.5 sm:px-2 py-0.5 rounded tracking-wider"
            style={{ background: 'rgba(20, 20, 15, 0.88)', color: '#22D9E8' }}
          >
            {banner.code}
          </span>
        </span>
        <button
          onClick={dismiss}
          className="absolute right-3 sm:right-4 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Close banner"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
