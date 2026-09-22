import { useOutletContext } from 'react-router-dom';
import { useSiteSettings, digitsOnly } from '../../Landing/hooks/useSiteSettings';

function ContactPage() {
  const { user } = useOutletContext();
  // All contact details come from Admin → Settings → General (live), NOT hard-coded.
  const s = useSiteSettings();
  const phoneDigits = digitsOnly(s.supportPhone);
  const waDigits = digitsOnly(s.supportWhatsapp);

  const channels = [
    { icon: '\u{1F4DE}', title: 'Phone Support', desc: s.supportPhone, sub: s.phoneHours, href: phoneDigits ? `tel:+${phoneDigits}` : null },
    { icon: '\u{1F4E7}', title: 'Email Support', desc: s.supportEmail, sub: s.emailResponseNote, href: s.supportEmail ? `mailto:${s.supportEmail}` : null },
    { icon: '\u{1F4AC}', title: 'WhatsApp', desc: s.supportWhatsapp, sub: s.whatsappHours || 'Chat with us anytime', href: waDigits ? `https://wa.me/${waDigits}` : null },
    { icon: '\u{1F4F1}', title: 'Telegram', desc: s.socialTelegram, sub: 'Join our community for updates', href: s.socialTelegram },
    { icon: '\u{1F4F7}', title: 'Instagram', desc: s.socialInstagram, sub: 'Follow us for updates and results', href: s.socialInstagram },
    { icon: '\u{1F465}', title: 'Facebook', desc: s.socialFacebook, sub: 'Follow our page', href: s.socialFacebook },
  ].filter(c => c.desc);

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ padding: '24px 28px 60px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Home / <span style={{ color: 'var(--text-primary)' }}>Contact</span>
        </div>

        <h1 style={{ color: 'var(--text-primary)', fontSize: '22px', fontWeight: '700', margin: '0 0 4px' }}>Contact Support</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 28px' }}>Need help? Reach out to us through any of the channels below.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {channels.map((item, i) => (
            <div key={i} style={{
              padding: '20px', borderRadius: '14px',
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', gap: '16px'
            }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: 'rgba(59,130,246,0.08)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '20px', flexShrink: 0
              }}>
                {item.icon}
              </div>
              <div>
                <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px', marginBottom: '2px' }}>{item.title}</div>
                {item.href ? (
                  <a
                    href={item.href}
                    target={item.href.startsWith('http') ? '_blank' : undefined}
                    rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    style={{ fontSize: '12px', color: '#3b82f6', fontWeight: '600', textDecoration: 'none', wordBreak: 'break-all' }}
                  >
                    {item.desc}
                  </a>
                ) : (
                  <div style={{ fontSize: '12px', color: '#3b82f6', fontWeight: '600' }}>{item.desc}</div>
                )}
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <h2 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '700', margin: '28px 0 14px' }}>Frequently Asked Questions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { q: 'What happens after I pass?', a: 'You receive a funded account with real profit-sharing. Your certificate is issued and visible on the Certificates page.' },
            { q: 'Can I have multiple evaluations?', a: 'Yes, you can purchase and run multiple evaluations simultaneously.' },
            { q: 'How do withdrawals work?', a: 'Once funded, your profits are split according to the challenge terms. You can withdraw from your funded account dashboard.' },
          ].map((faq, i) => (
            <div key={i} style={{
              padding: '16px 18px', borderRadius: '12px',
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
            }}>
              <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px', marginBottom: '4px' }}>{faq.q}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{faq.a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ContactPage;
