const mongoose = require('mongoose');

/**
 * Singleton collection for cross-client global settings.
 * INR-only platform — no USD markup is applied anywhere.
 *
 * Admin General Settings (site info + public CONTACT details shown on the
 * website) are persisted here so they survive restarts. The contact fields
 * (supportEmail / supportPhone / supportWhatsapp + hours) are read by the
 * public website via GET /api/settings/public — nothing is hard-coded in the
 * landing components anymore.
 */
const appSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },

  // ── Site information ──
  siteName: { type: String, default: 'DhanFunded' },
  siteUrl: { type: String, default: '' },

  // ── Public contact details (shown on the website; admin-editable) ──
  supportEmail: { type: String, default: '' },
  supportPhone: { type: String, default: '' },
  supportWhatsapp: { type: String, default: '' },
  phoneHours: { type: String, default: 'Mon–Sat, 9AM–6PM IST' },
  whatsappHours: { type: String, default: 'Mon–Sat, 9AM–9PM IST' },
  emailResponseNote: { type: String, default: 'Response within 2 hours' },

  // ── Merchant / legal contact block (shown at the bottom of /contact-us;
  //    admin-editable so legal entity + addresses can change without a deploy) ──
  legalEntityName: { type: String, default: '' },
  registeredAddress: { type: String, default: '' },
  operationalAddress: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  contactEmail: { type: String, default: '' },

  // ── Social pages (admin-editable; shown in the website footer and the
  //    user dashboard Contact page). Blank = that icon is hidden. ──
  socialInstagram: { type: String, default: '' },
  socialFacebook: { type: String, default: '' },
  socialYoutube: { type: String, default: '' },
  socialTelegram: { type: String, default: '' },

  // ── Feature toggles ──
  maintenanceMode: { type: Boolean, default: false },
  registrationEnabled: { type: Boolean, default: true },
  demoAccountEnabled: { type: Boolean, default: true },

  // ── Transaction limits ──
  minDeposit: { type: Number, default: 100 },
  maxWithdrawal: { type: Number, default: 100000 },
}, { timestamps: true });

appSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ key: 'global' });
  if (!doc) doc = await this.create({ key: 'global' });
  return doc;
};

module.exports = mongoose.model('AppSettings', appSettingsSchema);
