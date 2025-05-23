// backend/routes/client/withdrawalRoutes.js
const express = require('express');
const {
    requestIBWithdrawal,
    getIBWithdrawals
} = require('../../controllers/ibWithdrawalController');
const { protect, authorize } = require('../../middlewares/auth');

const router = express.Router();

// IB withdrawals
router.post('/ib-withdraw', protect, authorize('client'), requestIBWithdrawal);
router.get('/ib-withdrawals', protect, authorize('client'), getIBWithdrawals);

module.exports = router;