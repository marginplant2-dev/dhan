import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import scopedApi from './scopedApi';
import ScopedUserSearch from './ScopedUserSearch';
import SymbolPicker from './SymbolPicker';

/**
 * Scoped segment settings page — mirrors the super-admin layout:
 *
 *   Top-level tabs: Segments  |  Scripts
 *     Segments → list → Open a segment → My / User-Specific sub-tabs
 *     Scripts  → list of script overrides + Add Script → Open → My / User-Specific
 *
 * Bulk writes fan out to every user in the admin's scope; per-user writes hit
 * one user. Both go through /api/admin/scoped/* with server-side scope guards.
 *
 * Props
 *   mode: 'netting' | 'hedging'
 */
const SECTIONS = [
  {
    key: 'leverage', title: 'Leverage',
    fields: [
      { name: 'maxLeverage', label: 'Max Leverage', type: 'number' },
      { name: 'defaultLeverage', label: 'Default Leverage', type: 'number' },
      { name: 'fixedLeverage', label: 'Fixed Leverage', type: 'number' },
    ],
  },
  {
    key: 'margin', title: 'Margin %',
    fields: [
      { name: 'intradayMargin', label: 'Intraday Margin %', type: 'number' },
      { name: 'overnightMargin', label: 'Overnight Margin %', type: 'number' },
      { name: 'optionBuyIntraday', label: 'Option Buy Intraday %', type: 'number' },
      { name: 'optionBuyOvernight', label: 'Option Buy Overnight %', type: 'number' },
      { name: 'optionSellIntraday', label: 'Option Sell Intraday %', type: 'number' },
      { name: 'optionSellOvernight', label: 'Option Sell Overnight %', type: 'number' },
    ],
  },
  {
    key: 'commission', title: 'Commission',
    fields: [
      { name: 'commission', label: 'Commission', type: 'number' },
      { name: 'commissionType', label: 'Commission Type', type: 'select', options: ['per_lot', 'per_trade', 'percent', 'points'] },
      { name: 'chargeOn', label: 'Charge On', type: 'select', options: ['entry', 'exit', 'both'] },
      { name: 'optionBuyCommission', label: 'Option Buy Commission', type: 'number' },
      { name: 'optionSellCommission', label: 'Option Sell Commission', type: 'number' },
    ],
  },
  {
    key: 'swap', title: 'Swap',
    fields: [
      { name: 'swapType', label: 'Swap Type', type: 'select', options: ['points', 'percent', 'money'] },
      { name: 'swapLong', label: 'Swap Long', type: 'number' },
      { name: 'swapShort', label: 'Swap Short', type: 'number' },
      { name: 'tripleSwapDay', label: 'Triple Swap Day', type: 'select', options: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
      { name: 'swapTime', label: 'Swap Time (HH:MM)', type: 'text' },
    ],
  },
  {
    key: 'spread', title: 'Spread',
    fields: [
      { name: 'spreadType', label: 'Spread Type', type: 'select', options: ['fixed', 'floating', 'markup'] },
      { name: 'spreadPips', label: 'Spread Pips', type: 'number' },
      { name: 'markupPips', label: 'Markup Pips', type: 'number' },
      { name: 'limitAwayPoints', label: 'Limit Away Points', type: 'number' },
      { name: 'limitAwayPercent', label: 'Limit Away %', type: 'number' },
    ],
  },
  {
    key: 'limits', title: 'Limits',
    fields: [
      { name: 'minLots', label: 'Min Lots', type: 'number' },
      { name: 'maxLots', label: 'Max Lots', type: 'number' },
      { name: 'orderLots', label: 'Order Lots', type: 'number' },
      { name: 'maxExchangeLots', label: 'Max Exchange Lots', type: 'number' },
      { name: 'maxPositionsPerSymbol', label: 'Max Positions / Symbol', type: 'number' },
      { name: 'maxTotalPositions', label: 'Max Total Positions', type: 'number' },
    ],
  },
  {
    key: 'exitOnly', title: 'Exit-only Mode',
    fields: [{ name: 'exitOnlyMode', label: 'Exit-only Mode (close-only for scoped users)', type: 'checkbox' }],
  },
];

function SectionField({ field, value, onChange }) {
  const common = { style: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 } };
  if (field.type === 'checkbox') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{field.label}</span>
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">—</option>
        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input
      {...common}
      type={field.type}
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        if (field.type === 'number') onChange(v === '' ? null : Number(v));
        else onChange(v === '' ? null : v);
      }}
    />
  );
}

