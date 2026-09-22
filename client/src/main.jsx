import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installAuthFetchInterceptor } from './lib/authFetchInterceptor'

// Attach the admin bearer token to every /api/admin/* request automatically.
// Needed because the server chokepoint (Phase 2) now requires auth on all
// admin routes, but many legacy admin pages don't send the header themselves.
installAuthFetchInterceptor();

// Error Boundary to catch React errors
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: '#ef4444', background: '#05131B', minHeight: '100dvh' }}>
          <h1>Something went wrong</h1>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: '10px' }}>
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)

// Register the PWA service worker (production only — keeps dev hot-reload clean).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // When a new SW takes control, force-reload once to pick up the new build.
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
        // If an update is found, ask it to skip waiting so users get fresh code fast.
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              nw.postMessage('skip-waiting');
            }
          });
        });
      })
      .catch((err) => console.warn('[SW] registration failed:', err));
  });
}
