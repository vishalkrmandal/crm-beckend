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
