import { useState } from 'react';
import { Send, Mail, MessageCircle, Send as TelegramIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import LandingShell from '../components/LandingShell';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useSiteSettings, digitsOnly } from '../hooks/useSiteSettings';

const INCLUDE = [
  'The email address you registered with.',
  'Your account ID from the dashboard, if the question is about a challenge or a funded account.',
  'For a payment: the amount, the date, and the UPI transaction reference or a screenshot of it.',
  'For KYC or a payout: the date you submitted it and the status your dashboard shows now.',
  'For a platform problem: your device and browser, the page you were on, and a screenshot of any error.',
  'For a partnership: a link to your channel or community and a line on what you teach.',
];

export default function ContactPage() {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  // Admin-controlled contact details (no hard-coding) — Admin → Settings → General.
  const site = useSiteSettings();
  const contactInfo = [
    { icon: MessageCircle, label: 'WhatsApp', value: site.supportWhatsapp, sub: 'Quickest way to get an answer', href: `https://wa.me/${digitsOnly(site.supportWhatsapp)}` },
    { icon: Mail, label: 'Email', value: site.supportEmail, sub: site.emailResponseNote, href: `mailto:${site.supportEmail}` },
    { icon: TelegramIcon, label: 'Telegram', value: '@dhanfunded', sub: 'Our announcements channel', href: 'https://t.me/dhanfunded' },
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
          <p className="text-sm font-semibold text-[color:var(--pf-brand)] uppercase tracking-widest mb-4">Contact</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }} className="text-[color:var(--pf-text)] mb-6">
            Contact DhanFunded <span className="text-[color:var(--pf-brand)]">support</span>
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--pf-muted)] max-w-2xl mx-auto leading-relaxed">
            DhanFunded is an Indian prop trading firm running simulated evaluations on NIFTY,
            BANKNIFTY and SENSEX options. Write to us about a challenge, a payment, your KYC, a
            payout or the trading platform, and someone from the team will answer.
          </p>
        </div>
      </section>

      {/* Contact Form + Info */}
      <section className="pb-24 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">

          {/* Left — Contact Info */}
          <div className="lg:col-span-2">
            <h2 className="text-xl font-bold text-[color:var(--pf-text)] mb-6">Ways to reach us</h2>
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
                      <Icon size={18} className="text-[color:var(--pf-brand)]" aria-hidden="true" />
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
              <h3 className="text-sm font-bold text-[color:var(--pf-text)] mb-2">Support hours</h3>
              <div className="space-y-2">
                {[
                  { day: 'Mon to Fri', time: '9:00 AM – 6:00 PM' },
                  { day: 'Sat', time: '9:00 AM – 2:00 PM' },
                  { day: 'Sun', time: 'Closed' },
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
              <h2 className="text-xl font-bold text-[color:var(--pf-text)] mb-6">Write to us here</h2>

              {submitted ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                      <path d="M6 14l6 6 10-12" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-[color:var(--pf-text)]">Message sent</p>
                  <p className="text-sm text-[color:var(--pf-muted)]">We'll get back to you within 2 hours.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="contact-name" className="text-xs font-semibold text-[color:var(--pf-muted)] mb-1.5 block">Name</label>
                      <input
                        id="contact-name"
                        type="text"
                        autoComplete="name"
                        placeholder="Rahul Sharma"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-[color:var(--pf-border)] bg-[color:var(--pf-card-alt)] text-[color:var(--pf-text)] text-sm placeholder-[color:var(--pf-faint)] focus:outline-none focus:border-[#1FD87A] transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="contact-email" className="text-xs font-semibold text-[color:var(--pf-muted)] mb-1.5 block">Email you registered with</label>
                      <input
                        id="contact-email"
                        type="email"
                        autoComplete="email"
                        placeholder="rahul@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-[color:var(--pf-border)] bg-[color:var(--pf-card-alt)] text-[color:var(--pf-text)] text-sm placeholder-[color:var(--pf-faint)] focus:outline-none focus:border-[#1FD87A] transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="contact-topic" className="text-xs font-semibold text-[color:var(--pf-muted)] mb-1.5 block">Topic</label>
                    <select
                      id="contact-topic"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-[color:var(--pf-border)] bg-[color:var(--pf-card-alt)] text-[color:var(--pf-text)] text-sm focus:outline-none focus:border-[#1FD87A] transition-all"
                      required
                    >
                      <option value="">Pick one</option>
                      <option>Choosing a challenge</option>
                      <option>Payment or coupon</option>
                      <option>KYC and payouts</option>
                      <option>Trading rules</option>
                      <option>Platform or login problem</option>
                      <option>Partnerships</option>
                      <option>Something else</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="contact-message" className="text-xs font-semibold text-[color:var(--pf-muted)] mb-1.5 block">Message</label>
                    <textarea
                      id="contact-message"
                      rows={5}
                      placeholder="What happened, and your account ID if you have one"
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
                    <Send size={16} aria-hidden="true" />
                    Send message
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* What to include */}
      <section className="pb-16 md:pb-24 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[color:var(--pf-text)] mb-4">What to put in your message</h2>
            <p className="text-sm text-[color:var(--pf-muted)] mb-4 leading-relaxed">
              A few details let us find your account and answer in one reply instead of three.
            </p>
            <ul className="space-y-3">
              {INCLUDE.map((line) => (
                <li key={line} className="flex gap-3 items-start text-sm text-[color:var(--pf-muted)] leading-relaxed">
                  <span className="w-2 h-2 rounded-full shrink-0 mt-1.5 bg-[color:var(--pf-brand)]" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm font-semibold text-[color:var(--pf-text)] mt-5">
              Never send your password or an OTP in a message, on any channel.
            </p>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[color:var(--pf-text)] mb-4">Your answer may already be here</h2>
            <ul className="space-y-3 text-sm text-[color:var(--pf-muted)] leading-relaxed">
              <li>Common questions on rules and payouts are answered in the <Link to="/faqs" className="text-[color:var(--pf-brand)] font-semibold hover:underline">prop firm FAQs</Link>.</li>
              <li>Fees for every account size are on the <Link to="/pricing" className="text-[color:var(--pf-brand)] font-semibold hover:underline">pricing page</Link>, and the three routes are compared on the <Link to="/challenges" className="text-[color:var(--pf-brand)] font-semibold hover:underline">challenges page</Link>.</li>
              <li>Lot sizes and the 3:15 PM square-off are explained on the <Link to="/instruments" className="text-[color:var(--pf-brand)] font-semibold hover:underline">instruments page</Link>.</li>
              <li>Refunds and account terms are set out in our <Link to="/refund-policy" className="text-[color:var(--pf-brand)] font-semibold hover:underline">refund policy</Link> and <Link to="/terms" className="text-[color:var(--pf-brand)] font-semibold hover:underline">terms and conditions</Link>.</li>
            </ul>
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
