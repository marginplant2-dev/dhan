const mongoose = require('mongoose');

// Expiry Settings Schema - Per segment expiry configuration
const expirySettingsSchema = new mongoose.Schema({
  // Segment reference
  segmentName: {
    type: String,
    required: true,
    unique: true
  },
  
  // Show: 1 = current only, 2 = current + next, 3 = current + next + next
  show: {
    type: Number,
    default: 1,
    min: 1,
    max: 5
  },
  
  // Open Next Before Days: When this many days are left in current expiry, add next
  openNextBeforeDays: {
    type: Number,
    default: 5,
    min: 0
  },
  
  // Per-script expiry settings (for MCX, etc.)
  scriptSettings: [{
    scriptName: {
      type: String,
      required: true
    },
    show: {
      type: Number,
      default: 1,
      min: 1,
      max: 5
    },
    openNextBeforeDays: {
      type: Number,
      default: 5,
      min: 0
    }
  }],
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
expirySettingsSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Static method to get settings for a segment
expirySettingsSchema.statics.getSettingsForSegment = async function(segmentName) {
  let settings = await this.findOne({ segmentName });
  if (!settings) {
    // Create default settings
    settings = await this.create({ segmentName, show: 1, openNextBeforeDays: 5 });
  }
  return settings;
};

// Static method to get all settings
expirySettingsSchema.statics.getAllSettings = async function() {
  return await this.find().sort({ segmentName: 1 });
};

const DEFAULT_SEGMENT_KEYS = ['NFO_FUT', 'NFO_OPT', 'MCX_FUT', 'MCX_OPT', 'BFO_FUT', 'BFO_OPT'];

/** Create default rows (show=3, openNextBeforeDays=5) only if missing — enables expiry filter without admin save */
expirySettingsSchema.statics.seedDefaultsIfMissing = async function() {
  for (const segmentName of DEFAULT_SEGMENT_KEYS) {
    const exists = await this.findOne({ segmentName });
    if (!exists) {
      await this.create({
        segmentName,
        show: 3,
        openNextBeforeDays: 5,
        scriptSettings: []
      });
    }
  }
};

module.exports = mongoose.model('ExpirySettings', expirySettingsSchema);
