const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const globalCouponService = require('../services/globalCoupon.service');

const JWT_SECRET = process.env.JWT_SECRET || 'BharatFundedTrade-secret-key-2024';

const authMiddleware = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};
const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

/**
 * Public — fetch the currently-active banner coupon for landing page.
 * No auth required so the banner shows pre-login.
 */
router.get('/banner', async (req, res) => {
  try {
    const coupon = await globalCouponService.getActiveBannerCoupon();
    if (!coupon) return res.json({ success: true, banner: null });
    return res.json({
      success: true,
      banner: {
        code: coupon.code,
        discountPercent: coupon.discountPercent,
        bannerText: coupon.bannerText || '',
        firstTimeOnly: coupon.firstTimeOnly,
        validUntil: coupon.validUntil
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// ─── Admin endpoints ────────────────────────────────────────────────

router.get('/admin/list', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await globalCouponService.listAll();
    return res.json({ success: true, rows });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/admin/create', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupon = await globalCouponService.createCoupon(req.body || {}, req.user?._id);
    return res.json({ success: true, coupon });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

router.put('/admin/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupon = await globalCouponService.updateCoupon(req.params.id, req.body || {});
    return res.json({ success: true, coupon });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

router.delete('/admin/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const r = await globalCouponService.deleteCoupon(req.params.id);
    return res.json({ success: true, ...r });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

module.exports = router;
