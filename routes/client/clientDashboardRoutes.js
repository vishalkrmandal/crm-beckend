// Backend/routes/client/clientDashboardRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth');
const {
    getClientDashboardOverview,
    getTradingPerformance,
    getAccountSummary,
    getTransactionHistory,
    getReferralStats,
    getPortfolioAllocation,
    getAccountBalance,
    exportTransactionData,
    getDashboardPreferences,
    updateDashboardPreferences,
    getMarketOverview,
    getNewsAndAnnouncements,
    validateTradingSession,
    getTradingSignals,
    getAccountTradingHistory,
    getEconomicCalendar
} = require('../../controllers/client/clientDashboardController');

// Protect all routes and authorize only clients
router.use(protect);
router.use(authorize('client'));

/**
 * @route   GET /api/client/dashboard/overview
 * @desc    Get client dashboard overview with balance, accounts, and recent activity
 * @access  Private (Client)
 */
router.get('/overview', getClientDashboardOverview);

/**
 * @route   GET /api/client/dashboard/trading-performance
 * @desc    Get client's trading performance metrics and charts
 * @access  Private (Client)
 * @query   period - Time period (7d, 30d, 90d, 1y) default: 30d
 */
router.get('/trading-performance', getTradingPerformance);

/**
 * @route   GET /api/client/dashboard/account-summary
 * @desc    Get detailed summary of all client accounts
 * @access  Private (Client)
 */
router.get('/account-summary', getAccountSummary);

/**
 * @route   GET /api/client/dashboard/transaction-history
 * @desc    Get client's transaction history with pagination and filters
 * @access  Private (Client)
 * @query   page - Page number (default: 1)
 * @query   limit - Items per page (default: 20)
 * @query   type - Transaction type (all, deposit, withdrawal, transfer) default: all
 * @query   status - Transaction status (all, pending, approved, rejected) default: all
 * @query   startDate - Start date filter (YYYY-MM-DD)
 * @query   endDate - End date filter (YYYY-MM-DD)
 */
router.get('/transaction-history', getTransactionHistory);

/**
 * @route   GET /api/client/dashboard/referral-stats
 * @desc    Get client's referral statistics and earnings
 * @access  Private (Client)
 */
router.get('/referral-stats', getReferralStats);

/**
 * @route   GET /api/client/dashboard/portfolio-allocation
 * @desc    Get client's portfolio allocation by account type
 * @access  Private (Client)
 */
router.get('/portfolio-allocation', getPortfolioAllocation);

/**
 * @route   GET /api/client/dashboard/account-balance/:accountId
 * @desc    Get real-time balance for specific account
 * @access  Private (Client)
 * @param   accountId - Account ID
 */
router.get('/account-balance/:accountId', getAccountBalance);

/**
 * @route   GET /api/client/dashboard/trading-history
 * @desc    Get account trading history with open and closed trades
 * @access  Private (Client)
 * @query   accountId - Specific account ID (optional, defaults to all accounts)
 * @query   period - Time period (7d, 30d, 90d, 1y) default: 30d
 * @query   status - Trade status (all, open, closed) default: all
 */
router.get('/trading-history', getAccountTradingHistory);


/**
 * @route   GET /api/client/dashboard/export-transactions
 * @desc    Export transaction data in various formats
 * @access  Private (Client)
 * @query   format - Export format (csv, excel, pdf) default: csv
 * @query   type - Transaction type filter (all, deposit, withdrawal, transfer)
 * @query   status - Transaction status filter (all, pending, approved, rejected)
 * @query   startDate - Start date filter (YYYY-MM-DD)
 * @query   endDate - End date filter (YYYY-MM-DD)
 */
router.get('/export-transactions', exportTransactionData);

/**
 * @route   GET /api/client/dashboard/preferences
 * @desc    Get client's dashboard preferences
 * @access  Private (Client)
 */
router.get('/preferences', getDashboardPreferences);

/**
 * @route   PUT /api/client/dashboard/preferences
 * @desc    Update client's dashboard preferences
 * @access  Private (Client)
 * @body    preferences object with user settings
 */
router.put('/preferences', updateDashboardPreferences);

/**
 * @route   GET /api/client/dashboard/market-overview
 * @desc    Get current market overview with major pairs, indices, and commodities
 * @access  Private (Client)
 */
router.get('/market-overview', getMarketOverview);

/**
 * @route   GET /api/client/dashboard/news
 * @desc    Get latest news and announcements
 * @access  Private (Client)
 * @query   limit - Number of news items to return (default: 5)
 */
router.get('/news', getNewsAndAnnouncements);


/**
 * @route   GET /api/client/dashboard/trading-signals
 * @desc    Get latest trading signals and recommendations
 * @access  Private (Client)
 * @query   limit - Number of signals to return (default: 10)
 * @query   category - Signal category (all, forex, commodities, indices, crypto)
 */
router.get('/trading-signals', getTradingSignals);



/**
 * @route   GET /api/client/dashboard/economic-calendar
 * @desc    Get economic calendar events
 * @access  Private (Client)
 * @query   date - Specific date (YYYY-MM-DD) optional
 * @query   impact - Event impact level (all, high, medium, low) default: all
 * @query   currency - Currency filter (all, USD, EUR, GBP, etc.) default: all
 */
router.get('/economic-calendar', getEconomicCalendar);

/**
 * @route   GET /api/client/dashboard/validate-session
 * @desc    Validate current trading session and account status
 * @access  Private (Client)
 */
router.get('/validate-session', validateTradingSession);

module.exports = router;