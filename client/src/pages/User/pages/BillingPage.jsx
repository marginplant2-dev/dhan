import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authData.token || ''}`
  };
}

function BillingPage() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [myAccounts, setMyAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/prop/my-accounts`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) setMyAccounts(data.accounts || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // Derive billing/purchase history from accounts. When a coupon was
  // applied, prefer the snapshot's actual paid (finalFee) over the legacy
  // challengeFee so the amount column reflects what the user actually paid.
  const purchases = myAccounts
    // Only ACTUAL purchases. Funded accounts that were auto-created on passing
    // an evaluation get an 'FND…' accountId — they are NOT purchases (the user
    // never paid for them) and were showing as phantom billing rows with the
    // wrong fund size + pass-date. Purchased accounts (direct / UPI / instant)
    // use a 'CH…' accountId, so keep only those.
    .filter(a => !String(a.accountId || '').toUpperCase().startsWith('FND'))
    .map(a => {
    const snap = a.couponSnapshot && a.couponSnapshot.code ? a.couponSnapshot : null;
    const originalFee = snap ? Number(snap.originalFee) : Number(a.challengeId?.challengeFee || 0);
    const paidFee = snap ? Number(snap.finalFee) : originalFee;
    return {
      id: a._id,
      name: a.challengeId?.name || 'Challenge',
      // Fund size = the tier the user ACTUALLY bought (account.initialBalance),
      // NOT the challenge template's base fundSize (same for every tier, which
      // made every row wrongly show the base size).
      fundSize: a.initialBalance || a.challengeId?.fundSize,
      originalFee,
      fee: paidFee,
      coupon: snap ? {
        code: snap.code,
        discountPercent: snap.discountPercent,
        discountAmount: Number(snap.discountAmount || 0)
      } : null,
      accountId: a.accountId,
      status: a.status,
      paymentStatus: a.paymentStatus || 'COMPLETED',
      date: a.createdAt,
    };
  });

  const totalSpent = purchases.reduce((sum, p) => sum + (p.fee || 0), 0);
  const totalSaved = purchases.reduce((sum, p) => sum + (p.coupon?.discountAmount || 0), 0);

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ padding: '24px 28px 60px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Home / <span style={{ color: 'var(--text-primary)' }}>Billing</span>
        </div>

        <h1 style={{ color: 'var(--text-primary)', fontSize: '22px', fontWeight: '700', margin: '0 0 4px' }}>Billing</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 28px' }}>Your evaluation purchases and payment history.</p>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '28px' }}>
          <div style={{ padding: '18px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Spent</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#f59e0b' }}>₹{totalSpent.toLocaleString('en-IN')}</div>
          </div>
          <div style={{ padding: '18px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Evaluations Purchased</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#3b82f6' }}>{purchases.length}</div>
          </div>
          <div style={{ padding: '18px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Active</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#10b981' }}>{myAccounts.filter(a => a.status === 'ACTIVE' || a.status === 'FUNDED').length}</div>
          </div>
          {totalSaved > 0 && (
            <div style={{ padding: '18px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Saved via Coupons</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#10b981' }}>₹{totalSaved.toLocaleString('en-IN')}</div>
            </div>
          )}
        </div>

        {/* Purchase History */}
        <h2 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '700', margin: '0 0 14px' }}>Purchase History</h2>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Loading...</p>
        ) : purchases.length > 0 ? (
          <div style={{
            borderRadius: '14px', overflow: 'hidden',
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
          }}>
            {/* Table Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
              padding: '12px 18px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)',
              borderBottom: '1px solid var(--border-color)', textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              <span>Challenge</span>
              <span>Amount</span>
              <span>Fund Size</span>
              <span>Status</span>
              <span>Date</span>
            </div>

            {purchases.map((p, i) => (
              <div key={p.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                padding: '14px 18px', fontSize: '12px', alignItems: 'center',
                borderBottom: i < purchases.length - 1 ? '1px solid var(--border-color)' : 'none'
              }}>
                <div>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{p.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{p.accountId}</div>
                </div>
                <span style={{ fontWeight: '700', color: '#f59e0b' }}>
                  {p.coupon ? (
                    <>
                      <span style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', textDecoration: 'line-through', fontWeight: 500 }}>
                        ₹{Number(p.originalFee || 0).toLocaleString('en-IN')}
                      </span>
                      <span style={{ color: '#10b981' }}>₹{Number(p.fee || 0).toLocaleString('en-IN')}</span>
                      <span style={{ display: 'block', fontSize: 9, color: '#10b981', fontWeight: 600 }}>
                        {p.coupon.code} · −{p.coupon.discountPercent}%
                      </span>
                    </>
                  ) : (
                    <>₹{Number(p.fee || 0).toLocaleString('en-IN')}</>
                  )}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>₹{p.fundSize?.toLocaleString('en-IN')}</span>
                <span style={{
                  padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                  background: p.paymentStatus === 'COMPLETED' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                  color: p.paymentStatus === 'COMPLETED' ? '#10b981' : '#f59e0b',
                  display: 'inline-block', width: 'fit-content'
                }}>
                  {p.paymentStatus}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{new Date(p.date).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            textAlign: 'center', padding: '40px', borderRadius: '14px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
          }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 12px' }}>No purchases yet.</p>
            <button
              onClick={() => navigate('/app/challenges')}
              style={{
                padding: '10px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: '#3b82f6', color: '#fff', fontWeight: '600', fontSize: '13px'
              }}
            >
              Start Evaluation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default BillingPage;
