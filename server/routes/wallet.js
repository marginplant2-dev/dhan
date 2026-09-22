const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const walletService = require('../services/wallet.service');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const IBCopySettings = require('../models/IBCopySettings');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'BharatFundedTrade-secret-key-2024';

// Middleware to verify JWT and set req.user
const authMiddleware = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized - No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// Middleware to verify admin
const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// ===== USER ROUTES =====

/**
 * Get all user wallets
 * GET /api/wallet
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const wallets = await walletService.getUserWallets(req.user._id);
    res.json({ success: true, data: wallets });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get wallet summary
 * GET /api/wallet/summary
 */
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const summary = await walletService.getWalletSummary(req.user._id);
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get specific wallet
 * GET /api/wallet/:type
 */
router.get('/:type', authMiddleware, async (req, res) => {
  try {
    const wallet = await walletService.getWallet(req.user._id, req.params.type);
    if (!wallet) {
      return res.status(404).json({ success: false, error: 'Wallet not found' });
    }
    res.json({ success: true, data: wallet });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get transaction history
 * GET /api/wallet/transactions
 */
router.get('/transactions/history', authMiddleware, async (req, res) => {
  try {
    const { walletType, page, limit, type, startDate, endDate } = req.query;
    const result = await walletService.getTransactionHistory(req.user._id, walletType, {
      page: parseInt(page),
      limit: parseInt(limit),
      type,
      startDate,
      endDate
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Transfer between wallets
 * POST /api/wallet/transfer
 */
router.post('/transfer', authMiddleware, async (req, res) => {
  try {
    const { fromType, toType, amount, description } = req.body;

    if (!fromType || !toType || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (amount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be positive' });
    }

    // Check if transfers are allowed
    const settings = await IBCopySettings.getSettings();
    if (!settings.wallet.allowInternalTransfers) {
      return res.status(400).json({ success: false, error: 'Internal transfers are disabled' });
    }

    const result = await walletService.transfer(
      req.user._id,
      req.user.oderId,
      fromType,
      toType,
      amount,
      description || 'Internal transfer'
    );

    res.json({
      success: true,
      message: 'Transfer successful',
      data: result
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Request withdrawal
 * POST /api/wallet/withdraw
 */
router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const { walletType, amount, method, details } = req.body;

    if (!walletType || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Get settings
    const settings = await IBCopySettings.getSettings();
    
    if (amount < settings.wallet.minWithdrawal) {
      return res.status(400).json({ 
        success: false, 
        error: `Minimum withdrawal amount is ₹${settings.wallet.minWithdrawal}`
      });
    }

    // Check balance
    const wallet = await walletService.getWallet(req.user._id, walletType);
    if (!wallet || wallet.balance - wallet.frozenBalance < amount) {
      return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }

    // Freeze the amount
    await walletService.freezeFunds(req.user._id, walletType, amount);

    // Create withdrawal request (integrate with your existing withdrawal system)
    const withdrawalRequest = await WalletTransaction.create({
      walletId: wallet._id,
      userId: req.user._id,
      oderId: req.user.oderId,
      walletType,
      type: 'withdrawal',
      amount,
      balanceAfter: wallet.balance,
      description: `Withdrawal request via ${method || 'default'}`,
      status: 'pending',
      metadata: { method, details }
    });

    res.json({
      success: true,
      message: 'Withdrawal request submitted for approval',
      data: withdrawalRequest
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== ADMIN ROUTES =====

/**
 * Get all wallets (admin)
 * GET /api/wallet/admin/list
 */
router.get('/admin/list', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, search } = req.query;

    const query = {};
    if (type) query.type = type;
    if (search) {
      query.oderId = { $regex: search, $options: 'i' };
    }

    const total = await Wallet.countDocuments(query);
    const wallets = await Wallet.find(query)
      .populate('userId', 'name email oderId')
      .sort({ balance: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        wallets,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get pending withdrawals (admin)
 * GET /api/wallet/admin/withdrawals/pending
 */
router.get('/admin/withdrawals/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const query = { type: 'withdrawal', status: 'pending' };

    const total = await WalletTransaction.countDocuments(query);
    const withdrawals = await WalletTransaction.find(query)
      .populate('userId', 'name email oderId')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        withdrawals,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Approve withdrawal (admin)
 * POST /api/wallet/admin/withdrawals/:id/approve
 */
router.post('/admin/withdrawals/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const withdrawal = await WalletTransaction.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ success: false, error: 'Withdrawal not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Withdrawal is not pending' });
    }

    // Debit from wallet
    await walletService.debit(
      withdrawal.userId,
      withdrawal.oderId,
      withdrawal.walletType,
      withdrawal.amount,
      'Withdrawal approved'
    );

    // Unfreeze and update status
    await walletService.unfreezeFunds(withdrawal.userId, withdrawal.walletType, withdrawal.amount);
    
    withdrawal.status = 'completed';
    withdrawal.processedBy = req.user._id;
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    res.json({ success: true, message: 'Withdrawal approved', data: withdrawal });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Reject withdrawal (admin)
 * POST /api/wallet/admin/withdrawals/:id/reject
 */
router.post('/admin/withdrawals/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const withdrawal = await WalletTransaction.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ success: false, error: 'Withdrawal not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Withdrawal is not pending' });
    }

    // Unfreeze funds
    await walletService.unfreezeFunds(withdrawal.userId, withdrawal.walletType, withdrawal.amount);
    
    withdrawal.status = 'cancelled';
    withdrawal.processedBy = req.user._id;
    withdrawal.processedAt = new Date();
    withdrawal.description += ` - Rejected: ${req.body.reason || 'No reason provided'}`;
    await withdrawal.save();

    res.json({ success: true, message: 'Withdrawal rejected', data: withdrawal });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Manual credit to wallet (admin)
 * POST /api/wallet/admin/credit
 */
router.post('/admin/credit', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, oderId, walletType, amount, description } = req.body;

    if (!userId || !walletType || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = await walletService.credit(
      userId,
      oderId,
      walletType,
      amount,
      description || 'Admin credit',
      { adminId: req.user._id }
    );

    res.json({ success: true, message: 'Credit successful', data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Manual debit from wallet (admin)
 * POST /api/wallet/admin/debit
 */
router.post('/admin/debit', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, oderId, walletType, amount, description } = req.body;

    if (!userId || !walletType || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = await walletService.debit(
      userId,
      oderId,
      walletType,
      amount,
      description || 'Admin debit',
      { adminId: req.user._id }
    );

    res.json({ success: true, message: 'Debit successful', data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get wallet settings (admin)
 * GET /api/wallet/admin/settings
 */
router.get('/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await IBCopySettings.getSettings();
    res.json({ success: true, data: settings.wallet });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Update wallet settings (admin)
 * PUT /api/wallet/admin/settings
 */
router.put('/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await IBCopySettings.updateSettings({ wallet: req.body }, req.user._id);
    res.json({ success: true, message: 'Settings updated', data: settings.wallet });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get wallet statistics (admin)
 * GET /api/wallet/admin/stats
 */
router.get('/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await Wallet.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalBalance: { $sum: '$balance' },
          totalEarned: { $sum: '$totalEarned' },
          totalWithdrawn: { $sum: '$totalWithdrawn' }
        }
      }
    ]);

    const pendingWithdrawals = await WalletTransaction.aggregate([
      { $match: { type: 'withdrawal', status: 'pending' } },
      {
        $group: {
          _id: '$walletType',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        walletStats: stats,
        pendingWithdrawals
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
