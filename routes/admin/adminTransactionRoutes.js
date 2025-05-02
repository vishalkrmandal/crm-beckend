// Backend/routes/admin/adminTransactionRoutes.js
const express = require('express');
const { getAllTransactions } = require('../../controllers/admin/adminTransactionController');
const router = express.Router();

// Get all transactions
router.get('/', getAllTransactions);

module.exports = router;