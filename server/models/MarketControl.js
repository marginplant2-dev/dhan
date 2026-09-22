const mongoose = require('mongoose');

// Market Control Schema - Controls market timing and trading hours
const marketControlSchema = new mongoose.Schema({
  // Market identifier
  market: {
    type: String,
    required: true,
    unique: true,
    enum: ['NSE', 'NFO', 'MCX', 'BSE', 'BFO', 'CDS', 'DELTA', 'FOREX', 'CRYPTO']
  },
  
  // Display name
  displayName: {
    type: String,
    required: true
  },
  
  // Master switch - if false, no trading allowed
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Trading hours (in IST - Indian Standard Time)
  tradingHours: {
    // Regular trading session
    openTime: { type: String, default: '09:15' },  // HH:MM format
    closeTime: { type: String, default: '15:30' }, // HH:MM format
    
    // Pre-market session (optional)
    preMarketOpen: { type: String, default: null },
    preMarketClose: { type: String, default: null },
    
    // Post-market session (optional)
    postMarketOpen: { type: String, default: null },
    postMarketClose: { type: String, default: null }
  },
  
  // Trading days (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  tradingDays: {
    type: [Number],
    default: [1, 2, 3, 4, 5] // Monday to Friday
  },
  
  // Holiday dates (trading not allowed on these dates)
  holidays: [{
    date: { type: Date, required: true },
    description: { type: String }
  }],
  
  // Special trading sessions (muhurat trading, etc.)
  specialSessions: [{
    date: { type: Date, required: true },
    openTime: { type: String, required: true },
    closeTime: { type: String, required: true },
    description: { type: String }
  }],
  
  // Auto square-off settings
  autoSquareOff: {
    enabled: { type: Boolean, default: true },
    time: { type: String, default: '15:15' }, // HH:MM format
    warningMinutes: { type: Number, default: 5 } // Warning before auto square-off
  },
  
  // Buffer time settings (allow trading X minutes before/after market hours)
  bufferTime: {
    beforeOpen: { type: Number, default: 0 }, // minutes
    afterClose: { type: Number, default: 0 }  // minutes
  },
  
  // Message to show when market is closed
  closedMessage: {
    type: String,
    default: 'Market is currently closed. Trading will resume during market hours.'
  },
  
  // Last updated
  updatedAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, { timestamps: true });

// Static method to check if market is open
marketControlSchema.statics.isMarketOpen = async function(marketName) {
  const market = await this.findOne({ market: marketName });
  if (!market) {
    console.log(`[MarketControl] No config found for ${marketName}, allowing trading`);
    return true; // If no config, allow trading
  }
  
  // Check master switch
  if (!market.isActive) {
    console.log(`[MarketControl] ${marketName} is disabled by admin`);
    return false;
  }
  
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const istNow = new Date(now.getTime() + istOffset);
  
  console.log(`[MarketControl] Checking ${marketName} - UTC: ${now.toISOString()}, IST adjusted: ${istNow.toISOString()}`);
  
  // Check if today is a trading day
  const dayOfWeek = istNow.getUTCDay();
  if (!market.tradingDays.includes(dayOfWeek)) {
    return false;
  }
  
  // Check if today is a holiday
  const todayStart = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  const isHoliday = market.holidays.some(h => {
    const holidayDate = new Date(h.date);
    return holidayDate.toDateString() === todayStart.toDateString();
  });
  if (isHoliday) {
    // Check for special session on holiday
    const specialSession = market.specialSessions.find(s => {
      const sessionDate = new Date(s.date);
      return sessionDate.toDateString() === todayStart.toDateString();
    });
    if (specialSession) {
      return isTimeInRange(istNow, specialSession.openTime, specialSession.closeTime);
    }
    return false;
  }
  
  // Check trading hours
  const openTime = market.tradingHours.openTime;
  const closeTime = market.tradingHours.closeTime;
  const bufferBefore = market.bufferTime.beforeOpen || 0;
  const bufferAfter = market.bufferTime.afterClose || 0;
  
  return isTimeInRange(istNow, openTime, closeTime, bufferBefore, bufferAfter);
};