function EditForm({ form, setForm, segmentDefault, onSaveSection, onClear, saving, clearLabel }) {
  const onFieldChange = (key) => (value) => setForm(prev => ({ ...prev, [key]: value }));
  return (
    <>
      {SECTIONS.map(section => (
        <div key={section.key} style={styles.section}>
          <div style={styles.sectionHeader}>
            <h4 style={{ margin: 0 }}>{section.title}</h4>
            <button onClick={() => onSaveSection(section)} disabled={saving} style={styles.saveBtn}>
              {saving ? 'Saving…' : `Save ${section.title}`}
            </button>
          </div>
          <div style={styles.grid}>
            {section.fields.map(f => (
              <div key={f.name} style={styles.gridItem}>
                <label style={styles.label}>{f.label}</label>
                <SectionField field={f} value={form[f.name]} onChange={onFieldChange(f.name)} />
                {segmentDefault && segmentDefault[f.name] != null && (
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                    default: {String(segmentDefault[f.name])}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {onClear && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button onClick={onClear} disabled={saving} style={styles.dangerBtn}>{clearLabel || 'Clear'}</button>
        </div>
      )}
    </>
  );
}

function seedForm(segment, override) {
  const seed = { ...(segment || {}), ...(override || {}) };
  const slim = {};
  for (const section of SECTIONS) for (const f of section.fields) slim[f.name] = seed[f.name] ?? null;
  return slim;
}

function pickSectionFields(form, section) {
  const payload = {};
  for (const f of section.fields) if (form[f.name] !== null && form[f.name] !== undefined) payload[f.name] = form[f.name];
  return payload;
}

/* ──────────────────────── SEGMENT editor ─────────────────────────────── */

function SegmentEditor({ API_URL, mode, segmentName, onBack }) {
  const [tab, setTab] = useState('my');
  const [error, setError] = useState(null);

  const [myDetail, setMyDetail] = useState(null);
  const [myForm, setMyForm] = useState({});
  const [mySaving, setMySaving] = useState(false);

  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [userForm, setUserForm] = useState({});
  const [userSaving, setUserSaving] = useState(false);

  const loadMy = useCallback(async () => {
    setError(null);
    try {
      const r = await scopedApi.readSegment(API_URL, mode, segmentName);
      setMyDetail(r);
      setMyForm(seedForm(r.segment, r.currentOverride));
    } catch (e) { setError(e.message); }
  }, [API_URL, mode, segmentName]);

  useEffect(() => { loadMy(); }, [loadMy]);

  const saveMy = async (section) => {
    setMySaving(true); setError(null);
    try {
      const payload = pickSectionFields(myForm, section);
      const r = await scopedApi.writeSegment(API_URL, mode, segmentName, payload);
      alert(`Saved '${section.title}' for ${r.affectedUsers} user(s).`);
      await loadMy();
    } catch (e) { setError(e.message); } finally { setMySaving(false); }
  };
  const clearMy = async () => {
    if (!confirm(`Reset ALL overrides for '${segmentName}'?`)) return;
    setMySaving(true); setError(null);
    try {
      const r = await scopedApi.clearSegment(API_URL, mode, segmentName);
      alert(`Removed ${r.deletedCount} override row(s).`);
      await loadMy();
    } catch (e) { setError(e.message); } finally { setMySaving(false); }
  };

  useEffect(() => {
    if (!selectedUser) { setUserDetail(null); setUserForm({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await scopedApi.readUserSegment(API_URL, selectedUser._id, mode, segmentName);
        if (cancelled) return;
        setUserDetail(r);
        setUserForm(seedForm(r.segment || myDetail?.segment, r.currentOverride));
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, [selectedUser, API_URL, mode, segmentName, myDetail]);

  const saveUser = async (section) => {
    if (!selectedUser) return;
    setUserSaving(true); setError(null);
    try {
      const payload = pickSectionFields(userForm, section);
      const r = await scopedApi.writeUserSegment(API_URL, selectedUser._id, mode, segmentName, payload);
      alert(`Saved '${section.title}' for ${selectedUser.name || selectedUser.oderId}.`);
      const fresh = await scopedApi.readUserSegment(API_URL, selectedUser._id, mode, segmentName);
      setUserDetail(fresh);
      setUserForm(seedForm(fresh.segment || myDetail?.segment, fresh.currentOverride));
      void r;
    } catch (e) { setError(e.message); } finally { setUserSaving(false); }
  };
  const clearUserOverride = async () => {
    if (!selectedUser) return;
    if (!confirm(`Clear '${segmentName}' override for ${selectedUser.name || selectedUser.oderId}?`)) return;
    setUserSaving(true); setError(null);
    try {
      await scopedApi.clearUserSegment(API_URL, selectedUser._id, mode, segmentName);
      const fresh = await scopedApi.readUserSegment(API_URL, selectedUser._id, mode, segmentName);
      setUserDetail(fresh);
      setUserForm(seedForm(fresh.segment || myDetail?.segment, fresh.currentOverride));
    } catch (e) { setError(e.message); } finally { setUserSaving(false); }
  };

  return (
    <div>
      <div style={styles.subHeader}>
        <button onClick={onBack} style={styles.backBtn}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Segment</div>
          <h3 style={{ margin: '2px 0' }}>{segmentName}</h3>
          {myDetail && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {myDetail.overriddenUserCount || 0} of your users overridden ·
              {' '}{myDetail.lockedByUserExplicitCount || 0} locked by super-admin
            </div>
          )}
        </div>
      </div>
      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.tabs}>
        <button onClick={() => setTab('my')} style={{ ...styles.tab, ...(tab === 'my' ? styles.tabActive : null) }}>My Settings</button>
        <button onClick={() => setTab('user')} style={{ ...styles.tab, ...(tab === 'user' ? styles.tabActive : null) }}>User-Specific</button>
      </div>

      {tab === 'my' && myDetail && (
        <EditForm form={myForm} setForm={setMyForm} segmentDefault={myDetail.segment}
          onSaveSection={saveMy} onClear={clearMy} clearLabel="Reset All Overrides" saving={mySaving} />
      )}
      {tab === 'user' && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.label}>Pick a user from your scope</label>
            <ScopedUserSearch API_URL={API_URL} selected={selectedUser} onSelect={setSelectedUser} />
          </div>
          {selectedUser ? (
            userDetail && (
              <EditForm form={userForm} setForm={setUserForm}
                segmentDefault={userDetail.segment || myDetail?.segment}
                onSaveSection={saveUser} onClear={clearUserOverride}
                clearLabel={`Clear override for ${selectedUser.name || selectedUser.oderId}`}
                saving={userSaving} />
            )
          ) : (
            <div style={styles.emptyPrompt}>Search and pick a user to edit their per-user override.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── SCRIPT editor ──────────────────────────────── */

function ScriptEditor({ API_URL, mode, segmentName, symbol, onBack }) {
  const [tab, setTab] = useState('my');
  const [error, setError] = useState(null);

  const [myDetail, setMyDetail] = useState(null);
  const [myForm, setMyForm] = useState({});
  const [mySaving, setMySaving] = useState(false);

  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [userForm, setUserForm] = useState({});
  const [userSaving, setUserSaving] = useState(false);

  const loadMy = useCallback(async () => {
    setError(null);
    try {
      const r = await scopedApi.readScript(API_URL, mode, segmentName, symbol);
      setMyDetail(r);
      setMyForm(seedForm(r.segment, r.currentOverride));
    } catch (e) { setError(e.message); }
  }, [API_URL, mode, segmentName, symbol]);
  useEffect(() => { loadMy(); }, [loadMy]);

  const saveMy = async (section) => {
    setMySaving(true); setError(null);
    try {
      const payload = pickSectionFields(myForm, section);
      const r = await scopedApi.writeScript(API_URL, mode, segmentName, symbol, payload);
      alert(`Saved '${section.title}' for ${r.affectedUsers} user(s).`);
      await loadMy();
    } catch (e) { setError(e.message); } finally { setMySaving(false); }
  };
  const clearMy = async () => {
    if (!confirm(`Remove '${segmentName}/${symbol}' script override for all scoped users?`)) return;
    setMySaving(true); setError(null);
    try {
      const r = await scopedApi.clearScript(API_URL, mode, segmentName, symbol);
      alert(`Removed ${r.deletedCount} row(s).`);
      onBack();
    } catch (e) { setError(e.message); } finally { setMySaving(false); }
  };

  useEffect(() => {
    if (!selectedUser) { setUserDetail(null); setUserForm({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await scopedApi.readUserScript(API_URL, selectedUser._id, mode, segmentName, symbol);
        if (cancelled) return;
        setUserDetail(r);
        setUserForm(seedForm(r.segment || myDetail?.segment, r.currentOverride));
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, [selectedUser, API_URL, mode, segmentName, symbol, myDetail]);

  const saveUser = async (section) => {
    if (!selectedUser) return;
    setUserSaving(true); setError(null);
    try {
      const payload = pickSectionFields(userForm, section);
      await scopedApi.writeUserScript(API_URL, selectedUser._id, mode, segmentName, symbol, payload);
      alert(`Saved '${section.title}' for ${selectedUser.name || selectedUser.oderId}.`);
      const fresh = await scopedApi.readUserScript(API_URL, selectedUser._id, mode, segmentName, symbol);
      setUserDetail(fresh);
      setUserForm(seedForm(fresh.segment || myDetail?.segment, fresh.currentOverride));
    } catch (e) { setError(e.message); } finally { setUserSaving(false); }
  };
  const clearUserOverride = async () => {
    if (!selectedUser) return;
    if (!confirm(`Clear '${segmentName}/${symbol}' for ${selectedUser.name || selectedUser.oderId}?`)) return;
    setUserSaving(true); setError(null);
    try {
      await scopedApi.clearUserScript(API_URL, selectedUser._id, mode, segmentName, symbol);
      const fresh = await scopedApi.readUserScript(API_URL, selectedUser._id, mode, segmentName, symbol);
      setUserDetail(fresh);
      setUserForm(seedForm(fresh.segment || myDetail?.segment, fresh.currentOverride));
    } catch (e) { setError(e.message); } finally { setUserSaving(false); }
  };

  return (
    <div>
      <div style={styles.subHeader}>
        <button onClick={onBack} style={styles.backBtn}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Script override</div>
          <h3 style={{ margin: '2px 0' }}><code style={{ fontSize: 18 }}>{segmentName} / {symbol}</code></h3>
          {myDetail && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {myDetail.overriddenUserCount || 0} of your users overridden on this script
            </div>
          )}
        </div>
      </div>
      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.tabs}>
        <button onClick={() => setTab('my')} style={{ ...styles.tab, ...(tab === 'my' ? styles.tabActive : null) }}>My Settings</button>
        <button onClick={() => setTab('user')} style={{ ...styles.tab, ...(tab === 'user' ? styles.tabActive : null) }}>User-Specific</button>
      </div>

      {tab === 'my' && myDetail && (
        <EditForm form={myForm} setForm={setMyForm} segmentDefault={myDetail.segment}
          onSaveSection={saveMy} onClear={myDetail.currentOverride ? clearMy : null}
          clearLabel="Remove Script Override" saving={mySaving} />
      )}
      {tab === 'user' && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.label}>Pick a user from your scope</label>
            <ScopedUserSearch API_URL={API_URL} selected={selectedUser} onSelect={setSelectedUser} />
          </div>
          {selectedUser ? (
            userDetail && (
              <EditForm form={userForm} setForm={setUserForm}
                segmentDefault={userDetail.segment || myDetail?.segment}
                onSaveSection={saveUser}
                onClear={userDetail.currentOverride ? clearUserOverride : null}
                clearLabel={`Clear for ${selectedUser.name || selectedUser.oderId}`}
                saving={userSaving} />
            )
          ) : (
            <div style={styles.emptyPrompt}>Search and pick a user to edit their per-user script override.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── Top-level page ─────────────────────────────── */

/**
 * Main page. When `view` is passed, hides the top-level tab switcher and
 * shows only that view — used by the sidebar sub-menu routes:
 *   view='segments' → Segment Settings page
 *   view='scripts'  → Script Settings page
 *   (no view)       → both tabs (legacy / fallback)
 * User Settings is a separate component (ScopedSegmentUserSettings) because
 * the UX differs significantly.
 */
export default function ScopedSegmentOverrides({ mode, view }) {
  const { API_URL } = useOutletContext();
  const [topTab, setTopTab] = useState(view || 'segments');
  // When the `view` prop is set, pin the tab and hide the switcher.
  useEffect(() => { if (view) setTopTab(view); }, [view]);

  // Segment list
  const [segments, setSegments] = useState([]);
  const [scope, setScope] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openSegment, setOpenSegment] = useState(null); // segment name being edited

  // Script list
  const [scripts, setScripts] = useState([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [openScript, setOpenScript] = useState(null); // { segmentName, symbol }
  const [adding, setAdding] = useState(false); // show add-script picker
  const [pendingSegment, setPendingSegment] = useState('');
  const [pendingSymbol, setPendingSymbol] = useState(null);

  const label = mode === 'hedging' ? 'Hedging' : 'Netting';

  const fetchSegments = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await scopedApi.listSegments(API_URL, mode);
      setSegments(r.segments || []);
      setScope(r.scope || null);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [API_URL, mode]);

  const fetchScripts = useCallback(async () => {
    setScriptsLoading(true); setError(null);
    try {
      const r = await scopedApi.listScripts(API_URL, mode);
      setScripts(r.scripts || []);
    } catch (e) { setError(e.message); } finally { setScriptsLoading(false); }
  }, [API_URL, mode]);

  useEffect(() => { fetchSegments(); }, [fetchSegments]);
  useEffect(() => { if (topTab === 'scripts') fetchScripts(); }, [topTab, fetchScripts]);

  const segmentExchange = (name) => {
    const s = segments.find(x => x.name === name);
    return s?.exchange || name;
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={{ margin: 0 }}>{label} Settings</h2>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Overrides apply only to users in your scope. Super-admin per-user overrides are preserved.
          </div>
        </div>
        {scope && (
          <div style={styles.scopeBadge}>Scope: {scope.role} · {scope.affectedUserCount ?? 'all'} user(s)</div>
        )}
      </div>

      {!openSegment && !openScript && !view && (
        <div style={styles.tabs}>
          <button onClick={() => setTopTab('segments')} style={{ ...styles.tab, ...(topTab === 'segments' ? styles.tabActive : null) }}>Segments</button>
          <button onClick={() => setTopTab('scripts')} style={{ ...styles.tab, ...(topTab === 'scripts' ? styles.tabActive : null) }}>Script Overrides</button>
        </div>
      )}

      {error && <div style={styles.errorBox}>{error}</div>}

      {/* ——— Segment list ——— */}
      {topTab === 'segments' && !openSegment && (
        <div style={styles.tableWrap}>
          {loading ? (
            <div style={styles.empty}>Loading…</div>
          ) : segments.length === 0 ? (
            <div style={styles.empty}>No {label.toLowerCase()} segments found.</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Segment</th>
                  <th style={styles.th}>Default Leverage</th>
                  <th style={styles.th}>Default Commission</th>
                  <th style={styles.th}>Overridden Users</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {segments.map(s => (
                  <tr key={s._id} style={styles.tr}>
                    <td style={styles.td}><strong>{s.name}</strong></td>
                    <td style={styles.td}>{s.defaultLeverage ?? s.maxLeverage ?? '—'}</td>
                    <td style={styles.td}>{s.commission ?? '—'} {s.commissionType || ''}</td>
                    <td style={styles.td}>
                      {s.overriddenUserCount > 0
                        ? <span style={styles.activeBadge}>{s.overriddenUserCount}</span>
                        : <span style={{ color: 'var(--text-secondary)' }}>0</span>}
                    </td>
                    <td style={styles.td}>
                      <button onClick={() => setOpenSegment(s.name)} style={styles.editBtn}>Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {topTab === 'segments' && openSegment && (
        <SegmentEditor API_URL={API_URL} mode={mode} segmentName={openSegment}
          onBack={() => { setOpenSegment(null); fetchSegments(); }} />
      )}

      {/* ——— Script overrides ——— */}
      {topTab === 'scripts' && !openScript && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Per-symbol overrides inside a segment (e.g. <code>NSE_EQ / RELIANCE</code>).
            </div>
            <button onClick={() => setAdding(v => !v)} style={styles.primaryBtn}>
              {adding ? 'Cancel' : '+ Add Script'}
            </button>
          </div>

          {adding && (
            <div style={styles.addCard}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={styles.label}>Segment</label>
                  <select
                    value={pendingSegment}
                    onChange={(e) => { setPendingSegment(e.target.value); setPendingSymbol(null); }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }}
                  >
                    <option value="">Choose…</option>
                    {segments.map(s => <option key={s._id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Symbol</label>
                  {pendingSegment ? (
                    <SymbolPicker
                      API_URL={API_URL}
                      exchange={segmentExchange(pendingSegment)}
                      segmentName={pendingSegment}
                      value={pendingSymbol}
                      onChange={setPendingSymbol}
                    />
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Choose a segment first</div>
                  )}
                </div>
                <button
                  disabled={!pendingSegment || !pendingSymbol}
                  onClick={() => {
                    setOpenScript({ segmentName: pendingSegment, symbol: pendingSymbol });
                    setAdding(false); setPendingSegment(''); setPendingSymbol(null);
                  }}
                  style={{ ...styles.primaryBtn, opacity: (!pendingSegment || !pendingSymbol) ? 0.5 : 1 }}
                >
                  Open Editor →
                </button>
              </div>
            </div>
          )}

          <div style={styles.tableWrap}>
            {scriptsLoading ? (
              <div style={styles.empty}>Loading…</div>
            ) : scripts.length === 0 ? (
              <div style={styles.empty}>No script overrides yet. Click <strong>+ Add Script</strong> to create one.</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Segment</th>
                    <th style={styles.th}>Symbol</th>
                    <th style={styles.th}>Leverage</th>
                    <th style={styles.th}>Commission</th>
                    <th style={styles.th}>Users</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {scripts.map((s, idx) => (
                    <tr key={`${s.segmentName}-${s.symbol}-${idx}`} style={styles.tr}>
                      <td style={styles.td}><strong>{s.segmentName}</strong></td>
                      <td style={styles.td}><code>{s.symbol}</code></td>
                      <td style={styles.td}>{s.values.defaultLeverage ?? '—'}</td>
                      <td style={styles.td}>{s.values.commission ?? '—'} {s.values.commissionType || ''}</td>
                      <td style={styles.td}><span style={styles.activeBadge}>{s.userCount}</span></td>
                      <td style={styles.td}>
                        <button onClick={() => setOpenScript({ segmentName: s.segmentName, symbol: s.symbol })} style={styles.editBtn}>Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
      {topTab === 'scripts' && openScript && (
        <ScriptEditor API_URL={API_URL} mode={mode}
          segmentName={openScript.segmentName} symbol={openScript.symbol}
          onBack={() => { setOpenScript(null); fetchScripts(); }} />
      )}
    </div>
  );
}

const styles = {
  page: { padding: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  scopeBadge: { padding: '6px 10px', background: 'rgba(59,130,246,0.12)', color: '#3b82f6', borderRadius: 8, fontSize: 12, fontWeight: 600 },
  errorBox: { padding: 10, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', marginBottom: 12, fontSize: 13 },

  tabs: { display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border-color)' },
  tab: { padding: '8px 14px', fontSize: 13, fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', borderBottom: '2px solid transparent' },
  tabActive: { color: '#3b82f6', borderBottomColor: '#3b82f6' },

  tableWrap: { border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-secondary)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' },
  tr: { borderBottom: '1px solid var(--border-color)' },
  td: { padding: '10px 14px', fontSize: 13 },
  activeBadge: { padding: '2px 8px', background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  empty: { padding: 24, textAlign: 'center', color: 'var(--text-secondary)' },
  editBtn: { padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' },
  primaryBtn: { padding: '7px 14px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 },

  subHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  backBtn: { padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' },
  dangerBtn: { padding: '6px 12px', borderRadius: 6, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 600, fontSize: 12 },

  section: { border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', marginBottom: 12, overflow: 'hidden' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)' },
  saveBtn: { padding: '6px 12px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, padding: 14 },
  gridItem: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 },

  addCard: { padding: 14, border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', marginBottom: 12 },
  emptyPrompt: { padding: 24, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: 10 },
};
