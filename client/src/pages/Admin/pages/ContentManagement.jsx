import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../adminConfig';

// Admin CRUD for the public /faqs and /blog content (replaces the old hardcoded
// arrays). Two tabs: FAQ + Blog. Each row can be edited inline via a side panel.
const token = () => localStorage.getItem('dhanfunded-admin-token');
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

const card = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 };
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '12px 0 5px' };
const btn = (bg, color = '#fff') => ({ padding: '8px 16px', borderRadius: 8, border: 'none', background: bg, color, fontSize: 13, fontWeight: 600, cursor: 'pointer' });

const EMPTY_FAQ = { question: '', answer: '', category: 'General', order: 0, enabled: true };
const EMPTY_POST = { title: '', slug: '', excerpt: '', body: '', category: 'General', readTime: '5 min read', date: '', order: 0, featured: false, enabled: true };

export default function ContentManagement() {
  const [tab, setTab] = useState('faq');
  const [faqs, setFaqs] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // { kind:'faq'|'blog', data, isNew }
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, b] = await Promise.all([
        fetch(`${API_URL}/api/admin/content/faqs`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_URL}/api/admin/content/blog`, { headers: authHeaders() }).then(r => r.json())
      ]);
      if (f.success) setFaqs(f.faqs || []);
      if (b.success) setPosts(b.posts || []);
    } catch (e) {
      setMsg('Failed to load content: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { kind, data, isNew } = editing;
      const base = kind === 'faq' ? 'faqs' : 'blog';
      const url = isNew ? `${API_URL}/api/admin/content/${base}` : `${API_URL}/api/admin/content/${base}/${data._id}`;
      const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: authHeaders(), body: JSON.stringify(data) });
      const out = await res.json();
      if (!res.ok || out.success === false) { flash('Save failed: ' + (out.error || res.status)); return; }
      setEditing(null);
      flash('Saved ✓');
      load();
    } catch (e) {
      flash('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (kind, id) => {
    if (!window.confirm('Delete this item permanently?')) return;
    const base = kind === 'faq' ? 'faqs' : 'blog';
    try {
      const res = await fetch(`${API_URL}/api/admin/content/${base}/${id}`, { method: 'DELETE', headers: authHeaders() });
      const out = await res.json();
      if (!res.ok || out.success === false) { flash('Delete failed: ' + (out.error || res.status)); return; }
      flash('Deleted ✓');
      load();
    } catch (e) {
      flash('Delete failed: ' + e.message);
    }
  };

  const setField = (k, v) => setEditing((e) => ({ ...e, data: { ...e.data, [k]: v } }));

  return (
    <div style={{ padding: 20, color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Content — FAQ &amp; Blog</h1>
        {msg && <span style={{ fontSize: 13, color: 'var(--accent-primary, #2962ff)', fontWeight: 600 }}>{msg}</span>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[['faq', `FAQ (${faqs.length})`], ['blog', `Blog (${posts.length})`]].map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setEditing(null); }}
            style={btn(tab === k ? 'var(--accent-primary, #2962ff)' : 'var(--bg-secondary)', tab === k ? '#fff' : 'var(--text-secondary)')}>
            {label}
          </button>
        ))}
        <button onClick={() => setEditing({ kind: tab, isNew: true, data: { ...(tab === 'faq' ? EMPTY_FAQ : EMPTY_POST) } })}
          style={{ ...btn('#10b981'), marginLeft: 'auto' }}>
          + Add {tab === 'faq' ? 'FAQ' : 'Blog post'}
        </button>
      </div>

      {loading ? <div style={{ color: 'var(--text-secondary)' }}>Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: editing ? '1fr 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
          {/* LIST */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tab === 'faq' && faqs.map((f) => (
              <div key={f._id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary, #2962ff)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {f.category}{!f.enabled && ' · HIDDEN'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{f.question}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{f.answer}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setEditing({ kind: 'faq', isNew: false, data: { ...f } })} style={btn('var(--accent-primary, #2962ff)')}>Edit</button>
                    <button onClick={() => remove('faq', f._id)} style={btn('#ef4444')}>Delete</button>
                  </div>
                </div>
              </div>
            ))}

            {tab === 'blog' && posts.map((p) => (
              <div key={p._id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary, #2962ff)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {p.category} · {p.readTime}{p.featured && ' · ★ FEATURED'}{!p.enabled && ' · HIDDEN'}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{p.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'monospace' }}>/blog/{p.slug} · {p.date}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.5 }}>{p.excerpt}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setEditing({ kind: 'blog', isNew: false, data: { ...p } })} style={btn('var(--accent-primary, #2962ff)')}>Edit</button>
                    <button onClick={() => remove('blog', p._id)} style={btn('#ef4444')}>Delete</button>
                  </div>
                </div>
              </div>
            ))}

            {tab === 'faq' && faqs.length === 0 && <div style={{ color: 'var(--text-secondary)' }}>No FAQs yet. Click “Add FAQ”.</div>}
            {tab === 'blog' && posts.length === 0 && <div style={{ color: 'var(--text-secondary)' }}>No blog posts yet. Click “Add Blog post”.</div>}
          </div>

          {/* EDITOR */}
          {editing && (
            <div style={{ ...card, position: 'sticky', top: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editing.isNew ? 'New' : 'Edit'} {editing.kind === 'faq' ? 'FAQ' : 'blog post'}</h3>
                <button onClick={() => setEditing(null)} style={{ ...btn('transparent', 'var(--text-secondary)'), padding: 4, fontSize: 18 }}>×</button>
              </div>

              {editing.kind === 'faq' ? (
                <>
                  <label style={labelStyle}>Category</label>
                  <input style={inputStyle} value={editing.data.category} onChange={(e) => setField('category', e.target.value)} placeholder="General / Practice / Payouts / Account" />
                  <label style={labelStyle}>Question</label>
                  <input style={inputStyle} value={editing.data.question} onChange={(e) => setField('question', e.target.value)} />
                  <label style={labelStyle}>Answer</label>
                  <textarea style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} value={editing.data.answer} onChange={(e) => setField('answer', e.target.value)} />
                </>
              ) : (
                <>
                  <label style={labelStyle}>Title</label>
                  <input style={inputStyle} value={editing.data.title} onChange={(e) => setField('title', e.target.value)} />
                  <label style={labelStyle}>Slug (URL — leave blank to auto-generate)</label>
                  <input style={inputStyle} value={editing.data.slug} onChange={(e) => setField('slug', e.target.value)} placeholder="best-prop-firm-india-2026" />
                  <label style={labelStyle}>Category</label>
                  <input style={inputStyle} value={editing.data.category} onChange={(e) => setField('category', e.target.value)} />
                  <label style={labelStyle}>Excerpt (short teaser)</label>
                  <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={editing.data.excerpt} onChange={(e) => setField('excerpt', e.target.value)} />
                  <label style={labelStyle}>Body (separate paragraphs with a blank line)</label>
                  <textarea style={{ ...inputStyle, minHeight: 220, resize: 'vertical' }} value={editing.data.body} onChange={(e) => setField('body', e.target.value)} />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Read time</label>
                      <input style={inputStyle} value={editing.data.readTime} onChange={(e) => setField('readTime', e.target.value)} placeholder="10 min read" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Date (display)</label>
                      <input style={inputStyle} value={editing.data.date} onChange={(e) => setField('date', e.target.value)} placeholder="June 6, 2026" />
                    </div>
                  </div>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!editing.data.featured} onChange={(e) => setField('featured', e.target.checked)} /> Featured (wide card, shown first)
                  </label>
                </>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <div style={{ width: 90 }}>
                  <label style={labelStyle}>Order</label>
                  <input type="number" style={inputStyle} value={editing.data.order} onChange={(e) => setField('order', Number(e.target.value))} />
                </div>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-end', marginBottom: 9, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.data.enabled !== false} onChange={(e) => setField('enabled', e.target.checked)} /> Visible on site
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={save} disabled={saving} style={{ ...btn('#10b981'), opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
                <button onClick={() => setEditing(null)} style={btn('var(--bg-primary)', 'var(--text-secondary)')}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
