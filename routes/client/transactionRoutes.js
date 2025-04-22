// Backend/routes/client/transactionRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/auth');
const {
    getUserTransactions,
    exportTransactions
} = require('../../controllers/client/transactionController');

// Get all transactions for a user
router.get('/', protect, getUserTransactions);

// Export transactions
router.get('/export', protect, exportTransactions);

module.exports = router;