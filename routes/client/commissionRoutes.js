// Backend/routes/client/commissionRoutes.js
const express = require('express');
const router = express.Router();
const {
    getTradeCommissions,
    getCommissionSummary,
    getCommissionBreakdown,
    getPartnerCommissions,
    getPartnersWithCommissions
} = require('../../controllers/commissionController');
const { protect } = require('../../middlewares/auth');

// Apply authentication middleware to all routes
router.use(protect);

// @route   GET /api/ibclients/commission/trade-commissions
// @desc    Get all trade commissions for the logged-in user
// @access  Private (Client)
router.get('/trade-commissions', getTradeCommissions);

// @route   GET /api/ibclients/commission/summary
// @desc    Get commission summary for dashboard
// @access  Private (Client)
router.get('/summary', getCommissionSummary);

// @route   GET /api/ibclients/commission/breakdown
// @desc    Get commission breakdown by level
// @access  Private (Client)
router.get('/breakdown', getCommissionBreakdown);

// @route   GET /api/ibclients/commission/partners
// @desc    Get enhanced partners list with commission data
// @access  Private (Client)
router.get('/partners', getPartnersWithCommissions);

// @route   GET /api/ibclients/commission/partner/:partnerId
// @desc    Get commission details for a specific partner
// @access  Private (Client)
router.get('/partner/:partnerId', getPartnerCommissions);

module.exports = router;