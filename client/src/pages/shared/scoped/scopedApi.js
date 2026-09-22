/**
 * Thin wrapper around fetch for /api/admin/scoped/* endpoints.
 *
 * Sub-admin and broker panels both hit the same backend routes — the server
 * derives the admin's user-scope from the bearer token. This helper just
 * centralizes the auth-header + JSON parsing.
 */

const getAdminToken = () => localStorage.getItem('dhanfunded-admin-token') || '';

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request(API_URL, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_URL}/api/admin/scoped${path}`, {
    method,
    headers: buildHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { success: false, error: `Non-JSON response (HTTP ${res.status})` };
  }
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  }
  return data;
}

export const scopedApi = {
  // Segments
  listSegments: (API_URL, mode) => request(API_URL, `/segments/${mode}`),
  readSegment:  (API_URL, mode, name) => request(API_URL, `/segments/${mode}/${encodeURIComponent(name)}`),
  writeSegment: (API_URL, mode, name, body) => request(API_URL, `/segments/${mode}/${encodeURIComponent(name)}`, { method: 'PUT', body }),
  clearSegment: (API_URL, mode, name) => request(API_URL, `/segments/${mode}/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  // Reorder
  readReorder:  (API_URL) => request(API_URL, '/reorder'),
  writeReorder: (API_URL, body) => request(API_URL, '/reorder', { method: 'PUT', body }),
  clearReorder: (API_URL) => request(API_URL, '/reorder', { method: 'DELETE' }),

  // Risk
  readRisk:  (API_URL) => request(API_URL, '/risk'),
  writeRisk: (API_URL, body) => request(API_URL, '/risk', { method: 'PUT', body }),
  clearRisk: (API_URL) => request(API_URL, '/risk', { method: 'DELETE' }),

  // Audit (Phase 6)
  listAudit: (API_URL, params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, String(v));
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(API_URL, `/audit${suffix}`);
  },

  // Per-user scoped writes (Phase 7)
  searchUsers: (API_URL, q, limit = 10) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    qs.set('limit', String(limit));
    return request(API_URL, `/users/search?${qs.toString()}`);
  },
  readUserSegment:  (API_URL, userId, mode, name) => request(API_URL, `/users/${userId}/segment/${mode}/${encodeURIComponent(name)}`),
  writeUserSegment: (API_URL, userId, mode, name, body) => request(API_URL, `/users/${userId}/segment/${mode}/${encodeURIComponent(name)}`, { method: 'PUT', body }),
  clearUserSegment: (API_URL, userId, mode, name) => request(API_URL, `/users/${userId}/segment/${mode}/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  readUserReorder:  (API_URL, userId) => request(API_URL, `/users/${userId}/reorder`),
  writeUserReorder: (API_URL, userId, body) => request(API_URL, `/users/${userId}/reorder`, { method: 'PUT', body }),
  clearUserReorder: (API_URL, userId) => request(API_URL, `/users/${userId}/reorder`, { method: 'DELETE' }),
  readUserRisk:  (API_URL, userId) => request(API_URL, `/users/${userId}/risk`),
  writeUserRisk: (API_URL, userId, body) => request(API_URL, `/users/${userId}/risk`, { method: 'PUT', body }),
  clearUserRisk: (API_URL, userId) => request(API_URL, `/users/${userId}/risk`, { method: 'DELETE' }),

  // Scripts (Phase 8)
  listScripts: (API_URL, mode, segment) => {
    const qs = segment ? `?segment=${encodeURIComponent(segment)}` : '';
    return request(API_URL, `/scripts/${mode}${qs}`);
  },
  readScript:  (API_URL, mode, segmentName, symbol) =>
    request(API_URL, `/scripts/${mode}/${encodeURIComponent(segmentName)}/${encodeURIComponent(symbol)}`),
  writeScript: (API_URL, mode, segmentName, symbol, body) =>
    request(API_URL, `/scripts/${mode}/${encodeURIComponent(segmentName)}/${encodeURIComponent(symbol)}`, { method: 'PUT', body }),
  clearScript: (API_URL, mode, segmentName, symbol) =>
    request(API_URL, `/scripts/${mode}/${encodeURIComponent(segmentName)}/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),
  readUserScript:  (API_URL, userId, mode, segmentName, symbol) =>
    request(API_URL, `/users/${userId}/script/${mode}/${encodeURIComponent(segmentName)}/${encodeURIComponent(symbol)}`),
  writeUserScript: (API_URL, userId, mode, segmentName, symbol, body) =>
    request(API_URL, `/users/${userId}/script/${mode}/${encodeURIComponent(segmentName)}/${encodeURIComponent(symbol)}`, { method: 'PUT', body }),
  clearUserScript: (API_URL, userId, mode, segmentName, symbol) =>
    request(API_URL, `/users/${userId}/script/${mode}/${encodeURIComponent(segmentName)}/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),

  // Snapshot for Copy Settings
  readUserSnapshot: (API_URL, userId) => request(API_URL, `/users/${userId}/snapshot`),

  // User Management (Phase 9)
  listScopedUsers: (API_URL, params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') qs.set(k, String(v));
    return request(API_URL, `/users-list?${qs.toString()}`);
  },
  readScopedUser:  (API_URL, id) => request(API_URL, `/users-list/${id}`),
  setUserStatus:   (API_URL, id, isActive) => request(API_URL, `/users-list/${id}/status`, { method: 'PATCH', body: { isActive } }),
  adjustUserWallet: (API_URL, id, body) => request(API_URL, `/users-list/${id}/wallet`, { method: 'POST', body }),

  // KYC (Phase 9)
  listScopedKyc: (API_URL, params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') qs.set(k, String(v));
    return request(API_URL, `/kyc-list?${qs.toString()}`);
  },
  readScopedKyc:    (API_URL, kycId) => request(API_URL, `/kyc-list/${kycId}`),
  approveScopedKyc: (API_URL, kycId) => request(API_URL, `/kyc-list/${kycId}/approve`, { method: 'PUT' }),
  rejectScopedKyc:  (API_URL, kycId, reason) => request(API_URL, `/kyc-list/${kycId}/reject`, { method: 'PUT', body: { reason } }),

  listScopedActivityLogs: (API_URL, params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') qs.set(k, String(v));
    return request(API_URL, `/activity-logs-list?${qs.toString()}`);
  },

  // Position Management (Phase 10)
  listComposedTrades: (API_URL, params = {}) => listWithQs(API_URL, '/trades/composed', params),
  listOpenTrades:     (API_URL, params = {}) => listWithQs(API_URL, '/trades/open', params),
  listPendingTrades:  (API_URL, params = {}) => listWithQs(API_URL, '/trades/pending', params),
  listTradeHistory:   (API_URL, params = {}) => listWithQs(API_URL, '/trades/history', params),
  listScopedTransactions: (API_URL, params = {}) => listWithQs(API_URL, '/transactions-list', params),
};

function listWithQs(API_URL, path, params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') qs.set(k, String(v));
  return request(API_URL, `${path}${qs.toString() ? '?' + qs.toString() : ''}`);
}

export default scopedApi;
