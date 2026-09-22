import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import scopedApi from './scopedApi';
import SymbolPicker from './SymbolPicker';
import {
  SETTING_CATEGORIES, CATEGORY_FIELDS, NETTING_SEGMENTS,
} from './nettingMatrixConfig';

/**
 * Scoped script matrix — admin-style inline-edit table where rows are
 * (segment, symbol) pairs. Category nav at the top filters which columns
 * are visible. Inline edits are tracked per row and flushed with a single
 * "Save N Edits" click.
 *
 * Fetch:  GET /scoped/scripts/:mode — grouped by (segment, symbol)
 * Save:   PUT /scoped/scripts/:mode/:segmentName/:symbol  (one call per edited row)
 * Delete: DELETE /scoped/scripts/:mode/:segmentName/:symbol
 *
 * Props
 *   mode: 'netting' | 'hedging'
 */
export default function ScopedScriptMatrix({ mode, userId }) {
  const { API_URL } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState({});  // { rowKey: { field: val, ... } }
  const [category, setCategory] = useState('lot');

  // Add-script bar
  const [adding, setAdding] = useState(false);
  const [addSegment, setAddSegment] = useState('');
  const [addSymbol, setAddSymbol] = useState(null);

  const label = mode === 'hedging' ? 'Hedging' : 'Netting';
  const rowKey = (r) => `${r.segmentName}|${r.symbol}`;

  const fetchRows = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // In bulk mode we list scripts I've authored. In single-user mode we
      // reuse the same list (admin may have authored script rows across scope)
      // but hydrate each row from the per-user read endpoint.
      const r = await scopedApi.listScripts(API_URL, mode);
      const full = await Promise.all((r.scripts || []).map(async (s) => {
        try {
          const detail = userId
            ? await scopedApi.readUserScript(API_URL, userId, mode, s.segmentName, s.symbol)
            : await scopedApi.readScript(API_URL, mode, s.segmentName, s.symbol);
          return {
            segmentName: s.segmentName,
            symbol: s.symbol,
            userCount: s.userCount,
            ...(detail.currentOverride || {}),
          };
        } catch {
          return { segmentName: s.segmentName, symbol: s.symbol, userCount: s.userCount };
        }
      }));
      setRows(full);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [API_URL, mode, userId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const editCount = useMemo(() =>
    Object.values(editing).reduce((n, fields) => n + Object.keys(fields || {}).length, 0),
    [editing]);

  const cellValue = (row, fieldKey) => {
    const e = editing[rowKey(row)];
    if (e && fieldKey in e) return e[fieldKey];
    return row[fieldKey];
  };

  const updateCell = (row, fieldKey, value) => {
    const k = rowKey(row);
    setEditing(prev => ({ ...prev, [k]: { ...(prev[k] || {}), [fieldKey]: value } }));
  };

  const saveAll = async () => {
    if (!editCount) return;
    setSaving(true); setError(null);
    let ok = 0, fail = 0;
    try {
      for (const row of rows) {
        const k = rowKey(row);
        const fields = editing[k];
        if (!fields || !Object.keys(fields).length) continue;
        try {
          if (userId) {
            await scopedApi.writeUserScript(API_URL, userId, mode, row.segmentName, row.symbol, fields);
          } else {
            await scopedApi.writeScript(API_URL, mode, row.segmentName, row.symbol, fields);
          }
          ok += 1;
        } catch (e) {
          console.error(`[scripts] save ${k} failed:`, e);
          fail += 1;
        }
      }
      alert(`Saved ${ok} row(s).${fail ? ` ${fail} failed.` : ''}`);
      setEditing({});
      await fetchRows();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const removeRow = async (row) => {
    // Pending rows never hit the server — just drop from local state.
    if (row.__pending) {
      const k = `${row.segmentName}|${row.symbol}`;
      setRows(prev => prev.filter(r => `${r.segmentName}|${r.symbol}` !== k));
      setEditing(prev => {
        const next = { ...prev }; delete next[k]; return next;
      });
      return;
    }
    const msg = userId
      ? `Remove ${row.segmentName}/${row.symbol} override for this user?`
      : `Remove ${row.segmentName}/${row.symbol} override from all scoped users?`;
    if (!confirm(msg)) return;
    setSaving(true); setError(null);
    try {
      if (userId) await scopedApi.clearUserScript(API_URL, userId, mode, row.segmentName, row.symbol);
      else        await scopedApi.clearScript(API_URL, mode, row.segmentName, row.symbol);
      await fetchRows();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const addScript = () => {
    if (!addSegment || !addSymbol) return;
    const k = `${addSegment}|${addSymbol}`;
    if (rows.some(r => `${r.segmentName}|${r.symbol}` === k)) {
      alert('That script is already in the table — edit it directly.');
      return;
    }
    // Append a pending row. No server write yet — user edits cells, then Save
    // flushes. This avoids the "no editable fields" backend error and lets the
    // admin start from blank values with the segment defaults visible as hints.
    setRows(prev => [
      { segmentName: addSegment, symbol: addSymbol, userCount: 0, __pending: true },
      ...prev,
    ]);
    setAdding(false); setAddSegment(''); setAddSymbol(null);
    setError(null);
    // Focus hint — remind the admin that pending rows only persist after an edit + Save.
    setTimeout(() => {
      setError('New row added. Edit at least one field then click Save to persist.');
    }, 0);
  };

  const segmentExchange = (name) => NETTING_SEGMENTS.find(s => s.code === name)?.code || name;

  // Only show fields that have `scriptTabOnly` or neither tag (i.e. shared script+segment).
  const visibleFields = useMemo(() =>
    (CATEGORY_FIELDS[category] || []).filter(f => !f.segmentTabOnly),
    [category]);

  const renderInput = (row, field) => {
    const raw = cellValue(row, field.key);
    const isEdited = editing[rowKey(row)] && field.key in editing[rowKey(row)];
    const style = {
      width: '100%', padding: '5px 8px', fontSize: 12,
      border: `1px solid ${isEdited ? '#3b82f6' : 'var(--border-color)'}`,
      borderRadius: 4,
      background: isEdited ? 'rgba(59,130,246,0.08)' : 'var(--bg-primary)',
      color: 'var(--text-primary)',
      outline: 'none',
    };
    if (field.type === 'select') {
      return (
        <select style={style} value={raw ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            const opt = field.options?.find(o => String(o.v) === v);
            updateCell(row, field.key, opt ? opt.v : (v === '' ? null : v));
          }}
        >
          <option value="">—</option>
          {field.options?.map(o => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
        </select>
      );
    }
    if (field.type === 'time') {
      return <input type="time" style={style} value={raw ?? ''}
        onChange={(e) => updateCell(row, field.key, e.target.value || null)} />;
    }
    return <input type="number" style={style} value={raw ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        updateCell(row, field.key, v === '' ? null : Number(v));
      }} />;
  };

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h2 style={{ margin: 0 }}>{label} Script Settings</h2>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Per-symbol overrides inside a segment. Edit cells inline and save in one click.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setAdding(v => !v)} style={styles.addBtn}>
            {adding ? 'Cancel' : '+ Add Script'}
          </button>
          <button onClick={saveAll} disabled={saving || !editCount}
            style={{ ...styles.saveBtn, opacity: (saving || !editCount) ? 0.5 : 1 }}>
            {saving ? 'Saving…' : `Save ${editCount} Edit${editCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {adding && (
        <div style={styles.addCard}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={styles.label}>Segment</label>
              <select value={addSegment}
                onChange={(e) => { setAddSegment(e.target.value); setAddSymbol(null); }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }}
              >
                <option value="">Choose…</option>
                {NETTING_SEGMENTS.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={styles.label}>Symbol</label>
              {addSegment ? (
                <SymbolPicker API_URL={API_URL} exchange={segmentExchange(addSegment)} segmentName={addSegment} value={addSymbol} onChange={setAddSymbol} />
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Pick segment first</div>
              )}
            </div>
            <button onClick={addScript} disabled={!addSegment || !addSymbol || saving}
              style={{ ...styles.addBtn, opacity: (!addSegment || !addSymbol) ? 0.5 : 1 }}>
              Add Row
            </button>
          </div>
        </div>
      )}

      {/* Category nav */}
      <div style={styles.catNav}>
        {SETTING_CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            style={{ ...styles.catBtn, ...(category === c.id ? styles.catBtnActive : null) }}>
            {c.label}
          </button>
        ))}
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.scroller}>
        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={styles.empty}>No script overrides yet. Click <strong>+ Add Script</strong> to create one.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.stickyHead, left: 0, zIndex: 6 }}>Segment</th>
                <th style={{ ...styles.stickyHead, left: 120, zIndex: 6 }}>Symbol</th>
                <th style={{ ...styles.stickyHead, left: 240, zIndex: 6 }}>Users</th>
                {visibleFields.map(f => (
                  <th key={f.key} style={styles.fieldHead} title={f.label}>{f.label}</th>
                ))}
                <th style={{ ...styles.stickyHead, right: 0, zIndex: 6 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={rowKey(row)}>
                  <td style={{ ...styles.stickyCell, left: 0, fontWeight: 600 }}>
                    {row.segmentName}
                    {row.__pending && <span style={styles.pendingTag} title="Not yet saved">pending</span>}
                  </td>
                  <td style={{ ...styles.stickyCell, left: 120, fontFamily: 'ui-monospace, monospace' }}>{row.symbol}</td>
                  <td style={{ ...styles.stickyCell, left: 240 }}>
                    <span style={styles.userBadge}>{row.userCount || 0}</span>
                  </td>
                  {visibleFields.map(f => (
                    <td key={f.key} style={styles.cell}>{renderInput(row, f)}</td>
                  ))}
                  <td style={{ ...styles.stickyCell, right: 0, padding: 4 }}>
                    <button onClick={() => removeRow(row)} style={styles.removeBtn} title="Remove from all scoped users">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { padding: 16 },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  addBtn: { padding: '8px 14px', borderRadius: 6, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  saveBtn: { padding: '8px 14px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  addCard: { padding: 14, border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', marginBottom: 12 },
  catNav: { display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)' },
  catBtn: { padding: '7px 12px', fontSize: 12, fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', borderBottom: '2px solid transparent' },
  catBtnActive: { color: '#3b82f6', borderBottomColor: '#3b82f6' },
  errorBox: { padding: 10, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', marginBottom: 12, fontSize: 13 },
  empty: { padding: 24, textAlign: 'center', color: 'var(--text-secondary)' },
  scroller: { overflow: 'auto', maxHeight: 'calc(100vh - 300px)', border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)' },
  table: { borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, width: 'max-content', minWidth: '100%' },
  stickyHead: { position: 'sticky', top: 0, padding: '8px 12px', textAlign: 'left', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', fontSize: 12, fontWeight: 600, minWidth: 120 },
  fieldHead: { position: 'sticky', top: 0, padding: '8px 10px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', minWidth: 140 },
  stickyCell: { position: 'sticky', padding: '8px 12px', background: 'var(--bg-primary)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', zIndex: 2, minWidth: 120 },
  cell: { padding: 4, borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', minWidth: 140 },
  userBadge: { padding: '2px 8px', background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  pendingTag: { marginLeft: 8, padding: '1px 6px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 8, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 },
  removeBtn: { padding: '4px 8px', fontSize: 13, borderRadius: 4, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer' },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 },
};
