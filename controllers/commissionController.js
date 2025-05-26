// backend/controllers/commissionController.js
const IBClientConfiguration = require('../models/client/IBClientConfiguration');
const IBCommission = require('../models/IBCommission');
const IBConfiguration = require('../models/admin/IBAdminConfiguration');
const Group = require('../models/Group');
const User = require('../models/User');

// @desc    Calculate and distribute IB commissions based on bonusPerLot
// @route   Internal function called after transactions
// @access  Internal
exports.calculateAndDistributeCommission = async (transaction) => {
    try {
        // Verify the transaction exists and is valid
        if (!transaction || !transaction.userId || !transaction.groupId || !transaction.lotSize) {
            console.error('Invalid transaction for commission calculation');
            return false;
        }

        // Get the user who made the transaction
        const user = await User.findById(transaction.userId);

        if (!user || !user.referredBy) {
            // No referral, no commission to distribute
            return true;
        }

        // Find the direct referrer's IB configuration
        let currentIB = await IBClientConfiguration.findOne({
            referralCode: user.referredBy,
            status: 'active'
        });

        if (!currentIB) {
            console.error('Referrer IB not found for code:', user.referredBy);
            return false;
        }

        // Get commission configuration from admin settings for this group and levels
        const adminConfigs = await IBConfiguration.find({ groupId: transaction.groupId })
            .sort({ level: 1 })
            .limit(10); // Maximum 10 levels

        if (adminConfigs.length === 0) {
            console.error('No commission configuration found for group:', transaction.groupId);
            return false;
        }

        // Process up to the configured levels or until no more upline
        let level = 1;
        let processedIBs = new Set(); // To avoid duplicate processing

        while (currentIB && level <= adminConfigs.length) {
            const ibId = currentIB._id.toString();

            // Avoid duplicate processing in case of circular references
            if (processedIBs.has(ibId)) {
                break;
            }

            processedIBs.add(ibId);

            // Get the bonus configuration for this level
            const levelConfig = adminConfigs.find(config => config.level === level);

            if (!levelConfig) {
                console.log(`No commission config found for level ${level}`);
                level++;
                // Move to next level in hierarchy
                if (currentIB.parent) {
                    currentIB = await IBClientConfiguration.findById(currentIB.parent);
                } else {
                    break;
                }
                continue;
            }

            // Calculate commission: bonusPerLot * lotSize
            const commissionAmount = levelConfig.bonusPerLot * transaction.lotSize;
            const baseAmount = transaction.amount || 0;

            if (commissionAmount > 0) {
                // Create commission record
                await IBCommission.create({
                    ibConfigurationId: currentIB._id,
                    userId: currentIB.userId,
                    clientId: transaction.userId,
                    transactionId: transaction._id,
                    level,
                    groupId: transaction.groupId,
                    lotSize: transaction.lotSize,
                    bonusPerLot: levelConfig.bonusPerLot,
                    baseAmount,
                    commissionAmount,
                    status: 'pending' // Pending until processed by admin
                });

                console.log(`Commission created: Level ${level}, Amount: ${commissionAmount}, IB: ${currentIB.referralCode}`);
            }

            // Move up to the next level in the hierarchy
            level++;
            if (currentIB.parent) {
                currentIB = await IBClientConfiguration.findById(currentIB.parent);
            } else {
                break;
            }
        }

        return true;
    } catch (error) {
        console.error('Commission calculation error:', error);
        return false;
    }
};

// @desc    Process commission payments (Admin function)
// @route   POST /api/admin/commissions/process
// @access  Private (Admin)
exports.processCommissionPayments = async (req, res) => {
    try {
        const { commissionIds, status } = req.body;

        if (!commissionIds || !Array.isArray(commissionIds) || !status) {
            return res.status(400).json({
                success: false,
                message: 'Please provide commission IDs and status'
            });
        }

        if (!['paid', 'cancelled'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status must be either "paid" or "cancelled"'
            });
        }

        // Update commission statuses
        const result = await IBCommission.updateMany(
            {
                _id: { $in: commissionIds },
                status: 'pending'
            },
            {
                status,
                updatedAt: Date.now()
            }
        );

        res.status(200).json({
            success: true,
            message: `${result.modifiedCount} commissions updated to ${status}`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Process commission payments error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while processing commission payments.'
        });
    }
};

// @desc    Get pending commissions for admin review
// @route   GET /api/admin/commissions/pending
// @access  Private (Admin)
exports.getPendingCommissions = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const commissions = await IBCommission.find({ status: 'pending' })
            .populate('userId', 'firstname lastname email')
            .populate('clientId', 'firstname lastname email')
            .populate('groupId', 'name value')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await IBCommission.countDocuments({ status: 'pending' });

        res.status(200).json({
            success: true,
            commissions,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        console.error('Get pending commissions error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching pending commissions.'
        });
    }
};

// Example usage in transaction controller
// This should be called after a successful transaction
/*
const { calculateAndDistributeCommission } = require('./commissionController');

// After creating a transaction
const transaction = {
    _id: newTransaction._id,
    userId: userId,
    groupId: groupId,
    lotSize: lotSize,
    amount: amount
};

// Calculate and distribute commissions
await calculateAndDistributeCommission(transaction);
*/

module.exports = {
    calculateAndDistributeCommission: exports.calculateAndDistributeCommission,
    processCommissionPayments: exports.processCommissionPayments,
    getPendingCommissions: exports.getPendingCommissions
};