const { PnlSharingSettings, PnlDistributionLog } = require('../models/PnlSharing');
const Admin = require('../models/Admin');
const User = require('../models/User');

class PnlSharingService {
  
  // Get the admin chain for a user (Broker → Sub-Admin → Super Admin)
  async getAdminChain(userId) {
    const user = await User.findOne({ oderId: userId });
    if (!user) return [];
    
    const chain = [];
    // Use parentAdminId from user model
    let currentAdminId = user.parentAdminId;
    
    // Traverse up the hierarchy
    while (currentAdminId) {
      const admin = await Admin.findById(currentAdminId);
      if (!admin) break;
      
      chain.push(admin);
      currentAdminId = admin.parentId;
    }
    
    return chain;
  }
  
  // Get sharing settings for an admin
  async getSettings(adminOderId) {
    return await PnlSharingSettings.findOne({ adminOderId, isActive: true });
  }
  
  // Create or update sharing settings
  async updateSettings(adminOderId, settings, configuredByOderId) {
    const admin = await Admin.findOne({ oderId: adminOderId });
    if (!admin) {
      throw new Error('Admin not found');
    }
    
    const configuredBy = await Admin.findOne({ oderId: configuredByOderId });
    
    let existing = await PnlSharingSettings.findOne({ adminOderId });
    
    if (existing) {
      Object.assign(existing, {
        ...settings,
        configuredBy: configuredBy?._id,
        configuredByOderId,
        updatedAt: new Date()
      });
      await existing.save();
      return existing;
    } else {
      const newSettings = new PnlSharingSettings({
        adminId: admin._id,
        adminOderId,
        adminRole: admin.role,
        configuredBy: configuredBy?._id,
        configuredByOderId,
        ...settings
      });
      await newSettings.save();
      return newSettings;
    }
  }
  
