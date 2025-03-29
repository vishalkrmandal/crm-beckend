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

// Helper function to safely delete a file
const deleteFile = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`File deleted: ${filePath}`);
        }
    } catch (error) {
        console.error(`Error deleting file ${filePath}:`, error);
    }
};

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
    // Use multer middleware to handle file upload
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

        try {
            // Prepare payment method data
            const paymentMethodData = {
                ...req.body,
                user: req.user._id
            };

            // If a QR code file is uploaded
            if (req.file) {
                paymentMethodData.qrCodeFile = req.file.filename;
                paymentMethodData.qrCode = `/uploads/qr-codes/${req.file.filename}`;
                paymentMethodData.paymentLink = req.body.paymentLink || '';
            }

            // Create payment method
            const paymentMethod = await PaymentMethod.create(paymentMethodData);

            res.status(201).json({
                success: true,
                data: paymentMethod
            });
        } catch (error) {
            // If file was uploaded but method creation failed, delete the file
            if (req.file) {
                const filePath = path.join(__dirname, '../uploads/qr-codes', req.file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }

            res.status(400).json({
                success: false,
                message: 'Error creating payment method',
                error: error.message
            });
        }
    });
};

exports.updatePaymentMethod = async (req, res) => {
    // Use multer middleware to handle file upload
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

        try {
            // Prepare update data
            const updateData = { ...req.body };

            // If a new QR code file is uploaded
            if (req.file) {
                // Delete old QR code if it exists
                const existingMethod = await PaymentMethod.findById(req.params.id);
                if (existingMethod.qrCodeFile) {
                    const oldFilePath = path.join(__dirname, '../uploads/qr-codes', existingMethod.qrCodeFile);
                    deleteFile(oldFilePath);
                }

                // Add new QR code file details
                updateData.qrCodeFile = req.file.filename;
                updateData.qrCode = `/uploads/qr-codes/${req.file.filename}`;
            }

            // Update the payment method
            const paymentMethod = await PaymentMethod.findOneAndUpdate(
                { _id: req.params.id, user: req.user._id },
                updateData,
                {
                    new: true,
                    runValidators: true
                }
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
            // If file was uploaded but method update failed, delete the new file
            if (req.file) {
                const filePath = path.join(__dirname, '../uploads/qr-codes', req.file.filename);
                deleteFile(filePath);
            }

            res.status(400).json({
                success: false,
                message: 'Error updating payment method',
                error: error.message
            });
        }
    });
};

exports.deletePaymentMethod = async (req, res) => {
    try {
        // Find the payment method first to get the file details before deletion
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

        // Delete the associated QR code file if it exists
        if (paymentMethod.qrCodeFile) {
            const filePath = path.join(__dirname, '../uploads/qr-codes', paymentMethod.qrCodeFile);
            deleteFile(filePath);
        }

        // Now delete the payment method from the database
        await PaymentMethod.findByIdAndDelete(req.params.id);

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