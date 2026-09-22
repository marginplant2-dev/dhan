import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import scopedApi from './scopedApi';
import ScopedUserSearch from './ScopedUserSearch';

/**
 * Copy Settings — copy one source user's overrides to one or more target users.
 *
 * Flow:
 *   1. Pick source user → fetch their snapshot (segments + scripts + risk + reorder)
 *   2. Tick what to copy (Netting segments / Netting scripts / Hedging segments / Hedging scripts / Risk / Reorder)
 *   3. Pick target user(s) and click Copy — we re-apply each picked row via the
 *      per-user scoped PUT endpoints.
 *
 * Everything routes through the existing scoped endpoints, so server-side
 * scope + permission checks still apply automatically.
 */
export default function ScopedCopySettings() {
  const { API_URL } = useOutletContext();
  const [sourceUser, setSourceUser] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [snapLoading, setSnapLoading] = useState(false);

  const [targets, setTargets] = useState([]);  // array of user objects
  const [picking, setPicking] = useState(null); // user currently in ScopedUserSearch

  const [picks, setPicks] = useState({
    nettingSegments: true,
    nettingScripts: true,
    hedgingSegments: true,
    hedgingScripts: true,
    reorder: true,
    risk: true,
  });

  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [error, setError] = useState(null);

  const loadSnapshot = async (user) => {
    setSourceUser(user);
    if (!user) { setSnapshot(null); return; }
    setSnapLoading(true); setError(null);
    try {
      const r = await scopedApi.readUserSnapshot(API_URL, user._id);
      setSnapshot(r);
    } catch (e) {
      setError(e.message);
      setSnapshot(null);
    } finally {
      setSnapLoading(false);
    }
  };

  const addTarget = (u) => {
    if (!u) return;
    if (sourceUser && String(u._id) === String(sourceUser._id)) {
      alert('Target cannot be the source user');
      return;
    }
    if (targets.some(t => String(t._id) === String(u._id))) return;
    setTargets(prev => [...prev, u]);
    setPicking(null);
  };
  const removeTarget = (id) => setTargets(prev => prev.filter(t => String(t._id) !== String(id)));

  const counts = {
    nettingSegments: (snapshot?.segments || []).filter(r => r.tradeMode === 'netting' && !r.symbol).length,
    nettingScripts:  (snapshot?.segments || []).filter(r => r.tradeMode === 'netting' &&  r.symbol).length,
    hedgingSegments: (snapshot?.segments || []).filter(r => r.tradeMode === 'hedging' && !r.symbol).length,
    hedgingScripts:  (snapshot?.segments || []).filter(r => r.tradeMode === 'hedging' &&  r.symbol).length,
    reorder: snapshot?.reorder ? 1 : 0,
    risk: snapshot?.risk ? 1 : 0,
  };

  const fieldsFromRow = (row) => {
    const copy = { ...row };
    // Drop non-value keys that shouldn't be sent back.
    for (const k of ['_id', 'userId', 'oderId', 'segmentId', 'segmentName', 'symbol', 'tradeMode', 'layer', 'setByAdminId', 'setByRole', '__v', 'createdAt', 'updatedAt']) {
      delete copy[k];
    }
    return copy;
  };

  const runCopy = async () => {
    if (!snapshot || targets.length === 0) return;
    setRunning(true); setLog([]); setError(null);
    const pushLog = (msg) => setLog(prev => [...prev, msg]);

    try {
      for (const target of targets) {
        pushLog(`→ ${target.name || target.oderId}`);

        // Segment rows
        for (const row of (snapshot.segments || [])) {
          const isScript = !!row.symbol;
          const mode = row.tradeMode;
          if (mode === 'netting' && !isScript && !picks.nettingSegments) continue;
          if (mode === 'netting' &&  isScript && !picks.nettingScripts) continue;
          if (mode === 'hedging' && !isScript && !picks.hedgingSegments) continue;
          if (mode === 'hedging' &&  isScript && !picks.hedgingScripts) continue;

          const fields = fieldsFromRow(row);
          try {
            if (isScript) {
              await scopedApi.writeUserScript(API_URL, target._id, mode, row.segmentName, row.symbol, fields);
              pushLog(`  ✓ ${mode} script ${row.segmentName}/${row.symbol}`);
            } else {
              await scopedApi.writeUserSegment(API_URL, target._id, mode, row.segmentName, fields);
              pushLog(`  ✓ ${mode} segment ${row.segmentName}`);
            }
          } catch (e) {
            pushLog(`  ✗ ${mode} ${row.segmentName}${row.symbol ? '/' + row.symbol : ''}: ${e.message}`);
          }
        }

        // Reorder
        if (picks.reorder && snapshot.reorder) {
          try {
            await scopedApi.writeUserReorder(API_URL, target._id, {
              delaySeconds: snapshot.reorder.delaySeconds ?? 0,
              isEnabled: snapshot.reorder.isEnabled !== false,
              segmentOverrides: snapshot.reorder.segmentOverrides || [],
            });
            pushLog('  ✓ reorder');
          } catch (e) { pushLog(`  ✗ reorder: ${e.message}`); }
        }

        // Risk
        if (picks.risk && snapshot.risk) {
          try {
            const fields = fieldsFromRow(snapshot.risk);
            await scopedApi.writeUserRisk(API_URL, target._id, fields);
            pushLog('  ✓ risk');
          } catch (e) { pushLog(`  ✗ risk: ${e.message}`); }
        }
      }
      pushLog('Done.');
    } catch (e) { setError(e.message); }
    finally { setRunning(false); }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Copy Settings</h2>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Copy one user's overrides (segment / script / reorder / risk) to one or more other users in your scope.
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Source */}
      <section style={styles.section}>
        <h3 style={styles.h3}>1. Source user</h3>
        <ScopedUserSearch API_URL={API_URL} selected={sourceUser} onSelect={loadSnapshot} />
        {snapLoading && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>Loading snapshot…</div>}
        {snapshot && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Found overrides:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
              <InfoTile label="Netting segments" value={counts.nettingSegments} />
              <InfoTile label="Netting scripts" value={counts.nettingScripts} />
              <InfoTile label="Hedging segments" value={counts.hedgingSegments} />
              <InfoTile label="Hedging scripts" value={counts.hedgingScripts} />
              <InfoTile label="Reorder" value={counts.reorder} />
              <InfoTile label="Risk" value={counts.risk} />
            </div>
          </div>
        )}
      </section>

      {/* What to copy */}
      {snapshot && (
        <section style={styles.section}>
          <h3 style={styles.h3}>2. What to copy</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {Object.entries(picks).map(([k, v]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: v ? 'rgba(59,130,246,0.08)' : 'var(--bg-primary)' }}>
                <input type="checkbox" checked={v} onChange={(e) => setPicks(p => ({ ...p, [k]: e.target.checked }))} />
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{labelFor(k)}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>{counts[k] || 0}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Targets */}
      {snapshot && (
        <section style={styles.section}>
          <h3 style={styles.h3}>3. Target users</h3>
          <ScopedUserSearch API_URL={API_URL} selected={picking} onSelect={addTarget} placeholder="Add a target user…" />
          {targets.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {targets.map(t => (
                <span key={t._id} style={styles.targetChip}>
                  {t.name || t.oderId}
                  <button onClick={() => removeTarget(t._id)} style={styles.chipX}>×</button>
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Action */}
      {snapshot && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={runCopy}
            disabled={running || targets.length === 0}
            style={{ ...styles.runBtn, opacity: (running || targets.length === 0) ? 0.5 : 1 }}
          >
            {running ? 'Copying…' : `Copy to ${targets.length} user${targets.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      {log.length > 0 && (
        <pre style={styles.log}>{log.join('\n')}</pre>
      )}
    </div>
  );
}

function labelFor(k) {
  return {
    nettingSegments: 'Netting segments',
    nettingScripts: 'Netting scripts',
    hedgingSegments: 'Hedging segments',
    hedgingScripts: 'Hedging scripts',
    reorder: 'Reorder delay',
    risk: 'Risk settings',
  }[k] || k;
}

function InfoTile({ label, value }) {
  return (
    <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

const styles = {
  errorBox: { padding: 10, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', marginBottom: 12, fontSize: 13 },
  section: { padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 10, marginBottom: 14 },
  h3: { margin: '0 0 10px 0', fontSize: 14, color: 'var(--text-primary)' },
  runBtn: { padding: '10px 18px', borderRadius: 6, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 },
  targetChip: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 14, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', fontSize: 12, fontWeight: 600 },
  chipX: { background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, padding: 0, marginLeft: 4 },
  log: { marginTop: 14, padding: 12, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 12, color: 'var(--text-primary)', maxHeight: 300, overflow: 'auto' },
};
