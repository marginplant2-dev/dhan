/**
 * HedgingEngine - Forex/Crypto MT5-Style Trading
 * 
 * Key Features:
 * - Multiple positions allowed on the same symbol
 * - Buy and Sell can exist together (hedging)
 * - Each trade is independent with its own SL/TP
 * - Partial close supported
 * - Position ID based tracking
 * - Wallet integration with margin management
 * - Market status validation
 */

const { HedgingPosition } = require('../models/Position');
const Trade = require('../models/Trade');
const TradeModeSettings = require('../models/Settings');
const User = require('../models/User');
const MarketControl = require('../models/MarketControl');
const ZerodhaSettings = require('../models/ZerodhaSettings');
const UserSegmentSettings = require('../models/UserSegmentSettings');
const ReorderSettings = require('../models/ReorderSettings');
const UserRiskSettings = require('../models/UserRiskSettings');
const perfTimer = require('../utils/perfTimer');
const mt5 = require('../utils/mt5Calculations');
const tradeHooksService = require('../services/tradeHooks.service');
const pnlSharingService = require('../services/pnlSharing.service');

class HedgingEngine {
  constructor() {
    this.positionIdCounter = Date.now();
    
    // Indian market exchanges that need market timing check
    // Note: DELTA, FOREX, CRYPTO are NOT included - they trade 24/7 or 24/5
    this.indianExchanges = ['NSE', 'NFO', 'MCX', 'BSE', 'BFO', 'CDS'];
  }

  generatePositionId() {
    return `HED-${++this.positionIdCounter}`;
  }

  // Check if symbol is from Indian market
  isIndianMarketSymbol(symbol, exchange) {
    if (exchange && this.indianExchanges.includes(exchange.toUpperCase())) {
      return true;
    }
    // Common Indian stock suffixes
    const indianSuffixes = ['-EQ', '-BE', '-BZ', '.NS', '.BO'];
    return indianSuffixes.some(suffix => symbol.toUpperCase().endsWith(suffix));
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
    // 5s in-memory cache — same rationale as NettingEngine.
    const now = Date.now();
    if (this._settingsCache && (now - this._settingsCacheAt) < 5000) {
      return this._settingsCache;
    }
    let settings = await TradeModeSettings.findOne({ mode: 'hedging' }).lean();
    if (!settings) {
      settings = {
        enabled: true,
        minLotSize: 0.01,
        maxLotSize: 100,
        maxPositionsPerSymbol: 10,
        maxTotalPositions: 50,
        allowPartialClose: true,
        allowModifySLTP: true,
        defaultLeverage: 100,
        allowIndianInstruments: false
      };
    }
    this._settingsCache = settings;
    this._settingsCacheAt = now;
    return settings;
  }

  // Calculate effective max lots based on limit type (lot or price)
  calculateEffectiveMaxLots(limitType, maxValue, maxLots, currentPrice, lotSize = 1) {
    if (limitType === 'price' && maxValue > 0 && currentPrice > 0) {
      const calculatedMaxLots = Math.floor(maxValue / (currentPrice * lotSize));
      return Math.max(1, calculatedMaxLots);
    }
    return maxLots || 100;
  }

  // Get segment name for an instrument based on exchange, segment, and instrument type
  getSegmentNameForInstrument(exchange, segment, instrumentType, symbol = '') {
    const isFutures = instrumentType === 'FUT' || segment === 'FUT' || segment?.includes('FUT');
    const isOptions = ['CE', 'PE'].includes(instrumentType) || segment?.includes('OPT');
    
    // Normalize and handle Forex/Crypto segments first
    const ex = exchange ? exchange.toUpperCase() : '';
    const seg = segment ? segment.toUpperCase() : '';
    const sym = symbol ? symbol.toUpperCase() : '';
    
    // Detect Forex by symbol pattern (e.g., EURUSD, GBPJPY, etc.)
    const forexPairs = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
    const isForexSymbol = forexPairs.some(curr => sym.includes(curr)) &&
                          (sym.includes('/') || forexPairs.filter(curr => sym.includes(curr)).length >= 2);

    // Detect Crypto by symbol pattern
    const cryptoSymbols = ['BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOT', 'DOGE', 'SOL', 'AVAX', 'MATIC', 'BCH', 'LINK'];
    const isCryptoSymbol = cryptoSymbols.some(crypto => sym.includes(crypto));

    // Detect Commodities by symbol pattern
    const commoditySymbols = ['XAU', 'XAG', 'GOLD', 'SILVER', 'OIL', 'BRENT', 'WTI'];
    const isCommoditySymbol = commoditySymbols.some(comm => sym.includes(comm));

    // Detect Indices by symbol pattern
    const indexSymbols = ['US30', 'US100', 'US500', 'UK100', 'DE30', 'JP225', 'NAS100', 'SPX500', 'DJ30'];
    const isIndexSymbol = indexSymbols.some(idx => sym.includes(idx));

    // Order of checks is LOAD-BEARING:
    //   Crypto → Commodities → Indices → Forex → Stocks
    // Why crypto first: MetaAPI feeds crypto CFDs (BTCUSD, ETHUSD, etc.) with
    // exchange="FOREX" under its forex stream, so trusting `ex === 'FOREX'`
    // first would apply forex segment settings to crypto trades. Symbol-
    // pattern detection is more reliable than the broker's exchange label.
    if (ex === 'CRYPTO' || seg === 'CRYPTO' || isCryptoSymbol) {
      return 'CRYPTO';
    }
    if (ex === 'COMMODITIES' || seg === 'COMMODITIES' || ex === 'COMEX' || isCommoditySymbol) return 'COMMODITIES';
    if (ex === 'INDICES' || seg === 'INDICES' || isIndexSymbol) return 'INDICES';
    if (ex === 'FOREX' || seg === 'FOREX' || isForexSymbol) return 'FOREX';
    if (ex === 'STOCKS' || seg === 'STOCKS' || ex === 'NYSE' || ex === 'NASDAQ') return 'STOCKS';
    
    // Map Indian markets
    if (ex === 'NSE') {
      if (isFutures) return 'NSE_FUT';
      else if (isOptions) return 'NSE_OPT';
      else return 'NSE_EQ';
    } else if (ex === 'BSE') {
      if (isFutures) return 'BSE_FUT';
      else if (isOptions) return 'BSE_OPT';
      else return 'BSE_EQ';
    } else if (ex === 'MCX') {
      if (isOptions) return 'MCX_OPT';
      else return 'MCX_FUT';
    } else if (ex === 'NFO') {
      if (isOptions) return 'NSE_OPT';
      else return 'NSE_FUT';
    } else if (ex === 'BFO') {
      if (isOptions) return 'BSE_OPT';
      else return 'BSE_FUT';
    }
    
    // Default fallback
    return 'NSE_EQ';
  }

