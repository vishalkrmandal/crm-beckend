// Backend/routes/client/clientDashboardRoutes.js
const express = require('express');
const router = express.Router();
const {
    getDashboardOverview,
    getRecentTransactions,
    getActiveAccounts,
    getAccountPerformance,
    // getTransactionHistory,
    // getAccountDetails
} = require('../../controllers/client/clientDashboardController');
const { protect } = require('../../middlewares/auth');

// Apply authentication middleware to all routes
router.use(protect);

// @route   GET /api/client/dashboard/overview
// @desc    Get dashboard overview statistics
// @access  Private (Client)
router.get('/overview', getDashboardOverview);

// @route   GET /api/client/dashboard/transactions
// @desc    Get recent transactions
// @access  Private (Client)
router.get('/transactions', getRecentTransactions);

// @route   GET /api/client/dashboard/accounts
// @desc    Get active accounts with search and filter
// @access  Private (Client)
router.get('/accounts', getActiveAccounts);

// @route   GET /api/client/dashboard/performance
// @desc    Get account performance data
// @access  Private (Client)
router.get('/performance', getAccountPerformance);


// @desc    Get detailed transaction history with pagination and filters
// @route   GET /api/client/dashboard/transactions
// @access  Private (Client)
// router.get('/transactions', getTransactionHistory);


// @desc    Get specific account details with real-time balance
// @route   GET /api/client/dashboard/account/:accountId
// @access  Private (Client)
// router.get('/account/:accountId', getAccountDetails);

module.exports = router;