  // Distribute PnL when a trade closes
  async distributePnL(tradeData) {
    const {
      tradeId,
      tradeOderId,
      positionId,
      positionOderId,
      userId,
      userOderId,
      userName,
      symbol,
      segment,
      exchange,
      side,
      volume,
      quantity,
      pnl // The actual P/L from the trade
    } = tradeData;
    
    if (pnl === 0) return []; // No distribution needed
    
    const isUserLoss = pnl < 0;
    const absPnL = Math.abs(pnl);
    
    // Get admin chain
    const chain = await this.getAdminChain(userOderId);
    if (chain.length === 0) {
      console.log('[PnL Sharing] No admin chain found for user:', userOderId);
      return [];
    }
    
    const distributions = [];
    let totalDistributed = 0;
    
    // Process each admin in the chain (Broker first, then Sub-Admin)
    for (const admin of chain) {
      // Super admin gets the remainder, not a percentage
      if (admin.role === 'super_admin') continue;
      
      const settings = await this.getSettings(admin.oderId);
      if (!settings || !settings.isActive) continue;
      
      // Get share percent based on segment
      const sharePercent = settings.getSharePercent(segment, isUserLoss);
      if (sharePercent <= 0) continue;
      
      // Calculate share amount
      let shareAmount = (absPnL * sharePercent) / 100;
      
      // If user lost, admin gains (positive)
      // If user won, admin might pay (negative) - depends on profitShare setting
      if (!isUserLoss) {
        shareAmount = -shareAmount; // Admin pays when user wins
      }
      
      // Get wallet before
      const walletBefore = admin.wallet?.balance || 0;
      
      // Update admin wallet
      await Admin.updateOne(
        { _id: admin._id },
        { $inc: { 'wallet.balance': shareAmount } }
      );
      
      // Create distribution log
      const log = new PnlDistributionLog({
        tradeId,
        tradeOderId,
        positionId,
        positionOderId,
        userId: (await User.findOne({ oderId: userOderId }))?._id,
        userOderId,
        userName,
        symbol,
        segment,
        exchange,
        side,
        volume,
        quantity,
        tradePnL: pnl,
        isUserLoss,
        adminId: admin._id,
        adminOderId: admin.oderId,
        adminRole: admin.role,
        adminName: admin.name,
        sharePercent,
        shareAmount,
        shareType: isUserLoss ? 'loss_share' : 'profit_share',
        walletBefore,
        walletAfter: walletBefore + shareAmount,
        settlementStatus: settings.settlementMode === 'instant' ? 'instant' : 'pending',
        closedAt: new Date()
      });
      
      await log.save();
      
      distributions.push({
        adminOderId: admin.oderId,
        adminRole: admin.role,
        sharePercent,
        shareAmount,
        shareType: isUserLoss ? 'loss_share' : 'profit_share'
      });
      
      totalDistributed += shareAmount;
      
      console.log(`[PnL Sharing] ${admin.role} ${admin.oderId} receives ${shareAmount.toFixed(2)} (${sharePercent}% of ${isUserLoss ? 'loss' : 'profit'})`);
    }
    
    // Super admin gets the remainder
    const superAdmin = chain.find(a => a.role === 'super_admin');
    if (superAdmin && isUserLoss) {
      const remainingPercent = 100 - chain.filter(a => a.role !== 'super_admin')
        .reduce((sum, a) => {
          const settings = this.getSettings(a.oderId);
          return sum + (settings?.lossSharePercent || 0);
        }, 0);
      
      const superAdminShare = absPnL - Math.abs(totalDistributed);
      
      if (superAdminShare > 0) {
        // Update super admin wallet
        await Admin.updateOne(
          { _id: superAdmin._id },
          { $inc: { 'wallet.balance': superAdminShare } }
        );
        
        // Log for super admin
        const superAdminLog = new PnlDistributionLog({
          tradeId,
          tradeOderId,
          positionId,
          positionOderId,
          userId: (await User.findOne({ oderId: userOderId }))?._id,
          userOderId,
          userName,
          symbol,
          segment,
          exchange,
          side,
          volume,
          quantity,
          tradePnL: pnl,
          isUserLoss,
          adminId: superAdmin._id,
          adminOderId: superAdmin.oderId,
          adminRole: 'super_admin',
          adminName: superAdmin.name,
          sharePercent: (superAdminShare / absPnL) * 100,
          shareAmount: superAdminShare,
          shareType: 'loss_share',
          walletBefore: superAdmin.wallet?.balance || 0,
          walletAfter: (superAdmin.wallet?.balance || 0) + superAdminShare,
          settlementStatus: 'instant',
          closedAt: new Date()
        });
        
        await superAdminLog.save();
        
        distributions.push({
          adminOderId: superAdmin.oderId,
          adminRole: 'super_admin',
          sharePercent: (superAdminShare / absPnL) * 100,
          shareAmount: superAdminShare,
          shareType: 'loss_share'
        });
        
        console.log(`[PnL Sharing] super_admin ${superAdmin.oderId} receives ${superAdminShare.toFixed(2)} (remainder)`);
      }
    }
    
    return distributions;
  }
  
  // Get earnings for an admin
  async getEarnings(adminOderId, options = {}) {
    const { dateFrom, dateTo, segment, limit = 50, skip = 0 } = options;
    
    const query = { adminOderId };
    
    if (dateFrom || dateTo) {
      query.closedAt = {};
      if (dateFrom) query.closedAt.$gte = new Date(dateFrom);
      if (dateTo) query.closedAt.$lte = new Date(dateTo);
    }
    
    if (segment) {
      query.segment = segment;
    }
    
    const [logs, total] = await Promise.all([
      PnlDistributionLog.find(query)
        .sort({ closedAt: -1 })
        .skip(skip)
        .limit(limit),
      PnlDistributionLog.countDocuments(query)
    ]);
    
    return { logs, total };
  }
  
  // Get summary for an admin
  async getSummary(adminOderId, dateFrom = null, dateTo = null) {
    return await PnlDistributionLog.getSummary(adminOderId, dateFrom, dateTo);
  }
  
  // Get segment-wise summary
  async getSegmentSummary(adminOderId, dateFrom = null, dateTo = null) {
    return await PnlDistributionLog.getSegmentSummary(adminOderId, dateFrom, dateTo);
  }
  
  // Get user-wise summary
  async getUserSummary(adminOderId, dateFrom = null, dateTo = null) {
    return await PnlDistributionLog.getUserSummary(adminOderId, dateFrom, dateTo);
  }
  
