// Backend/controllers/client/commissionController.js - Enhanced Version
const IBCommission = require('../models/IBCommission');
const IBClientConfiguration = require('../models/client/IBClientConfiguration');
const IBClosedTrades = require('../models/IBClosedTrade');
const User = require('../models/User');
const Account = require('../models/client/Account');

// @desc    Get trade commissions for the logged-in user
// @route   GET /api/ibclients/commission/trade-commissions
// @access  Private (Client)
exports.getTradeCommissions = async (req, res) => {
    try {
        const userId = req.user.id;

        // Find user's IB configuration
        const ibConfig = await IBClientConfiguration.findOne({ userId });

        if (!ibConfig) {
            return res.status(404).json({
                success: false,
                message: 'No IB configuration found. Please set up your referral system first.'
            });
        }

        // Get all commissions where this user is the IB (earning commissions)
        const commissions = await IBCommission.find({ ibUserId: userId })
            .populate('clientId', 'firstname lastname email')
            .populate('tradeId')
            .sort({ createdAt: -1 })
            .lean();

        // Transform data for frontend
        const trades = commissions.map(commission => ({
            acNo: commission.clientMT5Account,
            openTime: commission.openTime,
            closeTime: commission.closeTime,
            openPrice: commission.openPrice.toFixed(5),
            closePrice: commission.closePrice.toFixed(5),
            symbol: commission.symbol,
            profit: commission.profit,
            volume: commission.volume,
            rebate: commission.commissionAmount, // Changed from commission.commissionAmount to match frontend
            status: commission.status,
            level: commission.level
        }));

        // Calculate totals - Updated to show commission instead of profit in first card
        const totals = {
            totalProfit: commissions.reduce((sum, c) => sum + c.profit, 0),
            totalVolume: commissions.reduce((sum, c) => sum + c.volume, 0),
            totalRebate: commissions.reduce((sum, c) => sum + c.commissionAmount, 0) // This is the commission total
        };

        res.status(200).json({
            success: true,
            trades,
            totals
        });

    } catch (error) {
        console.error('Get Trade Commissions error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching trade commissions.'
        });
    }
};

// @desc    Get commission summary for dashboard
// @route   GET /api/ibclients/commission/summary
// @access  Private (Client)
exports.getCommissionSummary = async (req, res) => {
    try {
        const userId = req.user.id;
        const { period = '30' } = req.query; // Default to 30 days

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(period));

        // Get commissions for the period
        const commissions = await IBCommission.find({
            ibUserId: userId,
            createdAt: { $gte: startDate, $lte: endDate }
        });

        // Calculate summary statistics
        const summary = {
            totalCommission: commissions.reduce((sum, c) => sum + c.commissionAmount, 0),
            totalTrades: commissions.length,
            totalVolume: commissions.reduce((sum, c) => sum + c.volume, 0),
            totalProfit: commissions.reduce((sum, c) => sum + c.profit, 0),
            avgCommissionPerTrade: commissions.length > 0
                ? commissions.reduce((sum, c) => sum + c.commissionAmount, 0) / commissions.length
                : 0,
            period: parseInt(period)
        };

        res.status(200).json({
            success: true,
            summary
        });

    } catch (error) {
        console.error('Get Commission Summary error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching commission summary.'
        });
    }
};

