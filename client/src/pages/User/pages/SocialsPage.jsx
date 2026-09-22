import { LuInstagram, LuYoutube, LuSend, LuArrowUpRight } from 'react-icons/lu';

// Our social channels — shown to logged-in users so they can follow payouts,
// tutorials and daily updates. Pure links; nothing is fetched.
const SOCIALS = [
  {
    key: 'instagram',
    name: 'Instagram',
    handle: '@dhanfunded',
    desc: 'Check out our Instagram highlights to see our latest payouts.',
    href: 'https://www.instagram.com/dhanfunded',
    icon: LuInstagram,
    grad: 'linear-gradient(135deg, #f58529 0%, #dd2a7b 50%, #8134af 100%)',
  },
  {
    key: 'youtube',
    name: 'YouTube',
    handle: '@dhanfunded',
    desc: 'Access our demo videos and tutorials.',
    href: 'https://youtube.com/@dhanfunded',
    icon: LuYoutube,
    grad: 'linear-gradient(135deg, #ff5252 0%, #ff0000 100%)',
  },
  {
    key: 'telegram',
    name: 'Telegram',
    handle: 't.me/dhanfunded',
    desc: 'Our channel for daily updates.',
    href: 'https://t.me/dhanfunded',
    icon: LuSend,
    grad: 'linear-gradient(135deg, #37bbfe 0%, #007dbb 100%)',
  },
];

function SocialsPage() {
  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 60px' }}>
        {/* Breadcrumb + heading */}
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
          Home / <span style={{ color: 'var(--text-primary)' }}>Socials</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <LuShareGlyph /> Connect with DhanFunded
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 22px' }}>
          Follow us for payout highlights, tutorials and daily market updates.
        </p>

        <div style={{ display: 'grid', gap: 14 }}>
          {SOCIALS.map((s) => {
            const Icon = s.icon;
            return (
              <a
                key={s.key}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '16px 18px', borderRadius: 16, textDecoration: 'none',
                  background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                  transition: 'transform .12s ease, box-shadow .12s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 26px rgba(0,0,0,0.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span style={{
                  flexShrink: 0, width: 52, height: 52, borderRadius: 14, background: s.grad,
                  display: 'grid', placeItems: 'center', color: '#fff', boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
                }}>
                  <Icon size={26} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{s.handle}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>{s.desc}</div>
                </div>
                <span style={{
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '8px 14px', borderRadius: 999, fontWeight: 700, fontSize: 13,
                  background: 'rgba(43,86,255,0.10)', color: '#2b56ff', whiteSpace: 'nowrap',
                }}>
                  Follow <LuArrowUpRight size={15} />
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Small inline share glyph so we don't add another icon import just for the title.
function LuShareGlyph() {
  return (
    <span style={{
      display: 'inline-grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10,
      background: 'linear-gradient(135deg, #2b56ff, #7c4dff)', color: '#fff', fontSize: 18,
    }}>🌐</span>
  );
}

export default SocialsPage;
