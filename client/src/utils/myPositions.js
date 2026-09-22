import { API_URL } from '../pages/User/userConfig';

/**
 * One shared fetch of /api/prop/my-positions.
 *
 * The endpoint returns { open, pending, closed } in a single response, but the
 * terminal asked for it three separate times — fetchPositions took `open`,
 * fetchPendingOrders took `pending`, fetchTradeHistory took `closed` — and two
 * of those run on their own 5-second timer. Three round trips, three JSON
 * parses and three identical payloads over the wire for data that arrives
 * together.
 *
 * Anyone calling within the TTL (or while a request is already in flight) gets
 * the same promise. 1.5s is comfortably under the 5s poll, so each polling tick
 * still makes exactly one real request and nothing ever shows stale data.
 */
const TTL_MS = 1500;

let inflight = null;
let cached = null;
let cachedAt = 0;

export function getMyPositions({ force = false } = {}) {
  const fresh = !force && cached && Date.now() - cachedAt < TTL_MS;
  if (fresh) return Promise.resolve(cached);
  if (inflight && !force) return inflight;

  const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
  inflight = fetch(`${API_URL}/api/prop/my-positions`, {
    headers: { Authorization: `Bearer ${authData.token || ''}` },
  })
    .then((r) => r.json())
    .then((data) => {
      // Only a successful payload is worth caching — an error response must not
      // suppress the next caller's real attempt.
      if (data?.success) {
        cached = data;
        cachedAt = Date.now();
      }
      return data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Call after placing/closing a trade so the next read is not the cached one. */
export function invalidateMyPositions() {
  cached = null;
  cachedAt = 0;
}
