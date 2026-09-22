import { useMemo, useState } from 'react';
import {
  PERMISSION_GROUPS,
  PERMISSION_META,
  ROLE_PRESETS,
  withDependencies,
  cascadeUncheck,
  countChecked,
  emptyPermissions,
  isPermissionEligible,
} from './adminPermissionCatalog';

/**
 * Grouped permission picker — theme-aware (uses the same --bg-primary /
 * --text-primary / --border-color tokens as the rest of the admin UI).
 *
 * Props
 *   value      : { [key]: boolean }
 *   onChange   : (next) => void
 *   role       : 'super_admin' | 'sub_admin' | 'broker' | 'bank_user' (preset hint only)
 *   diffBase   : { [key]: boolean } | null — original perms for diff badges
 *   readOnly   : boolean
 */
export default function PermissionPicker({ value, onChange, role, diffBase = null, readOnly = false }) {
  const [collapsed, setCollapsed] = useState({});
  const [filter, setFilter] = useState('');

  const toggleGroup = (name) => setCollapsed((c) => ({ ...c, [name]: !c[name] }));

  // Strip any permission keys not allowed for the target role before emitting.
  const enforceEligibility = (perms) => {
    const out = { ...perms };
    for (const k of Object.keys(out)) {
      if (!isPermissionEligible(role, k)) out[k] = false;
    }
    return out;
  };

  const applyPreset = (presetName) => {
    const preset = ROLE_PRESETS[presetName];
    if (!preset) return;
    onChange(enforceEligibility(withDependencies(preset)));
  };

  const togglePermission = (key) => {
    if (readOnly) return;
    if (!isPermissionEligible(role, key)) return;  // no-op on locked keys
    const nextVal = !value[key];
    const next = nextVal
      ? withDependencies({ ...value, [key]: true })
      : cascadeUncheck(value, key);
    onChange(enforceEligibility(next));
  };

  const toggleGroupAll = (group) => {
    if (readOnly) return;
    // Count only eligible keys for the "all checked" signal.
    const eligibleKeys = group.keys.filter(k => isPermissionEligible(role, k));
    if (eligibleKeys.length === 0) return;
    const onCount = eligibleKeys.filter(k => value[k]).length;
    const enable = onCount < eligibleKeys.length;
    let next = { ...value };
    for (const k of eligibleKeys) next[k] = enable;
    next = enable ? withDependencies(next) : next;
    onChange(enforceEligibility(next));
  };

  const diffState = (key) => {
    if (!diffBase) return null;
    const before = !!diffBase[key];
    const after = !!value[key];
    if (before === after) return null;
    return after ? 'added' : 'removed';
  };

  const lc = filter.trim().toLowerCase();
  const matchesFilter = (key) => {
    if (!lc) return true;
    const meta = PERMISSION_META[key];
    return (
      key.toLowerCase().includes(lc) ||
      (meta?.label || '').toLowerCase().includes(lc) ||
      (meta?.hint || '').toLowerCase().includes(lc)
    );
  };

  const totalChecked = useMemo(
    () => Object.values(value || {}).filter(Boolean).length,
    [value]
  );

  const expandAll = () => setCollapsed({});
  const collapseAll = () => {
    const next = {};
    for (const g of PERMISSION_GROUPS) next[g.name] = true;
    setCollapsed(next);
  };

  return (
    <div style={styles.root}>
      {/* Top bar */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <strong style={styles.headerTitle}>Permissions</strong>
          <span style={styles.countBadge}>{totalChecked} enabled</span>
        </div>
        {!readOnly && (
          <div style={styles.headerRight}>
            <input
              type="text"
              placeholder="Search permissions…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={styles.filterInput}
            />
            <select
              onChange={(e) => { applyPreset(e.target.value); e.target.value = ''; }}
              defaultValue=""
              style={styles.presetSelect}
              title="Apply role preset"
            >
              <option value="" disabled>Apply preset…</option>
              <option value="super_admin">Super Admin (all)</option>
              <option value="sub_admin">Sub-Admin default</option>
              <option value="broker">Broker default</option>
              <option value="bank_user">Bank User default</option>
            </select>
            <button type="button" onClick={() => onChange(emptyPermissions())} style={styles.secondaryBtn}>
              Clear
            </button>
          </div>
        )}
      </div>

      {!readOnly && (
        <div style={styles.toolbar}>
          <button type="button" onClick={expandAll} style={styles.linkBtn}>Expand all</button>
          <span style={styles.toolbarDivider}>·</span>
          <button type="button" onClick={collapseAll} style={styles.linkBtn}>Collapse all</button>
          {lc && (
            <span style={styles.toolbarHint}>
              filtering: <code style={styles.inlineCode}>{filter}</code>
            </span>
          )}
        </div>
      )}

      {/* Groups */}
      <div style={styles.groups}>
        {PERMISSION_GROUPS.map((group) => {
          const { on, total } = countChecked(value, group);
          const isCollapsed = !!collapsed[group.name];
          const visibleKeys = group.keys.filter(matchesFilter);
          if (lc && visibleKeys.length === 0) return null;
          const allOn = on === total && total > 0;
          const someOn = on > 0 && on < total;

          return (
            <div key={group.name} style={styles.group}>
              <div style={styles.groupHeader}>
                <button type="button" onClick={() => toggleGroup(group.name)} style={styles.groupTitle}>
                  <span style={styles.caret}>{isCollapsed ? '▸' : '▾'}</span>
                  <span style={styles.groupName}>{group.name}</span>
                  <span
                    style={{
                      ...styles.groupCount,
                      ...(allOn ? styles.groupCountAll : someOn ? styles.groupCountSome : null),
                    }}
                  >
                    {on}/{total}
                  </span>
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => toggleGroupAll(group)}
                    style={{ ...styles.groupAllBtn, color: allOn ? '#ef4444' : '#3b82f6' }}
                  >
                    {allOn ? 'Uncheck all' : 'Check all'}
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <div style={styles.groupRows}>
                  {visibleKeys.map((key) => {
                    const meta = PERMISSION_META[key] || { label: key };
                    const diff = diffState(key);
                    const eligible = isPermissionEligible(role, key);
                    const isOn = !!value[key] && eligible;
                    const disabled = readOnly || !eligible;
                    return (
                      <label
                        key={key}
                        title={!eligible ? `Not available for '${role}' — forbidden by role policy` : undefined}
                        style={{
                          ...styles.row,
                          ...(isOn ? styles.rowOn : null),
                          ...(!eligible ? styles.rowLocked : null),
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          opacity: readOnly ? 0.85 : 1,
                          borderLeftColor:
                            diff === 'added' ? '#10b981'
                            : diff === 'removed' ? '#ef4444'
                            : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => togglePermission(key)}
                          disabled={disabled}
                          style={styles.checkbox}
                        />
                        <div style={styles.rowBody}>
                          <div style={styles.rowLabel}>
                            <span style={!eligible ? { textDecoration: 'line-through', opacity: 0.6 } : null}>
                              {meta.label}
                            </span>
                            {!eligible && <span style={styles.lockBadge}>🔒 not allowed</span>}
                            {diff === 'added' && <span style={styles.diffAdd}>added</span>}
                            {diff === 'removed' && <span style={styles.diffRem}>removed</span>}
                          </div>
                          {meta.hint && <div style={styles.rowHint}>{meta.hint}</div>}
                          <code style={styles.rowKey}>{key}</code>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────
 * Everything uses the project's theme tokens. Accent tints are rgba overlays
 * so they read correctly in both light and dark modes.
 * ──────────────────────────────────────────────────────────────────────── */

const BLUE = '#3b82f6';
const BLUE_TINT = 'rgba(59,130,246,0.08)';
const ROW_HOVER = 'rgba(127,127,127,0.06)';

const styles = {
  root: {
    border: '1px solid var(--border-color)',
    borderRadius: 10,
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
    borderBottom: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)',
    flexWrap: 'wrap',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 14, color: 'var(--text-primary)' },
  countBadge: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 12,
    background: BLUE_TINT,
    color: BLUE,
    fontWeight: 600,
    border: '1px solid rgba(59,130,246,0.25)',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  filterInput: {
    padding: '7px 10px',
    fontSize: 12,
    borderRadius: 6,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    width: 180,
    outline: 'none',
  },
  presetSelect: {
    padding: '7px 10px',
    fontSize: 12,
    borderRadius: 6,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '7px 12px',
    fontSize: 12,
    borderRadius: 6,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontWeight: 500,
  },

  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderBottom: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    fontSize: 11,
  },
  linkBtn: {
    background: 'transparent',
    border: 'none',
    color: BLUE,
    fontSize: 11,
    cursor: 'pointer',
    padding: 0,
    fontWeight: 500,
  },
  toolbarDivider: { color: 'var(--text-secondary)', opacity: 0.5 },
  toolbarHint: { marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: 11 },
  inlineCode: {
    fontFamily: 'ui-monospace, monospace',
    padding: '1px 5px',
    borderRadius: 3,
    background: ROW_HOVER,
  },

  groups: { padding: 8, maxHeight: 520, overflowY: 'auto' },
  group: {
    borderRadius: 8,
    marginBottom: 6,
    border: '1px solid var(--border-color)',
    overflow: 'hidden',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'var(--bg-secondary)',
    gap: 8,
  },
  groupTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    flex: 1,
    textAlign: 'left',
  },
  caret: { opacity: 0.55, fontFamily: 'ui-monospace, monospace', fontSize: 12 },
  groupName: { flex: 1 },
  groupCount: {
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 8,
    background: ROW_HOVER,
    color: 'var(--text-secondary)',
    fontWeight: 600,
    minWidth: 32,
    textAlign: 'center',
  },
  groupCountSome: { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  groupCountAll:  { background: 'rgba(16,185,129,0.15)',  color: '#10b981' },
  groupAllBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '2px 6px',
  },

  groupRows: {
    padding: 4,
    background: 'var(--bg-primary)',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '8px 10px',
    borderRadius: 6,
    borderLeft: '3px solid transparent',
    transition: 'background 120ms',
  },
  rowOn: { background: BLUE_TINT },
  rowLocked: { opacity: 0.55 },
  lockBadge: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 8,
    background: 'rgba(127,127,127,0.15)',
    color: 'var(--text-secondary)',
    fontWeight: 600,
  },
  checkbox: {
    width: 16,
    height: 16,
    marginTop: 2,
    cursor: 'pointer',
    accentColor: BLUE,
    flexShrink: 0,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  rowHint: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    marginTop: 2,
    lineHeight: 1.35,
  },
  rowKey: {
    display: 'inline-block',
    fontSize: 10,
    fontFamily: 'ui-monospace, monospace',
    color: 'var(--text-secondary)',
    opacity: 0.7,
    marginTop: 3,
    padding: '1px 5px',
    borderRadius: 3,
    background: ROW_HOVER,
  },
  diffAdd: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 8,
    background: 'rgba(16,185,129,0.15)',
    color: '#10b981',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  diffRem: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 8,
    background: 'rgba(239,68,68,0.15)',
    color: '#ef4444',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
};