  // Apply reorder delay and calculate execution price
  async applyReorderDelay(userId, segmentName, originalPrice, side, getCurrentPrice) {
    try {
      console.log(`[Reorder] Checking reorder for user: ${userId}, segment: ${segmentName}`);
      const reorderConfig = await ReorderSettings.getDelayForTrade(userId, segmentName);
      console.log(`[Reorder] Config received:`, JSON.stringify(reorderConfig));
      
      if (!reorderConfig || reorderConfig.delaySeconds <= 0) {
        console.log(`[Reorder] No delay configured or delay is 0`);
        return { executionPrice: originalPrice, delayed: false, delaySeconds: 0 };
      }
      
      const delaySeconds = reorderConfig.delaySeconds;
      console.log(`[Reorder] Applying ${delaySeconds}s delay for user ${userId}, segment ${segmentName}`);
      
      // Wait for the delay
      await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
      
      // Get current price after delay
      const currentPrice = await getCurrentPrice();
      
      // Calculate execution price based on price mode
      const executionPrice = ReorderSettings.calculateExecutionPrice(
        originalPrice,
        currentPrice,
        side,
        reorderConfig.priceMode
      );
      
      console.log(`[Reorder] Original: ${originalPrice}, Current: ${currentPrice}, Execution: ${executionPrice}, Mode: ${reorderConfig.priceMode}`);
      
      return { 
        executionPrice, 
        delayed: true, 
        delaySeconds,
        originalPrice,
        currentPrice,
        priceMode: reorderConfig.priceMode
      };
    } catch (error) {
      console.error('[Reorder] Error applying delay:', error);
      return { executionPrice: originalPrice, delayed: false, delaySeconds: 0 };
    }
  }

  // Get segment settings for a user and symbol (uses HedgingSegment collection so admin Hedging Segment Settings apply)
  async getSegmentSettingsForTrade(userId, symbol, exchange, segment, instrumentType) {
    try {
      const HedgingSegment = require('../models/HedgingSegment');
      const segmentName = this.getSegmentNameForInstrument(exchange, segment, instrumentType);

      const segmentDoc = await HedgingSegment.findOne({ name: segmentName });
      if (!segmentDoc) return null;

      const effectiveSettings = await UserSegmentSettings.getEffectiveSettingsForUser(
        userId, segmentDoc._id, symbol, 'hedging'
      );
      return effectiveSettings;
    } catch (error) {
      console.error('Error getting segment settings for trade:', error);
      return null;
    }
  }

