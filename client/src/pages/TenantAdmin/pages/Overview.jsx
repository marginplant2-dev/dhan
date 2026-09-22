import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';

/**
 * What this admin actually owns. Every number comes from the scoped API, so an
 * empty pool shows zeros — never the platform's totals.
 */
export default function Overview() {
  const { API_URL, admin } = useOutletContext();
  const [state, setState] = useState({ loading: true, users: null, funds: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [uRes, fRes] = await Promise.all([
          fetch(`${API_URL}/api/admin/scoped/users-list?limit=1`),
          fetch(`${API_URL}/api/admin/scoped/transactions-list?limit=1`),
        ]);
        const [u, f] = await Promise.all([uRes.json(), fRes.json()]);
        if (cancelled) return;
        setState({
          loading: false,
          users: u.success ? u.pagination : null,
          funds: f.success ? f.summary : null,
          error: u.success ? '' : (u.error || ''),
        });
      } catch {
        if (!cancelled) setState(s => ({ ...s, loading: false, error: 'Could not reach the server' }));
      }
    })();
    return () => { cancelled = true; };
  }, [API_URL]);

  const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  if (state.loading) return <div className="tp-card tp-muted">Loading…</div>;

  return (
    <>
      <div className="tp-stats" style={{ marginBottom: 20 }}>
        <div className="tp-card">
          <div className="tp-stat-label">My users</div>
          <div className="tp-stat-value">{state.users?.total ?? 0}</div>
          <div className="tp-stat-note">Everyone assigned to {admin.oderId}</div>
        </div>
        <div className="tp-card">
          <div className="tp-stat-label">Deposits approved</div>
          <div className="tp-stat-value">{money(state.funds?.approvedDeposits)}</div>
          <div className="tp-stat-note">Counted from the day each user joined you</div>
        </div>
        <div className="tp-card">
          <div className="tp-stat-label">Withdrawals approved</div>
          <div className="tp-stat-value">{money(state.funds?.approvedWithdrawals)}</div>
          <div className="tp-stat-note">Paid out to your users</div>
        </div>
        <div className="tp-card">
          <div className="tp-stat-label">Pending requests</div>
          <div className="tp-stat-value">{state.funds?.pending ?? 0}</div>
          <div className="tp-stat-note">Waiting on a decision</div>
        </div>
      </div>

      {(state.users?.total ?? 0) === 0 && (
        <div className="tp-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>No users in your pool yet</h3>
          <p className="tp-muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
            This is not an error — you are seeing only what belongs to you. Users arrive in
            two ways: the platform owner assigns existing users to you, or someone signs up
            on your own connected domain. Set that up under <strong>Branding &amp; Domain</strong>.
          </p>
        </div>
      )}

      {state.error && <div className="tp-card" style={{ marginTop: 16 }}>{state.error}</div>}
    </>
  );
}
