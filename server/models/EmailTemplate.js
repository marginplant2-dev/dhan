const mongoose = require('mongoose');

const emailTemplateSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    subject: { type: String, required: true },
    htmlBody: { type: String, default: '' },
    textBody: { type: String, default: '' },
    variableKeys: [{ type: String }],
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
