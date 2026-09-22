import { Link } from 'react-router-dom';
import { ArrowRight, Mail, MessageCircle, Phone } from 'lucide-react';
import { useSiteSettings, digitsOnly } from '../hooks/useSiteSettings';

export default function CtaBand() {
  const site = useSiteSettings();

  // Same admin-managed contact details as the Contact page — single source.
  const channels = [
    { Icon: MessageCircle, label: 'WhatsApp', value: site.supportWhatsapp, sub: site.whatsappHours, href: `https://wa.me/${digitsOnly(site.supportWhatsapp)}` },
    { Icon: Phone, label: 'Phone', value: site.supportPhone, sub: site.phoneHours, href: `tel:${digitsOnly(site.supportPhone)}` },
    { Icon: Mail, label: 'Email', value: site.supportEmail, sub: site.emailResponseNote, href: `mailto:${site.supportEmail}` },
  ].filter((c) => String(c.value || '').trim()); // a channel cleared in admin is hidden

  return (
    <section className="pf-section">
      <div className="pf-wrap">
        <div
          className="pf-card relative overflow-hidden p-8 sm:p-14 text-center"
          style={{ background: 'linear-gradient(135deg, #0E2A3A 0%, #0A0A0D 100%)', borderColor: 'rgba(31,216,122,.28)' }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[560px] h-[360px]"
            style={{ background: 'radial-gradient(ellipse, rgba(31,216,122,.24), transparent 68%)' }}
          />
          <div className="relative">
            <p className="text-[.78rem] font-bold tracking-[.22em] uppercase mb-4" style={{ color: 'var(--pf-gold)' }}>
              Trade · Prove · Get Funded
            </p>
            <h2 className="pf-h2 mb-5" style={{ color: '#fff' }}>Ready to prove your process?</h2>
            <p className="text-[1.02rem] leading-relaxed mb-8 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,.72)' }}>
              Pick an account size, clear the objectives, and take your share. Every rule is
              published before you pay.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3.5">
              <Link to="/register" className="pf-btn pf-btn--primary pf-btn--lg">
                Get Started <ArrowRight size={17} />
              </Link>
              <Link
                to="/pricing"
                className="pf-btn pf-btn--lg"
                style={{ background: 'rgba(255,255,255,.08)', color: '#fff', borderColor: 'rgba(255,255,255,.22)' }}
              >
                Compare assessments
              </Link>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-5">
          {channels.map(({ Icon, label, value, sub, href }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="pf-card pf-card--hover p-5 flex items-center gap-4">
              <span className="pf-tile pf-tile--soft"><Icon size={20} /></span>
              <span className="min-w-0">
                <span className="block text-[.78rem] font-bold tracking-[.12em] uppercase" style={{ color: 'var(--pf-faint)' }}>{label}</span>
                <span className="block text-[.95rem] font-semibold truncate" style={{ color: 'var(--pf-text)' }}>{value}</span>
                <span className="block pf-small">{sub}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
