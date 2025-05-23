// backend/controllers/ibWithdrawalController.js
const IBConfiguration = require('../models/IBConfiguration');
const IBCommission = require('../models/IBCommission');
const IBWithdrawal = require('../models/IBWithdrawal');

// @desc    Request IB commission withdrawal
// @route   POST /api/withdrawals/ib-withdraw
// @access  Private (Client)
exports.requestIBWithdrawal = async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid withdrawal amount'
            });
        }

        const ibConfiguration = await IBConfiguration.findOne({ userId: req.user.id });

        if (!ibConfiguration) {
            return res.status(404).json({
                success: false,
                message: 'No IB configuration found. Please create your referral code first.'
            });
        }

        const totalCommissions = await IBCommission.aggregate([
            { $match: { ibConfigurationId: ibConfiguration._id } },
            { $group: { _id: null, total: { $sum: "$commissionAmount" } } }
        ]);

        const totalCommission = totalCommissions.length > 0 ? totalCommissions[0].total : 0;

        const totalWithdrawals = await IBWithdrawal.aggregate([
            {
                $match: {
                    ibConfigurationId: ibConfiguration._id,
                    status: { $in: ['pending', 'approved', 'completed'] }
                }
            },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const totalWithdrawn = totalWithdrawals.length > 0 ? totalWithdrawals[0].total : 0;

        const withdrawableBalance = totalCommission - totalWithdrawn;

        if (amount > withdrawableBalance) {
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. Available: $${withdrawableBalance.toFixed(2)}`
            });
        }

        const withdrawal = await IBWithdrawal.create({
            ibConfigurationId: ibConfiguration._id,
            userId: req.user.id,
            amount
        });

        res.status(201).json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            withdrawal
        });
    } catch (error) {
        console.error('IB Withdrawal Request error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while processing your withdrawal request.'
        });
    }
};

// @desc    Get IB withdrawal history
// @route   GET /api/withdrawals/ib-withdrawals
// @access  Private (Client)
exports.getIBWithdrawals = async (req, res) => {
    try {
        const ibConfiguration = await IBConfiguration.findOne({ userId: req.user.id });

        if (!ibConfiguration) {
            return res.status(404).json({
                success: false,
                message: 'No IB configuration found. Please create your referral code first.'
            });
        }

        const withdrawals = await IBWithdrawal.find({ ibConfigurationId: ibConfiguration._id })
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            withdrawals
        });
    } catch (error) {
        console.error('Get IB Withdrawals error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching your withdrawal history.'
        });
    }
};
