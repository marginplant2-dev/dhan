import { useEffect, useState } from 'react';
import { Download, Smartphone, Share, Plus, X } from 'lucide-react';

/**
 * "Install App" button for the DhanFunded PWA.
 *
 * Behaviour:
 *  - Android Chrome / Edge / Samsung Internet:
 *      Captures `beforeinstallprompt` and calls it on click. The browser shows
 *      the native install dialog and adds an icon on the home-screen.
 *      The installed app launches at /app in standalone mode (no browser UI).
 *  - iOS Safari (and any browser without the prompt):
 *      Opens a small modal showing "Tap Share → Add to Home Screen".
 *  - Already-installed PWA: button hides itself.
 */
export default function InstallAppButton({ className = '', label = 'Install App', variant = 'primary' }) {
  // Seed from the prompt index.html captured before this bundle even parsed —
  // Chrome fires beforeinstallprompt too early for a useEffect listener to win.
  const [deferredPrompt, setDeferredPrompt] = useState(() => window.__pfInstallPrompt || null);
  const [installed, setInstalled] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      window.__pfInstallPrompt = e;
      setDeferredPrompt(e);
    };
    const onReady = () => setDeferredPrompt(window.__pfInstallPrompt || null);
    const onInstalled = () => {
      setInstalled(true);
      window.__pfInstallPrompt = null;
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('pf-install-ready', onReady);
    window.addEventListener('appinstalled', onInstalled);
    // If the event landed between module-eval and mount, pick it up now.
    if (!deferredPrompt && window.__pfInstallPrompt) setDeferredPrompt(window.__pfInstallPrompt);

    // Detect already running as installed PWA.
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (isStandalone) setInstalled(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('pf-install-ready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  const handleClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch { /* dismissed */ }
      // A prompt can only be used once — drop it from both places.
      window.__pfInstallPrompt = null;
      setDeferredPrompt(null);
      return;
    }
    if (isIOS()) {
      setShowIOSHelp(true);
      return;
    }
    // Desktop browsers without prompt support — show iOS-style instructions.
    setShowIOSHelp(true);
  };

  if (installed) return null;

  const base =
    'inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm transition-all whitespace-nowrap';
  const styles =
    variant === 'ghost'
      ? 'border border-[#DCE9E2] text-[#0A2130] hover:border-[#35DC85] hover:text-[#35DC85]'
      : 'bg-[#35DC85] text-white shadow-[0_6px_20px_rgba(43,78,255,0.3)] hover:bg-[#4B6AFF]';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`${base} ${styles} ${className}`}
        aria-label="Install DhanFunded app"
      >
        <Smartphone size={16} />
        <span>{label}</span>
        <Download size={14} />
      </button>

      {showIOSHelp && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowIOSHelp(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(13,15,26,0.6)',
            backdropFilter: 'blur(6px)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 20, padding: 24, maxWidth: 380, width: '100%',
              boxShadow: '0 24px 64px rgba(0,0,0,0.3)', position: 'relative', color: '#0A2130',
            }}
          >
            <button
              onClick={() => setShowIOSHelp(false)}
              aria-label="Close"
              style={{
                position: 'absolute', top: 12, right: 12, background: 'transparent',
                border: 'none', cursor: 'pointer', padding: 6, color: '#6B7080',
              }}
            >
              <X size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: 'rgba(43,78,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#35DC85',
              }}>
                <Smartphone size={22} />
              </div>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>Install DhanFunded</h3>
                <p style={{ fontSize: 12, color: '#6B7080', margin: 0 }}>Add it to your home screen</p>
              </div>
            </div>
            <ol style={{ paddingLeft: 0, listStyle: 'none', margin: '16px 0 0' }}>
              <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <span style={stepNum}>1</span>
                <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                  Tap the <strong>Share</strong> icon <Share size={14} style={iconInline} /> at the bottom
                  (Safari) or top-right (Chrome) of the screen.
                </span>
              </li>
              <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <span style={stepNum}>2</span>
                <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                  Scroll and choose <strong>Add to Home Screen</strong>{' '}
                  <Plus size={14} style={iconInline} />.
                </span>
              </li>
              <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={stepNum}>3</span>
                <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                  Tap <strong>Add</strong>. The DhanFunded icon will appear on your
                  home screen, just like an app from the Play Store.
                </span>
              </li>
            </ol>
            <button
              onClick={() => setShowIOSHelp(false)}
              style={{
                marginTop: 20, width: '100%', padding: '12px 16px', borderRadius: 999,
                background: '#35DC85', color: '#fff', border: 'none', fontWeight: 600,
                fontSize: 14, cursor: 'pointer',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const stepNum = {
  flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
  background: '#35DC85', color: '#fff', fontSize: 12, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const iconInline = { display: 'inline', verticalAlign: '-2px' };
