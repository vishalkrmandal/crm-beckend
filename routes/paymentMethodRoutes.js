//Backend\routes\paymentMethodRoutes.js

const express = require('express');
// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');

const {
    getPaymentMethods,
    createPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    uploadPaymentMethodQR,
    getPaymentMethodDetails
} = require('../controllers/paymentMethodController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

// Payment Method Routes
router.route('/')
    .get(protect, authorize('admin'), getPaymentMethods)
    .post(protect, authorize('admin'), createPaymentMethod);

router.route('/:id')
    .get(protect, authorize('admin'), getPaymentMethodDetails)
    .put(protect, authorize('admin'), updatePaymentMethod)
    .delete(protect, authorize('admin'), deletePaymentMethod);

router.post(
    '/:id/upload-qr',
    protect,
    authorize('admin'),
    uploadPaymentMethodQR
);

module.exports = router;