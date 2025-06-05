// backend/controllers/ibClientConfigurationController.js
const IBClientConfiguration = require('../../models/client/IBClientConfiguration');
const IBCommission = require('../../models/IBCommission');
const IBWithdrawal = require('../../models/IBWithdrawal');
const IBConfiguration = require('../../models/admin/IBAdminConfiguration');
const User = require('../../models/User');
const crypto = require('crypto');

// @desc    Create a new IB referral code (or activate existing pending one)
// @route   POST /api/ibclients/ib-configurations/create
// @access  Private (Client)
exports.createIBConfiguration = async (req, res) => {
    try {
        // Check if user already has an IB configuration
        const existingConfig = await IBClientConfiguration.findOne({ userId: req.user.id });

        if (existingConfig) {
            // If user has a pending configuration without referral code, generate one
            if (existingConfig.status === 'pending' && !existingConfig.referralCode) {
                // Generate unique referral code
                let referralCode;
                let isUnique = false;
                let attempts = 0;
                const maxAttempts = 10;

                while (!isUnique && attempts < maxAttempts) {
                    referralCode = crypto.randomBytes(3).toString('hex').toUpperCase();
                    console.log('Generated referral code:', referralCode);

                    const existingCode = await IBClientConfiguration.findOne({ referralCode });

                    if (!existingCode) {
                        isUnique = true;
                    }
                    attempts++;
                }

                if (!isUnique) {
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to generate unique referral code'
                    });
                }

                // Update existing configuration with referral code and activate it
                existingConfig.referralCode = referralCode;
                existingConfig.status = 'active';
                await existingConfig.save();

                console.log('Updated existing IB configuration with referral code:', referralCode);

                return res.status(200).json({
                    success: true,
                    message: 'IB configuration activated successfully with referral code',
                    ibConfiguration: existingConfig
                });
            }
            // If user has pending configuration with referral code, just activate it
            else if (existingConfig.status === 'pending' && existingConfig.referralCode) {
                existingConfig.status = 'active';
                await existingConfig.save();

                return res.status(200).json({
                    success: true,
                    message: 'IB configuration activated successfully',
                    ibConfiguration: existingConfig
                });
            }
            // If user already has active configuration
            else {
                return res.status(400).json({
                    success: false,
                    message: 'You already have an active IB referral code'
                });
            }
        }

        // Generate new referral code for users without existing configuration
        let referralCode;
        let isUnique = false;
        let attempts = 0;
        const maxAttempts = 10;

        while (!isUnique && attempts < maxAttempts) {
            // Generate 6-character hex code
            referralCode = crypto.randomBytes(3).toString('hex').toUpperCase();
            console.log('Generated referral code:', referralCode);

            const existingCode = await IBClientConfiguration.findOne({ referralCode });

            if (!existingCode) {
                isUnique = true;
            }
            attempts++;
        }

        if (!isUnique) {
            return res.status(500).json({
                success: false,
                message: 'Failed to generate unique referral code'
            });
        }

        console.log('Final referral code before creation:', referralCode);

        const user = await User.findById(req.user.id);
        let parentIB = null;

        if (user.referredBy) {
            parentIB = await IBClientConfiguration.findOne({ referralCode: user.referredBy });
        }

        const ibConfiguration = await IBClientConfiguration.create({
            userId: req.user.id,
            referralCode,
            parent: parentIB ? parentIB._id : null,
            level: parentIB ? parentIB.level + 1 : 0,
            referredBy: user.referredBy,
            status: 'active'
        });

        console.log('Created new IB configuration with referral code:', referralCode);

        res.status(201).json({
            success: true,
            message: 'IB configuration created successfully',
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


// @desc    Get user's own IB referral code with parent details
// @route   GET /api/ibclients/ib-configurations/my-code
// @access  Private (Client)
exports.getMyIBConfiguration = async (req, res) => {
    try {
        const ibConfiguration = await IBClientConfiguration.findOne({ userId: req.user.id })
            .populate({
                path: 'parent',
                populate: {
                    path: 'userId',
                    select: 'firstname lastname email'
                }
            });

        if (!ibConfiguration) {
            return res.status(404).json({
                success: false,
                message: 'No IB configuration found for this user'
            });
        }

        // Get parent referral details if exists
        let parentDetails = null;
        if (ibConfiguration.parent && ibConfiguration.parent.userId) {
            parentDetails = {
                name: `${ibConfiguration.parent.userId.firstname} ${ibConfiguration.parent.userId.lastname}`,
                email: ibConfiguration.parent.userId.email,
                referralCode: ibConfiguration.parent.referralCode,
                level: ibConfiguration.parent.level
            };
        }

        res.status(200).json({
            success: true,
            ibConfiguration: {
                ...ibConfiguration.toObject(),
                parentDetails
            }
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
// @route   GET /api/ibclients/ib-configurations/dashboard
// @access  Private (Client)
exports.getIBDashboardSummary = async (req, res) => {
    try {
        const ibConfiguration = await IBClientConfiguration.findOne({ userId: req.user.id });

        if (!ibConfiguration) {
            return res.status(404).json({
                success: false,
                message: 'No IB configuration found. Please create your referral code first.'
            });
        }

        // Get commission configurations from admin settings
        const adminConfigs = await IBConfiguration.find().populate('groupId');

        // Calculate total commissions earned (using bonusPerLot from admin configurations)
        const totalCommissions = await IBCommission.aggregate([
            { $match: { ibConfigurationId: ibConfiguration._id } },
            { $group: { _id: null, total: { $sum: "$commissionAmount" } } }
        ]);

        const totalCommission = totalCommissions.length > 0 ? totalCommissions[0].total : 0;

        // Get total withdrawals
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

        // Fixed: Get partners count using the corrected method
        const partners = await this.getAllDownlinePartners(ibConfiguration._id);
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

// Helper function to get all downline partners recursively with level normalization
exports.getAllDownlinePartners = async (ibConfigId, currentUserLevel = null) => {
    try {
        // Find all partners that have this IB as parent (direct referrals)
        const directPartners = await IBClientConfiguration.find({
            parent: ibConfigId
        }).populate('userId', 'firstname lastname email');

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
                level: displayLevel // Override level with normalized value
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

// @desc    Get all partners/downline list
// @route   GET /api/ibclients/ib-configurations/partners
// @access  Private (Client)
exports.getPartnersList = async (req, res) => {
    try {
        console.log('Getting partners list for user:', req.user.id);
        const ibConfiguration = await IBClientConfiguration.findOne({ userId: req.user.id });

        console.log('IB Configuration:', ibConfiguration);
        if (!ibConfiguration) {
            return res.status(404).json({
                success: false,
                message: 'No IB configuration found. Please create your referral code first.'
            });
        }

        console.log('IB Configuration found:', ibConfiguration._id);

        // Get all partners with levels normalized based on current user's level
        const partners = await this.getAllDownlinePartners(ibConfiguration._id, ibConfiguration.level);

        console.log('Total partners found:', partners.length);

        if (partners.length === 0) {
            return res.status(200).json({
                success: true,
                partners: []
            });
        }

        const enhancedPartners = await Promise.all(partners.map(async (partner) => {
            try {
                // Get total volume from this partner's transactions
                const commissions = await IBCommission.aggregate([
                    { $match: { clientId: partner.userId._id } },
                    { $group: { _id: null, total: { $sum: "$volume" } } }
                ]);

                const totalVolume = commissions.length > 0 ? commissions[0].total : 0;

                // Get commissions earned from this partner
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
                    _id: partner._id,
                    userId: partner.userId,
                    referralCode: partner.referralCode,
                    level: partner.level, // This is now the normalized level
                    totalVolume,
                    totalEarned,
                    createdAt: partner.createdAt
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
                    createdAt: partner.createdAt
                };
            }
        }));

        console.log('Enhanced partners:', enhancedPartners.length);

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
// @route   POST /api/ibclients/ib-configurations/verify-referral
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

        const ibConfiguration = await IBClientConfiguration.findOne({
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

// Helper function to get all downline partners for tree building
exports.getAllDownlinePartnersForTree = async (ibConfigId) => {
    try {
        // Find all partners that have this IB as parent (direct referrals)
        const directPartners = await IBClientConfiguration.find({
            parent: ibConfigId
        }).populate('userId', 'firstname lastname email');

        let allPartners = [];

        // Process direct partners
        for (const partner of directPartners) {
            // Add partner as-is (we'll handle level assignment in tree building)
            allPartners.push(partner.toObject());

            // Recursively get partners of each direct partner
            const subPartners = await this.getAllDownlinePartnersForTree(partner._id);
            allPartners = allPartners.concat(subPartners);
        }

        return allPartners;
    } catch (error) {
        console.error('Error getting downline partners for tree:', error);
        return [];
    }
};

// @desc    Get IB tree data with proper hierarchy - ROOT > L0 > L1 > L2 format
// @route   GET /api/ibclients/ib-configurations/tree
// @access  Private (Client)
exports.getIBTree = async (req, res) => {
    try {
        const userIBConfig = await IBClientConfiguration.findOne({ userId: req.user.id })
            .populate('userId', 'firstname lastname email');

        if (!userIBConfig) {
            return res.status(404).json({
                success: false,
                message: 'No IB configuration found. Please create your referral code first.'
            });
        }

        let rootNode = null;
        let currentUserNode = null;

        // If user has a parent (was referred by someone)
        if (userIBConfig.parent) {
            // Find the parent who referred this user
            const parentConfig = await IBClientConfiguration.findById(userIBConfig.parent)
                .populate('userId', 'firstname lastname email');

            if (parentConfig) {
                // Parent becomes ROOT
                rootNode = {
                    id: parentConfig._id.toString(),
                    name: `${parentConfig.userId.firstname} ${parentConfig.userId.lastname}`,
                    email: parentConfig.userId.email,
                    referralCode: parentConfig.referralCode,
                    level: 'ROOT',
                    isRoot: true,
                    children: []
                };

                // Current user becomes L0 (first level under root)
                currentUserNode = {
                    id: userIBConfig._id.toString(),
                    name: `${req.user.firstname} ${req.user.lastname} (You)`,
                    email: req.user.email,
                    referralCode: userIBConfig.referralCode,
                    level: '0',
                    isCurrentUser: true,
                    children: []
                };

                // Add current user as child of root
                rootNode.children.push(currentUserNode);
            }
        } else {
            // User has no parent, so user becomes ROOT
            currentUserNode = {
                id: userIBConfig._id.toString(),
                name: `${req.user.firstname} ${req.user.lastname} (You)`,
                email: req.user.email,
                referralCode: userIBConfig.referralCode,
                level: 'ROOT',
                isCurrentUser: true,
                isRoot: true,
                children: []
            };
            rootNode = currentUserNode;
        }

        // Get all downline partners of the current user
        const userDownlinePartners = await this.getAllDownlinePartnersForTree(userIBConfig._id);

        console.log('User downline partners:', userDownlinePartners.length);

        // Build tree structure for current user's downline with L1, L2, L3... format
        const buildDownlineTree = (partners, parentId, baseLevel) => {
            // Find direct children of the parent
            const directChildren = partners.filter(partner =>
                partner.parent && partner.parent.toString() === parentId
            );

            return directChildren.map((child, index) => {
                // Calculate level: L1, L2, L3, etc. for user's direct downline
                const levelNumber = baseLevel + 1;
                const levelLabel = `${levelNumber}`;

                const childNode = {
                    id: child._id.toString(),
                    name: `${child.userId.firstname} ${child.userId.lastname}`,
                    email: child.userId.email,
                    referralCode: child.referralCode,
                    level: levelLabel,
                    children: []
                };

                // Recursively build children
                childNode.children = buildDownlineTree(partners, child._id.toString(), levelNumber);

                return childNode;
            });
        };

        // Add downline partners to current user's children
        // Start with L1 for user's direct referrals (baseLevel = 0, so first level becomes L1)
        const startingLevel = userIBConfig.parent ? 0 : 0; // Always start from 0 for L1, L2, L3...
        currentUserNode.children = buildDownlineTree(
            userDownlinePartners,
            userIBConfig._id.toString(),
            startingLevel
        );

        res.status(200).json({
            success: true,
            treeData: rootNode,
            currentUserLevel: currentUserNode.level,
            hasParent: !!userIBConfig.parent,
            totalDownlinePartners: userDownlinePartners.length
        });
    } catch (error) {
        console.error('Get IB Tree error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching your IB tree data.'
        });
    }
};

