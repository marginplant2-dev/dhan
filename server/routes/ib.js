const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const ibService = require('../services/ib.service');
const commissionService = require('../services/commission.service');
const walletService = require('../services/wallet.service');
const ibCouponService = require('../services/ibCoupon.service');
const IB = require('../models/IB');
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
 * Apply to become an IB
 * POST /api/ib/apply
 */
router.post('/apply', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.applyForIB(req.user._id, req.body);
    res.status(201).json({
      success: true,
      message: 'IB application submitted successfully',
      data: ib
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get current user's IB profile
 * GET /api/ib/profile
 */
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    res.json({ success: true, data: ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get IB dashboard
 * GET /api/ib/dashboard
 */
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    const dashboard = await ibService.getDashboard(ib._id);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get IB's referrals
 * GET /api/ib/referrals
 */
router.get('/referrals', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    const { page, limit, status } = req.query;
    const result = await ibService.getReferrals(ib._id, { page: parseInt(page), limit: parseInt(limit), status });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get IB's sub-IBs
 * GET /api/ib/sub-ibs
 */
router.get('/sub-ibs', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    const { page, limit } = req.query;
    const result = await ibService.getSubIBs(ib._id, { page: parseInt(page), limit: parseInt(limit) });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get commission history
 * GET /api/ib/commissions
 */
router.get('/commissions', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    const { page, limit, type, startDate, endDate } = req.query;
    const result = await commissionService.getCommissionHistory(ib._id, {
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
 * Get commission summary
 * GET /api/ib/commission-summary
 */
router.get('/commission-summary', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    const summary = await commissionService.getCommissionSummary(ib._id);
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Request withdrawal from IB wallet
 * POST /api/ib/withdraw
 */
router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    const { amount, ...withdrawalDetails } = req.body;
    const result = await ibService.requestWithdrawal(ib._id, amount, withdrawalDetails);

    // Fire-and-forget admin notification email — never block the response on
    // SMTP failures. Goes to the support inbox so the team can act on it
    // straight from their mailbox without polling the admin panel.
    try {
      const emailService = require('../services/email.service');
      const wd = withdrawalDetails || {};
      const wdBank = wd.bankDetails || wd;
      console.log('[IB-Withdraw-Email] firing for IB', ib.referralCode || ib._id, '₹' + amount);
      emailService.sendAdminNotification({
        type: 'ib_withdrawal',
        title: `New IB withdrawal request — ${ib.name || ib.referralCode || 'IB'}`,
        subtitle: `₹${Number(amount).toLocaleString('en-IN')} · awaiting your approval`,
        user: {
          name: ib.name || req.user.name,
          email: ib.email || req.user.email,
          phone: ib.phone || req.user.phone,
          oderId: ib.referralCode || req.user.oderId
        },
        fields: [
          { label: 'Amount', value: `₹${Number(amount).toLocaleString('en-IN')}` },
          { label: 'Referral Code', value: ib.referralCode || '(none)' },
          wd.method && { label: 'Method', value: String(wd.method).toUpperCase() },
          wdBank.bankName && { label: 'Bank', value: wdBank.bankName },
          wdBank.accountNumber && { label: 'Account', value: `****${String(wdBank.accountNumber).slice(-4)}` },
          wdBank.ifsc && { label: 'IFSC', value: wdBank.ifsc },
          (wdBank.accountHolder || wd.holderName) && { label: 'Holder', value: wdBank.accountHolder || wd.holderName },
          wdBank.upiId && { label: 'UPI', value: wdBank.upiId },
          wd.note && { label: 'Note', value: String(wd.note).slice(0, 200) }
        ].filter(Boolean),
        actionUrl: `${process.env.ADMIN_URL || 'https://admin.dhanfunded.com'}/admin/ib/withdrawals`,
        actionLabel: 'Review & Approve'
      }).then(() => {
        console.log('[IB-Withdraw-Email] sent OK');
      }).catch((err) => {
        console.error('[IB-Withdraw-Email] failed:', err && err.message);
      });
    } catch (e) {
      console.error('[IB-Withdraw-Email] sync error:', e && e.message);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Validate referral code
 * GET /api/ib/validate/:code
 */
router.get('/validate/:code', async (req, res) => {
  try {
    const ib = await ibService.getIBByReferralCode(req.params.code);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Invalid referral code' });
    }
    res.json({
      success: true,
      data: {
        valid: true,
        referralCode: ib.referralCode,
        ibName: ib.userId?.name || 'IB Partner'
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Validate a coupon code for use at challenge checkout. Returns the
 * computed discount amount and final fee for a given challengeFee. Auth
 * required so we can block self-redemption.
 *
 * GET /api/ib/coupon/validate/:code?challengeFee=1000
 */
router.get('/coupon/validate/:code', authMiddleware, async (req, res) => {
  try {
    const fee = Number(req.query.challengeFee || 0);
    const code = req.params.code;
    const userId = req.user._id;

    // Try IB coupon first
    let ibError = null;
    try {
      const result = await ibCouponService.validateCouponForPurchase(code, userId, fee);
      let ibName = 'IB Partner';
      try {
        const owner = await User.findById(result.ib.userId).select('name');
        if (owner?.name) ibName = owner.name;
      } catch (e) { /* ignore */ }
      return res.json({
        success: true,
        data: {
          valid: true,
          code: result.coupon.code,
          ibName,
          discountPercent: result.discountPercent,
          originalFee: result.originalFee,
          discountAmount: result.discountAmount,
          finalFee: result.finalFee,
          validUntil: result.coupon.validUntil,
          source: 'ib'
        }
      });
    } catch (e) {
      ibError = e;
    }

    // Fall back to global coupon
    try {
      const globalCouponService = require('../services/globalCoupon.service');
      const result = await globalCouponService.validate(code, userId, fee);
      return res.json({
        success: true,
        data: {
          valid: true,
          code: result.coupon.code,
          ibName: 'Promo',
          discountPercent: result.discountPercent,
          originalFee: result.originalFee,
          discountAmount: result.discountAmount,
          finalFee: result.finalFee,
          validUntil: result.coupon.validUntil,
          source: 'global',
          firstTimeOnly: !!result.coupon.firstTimeOnly
        }
      });
    } catch (e) {
      // Surface global-specific error if it's meaningful (first-time block, expired, limit)
      const msg = String(e.message || '');
      if (/first|expired|disabled|limit reached/i.test(msg)) {
        return res.status(400).json({ success: false, error: e.message });
      }
      // Otherwise surface the IB error (typically "Invalid coupon code")
      return res.status(400).json({ success: false, error: (ibError || e).message });
    }
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * IB requests a new coupon (creates a pending_issue row).
 * POST /api/ib/coupon/request
 *   body: { note? }
 */
router.post('/coupon/request', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) return res.status(404).json({ success: false, error: 'Not an IB' });
    const coupon = await ibCouponService.requestCoupon(ib._id, req.body?.note || '');
    res.status(201).json({ success: true, message: 'Coupon request submitted', data: coupon });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Backwards-compat alias of /coupon/request — old clients may still call /coupon/renew
router.post('/coupon/renew', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) return res.status(404).json({ success: false, error: 'Not an IB' });
    const coupon = await ibCouponService.requestCoupon(ib._id, req.body?.note || '');
    res.status(201).json({ success: true, message: 'Coupon request submitted', data: coupon });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * List the IB's own coupons (any status).
 * GET /api/ib/coupons
 */
router.get('/coupons', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) return res.status(404).json({ success: false, error: 'Not an IB' });
    const result = await ibCouponService.listIBCoupons(ib._id, {
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * IB sees who used their coupon and on which challenges.
 * GET /api/ib/coupon-redemptions
 */
router.get('/coupon-redemptions', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) return res.status(404).json({ success: false, error: 'Not an IB' });
    const result = await ibCouponService.listRedemptions({
      ibId: ib._id,
      page: req.query.page,
      limit: req.query.limit,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== ADMIN ROUTES =====

/**
 * Get all IBs
 * GET /api/ib/admin/list
 */
router.get('/admin/list', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page, limit, status, search } = req.query;
    const result = await ibService.getAllIBs({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      search
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get pending IB applications
 * GET /api/ib/admin/pending
 */
router.get('/admin/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await ibService.getPendingApplications({
      page: parseInt(page),
      limit: parseInt(limit)
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get IB details
 * GET /api/ib/admin/:id
 *
 * NOTE: This route is registered before more-specific /admin/<word>
 * sibling routes (commissions, withdrawals, settings, coupons/*, etc.),
 * so we guard with a strict ObjectId check and `next()` through to the
 * later matchers when the param is not a valid Mongo id.
 */
router.get('/admin/:id', authMiddleware, adminMiddleware, async (req, res, next) => {
  if (!require('mongoose').Types.ObjectId.isValid(req.params.id)) {
    return next();
  }
  try {
    const ib = await IB.findById(req.params.id).populate('userId', 'name email oderId wallet');
    if (!ib) {
      return res.status(404).json({ success: false, error: 'IB not found' });
    }
    const dashboard = await ibService.getDashboard(ib._id);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Approve IB application. Optionally issues the first coupon in the same
 * call when `coupon` payload is provided.
 * POST /api/ib/admin/:id/approve
 *   body: { commissionSettings?, coupon?: { discountPercent, validityDays, challengePurchaseCommissionPercent } }
 */
router.post('/admin/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ib = await ibService.approveIB(req.params.id, req.user._id, {
      commissionSettings: req.body.commissionSettings,
      coupon: req.body.coupon
    });
    res.json({ success: true, message: 'IB approved successfully', data: ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Reject IB application
 * POST /api/ib/admin/:id/reject
 */
router.post('/admin/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ib = await ibService.rejectIB(req.params.id, req.user._id, req.body.reason);
    res.json({ success: true, message: 'IB rejected', data: ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Suspend IB
 * POST /api/ib/admin/:id/suspend
 */
router.post('/admin/:id/suspend', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ib = await ibService.suspendIB(req.params.id, req.user._id, req.body.reason);
    res.json({ success: true, message: 'IB suspended', data: ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Reactivate IB
 * POST /api/ib/admin/:id/reactivate
 */
router.post('/admin/:id/reactivate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ib = await ibService.reactivateIB(req.params.id, req.user._id);
    res.json({ success: true, message: 'IB reactivated', data: ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Update IB commission settings
 * PUT /api/ib/admin/:id/commission
 */
router.put('/admin/:id/commission', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ib = await ibService.updateCommissionSettings(req.params.id, req.body);
    res.json({ success: true, message: 'Commission settings updated', data: ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get all commission records for admin
 * GET /api/ib/admin/commissions
 */
router.get('/admin/commissions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const IBCommission = require('../models/IBCommission');
    const { page = 1, limit = 50, status, ibId, startDate, endDate } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (ibId) query.ibId = ibId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const commissions = await IBCommission.find(query)
      .populate('ibId', 'referralCode userId')
      .populate('referredUserId', 'name email oderId')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const total = await IBCommission.countDocuments(query);
    
    // Get summary stats
    const summaryPipeline = [
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          pendingAmount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } },
          creditedAmount: { $sum: { $cond: [{ $eq: ['$status', 'credited'] }, '$amount', 0] } },
          paidAmount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
          count: { $sum: 1 }
        }
      }
    ];
    
    const summaryResult = await IBCommission.aggregate(summaryPipeline);
    const summary = summaryResult[0] || { totalAmount: 0, pendingAmount: 0, creditedAmount: 0, paidAmount: 0, count: 0 };
    
    res.json({ 
      success: true, 
      data: {
        commissions,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
        summary
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get IB statistics summary
 * GET /api/ib/admin/stats/summary
 */
router.get('/admin/stats/summary', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const summary = await ibService.getIBStatsSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Admin issues / re-issues terms on a coupon row. Used both for
 * first-time approval (pending_issue → active) and to update terms on
 * an already-active coupon mid-cycle.
 *
 * POST /api/ib/admin/coupons/:couponId/issue
 *   body: { discountPercent, validityDays, challengePurchaseCommissionPercent, maxRedemptions? }
 */
router.post('/admin/coupons/:couponId/issue', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupon = await ibCouponService.issueCoupon(req.params.couponId, req.user._id, req.body || {});
    res.json({ success: true, message: 'Coupon issued', data: coupon });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT alias for "edit" semantics from the admin UI.
router.put('/admin/coupons/:couponId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupon = await ibCouponService.issueCoupon(req.params.couponId, req.user._id, req.body || {});
    res.json({ success: true, message: 'Coupon updated', data: coupon });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Admin revokes a coupon row.
 * POST /api/ib/admin/coupons/:couponId/revoke
 */
router.post('/admin/coupons/:couponId/revoke', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupon = await ibCouponService.revokeCoupon(req.params.couponId, req.body?.reason || '');
    res.json({ success: true, message: 'Coupon revoked', data: coupon });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Admin lookup of all coupon redemptions (filterable).
 * GET /api/ib/admin/coupon-redemptions
 */
router.get('/admin/coupon-redemptions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await ibCouponService.listRedemptions({
      ibId: req.query.ibId || null,
      userId: req.query.userId || null,
      code: req.query.code || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Admin: list coupons in any status across all IBs.
 * GET /api/ib/admin/coupons?status=&page=&limit=&search=
 */
router.get('/admin/coupons', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await ibCouponService.listAllCoupons({
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Convenience aliases used by the admin UI tabs.
router.get('/admin/coupons/active', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await ibCouponService.listAllCoupons({
      status: 'active', search: req.query.search, page: req.query.page, limit: req.query.limit
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/admin/coupons/pending-issue', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await ibCouponService.listAllCoupons({
      status: 'pending_issue', page: req.query.page, limit: req.query.limit
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Legacy alias — kept so older UI bundles don't 404.
router.get('/admin/coupons/pending-renewal', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await ibCouponService.listAllCoupons({
      status: 'pending_issue', page: req.query.page, limit: req.query.limit
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * List IB-source withdrawal requests for the admin queue.
 * GET /api/ib/admin/withdrawals?status=&page=&limit=&search=
 */
router.get('/admin/withdrawals', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const Transaction = require('../models/Transaction');
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const status = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;
    const search = req.query.search ? String(req.query.search).trim() : '';

    const filter = { source: 'ib', type: 'withdrawal' };
    if (status) filter.status = status;
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { oderId: rx },
        { userName: rx },
        { 'withdrawalInfo.upiDetails.upiId': rx }
      ];
    }

    const total = await Transaction.countDocuments(filter);
    const rows = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Summary cards
    const summaryAgg = await Transaction.aggregate([
      { $match: { source: 'ib', type: 'withdrawal' } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);
    const summary = { pending: 0, approved: 0, rejected: 0, totalApproved: 0, totalPending: 0 };
    summaryAgg.forEach(s => {
      if (s._id === 'pending') { summary.pending = s.count; summary.totalPending = s.total; }
      else if (s._id === 'approved' || s._id === 'completed') { summary.approved += s.count; summary.totalApproved += s.total; }
      else if (s._id === 'rejected') { summary.rejected = s.count; }
    });

    res.json({
      success: true,
      data: {
        rows,
        summary,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get/Update IB settings
 * GET/PUT /api/ib/admin/settings
 */
router.get('/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await IBCopySettings.getSettings();
    res.json({ success: true, data: settings.ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await IBCopySettings.updateSettings({ ib: req.body }, req.user._id);
    res.json({ success: true, message: 'Settings updated', data: settings.ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
