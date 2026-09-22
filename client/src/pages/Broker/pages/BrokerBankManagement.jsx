import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function BrokerBankManagement() {
  const { API_URL, adminAuth } = useOutletContext();
  const [paymentMethods, setPaymentMethods] = useState({
    bankAccounts: [],
    upiIds: [],
    cryptoWallets: []
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('bank');
  
  // Forms
  const [bankForm, setBankForm] = useState({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '', isActive: true });
  const [upiForm, setUpiForm] = useState({ upiId: '', name: '', qrImage: '', isActive: true });
  const [cryptoForm, setCryptoForm] = useState({ network: '', address: '', qrImage: '', isActive: true });
  const [qrPreview, setQrPreview] = useState('');

  useEffect(() => {
    fetchPaymentDetails();
  }, []);

  const fetchPaymentDetails = async () => {
    try {
      const adminId = adminAuth?.user?._id;
      if (!adminId) return;
      
      const res = await fetch(`${API_URL}/api/admin/payment-details?adminId=${adminId}`);
      const data = await res.json();
      if (data.success) {
        setPaymentMethods({
          bankAccounts: data.bankAccounts || [],
          upiIds: data.upiIds || [],
          cryptoWallets: data.cryptoWallets || []
        });
      }
    } catch (error) {
      console.error('Error fetching payment details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQrUpload = (type) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      setQrPreview(base64);
      if (type === 'upi') {
        setUpiForm(prev => ({ ...prev, qrImage: base64 }));
      } else if (type === 'crypto') {
        setCryptoForm(prev => ({ ...prev, qrImage: base64 }));
      }
    };
    reader.readAsDataURL(file);
  };

  const addBankAccount = async () => {
    if (!bankForm.bankName || !bankForm.accountNumber || !bankForm.ifsc || !bankForm.accountHolder) {
      alert('Please fill all bank details');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details/bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bankForm, adminId: adminAuth?.user?._id })
      });
      const data = await res.json();
      if (data.success) {
        setBankForm({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '', isActive: true });
        fetchPaymentDetails();
        alert('Bank account added successfully!');
      } else {
        alert(data.error || 'Failed to add bank account');
      }
    } catch (error) {
      alert('Error adding bank account');
    }
  };

  const addUpi = async () => {
    if (!upiForm.upiId || !upiForm.name) {
      alert('Please fill UPI details');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details/upi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...upiForm, adminId: adminAuth?.user?._id })
      });
      const data = await res.json();
      if (data.success) {
        setUpiForm({ upiId: '', name: '', qrImage: '', isActive: true });
        setQrPreview('');
        fetchPaymentDetails();
        alert('UPI added successfully!');
      } else {
        alert(data.error || 'Failed to add UPI');
      }
    } catch (error) {
      alert('Error adding UPI');
    }
  };

  const addCryptoWallet = async () => {
    if (!cryptoForm.network || !cryptoForm.address) {
      alert('Please fill crypto wallet details');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details/crypto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cryptoForm, adminId: adminAuth?.user?._id })
      });
      const data = await res.json();
      if (data.success) {
        setCryptoForm({ network: '', address: '', qrImage: '', isActive: true });
        setQrPreview('');
        fetchPaymentDetails();
        alert('Crypto wallet added successfully!');
      } else {
        alert(data.error || 'Failed to add crypto wallet');
      }
    } catch (error) {
      alert('Error adding crypto wallet');
    }
  };

  const deletePaymentMethod = async (id) => {
    if (!confirm('Are you sure you want to delete this payment method?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchPaymentDetails();
        alert('Payment method deleted!');
      } else {
        alert(data.error || 'Failed to delete payment method');
      }
    } catch (error) {
      alert('Error deleting payment method');
    }
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading payment details...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 24px 0', color: 'var(--text-primary)' }}>Bank & Payment Management</h2>
      
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {['bank', 'upi', 'crypto'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === tab ? 'var(--accent)' : 'var(--bg-secondary)',
              color: activeTab === tab ? 'white' : 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 500,
              textTransform: 'capitalize'
            }}
          >
            {tab === 'bank' ? 'Bank Accounts' : tab === 'upi' ? 'UPI' : 'Crypto Wallets'}
          </button>
        ))}
      </div>

      {/* Bank Accounts Tab */}
      {activeTab === 'bank' && (
        <div>
          <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, marginBottom: 24, border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Add Bank Account</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <input type="text" placeholder="Bank Name" value={bankForm.bankName} onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
              <input type="text" placeholder="Account Number" value={bankForm.accountNumber} onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
              <input type="text" placeholder="IFSC Code" value={bankForm.ifsc} onChange={(e) => setBankForm({ ...bankForm, ifsc: e.target.value })} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
              <input type="text" placeholder="Account Holder Name" value={bankForm.accountHolder} onChange={(e) => setBankForm({ ...bankForm, accountHolder: e.target.value })} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
            </div>
            <button onClick={addBankAccount} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 500 }}>Add Bank Account</button>
          </div>

          <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)' }}>
                  <th style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Bank Name</th>
                  <th style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Account Number</th>
                  <th style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>IFSC</th>
                  <th style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Account Holder</th>
                  <th style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paymentMethods.bankAccounts.length === 0 ? (
                  <tr><td colSpan="5" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No bank accounts added</td></tr>
                ) : (
                  paymentMethods.bankAccounts.map((bank, idx) => (
                    <tr key={bank._id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 14, color: 'var(--text-primary)' }}>{bank.bankName}</td>
                      <td style={{ padding: 14, color: 'var(--text-primary)' }}>{bank.accountNumber}</td>
                      <td style={{ padding: 14, color: 'var(--text-primary)' }}>{bank.ifsc}</td>
                      <td style={{ padding: 14, color: 'var(--text-primary)' }}>{bank.accountHolder}</td>
                      <td style={{ padding: 14 }}>
                        <button onClick={() => deletePaymentMethod(bank._id)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* UPI Tab */}
      {activeTab === 'upi' && (
        <div>
          <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, marginBottom: 24, border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Add UPI</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'start' }}>
              <input type="text" placeholder="UPI ID (e.g. name@upi)" value={upiForm.upiId} onChange={(e) => setUpiForm({ ...upiForm, upiId: e.target.value })} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
              <input type="text" placeholder="Display Name" value={upiForm.name} onChange={(e) => setUpiForm({ ...upiForm, name: e.target.value })} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
              <div>
                <input type="file" accept="image/*" onChange={handleQrUpload('upi')} style={{ fontSize: 12 }} />
                {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 80, height: 80, marginTop: 8, borderRadius: 8 }} />}
              </div>
            </div>
            <button onClick={addUpi} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 500 }}>Add UPI</button>
          </div>

          <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)' }}>
                  <th style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>UPI ID</th>
                  <th style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                  <th style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>QR Code</th>
                  <th style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paymentMethods.upiIds.length === 0 ? (
                  <tr><td colSpan="4" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No UPI IDs added</td></tr>
                ) : (
                  paymentMethods.upiIds.map((upi, idx) => (
                    <tr key={upi._id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 14, color: 'var(--text-primary)' }}>{upi.upiId}</td>
                      <td style={{ padding: 14, color: 'var(--text-primary)' }}>{upi.name}</td>
                      <td style={{ padding: 14 }}>{upi.qrImage ? <span style={{ color: '#10b981' }}>✓ Uploaded</span> : <span style={{ color: 'var(--text-secondary)' }}>No QR</span>}</td>
                      <td style={{ padding: 14 }}>
                        <button onClick={() => deletePaymentMethod(upi._id)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Crypto Tab */}
      {activeTab === 'crypto' && (
        <div>
          <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, marginBottom: 24, border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Add Crypto Wallet</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'start' }}>
              <input type="text" placeholder="Network (e.g. TRC20, ERC20)" value={cryptoForm.network} onChange={(e) => setCryptoForm({ ...cryptoForm, network: e.target.value })} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
              <input type="text" placeholder="Wallet Address" value={cryptoForm.address} onChange={(e) => setCryptoForm({ ...cryptoForm, address: e.target.value })} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
              <div>
                <input type="file" accept="image/*" onChange={handleQrUpload('crypto')} style={{ fontSize: 12 }} />
                {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 80, height: 80, marginTop: 8, borderRadius: 8 }} />}
              </div>
            </div>
            <button onClick={addCryptoWallet} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 500 }}>Add Crypto Wallet</button>
          </div>

          <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)' }}>
                  <th style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Network</th>
                  <th style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Address</th>
                  <th style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>QR Code</th>
                  <th style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paymentMethods.cryptoWallets.length === 0 ? (
                  <tr><td colSpan="4" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No crypto wallets added</td></tr>
                ) : (
                  paymentMethods.cryptoWallets.map((wallet, idx) => (
                    <tr key={wallet._id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{wallet.network}</td>
                      <td style={{ padding: 14, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>{wallet.address}</td>
                      <td style={{ padding: 14 }}>{wallet.qrImage ? <span style={{ color: '#10b981' }}>✓ Uploaded</span> : <span style={{ color: 'var(--text-secondary)' }}>No QR</span>}</td>
                      <td style={{ padding: 14 }}>
                        <button onClick={() => deletePaymentMethod(wallet._id)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default BrokerBankManagement;
