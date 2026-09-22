const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatfundedtrade';

const connectDB = async () => {
  try {
    // Optimized connection settings for low-latency trading
    const conn = await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 100,        // Maximum number of connections in the pool
      minPoolSize: 20,         // Keep more warm connections ready
      maxIdleTimeMS: 60000,    // Keep connections alive longer (60s)
      serverSelectionTimeoutMS: 3000, // Faster server selection
      socketTimeoutMS: 30000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000, // More frequent heartbeat
      retryWrites: true,
      retryReads: true,
      w: 1,                    // Fast write - acknowledge from primary only
      journal: false,          // Skip journal for speed (trades are not critical)
      family: 4                // Use IPv4
    });
    console.log(`📦 MongoDB Connected: ${conn.connection.host} (Pool: 20-100, w:1)`);
    
    // Initialize default settings if not exist
    await initializeSettings();
    
    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

const initializeSettings = async () => {
  const TradeModeSettings = require('../models/Settings');
  
  const defaultSettings = [
    {
      mode: 'hedging',
      enabled: true,
      minLotSize: 0.01,
      maxLotSize: 100,
      maxPositionsPerSymbol: 10,
      maxTotalPositions: 50,
      allowPartialClose: true,
      allowModifySLTP: true,
      defaultLeverage: 100
    },
    {
      mode: 'netting',
      enabled: true,
      minQuantity: 1,
      maxQuantity: 10000,
      intradayMaxQuantity: 5000,
      carryForwardMaxQuantity: 2000,
      autoSquareOffTime: '15:30',
      allowCarryForward: true,
      intradayMarginPercent: 20,
      carryForwardMarginPercent: 100
    },
    {
      mode: 'binary',
      enabled: true,
      minTradeAmount: 100,
      maxTradeAmount: 1000000,
      minExpiry: 60,
      maxExpiry: 3600,
      allowedExpiries: [60, 120, 300, 600, 900, 1800, 3600],
      payoutPercent: 85,
      refundOnTie: true
    }
  ];

  // Only insert defaults if they don't exist - don't overwrite existing settings
  for (const setting of defaultSettings) {
    const existing = await TradeModeSettings.findOne({ mode: setting.mode });
    if (!existing) {
      await TradeModeSettings.create(setting);
      console.log(`⚙️ Created default ${setting.mode} settings`);
    }
  }
  
  console.log('⚙️ Trade mode settings initialized');
};

module.exports = { connectDB, MONGODB_URI };
