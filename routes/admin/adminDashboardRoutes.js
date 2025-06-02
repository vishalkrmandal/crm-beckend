// Backend/routes/admin/adminDashboardRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth');
const {
    getAdminDashboardStats,
    getRevenueChartData,
    getClientDistribution,
    getRecentTransactions,
    getDailyStats,
    getTopPerformingClients
} = require('../../controllers/admin/adminDashboardController');

// Protect all routes and authorize only admin/superadmin
router.use(protect);
router.use(authorize('admin', 'superadmin'));

/**
 * @route   GET /api/admin/dashboard/stats
 * @desc    Get admin dashboard overview statistics
 * @access  Private (Admin/SuperAdmin)
 */
router.get('/stats', getAdminDashboardStats);

/**
 * @route   GET /api/admin/dashboard/revenue-chart
 * @desc    Get revenue chart data for last 12 months
 * @access  Private (Admin/SuperAdmin)
 */
router.get('/revenue-chart', getRevenueChartData);

/**
 * @route   GET /api/admin/dashboard/client-distribution
 * @desc    Get client distribution by account type
 * @access  Private (Admin/SuperAdmin)
 */
router.get('/client-distribution', getClientDistribution);

/**
 * @route   GET /api/admin/dashboard/recent-transactions
 * @desc    Get recent transactions for dashboard
 * @access  Private (Admin/SuperAdmin)
 * @query   limit - Number of transactions to return (default: 10)
 */
router.get('/recent-transactions', getRecentTransactions);

/**
 * @route   GET /api/admin/dashboard/daily-stats
 * @desc    Get daily statistics for the last 30 days
 * @access  Private (Admin/SuperAdmin)
 */
router.get('/daily-stats', getDailyStats);

/**
 * @route   GET /api/admin/dashboard/top-clients
 * @desc    Get top performing clients by total deposits
 * @access  Private (Admin/SuperAdmin)
 * @query   limit - Number of clients to return (default: 10)
 */
router.get('/top-clients', getTopPerformingClients);

module.exports = router;