  // Get all children with their settings (for super admin or sub-admin)
  async getChildrenWithSettings(adminOderId) {
    const admin = await Admin.findOne({ oderId: adminOderId });
    if (!admin) return [];
    
    let query = {};
    
    if (admin.role === 'super_admin') {
      // Get all sub-admins and brokers
      query = { role: { $in: ['sub_admin', 'broker'] } };
    } else if (admin.role === 'sub_admin') {
      // Get only brokers under this sub-admin
      query = { parentOderId: adminOderId, role: 'broker' };
    } else {
      return []; // Brokers can't see children
    }
    
    const children = await Admin.find(query).select('-password');
    
    // Attach sharing settings to each child
    const childrenWithSettings = await Promise.all(
      children.map(async (child) => {
        const settings = await this.getSettings(child.oderId);
        return {
          ...child.toObject(),
          pnlSharingSettings: settings
        };
      })
    );
    
    return childrenWithSettings;
  }
  
  // Generate CSV data for download
  async generateCSV(adminOderId, options = {}) {
    const { dateFrom, dateTo, segment } = options;
    
    const query = { adminOderId };
    
    if (dateFrom || dateTo) {
      query.closedAt = {};
      if (dateFrom) query.closedAt.$gte = new Date(dateFrom);
      if (dateTo) query.closedAt.$lte = new Date(dateTo);
    }
    
    if (segment) {
      query.segment = segment;
    }
    
    const logs = await PnlDistributionLog.find(query).sort({ closedAt: -1 });
    
    // CSV header
    const header = [
      'Date',
      'Time',
      'Trade ID',
      'User ID',
      'User Name',
      'Symbol',
      'Segment',
      'Side',
      'Volume',
      'Trade P/L',
      'Share %',
      'My Earning',
      'Type',
      'Wallet After'
    ].join(',');
    
    // CSV rows
    const rows = logs.map(log => {
      const date = new Date(log.closedAt);
      return [
        date.toLocaleDateString('en-IN'),
        date.toLocaleTimeString('en-IN'),
        log.tradeOderId || log.positionOderId || '-',
        log.userOderId,
        log.userName || '-',
        log.symbol,
        log.segment || '-',
        log.side || '-',
        log.volume || log.quantity || '-',
        log.tradePnL.toFixed(2),
        log.sharePercent.toFixed(2) + '%',
        log.shareAmount.toFixed(2),
        log.shareType === 'loss_share' ? 'Loss Share' : 'Profit Share',
        log.walletAfter?.toFixed(2) || '-'
      ].join(',');
    });
    
    return [header, ...rows].join('\n');
  }
  
  // Generate all distributions CSV (for super admin)
  async generateAllDistributionsCSV(options = {}) {
    const { dateFrom, dateTo, segment, adminOderId } = options;
    
    const query = {};
    
    if (adminOderId) {
      query.adminOderId = adminOderId;
    }
    
    if (dateFrom || dateTo) {
      query.closedAt = {};
      if (dateFrom) query.closedAt.$gte = new Date(dateFrom);
      if (dateTo) query.closedAt.$lte = new Date(dateTo);
    }
    
    if (segment) {
      query.segment = segment;
    }
    
    const logs = await PnlDistributionLog.find(query).sort({ closedAt: -1 });
    
    // CSV header
    const header = [
      'Date',
      'Time',
      'Trade ID',
      'User ID',
      'User Name',
      'Admin ID',
      'Admin Name',
      'Admin Role',
      'Symbol',
      'Segment',
      'Side',
      'Volume',
      'Trade P/L',
      'Share %',
      'Share Amount',
      'Type'
    ].join(',');
    
    // CSV rows
    const rows = logs.map(log => {
      const date = new Date(log.closedAt);
      return [
        date.toLocaleDateString('en-IN'),
        date.toLocaleTimeString('en-IN'),
        log.tradeOderId || log.positionOderId || '-',
        log.userOderId,
        log.userName || '-',
        log.adminOderId,
        log.adminName || '-',
        log.adminRole,
        log.symbol,
        log.segment || '-',
        log.side || '-',
        log.volume || log.quantity || '-',
        log.tradePnL.toFixed(2),
        log.sharePercent.toFixed(2) + '%',
        log.shareAmount.toFixed(2),
        log.shareType === 'loss_share' ? 'Loss Share' : 'Profit Share'
      ].join(',');
    });
    
    return [header, ...rows].join('\n');
  }
}

module.exports = new PnlSharingService();