// Static method to get market status with details
marketControlSchema.statics.getMarketStatus = async function(marketName) {
  const market = await this.findOne({ market: marketName });
  if (!market) {
    return { isOpen: true, message: 'No market configuration found', market: null };
  }
  
  const isOpen = await this.isMarketOpen(marketName);
  
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  
  let message = '';
  let nextOpenTime = null;
  
  if (!market.isActive) {
    message = market.closedMessage || 'Market is disabled by admin';
  } else if (!isOpen) {
    message = market.closedMessage || 'Market is currently closed';
    // Calculate next open time
    nextOpenTime = getNextOpenTime(market, istNow);
  } else {
    message = 'Market is open for trading';
  }
  
  return {
    isOpen,
    message,
    market: market.market,
    displayName: market.displayName,
    tradingHours: market.tradingHours,
    autoSquareOff: market.autoSquareOff,
    nextOpenTime,
    currentTime: istNow.toISOString()
  };
};

// Static method to seed default market configurations
marketControlSchema.statics.seedDefaults = async function() {
  const defaults = [
    {
      market: 'NSE',
      displayName: 'NSE EQ',
      tradingHours: { openTime: '09:15', closeTime: '15:30' },
      autoSquareOff: { enabled: true, time: '15:15', warningMinutes: 5 }
    },
    {
      market: 'NFO',
      displayName: 'NSE FUT / OPT',
      tradingHours: { openTime: '09:15', closeTime: '15:30' },
      autoSquareOff: { enabled: true, time: '15:15', warningMinutes: 5 }
    },
    {
      market: 'MCX',
      displayName: 'MCX FUT / OPT',
      tradingHours: { openTime: '09:00', closeTime: '23:30' },
      autoSquareOff: { enabled: true, time: '23:25', warningMinutes: 5 }
    },
    {
      market: 'BSE',
      displayName: 'BSE EQ',
      tradingHours: { openTime: '09:15', closeTime: '15:30' },
      autoSquareOff: { enabled: true, time: '15:15', warningMinutes: 5 }
    },
    {
      market: 'BFO',
      displayName: 'BSE FUT / OPT',
      tradingHours: { openTime: '09:15', closeTime: '15:30' },
      autoSquareOff: { enabled: true, time: '15:15', warningMinutes: 5 }
    },
    {
      market: 'CDS',
      displayName: 'Currency Derivatives',
      tradingHours: { openTime: '09:00', closeTime: '17:00' },
      autoSquareOff: { enabled: true, time: '16:55', warningMinutes: 5 }
    },
    {
      market: 'DELTA',
      displayName: 'Delta Exchange (Crypto Derivatives)',
      tradingHours: { openTime: '00:00', closeTime: '23:59' }, // 24/7/365
      tradingDays: [0, 1, 2, 3, 4, 5, 6], // All days including weekends
      autoSquareOff: { enabled: false, time: '17:30', warningMinutes: 5 }, // Options expire at 5:30 PM IST
      closedMessage: 'Delta Exchange is available 24/7/365 for crypto derivatives trading.'
    },
    {
      market: 'FOREX',
      displayName: 'Forex (International)',
      tradingHours: { openTime: '00:00', closeTime: '23:59' }, // 24/5
      tradingDays: [1, 2, 3, 4, 5], // Monday to Friday (closed on weekends)
      autoSquareOff: { enabled: false },
      closedMessage: 'Forex market is closed on weekends. Trading resumes Sunday 5 PM EST.'
    },
    {
      market: 'CRYPTO',
      displayName: 'Crypto (Spot)',
      tradingHours: { openTime: '00:00', closeTime: '23:59' },
      tradingDays: [0, 1, 2, 3, 4, 5, 6],
      autoSquareOff: { enabled: false },
      closedMessage: 'Crypto market is available 24/7/365.'
    },
    {
      market: 'STOCKS',
      displayName: 'International Stocks',
      tradingHours: { openTime: '00:00', closeTime: '23:59' },
      tradingDays: [1, 2, 3, 4, 5],
      autoSquareOff: { enabled: false },
      closedMessage: 'International stocks market is closed on weekends.'
    },
    {
      market: 'INDICES',
      displayName: 'International Indices',
      tradingHours: { openTime: '00:00', closeTime: '23:59' },
      tradingDays: [1, 2, 3, 4, 5],
      autoSquareOff: { enabled: false },
      closedMessage: 'Indices market is closed on weekends.'
    },
    {
      market: 'COMMODITIES',
      displayName: 'International Commodities',
      tradingHours: { openTime: '00:00', closeTime: '23:59' },
      tradingDays: [1, 2, 3, 4, 5],
      autoSquareOff: { enabled: false },
      closedMessage: 'Commodities market is closed on weekends.'
    }
  ];
  
  for (const config of defaults) {
    await this.findOneAndUpdate(
      { market: config.market },
      { $setOnInsert: config },
      { upsert: true, new: true }
    );
  }

  const { migrateMarketControlDisplayNames } = require('../utils/segmentDisplayNames');
  await migrateMarketControlDisplayNames(this);

  console.log('Market control defaults seeded');
};

