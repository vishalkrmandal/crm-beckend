// Backend\routes\admin\withdrawalRoutes.js

const express = require('express');
const router = express.Router();
const { getAllWithdrawals,
    approveWithdrawal,
    rejectWithdrawal } = require('../../controllers/admin/withdrawalController');
const { protect, authorize } = require('../../middlewares/auth');

router.use(protect);
// router.use(authorize('Admin'));

router.get('/', getAllWithdrawals);
router.patch('/:id/approve', approveWithdrawal);
router.patch('/:id/reject', rejectWithdrawal);

module.exports = router;

// const express = require('express');
// const router = express.Router();
// const {
//     createWithdrawal,
//     getWithdrawals,
//     getWithdrawalById,
//     getWithdrawalsByAccount,
//     getWithdrawalsByUser,
//     updateWithdrawalStatus,
//     getLastWithdrawalMethod
// } = require('../../controllers/client/withdrawalClientController');
// const { protect } = require('../../middlewares/auth');

// // Client routes
// router.post('/', protect, createWithdrawal);
// router.get('/', protect, getWithdrawals);
// router.get('/user', protect, getWithdrawalsByUser);
// router.get('/account/:accountId', protect, getWithdrawalsByAccount);
// router.get('/last-method', protect, getLastWithdrawalMethod);
// router.get('/:id', protect, getWithdrawalById);

// // // Admin routes
// // router.put('/:id/status', protect, updateWithdrawalStatus);

// module.exports = router;