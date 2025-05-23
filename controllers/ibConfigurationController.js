// backend/controllers/ibConfigurationController.js
const IBConfiguration = require('../models/IBConfiguration');
const IBCommission = require('../models/IBCommission');
const IBWithdrawal = require('../models/IBWithdrawal');
const User = require('../models/User');

// @desc    Create a new IB referral code
// @route   POST /api/ib-configurations/create
// @access  Private (Client)
exports.createIBConfiguration = async (req, res) => {
    try {
        const existingConfig = await IBConfiguration.findOne({ userId: req.user.id });

        if (existingConfig) {
            return res.status(400).json({
                success: false,
                message: 'You already have an IB referral code'
            });
        }

        let referralCode;
        let isUnique = false;

        while (!isUnique) {
            referralCode = IBConfiguration.generateReferralCode();
            const existingCode = await IBConfiguration.findOne({ referralCode });

            if (!existingCode) {
                isUnique = true;
            }
        }

        const user = await User.findById(req.user.id);
        let parentIB = null;

        if (user.referredBy) {
            parentIB = await IBConfiguration.findOne({ referralCode: user.referredBy });
        }

        const ibConfiguration = await IBConfiguration.create({
            userId: req.user.id,
            referralCode,
            parent: parentIB ? parentIB._id : null,
            level: parentIB ? parentIB.level + 1 : 0
        });

        res.status(201).json({
            success: true,
            ibConfiguration
        });
    } catch (error) {
        console.error('Create IB Configuration error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while creating your IB configuration.'
        });
    }
};

// @desc    Get user's own IB referral code
// @route   GET /api/ib-configurations/my-code
// @access  Private (Client)
exports.getMyIBConfiguration = async (req, res) => {
    try {
        const ibConfiguration = await IBConfiguration.findOne({ userId: req.user.id });

        if (!ibConfiguration) {
            return res.status(404).json({
                success: false,
                message: 'No IB configuration found for this user'
            });
        }

        res.status(200).json({
            success: true,
            ibConfiguration
        });
    } catch (error) {
        console.error('Get IB Configuration error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching your IB configuration.'
        });
    }
};

// @desc    Get IB dashboard summary
// @route   GET /api/ib-configurations/dashboard
// @access  Private (Client)
exports.getIBDashboardSummary = async (req, res) => {
    try {
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
                    status: { $in: ['completed', 'approved'] }
                }
            },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const totalWithdrawn = totalWithdrawals.length > 0 ? totalWithdrawals[0].total : 0;

        const withdrawableBalance = totalCommission - totalWithdrawn;

        const partners = await ibConfiguration.getDownlinePartners();
        const partnersCount = partners.length;

        res.status(200).json({
            success: true,
            summary: {
                totalCommission,
                withdrawableBalance,
                totalWithdrawals: totalWithdrawn,
                partnersCount
            }
        });
    } catch (error) {
        console.error('Get IB Dashboard Summary error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching your IB dashboard summary.'
        });
    }
};

// @desc    Get all partners/downline list
// @route   GET /api/ib-configurations/partners
// @access  Private (Client)
exports.getPartnersList = async (req, res) => {
    try {
        const ibConfiguration = await IBConfiguration.findOne({ userId: req.user.id });

        if (!ibConfiguration) {
            return res.status(404).json({
                success: false,
                message: 'No IB configuration found. Please create your referral code first.'
            });
        }

        const partners = await ibConfiguration.getDownlinePartners();

        const enhancedPartners = await Promise.all(partners.map(async (partner) => {
            const commissions = await IBCommission.aggregate([
                { $match: { clientId: partner.userId._id } },
                { $group: { _id: null, total: { $sum: "$baseAmount" } } }
            ]);

            const totalVolume = commissions.length > 0 ? commissions[0].total : 0;

            const earned = await IBCommission.aggregate([
                {
                    $match: {
                        ibConfigurationId: ibConfiguration._id,
                        clientId: partner.userId._id
                    }
                },
                { $group: { _id: null, total: { $sum: "$commissionAmount" } } }
            ]);

            const totalEarned = earned.length > 0 ? earned[0].total : 0;

            return {
                ...partner,
                totalVolume,
                totalEarned
            };
        }));

        res.status(200).json({
            success: true,
            partners: enhancedPartners
        });
    } catch (error) {
        console.error('Get Partners List error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching your partners list.'
        });
    }
};

// @desc    Verify and apply referral code during signup
// @route   POST /api/ib-configurations/verify-referral
// @access  Public
exports.verifyReferralCode = async (req, res) => {
    try {
        const { referralCode } = req.body;

        if (!referralCode) {
            return res.status(400).json({
                success: false,
                message: 'Referral code is required'
            });
        }

        const ibConfiguration = await IBConfiguration.findOne({
            referralCode,
            status: 'active'
        });

        if (!ibConfiguration) {
            return res.status(404).json({
                success: false,
                message: 'Invalid or inactive referral code'
            });
        }

        const referringUser = await User.findById(ibConfiguration.userId);

        if (!referringUser) {
            return res.status(404).json({
                success: false,
                message: 'Referring user not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Valid referral code',
            referralInfo: {
                referralCode,
                referringUserName: `${referringUser.firstname} ${referringUser.lastname}`
            }
        });
    } catch (error) {
        console.error('Verify Referral Code error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while verifying the referral code.'
        });
    }
};

// @desc    Get IB tree data
// @route   GET /api/ib-configurations/tree
// @access  Private (Client)
exports.getIBTree = async (req, res) => {
    try {
        const ibConfiguration = await IBConfiguration.findOne({ userId: req.user.id });

        if (!ibConfiguration) {
            return res.status(404).json({
                success: false,
                message: 'No IB configuration found. Please create your referral code first.'
            });
        }

        const partners = await ibConfiguration.getDownlinePartners();

        const organizeTree = (partners) => {
            const nodeMap = new Map();

            const root = {
                id: ibConfiguration._id.toString(),
                name: `${req.user.firstname} ${req.user.lastname}`,
                email: req.user.email,
                referralCode: ibConfiguration.referralCode,
                level: 0,
                children: []
            };

            nodeMap.set(root.id, root);

            partners.forEach(partner => {
                const node = {
                    id: partner._id.toString(),
                    name: `${partner.userId.firstname} ${partner.userId.lastname}`,
                    email: partner.userId.email,
                    referralCode: partner.referralCode,
                    level: partner.level,
                    children: []
                };

                nodeMap.set(node.id, node);
            });

            partners.forEach(partner => {
                if (partner.parent) {
                    const parentId = partner.parent.toString();
                    const childId = partner._id.toString();

                    if (nodeMap.has(parentId) && nodeMap.has(childId)) {
                        nodeMap.get(parentId).children.push(nodeMap.get(childId));
                    }
                } else {
                    const childId = partner._id.toString();
                    if (nodeMap.has(childId) && partner.level === 1) {
                        root.children.push(nodeMap.get(childId));
                    }
                }
            });

            return root;
        };

        const treeData = organizeTree(partners);

        res.status(200).json({
            success: true,
            treeData
        });
    } catch (error) {
        console.error('Get IB Tree error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching your IB tree data.'
        });
    }
};
