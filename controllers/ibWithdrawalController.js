// Backend/controllers/client/ibWithdrawalController.js
const IBClientConfiguration = require('../models/client/IBClientConfiguration');
const IBWithdrawal = require('../models/IBWithdrawal');
const Profile = require('../models/client/Profile');
const User = require('../models/User');

// @desc    Get user profile details for withdrawal
// @route   GET /api/ibclients/withdrawals/profile-details
// @access  Private (Client)
exports.getProfileDetails = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user's profile with bank and wallet details
        const profile = await Profile.findOne({ user: userId });
        const user = await User.findById(userId, 'firstname lastname email');

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: 'Profile not found. Please complete your profile first.'
            });
        }

        // Get IB configuration to check balance
        const ibConfig = await IBClientConfiguration.findOne({ userId });

        if (!ibConfig) {
            return res.status(404).json({
                success: false,
                message: 'IB configuration not found.'
            });
        }

        const profileData = {
            user: {
                firstname: user.firstname,
                lastname: user.lastname,
                email: user.email
            },
            bankDetails: profile.bankDetails || {},
            walletDetails: profile.walletDetails || {},
            availableBalance: ibConfig.IBbalance || 0
        };

        res.status(200).json({
            success: true,
            profile: profileData
        });

    } catch (error) {
        console.error('Get Profile Details error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching profile details.'
        });
    }
};

// @desc    Request IB commission withdrawal
// @route   POST /api/ibclients/withdrawals/request
// @access  Private (Client)
exports.requestWithdrawal = async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, withdrawalMethod, bankDetails, walletDetails } = req.body;

        // Validation
        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid withdrawal amount'
            });
        }

        if (!withdrawalMethod || !['bank', 'wallet'].includes(withdrawalMethod)) {
            return res.status(400).json({
                success: false,
                message: 'Please select a valid withdrawal method'
            });
        }

        // Get IB configuration
        const ibConfig = await IBClientConfiguration.findOne({ userId });

        if (!ibConfig) {
            return res.status(404).json({
                success: false,
                message: 'IB configuration not found.'
            });
        }

        // Check available balance
        if (amount > ibConfig.IBbalance) {
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. Available: $${ibConfig.IBbalance.toFixed(2)}`
            });
        }

        // Validate withdrawal details based on method
        if (withdrawalMethod === 'bank') {
            if (!bankDetails || !bankDetails.bankName || !bankDetails.accountNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide complete bank details'
                });
            }
        } else if (withdrawalMethod === 'wallet') {
            if (!walletDetails || !walletDetails.walletType || !walletDetails.walletAddress) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide complete wallet details'
                });
            }
        }

        // Create withdrawal request
        const withdrawalData = {
            userId,
            ibConfigurationId: ibConfig._id,
            amount,
            withdrawalMethod,
            status: 'pending'
        };

        if (withdrawalMethod === 'bank') {
            withdrawalData.bankDetails = bankDetails;
        } else {
            withdrawalData.walletDetails = walletDetails;
        }

        const withdrawal = await IBWithdrawal.create(withdrawalData);

        res.status(201).json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            withdrawal: {
                _id: withdrawal._id,
                amount: withdrawal.amount,
                withdrawalMethod: withdrawal.withdrawalMethod,
                status: withdrawal.status,
                createdAt: withdrawal.createdAt
            }
        });

    } catch (error) {
        console.error('Request Withdrawal error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while processing your withdrawal request.'
        });
    }
};

// @desc    Get user's withdrawal history
// @route   GET /api/ibclients/withdrawals/history
// @access  Private (Client)
exports.getWithdrawalHistory = async (req, res) => {
    try {
        const userId = req.user.id;

        const withdrawals = await IBWithdrawal.find({ userId })
            .sort({ createdAt: -1 })
            .select('-approvedBy -adminNotes')
            .lean();

        res.status(200).json({
            success: true,
            withdrawals
        });

    } catch (error) {
        console.error('Get Withdrawal History error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching withdrawal history.'
        });
    }
};

// @desc    Cancel pending withdrawal request
// @route   DELETE /api/ibclients/withdrawals/:withdrawalId
// @access  Private (Client)
exports.cancelWithdrawal = async (req, res) => {
    try {
        const userId = req.user.id;
        const { withdrawalId } = req.params;

        const withdrawal = await IBWithdrawal.findOne({
            _id: withdrawalId,
            userId,
            status: 'pending'
        });

        if (!withdrawal) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal request not found or cannot be cancelled.'
            });
        }

        await IBWithdrawal.findByIdAndDelete(withdrawalId);

        res.status(200).json({
            success: true,
            message: 'Withdrawal request cancelled successfully'
        });

    } catch (error) {
        console.error('Cancel Withdrawal error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while cancelling the withdrawal request.'
        });
    }
};