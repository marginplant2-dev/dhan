import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { LuArrowDownToLine, LuArrowUpFromLine, LuClock, LuWallet } from 'react-icons/lu';
import scopedApi from '../scoped/scopedApi';

/**
 * Scoped Fund Management — mirrors the admin FundManagement layout + columns,
 * but filters rows to the signed-in admin's scope. Uses the shared admin CSS
 * classes (fund-stat-card, etc.) already loaded via Admin.css.
 *
 *   Deposits:    Created | Hierarchy | User | Amount/Type | Bonus | Status
 *                | Remark | Order Ref | Proof | Accept | Reject | Position | Ledger
 *   Withdrawals: Created | Hierarchy | User | Amount/Type | Status
 *                | Acc Name | Acc Num | IFSC | UPI ID | Remark | Order Ref
 *                | Accept | Reject | Position | Ledger
 *
 * Approve / Reject call the existing /api/admin/transactions/:id endpoint
 * (server-side scope guard in server/index.js rejects out-of-scope targets).
 *
 * Props
 *   type: 'deposit' | 'withdrawal' | 'all'
 */
const STATUS_PILLS = {
  pending:   { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b', border: 'rgba(245,158,11,0.35)' },
  processing:{ bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6', border: 'rgba(59,130,246,0.35)' },
  approved:  { bg: 'rgba(16,185,129,0.15)', fg: '#10b981', border: 'rgba(16,185,129,0.35)' },
  completed: { bg: 'rgba(16,185,129,0.15)', fg: '#10b981', border: 'rgba(16,185,129,0.35)' },
  rejected:  { bg: 'rgba(239,68,68,0.15)',  fg: '#ef4444', border: 'rgba(239,68,68,0.35)' },
  failed:    { bg: 'rgba(239,68,68,0.15)',  fg: '#ef4444', border: 'rgba(239,68,68,0.35)' },
};

const VARIANT_LABEL = {
  deposit: 'Deposit Requests',
  withdrawal: 'Withdrawal Requests',
  all: 'All Transactions',
};

const DEPOSIT_COLUMNS = [
  { id: 'createdAt',  label: 'Created' },
  { id: 'hierarchy',  label: 'Hierarchy' },
  { id: 'userId',     label: 'User' },
  { id: 'amount',     label: 'Amount / Type' },
  { id: 'bonus',      label: 'Bonus' },
  { id: 'status',     label: 'Status' },
  { id: 'remark',     label: 'Remark' },
  { id: 'orderRef',   label: 'Order Ref' },
  { id: 'showImage',  label: 'Show Image' },
  { id: 'accept',     label: 'Accept' },
  { id: 'reject',     label: 'Reject' },
  { id: 'position',   label: 'Position' },
  { id: 'ledger',     label: 'Ledger' },
];

const WITHDRAWAL_COLUMNS = [
  { id: 'createdAt',  label: 'Created' },
  { id: 'hierarchy',  label: 'Hierarchy' },
  { id: 'userId',     label: 'User' },
  { id: 'amount',     label: 'Amount / Type' },
  { id: 'status',     label: 'Status' },
  { id: 'accName',    label: 'Acc Name' },
  { id: 'accNum',     label: 'Acc Num' },
  { id: 'ifsc',       label: 'IFSC' },
  { id: 'upiId',      label: 'UPI ID' },
  { id: 'remark',     label: 'Remark' },
  { id: 'orderRef',   label: 'Order Ref' },
  { id: 'accept',     label: 'Accept' },
  { id: 'reject',     label: 'Reject' },
  { id: 'position',   label: 'Position' },
  { id: 'ledger',     label: 'Ledger' },
];

const ALL_COLUMNS = [
  { id: 'createdAt',  label: 'Created' },
  { id: 'hierarchy',  label: 'Hierarchy' },
  { id: 'userId',     label: 'User' },
  { id: 'type',       label: 'Type' },
  { id: 'amount',     label: 'Amount' },
  { id: 'status',     label: 'Status' },
  { id: 'method',     label: 'Method' },
  { id: 'orderRef',   label: 'Order Ref' },
  { id: 'accept',     label: 'Accept' },
  { id: 'reject',     label: 'Reject' },
  { id: 'position',   label: 'Position' },
  { id: 'ledger',     label: 'Ledger' },
];

const columnSetFor = (type) =>
  type === 'deposit' ? DEPOSIT_COLUMNS
  : type === 'withdrawal' ? WITHDRAWAL_COLUMNS
  : ALL_COLUMNS;

function extractPaymentDetails(tx) {
  const pd = tx.paymentDetails || {};
  const wi = tx.withdrawalInfo || {};
  const wb = wi.bankDetails || {};
  const wu = wi.upiDetails || {};
  return {
    accName: wb.accountHolder || pd.accountHolderName || '—',
    accNum:  wb.accountNumber || pd.accountNumber || '—',
    ifsc:    wb.ifsc || pd.ifscCode || '—',
    upiId:   wu.upiId || pd.upiId || '—',
    reference: pd.referenceNumber || pd.utrNumber || tx.transactionId || tx._id,
  };
}

export default function ScopedTransactionsList({ type = 'all' }) {
  const { API_URL } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({ status: '', search: '', dateFrom: '', dateTo: '' });
  const [busyId, setBusyId] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [positionModal, setPositionModal] = useState(null); // { oderId, userName, rows, loading }
  const [ledgerModal, setLedgerModal] = useState(null);     // { oderId, userName, rows, loading }

  const columns = columnSetFor(type);

  const fetchRows = useCallback(async (page = 1) => {
    setLoading(true); setError(null);
    try {
      const r = await scopedApi.listScopedTransactions(API_URL, {
        type: type === 'all' ? '' : type,
        status: filter.status, search: filter.search,
        dateFrom: filter.dateFrom, dateTo: filter.dateTo,
        page, limit: 50,
      });
      setRows(r.transactions || []);
      setSummary(r.summary || null);
      setPagination(r.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 });
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [API_URL, type, filter]);

  useEffect(() => { fetchRows(1); }, [fetchRows]);

  const mutate = async (tx, payload) => {
    setBusyId(tx._id); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/transactions/${tx._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.error || `HTTP ${res.status}`);
      await fetchRows(pagination.page);
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  const approve = (tx) => {
    if (!confirm(`Approve ${tx.type} of ${tx.amount} ${tx.currency || ''} for ${tx.oderId}?`)) return;
    mutate(tx, { status: 'approved', processedBy: 'scoped-admin' });
  };
  const submitReject = () => {
    if (!rejecting) return;
    if (!rejectReason.trim()) { alert('Reason required'); return; }
    mutate(rejecting, { status: 'rejected', rejectionReason: rejectReason.trim(), processedBy: 'scoped-admin' })
      .then(() => { setRejecting(null); setRejectReason(''); });
  };

  // Position modal: fetch open/pending positions filtered to this user.
  const openPositions = async (tx) => {
    setPositionModal({ oderId: tx.oderId, userName: tx.userName || tx.oderId, rows: [], loading: true });
    try {
      const r = await scopedApi.listOpenTrades(API_URL, { search: tx.oderId });
      setPositionModal({ oderId: tx.oderId, userName: tx.userName || tx.oderId, rows: r.positions || [], loading: false });
    } catch (e) {
      setPositionModal({ oderId: tx.oderId, userName: tx.userName || tx.oderId, rows: [], loading: false, error: e.message });
    }
  };

  // Ledger modal: fetch all transactions for this user.
  const openLedger = async (tx) => {
    setLedgerModal({ oderId: tx.oderId, userName: tx.userName || tx.oderId, rows: [], loading: true });
    try {
      const r = await scopedApi.listScopedTransactions(API_URL, { search: tx.oderId, limit: 100 });
      setLedgerModal({ oderId: tx.oderId, userName: tx.userName || tx.oderId, rows: r.transactions || [], loading: false });
    } catch (e) {
      setLedgerModal({ oderId: tx.oderId, userName: tx.userName || tx.oderId, rows: [], loading: false, error: e.message });
    }
  };

  const renderCell = (col, tx) => {
    const pd = extractPaymentDetails(tx);
    const isPending = tx.status === 'pending' || tx.status === 'processing';
    const isDeposit = tx.type === 'deposit';
    const amtColor = isDeposit ? '#10b981' : '#ef4444';

    switch (col.id) {
      case 'createdAt':
        return (
          <div>
            <div style={{ fontSize: 12 }}>{tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : '—'}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString() : ''}</div>
          </div>
        );
      case 'hierarchy':
        return tx.parentName ? (
          <>
            <div style={{ fontSize: 12 }}>{tx.parentName}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{tx.parentType}</div>
          </>
        ) : '—';
      case 'userId':
        return (
          <>
            <div style={{ fontWeight: 600 }}>{tx.userName || tx.oderId}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{tx.oderId}{tx.userEmail ? ' · ' + tx.userEmail : ''}</div>
          </>
        );
      case 'type':
        return <TypeChip type={tx.type} />;
      case 'amount': {
        const amt = Number(tx.amount || 0).toLocaleString();
        return (
          <>
            <div style={{ fontWeight: 700, color: amtColor }}>{tx.currency === 'INR' ? '₹' : '$'}{amt}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{tx.type}</div>
          </>
        );
      }
      case 'method':
        return tx.paymentMethod || '—';
      case 'bonus':
        return tx.bonusAmount > 0 ? (
          <div>
            <div style={{ color: '#10b981', fontWeight: 600, fontSize: 12 }}>🎁 +₹{Number(tx.bonusAmount).toLocaleString()}</div>
            {tx.bonusTemplateName && <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{tx.bonusTemplateName}</div>}
          </div>
        ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>;
      case 'status': {
        const pill = STATUS_PILLS[tx.status] || STATUS_PILLS.pending;
        return (
          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: pill.bg, color: pill.fg, border: `1px solid ${pill.border}`, textTransform: 'capitalize' }}>
            {tx.status}
          </span>
        );
      }
      case 'remark':
        return (
          <div style={{ fontSize: 12, maxWidth: 180, whiteSpace: 'normal', color: 'var(--text-secondary)' }}>
            {tx.userNote || tx.adminNote || tx.rejectionReason || '—'}
          </div>
        );
      case 'orderRef':
        return <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pd.reference}</code>;
      case 'showImage':
        return tx.proofImage ? (
          <button onClick={() => setImagePreview(tx.proofImage)} style={styles.btnShowImage}>
            📷 Show Image
          </button>
        ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>;
      case 'accName':
        return pd.accName;
      case 'accNum':
        return <code style={{ fontSize: 11 }}>{pd.accNum}</code>;
      case 'ifsc':
        return <code style={{ fontSize: 11 }}>{pd.ifsc}</code>;
      case 'upiId':
        return <code style={{ fontSize: 11 }}>{pd.upiId}</code>;
      case 'accept':
        return isPending ? (
          <button onClick={() => approve(tx)} disabled={busyId === tx._id} style={styles.btnAccept}>
            ✓ Accept
          </button>
        ) : (
          <span style={styles.pillAccepted}>✓ Accepted</span>
        );
      case 'reject':
        return isPending ? (
          <button onClick={() => { setRejecting(tx); setRejectReason(''); }} disabled={busyId === tx._id} style={styles.btnReject}>
            × Reject
          </button>
        ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>;
      case 'position':
        return (
          <button onClick={() => openPositions(tx)} style={styles.btnNeutral}>
            📊 Position
          </button>
        );
      case 'ledger':
        return (
          <button onClick={() => openLedger(tx)} style={styles.btnNeutral}>
            📄 Ledger
          </button>
        );
      default:
        return '—';
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ margin: '0 0 16px 0' }}>{VARIANT_LABEL[type]}</h2>

      {/* Summary cards — mirror admin's fund-stat-card layout */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
          <StatCard
            icon={<LuArrowDownToLine size={17} />}
            iconBg="rgba(34,197,94,0.15)" iconBorder="rgba(34,197,94,0.35)" iconColor="#4ade80"
            label="Total Deposits"
            value={(summary.approvedDeposits || 0).toLocaleString()}
            caption="Approved & completed"
          />
          <StatCard
            icon={<LuArrowUpFromLine size={17} />}
            iconBg="rgba(239,68,68,0.15)" iconBorder="rgba(239,68,68,0.35)" iconColor="#f87171"
            label="Total Withdrawals"
            value={(summary.approvedWithdrawals || 0).toLocaleString()}
            caption="Approved & completed"
          />
          <StatCard
            icon={<LuClock size={17} />}
            iconBg="rgba(234,179,8,0.15)" iconBorder="rgba(234,179,8,0.35)" iconColor="#fbbf24"
            label="Pending Requests"
            value={summary.pending || 0}
            caption="Deposits & withdrawals awaiting action"
          />
          <StatCard
            icon={<LuWallet size={17} />}
            iconBg="rgba(168,85,247,0.15)" iconBorder="rgba(168,85,247,0.35)" iconColor="#c084fc"
            label="Net Balance"
            value={(((summary.approvedDeposits || 0) - (summary.approvedWithdrawals || 0))).toLocaleString()}
            caption="Deposits − withdrawals (approved)"
          />
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', padding: 12, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
        <input type="text" placeholder="Search by user…" value={filter.search}
          onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
          style={{ ...styles.input, flex: 1, minWidth: 220 }} />
        <select value={filter.status} onChange={(e) => setFilter(f => ({ ...f, status: e.target.value }))} style={styles.input}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <input type="date" value={filter.dateFrom}
          onChange={(e) => setFilter(f => ({ ...f, dateFrom: e.target.value }))} style={styles.input} />
        <input type="date" value={filter.dateTo}
          onChange={(e) => setFilter(f => ({ ...f, dateTo: e.target.value }))} style={styles.input} />
        <button onClick={() => fetchRows(1)} disabled={loading} style={styles.btnPrimary}>
          {loading ? 'Loading…' : 'Search'}
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.tableWrap}>
        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={styles.empty}>No transactions.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {columns.map(c => <th key={c.id} style={styles.th}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(tx => (
                <tr key={tx._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {columns.map(c => <td key={c.id} style={styles.td}>{renderCell(c, tx)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
          <button onClick={() => fetchRows(pagination.page - 1)} disabled={pagination.page === 1 || loading} style={styles.btnPage}>‹</button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            Page {pagination.page} / {pagination.totalPages} · {pagination.total} total
          </span>
          <button onClick={() => fetchRows(pagination.page + 1)} disabled={pagination.page === pagination.totalPages || loading} style={styles.btnPage}>›</button>
        </div>
      )}

      {imagePreview && (
        <Modal title="Payment Proof" onClose={() => setImagePreview(null)} maxWidth={720}>
          <img src={imagePreview} alt="Payment proof" style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
        </Modal>
      )}

      {rejecting && (
        <Modal title={`Reject ${rejecting.type}`} onClose={() => { setRejecting(null); setRejectReason(''); }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            {rejecting.userName || rejecting.oderId} · {Number(rejecting.amount).toLocaleString()} {rejecting.currency || ''}
          </div>
          <label style={styles.label}>Reason</label>
          <textarea rows={3} value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            style={{ ...styles.input, resize: 'vertical', width: '100%' }} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
            <button onClick={() => { setRejecting(null); setRejectReason(''); }} style={styles.btnSecondary}>Cancel</button>
            <button onClick={submitReject} disabled={busyId === rejecting._id}
              style={{ ...styles.btnPrimary, background: '#ef4444' }}>
              {busyId === rejecting._id ? 'Saving…' : 'Reject'}
            </button>
          </div>
        </Modal>
      )}

      {positionModal && (
        <Modal title={`Open Positions · ${positionModal.userName}`}
          onClose={() => setPositionModal(null)} maxWidth={900}>
          <PositionTable loading={positionModal.loading} rows={positionModal.rows} error={positionModal.error} />
        </Modal>
      )}

      {ledgerModal && (
        <Modal title={`Ledger · ${ledgerModal.userName}`}
          onClose={() => setLedgerModal(null)} maxWidth={900}>
          <LedgerTable loading={ledgerModal.loading} rows={ledgerModal.rows} error={ledgerModal.error} />
        </Modal>
      )}
    </div>
  );
}

function StatCard({ icon, iconBg, iconBorder, iconColor, label, value, caption }) {
  return (
    <div className="fund-stat-card">
      <div className="fund-stat-card__top">
        <div className="fund-stat-card__icon" style={{ background: iconBg, border: `1px solid ${iconBorder}`, color: iconColor }} aria-hidden>
          {icon}
        </div>
        <div className="fund-stat-card__meta">
          <div className="fund-stat-card__label">{label}</div>
          <div className="fund-stat-card__value" style={{ fontSize: String(value).length > 14 ? 16 : 22 }}>{value}</div>
        </div>
      </div>
      {caption && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{caption}</div>}
    </div>
  );
}

function TypeChip({ type }) {
  const isDep = type === 'deposit';
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 6,
      fontSize: 11, fontWeight: 600,
      background: isDep ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
      color: isDep ? '#10b981' : '#ef4444',
      border: `1px solid ${isDep ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`,
      textTransform: 'capitalize',
    }}>{type}</span>
  );
}

function Modal({ title, onClose, children, maxWidth = 500 }) {
  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.panel, maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={styles.btnSecondary}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PositionTable({ loading, rows, error }) {
  if (loading) return <div style={styles.empty}>Loading positions…</div>;
  if (error) return <div style={styles.errorBox}>{error}</div>;
  if (!rows || rows.length === 0) return <div style={styles.empty}>No open positions.</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          {['Symbol', 'Mode', 'Side', 'Volume', 'Entry', 'Current', 'P/L', 'Opened'].map(h =>
            <th key={h} style={styles.th}>{h}</th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const pnl = Number(r.profit || 0);
          return (
            <tr key={r._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
              <td style={styles.td}><strong>{r.symbol}</strong></td>
              <td style={styles.td}><span style={styles.chipNeutral}>{r.mode}</span></td>
              <td style={styles.td}>
                <span style={{ color: r.side === 'buy' ? '#10b981' : '#ef4444', fontWeight: 600 }}>{String(r.side || '').toUpperCase()}</span>
              </td>
              <td style={styles.td}>{r.volume ?? '—'}</td>
              <td style={styles.td}>{r.entryPrice ?? r.avgPrice ?? '—'}</td>
              <td style={styles.td}>{r.currentPrice ?? '—'}</td>
              <td style={{ ...styles.td, color: pnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
              </td>
              <td style={styles.td}>{r.openTime ? new Date(r.openTime).toLocaleString() : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LedgerTable({ loading, rows, error }) {
  if (loading) return <div style={styles.empty}>Loading ledger…</div>;
  if (error) return <div style={styles.errorBox}>{error}</div>;
  if (!rows || rows.length === 0) return <div style={styles.empty}>No ledger entries.</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          {['Date', 'Type', 'Amount', 'Method', 'Status', 'Reference'].map(h =>
            <th key={h} style={styles.th}>{h}</th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const pill = STATUS_PILLS[r.status] || STATUS_PILLS.pending;
          return (
            <tr key={r._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
              <td style={styles.td}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
              <td style={styles.td}><TypeChip type={r.type} /></td>
              <td style={{ ...styles.td, fontWeight: 600, color: r.type === 'deposit' ? '#10b981' : '#ef4444' }}>
                {r.currency === 'INR' ? '₹' : '$'}{Number(r.amount || 0).toLocaleString()}
              </td>
              <td style={styles.td}>{r.paymentMethod || '—'}</td>
              <td style={styles.td}>
                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: pill.bg, color: pill.fg, border: `1px solid ${pill.border}` }}>
                  {r.status}
                </span>
              </td>
              <td style={styles.td}><code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.transactionId || r._id}</code></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const styles = {
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 },
  btnPrimary: { padding: '10px 18px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  btnSecondary: { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 },
  btnShowImage: { padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' },
  btnAccept: { padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.15)', color: '#10b981', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  btnReject: { padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  btnNeutral: { padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' },
  btnPage: { padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' },
  pillAccepted: { display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.35)', whiteSpace: 'nowrap' },
  errorBox: { padding: 10, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', marginBottom: 12, fontSize: 13 },
  tableWrap: { border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'auto', background: 'var(--bg-secondary)' },
  th: { textAlign: 'left', padding: '12px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 0.4, background: 'var(--bg-primary)' },
  td: { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' },
  empty: { padding: 24, textAlign: 'center', color: 'var(--text-secondary)' },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 },
  chipNeutral: { padding: '2px 8px', borderRadius: 10, background: 'rgba(127,127,127,0.12)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, textTransform: 'capitalize' },
};

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  panel: { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20, width: '92%', maxHeight: '90vh', overflow: 'auto' },
};
