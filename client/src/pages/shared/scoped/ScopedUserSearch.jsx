import { useState, useEffect, useRef } from 'react';
import scopedApi from './scopedApi';

/**
 * Scoped user search box. Debounces typing, lists up to 10 results from the
 * signed-in admin's subtree. Parent controls the selected user.
 *
 * Props
 *   API_URL    : string
 *   selected   : { _id, name, oderId } | null
 *   onSelect   : (user) => void
 *   placeholder: optional
 */
export default function ScopedUserSearch({ API_URL, selected, onSelect, placeholder = 'Search user by name / ID / email…' }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const boxRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const h = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await scopedApi.searchUsers(API_URL, q.trim(), 10);
        setResults(r.users || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [q, open, API_URL]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={boxRef} style={{ position: 'relative', width: '100%', maxWidth: 480 }}>
      {selected ? (
        <div style={styles.chipRow}>
          <div style={styles.chip}>
            <div style={{ fontWeight: 600 }}>{selected.name || selected.oderId}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{selected.oderId} · {selected.email || '—'}</div>
          </div>
          <button type="button" onClick={() => onSelect(null)} style={styles.clearBtn}>Change</button>
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder={placeholder}
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            style={styles.input}
          />
          {open && (
            <div style={styles.dropdown}>
              {loading && <div style={styles.info}>Searching…</div>}
              {error && <div style={{ ...styles.info, color: '#ef4444' }}>{error}</div>}
              {!loading && !error && results.length === 0 && <div style={styles.info}>No users</div>}
              {results.map(u => (
                <div
                  key={u._id}
                  onClick={() => { onSelect(u); setOpen(false); setQ(''); }}
                  style={styles.row}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(127,127,127,0.12)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name || u.oderId}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.oderId} · {u.email || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  input: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
    zIndex: 100,
    maxHeight: 280,
    overflowY: 'auto',
  },
  row: { padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' },
  info: { padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)' },
  chipRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chip: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid var(--border-color)',
    background: 'rgba(59,130,246,0.08)',
  },
  clearBtn: {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 12,
  },
};
