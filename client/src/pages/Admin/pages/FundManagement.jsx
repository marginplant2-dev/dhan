import { useState, useEffect, useCallback } from 'react';
import AiSubscriptionsPanel from './AiSubscriptionsPanel';
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom';
import { LuArrowDownToLine, LuArrowUpFromLine, LuClock, LuWallet } from 'react-icons/lu';

// Auto-shrink fund stat value for large numbers
function FundStatValue({ children, style }) {
  const text = String(children ?? '');
  const len = text.length;
  let fontSize = 22;
  if (len > 18) fontSize = 12;
  else if (len > 16) fontSize = 13;
  else if (len > 14) fontSize = 15;
  else if (len > 12) fontSize = 17;
  else if (len > 10) fontSize = 19;
  return <div className="fund-stat-card__value" style={{ fontSize, ...style }}>{text}</div>;
}

// Default column configuration for deposit tables
const DEFAULT_DEPOSIT_COLUMNS = [
  { id: 'createdAt', label: 'Created / Updated Time', visible: true },
  { id: 'userId', label: 'UserID', visible: true },
  { id: 'amount', label: 'Amount / Type', visible: true },
  { id: 'status', label: 'Status', visible: true },
  { id: 'remark', label: 'Remark', visible: true },
  { id: 'showImage', label: 'Show Image', visible: true },
  { id: 'accept', label: 'Accept', visible: true },
  { id: 'reject', label: 'Reject', visible: true },
  { id: 'delete', label: 'Delete', visible: true },
];

// Default column configuration for withdrawal tables (includes bank details)
const DEFAULT_WITHDRAWAL_COLUMNS = [
  { id: 'createdAt', label: 'Created / Updated Time', visible: true },
  { id: 'userId', label: 'UserID', visible: true },
  { id: 'amount', label: 'Amount / Type', visible: true },
  { id: 'status', label: 'Status', visible: true },
  { id: 'accName', label: 'ACC Name', visible: true },
  { id: 'accNum', label: 'ACC Num', visible: true },
  { id: 'ifsc', label: 'IFSC', visible: true },
  { id: 'upiId', label: 'UPI ID', visible: true },
  { id: 'showImage', label: 'QR / Proof', visible: true },
  { id: 'remark', label: 'Remark', visible: true },
  { id: 'accept', label: 'Accept', visible: true },
  { id: 'reject', label: 'Reject', visible: true },
  { id: 'delete', label: 'Delete', visible: true },
];

