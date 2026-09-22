import { useState, useEffect, useRef } from 'react';

/**
 * Symbol picker backed by /api/admin/segments/search-instruments.
 * Requires an `exchange` or `segmentName` to scope the instrument list.
 *
 * Props
 *   API_URL, exchange, segmentName, value, onChange, placeholder
 */
export default function SymbolPicker({ API_URL, exchange, segmentName, value, onChange, placeholder = 'Search symbol…' }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = setTimeout(async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (exchange) qs.set('exchange', exchange);
        if (segmentName) qs.set('segmentName', segmentName);
        qs.set('search', q.trim());
        const res = await fetch(`${API_URL}/api/admin/segments/search-instruments?${qs.toString()}`);
        const data = await res.json();
        setResults(Array.isArray(data?.instruments) ? data.instruments.slice(0, 30) : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [q, open, exchange, segmentName, API_URL]);

  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={boxRef} style={{ position: 'relative', width: '100%' }}>
      {value ? (
        <div style={styles.chipRow}>
          <code style={styles.chip}>{value}</code>
          <button type="button" onClick={() => onChange(null)} style={styles.clearBtn}>Change</button>
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
              {!loading && results.length === 0 && <div style={styles.info}>No symbols</div>}
              {results.map(s => {
                const sym = typeof s === 'string' ? s : (s.symbol || s.name || s.tradingsymbol || '');
                if (!sym) return null;
                return (
                  <div
                    key={sym}
                    onClick={() => { onChange(sym); setOpen(false); setQ(''); }}
                    style={styles.row}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(127,127,127,0.12)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <code style={{ fontSize: 12, fontWeight: 600 }}>{sym}</code>
                    {typeof s === 'object' && s.name && <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>{s.name}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  input: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.3)', zIndex: 100, maxHeight: 280, overflowY: 'auto' },
  row: { padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' },
  info: { padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)' },
  chipRow: { display: 'flex', alignItems: 'center', gap: 8 },
  chip: { flex: 1, padding: '8px 12px', borderRadius: 6, background: 'rgba(59,130,246,0.08)', border: '1px solid var(--border-color)', fontFamily: 'ui-monospace, monospace', fontSize: 13 },
  clearBtn: { padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 },
};