  // Get or create user
  async getUser(userId) {
    let user = await User.findOne({ oderId: userId });
    // Fallback: if userId looks like a MongoDB ObjectId (24-char hex), try _id lookup
    // This prevents ghost user creation when admin "Login as User" sends _id instead of oderId
    if (!user && /^[0-9a-fA-F]{24}$/.test(userId)) {
      user = await User.findById(userId);
      if (user) {
        console.log(`[HedgingEngine] getUser: resolved _id ${userId} → oderId ${user.oderId}`);
      }
    }
    if (!user) {
      // Create guest user with demo balance
      user = new User({
        oderId: userId,
        email: `${userId}@guest.dhanfunded.com`,
        phone: `9999${userId}`, // Guest phone
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
    // Ensure freeMargin is set correctly if user exists but has 0 freeMargin
    if (user.wallet.freeMargin === 0 && user.wallet.balance > 0) {
      user.wallet.equity = user.wallet.balance + user.wallet.credit;
      user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
      await user.save();
    }
    return user;
  }

  // Calculate margin required for position (MT5 Standard Formula)
  // Uses shared MT5 utility for consistency
  calculateMargin(volume, price, leverage, symbol = '', customContractSize = null) {
    return mt5.calculateMargin(volume, price, leverage, symbol, customContractSize);
  }

  // Calculate P/L for a position (MT5 Standard Formula)
  // Uses shared MT5 utility for consistency
  calculatePnL(position, currentPrice) {
    return mt5.calculatePnL(
      position.side,
      position.entryPrice,
      currentPrice,
      position.volume || 0,
      position.symbol || '',
      position.contractSize,
      position.isJPYPair
    );
  }

  /** Commission helper (aligned with NettingEngine): per_lot, per_crore, percentage, fixed */
  calculateCommission(commissionType, commissionValue, lots, quantity, price) {
    if (!commissionValue || commissionValue <= 0) return 0;
    switch (commissionType) {
      case 'per_lot':
        return commissionValue * lots;
      case 'per_crore':
        return (quantity * price / 10000000) * commissionValue;
      case 'percentage':
        return (quantity * price * commissionValue) / 100;
      case 'fixed':
        return commissionValue;
      default:
        return commissionValue * lots;
    }
  }

  /**
   * Overnight swap / rollover (aligned with NettingEngine).
   * points: swapLong/Short × lots × contractSize (account currency per pip-style unit)
   * percentage: (notional × rate) / 100 / 365 daily
   * money: fixed per lot
   */
  calculateSwap(swapType, swapValue, lots, quantity, price, contractSize = 1) {
    if (!swapValue) return 0;
    let raw;
    switch (swapType) {
      case 'points':
        raw = swapValue * lots * contractSize;
        break;
      case 'percentage':
        raw = (quantity * price * swapValue) / 100 / 365;
        break;
      case 'money':
        raw = swapValue * lots;
        break;
      default:
        raw = swapValue * lots * contractSize;
    }
    // Swap is ALWAYS a deduction (Fix 14). Mirrors NettingEngine.calculateSwap.
    return -Math.abs(raw);
  }

  /**
   * Apply overnight swap to all open hedging positions (cron / EOD).
   * Uses Hedging Segment swapType, swapLong, swapShort, tripleSwapDay (0=Sun … 3=Wed).
   */
  async applyOvernightSwap() {
    const { HedgingPosition } = require('../models/Position');
    console.log('[HedgingEngine] Applying overnight swap to open hedging positions...');
    const today = new Date();
    const dayOfWeek = today.getDay();
    const openPositions = await HedgingPosition.find({ status: 'open' });
    let totalSwapCharged = 0;
    let positionsProcessed = 0;
    const swapResults = [];

    for (const position of openPositions) {
      try {
        const segmentSettings = await this.getSegmentSettingsForTrade(
          position.userId,
          position.symbol,
          position.exchange,
          position.segment
        );
        if (!segmentSettings) continue;

        const swapType = segmentSettings.swapType || 'points';
        const swapLong = segmentSettings.swapLong ?? 0;
        const swapShort = segmentSettings.swapShort ?? 0;
        const tripleSwapDay = segmentSettings.tripleSwapDay ?? 3;
        if (swapLong === 0 && swapShort === 0) continue;

        const swapValue = position.side === 'buy' ? swapLong : swapShort;
        const contractSize = position.contractSize || mt5.getContractSize(position.symbol);
        const quantity = position.volume * contractSize;
        const price = position.currentPrice || position.entryPrice;
        let swapAmount = this.calculateSwap(
          swapType,
          swapValue,
          position.volume,
          quantity,
          price,
          contractSize
        );

        if (dayOfWeek === tripleSwapDay) {
          swapAmount *= 3;
          console.log(`[HedgingEngine] Triple swap (day ${tripleSwapDay}=Wed if 3): ×3`);
        }
        if (swapAmount === 0) continue;

        position.swap = (position.swap || 0) + swapAmount;
        await position.save();

        const user = await User.findOne({ oderId: position.userId });
        if (user) {
          user.wallet.balance += swapAmount;
          user.wallet.equity = user.wallet.balance + user.wallet.credit;
          user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
          await user.save();
        }

        totalSwapCharged += swapAmount;
        positionsProcessed++;
        swapResults.push({
          positionId: position.oderId,
          symbol: position.symbol,
          side: position.side,
          volume: position.volume,
          swapAmount,
          isTripleDay: dayOfWeek === tripleSwapDay
        });
        console.log(`[HedgingEngine] Swap ${position.oderId} ${position.symbol}: ${swapAmount.toFixed(4)}`);
      } catch (err) {
        console.error(`[HedgingEngine] Swap error ${position.oderId}:`, err.message);
      }
    }

    console.log(`[HedgingEngine] Overnight swap done — positions: ${positionsProcessed}, total: ${totalSwapCharged.toFixed(2)}`);
    return {
      success: true,
      positionsProcessed,
      totalSwapCharged,
      dayOfWeek,
      results: swapResults
    };
  }

  /**
   * Apply segment spread/markup (pips → price). Floating uses same base as fixed; live bid/ask is separate feed layer.
   */
  applySpreadToExecutionPrice(executionPrice, side, segmentSettings, symbol) {
    if (!segmentSettings) return executionPrice;
    const spreadPips = segmentSettings.spreadPips || 0;
    const markupPips = segmentSettings.markupPips || 0;
    const totalPips = spreadPips + markupPips;
    if (totalPips <= 0) return executionPrice;
    const sym = (symbol || '').toUpperCase();
    const pipSize = segmentSettings.pipSize ?? (sym.includes('JPY') ? 0.01 : 0.0001);
    const spreadType = segmentSettings.spreadType || 'floating';
    let appliedPips = totalPips;
    if (spreadType === 'floating') {
      console.log(`[HedgingEngine] Floating spread base: ${appliedPips} pips`);
    } else if (spreadType === 'fixed') {
      console.log(`[HedgingEngine] Fixed spread: ${appliedPips} pips`);
    } else if (spreadType === 'variable') {
      console.log(`[HedgingEngine] Variable spread: ${appliedPips} pips (range ${spreadPips}-${totalPips})`);
    }
    const spreadPrice = appliedPips * pipSize;
    if (side === 'buy') return executionPrice + spreadPrice;
    return executionPrice - spreadPrice;
  }

  computeMarginForHedgingOpen(volume, marginPrice, leverage, symbol, customContractSize, segmentSettings, userPositions, side, instrumentType, instrument, segmentName) {
    let marginRequired = 0;
    if (segmentSettings && segmentSettings.marginMode === 'fixed') {
      marginRequired = volume * (segmentSettings.marginRate || 100);
      console.log(`[HedgingEngine] Using fixed margin mode: ${marginRequired}`);
    } else {
      marginRequired = this.calculateMargin(volume, marginPrice, leverage, symbol, customContractSize);
    }
    const hedgedMarginRate = segmentSettings?.hedgedMarginRate ?? 50;
    const oppositeVolume = userPositions
      .filter(p => p.symbol === symbol && p.side !== side)
      .reduce((sum, p) => sum + (p.volume || 0), 0);
    const hedgedVolume = Math.min(volume, oppositeVolume);
    const unhedgedVolume = volume - hedgedVolume;
    if (hedgedVolume > 0 && marginRequired > 0) {
      const fullMarginPerLot = marginRequired / volume;
      marginRequired = fullMarginPerLot * (unhedgedVolume + hedgedVolume * (hedgedMarginRate / 100));
      console.log(`[HedgingEngine] Hedged margin: ${hedgedVolume} lots at ${hedgedMarginRate}% → margin ${marginRequired.toFixed(2)}`);
    }
    if (segmentSettings) {
      const isOptionsInstrument = instrumentType === 'OPT' || instrumentType === 'CE' || instrumentType === 'PE' ||
        instrument?.segment === 'OPT' || segmentName?.includes('_OPT');
      if (isOptionsInstrument) {
        if (side === 'buy' && segmentSettings.optionBuyIntraday != null && segmentSettings.optionBuyIntraday > 0) {
          marginRequired = segmentSettings.optionBuyIntraday * volume;
        } else if (side === 'sell' && segmentSettings.optionSellIntraday != null && segmentSettings.optionSellIntraday > 0) {
          marginRequired = segmentSettings.optionSellIntraday * volume;
        }
      } else if (segmentSettings.intradayHolding != null && segmentSettings.intradayHolding > 0) {
        marginRequired = segmentSettings.intradayHolding * volume;
      }
    }
    return marginRequired;
  }

  async executeOrder(userId, orderData, marketData = null, getCurrentPriceCallback = null) {
    const _pt = perfTimer.start('hedging.executeOrder');
    const settings = await this.getSettings();
    _pt.mark('getSettings');

    if (!settings.enabled) {
      throw new Error('Hedging mode is currently disabled');
    }

    const {
      symbol,
      orderType,
      side,
      volume,
      price,
      stopLoss,
      takeProfit,
      leverage = settings.defaultLeverage,
      isMarketOpen = false,
      exchange: orderExchange  // Exchange passed from frontend
    } = orderData;

    // Check if this is an Indian market instrument
    const instrument = await this.getInstrumentDetails(symbol);
    _pt.mark('instrument');
    const exchange = orderExchange || instrument?.exchange || null;

    const isIndianSegment =
      (exchange && this.indianExchanges.includes(String(exchange).toUpperCase())) ||
      this.isIndianMarketSymbol(symbol, exchange);
    if (isIndianSegment && settings.allowIndianInstruments !== true) {
      throw new Error(
        'Hedging mode is not for Indian segments (NSE, NFO, MCX, BSE, BFO, CDS). Use Netting mode for Indian instruments.'
      );
    }

    // Determine segment name for reorder settings
    const instrumentType = instrument?.instrumentType || '';
    const segmentName = this.getSegmentNameForInstrument(exchange, instrument?.segment, instrumentType, symbol);

    console.log(`[HedgingEngine] Trade request - symbol: ${symbol}, exchange: ${exchange}, instrument found: ${!!instrument}`);

    // Check if market is open (live price data available) - for non-Indian markets
    // (fail fast before any DB work)
    if (!isMarketOpen && !price) {
      throw new Error('Market is closed. Trading is not available at this time.');
    }

    // ============== PARALLEL FETCH (Phase 11 perf fix) ==============
    // These 5 reads don't depend on each other. Firing them together turns
    // ~5 sequential round-trips into 1. Single biggest latency win on Atlas.
    const needsIndianCheck = exchange && this.indianExchanges.includes(String(exchange).toUpperCase());
    const [
      indianMarketResult,
      segmentSettings,
      effectiveRiskSettings,
      user,
      userPositions,
    ] = await Promise.all([
      needsIndianCheck ? this.isIndianMarketOpen(exchange) : Promise.resolve(true),
      this.getSegmentSettingsForTrade(userId, symbol, exchange, instrument?.segment),
      UserRiskSettings.getEffectiveSettings(userId),
      this.getUser(userId),
      HedgingPosition.find({ userId, status: 'open' }),
    ]);
    _pt.mark('parallel-reads');

    // Indian market gate (moved here so the rejection includes the fresh status doc)
    if (needsIndianCheck && !indianMarketResult) {
      const marketStatus = await MarketControl.getMarketStatus(exchange);
      console.log(`[HedgingEngine] Market closed - rejecting trade. Message: ${marketStatus.message}`);
      throw new Error(marketStatus.message || `${exchange} market is currently closed. Trading is not allowed.`);
    }

    // ============== BLOCK SETTINGS ENFORCEMENT ==============
    if (segmentSettings) {
      // Check if segment is active
      if (segmentSettings.isActive === false) {
        throw new Error(`Trading is not available for this segment. Segment is inactive.`);
      }
      // Check if trading is enabled for this segment
      if (segmentSettings.tradingEnabled === false) {
        throw new Error(`Trading is blocked for ${segmentName || 'this segment'}.`);
      }
      // Check if options are blocked (for options instruments)
      const isOptionsInstrument = instrumentType === 'OPT' || instrumentType === 'CE' || instrumentType === 'PE' ||
                                   instrument?.segment === 'OPT' || segmentName?.includes('_OPT');
      if (segmentSettings.blockOptions === true && isOptionsInstrument) {
        throw new Error(`Options trading is blocked for ${segmentName || 'this segment'}.`);
      }
      // Check if fractional lots are blocked
      if (segmentSettings.blockFractionLot === true && volume % 1 !== 0) {
        throw new Error(`Fractional lot trading is blocked for ${segmentName || 'this segment'}. Please use whole lot sizes.`);
      }
      // Check exit-only mode - global/user settings first, then segment
      const isExitOnlyMode = effectiveRiskSettings?.exitOnlyMode === true || segmentSettings.exitOnlyMode === true;
      if (isExitOnlyMode) {
        throw new Error(`Exit only mode is enabled. Only closing existing positions is allowed.`);
      }
    }

    // ============== LEVERAGE ENFORCEMENT (segment overrides user choice) ==============
    let effectiveLeverage = leverage;
    if (segmentSettings) {
      if (segmentSettings.fixedLeverage != null && segmentSettings.fixedLeverage > 0) {
        // Admin locked leverage — ignore whatever the user sent
        effectiveLeverage = segmentSettings.fixedLeverage;
      } else {
        // Cap at maxLeverage
        if (segmentSettings.maxLeverage != null && segmentSettings.maxLeverage > 0 && effectiveLeverage > segmentSettings.maxLeverage) {
          throw new Error(`Maximum leverage for this segment is 1:${segmentSettings.maxLeverage}`);
        }
        // Validate against allowed leverage options list
        if (segmentSettings.leverageOptions) {
          const allowed = String(segmentSettings.leverageOptions).split(',').map(v => Number(v.trim())).filter(v => !isNaN(v) && v > 0);
          if (allowed.length > 0 && !allowed.includes(effectiveLeverage)) {
            throw new Error(`Leverage 1:${effectiveLeverage} is not allowed for this segment. Allowed values: ${allowed.join(', ')}`);
          }
        }
        // Apply defaultLeverage if user didn't send one
        if (!effectiveLeverage || effectiveLeverage <= 0) {
          effectiveLeverage = segmentSettings.defaultLeverage || settings.defaultLeverage || 100;
        }
      }
    }

    // ============== LOT/QTY VALIDATION ==============
    // Validate volume - use segment settings if available
    let minLot = settings.minLotSize;
    let maxLot = settings.maxLotSize;
    const lotSize = instrument?.lotSize || 1;
    
    if (segmentSettings) {
      minLot = segmentSettings.minLots || minLot;
      maxLot = this.calculateEffectiveMaxLots(
        segmentSettings.limitType,
        segmentSettings.maxValue,
        segmentSettings.maxLots,
        price,
        lotSize
      );
      console.log(`[HedgingEngine] Segment settings - limitType: ${segmentSettings.limitType}, maxValue: ${segmentSettings.maxValue}, effectiveMaxLots: ${maxLot}`);
    }
    
    // For equity, use "quantity" terminology; for F&O, use "lots"
    const isEquity = exchange && ['NSE', 'BSE'].includes(exchange.toUpperCase()) && 
                     (!instrument?.segment || instrument.segment === 'EQ' || instrument.segment === 'NSE' || instrument.segment === 'BSE');
    const unitLabel = isEquity ? 'quantity' : 'lots';
    
    if (volume < minLot) {
      throw new Error(`Minimum ${unitLabel} is ${minLot}`);
    }
    if (volume > maxLot) {
      const limitInfo = segmentSettings?.limitType === 'price'
        ? ` (based on max value ₹${segmentSettings.maxValue} at price ₹${price})`
        : '';
      throw new Error(`Maximum ${unitLabel} is ${maxLot}${limitInfo}`);
    }

    // ============== PER ORDER LOT ENFORCEMENT (orderLots) ==============
    // Caps how many lots a user can place in a single order (separate from max position size)
    if (segmentSettings && segmentSettings.orderLots != null && segmentSettings.orderLots > 0) {
      if (volume > segmentSettings.orderLots) {
        throw new Error(`Per order ${unitLabel} limit is ${segmentSettings.orderLots}. You are trying to trade ${volume} ${unitLabel}.`);
      }
    }

    // ============== LOT STEP ENFORCEMENT ==============
    // Volume must be minLot + n * lotStep (e.g. step 0.1 → 0.1, 0.2, 0.3...)
    const lotStep = segmentSettings?.lotStep;
    if (lotStep != null && lotStep > 0) {
      const stepsFromMin = (volume - minLot) / lotStep;
      if (Math.abs(stepsFromMin - Math.round(stepsFromMin)) > 1e-6) {
        const examples = [minLot, minLot + lotStep, minLot + 2 * lotStep].map(v => v.toFixed(Math.max(0, Math.ceil(-Math.log10(lotStep)))));
        throw new Error(`Volume must be in increments of ${lotStep}. Valid examples: ${examples.join(', ')}...`);
      }
    }

    // ============== PER ORDER QTY ENFORCEMENT ==============
    if (segmentSettings) {
      const quantity = volume * lotSize;
      if (segmentSettings.perOrderQty != null && segmentSettings.perOrderQty > 0) {
        if (quantity > segmentSettings.perOrderQty) {
          throw new Error(`Per order quantity limit is ${segmentSettings.perOrderQty}. You are trying to trade ${quantity}.`);
        }
      }
    }

    // `user` and `userPositions` were pre-fetched in the parallel block above.

    // ============== MAX QTY HOLDING & MAX EXCHANGE LOTS ENFORCEMENT ==============
    if (segmentSettings) {
      // Max Qty Holding - total qty across all open positions in this segment
      if (segmentSettings.maxQtyHolding != null && segmentSettings.maxQtyHolding > 0) {
        const quantity = volume * lotSize;
        const currentTotalQty = userPositions
          .filter(p => {
            // For hedging, match by exchange since we don't have segment name directly
            return p.exchange === exchange;
          })
          .reduce((sum, p) => sum + ((p.volume || 0) * (p.lotSize || lotSize)), 0);
        
        if (currentTotalQty + quantity > segmentSettings.maxQtyHolding) {
          throw new Error(`Max quantity holding limit is ${segmentSettings.maxQtyHolding}. Current: ${currentTotalQty}, Requested: ${quantity}.`);
        }
      }
      
      // Max Exchange Lots - total lots held across this exchange
      if (segmentSettings.maxExchangeLots != null && segmentSettings.maxExchangeLots > 0) {
        const currentExchangeLots = userPositions
          .filter(p => p.exchange === exchange)
          .reduce((sum, p) => sum + (p.volume || 0), 0);
        
        if (currentExchangeLots + volume > segmentSettings.maxExchangeLots) {
          throw new Error(`Max exchange lot limit is ${segmentSettings.maxExchangeLots}. Current: ${currentExchangeLots}, Requested: ${volume}.`);
        }
      }
    }

    // ============== OPTIONS STRIKE VALIDATION ==============
    if (segmentSettings && instrument) {
      const isOptionsInstrument = instrumentType === 'OPT' || instrumentType === 'CE' || instrumentType === 'PE' || 
                                   instrument?.segment === 'OPT' || segmentName?.includes('_OPT');
      if (isOptionsInstrument && instrument.strikePrice && price > 0) {
        if (side === 'buy' && segmentSettings.buyingStrikeFar != null && segmentSettings.buyingStrikeFar > 0) {
          const strikeDistance = Math.abs(instrument.strikePrice - price);
          if (strikeDistance > segmentSettings.buyingStrikeFar) {
            throw new Error(`Buying strike too far from market. Max allowed distance: ${segmentSettings.buyingStrikeFar}, Current distance: ${strikeDistance.toFixed(2)}.`);
          }
        }
        if (side === 'sell' && segmentSettings.sellingStrikeFar != null && segmentSettings.sellingStrikeFar > 0) {
          const strikeDistance = Math.abs(instrument.strikePrice - price);
          if (strikeDistance > segmentSettings.sellingStrikeFar) {
            throw new Error(`Selling strike too far from market. Max allowed distance: ${segmentSettings.sellingStrikeFar}, Current distance: ${strikeDistance.toFixed(2)}.`);
          }
        }
      }
    }

    // ============== LIMIT POINTS ENFORCEMENT ==============
    if (segmentSettings && segmentSettings.limitAwayPoints != null && segmentSettings.limitAwayPoints > 0) {
      if (orderType === 'limit' || orderType === 'pending') {
        const marketPrice = marketData?.lastPrice || marketData?.ltp || price;
        const pointsAway = Math.abs(price - marketPrice);
        if (pointsAway > segmentSettings.limitAwayPoints) {
          throw new Error(`Limit order is ${pointsAway.toFixed(2)} points away from market. Maximum allowed: ${segmentSettings.limitAwayPoints} points.`);
        }
      }
    }

    // Check position limits (segment overrides global when set)
    const maxPerSymbol = segmentSettings?.maxPositionsPerSymbol ?? settings.maxPositionsPerSymbol;
    const maxTotal = segmentSettings?.maxTotalPositions ?? settings.maxTotalPositions;
    const symbolPositions = userPositions.filter(p => p.symbol === symbol);
    if (symbolPositions.length >= maxPerSymbol) {
      throw new Error(`Maximum ${maxPerSymbol} positions per symbol allowed`);
    }
    if (userPositions.length >= maxTotal) {
      throw new Error(`Maximum ${maxTotal} total open positions allowed`);
    }

    const customContractSize = segmentSettings?.contractSize || null;

    // Apply reorder delay if configured
    let executionPrice = price;
    let reorderInfo = null;
    
    if (getCurrentPriceCallback) {
      // Get user's MongoDB _id for reorder check (userDelays uses ObjectId)
      const userMongoId = user._id ? user._id.toString() : userId;
      reorderInfo = await this.applyReorderDelay(
        userMongoId, 
        segmentName, 
        price, 
        side, 
        getCurrentPriceCallback
      );
      executionPrice = reorderInfo.executionPrice;
      
      if (reorderInfo.delayed) {
        console.log(`[HedgingEngine] Reorder applied - Original: ${price}, Execution: ${executionPrice}, Delay: ${reorderInfo.delaySeconds}s`);
      }
    }

    const isPendingOrder = orderType === 'limit' || orderType === 'stop';
    if (!isPendingOrder && segmentSettings && !orderData.spreadPreApplied) {
      executionPrice = this.applySpreadToExecutionPrice(executionPrice, side, segmentSettings, symbol);
    }
    const marginPrice = isPendingOrder ? price : executionPrice;
    let marginRequired = this.computeMarginForHedgingOpen(
      volume,
      marginPrice,
      effectiveLeverage,
      symbol,
      customContractSize,
      segmentSettings,
      userPositions,
      side,
      instrumentType,
      instrument,
      segmentName
    );

    // ============== OPEN COMMISSION (pre-check) ==============
    // Compute commission BEFORE the affordability check so margin + commission
    // is validated as a single test. Without this, a user with exactly margin's
    // worth of free margin could open a position whose commission drops their
    // free margin negative → instant margin call.
    let precomputedOpenCommission = 0;
    if (!isPendingOrder && segmentSettings?.openCommission != null && segmentSettings.openCommission > 0) {
      const cs = customContractSize || mt5.getContractSize(symbol);
      const tradeQty = volume * cs;
      const commType = segmentSettings.commissionType || 'per_lot';
      precomputedOpenCommission = this.calculateCommission(
        commType,
        segmentSettings.openCommission,
        volume,
        tradeQty,
        executionPrice || price
      );
    }

    // MT5 Standard: Reject trade if insufficient free margin for margin + commission.
    const totalRequired = marginRequired + precomputedOpenCommission;
    if (user.wallet.freeMargin < totalRequired) {
      if (isIndianSegment) {
        let usdInrRate = 1;
        try {
          const { getCachedUsdInrRate } = require('../services/kiteService');
          usdInrRate = getCachedUsdInrRate() || 1;
        } catch (e) {}
        const mInr = marginRequired * usdInrRate;
        const cInr = precomputedOpenCommission * usdInrRate;
        const availInr = user.wallet.freeMargin * usdInrRate;
        throw new Error(
          precomputedOpenCommission > 0
            ? `Insufficient margin. Required: ₹${(mInr + cInr).toFixed(2)} (Margin ₹${mInr.toFixed(2)} + Commission ₹${cInr.toFixed(2)}), Available: ₹${availInr.toFixed(2)}`
            : `Insufficient margin. Required: ₹${mInr.toFixed(2)}, Available: ₹${availInr.toFixed(2)}`
        );
      }
      throw new Error(
        precomputedOpenCommission > 0
          ? `Insufficient margin. Required: $${totalRequired.toFixed(2)} (Margin $${marginRequired.toFixed(2)} + Commission $${precomputedOpenCommission.toFixed(2)}), Available: $${user.wallet.freeMargin.toFixed(2)}`
          : `Insufficient margin. Required: $${marginRequired.toFixed(2)}, Available: $${user.wallet.freeMargin.toFixed(2)}`
      );
    }

    const orderId = this.generatePositionId();

    // ============== MT5-STYLE PENDING ORDER VALIDATION ==============
    // Validate pending order price placement according to MT5 rules:
    // - Buy Limit: Must be BELOW current Ask price (buy cheaper)
    // - Buy Stop: Must be ABOVE current Ask price (buy on breakout)
    // - Sell Limit: Must be ABOVE current Bid price (sell higher)
    // - Sell Stop: Must be BELOW current Bid price (sell on breakdown)
    if (isPendingOrder && marketData) {
      const currentAsk = marketData.ask || price;
      const currentBid = marketData.bid || price;
      const minDistance = 0; // Minimum points away from current price (can be configured)
      
      if (orderType === 'limit') {
        if (side === 'buy' && price >= currentAsk) {
          throw new Error(`Buy Limit price (${price}) must be below current Ask price (${currentAsk}). Use Buy Stop for prices above market.`);
        }
        if (side === 'sell' && price <= currentBid) {
          throw new Error(`Sell Limit price (${price}) must be above current Bid price (${currentBid}). Use Sell Stop for prices below market.`);
        }
      } else if (orderType === 'stop') {
        if (side === 'buy' && price <= currentAsk) {
          throw new Error(`Buy Stop price (${price}) must be above current Ask price (${currentAsk}). Use Buy Limit for prices below market.`);
        }
        if (side === 'sell' && price >= currentBid) {
          throw new Error(`Sell Stop price (${price}) must be below current Bid price (${currentBid}). Use Sell Limit for prices above market.`);
        }
      }
    }
    
    const orderStatus = isPendingOrder ? 'pending' : 'open';
    
    // For pending orders, use the user-specified price (not execution price)
    // For market orders, use the execution price (reorder + spread)
    const orderPrice = isPendingOrder ? price : executionPrice;

    // ============== OPEN COMMISSION (charge — affordability already verified) ==============
    let openCommissionCharged = precomputedOpenCommission;
    if (openCommissionCharged > 0) {
      user.wallet.balance -= openCommissionCharged;
      user.wallet.equity = user.wallet.balance + user.wallet.credit;
      user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
      console.log(`[HedgingEngine] Open commission (per side): ${openCommissionCharged.toFixed(2)} (${segmentSettings.commissionType || 'per_lot'})`);
    }

    // Create new position in MongoDB
    const position = new HedgingPosition({
      oderId: orderId,
      userId,
      symbol,
      side,
      volume,
      entryPrice: orderPrice,
      currentPrice: orderPrice,
      stopLoss: stopLoss || null,
      takeProfit: takeProfit || null,
      leverage: effectiveLeverage,
      marginUsed: marginRequired,
      swap: 0,
      commission: openCommissionCharged,
      openCommission: openCommissionCharged,
      closeCommission: 0,
      profit: 0,
      orderType,
      status: orderStatus,
      exchange: exchange || null,
      segment: segmentName || null,
      contractSize: customContractSize || mt5.getContractSize(symbol),
      digits: segmentSettings?.digits ?? 5,
      pipSize: segmentSettings?.pipSize ?? 0.0001,
      pipValue: segmentSettings?.pipValue ?? 10,
      isJPYPair: mt5.isJPYPair(symbol),
      // For pending orders, store the trigger price
      triggerPrice: isPendingOrder ? price : null,
      pendingOrderType: isPendingOrder ? orderType : null
    });

    // Save position and update wallet in parallel for speed
    // For pending orders, we still reserve the margin
    user.useMargin(marginRequired);
    await Promise.all([
      position.save(),
      user.save()
    ]);
    _pt.mark('save');

    // Fire-and-forget: Trade history (non-critical, don't wait)
    const trade = new Trade({
      tradeId: `TRD-${Date.now()}`,
      oderId: orderId,
      userId,
      mode: 'hedging',
      symbol,
      side,
      volume,
      entryPrice: orderPrice,
      originalPrice: reorderInfo?.delayed ? price : undefined,
      reorderDelay: reorderInfo?.delaySeconds || 0,
      stopLoss: stopLoss || null,
      takeProfit: takeProfit || null,
      leverage,
      type: isPendingOrder ? 'pending' : 'open',
      executedAt: new Date()
    });
    trade.save().catch(err => console.error('Trade history save error:', err));

    // Get updated positions with lean() for faster queries (returns plain objects)
    // Parallel — both hit HedgingPosition with different status filters.
    const [updatedPositions, pendingOrders] = await Promise.all([
      HedgingPosition.find({ userId, status: 'open' }).lean(),
      HedgingPosition.find({ userId, status: 'pending' }).lean(),
    ]);
    _pt.mark('post-reads');

    // Different message for pending vs executed orders
    const message = isPendingOrder
      ? `${orderType.toUpperCase()} order placed: ${side.toUpperCase()} ${volume} lots of ${symbol} @ ${price}`
      : `${side.toUpperCase()} ${volume} lots of ${symbol} opened at ${orderPrice}`;

    _pt.end();
    return {
      success: true,
      position: position.toObject(),
      positions: updatedPositions.map(p => ({ ...p, mode: 'hedging' })),
      pendingOrders: pendingOrders.map(p => ({ ...p, mode: 'hedging' })),
      wallet: user.wallet,
      message,
      isPendingOrder
    };
  }

  async closePosition(userId, positionId, closeVolume, currentPrice = null, options = {}) {
    const settings = await this.getSettings();
    const mongoose = require('mongoose');
    
    // Find position in MongoDB - try by _id first if valid ObjectId, then by oderId
    let position;
    if (mongoose.Types.ObjectId.isValid(positionId)) {
      position = await HedgingPosition.findOne({ _id: positionId, userId, status: 'open' });
    }
    if (!position) {
      position = await HedgingPosition.findOne({ oderId: positionId, userId, status: 'open' });
    }
    if (!position) {
      throw new Error('Position not found');
    }

    // Check if market is open
    if (!currentPrice) {
      throw new Error('Market is closed. Cannot close position without live price.');
    }

    const volumeToClose = closeVolume || position.volume;
    const closePrice = currentPrice;

    // Calculate P/L
    let profit = this.calculatePnL({ ...position.toObject(), volume: volumeToClose }, closePrice);

    if (!options.skipTradeHold) {
      const riskManagement = require('../services/riskManagement.service');
      await riskManagement.assertTradeHoldAllowed(userId, position.openTime, profit);
    }

    // ============== CLOSE COMMISSION (per side — charged at close) ==============
    let commissionAmount = 0;
    try {
      const posExchange = position.exchange || null;
      const posSegmentSettings = await this.getSegmentSettingsForTrade(userId, position.symbol, posExchange, position.segment);
      if (posSegmentSettings) {
        const commType = posSegmentSettings.commissionType || 'per_lot';
        // Per-side: closeCommission. Legacy `commission` on close only if this ticket had no open-side fee charged
        let commValue = posSegmentSettings.closeCommission;
        if (commValue == null || commValue <= 0) {
          const hadOpenFeeOnTicket = (position.openCommission || 0) > 0;
          if (!hadOpenFeeOnTicket) {
            commValue = posSegmentSettings.commission;
          }
        }
        if (commValue != null && commValue > 0) {
          const cs = position.contractSize || mt5.getContractSize(position.symbol);
          const tradeQty = volumeToClose * cs;
          let commissionInr = this.calculateCommission(commType, commValue, volumeToClose, tradeQty, closePrice);
          // Admin values are always in INR — convert to USD for wallet (profit is in USD for hedging instruments)
          const { getCachedUsdInrRate } = require('../services/currencyRateService');
          const usdInrRate = getCachedUsdInrRate() || 1;
          commissionAmount = commissionInr / usdInrRate;
          profit -= commissionAmount;
          console.log(`[HedgingEngine] Close commission (per side): ₹${commissionInr.toFixed(2)} → $${commissionAmount.toFixed(4)} (${commType}, rate: ${usdInrRate}). Net profit: ${profit.toFixed(2)}`);
        }
      }
    } catch (commErr) {
      console.error('[HedgingEngine] Commission calculation error:', commErr.message);
    }

    // Get user
    const user = await this.getUser(userId);

    // Calculate margin to release
    const marginToRelease = (volumeToClose / position.volume) * position.marginUsed;

    // ============== CLEAN SETTLEMENT (no undo/re-apply) ==============
    // Open commission: already deducted from balance at open time ✓
    // Swap charges: already deducted from balance each night ✓
    // Close commission: deduct from balance NOW
    // Raw PnL (price diff): settle to balance NOW
    const accumulatedSwap = position.swap || 0;
    const openComm = position.openCommission || 0;
    
    // Deduct close commission from balance directly
    if (commissionAmount > 0) {
      user.wallet.balance -= commissionAmount;
      // Negative balance protection: don't let commission alone push below 0
      if (user.wallet.balance < 0) {
        console.log(`[HedgingEngine][NB-PROTECTION] Close commission pushed balance to ${user.wallet.balance.toFixed(4)}, capping to 0`);
        user.wallet.balance = 0;
      }
    }
    
    // Raw profit is already calculated above (line 931) — this is the pure price movement PnL
    // `profit` at this point = rawPnL - closeCommission (close commission was subtracted at line 957)
    // We need to add back the close commission since we already deducted it from balance above
    const rawProfit = profit + commissionAmount; // Undo the closeComm subtraction from profit to get raw PnL
    
    // Display profit includes all charges for the History tab
    const displayProfit = rawProfit - openComm - commissionAmount + accumulatedSwap;

    if (volumeToClose >= position.volume) {
      // Full close - update position status
      position.status = 'closed';
      position.closeTime = new Date();
      position.closePrice = closePrice;
      position.profit = displayProfit; // Full P/L for display (includes comm + swap)
      position.closeCommission = commissionAmount;
      position.commission = openComm + commissionAmount;
      await position.save();
      
      // Release margin and settle ONLY raw price PnL
      // (commissions handled: open at open-time, close just above, swap nightly)
      user.releaseMargin(position.marginUsed);
      user.settlePnL(rawProfit);
      await user.save();

      // Add to trade history
      const trade = new Trade({
        tradeId: `TRD-${Date.now()}`,
        oderId: position.oderId,
        userId,
        mode: 'hedging',
        symbol: position.symbol,
        side: position.side,
        volume: position.volume,
        entryPrice: position.entryPrice,
        closePrice,
        profit: displayProfit,
        type: 'close',
        closedBy: options.closeReason === 'stop_out' ? 'stop_out' : options.closeReason || 'user',
        remark: options.closeReason === 'stop_out' ? 'Stop Out' : options.closeReason === 'sl' ? 'SL' : options.closeReason === 'tp' ? 'TP' : options.closeReason === 'auto_square_off' ? 'Auto Square-Off' : 'User',
        closedAt: new Date()
      });
      await trade.save();

      // Process IB commission and copy trading hooks (async, don't block)
      tradeHooksService.onTradeClose({
        userId,
        oderId: position.oderId,
        tradeId: trade.tradeId,
        positionId: position.oderId,
        symbol: position.symbol,
        side: position.side,
        volume: position.volume,
        entryPrice: position.entryPrice,
        closePrice,
        profit,
        mode: 'hedging'
      }).catch(err => console.error('[HedgingEngine] Trade hook error:', err));

      // Distribute PnL to admin hierarchy
      pnlSharingService.distributePnL({
        tradeId: trade._id,
        tradeOderId: trade.tradeId,
        positionId: position._id,
        positionOderId: position.oderId,
        userId: user._id,
        userOderId: userId,
        userName: user.name,
        symbol: position.symbol,
        segment: position.segment,
        exchange: position.exchange,
        side: position.side,
        volume: position.volume,
        quantity: position.quantity,
        pnl: profit
      }).catch(err => console.error('[PnL Sharing] Distribution error:', err));

    } else if (settings.allowPartialClose) {
      // Partial close - reduce volume (close commission proportional to closed lots)
      const originalVolume = position.volume;
      position.volume -= volumeToClose;
      position.marginUsed -= marginToRelease;
      position.closeCommission = (position.closeCommission || 0) + commissionAmount;
      position.commission = (position.openCommission || 0) + position.closeCommission;
      await position.save();
      
      // Release partial margin and settle partial raw P/L
      // (close commission already deducted from balance above)
      user.releaseMargin(marginToRelease);
      user.settlePnL(rawProfit);
      await user.save();

      // Add partial close to history
      const trade = new Trade({
        tradeId: `TRD-${Date.now()}`,
        oderId: position.oderId,
        userId,
        mode: 'hedging',
        symbol: position.symbol,
        side: position.side,
        volume: volumeToClose,
        entryPrice: position.entryPrice,
        closePrice,
        profit,
        type: 'partial_close',
        closedBy: options.closeReason === 'stop_out' ? 'stop_out' : options.closeReason || 'user',
        remark: options.closeReason === 'stop_out' ? 'Stop Out' : options.closeReason === 'sl' ? 'SL' : options.closeReason === 'tp' ? 'TP' : 'User',
        closedAt: new Date()
      });
      await trade.save();

      // Process IB commission and copy trading hooks for partial close
      tradeHooksService.onTradeClose({
        userId,
        oderId: position.oderId,
        tradeId: trade.tradeId,
        positionId: position.oderId,
        symbol: position.symbol,
        side: position.side,
        volume: volumeToClose,
        entryPrice: position.entryPrice,
        closePrice,
        profit,
        mode: 'hedging'
      }).catch(err => console.error('[HedgingEngine] Trade hook error:', err));

    } else {
      throw new Error('Partial close is not allowed');
    }

    // Get updated positions
    const updatedPositions = await HedgingPosition.find({ userId, status: 'open' });

    return {
      success: true,
      profit,
      positions: updatedPositions.map(p => p.toObject()),
      wallet: user.wallet,
      message: `Closed ${volumeToClose} lots with P/L: $${profit.toFixed(2)}`
    };
  }

  async modifyPosition(userId, positionId, modifications) {
    const settings = await this.getSettings();
    
    if (!settings.allowModifySLTP) {
      throw new Error('Modifying SL/TP is not allowed');
    }

    // Find position in MongoDB
    const position = await HedgingPosition.findOne({ oderId: positionId, userId, status: 'open' });
    if (!position) {
      throw new Error('Position not found');
    }
    
    if (modifications.stopLoss !== undefined) {
      position.stopLoss = modifications.stopLoss;
    }
    if (modifications.takeProfit !== undefined) {
      position.takeProfit = modifications.takeProfit;
    }

    await position.save();

    // Add modify to trade history
    const trade = new Trade({
      tradeId: `TRD-${Date.now()}`,
      oderId: position.oderId,
      userId,
      mode: 'hedging',
      symbol: position.symbol,
      side: position.side,
      volume: position.volume,
      entryPrice: position.entryPrice,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      type: 'modify',
      executedAt: new Date()
    });
    await trade.save();

    // Get updated positions
    const updatedPositions = await HedgingPosition.find({ userId, status: 'open' });

    return {
      success: true,
      position: position.toObject(),
      positions: updatedPositions.map(p => p.toObject()),
      message: 'Position modified successfully'
    };
  }

  async getPositions(userId) {
    const positions = await HedgingPosition.find({ userId: userId, status: 'open' }).lean();
    return positions.map(p => ({ ...p, mode: 'hedging' }));
  }

  async updatePositionPrices(userId, priceUpdates) {
    const positions = await HedgingPosition.find({ userId, status: 'open' });
    let totalUnrealizedPnL = 0;
    let totalMargin = 0;
    
    for (const position of positions) {
      const priceData = priceUpdates[position.symbol];
      if (priceData) {
        position.currentPrice = position.side === 'buy' ? priceData.bid : priceData.ask;
        position.profit = this.calculatePnL(position, position.currentPrice);
        await position.save();
      }
      totalUnrealizedPnL += position.profit || 0;
      totalMargin += position.marginUsed || 0;
    }

    // Update user equity AND margin (MT5-style: recalculate both from live positions)
    const user = await this.getUser(userId);
    user.wallet.margin = totalMargin;
    user.updateEquity(totalUnrealizedPnL);
    await user.save();

    return {
      positions: positions.map(p => ({ ...p.toObject(), mode: 'hedging' })),
      wallet: user.wallet
    };
  }

  // Get user wallet info
  async getWallet(userId) {
    const user = await this.getUser(userId);
    return user.wallet;
  }

  // Get pending orders for a user
  async getPendingOrders(userId) {
    const pendingOrders = await HedgingPosition.find({ userId, status: 'pending' });
    return pendingOrders.map(p => ({ ...p.toObject(), mode: 'hedging' }));
  }

  // Cancel a pending order
  async cancelPendingOrder(userId, orderId) {
    const mongoose = require('mongoose');
    
    let order;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await HedgingPosition.findOne({ _id: orderId, userId, status: 'pending' });
    }
    if (!order) {
      order = await HedgingPosition.findOne({ oderId: orderId, userId, status: 'pending' });
    }
    
    if (!order) {
      throw new Error('Pending order not found');
    }

    // Release the reserved margin
    const user = await this.getUser(userId);
    user.releaseMargin(order.marginUsed);
    
    // Update order status
    order.status = 'cancelled';
    order.closeTime = new Date();
    
    await Promise.all([order.save(), user.save()]);

    // Log the cancellation
    const trade = new Trade({
      tradeId: `TRD-${Date.now()}`,
      oderId: order.oderId,
      userId,
      mode: 'hedging',
      symbol: order.symbol,
      side: order.side,
      volume: order.volume,
      entryPrice: order.entryPrice,
      type: 'cancelled',
      executedAt: new Date()
    });
    trade.save().catch(err => console.error('Trade history save error:', err));

    const pendingOrders = await HedgingPosition.find({ userId, status: 'pending' }).lean();

    return {
      success: true,
      message: `Pending order ${order.oderId} cancelled`,
      pendingOrders: pendingOrders.map(p => ({ ...p, mode: 'hedging' })),
      wallet: user.wallet
    };
  }

  // Check and execute pending orders when price reaches trigger level
  // This should be called periodically with live price updates
  async checkPendingOrders(userId, priceUpdates) {
    const pendingOrders = await HedgingPosition.find({ userId, status: 'pending' });
    const executedOrders = [];

    for (const order of pendingOrders) {
      const priceData = priceUpdates[order.symbol];
      if (!priceData) continue;

      const currentPrice = order.side === 'buy' ? priceData.ask : priceData.bid;
      const triggerPrice = order.triggerPrice || order.entryPrice;
      let shouldExecute = false;

      // MT5-style pending order execution logic:
      // BUY LIMIT: Triggers when Ask price falls to or below the trigger price
      // BUY STOP: Triggers when Ask price rises to or above the trigger price
      // SELL LIMIT: Triggers when Bid price rises to or above the trigger price
      // SELL STOP: Triggers when Bid price falls to or below the trigger price
      
      if (order.orderType === 'limit') {
        if (order.side === 'buy' && priceData.ask <= triggerPrice) {
          shouldExecute = true;
        } else if (order.side === 'sell' && priceData.bid >= triggerPrice) {
          shouldExecute = true;
        }
      } else if (order.orderType === 'stop') {
        if (order.side === 'buy' && priceData.ask >= triggerPrice) {
          shouldExecute = true;
        } else if (order.side === 'sell' && priceData.bid <= triggerPrice) {
          shouldExecute = true;
        }
      }

      if (shouldExecute) {
        // Activate the pending order - convert to open position
        order.status = 'open';
        order.entryPrice = currentPrice; // Execute at current market price
        order.currentPrice = currentPrice;
        order.activatedAt = new Date();
        order.openTime = new Date();
        await order.save();

        // Log the execution
        const trade = new Trade({
          tradeId: `TRD-${Date.now()}`,
          oderId: order.oderId,
          userId,
          mode: 'hedging',
          symbol: order.symbol,
          side: order.side,
          volume: order.volume,
          entryPrice: currentPrice,
          originalPrice: triggerPrice,
          type: 'open',
          executedAt: new Date()
        });
        trade.save().catch(err => console.error('Trade history save error:', err));

        executedOrders.push({
          ...order.toObject(),
          mode: 'hedging',
          executedAt: currentPrice,
          triggerPrice
        });

        console.log(`[HedgingEngine] Pending order executed: ${order.oderId} ${order.side} ${order.volume} ${order.symbol} @ ${currentPrice} (trigger: ${triggerPrice})`);
      }
    }

    return executedOrders;
  }
}

module.exports = HedgingEngine;
