// Backend/controllers/admin/adminDashboardController.js
const User = require('../../models/User');
const Account = require('../../models/client/Account');
const Deposit = require('../../models/Deposit');
const Withdrawal = require('../../models/Withdrawal');
const Transfer = require('../../models/client/Transfer');
const IBClientConfiguration = require('../../models/client/IBClientConfiguration');
const mongoose = require('mongoose');

// Get admin dashboard overview stats
exports.getAdminDashboardStats = async (req, res) => {
    try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfYear = new Date(today.getFullYear(), 0, 1);
        const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // Total clients stats
        const totalClients = await User.countDocuments({ role: 'client' });
        const clientsToday = await User.countDocuments({
            role: 'client',
            createdAt: { $gte: startOfDay }
        });
        const clientsThisWeek = await User.countDocuments({
            role: 'client',
            createdAt: { $gte: startOfWeek }
        });
        const clientsThisMonth = await User.countDocuments({
            role: 'client',
            createdAt: { $gte: startOfMonth }
        });

        // Calculate client growth percentage (last 30 days vs previous 30 days)
        const clientsLast30Days = await User.countDocuments({
            role: 'client',
            createdAt: { $gte: last30Days }
        });
        const clientsPrevious30Days = await User.countDocuments({
            role: 'client',
            createdAt: {
                $gte: new Date(last30Days.getTime() - 30 * 24 * 60 * 60 * 1000),
                $lt: last30Days
            }
        });
        const clientGrowthPercentage = clientsPrevious30Days > 0
            ? ((clientsLast30Days - clientsPrevious30Days) / clientsPrevious30Days * 100).toFixed(1)
            : 100;

        // Deposit stats
        const totalDepositsResult = await Deposit.aggregate([
            { $match: { status: 'Approved' } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);
        const totalDeposits = totalDepositsResult[0] || { total: 0, count: 0 };

        const depositsToday = await Deposit.aggregate([
            {
                $match: {
                    status: 'Approved',
                    approvedDate: { $gte: startOfDay }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);
        const todayDeposits = depositsToday[0] || { total: 0, count: 0 };

        // Pending deposits
        const pendingDeposits = await Deposit.countDocuments({ status: 'Pending' });

        // Calculate deposit growth
        const depositsLast30Days = await Deposit.aggregate([
            {
                $match: {
                    status: 'Approved',
                    approvedDate: { $gte: last30Days }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const depositsPrevious30Days = await Deposit.aggregate([
            {
                $match: {
                    status: 'Approved',
                    approvedDate: {
                        $gte: new Date(last30Days.getTime() - 30 * 24 * 60 * 60 * 1000),
                        $lt: last30Days
                    }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const currentDepositAmount = depositsLast30Days[0]?.total || 0;
        const previousDepositAmount = depositsPrevious30Days[0]?.total || 0;
        const depositGrowthPercentage = previousDepositAmount > 0
            ? ((currentDepositAmount - previousDepositAmount) / previousDepositAmount * 100).toFixed(1)
            : 100;

        // Withdrawal stats
        const totalWithdrawalsResult = await Withdrawal.aggregate([
            { $match: { status: 'Approved' } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);
        const totalWithdrawals = totalWithdrawalsResult[0] || { total: 0, count: 0 };

        const pendingWithdrawals = await Withdrawal.countDocuments({ status: 'Pending' });

        // Calculate withdrawal growth
        const withdrawalsLast30Days = await Withdrawal.aggregate([
            {
                $match: {
                    status: 'Approved',
                    approvedDate: { $gte: last30Days }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const withdrawalsPrevious30Days = await Withdrawal.aggregate([
            {
                $match: {
                    status: 'Approved',
                    approvedDate: {
                        $gte: new Date(last30Days.getTime() - 30 * 24 * 60 * 60 * 1000),
                        $lt: last30Days
                    }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const currentWithdrawalAmount = withdrawalsLast30Days[0]?.total || 0;
        const previousWithdrawalAmount = withdrawalsPrevious30Days[0]?.total || 0;
        const withdrawalGrowthPercentage = previousWithdrawalAmount > 0
            ? ((currentWithdrawalAmount - previousWithdrawalAmount) / previousWithdrawalAmount * 100).toFixed(1)
            : currentWithdrawalAmount > 0 ? 100 : 0;

        // Transaction stats (deposits + withdrawals + transfers)
        const totalTransfers = await Transfer.countDocuments();
        const totalTransactions = totalDeposits.count + totalWithdrawals.count + totalTransfers;

        // Calculate transaction growth
        const transfersLast30Days = await Transfer.countDocuments({
            createdAt: { $gte: last30Days }
        });
        const transfersPrevious30Days = await Transfer.countDocuments({
            createdAt: {
                $gte: new Date(last30Days.getTime() - 30 * 24 * 60 * 60 * 1000),
                $lt: last30Days
            }
        });
        const depositsCountLast30 = await Deposit.countDocuments({
            createdAt: { $gte: last30Days }
        });
        const withdrawalsCountLast30 = await Withdrawal.countDocuments({
            createdAt: { $gte: last30Days }
        });
        const depositsCountPrevious30 = await Deposit.countDocuments({
            createdAt: {
                $gte: new Date(last30Days.getTime() - 30 * 24 * 60 * 60 * 1000),
                $lt: last30Days
            }
        });
        const withdrawalsCountPrevious30 = await Withdrawal.countDocuments({
            createdAt: {
                $gte: new Date(last30Days.getTime() - 30 * 24 * 60 * 60 * 1000),
                $lt: last30Days
            }
        });

        const currentTransactionCount = depositsCountLast30 + withdrawalsCountLast30 + transfersLast30Days;
        const previousTransactionCount = depositsCountPrevious30 + withdrawalsCountPrevious30 + transfersPrevious30Days;
        const transactionGrowthPercentage = previousTransactionCount > 0
            ? ((currentTransactionCount - previousTransactionCount) / previousTransactionCount * 100).toFixed(1)
            : 100;

        // IB Partners stats
        const totalIBPartners = await IBClientConfiguration.countDocuments({ status: 'active' });
        const pendingIBPartners = await IBClientConfiguration.countDocuments({ status: 'pending' });

        // Calculate IB growth
        const ibLast30Days = await IBClientConfiguration.countDocuments({
            status: 'active',
            createdAt: { $gte: last30Days }
        });
        const ibPrevious30Days = await IBClientConfiguration.countDocuments({
            status: 'active',
            createdAt: {
                $gte: new Date(last30Days.getTime() - 30 * 24 * 60 * 60 * 1000),
                $lt: last30Days
            }
        });
        const ibGrowthPercentage = ibPrevious30Days > 0
            ? ((ibLast30Days - ibPrevious30Days) / ibPrevious30Days * 100).toFixed(1)
            : 100;

        // Accounts stats
        const totalAccounts = await Account.countDocuments({ status: true });
        const accountsToday = await Account.countDocuments({
            status: true,
            createdAt: { $gte: startOfDay }
        });

        res.status(200).json({
            success: true,
            data: {
                clients: {
                    total: totalClients,
                    today: clientsToday,
                    thisWeek: clientsThisWeek,
                    thisMonth: clientsThisMonth,
                    growth: parseFloat(clientGrowthPercentage),
                    pending: pendingDeposits // Using pending deposits as proxy for new client registrations
                },
                deposits: {
                    total: totalDeposits.total,
                    count: totalDeposits.count,
                    today: todayDeposits.total,
                    pending: pendingDeposits,
                    growth: parseFloat(depositGrowthPercentage)
                },
                withdrawals: {
                    total: totalWithdrawals.total,
                    count: totalWithdrawals.count,
                    pending: pendingWithdrawals,
                    growth: parseFloat(withdrawalGrowthPercentage)
                },
                transactions: {
                    total: totalTransactions,
                    growth: parseFloat(transactionGrowthPercentage)
                },
                ibPartners: {
                    total: totalIBPartners,
                    pending: pendingIBPartners,
                    growth: parseFloat(ibGrowthPercentage)
                },
                accounts: {
                    total: totalAccounts,
                    today: accountsToday
                }
            }
        });

    } catch (error) {
        console.error('Error fetching admin dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics',
            error: error.message
        });
    }
};

// Get revenue chart data for the last 12 months
exports.getRevenueChartData = async (req, res) => {
    try {
        const now = new Date();
        const last12Months = [];

        // Generate last 12 months
        for (let i = 11; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

            const deposits = await Deposit.aggregate([
                {
                    $match: {
                        status: 'Approved',
                        approvedDate: {
                            $gte: date,
                            $lt: nextMonth
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$amount' }
                    }
                }
            ]);

            const withdrawals = await Withdrawal.aggregate([
                {
                    $match: {
                        status: 'Approved',
                        approvedDate: {
                            $gte: date,
                            $lt: nextMonth
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$amount' }
                    }
                }
            ]);

            last12Months.push({
                month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                deposits: deposits[0]?.total || 0,
                withdrawals: withdrawals[0]?.total || 0,
                net: (deposits[0]?.total || 0) - (withdrawals[0]?.total || 0)
            });
        }

        res.status(200).json({
            success: true,
            data: last12Months
        });

    } catch (error) {
        console.error('Error fetching revenue chart data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch revenue chart data',
            error: error.message
        });
    }
};

// Get client distribution by account type
exports.getClientDistribution = async (req, res) => {
    try {
        const accountTypes = await Account.aggregate([
            {
                $match: { status: true }
            },
            {
                $group: {
                    _id: '$accountType',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        const total = accountTypes.reduce((sum, type) => sum + type.count, 0);

        const distribution = accountTypes.map(type => ({
            name: type._id,
            value: type.count,
            percentage: total > 0 ? ((type.count / total) * 100).toFixed(1) : 0
        }));

        res.status(200).json({
            success: true,
            data: distribution
        });

    } catch (error) {
        console.error('Error fetching client distribution:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch client distribution',
            error: error.message
        });
    }
};

// Get recent transactions for admin dashboard
exports.getRecentTransactions = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        // Get recent deposits
        const recentDeposits = await Deposit.find()
            .populate('user', 'firstname lastname email')
            .populate('account', 'mt5Account name')
            .sort({ createdAt: -1 })
            .limit(limit / 3)
            .lean();

        // Get recent withdrawals
        const recentWithdrawals = await Withdrawal.find()
            .populate('user', 'firstname lastname email')
            .populate('account', 'mt5Account name')
            .sort({ createdAt: -1 })
            .limit(limit / 3)
            .lean();

        // Get recent transfers
        const recentTransfers = await Transfer.find()
            .populate('user', 'firstname lastname email')
            .populate('fromAccount', 'mt5Account name')
            .populate('toAccount', 'mt5Account name')
            .sort({ createdAt: -1 })
            .limit(limit / 3)
            .lean();

        // Format and combine all transactions
        const transactions = [];

        recentDeposits.forEach(deposit => {
            transactions.push({
                id: deposit._id,
                type: 'Deposit',
                amount: deposit.amount,
                user: {
                    name: `${deposit.user.firstname} ${deposit.user.lastname}`,
                    email: deposit.user.email
                },
                account: deposit.account?.mt5Account || 'N/A',
                status: deposit.status,
                date: deposit.createdAt,
                paymentMethod: deposit.paymentType
            });
        });

        recentWithdrawals.forEach(withdrawal => {
            transactions.push({
                id: withdrawal._id,
                type: 'Withdrawal',
                amount: withdrawal.amount,
                user: {
                    name: `${withdrawal.user.firstname} ${withdrawal.user.lastname}`,
                    email: withdrawal.user.email
                },
                account: withdrawal.accountNumber,
                status: withdrawal.status,
                date: withdrawal.createdAt,
                paymentMethod: withdrawal.paymentMethod
            });
        });

        recentTransfers.forEach(transfer => {
            transactions.push({
                id: transfer._id,
                type: 'Transfer',
                amount: transfer.amount,
                user: {
                    name: `${transfer.user.firstname} ${transfer.user.lastname}`,
                    email: transfer.user.email
                },
                account: `${transfer.fromAccount?.mt5Account} → ${transfer.toAccount?.mt5Account}`,
                status: transfer.status,
                date: transfer.createdAt,
                paymentMethod: 'Internal Transfer'
            });
        });

        // Sort by date and limit
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        const limitedTransactions = transactions.slice(0, limit);

        res.status(200).json({
            success: true,
            data: limitedTransactions
        });

    } catch (error) {
        console.error('Error fetching recent transactions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recent transactions',
            error: error.message
        });
    }
};

// Get daily stats for charts (last 30 days)
exports.getDailyStats = async (req, res) => {
    try {
        const last30Days = [];
        const now = new Date();

        for (let i = 29; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

            // Get daily client registrations
            const clientsCount = await User.countDocuments({
                role: 'client',
                createdAt: {
                    $gte: startOfDay,
                    $lt: endOfDay
                }
            });

            // Get daily deposits
            const depositsResult = await Deposit.aggregate([
                {
                    $match: {
                        status: 'Approved',
                        approvedDate: {
                            $gte: startOfDay,
                            $lt: endOfDay
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$amount' },
                        count: { $sum: 1 }
                    }
                }
            ]);

            // Get daily withdrawals
            const withdrawalsResult = await Withdrawal.aggregate([
                {
                    $match: {
                        status: 'Approved',
                        approvedDate: {
                            $gte: startOfDay,
                            $lt: endOfDay
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$amount' },
                        count: { $sum: 1 }
                    }
                }
            ]);

            // Get daily transactions count
            const transfersCount = await Transfer.countDocuments({
                createdAt: {
                    $gte: startOfDay,
                    $lt: endOfDay
                }
            });

            const depositsCount = depositsResult[0]?.count || 0;
            const withdrawalsCount = withdrawalsResult[0]?.count || 0;
            const totalTransactions = depositsCount + withdrawalsCount + transfersCount;

            // Get daily IB partners
            const ibCount = await IBClientConfiguration.countDocuments({
                status: 'active',
                createdAt: {
                    $gte: startOfDay,
                    $lt: endOfDay
                }
            });

            last30Days.push({
                date: date.toISOString().split('T')[0],
                clients: clientsCount,
                deposits: depositsResult[0]?.total || 0,
                withdrawals: withdrawalsResult[0]?.total || 0,
                transactions: totalTransactions,
                ibPartners: ibCount
            });
        }

        res.status(200).json({
            success: true,
            data: last30Days
        });

    } catch (error) {
        console.error('Error fetching daily stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch daily statistics',
            error: error.message
        });
    }
};

// Get top performing clients
exports.getTopPerformingClients = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const topClients = await Deposit.aggregate([
            {
                $match: { status: 'Approved' }
            },
            {
                $group: {
                    _id: '$user',
                    totalDeposited: { $sum: '$amount' },
                    depositCount: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            {
                $unwind: '$user'
            },
            {
                $lookup: {
                    from: 'accounts',
                    localField: '_id',
                    foreignField: 'user',
                    as: 'accounts'
                }
            },
            {
                $project: {
                    _id: 1,
                    totalDeposited: 1,
                    depositCount: 1,
                    user: {
                        firstname: 1,
                        lastname: 1,
                        email: 1,
                        createdAt: 1
                    },
                    accountsCount: { $size: '$accounts' }
                }
            },
            {
                $sort: { totalDeposited: -1 }
            },
            {
                $limit: limit
            }
        ]);

        res.status(200).json({
            success: true,
            data: topClients
        });

    } catch (error) {
        console.error('Error fetching top performing clients:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch top performing clients',
            error: error.message
        });
    }
};