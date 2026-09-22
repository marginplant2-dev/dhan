/**
 * BinaryEngine - Time-Based UP/DOWN Trading
 * 
 * Key Features:
 * - No quantity scaling - fixed amount trades
 * - No SL/TP - outcome based on time expiry
 * - Trade is either WIN or LOSS
 * - Lock price at entry, compare at expiry
 * - Payout percentage configurable
 * - Wallet integration - deduct on entry, settle on expiry
 * - Market status validation
 */

const { BinaryTrade } = require('../models/Position');
const Trade = require('../models/Trade');
const TradeModeSettings = require('../models/Settings');
const User = require('../models/User');
const { getCachedUsdInrRate } = require('../services/currencyRateService');
const MarketControl = require('../models/MarketControl');
const ZerodhaSettings = require('../models/ZerodhaSettings');

class BinaryEngine {
  constructor(io) {
    this.io = io;
    this.tradeIdCounter = Date.now();
    this.activeTrades = new Map(); // tradeId -> timer
    
    // Indian market exchanges that need market timing check
    this.indianExchanges = ['NSE', 'NFO', 'MCX', 'BSE', 'BFO', 'CDS'];
  }

  generateTradeId() {
    return `BIN-${++this.tradeIdCounter}`;
  }

  // Get instrument details from Zerodha subscribed instruments
  async getInstrumentDetails(symbol) {
    try {
      const settings = await ZerodhaSettings.getSettings();
      const instrument = settings.subscribedInstruments.find(i => 
        i.symbol === symbol || i.symbol?.toUpperCase() === symbol.toUpperCase()
      );
      return instrument || null;
    } catch (error) {
      console.error('Error fetching instrument details:', error);
      return null;
    }
  }

  // Check if Indian market is open
  async isIndianMarketOpen(exchange) {
    try {
      const isOpen = await MarketControl.isMarketOpen(exchange);
      return isOpen;
    } catch (error) {
      console.error('Error checking Indian market status:', error);
      return true; // Allow trading if check fails
    }
  }

  async getSettings() {
    let settings = await TradeModeSettings.findOne({ mode: 'binary' });
    if (!settings) {
      settings = {
        enabled: true,
        minTradeAmount: 100,
        maxTradeAmount: 1000000,
        minExpiry: 60,
        maxExpiry: 86400,
        allowedExpiries: [60, 120, 300, 600, 900, 1800, 3600, 14400, 86400],
        payoutPercent: 85,
        refundOnTie: true
      };
    }
    return settings;
  }

  // Get or create user
  async getUser(userId) {
    let user = await User.findOne({ oderId: userId });
    if (!user) {
      user = new User({
        oderId: userId,
        email: `${userId}@guest.dhanfunded.com`,
        phone: `9999${userId}`,
        password: process.env.GUEST_DEFAULT_PASSWORD || 'guestpass123',
        name: 'Guest User',
        wallet: {
          balance: parseInt(process.env.GUEST_DEFAULT_BALANCE) || 10000,
          credit: 0,
          equity: parseInt(process.env.GUEST_DEFAULT_BALANCE) || 10000,
          margin: 0,
          freeMargin: parseInt(process.env.GUEST_DEFAULT_BALANCE) || 10000,
          marginLevel: 0
        }
      });
      await user.save();
    }
    return user;
  }