// Helper function to check if current time is within range
// Note: 'now' is already in IST (adjusted Date object)
function isTimeInRange(istNow, openTime, closeTime, bufferBefore = 0, bufferAfter = 0) {
  const [openHour, openMin] = openTime.split(':').map(Number);
  const [closeHour, closeMin] = closeTime.split(':').map(Number);
  
  // Get IST hours and minutes from the adjusted date
  // Since we added IST offset, use getUTCHours/getUTCMinutes to get the IST time
  const currentHours = istNow.getUTCHours();
  const currentMins = istNow.getUTCMinutes();
  const currentMinutes = currentHours * 60 + currentMins;
  
  const openMinutes = openHour * 60 + openMin - bufferBefore;
  const closeMinutes = closeHour * 60 + closeMin + bufferAfter;
  
  console.log(`[MarketControl] Current IST: ${currentHours}:${currentMins} (${currentMinutes} mins), Open: ${openTime} (${openMinutes} mins), Close: ${closeTime} (${closeMinutes} mins)`);
  
  // Handle overnight sessions (e.g., MCX which closes at 23:30)
  if (closeMinutes < openMinutes) {
    const isOpen = currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
    console.log(`[MarketControl] Overnight session - isOpen: ${isOpen}`);
    return isOpen;
  }
  
  const isOpen = currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  console.log(`[MarketControl] Regular session - isOpen: ${isOpen}`);
  return isOpen;
}

// Helper function to get next market open time
function getNextOpenTime(market, now) {
  const [openHour, openMin] = market.tradingHours.openTime.split(':').map(Number);
  
  // Start from today
  let checkDate = new Date(now);
  
  for (let i = 0; i < 7; i++) {
    const dayOfWeek = checkDate.getUTCDay();
    
    // Check if it's a trading day
    if (market.tradingDays.includes(dayOfWeek)) {
      // Check if it's not a holiday
      const isHoliday = market.holidays.some(h => {
        const holidayDate = new Date(h.date);
        return holidayDate.toDateString() === checkDate.toDateString();
      });
      
      if (!isHoliday) {
        // If today and market hasn't opened yet
        if (i === 0) {
          const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
          const openMinutes = openHour * 60 + openMin;
          if (currentMinutes < openMinutes) {
            return new Date(checkDate.getUTCFullYear(), checkDate.getUTCMonth(), checkDate.getUTCDate(), openHour, openMin);
          }
        } else {
          return new Date(checkDate.getUTCFullYear(), checkDate.getUTCMonth(), checkDate.getUTCDate(), openHour, openMin);
        }
      }
    }
    
    // Move to next day
    checkDate.setUTCDate(checkDate.getUTCDate() + 1);
  }
  
  return null;
}

module.exports = mongoose.model('MarketControl', marketControlSchema);
