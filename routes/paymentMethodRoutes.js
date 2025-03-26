const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const {
    getPaymentMethods,
    createPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    togglePaymentMethodStatus,
    uploadPaymentMethodQR
} = require('../controllers/paymentMethodController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads/qr-codes');
fs.mkdirSync(uploadDir, { recursive: true });

// Multer configuration for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, `qr-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

// File filter for image uploads
const fileFilter = (req, file, cb) => {
    // Accept images only
    const allowedFileTypes = /\.(jpg|jpeg|png|gif|webp)$/i;
    const extname = allowedFileTypes.test(path.extname(file.originalname));
    const mimetype = file.mimetype.startsWith('image/');

    if (extname && mimetype) {
        return cb(null, true);
    }

    cb(new Error('Error: Images only (jpeg, jpg, png, gif, webp)!'), false);
};

// Configure multer with advanced options
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB file size limit
        files: 1 // Limit to one file per upload
    }
});

// Error handling middleware for multer
const uploadErrorHandler = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        // Multer-specific errors
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size limit exceeded. Maximum 5MB allowed.'
            });
        }
        return res.status(400).json({
            success: false,
            message: err.message
        });
    } else if (err) {
        // Other errors
        return res.status(400).json({
            success: false,
            message: err.message || 'File upload error'
        });
    }
    next();
};

// Logging middleware for debugging
const logUploadDetails = (req, res, next) => {
    console.log('Upload Request:', {
        method: req.method,
        path: req.path,
        file: req.file,
        body: req.body
    });
    next();
};

// Payment Method Routes
router.route('/')
    .get(protect, authorize('admin'), getPaymentMethods)
    .post(protect, authorize('admin'), createPaymentMethod);

router.route('/:id')
    .put(protect, authorize('admin'), updatePaymentMethod)
    .delete(protect, authorize('admin'), deletePaymentMethod);

router.patch('/:id/status', protect, authorize('admin'), togglePaymentMethodStatus);

router.post(
    '/:id/upload-qr',
    protect,
    authorize('admin'),
    logUploadDetails,
    upload.single('qrCode'),
    uploadErrorHandler,
    uploadPaymentMethodQR
);

module.exports = router;