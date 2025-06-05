// Backend/controllers/admin/ibWithdrawalController.js
const IBWithdrawal = require('../../models/IBWithdrawal');
const IBClientConfiguration = require('../../models/client/IBClientConfiguration');
const User = require('../../models/User');
const mongoose = require('mongoose');

// @desc    Get all withdrawal requests for admin
// @route   GET /api/admin/ib-withdrawals
// @access  Private (Admin)
exports.getAllWithdrawals = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;

        // Build query
        const query = {};
        if (status && status !== 'all') {
            query.status = status;
        }

        const withdrawals = await IBWithdrawal.find(query)
            .populate('userId', 'firstname lastname email country')
            .populate('ibConfigurationId', 'IBbalance referralCode')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const total = await IBWithdrawal.countDocuments(query);

        res.status(200).json({
            success: true,
            withdrawals,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get All Withdrawals error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching withdrawal requests.'
        });
    }
};

// @desc    Get withdrawal details by ID
// @route   GET /api/admin/ib-withdrawals/:withdrawalId
// @access  Private (Admin)
exports.getWithdrawalDetails = async (req, res) => {
    try {
        const { withdrawalId } = req.params;

        const withdrawal = await IBWithdrawal.findById(withdrawalId)
            .populate('userId', 'firstname lastname email country phone')
            .populate('ibConfigurationId', 'IBbalance referralCode level')
            .populate('approvedBy', 'firstname lastname email')
            .lean();

        if (!withdrawal) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal request not found.'
            });
        }

        res.status(200).json({
            success: true,
            withdrawal
        });

    } catch (error) {
        console.error('Get Withdrawal Details error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching withdrawal details.'
        });
    }
};

// @desc    Approve withdrawal request
// @route   PUT /api/admin/ib-withdrawals/:withdrawalId/approve
// @access  Private (Admin)
exports.approveWithdrawal = async (req, res) => {
    try {
        const { withdrawalId } = req.params;
        const { adminNotes, transactionId } = req.body;
        const adminId = req.user.id;

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(withdrawalId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid withdrawal ID format.'
            });
        }

        const withdrawal = await IBWithdrawal.findById(withdrawalId)
            .populate('ibConfigurationId');

        if (!withdrawal) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal request not found.'
            });
        }

        if (withdrawal.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Only pending withdrawals can be approved.'
            });
        }

        // Check if IB has sufficient balance
        const ibConfig = withdrawal.ibConfigurationId;
        if (!ibConfig) {
            return res.status(400).json({
                success: false,
                message: 'IB configuration not found.'
            });
        }

        if (withdrawal.amount > ibConfig.IBbalance) {
            return res.status(400).json({
                success: false,
                message: `Insufficient IB balance. Available: ${ibConfig.IBbalance.toFixed(2)}, Requested: ${withdrawal.amount.toFixed(2)}`
            });
        }

        // Update withdrawal status first (this locks the record)
        const updatedWithdrawal = await IBWithdrawal.findByIdAndUpdate(
            withdrawalId,
            {
                status: 'approved',
                approvedBy: adminId,
                approvedAt: new Date(),
                adminNotes: adminNotes || '',
                transactionId: transactionId || '',
                processedAt: new Date()
            },
            { new: true }
        );

        if (!updatedWithdrawal) {
            return res.status(404).json({
                success: false,
                message: 'Failed to update withdrawal status.'
            });
        }

        // Now deduct the amount from IB balance
        const updatedIBConfig = await IBClientConfiguration.findByIdAndUpdate(
            ibConfig._id,
            { $inc: { IBbalance: -withdrawal.amount } },
            { new: true }
        );

        if (!updatedIBConfig) {
            // Rollback withdrawal status if balance update fails
            await IBWithdrawal.findByIdAndUpdate(
                withdrawalId,
                { status: 'pending' }
            );

            return res.status(500).json({
                success: false,
                message: 'Failed to update IB balance. Withdrawal reverted to pending.'
            });
        }

        // Populate the response data
        const finalWithdrawal = await IBWithdrawal.findById(withdrawalId)
            .populate('userId', 'firstname lastname email')
            .populate('approvedBy', 'firstname lastname');

        res.status(200).json({
            success: true,
            message: 'Withdrawal approved successfully',
            withdrawal: finalWithdrawal,
            updatedBalance: updatedIBConfig.IBbalance
        });

    } catch (error) {
        console.error('Approve Withdrawal error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while approving the withdrawal.'
        });
    }
};

// @desc    Reject withdrawal request
// @route   PUT /api/admin/ib-withdrawals/:withdrawalId/reject
// @access  Private (Admin)
exports.rejectWithdrawal = async (req, res) => {
    try {
        const { withdrawalId } = req.params;
        const { rejectedReason, adminNotes } = req.body;
        const adminId = req.user.id;

        if (!rejectedReason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required.'
            });
        }

        const withdrawal = await IBWithdrawal.findById(withdrawalId);

        if (!withdrawal) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal request not found.'
            });
        }

        if (withdrawal.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Only pending withdrawals can be rejected.'
            });
        }

        // Update withdrawal status
        const updatedWithdrawal = await IBWithdrawal.findByIdAndUpdate(
            withdrawalId,
            {
                status: 'rejected',
                rejectedReason,
                adminNotes: adminNotes || '',
                approvedBy: adminId,
                processedAt: new Date()
            },
            { new: true }
        ).populate('userId', 'firstname lastname email')
            .populate('approvedBy', 'firstname lastname');

        res.status(200).json({
            success: true,
            message: 'Withdrawal rejected successfully',
            withdrawal: updatedWithdrawal
        });

    } catch (error) {
        console.error('Reject Withdrawal error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while rejecting the withdrawal.'
        });
    }
};

// @desc    Get withdrawal statistics
// @route   GET /api/admin/ib-withdrawals/stats
// @access  Private (Admin)
exports.getWithdrawalStats = async (req, res) => {
    try {
        const stats = await IBWithdrawal.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' }
                }
            }
        ]);

        const totalRequests = await IBWithdrawal.countDocuments();
        const totalAmount = await IBWithdrawal.aggregate([
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const formattedStats = {
            totalRequests,
            totalAmount: totalAmount.length > 0 ? totalAmount[0].total : 0,
            byStatus: {}
        };

        stats.forEach(stat => {
            formattedStats.byStatus[stat._id] = {
                count: stat.count,
                amount: stat.totalAmount
            };
        });

        res.status(200).json({
            success: true,
            stats: formattedStats
        });

    } catch (error) {
        console.error('Get Withdrawal Stats error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching withdrawal statistics.'
        });
    }
};