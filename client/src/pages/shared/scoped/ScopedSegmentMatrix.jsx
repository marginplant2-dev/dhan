import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import scopedApi from './scopedApi';
import {
  NETTING_SEGMENTS, SETTING_CATEGORIES, CATEGORY_FIELDS, isFieldNA,
} from './nettingMatrixConfig';

/**
 * Scoped segment matrix — mirrors the admin's inline-edit table.
 * Two modes:
 *   - Bulk (no `userId`)      → writes fan out to every user in scope
 *   - Single-user (userId set) → writes only one user's row at the admin's layer
 *
 * Layout: one table, sticky top header (two rows: category group + field),
 * sticky left column (segment names). Scroll horizontally to see all fields.
 *
 * Props
 *   mode:   'netting' | 'hedging'
 *   userId: optional — when set, loads/writes per-user overrides for that user
 */
export default function ScopedSegmentMatrix({ mode, userId }) {
  const { API_URL } = useOutletContext();
  const [segments, setSegments] = useState([]);
  const [scope, setScope] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editingData, setEditingData] = useState({});
  const [settingCategory, setSettingCategory] = useState('lot');
  const [scrollToGroup, setScrollToGroup] = useState('');

  const label = mode === 'hedging' ? 'Hedging' : 'Netting';

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (userId) {
        // Single-user mode — fetch each segment's current override for this user.
        // We still need the global segment list to know what's available.
        const listR = await scopedApi.listSegments(API_URL, mode);
        const basics = listR.segments || [];
        setScope(listR.scope || null);
        const merged = await Promise.all(basics.map(async (s) => {
          try {
            const d = await scopedApi.readUserSegment(API_URL, userId, mode, s.name);
            return { ...s, ...(d.currentOverride || {}) };
          } catch { return s; }
        }));
        setSegments(merged);
      } else {
        const r = await scopedApi.listSegments(API_URL, mode);
        setSegments(r.segments || []);
        setScope(r.scope || null);
      }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [API_URL, mode, userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /** Index segment docs by name for quick lookup. */
  const segmentByName = useMemo(() => {
    const m = {};
    for (const s of segments) m[s.name] = s;
    return m;
  }, [segments]);

  // Pending edits count
  const editCount = useMemo(() => {
    let n = 0;
    for (const seg of Object.values(editingData)) n += Object.keys(seg || {}).length;
    return n;
  }, [editingData]);

  const getCellValue = (segName, fieldKey) => {
    if (editingData[segName] && fieldKey in editingData[segName]) {
      return editingData[segName][fieldKey];
    }
    return segmentByName[segName]?.[fieldKey];
  };

  const updateCell = (segName, fieldKey, value) => {
    setEditingData(prev => ({
      ...prev,
      [segName]: { ...(prev[segName] || {}), [fieldKey]: value },
    }));
  };

  const saveAllEdits = async () => {
    if (!editCount) return;
    setSaving(true); setError(null);
    let ok = 0, fail = 0;
    try {
      for (const [segName, fields] of Object.entries(editingData)) {
        if (!fields || !Object.keys(fields).length) continue;
        try {
          if (userId) {
            await scopedApi.writeUserSegment(API_URL, userId, mode, segName, fields);
          } else {
            await scopedApi.writeSegment(API_URL, mode, segName, fields);
          }
          ok += 1;
        } catch (e) {
          console.error(`[matrix] save ${segName} failed:`, e);
          fail += 1;
        }
      }
      alert(`Saved ${ok} segment(s).${fail ? ` ${fail} failed — check console.` : ''}`);
      setEditingData({});
      await fetchData();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const renderInput = (segName, field) => {
    const rawValue = getCellValue(segName, field.key);
    const isEdited = !!editingData[segName] && field.key in editingData[segName];

    const commonStyle = {
      width: '100%',
      padding: '5px 8px',
      fontSize: 12,
      border: `1px solid ${isEdited ? '#3b82f6' : 'var(--border-color)'}`,
      borderRadius: 4,
      background: isEdited ? 'rgba(59,130,246,0.08)' : 'var(--bg-primary)',
      color: 'var(--text-primary)',
      outline: 'none',
    };

    if (field.type === 'select') {
      return (
        <select
          style={commonStyle}
          value={rawValue ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            const opt = field.options?.find(o => String(o.v) === v);
            updateCell(segName, field.key, opt ? opt.v : (v === '' ? null : v));
          }}
        >
          <option value="">—</option>
          {field.options?.map(o => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
        </select>
      );
    }
    if (field.type === 'time') {
      return (
        <input type="time" style={commonStyle} value={rawValue ?? ''}
          onChange={(e) => updateCell(segName, field.key, e.target.value || null)} />
      );
    }
    return (
      <input type="number" style={commonStyle} value={rawValue ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          updateCell(segName, field.key, v === '' ? null : Number(v));
        }} />
    );
  };

  const orderedCategories = useMemo(() => SETTING_CATEGORIES.map(c => ({
    ...c,
    fields: (CATEGORY_FIELDS[c.id] || []).filter(f => !f.scriptTabOnly),
  })), []);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.topbar}>
        <div>
          <h2 style={{ margin: 0 }}>{label} Segment Settings</h2>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Edit cells inline. Blue-bordered cells have unsaved edits. Click <strong>Save</strong> to push to every user in your scope.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {scope && (
            <div style={styles.scopeBadge}>Scope: {scope.role} · {scope.affectedUserCount ?? 'all'} user(s)</div>
          )}
          <select
            value={scrollToGroup}
            onChange={(e) => {
              setScrollToGroup(e.target.value);
              if (e.target.value) setSettingCategory(e.target.value);
            }}
            style={styles.groupSelect}
          >
            <option value="">Scroll to group…</option>
            {SETTING_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <button
            onClick={saveAllEdits}
            disabled={saving || !editCount}
            style={{ ...styles.saveBtn, opacity: (saving || !editCount) ? 0.5 : 1 }}
          >
            {saving ? 'Saving…' : `Save ${editCount} Edit${editCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {/* Category nav */}
      <div style={styles.catNav}>
        {orderedCategories.map(c => (
          <button
            key={c.id}
            onClick={() => setSettingCategory(c.id)}
            style={{ ...styles.catBtn, ...(settingCategory === c.id ? styles.catBtnActive : null) }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : (
        <div style={styles.scroller}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.segmentHeader, left: 0, zIndex: 6 }}>Segment</th>
                {orderedCategories.map(c => {
                  const visibleCount = c.fields.length;
                  if (!visibleCount) return null;
                  return (
                    <th key={c.id} colSpan={visibleCount}
                      style={{
                        ...styles.groupHeader,
                        background: settingCategory === c.id ? 'rgba(59,130,246,0.15)' : 'var(--bg-secondary)',
                        color: settingCategory === c.id ? '#3b82f6' : 'var(--text-primary)',
                      }}
                    >
                      {c.label}
                    </th>
                  );
                })}
              </tr>
              <tr>
                <th style={{ ...styles.segmentHeader2, left: 0, zIndex: 5 }}></th>
                {orderedCategories.flatMap(c =>
                  c.fields.map(f => (
                    <th key={`${c.id}-${f.key}`} style={styles.fieldHeader} title={f.label}>
                      {f.label}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {NETTING_SEGMENTS.map(seg => {
                const segDoc = segmentByName[seg.code];
                if (!segDoc) return null; // segment not enabled
                return (
                  <tr key={seg.code}>
                    <td style={{ ...styles.segmentCell, left: 0, zIndex: 2 }}>
                      <div style={{ fontWeight: 600 }}>{seg.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace' }}>{seg.code}</div>
                    </td>
                    {orderedCategories.flatMap(c =>
                      c.fields.map(f => {
                        const na = isFieldNA(seg, c.id, f);
                        return (
                          <td key={`${seg.code}-${c.id}-${f.key}`} style={styles.cell}>
                            {na ? (
                              <span style={styles.na}>N/A</span>
                            ) : (
                              renderInput(seg.code, f)
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { padding: 16 },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  scopeBadge: { padding: '6px 10px', background: 'rgba(59,130,246,0.12)', color: '#3b82f6', borderRadius: 8, fontSize: 12, fontWeight: 600 },
  groupSelect: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12 },
  saveBtn: { padding: '8px 14px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  catNav: { display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)' },
  catBtn: { padding: '7px 12px', fontSize: 12, fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', borderBottom: '2px solid transparent' },
  catBtnActive: { color: '#3b82f6', borderBottomColor: '#3b82f6' },
  errorBox: { padding: 10, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', marginBottom: 12, fontSize: 13 },
  empty: { padding: 24, textAlign: 'center', color: 'var(--text-secondary)' },

  scroller: { overflow: 'auto', maxHeight: 'calc(100vh - 300px)', border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)' },
  table: { borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, width: 'max-content' },

  segmentHeader: { position: 'sticky', top: 0, padding: '8px 12px', textAlign: 'left', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', minWidth: 160, fontSize: 12, fontWeight: 600 },
  segmentHeader2: { position: 'sticky', top: 37, padding: '6px 12px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', minWidth: 160 },
  groupHeader: { position: 'sticky', top: 0, padding: '8px 12px', textAlign: 'center', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', fontSize: 12, fontWeight: 700, letterSpacing: 0.3 },
  fieldHeader: { position: 'sticky', top: 37, padding: '6px 10px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', minWidth: 130 },

  segmentCell: { position: 'sticky', padding: '8px 12px', background: 'var(--bg-primary)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', minWidth: 160 },
  cell: { padding: 4, borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', minWidth: 130 },
  na: { display: 'inline-block', fontSize: 10, color: 'var(--text-secondary)', fontStyle: 'italic', opacity: 0.6 },
};
