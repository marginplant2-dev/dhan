const mongoose = require('mongoose');

// ===== SPREAD SETTINGS =====
const spreadSettingSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true },
    spreadType: { type: String, enum: ['fixed', 'floating'], default: 'fixed' },
    spreadPips: { type: Number, default: 0, min: 0 },
    markupPips: { type: Number, default: 0, min: 0 },
    minSpread: { type: Number, default: 0, min: 0 },
    maxSpread: { type: Number, default: 100, min: 0 },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// ===== COMMISSION SETTINGS =====
const commissionSettingSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true },
    commissionType: { type: String, enum: ['per-lot', 'per-trade', 'percentage'], default: 'per-lot' },
    openCommission: { type: Number, default: 0, min: 0 },
    closeCommission: { type: Number, default: 0, min: 0 },
    minCommission: { type: Number, default: 0, min: 0 },
    maxCommission: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    chargeOnOpen: { type: Boolean, default: true },
    chargeOnClose: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// ===== SWAP SETTINGS =====
const swapSettingSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true },
    swapType: { type: String, enum: ['points', 'percentage', 'money'], default: 'points' },
    swapLong: { type: Number, default: 0 },
    swapShort: { type: Number, default: 0 },
    tripleSwapDay: { type: Number, default: 3, min: 0, max: 6 }, // 0=Sun, 3=Wed
    swapFreeEnabled: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// ===== MARGIN SETTINGS =====
const marginSettingSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true },
    marginMode: { type: String, enum: ['percentage', 'fixed', 'calculated'], default: 'percentage' },
    initialMarginRate: { type: Number, default: 100, min: 0 },
    maintenanceMarginRate: { type: Number, default: 50, min: 0 },
    hedgedMarginRate: { type: Number, default: 50, min: 0 },
    marginCallLevel: { type: Number, default: 100, min: 0 },
    stopOutLevel: { type: Number, default: 50, min: 0 },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// ===== LEVERAGE SETTINGS =====
const leverageSettingSchema = new mongoose.Schema({
    groupName: { type: String, required: true, unique: true },
    maxLeverage: { type: Number, default: 100, min: 1 },
    symbolOverrides: [{
        symbol: { type: String },
        maxLeverage: { type: Number, min: 1 }
    }],
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// ===== FEE SETTINGS =====
const feeSettingSchema = new mongoose.Schema({
    feeName: { type: String, required: true },
    feeType: { type: String, enum: ['account', 'inactivity', 'withdrawal', 'deposit', 'overnight', 'platform', 'data-feed'], required: true },
    chargeType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
    amount: { type: Number, default: 0, min: 0 },
    percentageRate: { type: Number, default: 0, min: 0, max: 100 },
    minAmount: { type: Number, default: 0, min: 0 },
    maxAmount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    frequency: { type: String, enum: ['per-trade', 'daily', 'weekly', 'monthly', 'yearly', 'one-time'], default: 'monthly' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

const SpreadSetting = mongoose.model('SpreadSetting', spreadSettingSchema);
const CommissionSetting = mongoose.model('CommissionSetting', commissionSettingSchema);
const SwapSetting = mongoose.model('SwapSetting', swapSettingSchema);
const MarginSetting = mongoose.model('MarginSetting', marginSettingSchema);
const LeverageSetting = mongoose.model('LeverageSetting', leverageSettingSchema);
const FeeSetting = mongoose.model('FeeSetting', feeSettingSchema);

module.exports = { SpreadSetting, CommissionSetting, SwapSetting, MarginSetting, LeverageSetting, FeeSetting };
