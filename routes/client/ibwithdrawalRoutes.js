// Backend/routes/client/ibWithdrawalRoutes.js - Updated
const express = require('express');
const router = express.Router();
const {
    getProfileDetails,
    requestWithdrawal,
    getWithdrawalHistory,
    cancelWithdrawal
} = require('../../controllers/client/ibWithdrawalController');
const { protect, authorize } = require('../../middlewares/auth');

// Apply authentication middleware to all routes
router.use(protect);
router.use(authorize('client'));

// @route   GET /api/ibclients/withdrawals/profile-details
// @desc    Get user profile details for withdrawal form
// @access  Private (Client)
router.get('/profile-details', getProfileDetails);

// @route   POST /api/ibclients/withdrawals/request
// @desc    Request IB commission withdrawal
// @access  Private (Client)
router.post('/request', requestWithdrawal);

// @route   GET /api/ibclients/withdrawals/history
// @desc    Get user's withdrawal history
// @access  Private (Client)
router.get('/history', getWithdrawalHistory);

// @route   DELETE /api/ibclients/withdrawals/:withdrawalId
// @desc    Cancel pending withdrawal request
// @access  Private (Client)
router.delete('/:withdrawalId', cancelWithdrawal);

module.exports = router;