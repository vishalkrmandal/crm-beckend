// Backend\routes\client\withdrawalRoutes.js

const express = require('express');
const router = express.Router();
const {
    createWithdrawal,
    getWithdrawals,
    getWithdrawalById,
    getWithdrawalsByAccount,
    getWithdrawalsByUser,
    updateWithdrawalStatus,
    getLastWithdrawalMethod
} = require('../../controllers/client/withdrawalClientController');
const { protect } = require('../../middlewares/auth');

// Client routes
router.post('/', protect, createWithdrawal);
router.get('/', protect, getWithdrawals);
router.get('/user', protect, getWithdrawalsByUser);
router.get('/account/:accountId', protect, getWithdrawalsByAccount);
router.get('/last-method', protect, getLastWithdrawalMethod);
router.get('/:id', protect, getWithdrawalById);

// // Admin routes
// router.put('/:id/status', protect, updateWithdrawalStatus);

module.exports = router;