const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');

/**
 * Wallet Service
 * Handles all wallet operations with transaction safety
 */
class WalletService {
  /**
   * Get or create wallet for user
   */
  async getOrCreateWallet(userId, oderId, type) {
    return await Wallet.getOrCreate(userId, oderId, type);
  }

  /**
   * Get all wallets for a user
   */
  async getUserWallets(userId) {
    return await Wallet.find({ userId, isActive: true });
  }

  /**
   * Get wallet by type
   */
  async getWallet(userId, type) {
    return await Wallet.findOne({ userId, type });
  }

  /**
   * Credit funds to wallet with transaction safety
   */
  async credit(userId, oderId, walletType, amount, description, metadata = {}) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await Wallet.findOne({ userId, type: walletType }).session(session);
      
      if (!wallet) {
        throw new Error(`Wallet not found: ${walletType}`);
      }

      wallet.balance += amount;
      wallet.totalEarned += amount;
      wallet.lastTransactionAt = new Date();
      await wallet.save({ session });

      // Create transaction record
      const transaction = await WalletTransaction.create([{
        walletId: wallet._id,
        userId,
        oderId,
        walletType,
        type: 'credit',
        amount,
        balanceAfter: wallet.balance,
        description,
        status: 'completed',
        metadata
      }], { session });

      await session.commitTransaction();
      
      return { wallet, transaction: transaction[0] };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Debit funds from wallet with transaction safety
   */
  async debit(userId, oderId, walletType, amount, description, metadata = {}) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await Wallet.findOne({ userId, type: walletType }).session(session);
      
      if (!wallet) {
        throw new Error(`Wallet not found: ${walletType}`);
      }

      const availableBalance = wallet.balance - wallet.frozenBalance;
      if (availableBalance < amount) {
        throw new Error('Insufficient balance');
      }

      wallet.balance -= amount;
      wallet.lastTransactionAt = new Date();
      await wallet.save({ session });

      // Create transaction record
      const transaction = await WalletTransaction.create([{
        walletId: wallet._id,
        userId,
        oderId,
        walletType,
        type: 'debit',
        amount,
        balanceAfter: wallet.balance,
        description,
        status: 'completed',
        metadata
      }], { session });

      await session.commitTransaction();
      
      return { wallet, transaction: transaction[0] };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Transfer between wallets
   */
  async transfer(userId, oderId, fromType, toType, amount, description) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const fromWallet = await Wallet.findOne({ userId, type: fromType }).session(session);
      const toWallet = await Wallet.findOne({ userId, type: toType }).session(session);

      if (!fromWallet || !toWallet) {
        throw new Error('One or both wallets not found');
      }

      const availableBalance = fromWallet.balance - fromWallet.frozenBalance;
      if (availableBalance < amount) {
        throw new Error('Insufficient balance in source wallet');
      }

      // Debit from source
      fromWallet.balance -= amount;
      fromWallet.lastTransactionAt = new Date();
      await fromWallet.save({ session });

      // Credit to destination
      toWallet.balance += amount;
      toWallet.lastTransactionAt = new Date();
      await toWallet.save({ session });

      // Create transaction records
      const idempotencyKey = `transfer_${userId}_${Date.now()}`;
      
      await WalletTransaction.create([
        {
          walletId: fromWallet._id,
          userId,
          oderId,
          walletType: fromType,
          type: 'transfer_out',
          amount,
          balanceAfter: fromWallet.balance,
          destinationWalletId: toWallet._id,
          description: `Transfer to ${toType}: ${description}`,
          status: 'completed',
          idempotencyKey: `${idempotencyKey}_out`
        },
        {
          walletId: toWallet._id,
          userId,
          oderId,
          walletType: toType,
          type: 'transfer_in',
          amount,
          balanceAfter: toWallet.balance,
          sourceWalletId: fromWallet._id,
          description: `Transfer from ${fromType}: ${description}`,
          status: 'completed',
          idempotencyKey: `${idempotencyKey}_in`
        }
      ], { session });

      await session.commitTransaction();
      
      return { fromWallet, toWallet };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Freeze funds for pending operation
   */
  async freezeFunds(userId, walletType, amount) {
    const wallet = await Wallet.findOne({ userId, type: walletType });
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const availableBalance = wallet.balance - wallet.frozenBalance;
    if (availableBalance < amount) {
      throw new Error('Insufficient available balance');
    }

    wallet.frozenBalance += amount;
    await wallet.save();
    
    return wallet;
  }

  /**
   * Unfreeze funds
   */
  async unfreezeFunds(userId, walletType, amount) {
    const wallet = await Wallet.findOne({ userId, type: walletType });
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    wallet.frozenBalance = Math.max(0, wallet.frozenBalance - amount);
    await wallet.save();
    
    return wallet;
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(userId, walletType = null, options = {}) {
    const { page = 1, limit = 20, type = null, startDate = null, endDate = null } = options;
    
    const query = { userId };
    
    if (walletType) {
      query.walletType = walletType;
    }
    
    if (type) {
      query.type = type;
    }
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const total = await WalletTransaction.countDocuments(query);
    const transactions = await WalletTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Initialize wallets for new user
   */
  async initializeUserWallets(userId, oderId) {
    const walletTypes = ['main', 'trading'];
    const wallets = [];

    for (const type of walletTypes) {
      const wallet = await this.getOrCreateWallet(userId, oderId, type);
      wallets.push(wallet);
    }

    return wallets;
  }

  /**
   * Get wallet summary for user
   */
  async getWalletSummary(userId) {
    const wallets = await this.getUserWallets(userId);
    
    const summary = {
      totalBalance: 0,
      wallets: {}
    };

    for (const wallet of wallets) {
      summary.totalBalance += wallet.balance;
      summary.wallets[wallet.type] = {
        balance: wallet.balance,
        available: wallet.balance - wallet.frozenBalance,
        frozen: wallet.frozenBalance,
        totalEarned: wallet.totalEarned,
        totalWithdrawn: wallet.totalWithdrawn
      };
    }

    return summary;
  }
}

module.exports = new WalletService();
