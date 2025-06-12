const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/auth'); // Fixed path
const {
    getDashboardData,
    getTransactionHistory,
    getAccountDetails
} = require('../../controllers/client/clientDashboardController');

// Apply authentication middleware to all routes
router.use(protect);

// @desc    Get complete dashboard data
// @route   GET /api/client/dashboard
// @access  Private (Client)
router.get('/', getDashboardData);

// @desc    Get detailed transaction history with pagination and filters
// @route   GET /api/client/dashboard/transactions
// @access  Private (Client)
router.get('/transactions', getTransactionHistory);

// @desc    Get specific account details with real-time balance
// @route   GET /api/client/dashboard/account/:accountId
// @access  Private (Client)
router.get('/account/:accountId', getAccountDetails);

module.exports = router;
