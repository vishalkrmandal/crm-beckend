// backend/routes/depositRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth');
const {
    getDeposits,
    getDepositById,
    approveDeposit,
    rejectDeposit,
    exportDeposits,
    getDocument
} = require('../../controllers/admin/depositController');

// All routes require authentication
router.use(protect);

// Admin routes
router.get('/', authorize('admin'), getDeposits);
router.get('/export', authorize('admin'), exportDeposits);
router.get('/:id', authorize('admin'), getDepositById);
router.put('/:id/approve', authorize('admin'), approveDeposit);
router.put('/:id/reject', authorize('admin'), rejectDeposit);
router.get('/:id/document', authorize('admin'), getDocument);

module.exports = router;