  async executeOrder(userId, orderData, marketData = null) {
    const settings = await this.getSettings();
    
    if (!settings.enabled) {
      throw new Error('Binary mode is currently disabled');
    }

    const {
      symbol,
      direction, // 'up' or 'down'
      amount,
      expiry, // seconds
      entryPrice,
      isMarketOpen = false,
      exchange: orderExchange  // Exchange passed from frontend
    } = orderData;

    // Check if this is an Indian market instrument
    const instrument = await this.getInstrumentDetails(symbol);
    const exchange = orderExchange || instrument?.exchange || null;
    
    console.log(`[BinaryEngine] Trade request - symbol: ${symbol}, exchange: ${exchange}, instrument found: ${!!instrument}`);

    // If it's an Indian market symbol, check market timing
    if (exchange && this.indianExchanges.includes(exchange.toUpperCase())) {
      const marketOpen = await this.isIndianMarketOpen(exchange);
      console.log(`[BinaryEngine] Indian market check - exchange: ${exchange}, isOpen: ${marketOpen}`);
      
      if (!marketOpen) {
        const marketStatus = await MarketControl.getMarketStatus(exchange);
        console.log(`[BinaryEngine] Market closed - rejecting trade. Message: ${marketStatus.message}`);
        throw new Error(marketStatus.message || `${exchange} market is currently closed. Trading is not allowed.`);
      }
    }

    // Check if market is open (live price data available) - for non-Indian markets
    if (!isMarketOpen && !entryPrice) {
      throw new Error('Market is closed. Trading is not available at this time.');
    }

    // Validate stake: min/max are stored in INR; wallet debits USD (`amount`)
    const usdInr = getCachedUsdInrRate() || 83;
    const stakeInr = amount * usdInr;
    if (stakeInr + 1e-9 < settings.minTradeAmount) {
      throw new Error(`Minimum trade amount is ₹${settings.minTradeAmount} (≈ $${(settings.minTradeAmount / usdInr).toFixed(2)} at current rate)`);
    }
    if (stakeInr > settings.maxTradeAmount + 1e-9) {
      throw new Error(`Maximum trade amount is ₹${settings.maxTradeAmount} (≈ $${(settings.maxTradeAmount / usdInr).toFixed(2)} at current rate)`);
    }

    // Validate expiry - use expiryOptions if available, fallback to allowedExpiries
    const allowedExpiries = settings.expiryOptions || settings.allowedExpiries || [60, 120, 300, 600, 900, 1800, 3600];
    
    if (expiry < settings.minExpiry) {
      throw new Error(`Minimum expiry is ${settings.minExpiry} seconds`);
    }
    if (expiry > settings.maxExpiry) {
      throw new Error(`Maximum expiry is ${settings.maxExpiry} seconds`);
    }
    if (!allowedExpiries.includes(expiry)) {
      throw new Error(`Expiry ${expiry}s is not allowed. Allowed: ${allowedExpiries.join(', ')}s`);
    }

    // Get user and check balance
    const user = await this.getUser(userId);

    // Demo mode: Allow trading even without sufficient balance
    if (user.wallet.balance < amount) {
      console.log(`[DEMO MODE] Insufficient balance warning. Required: $${amount}, Available: $${user.wallet.balance.toFixed(2)}. Adding virtual funds.`);
      user.wallet.balance += amount * 2;
      user.wallet.equity = user.wallet.balance + user.wallet.credit;
      user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
    }

    const tradeId = this.generateTradeId();

    // Create trade in MongoDB
    const trade = new BinaryTrade({
      tradeId,
      userId,
      symbol,
      direction,
      amount,
      entryPrice,
      expiry,
      expiryTime: new Date(Date.now() + expiry * 1000),
      status: 'active',
      result: null,
      payout: 0
    });

    // Save trade and update wallet in parallel for speed
    const [savedTrade] = await Promise.all([
      trade.save(),
      (async () => {
        user.wallet.balance -= amount;
        user.wallet.equity = user.wallet.balance + user.wallet.credit;
        user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
        return user.save();
      })()
    ]);

    // Fire-and-forget: Trade history (non-critical, don't wait)
    const historyTrade = new Trade({
      tradeId: `TRD-${Date.now()}`,
      oderId: tradeId,
      userId,
      mode: 'binary',
      symbol,
      side: direction,
      amount,
      entryPrice,
      expiry,
      type: 'binary',
      executedAt: new Date()
    });
    historyTrade.save().catch(err => console.error('Trade history save error:', err));

    // Set timer for expiry
    this.setExpiryTimer(tradeId, userId, expiry);

    // Get active trades (can be done async but user expects immediate response)
    const userTrades = await BinaryTrade.find({ userId, status: 'active' }).lean();

    return {
      success: true,
      trade: { ...trade.toObject(), mode: 'binary' },
      positions: userTrades.map(t => ({ ...t, mode: 'binary' })),
      wallet: user.wallet,
      message: `${direction.toUpperCase()} trade placed: $${amount} on ${symbol}, expires in ${expiry}s`
    };
  }

  setExpiryTimer(tradeId, userId, expiry) {
    const timer = setTimeout(async () => {
      await this.resolveTrade(tradeId, userId);
    }, expiry * 1000);

    this.activeTrades.set(tradeId, timer);
  }

