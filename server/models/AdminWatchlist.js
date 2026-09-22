const mongoose = require('mongoose');

const adminWatchlistSchema = new mongoose.Schema({
  segment: {
    type: String,
    required: true
  },
  instruments: [{
    symbol: String,
    name: String,
    token: String,
    exchange: String,
    lotSize: Number,
    tickSize: Number,
    expiry: String,
    strike: Number,
    optionType: String,
    segment: String
  }]
}, {
  timestamps: true
});

// Ensure one document per segment
adminWatchlistSchema.index({ segment: 1 }, { unique: true });

module.exports = mongoose.model('AdminWatchlist', adminWatchlistSchema);
