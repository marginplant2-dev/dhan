/**
 * Global fetch interceptor (stop-gap for Phase 2 chokepoint rollout).
 *
 * After we added `app.use('/api/admin', enforceAdminPermissionByRoute)` on the
 * server, every admin endpoint now requires a bearer token. Most of the existing
 * admin pages were written before that and call `fetch('/api/admin/...')` with no
 * headers, so they 401 now.
 *
 * Rather than edit every call site, we monkey-patch `window.fetch` once so any
 * request to `/api/admin/*` automatically picks up the token from localStorage.
 * Regular user-facing requests (`/api/auth/*`, `/api/users/*`, etc.) are
 * untouched, so user sessions still work normally.
 *
 * Safe to call multiple times — we stash a one-shot guard on window.
 */

const ADMIN_URL_PATTERN = /\/api\/admin(\/|\?|$)/;
const API_URL_PATTERN = /\/api\//;
const USER_AUTH_KEY = 'dhanfunded-auth';

/**
 * The server hands back a renewed session token on any request made with one
 * that is past a third of its life. Storing it here is what keeps an active
 * user logged in indefinitely — the token they hold is never the one that
 * expires.
 */
function captureRenewedToken(response) {
  try {
    const fresh = response.headers.get('X-Renewed-Token');
    if (!fresh) return;
    const raw = localStorage.getItem(USER_AUTH_KEY);
    if (!raw) return;
    const auth = JSON.parse(raw);
    if (auth && auth.token && auth.token !== fresh) {
      auth.token = fresh;
      localStorage.setItem(USER_AUTH_KEY, JSON.stringify(auth));
    }
  } catch { /* storage blocked or corrupt entry */ }
}

/**
 * A dead session used to look like empty data: pages check `data.success` and
 * a 401 simply left their lists empty, so a user's challenges appeared to have
 * vanished until they logged out and back in by hand. Send them to the login
 * screen instead, and say why.
 */
async function handleDeadSession(response) {
  if (response.status !== 401) return;
  let stored = null;
  try { stored = localStorage.getItem(USER_AUTH_KEY); } catch { return; }
  if (!stored) return;

  // Only a token the server rejected ends the session — a 401 that means
  // something else must not log anybody out.
  let reason = '';
  try {
    const body = await response.clone().json();
    reason = String(body?.message || body?.error || '');
  } catch { return; }
  if (!/invalid token|token expired|jwt expired|unauthorized|user not found/i.test(reason)) return;

  const path = window.location.pathname;
  if (path.startsWith('/login') || path.startsWith('/register')) return;

  try { localStorage.removeItem(USER_AUTH_KEY); } catch { /* ignore */ }
  window.location.replace('/login?expired=1');
}

export function installAuthFetchInterceptor() {
  if (typeof window === 'undefined') return;
  if (window.__authFetchPatched) return;
  window.__authFetchPatched = true;

  const original = window.fetch.bind(window);

  window.fetch = function patchedFetch(input, init = {}) {
    try {
      // Only target admin URLs. The `input` can be a Request, string, or URL object.
      const url =
        typeof input === 'string' ? input
        : input instanceof URL ? input.toString()
        : input?.url || '';

      // Every /api call is watched for a renewed session token and for one the
      // server rejected, whichever page made the call.
      const watch = API_URL_PATTERN.test(url)
        ? (p) => p.then((res) => { captureRenewedToken(res); handleDeadSession(res); return res; })
        : (p) => p;

      if (!ADMIN_URL_PATTERN.test(url)) {
        return watch(original(input, init));
      }

      // While a tab is impersonating, it must sign as the impersonated admin —
      // otherwise the sub-admin panel would read the platform as the super-admin
      // and show exactly the data the operator is not supposed to be looking at.
      // sessionStorage is per-tab, so the operator's own tabs are unaffected.
      let token = '';
      try { token = sessionStorage.getItem('dhanfunded-impersonate-token') || ''; } catch { /* private mode */ }
      if (!token) token = localStorage.getItem('dhanfunded-admin-token') || '';
      if (!token) return watch(original(input, init));

      // Don't overwrite a caller-provided Authorization header.
      const existingHeaders = init?.headers;
      const alreadyHasAuth =
        existingHeaders &&
        (
          (typeof existingHeaders.get === 'function' && existingHeaders.get('Authorization')) ||
          (typeof existingHeaders === 'object' && (existingHeaders.Authorization || existingHeaders.authorization))
        );

      if (alreadyHasAuth) return watch(original(input, init));

      // Merge headers — preserve existing ones (including Content-Type / Accept).
      let mergedHeaders;
      if (existingHeaders instanceof Headers) {
        mergedHeaders = new Headers(existingHeaders);
        mergedHeaders.set('Authorization', `Bearer ${token}`);
      } else {
        mergedHeaders = { ...(existingHeaders || {}), Authorization: `Bearer ${token}` };
      }

      return watch(original(input, { ...init, headers: mergedHeaders }));
    } catch (err) {
      // Never let interceptor bugs break the request.
      console.warn('[authFetchInterceptor] failed, falling back:', err);
      return original(input, init);
    }
  };
}

export default installAuthFetchInterceptor;
