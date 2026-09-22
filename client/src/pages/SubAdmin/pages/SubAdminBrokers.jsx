import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function SubAdminBrokers() {
  const { API_URL, adminAuth } = useOutletContext();
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });

  useEffect(() => {
    fetchBrokers();
  }, []);

  const fetchBrokers = async () => {
    try {
      const adminId = adminAuth?.user?._id;
      if (!adminId) return;

      const res = await fetch(`${API_URL}/api/admin/hierarchy/${adminId}/brokers`);
      const data = await res.json();
      if (data.success) {
        setBrokers(data.brokers || []);
      }
    } catch (error) {
      console.error('Error fetching brokers:', error);
    } finally {
      setLoading(false);
    }
  };

  const createBroker = async () => {
    try {
      const adminId = adminAuth?.user?._id;
      
      const res = await fetch(`${API_URL}/api/admin/hierarchy/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          role: 'broker',
          parentId: adminId,
          createdBy: adminId
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Broker created successfully! ID: ${data.admin.oderId}`);
        setShowCreateModal(false);
        setForm({ name: '', email: '', phone: '', password: '' });
        fetchBrokers();
      } else {
        alert(data.error || 'Failed to create broker');
      }
    } catch (error) {
      console.error('Error creating broker:', error);
      alert('Error creating broker');
    }
  };

  const toggleBrokerStatus = async (brokerId, currentStatus) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/hierarchy/${brokerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      const data = await res.json();
      if (data.success) {
        fetchBrokers();
      }
    } catch (error) {
      console.error('Error updating broker:', error);
    }
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading brokers...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>My Brokers ({brokers.length})</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: '#10b981',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          + Add Broker
        </button>
      </div>

      {/* Brokers Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {brokers.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 12 }}>
            No brokers yet. Click "Add Broker" to create one.
          </div>
        ) : (
          brokers.map(broker => (
            <div key={broker._id} style={{
              background: 'var(--bg-secondary)',
              borderRadius: 12,
              padding: 20,
              border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: '#10b981',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 700, fontSize: 16
                }}>
                  BR
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{broker.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{broker.oderId}</div>
                </div>
                <span style={{
                  marginLeft: 'auto',
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  background: broker.isActive ? '#22c55e' : '#ef4444',
                  color: 'white'
                }}>
                  {broker.isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>

              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                📧 {broker.email}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                📱 {broker.phone || 'N/A'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                💰 Wallet: ₹{broker.wallet?.balance?.toLocaleString() || 0}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setSelectedBroker(broker); setShowViewModal(true); }}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 6, border: 'none',
                    background: '#3b82f6', color: 'white', cursor: 'pointer', fontSize: 12
                  }}
                >
                  View
                </button>
                <button
                  onClick={() => toggleBrokerStatus(broker._id, broker.isActive)}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 6, border: 'none',
                    background: broker.isActive ? '#ef4444' : '#22c55e', color: 'white', cursor: 'pointer', fontSize: 12
                  }}
                >
                  {broker.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 450,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Create Broker</h3>
              <button onClick={() => setShowCreateModal(false)} style={{
                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
              }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  placeholder="Broker name" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  placeholder="broker@example.com" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Phone</label>
                <input type="text" value={form.phone} onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  placeholder="+91 XXXXXXXXXX" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Password *</label>
                <input type="password" value={form.password} onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  placeholder="Min 6 characters" />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button onClick={() => setShowCreateModal(false)} style={{ flex: 1, padding: '12px', borderRadius: 8, border: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
                <button onClick={createBroker} style={{ flex: 1, padding: '12px', borderRadius: 8, border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 600 }}>Create Broker</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedBroker && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Broker Details</h3>
              <button onClick={() => setShowViewModal(false)} style={{
                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
              }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <InfoRow label="Broker ID" value={selectedBroker.oderId} />
              <InfoRow label="Name" value={selectedBroker.name} />
              <InfoRow label="Email" value={selectedBroker.email} />
              <InfoRow label="Phone" value={selectedBroker.phone || 'N/A'} />
              <InfoRow label="Wallet Balance" value={`₹${selectedBroker.wallet?.balance?.toLocaleString() || 0}`} />
              <InfoRow label="Status" value={selectedBroker.isActive ? 'Active' : 'Inactive'} />
              <InfoRow label="Created" value={new Date(selectedBroker.createdAt).toLocaleDateString()} />
              
              <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8, marginTop: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Broker Login URL</div>
                <div style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                  {window.location.origin}/broker
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowViewModal(false)}
              style={{
                marginTop: 20, width: '100%', padding: '12px', borderRadius: 8, border: 'none',
                background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default SubAdminBrokers;
