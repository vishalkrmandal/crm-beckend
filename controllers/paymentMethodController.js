// Backend\controllers\paymentMethodController.js

const PaymentMethod = require('../models/PaymentMethod');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Multer configuration for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/qr-codes');
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, `qr-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

// File filter for image uploads
const fileFilter = (req, file, cb) => {
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

exports.getPaymentMethods = async (req, res) => {
    try {
        const paymentMethods = await PaymentMethod.find({ user: req.user._id });

        res.status(200).json({
            success: true,
            count: paymentMethods.length,
            data: paymentMethods
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

exports.createPaymentMethod = async (req, res, next) => {
    try {
        const paymentMethod = await PaymentMethod.create({
            ...req.body,
            user: req.user._id
        });


        // If QR code is uploaded with creation, process it
        if (req.file) {
            req.params = { id: paymentMethod._id };
            return exports.uploadPaymentMethodQR(req, res, next);
        }
        console.log(req.body);
        console.log(req.file);

        res.status(201).json({
            success: true,
            data: paymentMethod
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error creating payment method',
            error: error.message
        });
    }
};

exports.updatePaymentMethod = async (req, res) => {
    try {
        const paymentMethod = await PaymentMethod.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        console.log(req.body);
        console.log(req.file);

        if (!paymentMethod) {
            return res.status(404).json({
                success: false,
                message: 'Payment method not found'
            });
        }

        res.status(200).json({
            success: true,
            data: paymentMethod
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error updating payment method',
            error: error.message
        });
    }
};

exports.deletePaymentMethod = async (req, res) => {
    try {
        const paymentMethod = await PaymentMethod.findOneAndDelete({
            _id: req.params.id,
            user: req.user._id
        });

        if (!paymentMethod) {
            return res.status(404).json({
                success: false,
                message: 'Payment method not found'
            });
        }

        // Clean up QR code file if exists
        if (paymentMethod.qrCodeFile) {
            const filePath = path.join(__dirname, '../uploads/qr-codes', paymentMethod.qrCodeFile);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error deleting payment method',
            error: error.message
        });
    }
};

exports.uploadPaymentMethodQR = async (req, res, next) => {

    console.log(req.body);

    // Middleware to handle file upload
    upload.single('qrCode')(req, res, async (err) => {
        // Handle multer errors
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                success: false,
                message: err.code === 'LIMIT_FILE_SIZE'
                    ? 'File size limit exceeded. Maximum 5MB allowed.'
                    : err.message
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: err.message || 'File upload error'
            });
        }

        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        try {
            const paymentMethod = await PaymentMethod.findOneAndUpdate(
                { _id: req.params.id, user: req.user._id },
                {
                    qrCodeFile: req.file.filename,
                    qrCode: `/uploads/qr-codes/${req.file.filename}`,
                    paymentLink: req.body.paymentLink || ''
                },
                { new: true }
            );

            if (!paymentMethod) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment method not found'
                });
            }

            res.status(200).json({
                success: true,
                data: paymentMethod
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: 'Error uploading QR code',
                error: error.message
            });
        }
    });
};


exports.getPaymentMethodDetails = async (req, res) => {
    try {
        const paymentMethod = await PaymentMethod.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!paymentMethod) {
            return res.status(404).json({
                success: false,
                message: 'Payment method not found'
            });
        }

        res.status(200).json({
            success: true,
            data: paymentMethod
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error fetching payment method details',
            error: error.message
        });
    }
};