// backend/routes/admin/ibConfigurationRoutes.js
const express = require('express');
const {
    createIBConfiguration,
    getMyIBConfiguration,
    getIBDashboardSummary,
    getPartnersList,
    verifyReferralCode,
    getIBTree
} = require('../../controllers/ibConfigurationController');
const { protect, authorize } = require('../../middlewares/auth');

const router = express.Router();

// Public route for verifying referral codes (used during signup)
router.post('/verify-referral', verifyReferralCode);

// Client routes
router.post('/create', protect, authorize('client'), createIBConfiguration);
router.get('/my-code', protect, authorize('client'), getMyIBConfiguration);
router.get('/dashboard', protect, authorize('client'), getIBDashboardSummary);
router.get('/partners', protect, authorize('client'), getPartnersList);
router.get('/tree', protect, authorize('client'), getIBTree);

module.exports = router;