function FundManagement() {
  const { API_URL } = useOutletContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ search: '', status: '' });
  
  // Column visibility and order state - separate for deposits and withdrawals.
  // Fix 21c.7: when loading from localStorage, splice in any new column ids
  // that exist in the DEFAULT but not in the saved config — otherwise users
  // who saved their column layout BEFORE the new 'bonus' column was added
  // will never see it. We splice the new column at the same index it has in
  // the DEFAULT array so its position is intuitive.
  const mergeWithDefaults = (saved, defaults) => {
    if (!Array.isArray(saved)) return defaults;
    const defaultIds = new Set(defaults.map((c) => c.id));
    // Drop any saved column that's no longer in the current DEFAULTs (e.g.
    // admin removed hierarchy/orderRef/position/ledger). Without this any
    // user's saved localStorage config will keep showing the dropped cols.
    const filtered = saved.filter((c) => defaultIds.has(c.id));
    const savedIds = new Set(filtered.map((c) => c.id));
    const merged = [...filtered];
    defaults.forEach((defCol, defIdx) => {
      if (!savedIds.has(defCol.id)) {
        // Insert at the same index as DEFAULT, clamped to current length
        const insertAt = Math.min(defIdx, merged.length);
        merged.splice(insertAt, 0, { ...defCol });
      }
    });
    return merged;
  };
  const [depositColumns, setDepositColumns] = useState(() => {
    const raw = localStorage.getItem('fund-deposit-columns');
    const saved = raw ? JSON.parse(raw) : null;
    return mergeWithDefaults(saved, DEFAULT_DEPOSIT_COLUMNS);
  });
  const [withdrawalColumns, setWithdrawalColumns] = useState(() => {
    const raw = localStorage.getItem('fund-withdrawal-columns');
    const saved = raw ? JSON.parse(raw) : null;
    return mergeWithDefaults(saved, DEFAULT_WITHDRAWAL_COLUMNS);
  });
  const [showColumnModal, setShowColumnModal] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  // Multi-select for bulk delete (transaction _ids)
  const [selectedTxIds, setSelectedTxIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  
  // Image preview modal
  const [imagePreview, setImagePreview] = useState({ open: false, src: '' });
  
  // Ledger modal state
  const [ledgerModal, setLedgerModal] = useState({ open: false, userId: null, userName: '', transactions: [], loading: false });

  /** Global deposit/withdrawal stats (not scoped to table filters) */
  const [fundStats, setFundStats] = useState({
    totalDepositsApproved: 0,
    totalWithdrawalsApproved: 0,
    pendingRequestsCount: 0,
    netBalance: 0
  });
  const [fundStatsLoading, setFundStatsLoading] = useState(false);

  const fmtMoney = (v) => (typeof formatAdminCurrency === 'function' ? formatAdminCurrency(v) : `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  const fetchFundStats = useCallback(async () => {
    setFundStatsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/transactions?limit=1&page=1`);
      const data = await res.json();
      if (data.success && data.summary) {
        const s = data.summary;
        setFundStats({
          totalDepositsApproved: Number(s.totalDepositsApproved) || 0,
          totalWithdrawalsApproved: Number(s.totalWithdrawalsApproved) || 0,
          pendingRequestsCount: Number(s.pendingRequestsCount) || 0,
          netBalance: Number(s.netBalance) || 0
        });
      }
    } catch (e) {
      console.error('Error fetching fund stats:', e);
    } finally {
      setFundStatsLoading(false);
    }
  }, [API_URL]);
  
  // Get active tab to determine which columns to use
  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('/ai-subscriptions')) return 'ai-subscriptions';
    if (path.includes('/challenge-resets')) return 'challenge-resets';
    if (path.includes('/challenge-buys')) return 'challenge-buys';
    if (path.includes('/withdrawals')) return 'withdrawal-requests';
    if (path.includes('/banks')) return 'bank-accounts';
    if (path.includes('/upi')) return 'upi-management';
    if (path.includes('/crypto')) return 'crypto-wallets';
    if (path.includes('/history')) return 'transaction-history';
    return 'challenge-buys';   // /admin/funds lands on the buys queue
  };
  const activeTab = getActiveTab();
  
  // Get current columns based on active tab
  const columns = activeTab === 'withdrawal-requests' ? withdrawalColumns : depositColumns;
  const setColumns = activeTab === 'withdrawal-requests' ? setWithdrawalColumns : setDepositColumns;
  
  // Save columns to localStorage when changed
  useEffect(() => {
    localStorage.setItem('fund-deposit-columns', JSON.stringify(depositColumns));
  }, [depositColumns]);
  
  useEffect(() => {
    localStorage.setItem('fund-withdrawal-columns', JSON.stringify(withdrawalColumns));
  }, [withdrawalColumns]);
  
  // Toggle column visibility
  const toggleColumn = (columnId) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, visible: !col.visible } : col
    ));
  };
  
  // Move column up
  const moveColumnUp = (index) => {
    if (index === 0) return;
    setColumns(prev => {
      const newCols = [...prev];
      [newCols[index - 1], newCols[index]] = [newCols[index], newCols[index - 1]];
      return newCols;
    });
  };
  
  // Move column down
  const moveColumnDown = (index) => {
    if (index === columns.length - 1) return;
    setColumns(prev => {
      const newCols = [...prev];
      [newCols[index], newCols[index + 1]] = [newCols[index + 1], newCols[index]];
      return newCols;
    });
  };
  
  // Get visible columns
  const visibleColumns = columns.filter(col => col.visible);
  
  // Pagination calculations
  const totalPages = Math.ceil(transactions.length / itemsPerPage);
  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  // Payment methods state - fetched from database
  const [paymentMethods, setPaymentMethods] = useState({
    bankAccounts: [],
    upiIds: [],
    cryptoWallets: []
  });
  
  // Fund requests state
  const [fundRequests, setFundRequests] = useState(() => {
    const saved = localStorage.getItem('dhanfunded-fund-requests');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Forms for adding new payment methods
  const [bankForm, setBankForm] = useState({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '', isActive: true });
  const [upiForm, setUpiForm] = useState({ upiId: '', name: '', qrImage: '', isActive: true });
  const [cryptoForm, setCryptoForm] = useState({ network: '', address: '', qrImage: '', isActive: true });
  const [qrPreview, setQrPreview] = useState('');

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const buildParams = (type) => {
        const p = new URLSearchParams();
        if (filter.search) p.set('search', filter.search);
        if (filter.status) p.set('status', filter.status);
        if (type) p.set('type', type);
        // Pull the FULL history (backend default is only 50, which silently
        // dropped older months — e.g. June challenge_purchases vanished between
        // the May and July rows). Client-side pagination below then pages
        // through everything. proofImage is excluded server-side so this stays
        // light even at a few thousand rows.
        p.set('limit', '5000');
        return p;
      };

      if (activeTab === 'deposit-requests') {
        // The Deposits tab is the single inbox for regular UPI/bank deposits,
        // direct-UPI challenge PURCHASE requests, AND challenge RESET/restart
        // requests. Fetch all three in parallel and merge by createdAt so the
        // admin sees one queue (approving a reset here restarts the account).
        const [depRes, chRes, rsRes] = await Promise.all([
          fetch(`${API_URL}/api/admin/transactions?${buildParams('deposit')}`),
          fetch(`${API_URL}/api/admin/transactions?${buildParams('challenge_purchase')}`),
          fetch(`${API_URL}/api/admin/transactions?${buildParams('challenge_reset')}`)
        ]);
        const depData = await depRes.json();
        const chData = await chRes.json();
        const rsData = await rsRes.json();
        const a = depData.success ? (depData.transactions || []) : [];
        const b = chData.success ? (chData.transactions || []) : [];
        const c = rsData.success ? (rsData.transactions || []) : [];
        const merged = [...a, ...b, ...c].sort(
          (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()
        );
        setTransactions(merged);
      } else if (activeTab === 'withdrawal-requests') {
        const res = await fetch(`${API_URL}/api/admin/transactions?${buildParams('withdrawal')}`);
        const data = await res.json();
        if (data.success) setTransactions(data.transactions || []);
      } else {
        const res = await fetch(`${API_URL}/api/admin/transactions?${buildParams('')}`);
        const data = await res.json();
        if (data.success) setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle QR image upload
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

  // Fetch payment details from database
  const fetchPaymentDetails = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details`);
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
    }
  };

  // Load payment methods on mount
  useEffect(() => {
    fetchPaymentDetails();
  }, []);

  // Add bank account - saves to database
  const addBankAccount = async () => {
    if (!bankForm.bankName || !bankForm.accountNumber || !bankForm.ifsc || !bankForm.accountHolder) {
      alert('Please fill all bank details');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details/bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bankForm)
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

  // Add UPI - saves to database
  const addUpi = async () => {
    if (!upiForm.upiId || !upiForm.name) {
      alert('Please fill UPI details');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details/upi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upiForm)
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

  // Add Crypto Wallet - saves to database
  const addCryptoWallet = async () => {
    if (!cryptoForm.network || !cryptoForm.address) {
      alert('Please fill crypto wallet details');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details/crypto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cryptoForm)
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

  // Edit payment method state
  const [editModal, setEditModal] = useState({ open: false, type: '', item: null });
  const [editForm, setEditForm] = useState({});
  
  // View transaction details modal
  const [viewModal, setViewModal] = useState({ open: false, transaction: null });
  const [exporting, setExporting] = useState(false);

  // Export transactions to Excel (user-wise)
  const exportToExcel = async () => {
    setExporting(true);
    try {
      // Group transactions by user
      const userWiseData = {};
      transactions.forEach(tx => {
        const userId = tx.oderId || tx.userId || 'Unknown';
        const userName = tx.userName || 'Unknown User';
        const key = `${userId}_${userName}`;
        
        if (!userWiseData[key]) {
          userWiseData[key] = {
            userId,
            userName,
            transactions: [],
            totalDeposits: 0,
            totalWithdrawals: 0
          };
        }
        
        userWiseData[key].transactions.push(tx);
        if (tx.type === 'deposit' && tx.status === 'approved') {
          userWiseData[key].totalDeposits += tx.amount || 0;
        } else if (tx.type === 'withdrawal' && tx.status === 'approved') {
          userWiseData[key].totalWithdrawals += tx.amount || 0;
        }
      });

      // Create CSV content (Fix 21c.7: include Bonus column so the export
      // matches what admins see in the table)
      let csvContent = 'User ID,User Name,Transaction ID,Type,Amount,Bonus,Bonus Template,Method,Status,Date,Total Deposits,Total Withdrawals,Net Balance\n';

      Object.values(userWiseData).forEach(user => {
        user.transactions.forEach((tx, idx) => {
          const txId = tx._id?.slice(-8) || tx.id || '-';
          const type = tx.type || '-';
          const amount = tx.amount?.toFixed(2) || '0.00';
          const bonus = (Number(tx.bonusAmount) || 0).toFixed(2);
          const bonusTpl = (tx.bonusTemplateName || '').replace(/"/g, '""');
          const method = tx.paymentMethod || tx.method || '-';
          const status = tx.status || '-';
          const date = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : '-';

          // Only show totals on first row for each user
          const totalDep = idx === 0 ? user.totalDeposits.toFixed(2) : '';
          const totalWith = idx === 0 ? user.totalWithdrawals.toFixed(2) : '';
          const netBal = idx === 0 ? (user.totalDeposits - user.totalWithdrawals).toFixed(2) : '';

          csvContent += `"${user.userId}","${user.userName}","${txId}","${type}","${amount}","${bonus}","${bonusTpl}","${method}","${status}","${date}","${totalDep}","${totalWith}","${netBal}"\n`;
        });
      });

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `fund_transactions_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      alert('Excel file downloaded successfully!');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  // Open edit modal for payment method
  const openEditModal = (type, item) => {
    setEditForm({ ...item });
    setEditModal({ open: true, type, item });
    if (item.qrImage) setQrPreview(item.qrImage);
  };

  // Save edited payment method — was previously only updating local state +
  // localStorage, so admin edits never reached the DB and users kept seeing
  // the old name/UPI/QR. Now PUTs to /api/admin/payment-details/:id and re-
  // fetches the canonical list from the server.
  const saveEditPaymentMethod = async () => {
    const { item } = editModal;
    const id = item?._id || item?.id;
    if (!id) {
      alert('Cannot save: payment method id missing.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || 'Failed to update payment method');
        return;
      }
      await fetchPaymentDetails();
      setEditModal({ open: false, type: '', item: null });
      setEditForm({});
      setQrPreview('');
      alert('Payment method updated successfully!');
    } catch (err) {
      console.error('Error updating payment method:', err);
      alert('Error updating payment method');
    }
  };

  // Handle QR upload for edit form
  const handleEditQrUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      setQrPreview(base64);
      setEditForm(prev => ({ ...prev, qrImage: base64 }));
    };
    reader.readAsDataURL(file);
  };

  // Delete payment method - saves to database
  const deletePaymentMethod = async (type, id) => {
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

  // Handle fund request (approve/reject) - localStorage based like original Admin.jsx
  const handleFundRequest = (requestId, action) => {
    const updatedRequests = fundRequests.map(req => {
      if (req.id === requestId) {
        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        if (action === 'approve') {
          const users = JSON.parse(localStorage.getItem('dhanfunded-users') || '[]');
          let userIndex = users.findIndex(u => u.id === req.userId);
          if (userIndex === -1) {
            users.push({ id: req.userId, name: req.userName, wallet: 0, credit: 0 });
            userIndex = users.length - 1;
          }
          if (req.type === 'deposit') {
            users[userIndex].wallet = (users[userIndex].wallet || 0) + req.amount;
          } else if (req.type === 'withdrawal') {
            users[userIndex].wallet = (users[userIndex].wallet || 0) - req.amount;
          }
          localStorage.setItem('dhanfunded-users', JSON.stringify(users));
          const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
          if (authData.user && authData.user.id === req.userId) {
            authData.user.wallet = users[userIndex].wallet;
            authData.user.credit = users[userIndex].credit || 0;
            localStorage.setItem('dhanfunded-auth', JSON.stringify(authData));
          }
        }
        return { ...req, status: newStatus, processedAt: new Date().toISOString() };
      }
      return req;
    });
    setFundRequests(updatedRequests);
    localStorage.setItem('dhanfunded-fund-requests', JSON.stringify(updatedRequests));
    alert(`Request ${action}d successfully!`);
  };

  const processTransaction = async (txId, status, txDetails = null) => {
    const action = status === 'approved' ? 'approve' : 'reject';
    
    // Build confirmation message with user details
    let confirmMsg = `Are you sure you want to ${action} this transaction?`;
    if (txDetails) {
      const userName = txDetails.userName || txDetails.name || 'Unknown User';
      const amount = txDetails.amount || 0;
      const txType = txDetails.type || 'transaction';
      confirmMsg = `Are you sure you want to ${action} this ${txType}?\n\nUser: ${userName}\nAmount: ₹${amount.toLocaleString()}`;
    }
    
    if (!confirm(confirmMsg)) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/transactions/${txId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Transaction ${action}d successfully`);
        fetchTransactions();
        fetchFundStats();
      } else {
        alert(data.error || `Failed to ${action} transaction`);
      }
    } catch (error) {
      console.error('Error processing transaction:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'bank-accounts' || activeTab === 'upi-management' || activeTab === 'crypto-wallets') {
      fetchPaymentDetails();
    } else {
      fetchTransactions();
    }
  }, [activeTab, filter]);

  useEffect(() => {
    if (activeTab === 'deposit-requests' || activeTab === 'withdrawal-requests') {
      fetchFundStats();
    }
  }, [activeTab, fetchFundStats]);

  if (activeTab === 'bank-accounts') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h2>Bank Accounts</h2>
        </div>
        
        {/* Add Bank Account Form */}
        <div className="admin-form-card">
          <h3>Add New Bank Account</h3>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Bank Name</label>
              <input type="text" value={bankForm.bankName} onChange={(e) => setBankForm(prev => ({ ...prev, bankName: e.target.value }))} placeholder="e.g. HDFC Bank" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>Account Number</label>
              <input type="text" value={bankForm.accountNumber} onChange={(e) => setBankForm(prev => ({ ...prev, accountNumber: e.target.value }))} placeholder="Account number" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>IFSC Code</label>
              <input type="text" value={bankForm.ifsc} onChange={(e) => setBankForm(prev => ({ ...prev, ifsc: e.target.value }))} placeholder="IFSC code" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>Account Holder</label>
              <input type="text" value={bankForm.accountHolder} onChange={(e) => setBankForm(prev => ({ ...prev, accountHolder: e.target.value }))} placeholder="Account holder name" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>Status</label>
              <select value={bankForm.isActive} onChange={(e) => setBankForm(prev => ({ ...prev, isActive: e.target.value === 'true' }))} className="admin-select">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <button onClick={addBankAccount} className="admin-btn primary">Add Bank</button>
          </div>
        </div>

        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Bank Name</th>
                <th>Account Number</th>
                <th>IFSC</th>
                <th>Account Holder</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.bankAccounts.length === 0 ? (
                <tr><td colSpan="6" className="no-data">No bank accounts configured</td></tr>
              ) : (
                paymentMethods.bankAccounts.map((bank, idx) => (
                  <tr key={bank.id || idx}>
                    <td>{bank.bankName}</td>
                    <td>{bank.accountNumber}</td>
                    <td>{bank.ifsc}</td>
                    <td>{bank.accountHolder}</td>
                    <td><span className={`status-badge status-${bank.isActive ? 'active' : 'inactive'}`}>{bank.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button onClick={() => openEditModal('bank', bank)} className="admin-btn primary small">Edit</button>
                        <button onClick={() => deletePaymentMethod('bank', bank._id)} className="admin-btn danger small">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Edit Payment Method Modal for Bank */}
        {editModal.open && editModal.type === 'bank' && (
          <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div className="modal-content" style={{
              background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500,
              border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Edit Bank Account</h3>
                <button onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); }} style={{
                  background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
                }}>×</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Bank Name</label>
                  <input type="text" value={editForm.bankName || ''} onChange={(e) => setEditForm(prev => ({ ...prev, bankName: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Account Number</label>
                  <input type="text" value={editForm.accountNumber || ''} onChange={(e) => setEditForm(prev => ({ ...prev, accountNumber: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>IFSC Code</label>
                  <input type="text" value={editForm.ifsc || ''} onChange={(e) => setEditForm(prev => ({ ...prev, ifsc: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Account Holder</label>
                  <input type="text" value={editForm.accountHolder || ''} onChange={(e) => setEditForm(prev => ({ ...prev, accountHolder: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Status</label>
                  <select value={editForm.isActive ? 'active' : 'inactive'} onChange={(e) => setEditForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))} className="admin-select" style={{ width: '100%' }}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); }} className="admin-btn" style={{ flex: 1, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>Cancel</button>
                  <button onClick={saveEditPaymentMethod} className="admin-btn primary" style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)' }}>💾 Save Changes</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'upi-management') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h2>UPI Management</h2>
        </div>
        
        {/* Add UPI Form */}
        <div className="admin-form-card">
          <h3>Add New UPI ID</h3>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>UPI ID</label>
              <input type="text" value={upiForm.upiId} onChange={(e) => setUpiForm(prev => ({ ...prev, upiId: e.target.value }))} placeholder="e.g. example@upi" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>Name</label>
              <input type="text" value={upiForm.name} onChange={(e) => setUpiForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Display name" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>QR Code (Optional)</label>
              <input type="file" accept="image/*" onChange={handleQrUpload('upi')} className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>Status</label>
              <select value={upiForm.isActive} onChange={(e) => setUpiForm(prev => ({ ...prev, isActive: e.target.value === 'true' }))} className="admin-select">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <button onClick={addUpi} className="admin-btn primary">Add UPI</button>
          </div>
          {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 100, height: 100, marginTop: 10, borderRadius: 8 }} />}
        </div>

        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>UPI ID</th>
                <th>Name</th>
                <th>QR Code</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.upiIds.length === 0 ? (
                <tr><td colSpan="5" className="no-data">No UPI IDs configured</td></tr>
              ) : (
                paymentMethods.upiIds.map((upi, idx) => (
                  <tr key={upi.id || idx}>
                    <td>{upi.upiId}</td>
                    <td>{upi.name}</td>
                    <td>{upi.qrImage ? <span className="text-success">✓ Uploaded</span> : <span className="text-muted">No QR</span>}</td>
                    <td><span className={`status-badge status-${upi.isActive ? 'active' : 'inactive'}`}>{upi.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button onClick={() => openEditModal('upi', upi)} className="admin-btn primary small">Edit</button>
                        <button onClick={() => deletePaymentMethod('upi', upi._id)} className="admin-btn danger small">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Edit UPI Modal */}
        {editModal.open && editModal.type === 'upi' && (
          <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div className="modal-content" style={{
              background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500,
              border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Edit UPI</h3>
                <button onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); setQrPreview(''); }} style={{
                  background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
                }}>×</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>UPI ID</label>
                  <input type="text" value={editForm.upiId || ''} onChange={(e) => setEditForm(prev => ({ ...prev, upiId: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Name</label>
                  <input type="text" value={editForm.name || ''} onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>QR Code Image</label>
                  <input type="file" accept="image/*" onChange={handleEditQrUpload} className="admin-input" />
                  {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 100, height: 100, marginTop: 8, objectFit: 'contain' }} />}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Status</label>
                  <select value={editForm.isActive ? 'active' : 'inactive'} onChange={(e) => setEditForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))} className="admin-select" style={{ width: '100%' }}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); setQrPreview(''); }} className="admin-btn" style={{ flex: 1, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>Cancel</button>
                  <button onClick={saveEditPaymentMethod} className="admin-btn primary" style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)' }}>💾 Save Changes</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'crypto-wallets') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h2>Crypto Wallets</h2>
        </div>
        
        {/* Add Crypto Wallet Form */}
        <div className="admin-form-card">
          <h3>Add New Crypto Wallet</h3>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Network</label>
              <select value={cryptoForm.network} onChange={(e) => setCryptoForm(prev => ({ ...prev, network: e.target.value }))} className="admin-select">
                <option value="">Select Network</option>
                <option value="BTC">Bitcoin (BTC)</option>
                <option value="ETH">Ethereum (ETH)</option>
                <option value="USDT-TRC20">USDT (TRC20)</option>
                <option value="USDT-ERC20">USDT (ERC20)</option>
                <option value="BNB">BNB (BSC)</option>
                <option value="SOL">Solana (SOL)</option>
                <option value="XRP">Ripple (XRP)</option>
                <option value="LTC">Litecoin (LTC)</option>
              </select>
            </div>
            <div className="admin-form-group">
              <label>Wallet Address</label>
              <input type="text" value={cryptoForm.address} onChange={(e) => setCryptoForm(prev => ({ ...prev, address: e.target.value }))} placeholder="Enter wallet address" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>QR Code (Optional)</label>
              <input type="file" accept="image/*" onChange={handleQrUpload('crypto')} className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>Status</label>
              <select value={cryptoForm.isActive} onChange={(e) => setCryptoForm(prev => ({ ...prev, isActive: e.target.value === 'true' }))} className="admin-select">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <button onClick={addCryptoWallet} className="admin-btn primary">Add Wallet</button>
          </div>
          {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 100, height: 100, marginTop: 10, borderRadius: 8 }} />}
        </div>

        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Network</th>
                <th>Address</th>
                <th>QR Code</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.cryptoWallets.length === 0 ? (
                <tr><td colSpan="5" className="no-data">No crypto wallets configured</td></tr>
              ) : (
                paymentMethods.cryptoWallets.map((wallet, idx) => (
                  <tr key={wallet.id || idx}>
                    <td><strong>{wallet.network}</strong></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{wallet.address}</td>
                    <td>{wallet.qrImage ? <span className="text-success">✓ Uploaded</span> : <span className="text-muted">No QR</span>}</td>
                    <td><span className={`status-badge status-${wallet.isActive ? 'active' : 'inactive'}`}>{wallet.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button onClick={() => openEditModal('crypto', wallet)} className="admin-btn primary small">Edit</button>
                        <button onClick={() => deletePaymentMethod('crypto', wallet._id)} className="admin-btn danger small">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Edit Crypto Modal */}
        {editModal.open && editModal.type === 'crypto' && (
          <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div className="modal-content" style={{
              background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500,
              border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Edit Crypto Wallet</h3>
                <button onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); setQrPreview(''); }} style={{
                  background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
                }}>×</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Network</label>
                  <input type="text" value={editForm.network || ''} onChange={(e) => setEditForm(prev => ({ ...prev, network: e.target.value }))} className="admin-input" style={{ width: '100%' }} placeholder="e.g. BTC, ETH, USDT-TRC20" />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Wallet Address</label>
                  <input type="text" value={editForm.address || ''} onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>QR Code Image</label>
                  <input type="file" accept="image/*" onChange={handleEditQrUpload} className="admin-input" />
                  {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 100, height: 100, marginTop: 8, objectFit: 'contain' }} />}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Status</label>
                  <select value={editForm.isActive ? 'active' : 'inactive'} onChange={(e) => setEditForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))} className="admin-select" style={{ width: '100%' }}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); setQrPreview(''); }} className="admin-btn" style={{ flex: 1, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>Cancel</button>
                  <button onClick={saveEditPaymentMethod} className="admin-btn primary" style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)' }}>💾 Save Changes</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render cell content based on column id
  const renderCell = (tx, columnId) => {
    switch (columnId) {
      case 'createdAt':
        return (
          <div>
            <div style={{ fontWeight: 500 }}>{new Date(tx.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}, {new Date(tx.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            {tx.updatedAt && tx.updatedAt !== tx.createdAt && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(tx.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}, {new Date(tx.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            )}
          </div>
        );
      case 'hierarchy': {
        // Use parent info from API (enriched with user's parent hierarchy)
        const parentType = tx.parentType || 'ADMIN';
        const parentName = tx.parentName || 'Superadmin';
        const parentColor = parentType === 'BROKER' ? '#f59e0b' : parentType === 'SUBADMIN' ? '#8b5cf6' : '#10b981';
        return (
          <div>
            <div style={{ fontWeight: 600, color: parentColor }}>{parentType}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{parentName}</div>
          </div>
        );
      }
      case 'userId':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
            <span className="fund-user-badge">{tx.userName || tx.oderId}</span>
            {tx.userPhone ? (
              <a
                href={`tel:${tx.userPhone}`}
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                title="Call / copy number"
              >📞 {tx.userPhone}</a>
            ) : (
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.6 }}>no mobile</span>
            )}
          </div>
        );
      case 'amount':
        return (
          <div>
            <div style={{ fontWeight: 600, color: tx.type === 'deposit' ? '#10b981' : '#ef4444' }}>
              {tx.currency === 'INR' ? '₹' : '$'}{tx.amount?.toFixed(0) || 0}
            </div>
            {tx.type === 'challenge_reset' ? (
              <span style={{
                display: 'inline-block', marginTop: 3, padding: '2px 9px', borderRadius: 5,
                background: 'linear-gradient(135deg,#ef4444,#f97316)', color: '#fff',
                fontSize: 10, fontWeight: 800, letterSpacing: 0.5
              }}>🔄 RESET · Restart</span>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{tx.type}</div>
            )}
          </div>
        );
      case 'bonus': {
        // Fix 21c: show auto-trigger bonus snapshotted onto the transaction
        // when it was approved. Always renders for deposit rows even when
        // the bonus is 0 — gives admins a clear "no bonus matched" signal.
        const bonusAmt = Number(tx.bonusAmount) || 0;
        if (bonusAmt > 0) {
          return (
            <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 12 }} title={tx.bonusTemplateName || ''}>
              🎁 +₹{bonusAmt.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          );
        }
        return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
      }
      case 'status':
        return <span className={`fund-status-badge fund-status-${tx.status}`}>{tx.status?.charAt(0).toUpperCase() + tx.status?.slice(1)}</span>;
      case 'accName': {
        const accName = tx.withdrawalInfo?.bankDetails?.accountHolder || 
                        tx.withdrawalInfo?.upiDetails?.name ||
                        tx.paymentDetails?.accountHolder ||
                        tx.userName || '-';
        return <span style={{ color: 'var(--text-primary)' }}>{accName}</span>;
      }
      case 'accNum': {
        const accNum = tx.withdrawalInfo?.bankDetails?.accountNumber || 
                       tx.paymentDetails?.accountNumber || '-';
        return <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-primary)' }}>{accNum}</span>;
      }
      case 'ifsc': {
        const ifsc = tx.withdrawalInfo?.bankDetails?.ifsc || 
                     tx.paymentDetails?.ifsc || '-';
        return <span style={{ fontFamily: 'monospace', fontSize: 12, background: ifsc !== '-' ? 'rgba(59, 130, 246, 0.1)' : 'transparent', padding: ifsc !== '-' ? '4px 8px' : 0, borderRadius: 4, color: ifsc !== '-' ? '#3b82f6' : 'var(--text-secondary)' }}>{ifsc}</span>;
      }
      case 'upiId': {
        const upiId = tx.withdrawalInfo?.upiDetails?.upiId || 
                      tx.withdrawalInfo?.bankDetails?.upiId ||
                      tx.paymentDetails?.upiId ||
                      tx.paymentDetails?.upiDetails?.upiId ||
                      (tx.withdrawalInfo?.cryptoDetails?.address ? tx.withdrawalInfo.cryptoDetails.address.slice(0, 20) + '...' : '-');
        return <span style={{ fontFamily: 'monospace', fontSize: 12, color: upiId !== '-' ? '#8b5cf6' : 'var(--text-secondary)' }}>{upiId}</span>;
      }
      case 'remark':
        return <span style={{ color: 'var(--text-secondary)' }}>{tx.remark || '-'}</span>;
      case 'orderRef':
        return <span style={{ color: 'var(--text-secondary)' }}>{tx.orderRef || tx.referenceNumber || '-'}</span>;
      case 'showImage':
        return tx.proofImage ? (
          <button onClick={() => setImagePreview({ open: true, src: tx.proofImage })} className="fund-action-btn fund-action-view">
            📷 Show Image
          </button>
        ) : <span style={{ color: 'var(--text-secondary)' }}>-</span>;
      case 'accept':
        return tx.status === 'pending' ? (
          <button onClick={() => processTransaction(tx._id, 'approved', tx)} className="fund-action-btn fund-action-accept">
            ✓ Accept
          </button>
        ) : tx.status === 'approved' ? (
          <span className="fund-status-badge fund-status-approved">✓ Accepted</span>
        ) : null;
      case 'reject':
        return tx.status === 'pending' ? (
          <button onClick={() => processTransaction(tx._id, 'rejected', tx)} className="fund-action-btn fund-action-reject">
            ✗ Reject
          </button>
        ) : tx.status === 'rejected' ? (
          <span className="fund-status-badge fund-status-rejected">✗ Rejected</span>
        ) : null;
      case 'position':
        return (
          <button onClick={() => goToUserPositions(tx.oderId || tx.userId, tx.userName)} className="fund-action-btn fund-action-position">
            📊 Position
          </button>
        );
      case 'ledger':
        return (
          <button onClick={() => openLedgerModal(tx.oderId || tx.userId, tx.userName)} className="fund-action-btn fund-action-ledger">
            📋 Ledger
          </button>
        );
      case 'delete':
        return (
          <button onClick={() => deleteTransaction(tx._id)} className="fund-action-btn fund-action-delete">
            🗑️ Delete
          </button>
        );
      default:
        return '-';
    }
  };

  // Delete transaction
  const deleteTransaction = async (txId) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/transactions/${txId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        alert('Transaction deleted');
        fetchTransactions();
        fetchFundStats();
      } else {
        alert(data.error || 'Failed to delete');
      }
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  // ── Multi-select helpers ──────────────────────────────────────────────
  const toggleTxSelected = (id) => {
    setSelectedTxIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const pageIds = paginatedTransactions.map(t => t._id).filter(Boolean);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedTxIds.includes(id));
  const toggleSelectAllPage = () => {
    setSelectedTxIds(prev => allPageSelected
      ? prev.filter(id => !pageIds.includes(id))          // unselect this page
      : Array.from(new Set([...prev, ...pageIds])));       // add this page
  };
  const clearSelection = () => setSelectedTxIds([]);

  const bulkDeleteSelected = async () => {
    if (selectedTxIds.length === 0) return;
    if (!confirm(`Delete ${selectedTxIds.length} selected transaction(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/transactions/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedTxIds })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Deleted ${data.deleted ?? selectedTxIds.length} transaction(s)`);
        clearSelection();
        fetchTransactions();
        fetchFundStats();
      } else {
        alert(data.error || 'Bulk delete failed');
      }
    } catch (error) {
      alert('Bulk delete error: ' + error.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  // Navigate to Position Management Open Positions with user filter
  const goToUserPositions = (userId, userName) => {
    // Store the user filter in sessionStorage so Position Management can pick it up
    sessionStorage.setItem('tradeManagementUserFilter', JSON.stringify({ userId, userName }));
    // Navigate to Open Positions tab (not Combined)
    navigate('/admin/trades/open');
  };

  // Open ledger modal and fetch user's transactions
  const openLedgerModal = async (userId, userName) => {
    setLedgerModal({ open: true, userId, userName, transactions: [], loading: true });
    try {
      const res = await fetch(`${API_URL}/api/admin/transactions?userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setLedgerModal(prev => ({ ...prev, transactions: data.transactions || [], loading: false }));
      } else {
        setLedgerModal(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('Error fetching user ledger:', error);
      setLedgerModal(prev => ({ ...prev, loading: false }));
    }
  };

  // Challenge Buys tab — early return with its own self-contained panel.
  if (activeTab === 'challenge-buys') {
    return <ChallengeBuysPanel apiUrl={API_URL} />;
  }

  // Challenge Resets tab — paid retry requests on FAILED accounts.
  if (activeTab === 'challenge-resets') {
    return <ChallengeResetsPanel apiUrl={API_URL} />;
  }

  // AI Options — subscription payments, and the plans that price them.
  if (activeTab === 'ai-subscriptions') {
    return <AiSubscriptionsPanel apiUrl={API_URL} />;
  }

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>{activeTab === 'deposit-requests' ? 'Deposit Requests' : activeTab === 'withdrawal-requests' ? 'Withdrawal Requests' : 'Transaction History'}</h2>
      </div>

      {(activeTab === 'deposit-requests' || activeTab === 'withdrawal-requests') && (
        <div className="fund-stats-row" aria-busy={fundStatsLoading}>
          <div className="fund-stat-card">
            <div className="fund-stat-card__top">
              <div className="fund-stat-card__icon" style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.35)', color: '#4ade80' }} aria-hidden><LuArrowDownToLine size={17} /></div>
              <div className="fund-stat-card__meta">
                <div className="fund-stat-card__label">Total Deposits</div>
                <FundStatValue>{fundStatsLoading ? '…' : fmtMoney(fundStats.totalDepositsApproved)}</FundStatValue>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>Approved &amp; completed</div>
          </div>
          <div className="fund-stat-card">
            <div className="fund-stat-card__top">
              <div className="fund-stat-card__icon" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', color: '#f87171' }} aria-hidden><LuArrowUpFromLine size={17} /></div>
              <div className="fund-stat-card__meta">
                <div className="fund-stat-card__label">Total Withdrawals</div>
                <FundStatValue>{fundStatsLoading ? '…' : fmtMoney(fundStats.totalWithdrawalsApproved)}</FundStatValue>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>Approved &amp; completed</div>
          </div>
          <div className="fund-stat-card">
            <div className="fund-stat-card__top">
              <div className="fund-stat-card__icon" style={{ background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.35)', color: '#fbbf24' }} aria-hidden><LuClock size={17} /></div>
              <div className="fund-stat-card__meta">
                <div className="fund-stat-card__label">Pending Requests</div>
                <FundStatValue>{fundStatsLoading ? '…' : fundStats.pendingRequestsCount}</FundStatValue>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>Deposits &amp; withdrawals awaiting action</div>
          </div>
          <div className="fund-stat-card">
            <div className="fund-stat-card__top">
              <div className="fund-stat-card__icon" style={{ background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.35)', color: '#c084fc' }} aria-hidden><LuWallet size={17} /></div>
              <div className="fund-stat-card__meta">
                <div className="fund-stat-card__label">Net Balance</div>
                <FundStatValue style={{ color: fundStats.netBalance < 0 ? '#fca5a5' : '#f8fafc' }}>
                  {fundStatsLoading ? '…' : fmtMoney(fundStats.netBalance)}
                </FundStatValue>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>Deposits − withdrawals (approved)</div>
          </div>
        </div>
      )}

      <div className="admin-filters-bar">
        <input
          type="text"
          placeholder="Search by user..."
          value={filter.search}
          onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
          className="admin-input"
        />
        <select
          value={filter.status}
          onChange={(e) => setFilter(prev => ({ ...prev, status: e.target.value }))}
          className="admin-select"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button onClick={fetchTransactions} className="admin-btn primary">
          Search
        </button>
        <button 
          onClick={exportToExcel} 
          disabled={exporting || transactions.length === 0}
          className="admin-btn"
          style={{ background: '#10b981' }}
        >
          {exporting ? '⏳ Exporting...' : '📥 Export Excel'}
        </button>
      </div>

      {loading ? (
        <div className="admin-loading">Loading transactions...</div>
      ) : (
        <>
          {selectedTxIds.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
              padding: '10px 16px', marginBottom: 12, borderRadius: 10,
              background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.35)'
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {selectedTxIds.length} selected
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={clearSelection}
                  disabled={bulkDeleting}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >Clear</button>
                <button
                  onClick={bulkDeleteSelected}
                  disabled={bulkDeleting}
                  style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', cursor: bulkDeleting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: bulkDeleting ? 0.7 : 1 }}
                >{bulkDeleting ? 'Deleting…' : `🗑 Delete ${selectedTxIds.length}`}</button>
              </div>
            </div>
          )}
          <div className="admin-table-wrapper fund-table-wrapper">
            <table className="admin-table fund-table">
              <thead>
                <tr>
                  <th style={{ width: 34, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAllPage}
                      title="Select all on this page"
                      style={{ cursor: 'pointer', width: 16, height: 16 }}
                    />
                  </th>
                  {visibleColumns.map(col => (
                    <th key={col.id}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.length === 0 ? (
                  <tr><td colSpan={visibleColumns.length + 1} className="no-data">No transactions found</td></tr>
                ) : (
                  paginatedTransactions.map((tx, idx) => {
                    const checked = selectedTxIds.includes(tx._id);
                    return (
                      <tr key={tx._id || idx} style={checked ? { background: 'rgba(59,130,246,0.06)' } : undefined}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTxSelected(tx._id)}
                            style={{ cursor: 'pointer', width: 16, height: 16 }}
                          />
                        </td>
                        {visibleColumns.map(col => (
                          <td key={col.id}>{renderCell(tx, col.id)}</td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="fund-table-footer">
            <div className="fund-pagination-info">
              Page <strong>{currentPage}</strong> • Showing <strong>{paginatedTransactions.length}</strong> requests
              <span style={{ marginLeft: 12 }}>Show:</span>
              <select 
                value={itemsPerPage} 
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="fund-page-select"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="fund-pagination-controls">
              <button 
                onClick={() => setShowColumnModal(true)} 
                className="fund-columns-btn"
              >
                ☰ Columns ({visibleColumns.length}/{columns.length})
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                disabled={currentPage === 1}
                className="fund-page-btn"
              >
                Previous
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                disabled={currentPage === totalPages || totalPages === 0}
                className="fund-page-btn fund-page-btn-next"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Column Visibility Modal */}
      {showColumnModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="fund-column-modal">
            <div className="fund-column-modal-header">
              <h3>{activeTab === 'deposit-requests' ? 'Deposit' : 'Withdrawal'} columns</h3>
              <button onClick={() => setShowColumnModal(false)} className="fund-modal-close">×</button>
            </div>
            <div className="fund-column-list">
              {columns.map((col, idx) => (
                <div key={col.id} className="fund-column-item">
                  <label className="fund-column-checkbox">
                    <input 
                      type="checkbox" 
                      checked={col.visible} 
                      onChange={() => toggleColumn(col.id)}
                    />
                    <span className="fund-checkmark"></span>
                    <span className="fund-column-label">{col.label}</span>
                  </label>
                  <div className="fund-column-arrows">
                    <button onClick={() => moveColumnUp(idx)} disabled={idx === 0} className="fund-arrow-btn">↑</button>
                    <button onClick={() => moveColumnDown(idx)} disabled={idx === columns.length - 1} className="fund-arrow-btn">↓</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="fund-column-modal-footer">
              <span>{visibleColumns.length} visible • Order saved in browser</span>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {imagePreview.open && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setImagePreview({ open: false, src: '' })}>
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
            <img src={imagePreview.src} alt="Payment Proof" style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8 }} />
            <button onClick={() => setImagePreview({ open: false, src: '' })} style={{
              position: 'absolute', top: -40, right: 0, background: 'none', border: 'none', 
              color: '#fff', fontSize: 32, cursor: 'pointer'
            }}>×</button>
          </div>
        </div>
      )}

      {/* Ledger Modal - User's Fund Transaction History */}
      {ledgerModal.open && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="fund-ledger-modal" style={{
            background: 'var(--bg-secondary)', borderRadius: 12, width: '95%', maxWidth: 900,
            maxHeight: '85vh', overflow: 'hidden', border: '1px solid var(--border-color)'
          }}>
            <div style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              padding: '20px 24px', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' 
            }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>📋 Fund Ledger</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                  Transaction history for <strong>{ledgerModal.userName || ledgerModal.userId}</strong>
                </p>
              </div>
              <button onClick={() => setLedgerModal({ open: false, userId: null, userName: '', transactions: [], loading: false })} style={{
                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
              }}>×</button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(85vh - 140px)' }}>
              {ledgerModal.loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Loading transactions...</div>
              ) : ledgerModal.transactions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>No transactions found for this user</div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: 16, borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Total Deposits</p>
                      <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                        ₹{ledgerModal.transactions.filter(t => t.type === 'deposit' && t.status === 'approved').reduce((sum, t) => sum + (t.amount || 0), 0).toLocaleString()}
                      </p>
                    </div>
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: 16, borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Total Withdrawals</p>
                      <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700, color: '#ef4444' }}>
                        ₹{ledgerModal.transactions.filter(t => t.type === 'withdrawal' && t.status === 'approved').reduce((sum, t) => sum + (t.amount || 0), 0).toLocaleString()}
                      </p>
                    </div>
                    <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: 16, borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Net Balance</p>
                      <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>
                        ₹{(
                          ledgerModal.transactions.filter(t => t.type === 'deposit' && t.status === 'approved').reduce((sum, t) => sum + (t.amount || 0), 0) -
                          ledgerModal.transactions.filter(t => t.type === 'withdrawal' && t.status === 'approved').reduce((sum, t) => sum + (t.amount || 0), 0)
                        ).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Transaction Table */}
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table" style={{ minWidth: 800 }}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Bonus</th>
                          <th>Method</th>
                          <th>Status</th>
                          <th>Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerModal.transactions.map((tx, idx) => (
                          <tr key={tx._id || idx}>
                            <td>{new Date(tx.createdAt).toLocaleDateString('en-GB')} {new Date(tx.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td>
                              <span style={{
                                padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                background: tx.type === 'deposit' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: tx.type === 'deposit' ? '#10b981' : '#ef4444'
                              }}>
                                {tx.type === 'deposit' ? '↓ Deposit' : '↑ Withdrawal'}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: tx.type === 'deposit' ? '#10b981' : '#ef4444' }}>
                              {tx.type === 'deposit' ? '+' : '-'}{tx.currency === 'INR' ? '₹' : '$'}{tx.amount?.toLocaleString()}
                            </td>
                            <td>
                              {Number(tx.bonusAmount) > 0 ? (
                                <span style={{ color: '#fbbf24', fontWeight: 600, fontSize: 12 }} title={tx.bonusTemplateName || ''}>
                                  🎁 +₹{Number(tx.bonusAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                              )}
                            </td>
                            <td style={{ textTransform: 'capitalize' }}>{tx.paymentMethod || tx.method || '-'}</td>
                            <td><span className={`fund-status-badge fund-status-${tx.status}`}>{tx.status}</span></td>
                            <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{tx._id?.slice(-8) || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div style={{ 
              padding: '16px 24px', background: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {ledgerModal.transactions.length} transaction(s)
              </span>
              <button 
                onClick={() => setLedgerModal({ open: false, userId: null, userName: '', transactions: [], loading: false })}
                className="admin-btn"
                style={{ background: 'var(--bg-secondary)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Transaction Details Modal */}
      {viewModal.open && viewModal.transaction && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 600,
            border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                {viewModal.transaction.type === 'deposit' ? '💰 Deposit' : '💸 Withdrawal'} Details
              </h3>
              <button onClick={() => setViewModal({ open: false, transaction: null })} style={{
                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
              }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Basic Info */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Transaction ID</p>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 0', fontFamily: 'monospace' }}>#{viewModal.transaction._id?.slice(-8) || viewModal.transaction.id}</p>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Status</p>
                  <span className={`status-badge status-${viewModal.transaction.status}`} style={{ marginTop: 4, display: 'inline-block' }}>{viewModal.transaction.status}</span>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>User</p>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 0' }}>{viewModal.transaction.userName || 'N/A'}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{viewModal.transaction.oderId}</p>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Amount ({viewModal.transaction.currency || 'USD'})</p>
                  <p style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 0', color: viewModal.transaction.type === 'deposit' ? '#10b981' : '#ef4444' }}>
                    {viewModal.transaction.currency === 'INR' ? '₹' : '$'}{viewModal.transaction.amount?.toFixed(2)}
                  </p>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Method</p>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 0', textTransform: 'capitalize' }}>{viewModal.transaction.paymentMethod || viewModal.transaction.method || 'N/A'}</p>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Date</p>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 0' }}>{new Date(viewModal.transaction.createdAt).toLocaleString()}</p>
                </div>
              </div>

              {/* Deposit Proof Image */}
              {viewModal.transaction.type === 'deposit' && viewModal.transaction.proofImage && (
                <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>📷 Payment Proof</p>
                  <img 
                    src={viewModal.transaction.proofImage} 
                    alt="Payment Proof" 
                    style={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                </div>
              )}

              {/* Withdrawal Details */}
              {viewModal.transaction.type === 'withdrawal' && viewModal.transaction.withdrawalInfo && (
                <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                    🏦 Withdrawal Details ({viewModal.transaction.withdrawalInfo.method?.toUpperCase()})
                  </p>
                  
                  {(viewModal.transaction.withdrawalInfo.method === 'bank' || viewModal.transaction.withdrawalInfo.method === 'upi') && viewModal.transaction.withdrawalInfo.bankDetails && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Bank Name</span>
                        <span style={{ fontWeight: 600 }}>{viewModal.transaction.withdrawalInfo.bankDetails.bankName}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Account Holder</span>
                        <span style={{ fontWeight: 600 }}>{viewModal.transaction.withdrawalInfo.bankDetails.accountHolder}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Account Number</span>
                        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{viewModal.transaction.withdrawalInfo.bankDetails.accountNumber}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: viewModal.transaction.withdrawalInfo.bankDetails.upiId ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>IFSC Code</span>
                        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{viewModal.transaction.withdrawalInfo.bankDetails.ifsc}</span>
                      </div>
                      {viewModal.transaction.withdrawalInfo.bankDetails.upiId && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>📱 UPI ID</span>
                          <span style={{ fontWeight: 600, fontFamily: 'monospace', color: '#8b5cf6' }}>{viewModal.transaction.withdrawalInfo.bankDetails.upiId}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {viewModal.transaction.withdrawalInfo.method === 'crypto' && viewModal.transaction.withdrawalInfo.cryptoDetails && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Network</span>
                        <span style={{ fontWeight: 600 }}>{viewModal.transaction.withdrawalInfo.cryptoDetails.network}</span>
                      </div>
                      <div style={{ padding: '8px 0' }}>
                        <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Wallet Address</span>
                        <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{viewModal.transaction.withdrawalInfo.cryptoDetails.address}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Legacy withdrawal details (text field) */}
              {viewModal.transaction.type === 'withdrawal' && viewModal.transaction.withdrawDetails && !viewModal.transaction.withdrawalInfo && (
                <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>📝 Withdrawal Details</p>
                  <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 13 }}>{viewModal.transaction.withdrawDetails}</p>
                </div>
              )}

              {/* Payment Details from paymentDetails field */}
              {viewModal.transaction.paymentDetails && Object.keys(viewModal.transaction.paymentDetails).some(k => viewModal.transaction.paymentDetails[k]) && (
                <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>💳 Payment Details</p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {viewModal.transaction.paymentDetails.bankName && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Bank</span>
                        <span>{viewModal.transaction.paymentDetails.bankName}</span>
                      </div>
                    )}
                    {viewModal.transaction.paymentDetails.accountNumber && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Account</span>
                        <span style={{ fontFamily: 'monospace' }}>{viewModal.transaction.paymentDetails.accountNumber}</span>
                      </div>
                    )}
                    {viewModal.transaction.paymentDetails.upiId && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>UPI ID</span>
                        <span style={{ fontFamily: 'monospace' }}>{viewModal.transaction.paymentDetails.upiId}</span>
                      </div>
                    )}
                    {viewModal.transaction.paymentDetails.walletAddress && (
                      <div>
                        <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Wallet Address</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{viewModal.transaction.paymentDetails.walletAddress}</span>
                      </div>
                    )}
                    {viewModal.transaction.paymentDetails.referenceNumber && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Reference</span>
                        <span style={{ fontFamily: 'monospace' }}>{viewModal.transaction.paymentDetails.referenceNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {viewModal.transaction.status === 'pending' && (
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button
                    onClick={() => { processTransaction(viewModal.transaction._id, 'approved', viewModal.transaction); setViewModal({ open: false, transaction: null }); }}
                    className="admin-btn success"
                    style={{ flex: 1 }}
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => { processTransaction(viewModal.transaction._id, 'rejected', viewModal.transaction); setViewModal({ open: false, transaction: null }); }}
                    className="admin-btn danger"
                    style={{ flex: 1 }}
                  >
                    ✗ Reject
                  </button>
                </div>
              )}

              <button
                onClick={() => setViewModal({ open: false, transaction: null })}
                className="admin-btn"
                style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Method Modal */}
      {editModal.open && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                Edit {editModal.type === 'bank' ? 'Bank Account' : editModal.type === 'upi' ? 'UPI' : 'Crypto Wallet'}
              </h3>
              <button onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); setQrPreview(''); }} style={{
                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
              }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Bank Account Fields */}
              {editModal.type === 'bank' && (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Bank Name</label>
                    <input
                      type="text"
                      value={editForm.bankName || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, bankName: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Account Number</label>
                    <input
                      type="text"
                      value={editForm.accountNumber || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, accountNumber: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>IFSC Code</label>
                    <input
                      type="text"
                      value={editForm.ifsc || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, ifsc: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Account Holder</label>
                    <input
                      type="text"
                      value={editForm.accountHolder || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, accountHolder: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                </>
              )}

              {/* UPI Fields */}
              {editModal.type === 'upi' && (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>UPI ID</label>
                    <input
                      type="text"
                      value={editForm.upiId || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, upiId: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Name</label>
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>QR Code Image</label>
                    <input type="file" accept="image/*" onChange={handleEditQrUpload} className="admin-input" />
                    {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 100, height: 100, marginTop: 8, objectFit: 'contain' }} />}
                  </div>
                </>
              )}

              {/* Crypto Fields */}
              {editModal.type === 'crypto' && (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Network</label>
                    <input
                      type="text"
                      value={editForm.network || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, network: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                      placeholder="e.g. BTC, ETH, USDT-TRC20"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Wallet Address</label>
                    <input
                      type="text"
                      value={editForm.address || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>QR Code Image</label>
                    <input type="file" accept="image/*" onChange={handleEditQrUpload} className="admin-input" />
                    {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 100, height: 100, marginTop: 8, objectFit: 'contain' }} />}
                  </div>
                </>
              )}

              {/* Status Toggle */}
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Status</label>
                <select
                  value={editForm.isActive ? 'active' : 'inactive'}
                  onChange={(e) => setEditForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))}
                  className="admin-select"
                  style={{ width: '100%' }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button
                  onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); setQrPreview(''); }}
                  className="admin-btn"
                  style={{ flex: 1, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveEditPaymentMethod}
                  className="admin-btn primary"
                  style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)' }}
                >
                  💾 Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FundManagement;

// =================================================================
// Challenge Buys panel — admin queue for direct-UPI challenge purchase
// requests submitted by users via PropChallengePage. Lives in this file
// to keep all bank-fund-management tabs co-located.
// =================================================================

function ChallengeBuysPanel({ apiUrl }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ pending: 0, approved: 0, rejected: 0, totalApproved: 0, totalPending: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [proofPreview, setProofPreview] = useState(null);

  // Screenshots are no longer in the list response (they made it 1.6 MB);
  // one is fetched when "View" is clicked.
  const openProof = async (txId) => {
    try {
      const t = localStorage.getItem('dhanfunded-admin-token');
      const res = await fetch(`${apiUrl}/api/prop/admin/transactions/${txId}/proof`, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      const d = await res.json();
      if (d.success && d.proofImage) setProofPreview(d.proofImage);
      else alert(d.message || 'No screenshot on this request');
    } catch {
      alert('Could not load the screenshot');
    }
  };
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const PER_PAGE = 20;

  const fmtInr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter, page: String(page), limit: String(PER_PAGE) });
      const res = await fetch(`${apiUrl}/api/prop/admin/challenge-buys?${params}`);
      const data = await res.json();
      if (data.success) {
        setRows(data.data.rows || []);
        setSummary(data.data.summary || {});
        if (data.data.pagination) setPagination(data.data.pagination);
      }
    } catch (e) { /* ignore */ }
    setLoading(false);
  }, [apiUrl, statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 whenever the status filter changes so the admin never lands
  // on an out-of-range page (e.g. was on page 4 of "all", switches to "pending"
  // which has 1 page).
  useEffect(() => { setPage(1); }, [statusFilter]);

  const handleApprove = async (txId) => {
    if (!window.confirm('Approve this challenge purchase? The challenge will activate for the user.')) return;
    try {
      const res = await fetch(`${apiUrl}/api/prop/admin/challenge-buys/${txId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        load();
      } else {
        alert(`Approval failed: ${data.message || 'unknown error'}`);
      }
    } catch (e) { alert('Network error: ' + e.message); }
  };

  const handleReject = async (txId) => {
    const reason = window.prompt('Reason for rejection?');
    if (reason === null || !reason.trim()) return;
    try {
      const res = await fetch(`${apiUrl}/api/prop/admin/challenge-buys/${txId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success) {
        load();
      } else {
        alert(`Rejection failed: ${data.message || 'unknown error'}`);
      }
    } catch (e) { alert('Network error: ' + e.message); }
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>Challenge Buy Requests</h2>
      </div>

      {/* Summary cards */}
      <div className="fund-stats-row" style={{ marginBottom: 18 }}>
        <div className="fund-stat-card">
          <div className="fund-stat-card__top">
            <div className="fund-stat-card__icon" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}><LuClock size={17} /></div>
            <div className="fund-stat-card__meta">
              <div className="fund-stat-card__label">Pending</div>
              <FundStatValue>{summary.pending || 0}</FundStatValue>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>{fmtInr(summary.totalPending)} awaiting</div>
        </div>
        <div className="fund-stat-card">
          <div className="fund-stat-card__top">
            <div className="fund-stat-card__icon" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' }}><LuArrowDownToLine size={17} /></div>
            <div className="fund-stat-card__meta">
              <div className="fund-stat-card__label">Approved</div>
              <FundStatValue>{summary.approved || 0}</FundStatValue>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>{fmtInr(summary.totalApproved)} total</div>
        </div>
        <div className="fund-stat-card">
          <div className="fund-stat-card__top">
            <div className="fund-stat-card__icon" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171' }}><LuArrowUpFromLine size={17} /></div>
            <div className="fund-stat-card__meta">
              <div className="fund-stat-card__label">Rejected</div>
              <FundStatValue>{summary.rejected || 0}</FundStatValue>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>Last 30d</div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['pending', 'approved', 'rejected', 'all'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border-color)',
              background: statusFilter === s ? '#3b82f6' : 'transparent',
              color: statusFilter === s ? '#fff' : 'var(--text-primary)',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, textTransform: 'capitalize'
            }}
          >{s}</button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: 'var(--text-secondary)', padding: 20 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <div className="empty-state" style={{ padding: 40, textAlign: 'center' }}>
          <span style={{ fontSize: 36 }}>🛒</span>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>No {statusFilter !== 'all' ? statusFilter : ''} challenge buy requests</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12 }}>
          <table className="admin-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Challenge</th>
                <th>Fee</th>
                <th>Coupon</th>
                <th>UPI Paid To</th>
                <th>Txn Ref</th>
                <th>Screenshot</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(tx => {
                const info = tx.challengePurchaseInfo || {};
                const original = Number(info.originalFee || 0);
                const final = Number(info.finalFee || tx.amount || 0);
                const hasDiscount = original > final;
                return (
                  <tr key={tx._id}>
                    <td style={{ fontSize: 12 }}>{new Date(tx.createdAt).toLocaleString()}</td>
                    <td>
                      <div className="user-info">
                        <strong>{tx.user?.name || tx.userName || 'N/A'}</strong>
                        <small>{tx.oderId}</small>
                      </div>
                    </td>
                    <td>
                      <strong>{info.challengeName || '—'}</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        ₹{Number(info.fundSize || 0).toLocaleString('en-IN')} fund
                      </div>
                    </td>
                    <td>
                      {hasDiscount ? (
                        <>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'line-through' }}>{fmtInr(original)}</div>
                          <div style={{ fontWeight: 700, color: '#10b981' }}>{fmtInr(final)}</div>
                        </>
                      ) : (
                        <span style={{ fontWeight: 700 }}>{fmtInr(final)}</span>
                      )}
                    </td>
                    <td>
                      {info.couponCode ? (
                        <code style={{ fontSize: 11 }}>{info.couponCode}</code>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td><code style={{ fontSize: 11 }}>{tx.paymentDetails?.upiId || '—'}</code></td>
                    <td><code style={{ fontSize: 11 }}>{tx.paymentDetails?.referenceNumber || '—'}</code></td>
                    <td>
                      {tx.hasProof ? (
                        <button
                          onClick={() => openProof(tx._id)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', fontSize: 11 }}
                        >🔍 View</button>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>none</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${
                        tx.status === 'approved' || tx.status === 'completed' ? 'badge-success' :
                        tx.status === 'pending' ? 'badge-warning' :
                        tx.status === 'rejected' ? 'badge-danger' :
                        'badge-secondary'
                      }`}>{tx.status}</span>
                      {tx.rejectionReason && (
                        <div style={{ fontSize: 10, color: '#ef4444', marginTop: 4, maxWidth: 180 }}>{tx.rejectionReason}</div>
                      )}
                    </td>
                    <td>
                      {tx.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => handleApprove(tx._id)}
                            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                          >Approve</button>
                          <button
                            onClick={() => handleReject(tx._id)}
                            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                          >Reject</button>
                        </div>
                      ) : (
                        <small style={{ color: 'var(--text-secondary)' }}>
                          {tx.processedAt ? new Date(tx.processedAt).toLocaleDateString() : '—'}
                        </small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination — server-side paged so admin can reach ALL challenge buys,
          not just the recent page. */}
      {!loading && pagination.pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Page {pagination.page} of {pagination.pages} · {pagination.total} total
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer', opacity: pagination.page <= 1 ? 0.5 : 1, fontSize: 13, fontWeight: 600 }}
            >← Prev</button>
            {Array.from({ length: pagination.pages }, (_, i) => i + 1)
              .filter(n => n === 1 || n === pagination.pages || Math.abs(n - pagination.page) <= 1)
              .reduce((acc, n, idx, arr) => {
                if (idx > 0 && n - arr[idx - 1] > 1) acc.push('…');
                acc.push(n);
                return acc;
              }, [])
              .map((n, i) => n === '…'
                ? <span key={`e${i}`} style={{ color: 'var(--text-secondary)', padding: '0 4px' }}>…</span>
                : (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    style={{
                      minWidth: 36, padding: '7px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      border: n === pagination.page ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                      background: n === pagination.page ? 'rgba(59,130,246,0.15)' : 'transparent',
                      color: n === pagination.page ? '#3b82f6' : 'var(--text-primary)'
                    }}
                  >{n}</button>
                ))}
            <button
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={pagination.page >= pagination.pages}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: pagination.page >= pagination.pages ? 'not-allowed' : 'pointer', opacity: pagination.page >= pagination.pages ? 0.5 : 1, fontSize: 13, fontWeight: 600 }}
            >Next →</button>
          </div>
        </div>
      )}

      {/* Screenshot lightbox */}
      {proofPreview && (
        <div
          onClick={() => setProofPreview(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 20
          }}
        >
          <img
            src={proofPreview}
            alt="Payment proof"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// =================================================================
// Challenge Resets panel — admin queue for paid-reset requests on FAILED
// evaluation accounts. Approving verifies the 50% payment, wipes every trade
// and restarts the account fresh (ACTIVE, 0 trades). Mirrors ChallengeBuysPanel.
// =================================================================

function ChallengeResetsPanel({ apiUrl }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ pending: 0, approved: 0, rejected: 0, totalPending: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [proofPreview, setProofPreview] = useState(null);

  // Screenshots are no longer in the list response (they made it 1.6 MB);
  // one is fetched when "View" is clicked.
  const openProof = async (txId) => {
    try {
      const t = localStorage.getItem('dhanfunded-admin-token');
      const res = await fetch(`${apiUrl}/api/prop/admin/transactions/${txId}/proof`, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      const d = await res.json();
      if (d.success && d.proofImage) setProofPreview(d.proofImage);
      else alert(d.message || 'No screenshot on this request');
    } catch {
      alert('Could not load the screenshot');
    }
  };
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  const fmtInr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter });
      const res = await fetch(`${apiUrl}/api/prop/admin/reset-requests?${params}`);
      const data = await res.json();
      if (data.success) {
        setRows(data.data.rows || []);
        setSummary(data.data.summary || {});
      }
    } catch (e) { /* ignore */ }
    setLoading(false);
  }, [apiUrl, statusFilter]);

  useEffect(() => { load(); }, [load]);
  // Reset to page 1 whenever the filter changes so we never sit on an
  // out-of-range page (e.g. page 3 of "all" then switch to "pending").
  useEffect(() => { setPage(1); }, [statusFilter]);

  // Client-side pagination — the reset-requests endpoint returns the full set
  // (up to 200); slice it into pages so admin can walk through every request.
  const pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const pagedRows = rows.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const handleApprove = async (txId) => {
    if (!window.confirm('Approve this reset? All positions on the account will be deleted and it restarts fresh (ACTIVE, 0 positions).')) return;
    try {
      const res = await fetch(`${apiUrl}/api/prop/admin/reset-requests/${txId}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminId: 'admin' })
      });
      const data = await res.json();
      if (data.success) load(); else alert(`Approval failed: ${data.message || 'unknown error'}`);
    } catch (e) { alert('Network error: ' + e.message); }
  };

  const handleReject = async (txId) => {
    const reason = window.prompt('Reason for rejection?');
    if (reason === null || !reason.trim()) return;
    try {
      const res = await fetch(`${apiUrl}/api/prop/admin/reset-requests/${txId}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success) load(); else alert(`Rejection failed: ${data.message || 'unknown error'}`);
    } catch (e) { alert('Network error: ' + e.message); }
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>🔄 Challenge Reset / Restart Requests</h2>
      </div>

      {/* Clear context banner so the admin never confuses these with buys. */}
      <div style={{
        margin: '0 0 16px', padding: '11px 15px', borderRadius: 10,
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
        fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)'
      }}>
        <strong style={{ color: '#ef4444' }}>These are RESTART requests.</strong>{' '}
        A person paid <strong>50% of the challenge fee</strong> to <strong>reset a FAILED account</strong>.
        Approving <strong>deletes all their positions</strong> and restarts the account fresh (ACTIVE, 0 trades).
        Verify the payment (UTR + screenshot) before approving.
      </div>

      {/* Summary cards */}
      <div className="fund-stats-row" style={{ marginBottom: 18 }}>
        <div className="fund-stat-card">
          <div className="fund-stat-card__top">
            <div className="fund-stat-card__icon" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}><LuClock size={17} /></div>
            <div className="fund-stat-card__meta">
              <div className="fund-stat-card__label">Pending</div>
              <FundStatValue>{summary.pending || 0}</FundStatValue>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>{fmtInr(summary.totalPending)} awaiting</div>
        </div>
        <div className="fund-stat-card">
          <div className="fund-stat-card__top">
            <div className="fund-stat-card__icon" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' }}><LuArrowDownToLine size={17} /></div>
            <div className="fund-stat-card__meta">
              <div className="fund-stat-card__label">Approved</div>
              <FundStatValue>{summary.approved || 0}</FundStatValue>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>Accounts restarted</div>
        </div>
        <div className="fund-stat-card">
          <div className="fund-stat-card__top">
            <div className="fund-stat-card__icon" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171' }}><LuArrowUpFromLine size={17} /></div>
            <div className="fund-stat-card__meta">
              <div className="fund-stat-card__label">Rejected</div>
              <FundStatValue>{summary.rejected || 0}</FundStatValue>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>Last 30d</div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['pending', 'approved', 'rejected', 'all'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border-color)',
              background: statusFilter === s ? '#3b82f6' : 'transparent',
              color: statusFilter === s ? '#fff' : 'var(--text-primary)',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, textTransform: 'capitalize'
            }}
          >{s}</button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: 'var(--text-secondary)', padding: 20 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <div className="empty-state" style={{ padding: 40, textAlign: 'center' }}>
          <span style={{ fontSize: 36 }}>🔄</span>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>No {statusFilter !== 'all' ? statusFilter : ''} reset requests</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12 }}>
          <table className="admin-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Account</th>
                <th>Reset Fee</th>
                <th>UPI Paid To</th>
                <th>UTR / Ref</th>
                <th>Screenshot</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map(tx => {
                const info = tx.challengePurchaseInfo || {};
                const pd = tx.paymentDetails || {};
                return (
                  <tr key={tx._id}>
                    <td style={{ fontSize: 12 }}>{new Date(tx.createdAt).toLocaleString()}</td>
                    <td>
                      <div className="user-info">
                        <strong>{tx.user?.name || tx.userName || 'N/A'}</strong>
                        <small>{tx.oderId}</small>
                      </div>
                    </td>
                    <td>
                      <div style={{
                        display: 'inline-block', padding: '2px 9px', borderRadius: 5, marginBottom: 5,
                        background: 'linear-gradient(135deg,#ef4444,#f97316)', color: '#fff',
                        fontSize: 9, fontWeight: 800, letterSpacing: 0.6
                      }}>🔄 RESET</div>
                      <strong style={{ display: 'block' }}>{pd.challengeAccountCode || '—'}</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        ₹{Number(info.fundSize || 0).toLocaleString('en-IN')} fund
                      </div>
                    </td>
                    <td><span style={{ fontWeight: 800, color: '#f59e0b' }}>{fmtInr(tx.amount || info.finalFee || 0)}</span><div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>reset fee (50%)</div></td>
                    <td><code style={{ fontSize: 11 }}>{pd.upiId || '—'}</code></td>
                    <td><code style={{ fontSize: 11 }}>{pd.utrNumber || pd.referenceNumber || '—'}</code></td>
                    <td>
                      {tx.hasProof ? (
                        <button
                          onClick={() => openProof(tx._id)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', fontSize: 11 }}
                        >🔍 View</button>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>none</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${
                        tx.status === 'approved' || tx.status === 'completed' ? 'badge-success' :
                        tx.status === 'pending' ? 'badge-warning' :
                        tx.status === 'rejected' ? 'badge-danger' :
                        'badge-secondary'
                      }`}>{tx.status}</span>
                      {tx.rejectionReason && (
                        <div style={{ fontSize: 10, color: '#ef4444', marginTop: 4, maxWidth: 180 }}>{tx.rejectionReason}</div>
                      )}
                    </td>
                    <td>
                      {tx.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => handleApprove(tx._id)}
                            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                          >Approve</button>
                          <button
                            onClick={() => handleReject(tx._id)}
                            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                          >Reject</button>
                        </div>
                      ) : (
                        <small style={{ color: 'var(--text-secondary)' }}>
                          {tx.processedAt ? new Date(tx.processedAt).toLocaleDateString() : '—'}
                        </small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination — walk through ALL reset requests, not just the recent ones. */}
      {!loading && pageCount > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Showing {(safePage - 1) * PER_PAGE + 1}–{Math.min(safePage * PER_PAGE, rows.length)} of {rows.length}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: safePage <= 1 ? 'not-allowed' : 'pointer', opacity: safePage <= 1 ? 0.5 : 1, fontSize: 13, fontWeight: 600 }}
            >← Prev</button>
            {Array.from({ length: pageCount }, (_, i) => i + 1)
              .filter(n => n === 1 || n === pageCount || Math.abs(n - safePage) <= 1)
              .reduce((acc, n, idx, arr) => {
                if (idx > 0 && n - arr[idx - 1] > 1) acc.push('…');
                acc.push(n);
                return acc;
              }, [])
              .map((n, i) => n === '…'
                ? <span key={`e${i}`} style={{ color: 'var(--text-secondary)', padding: '0 4px' }}>…</span>
                : (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    style={{
                      minWidth: 36, padding: '7px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      border: n === safePage ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                      background: n === safePage ? 'rgba(59,130,246,0.15)' : 'transparent',
                      color: n === safePage ? '#3b82f6' : 'var(--text-primary)'
                    }}
                  >{n}</button>
                ))}
            <button
              onClick={() => setPage(p => Math.min(pageCount, p + 1))}
              disabled={safePage >= pageCount}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: safePage >= pageCount ? 'not-allowed' : 'pointer', opacity: safePage >= pageCount ? 0.5 : 1, fontSize: 13, fontWeight: 600 }}
            >Next →</button>
          </div>
        </div>
      )}

      {/* Screenshot lightbox */}
      {proofPreview && (
        <div
          onClick={() => setProofPreview(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 20
          }}
        >
          <img
            src={proofPreview}
            alt="Payment proof"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
