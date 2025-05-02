// Backend\controllers\client\withdrawalClientController.js

const Withdrawal = require('../../models/Withdrawal');
const Account = require('../../models/client/Account');

// Create new withdrawal request
exports.createWithdrawal = async (req, res, next) => {
    try {
        const {
            accountId,
            accountNumber,
            accountType,
            amount,
            paymentMethod,
            bankDetails,
            eWalletDetails
        } = req.body;

        // Verify account exists and belongs to user
        const account = await Account.findOne({
            _id: accountId,
            user: req.user.id
        });

        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'Account not found or does not belong to you'
            });
        }

        // Check if amount is valid
        if (amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Amount must be greater than 0'
            });
        }

        // Check if amount is less than or equal to account balance
        if (amount > account.balance) {
            return res.status(400).json({
                success: false,
                message: 'Withdrawal amount exceeds available balance'
            });
        }

        // Create withdrawal request
        const withdrawal = await Withdrawal.create({
            user: req.user.id,
            account: accountId,
            accountNumber,
            accountType,
            amount,
            paymentMethod,
            bankDetails: paymentMethod === 'bank' ? bankDetails : undefined,
            eWalletDetails: (paymentMethod === 'skrill' || paymentMethod === 'neteller') ? eWalletDetails : undefined,
            status: 'Pending'
        });

        res.status(201).json({
            success: true,
            data: withdrawal
        });
    } catch (error) {
        next(error);
    }
};

// Get all withdrawals (admin)
exports.getWithdrawals = async (req, res, next) => {
    try {
        const withdrawals = await Withdrawal.find()
            .populate('user', 'name email')
            .populate('account', 'mt5Account accountType balance')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: withdrawals.length,
            data: withdrawals
        });
    } catch (error) {
        next(error);
    }
};

// Get withdrawals by user
exports.getWithdrawalsByUser = async (req, res, next) => {
    try {
        const withdrawals = await Withdrawal.find({ user: req.user.id })
            .populate('account', 'mt5Account accountType balance')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: withdrawals.length,
            data: withdrawals
        });
    } catch (error) {
        next(error);
    }
};

// Get withdrawals by account
exports.getWithdrawalsByAccount = async (req, res, next) => {
    try {
        const withdrawals = await Withdrawal.find({
            user: req.user.id,
            account: req.params.accountId
        }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: withdrawals.length,
            data: withdrawals
        });
    } catch (error) {
        next(error);
    }
};

// Get withdrawal by ID
exports.getWithdrawalById = async (req, res, next) => {
    try {
        const withdrawal = await Withdrawal.findById(req.params.id)
            .populate('user', 'name email')
            .populate('account', 'mt5Account accountType balance');

        if (!withdrawal) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal not found'
            });
        }

        // Check if user is authorized
        if (withdrawal.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this withdrawal'
            });
        }

        res.status(200).json({
            success: true,
            data: withdrawal
        });
    } catch (error) {
        next(error);
    }
};

// // Update withdrawal status (admin)
// exports.updateWithdrawalStatus = async (req, res, next) => {
//     try {
//         const { status, remarks } = req.body;

//         // Only admin can update status
//         if (req.user.role !== 'admin') {
//             return res.status(403).json({
//                 success: false,
//                 message: 'Not authorized to update withdrawal status'
//             });
//         }

//         const withdrawal = await Withdrawal.findById(req.params.id);

//         if (!withdrawal) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Withdrawal not found'
//             });
//         }

//         // Update status
//         withdrawal.status = status;
//         if (remarks) withdrawal.remarks = remarks;

//         // Update relevant date fields
//         if (status === 'Completed') {
//             withdrawal.completedDate = Date.now();

//             // Update account balance if status is Completed
//             const account = await Account.findById(withdrawal.account);
//             if (account) {
//                 account.balance -= withdrawal.amount;
//                 await account.save();
//             }
//         } else if (status === 'Rejected') {
//             withdrawal.rejectedDate = Date.now();
//         }

//         await withdrawal.save();

//         res.status(200).json({
//             success: true,
//             data: withdrawal
//         });
//     } catch (error) {
//         next(error);
//     }
// };

// Get last used withdrawal method for a user
exports.getLastWithdrawalMethod = async (req, res, next) => {
    try {
        const lastWithdrawal = await Withdrawal.findOne({ user: req.user.id })
            .sort({ createdAt: -1 });

        if (!lastWithdrawal) {
            return res.status(200).json({
                success: true,
                data: null
            });
        }

        // Return relevant payment details based on method
        let paymentDetails = {};

        if (lastWithdrawal.paymentMethod === 'bank') {
            paymentDetails = lastWithdrawal.bankDetails;
        } else if (lastWithdrawal.paymentMethod === 'skrill' || lastWithdrawal.paymentMethod === 'neteller') {
            paymentDetails = lastWithdrawal.eWalletDetails;
        }

        res.status(200).json({
            success: true,
            data: {
                paymentMethod: lastWithdrawal.paymentMethod,
                paymentDetails
            }
        });
    } catch (error) {
        next(error);
    }
};