  async resolveTrade(tradeId, userId, currentPrice = null) {
    const settings = await this.getSettings();
    
    const trade = await BinaryTrade.findOne({ tradeId, userId });
    if (!trade || trade.status !== 'active') {
      console.log(`Trade ${tradeId} not found or already completed`);
      return;
    }

    // Get current price - in production this should come from live feed
    // For now, simulate with small random movement if not provided
    let exitPrice = currentPrice;
    if (!exitPrice) {
      // Simulate price movement (this should be replaced with actual price feed)
      const priceChange = (Math.random() - 0.5) * 0.002 * trade.entryPrice;
      exitPrice = trade.entryPrice + priceChange;
    }

    // Determine result
    let result;
    let payout = 0;

    if (exitPrice > trade.entryPrice) {
      result = trade.direction === 'up' ? 'win' : 'lose';
    } else if (exitPrice < trade.entryPrice) {
      result = trade.direction === 'down' ? 'win' : 'lose';
    } else {
      // Tie
      result = settings.refundOnTie ? 'tie' : 'lose';
    }

    // Calculate payout
    if (result === 'win') {
      payout = trade.amount + (trade.amount * (settings.payoutPercent / 100));
    } else if (result === 'tie') {
      payout = trade.amount; // Refund original amount
    } else {
      payout = 0; // Lost the stake
    }

    // Update trade in MongoDB
    trade.status = 'completed';
    trade.result = result;
    trade.exitPrice = exitPrice;
    trade.payout = payout;
    trade.completedAt = new Date();
    await trade.save();

    // Get user and settle P/L
    const user = await this.getUser(userId);
    
    // Add payout to balance
    user.wallet.balance += payout;
    user.wallet.equity = user.wallet.balance + user.wallet.credit;
    user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
    
    // Update stats
    user.stats.totalTrades += 1;
    const netPnL = payout - trade.amount;
    if (netPnL > 0) {
      user.stats.winningTrades += 1;
      user.stats.totalProfit += netPnL;
    } else if (netPnL < 0) {
      user.stats.losingTrades += 1;
      user.stats.totalLoss += Math.abs(netPnL);
    }
    user.stats.netPnL = user.stats.totalProfit - user.stats.totalLoss;
    
    await user.save();

    // Add to trade history
    const historyTrade = new Trade({
      tradeId: `TRD-${Date.now()}`,
      oderId: tradeId,
      userId,
      mode: 'binary',
      symbol: trade.symbol,
      side: trade.direction,
      amount: trade.amount,
      entryPrice: trade.entryPrice,
      closePrice: exitPrice,
      expiry: trade.expiry,
      profit: payout - trade.amount,
      result,
      type: 'binary',
      closedAt: new Date()
    });
    await historyTrade.save();

    // Remove from active trades
    const timer = this.activeTrades.get(tradeId);
    if (timer) {
      clearTimeout(timer);
      this.activeTrades.delete(tradeId);
    }

    // Emit result to user via Socket.IO
    if (this.io) {
      this.io.to(userId).emit('binaryResult', {
        trade: { ...trade.toObject(), mode: 'binary' },
        result,
        payout,
        wallet: user.wallet,
        message: result === 'win' 
          ? `🎉 You won $${(payout - trade.amount).toFixed(2)}!`
          : result === 'tie'
          ? `↔️ Tie - Amount refunded`
          : `❌ You lost $${trade.amount.toFixed(2)}`
      });

      const userTrades = await BinaryTrade.find({ userId }).sort({ createdAt: -1 });
      this.io.to(userId).emit('positionUpdate', {
        mode: 'binary',
        positions: userTrades.map(t => ({ ...t.toObject(), mode: 'binary' })),
        wallet: user.wallet
      });
    }

    console.log(`Binary trade ${tradeId} resolved: ${result}, payout: $${payout.toFixed(2)}`);

    return {
      success: true,
      trade: { ...trade.toObject(), mode: 'binary' },
      result,
      payout,
      wallet: user.wallet
    };
  }

  async getActiveTrades(userId) {
    const trades = await BinaryTrade.find({ userId, status: 'active' });
    return trades.map(t => ({ ...t.toObject(), mode: 'binary' }));
  }

  async getCompletedTrades(userId) {
    const trades = await BinaryTrade.find({ userId, status: 'completed' }).sort({ completedAt: -1 });
    return trades.map(t => ({ ...t.toObject(), mode: 'binary' }));
  }

  async getPositions(userId) {
    const trades = await BinaryTrade.find({ userId, status: 'active' }).lean();
    return trades.map(t => ({ ...t, mode: 'binary' }));
  }

  async cancelTrade(tradeId, userId) {
    const trade = await BinaryTrade.findOne({ tradeId, userId, status: 'active' });
    if (!trade) {
      throw new Error('Trade not found or already completed');
    }

    // Clear timer
    const timer = this.activeTrades.get(tradeId);
    if (timer) {
      clearTimeout(timer);
      this.activeTrades.delete(tradeId);
    }

    // Refund the amount
    const user = await this.getUser(userId);
    user.wallet.balance += trade.amount;
    user.wallet.equity = user.wallet.balance + user.wallet.credit;
    user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
    await user.save();

    // Update trade status
    trade.status = 'cancelled';
    trade.completedAt = new Date();
    await trade.save();

    return {
      success: true,
      wallet: user.wallet,
      message: 'Trade cancelled and refunded'
    };
  }

  // Get user wallet info
  async getWallet(userId) {
    const user = await this.getUser(userId);
    return user.wallet;
  }
}

module.exports = BinaryEngine;
