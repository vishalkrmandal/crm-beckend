// Backend\controllers\client\depositController.js
const path = require('path');
const fs = require('fs');
const Deposit = require('../../models/Deposit');
const Account = require('../../models/client/Account');
const PaymentMethod = require('../../models/PaymentMethod');
const multer = require('multer');

// Configure storage for proof of payment uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/deposits';
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const ext = path.extname(file.originalname);
        cb(null, `deposit-proof-${uniqueSuffix}${ext}`);
    }
});

// Configure file filter for proof of payment uploads
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF, PNG, JPG, and JPEG files are allowed.'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Middleware for handling file uploads
exports.uploadProofOfPayment = upload.single('proofOfPayment');

// Create a new deposit
exports.createDeposit = async (req, res, next) => {
    try {
        // Validate file upload
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Proof of payment is required'
            });
        }

        // Extract deposit data from request body
        const { accountId, amount, paymentMethodId, paymentType, notes } = req.body;

        // Validate amount
        if (amount < 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid deposit amount'
            });
        }

        // Verify account exists
        const account = await Account.findById(accountId);
        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'Account not found'
            });
        }

        // Verify account belongs to user
        if (account.user.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access to this account'
            });
        }

        // Verify payment method exists
        const paymentMethod = await PaymentMethod.findById(paymentMethodId);
        if (!paymentMethod) {
            return res.status(404).json({
                success: false,
                message: 'Payment method not found'
            });
        }

        // Verify payment method is active
        if (!paymentMethod.active) {
            return res.status(400).json({
                success: false,
                message: 'Selected payment method is not active'
            });
        }

        // Create deposit record
        const deposit = new Deposit({
            user: req.user.id,
            account: accountId,
            amount: parseFloat(amount),
            paymentMethod: paymentMethodId,
            paymentType,
            proofOfPayment: `/${req.file.path.replace(/\\/g, '/')}`,
            notes
        });

        await deposit.save();

        res.status(201).json({
            success: true,
            message: 'Deposit request submitted successfully',
            data: deposit
        });
    } catch (error) {
        next(error);
    }
};

// Get all deposits for the logged-in user
exports.getMyDeposits = async (req, res, next) => {
    try {
        const deposits = await Deposit.find({ user: req.user.id })
            .populate('account', 'mt5Account accountType')
            .populate('paymentMethod', 'type bankName walletName')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: deposits.length,
            data: deposits
        });
    } catch (error) {
        next(error);
    }
};

// Get a single deposit by ID
exports.getDepositById = async (req, res, next) => {
    try {
        const deposit = await Deposit.findById(req.params.id)
            .populate('account', 'mt5Account accountType')
            .populate('paymentMethod', 'type bankName walletName accountHolderName accountNumber ifsc_swift walletAddress');

        // Check if deposit exists
        if (!deposit) {
            return res.status(404).json({
                success: false,
                message: 'Deposit not found'
            });
        }

        // Check if deposit belongs to user
        if (deposit.user.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access to this deposit'
            });
        }

        res.status(200).json({
            success: true,
            data: deposit
        });
    } catch (error) {
        next(error);
    }
};

// Get active payment methods
exports.getActivePaymentMethods = async (req, res, next) => {
    try {
        const paymentMethods = await PaymentMethod.find({ active: true });

        // Group payment methods by type
        const groupedMethods = paymentMethods.reduce((acc, method) => {
            if (!acc[method.type]) {
                acc[method.type] = [];
            }
            acc[method.type].push(method);
            return acc;
        }, {});

        res.status(200).json({
            success: true,
            data: groupedMethods
        });
    } catch (error) {
        next(error);
    }
};