// Backend/routes/client/tradingRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/auth');
const {
    getUserTrades,
    getUserOpenTrades,
    getUserClosedTrades
} = require('../../controllers/client/tradingController');

// Get all trades (open + closed) for authenticated user
router.get('/all', protect, getUserTrades);

// Get open trades for authenticated user
router.get('/open', protect, getUserOpenTrades);

// Get closed trades for authenticated user
router.get('/closed', protect, getUserClosedTrades);

module.exports = router;