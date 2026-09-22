import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Fallback defaults so the UI never shows blanks if the public fetch fails.
const DEFAULTS = {
  siteName: 'DhanFunded',
  siteUrl: 'https://dhanfunded.com',
  supportEmail: 'support@dhanfunded.com',
  supportPhone: '+91 8367045119',
  supportWhatsapp: '+91 8367045119',
  phoneHours: 'Mon–Sat, 9AM–6PM IST',
  whatsappHours: 'Mon–Sat, 9AM–9PM IST',
  emailResponseNote: 'Response within 2 hours',
  // Merchant / legal contact block (admin-editable in Admin → Settings). These
  // are the current values, used as a fallback until the admin overrides them.
  // legalEntityName is blank by default — the footer hides the line when empty.
  // Set it from Admin → Settings if a payment gateway asks for the legal name
  // to be displayed on the site.
  legalEntityName: '',
  // Blank by default — these held a personal home address. The contact page and
  // footer skip any line that is empty. Fill them from Admin → Settings if a
  // payment gateway requires the merchant address on the site.
  registeredAddress: '',
  operationalAddress: '',
  contactPhone: '9499979997',
  contactEmail: 'adsbft1@gmail.com',
  // Social pages (Admin → Settings → General → Social Links). A blank value
  // hides that icon in the footer and on the user Contact page.
  socialInstagram: 'https://www.instagram.com/dhanfunded',
  socialFacebook: '',
  socialYoutube: 'https://youtube.com/@dhanfunded',
  socialTelegram: 'https://t.me/dhanfunded',
};

// Fields the admin can clear to hide a channel. Must match CLEARABLE_FIELDS in
// server/index.js. DEFAULTS still apply if the settings request itself fails.
const CLEARABLE = new Set([
  'supportPhone', 'supportWhatsapp',
  'socialInstagram', 'socialFacebook', 'socialYoutube', 'socialTelegram',
]);

// Module-level cache + single in-flight request so every component shares one
// network call (the contact details rarely change within a session).
let cache = null;
let inflight = null;

/** Strip everything except digits → wa.me / tel friendly (e.g. "+91 8367045119" → "918367045119"). */
export function digitsOnly(raw) {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * Live, admin-controlled site contact details (phone / email / whatsapp + hours)
 * fetched from GET /api/settings/public. Nothing is hard-coded in the website —
 * the admin edits these in Admin → Settings → General.
 */
export function useSiteSettings() {
  const [settings, setSettings] = useState(cache || DEFAULTS);

  useEffect(() => {
    if (cache) { setSettings(cache); return; }
    let alive = true;
    if (!inflight) {
      inflight = fetch(`${API_URL}/api/settings/public`)
        .then((r) => r.json())
        .then((d) => {
          // Drop empty/blank server values so a field the admin hasn't filled
          // yet keeps its sensible DEFAULT instead of rendering blank.
          const clean = {};
          if (d && d.success && d.settings) {
            for (const [k, v] of Object.entries(d.settings)) {
              if (v === null || v === undefined) continue;
              // A blank phone / WhatsApp / social link means the admin cleared
              // it to hide that channel — honour it instead of the default.
              if (String(v).trim() === '' && !CLEARABLE.has(k)) continue;
              clean[k] = v;
            }
          }
          cache = { ...DEFAULTS, ...clean };
          return cache;
        })
        .catch(() => {
          cache = { ...DEFAULTS };
          return cache;
        });
    }
    inflight.then((s) => { if (alive) setSettings(s); });
    return () => { alive = false; };
  }, []);

  return settings;
}
