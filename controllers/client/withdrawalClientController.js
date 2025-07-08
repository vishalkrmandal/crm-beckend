// Backend\controllers\client\withdrawalClientController.js

const Withdrawal = require('../../models/Withdrawal');
const Account = require('../../models/client/Account');
const axios = require('axios');

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
        console.log('Withdrawal request body:', req.body);
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

        const checkTradesUrl = `${process.env.MT5_API_URL}/GetOpenTradeByAccount?Manager_Index=${process.env.Manager_Index}&MT5Accont=${account.mt5Account}`;
        const tradesResponse = await axios.get(checkTradesUrl);

        // If trades are found (not error status), prevent withdrawal
        if (tradesResponse.data.status !== 'error') {
            return res.status(400).json({
                success: false,
                message: 'Cannot process withdrawal. You have open trades on this account. Please close all trades before withdrawing funds.',
                hasOpenTrades: true
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

        // Populate required fields for notifications
        await withdrawal.populate([
            { path: 'user', select: 'firstname lastname email' },
            { path: 'account', select: 'mt5Account' }
        ]);

        // Trigger notifications
        if (req.notificationTriggers) {
            await req.notificationTriggers.handleWithdrawalStatusChange(
                withdrawal.toObject(),
                null // No previous status for new withdrawals
            );
        }

        res.status(201).json({
            success: true,
            data: withdrawal
        });
    } catch (error) {
        console.error('Error checking trades:', error);
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


// Get last used withdrawal method for a user
exports.getLastWithdrawalMethod = async (req, res, next) => {
    try {

        const Profile = require('../../models/client/Profile'); // Adjust path as needed
        const profile = await Profile.findOne({ user: req.user.id });

        if (profile && (profile.bankDetails || profile.walletDetails)) {
            // Return profile-based payment methods
            let paymentMethods = [];

            // Add bank details if available
            if (profile.bankDetails && profile.bankDetails.bankName) {
                paymentMethods.push({
                    type: 'bank',
                    details: {
                        ...profile.bankDetails,
                        ifscCode: profile.bankDetails.ifscSwiftCode
                    }
                });
            }

            // Add wallet details if available
            if (profile.walletDetails) {
                const wallets = [];
                if (profile.walletDetails.tetherWalletAddress) {
                    wallets.push({
                        type: 'usdt',
                        name: 'USDT',
                        address: profile.walletDetails.tetherWalletAddress
                    });
                }
                if (profile.walletDetails.ethWalletAddress) {
                    wallets.push({
                        type: 'ethereum',
                        name: 'Ethereum',
                        address: profile.walletDetails.ethWalletAddress
                    });
                }
                if (profile.walletDetails.trxWalletAddress) {
                    wallets.push({
                        type: 'tron',
                        name: 'TRON',
                        address: profile.walletDetails.trxWalletAddress
                    });
                }
                // Add bitcoin if you have it in profile
                // if (profile.walletDetails.bitcoinWalletAddress) {
                //     wallets.push({
                //         type: 'bitcoin',
                //         name: 'Bitcoin',
                //         address: profile.walletDetails.bitcoinWalletAddress
                //     });
                // }

                if (wallets.length > 0) {
                    paymentMethods.push({
                        type: 'ewallet',
                        wallets: wallets
                    });
                }
            }
            console.log('Returning profile payment methods:', paymentMethods);
            return res.status(200).json({
                success: true,
                data: {
                    source: 'profile',
                    paymentMethods: paymentMethods
                }
            });
        }

        // If no profile details, fall back to last withdrawal method
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
                source: 'withdrawal',
                paymentMethod: lastWithdrawal.paymentMethod,
                paymentDetails
            }
        });
    } catch (error) {
        next(error);
    }
};