// @desc    Get detailed commission breakdown by level
// @route   GET /api/ibclients/commission/breakdown
// @access  Private (Client)
exports.getCommissionBreakdown = async (req, res) => {
    try {
        const userId = req.user.id;
        const { period = '30' } = req.query;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(period));

        // Get commissions grouped by level
        const breakdown = await IBCommission.aggregate([
            {
                $match: {
                    ibUserId: userId,
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: '$level',
                    totalCommission: { $sum: '$commissionAmount' },
                    totalTrades: { $sum: 1 },
                    totalVolume: { $sum: '$volume' },
                    avgCommission: { $avg: '$commissionAmount' }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        res.status(200).json({
            success: true,
            breakdown
        });

    } catch (error) {
        console.error('Get Commission Breakdown error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching commission breakdown.'
        });
    }
};

// @desc    Get commission details for a specific partner/client
// @route   GET /api/ibclients/commission/partner/:partnerId
// @access  Private (Client)
exports.getPartnerCommissions = async (req, res) => {
    try {
        const userId = req.user.id;
        const partnerId = req.params.partnerId;

        console.log('Getting partner commissions for userId:', userId, 'partnerId:', partnerId);

        // Verify that the partner is actually a downline of the current user
        const partnerIBConfig = await IBClientConfiguration.findById(partnerId);

        if (!partnerIBConfig) {
            return res.status(404).json({
                success: false,
                message: 'Partner not found.'
            });
        }

        console.log('Found partner IB config:', partnerIBConfig);

        // Get commissions earned from this specific partner (using IB config ID)
        const commissions = await IBCommission.find({
            ibUserId: userId,
            clientId: partnerIBConfig.userId
        })
            .populate('clientId', 'firstname lastname email')
            .sort({ createdAt: -1 });

        console.log('Found commissions:', commissions.length);

        // Get partner details
        const partner = await User.findById(partnerIBConfig.userId, 'firstname lastname email');
        const partnerAccounts = await Account.find({ user: partnerIBConfig.userId });

        // Transform data - ensure we're showing the MT5 account in the trade details
        const trades = commissions.map(commission => ({
            acNo: commission.clientMT5Account, // This is the MT5 account number
            openTime: commission.openTime,
            closeTime: commission.closeTime,
            openPrice: commission.openPrice.toFixed(5),
            closePrice: commission.closePrice.toFixed(5),
            symbol: commission.symbol,
            profit: commission.profit,
            volume: commission.volume,
            rebate: commission.commissionAmount,
            status: commission.status,
            level: commission.level
        }));

        console.log('Transformed trades:', trades.length);

        // Calculate totals
        const totals = {
            totalProfit: commissions.reduce((sum, c) => sum + c.profit, 0),
            totalVolume: commissions.reduce((sum, c) => sum + c.volume, 0),
            totalRebate: commissions.reduce((sum, c) => sum + c.commissionAmount, 0)
        };

        res.status(200).json({
            success: true,
            partner: {
                id: partner._id,
                name: `${partner.firstname} ${partner.lastname}`,
                email: partner.email,
                accounts: partnerAccounts.map(acc => acc.mt5Account)
            },
            trades,
            totals
        });

    } catch (error) {
        console.error('Get Partner Commissions error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching partner commissions.'
        });
    }
};

// @desc    Get enhanced partners list with commission data
// @route   GET /api/ibclients/commission/partners
// @access  Private (Client)
exports.getPartnersWithCommissions = async (req, res) => {
    try {
        const userId = req.user.id;

        // Find user's IB configuration
        const ibConfig = await IBClientConfiguration.findOne({ userId });

        if (!ibConfig) {
            return res.status(404).json({
                success: false,
                message: 'No IB configuration found.'
            });
        }

        // Get all downline partners
        const partners = await this.getAllDownlinePartners(ibConfig._id, ibConfig.level);

        // Enhanced partners with commission data
        const enhancedPartners = await Promise.all(partners.map(async (partner) => {
            try {
                // Get commissions earned from this partner
                const commissions = await IBCommission.find({
                    ibUserId: userId,
                    clientId: partner.userId._id
                });

                // Get partner's account details (MT5 account)
                const partnerAccount = await Account.findOne({ user: partner.userId._id });

                // Get full user details including country
                const fullUserDetails = await User.findById(partner.userId._id, 'firstname lastname email country');

                const totalEarned = commissions.reduce((sum, c) => sum + c.commissionAmount, 0);
                const totalVolume = commissions.reduce((sum, c) => sum + c.volume, 0);
                const totalTrades = commissions.length;

                return {
                    _id: partner._id,
                    userId: partner.userId,
                    referralCode: partner.referralCode,
                    level: partner.level,
                    totalVolume,
                    totalEarned,
                    totalTrades,
                    createdAt: partner.createdAt,
                    // Enhanced fields with actual data from user and account models
                    country: fullUserDetails?.country?.name || 'Unknown',
                    mt5Account: partnerAccount ? partnerAccount.mt5Account : 'No Account'
                };
            } catch (error) {
                console.error('Error processing partner:', partner._id, error);
                return {
                    _id: partner._id,
                    userId: partner.userId,
                    referralCode: partner.referralCode,
                    level: partner.level,
                    totalVolume: 0,
                    totalEarned: 0,
                    totalTrades: 0,
                    createdAt: partner.createdAt,
                    country: 'Unknown',
                    mt5Account: 'No Account'
                };
            }
        }));

        res.status(200).json({
            success: true,
            partners: enhancedPartners
        });

    } catch (error) {
        console.error('Get Partners With Commissions error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching partners with commissions.'
        });
    }
};

// Helper function to get all downline partners recursively
exports.getAllDownlinePartners = async (ibConfigId, currentUserLevel = null) => {
    try {
        const directPartners = await IBClientConfiguration.find({
            parent: ibConfigId
        }).populate('userId', 'firstname lastname email country');

        let allPartners = [];

        // Process direct partners
        for (const partner of directPartners) {
            // If currentUserLevel is provided, normalize the level for display
            let displayLevel = partner.level;
            if (currentUserLevel !== null) {
                displayLevel = partner.level - currentUserLevel;
            }

            // Add partner with normalized level
            allPartners.push({
                ...partner.toObject(),
                level: displayLevel
            });

            // Recursively get partners of each direct partner
            const subPartners = await this.getAllDownlinePartners(partner._id, currentUserLevel);
            allPartners = allPartners.concat(subPartners);
        }

        return allPartners;
    } catch (error) {
        console.error('Error getting downline partners:', error);
        return [];
    }
};

// @desc    Get sync status for trade synchronization
// @route   GET /api/sync/status
// @access  Public (used by sync service)
exports.getSyncStatus = async (req, res) => {
    try {
        // This would typically come from your sync service
        // For now, returning a mock status
        const syncStatus = {
            isProcessing: false,
            lastSyncTime: new Date().toISOString(),
            nextSyncIn: '10 seconds'
        };

        res.status(200).json({
            success: true,
            syncStatus
        });
    } catch (error) {
        console.error('Get Sync Status error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching sync status.'
        });
    }
};