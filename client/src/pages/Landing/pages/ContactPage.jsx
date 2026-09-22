import { useState } from 'react';
import { Send, Mail, MessageCircle, Send as TelegramIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useSiteSettings, digitsOnly } from '../hooks/useSiteSettings';

export default function ContactPage() {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  // Admin-controlled contact details (no hard-coding) — Admin → Settings → General.
  const site = useSiteSettings();
  const contactInfo = [
    { icon: MessageCircle, label: 'WhatsApp', value: site.supportWhatsapp, sub: 'Fastest way to reach us', href: `https://wa.me/${digitsOnly(site.supportWhatsapp)}` },
    { icon: Mail, label: 'Email', value: site.supportEmail, sub: site.emailResponseNote, href: `mailto:${site.supportEmail}` },
    { icon: TelegramIcon, label: 'Telegram', value: '@dhanfunded', sub: 'Join our channel', href: 'https://t.me/dhanfunded' },
  ].filter((c) => String(c.value || '').trim()); // a channel cleared in admin is hidden

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 4000);
  };

  return (
    <LandingShell>
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-12 md:pt-44 md:pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Contact Us</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            Get in <span className="text-[color:var(--pf-brand)]">touch</span>
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            Have a question about our platform, evaluation plans, or payouts?
            We're here to help. Reach out and we'll get back to you quickly.
          </p>
        </div>
      </section>

      {/* Contact Form + Info */}
      <section className="pb-24 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">

          {/* Left — Contact Info */}
          <div className="lg:col-span-2">
            <h2 className="text-xl font-bold text-[color:var(--pf-text)] mb-6">Reach us directly</h2>
            <div className="space-y-5">
              {contactInfo.map((c) => {
                const Icon = c.icon;
                return (
                  <a
                    key={c.label}
                    href={c.href}
                    target={c.href.startsWith('http') ? '_blank' : undefined}
                    rel={c.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="flex items-start gap-4 p-3 -mx-3 rounded-xl hover:bg-[color:var(--pf-card-alt)] transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[rgba(31,216,122,0.08)] border border-[rgba(31,216,122,0.15)] flex items-center justify-center shrink-0">
                      <Icon size={18} className="text-[color:var(--pf-brand)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[color:var(--pf-brand)] uppercase tracking-wider mb-0.5">{c.label}</p>
                      <p className="text-sm font-bold text-[color:var(--pf-text)] break-words">{c.value}</p>
                      <p className="text-xs text-[color:var(--pf-muted)] mt-0.5 leading-relaxed">{c.sub}</p>
                    </div>
                  </a>
                );
              })}
            </div>

            <div className="mt-10 p-6 bg-[color:var(--pf-card-alt)] border border-[color:var(--pf-border)] rounded-2xl">
              <h3 className="text-sm font-bold text-[color:var(--pf-text)] mb-2">Working Hours</h3>
              <div className="space-y-2">
                {[
                  { day: 'Monday – Friday', time: '9:00 AM – 6:00 PM' },
                  { day: 'Saturday', time: '9:00 AM – 2:00 PM' },
                  { day: 'Sunday', time: 'Closed' },
                ].map((row) => (
                  <div key={row.day} className="flex justify-between text-sm">
                    <span className="text-[color:var(--pf-muted)]">{row.day}</span>
                    <span className={`font-medium ${row.time === 'Closed' ? 'text-red-500' : 'text-[color:var(--pf-text)]'}`}>{row.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — Form */}
          <div className="lg:col-span-3">
            <div className="bg-[color:var(--pf-card)] border border-[color:var(--pf-border)] rounded-2xl p-6 sm:p-8 shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
              <h2 className="text-xl font-bold text-[color:var(--pf-text)] mb-6">Send us a message</h2>

              {submitted ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                      <path d="M6 14l6 6 10-12" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-[color:var(--pf-text)]">Message Sent!</p>
                  <p className="text-sm text-[color:var(--pf-muted)]">We'll get back to you within 2 hours.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="text-xs font-semibold text-[color:var(--pf-muted)] mb-1.5 block">Your Name</label>
                      <input
                        type="text"
                        placeholder="Rahul Sharma"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-[color:var(--pf-border)] bg-[color:var(--pf-card-alt)] text-[color:var(--pf-text)] text-sm placeholder-[color:var(--pf-faint)] focus:outline-none focus:border-[#1FD87A] transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[color:var(--pf-muted)] mb-1.5 block">Email Address</label>
                      <input
                        type="email"
                        placeholder="rahul@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-[color:var(--pf-border)] bg-[color:var(--pf-card-alt)] text-[color:var(--pf-text)] text-sm placeholder-[color:var(--pf-faint)] focus:outline-none focus:border-[#1FD87A] transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[color:var(--pf-muted)] mb-1.5 block">Subject</label>
                    <select
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-[color:var(--pf-border)] bg-[color:var(--pf-card-alt)] text-[color:var(--pf-text)] text-sm focus:outline-none focus:border-[#1FD87A] transition-all"
                      required
                    >
                      <option value="">Select a topic</option>
                      <option>Evaluation Plans</option>
                      <option>Payouts & KYC</option>
                      <option>Technical Issue</option>
                      <option>Market Query</option>
                      <option>Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[color:var(--pf-muted)] mb-1.5 block">Message</label>
                    <textarea
                      rows={5}
                      placeholder="Describe your query in detail..."
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-[color:var(--pf-border)] bg-[color:var(--pf-card-alt)] text-[color:var(--pf-text)] text-sm placeholder-[color:var(--pf-faint)] focus:outline-none focus:border-[#1FD87A] transition-all resize-none"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-full bg-[color:var(--pf-brand)] text-white font-semibold text-sm hover:bg-[color:var(--pf-brand-2)] transition-all shadow-[0_6px_20px_rgba(31,216,122,0.3)] flex items-center justify-center gap-2"
                  >
                    <Send size={16} />
                    Send Message
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Merchant contact details (payment gateway compliance) */}
      <section className="pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-[color:var(--pf-card-alt)] border border-[color:var(--pf-border)] rounded-2xl p-6 sm:p-10">
            <h2 className="text-xl sm:text-2xl font-bold text-[color:var(--pf-text)] mb-3">Contact Us</h2>
            <p className="text-sm text-[color:var(--pf-muted)] mb-5">You may contact us using the information below:</p>

            <div className="space-y-3 text-sm leading-relaxed">
              {/* Each line renders only when set, so a blank default leaves no
                  dangling "Registered Address:" label behind. */}
              {site.legalEntityName && (
                <div>
                  <span className="text-[color:var(--pf-muted)]">Merchant Legal entity name: </span>
                  <span className="text-[color:var(--pf-text)] font-medium">{site.legalEntityName}</span>
                </div>
              )}
              {site.registeredAddress && (
                <div>
                  <span className="text-[color:var(--pf-muted)]">Registered Address: </span>
                  <span className="text-[color:var(--pf-text)] font-medium">{site.registeredAddress}</span>
                </div>
              )}
              {site.operationalAddress && (
                <div>
                  <span className="text-[color:var(--pf-muted)]">Operational Address: </span>
                  <span className="text-[color:var(--pf-text)] font-medium">{site.operationalAddress}</span>
                </div>
              )}
              <div>
                <span className="text-[color:var(--pf-muted)]">Telephone No: </span>
                <a href={`tel:${digitsOnly(site.contactPhone)}`} className="text-[color:var(--pf-brand)] font-medium hover:underline">{site.contactPhone}</a>
              </div>
              <div>
                <span className="text-[color:var(--pf-muted)]">E-Mail ID: </span>
                <a href={`mailto:${site.contactEmail}`} className="text-[color:var(--pf-brand)] font-medium hover:underline">{site.contactEmail}</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </LandingShell>
  );
}
