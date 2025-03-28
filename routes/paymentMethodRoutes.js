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

// // Multer configuration for file upload
// const storage = multer.diskStorage({
//     destination: (req, file, cb) => {
//         const uploadDir = path.join(__dirname, '../uploads/qr-codes');
//         fs.mkdirSync(uploadDir, { recursive: true });
//         cb(null, uploadDir);
//     },
//     filename: (req, file, cb) => {
//         const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
//         cb(null, `qr-${uniqueSuffix}${path.extname(file.originalname)}`);
//     }
// });

// // File filter for image uploads
// const fileFilter = (req, file, cb) => {
//     const allowedFileTypes = /\.(jpg|jpeg|png|gif|webp)$/i;
//     const extname = allowedFileTypes.test(path.extname(file.originalname));
//     const mimetype = file.mimetype.startsWith('image/');

//     if (extname && mimetype) {
//         return cb(null, true);
//     }

//     cb(new Error('Error: Images only (jpeg, jpg, png, gif, webp)!'), false);
// };

// // Configure multer with advanced options
// const upload = multer({
//     storage: storage,
//     fileFilter: fileFilter,
//     limits: {
//         fileSize: 5 * 1024 * 1024, // 5MB file size limit
//         files: 1 // Limit to one file per upload
//     }
// });

// // Error handling middleware for multer
// const uploadErrorHandler = (err, req, res, next) => {
//     if (err instanceof multer.MulterError) {
//         return res.status(400).json({
//             success: false,
//             message: err.code === 'LIMIT_FILE_SIZE'
//                 ? 'File size limit exceeded. Maximum 5MB allowed.'
//                 : err.message
//         });
//     } else if (err) {
//         return res.status(400).json({
//             success: false,
//             message: err.message || 'File upload error'
//         });
//     }
//     next();
// };

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