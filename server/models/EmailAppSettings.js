const mongoose = require('mongoose');

/** Singleton-style doc: first row controls app-wide email behaviour (admin UI toggle). */
const emailAppSettingsSchema = new mongoose.Schema(
  {
    signupOtpEmailEnabled: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmailAppSettings', emailAppSettingsSchema);
