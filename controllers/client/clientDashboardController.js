// Backend/controllers/client/dashboardController.js
const User = require('../../models/User');
const Account = require('../../models/client/Account');
const Deposit = require('../../models/Deposit');
const Withdrawal = require('../../models/Withdrawal');
const Transfer = require('../../models/client/Transfer');
const mongoose = require('mongoose');

/**
 * Get dashboard overview statistics
 */
const getDashboardOverview = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get all user accounts
        const userAccounts = await Account.find({ user: userId }).select('mt5Account balance equity');
        const accountIds = userAccounts.map(account => account._id);

        // Calculate total balance and equity
        const totalBalance = userAccounts.reduce((sum, account) => sum + (account.balance || 0), 0);
        const totalEquity = userAccounts.reduce((sum, account) => sum + (account.equity || 0), 0);

        // Get total deposits (approved only)
        const totalDepositsResult = await Deposit.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    status: 'Approved'
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

        // Get total withdrawals (approved only)
        const totalWithdrawalsResult = await Withdrawal.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    status: 'Approved'
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

        const totalDeposits = totalDepositsResult[0]?.total || 0;
        const totalWithdrawals = totalWithdrawalsResult[0]?.total || 0;
        const totalMt5Accounts = userAccounts.length;

        res.status(200).json({
            success: true,
            data: {
                totalBalance: totalBalance.toFixed(2),
                totalEquity: totalEquity.toFixed(2),
                totalDeposits: totalDeposits.toFixed(2),
                totalWithdrawals: totalWithdrawals.toFixed(2),
                totalMt5Accounts,
                netBalance: (totalBalance + totalEquity).toFixed(2)
            }
        });

    } catch (error) {
        console.error('Dashboard overview error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard overview',
            error: error.message
        });
    }
};

/**
 * Get all recent transactions (deposits, withdrawals, transfers) - no pagination
 */
const getRecentTransactions = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user accounts for transfer filtering
        const userAccounts = await Account.find({ user: userId }).select('_id');
        const accountIds = userAccounts.map(account => account._id);

        // Get all deposits
        const deposits = await Deposit.find({ user: userId })
            .populate('paymentMethod', 'name type')
            .populate('account', 'mt5Account')
            .select('amount status requestedDate approvedDate rejectedDate paymentType createdAt')
            .sort({ createdAt: -1 });

        // Get all withdrawals
        const withdrawals = await Withdrawal.find({ user: userId })
            .populate('account', 'mt5Account')
            .select('amount status requestedDate approvedDate rejectedDate paymentMethod createdAt')
            .sort({ createdAt: -1 });

        // Get all transfers
        const transfers = await Transfer.find({
            $or: [
                { fromAccount: { $in: accountIds } },
                { toAccount: { $in: accountIds } }
            ]
        })
            .populate('fromAccount', 'mt5Account')
            .populate('toAccount', 'mt5Account')
            .select('amount status requestedDate approvedDate rejectedDate createdAt')
            .sort({ createdAt: -1 });

        // Combine and format all transactions
        const allTransactions = [
            ...deposits.map(dep => ({
                id: dep._id,
                type: 'deposit',
                amount: dep.amount,
                status: dep.status,
                date: dep.updatedAt || dep.requestedDate,
                processedDate: dep.approvedDate || dep.rejectedDate,
                account: dep.account?.mt5Account,
                paymentMethod: dep.paymentMethod?.name || dep.paymentType,
                createdAt: dep.createdAt || dep.requestedDate
            })),
            ...withdrawals.map(wit => ({
                id: wit._id,
                type: 'withdrawal',
                amount: wit.amount,
                status: wit.status,
                date: wit.updatedAt || wit.requestedDate,
                processedDate: wit.approvedDate || wit.rejectedDate,
                account: wit.account?.mt5Account,
                paymentMethod: wit.paymentMethod,
                createdAt: wit.createdAt || wit.requestedDate
            })),
            ...transfers.map(trans => ({
                id: trans._id,
                type: 'transfer',
                amount: trans.amount,
                status: trans.status,
                date: trans.updatedAt,
                processedDate: trans.approvedDate || trans.rejectedDate,
                fromAccount: trans.fromAccount?.mt5Account,
                toAccount: trans.toAccount?.mt5Account,
                createdAt: trans.createdAt || trans.requestedDate
            }))
        ];

        // Sort by creation date (most recent first)
        allTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.status(200).json({
            success: true,
            data: {
                transactions: allTransactions,
                totalTransactions: allTransactions.length
            }
        });
        console.log('Recent transactions:', allTransactions)
    } catch (error) {
        console.error('Recent transactions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recent transactions',
            error: error.message
        });
    }
};

/**
 * Get all active accounts with search and filter - no pagination
 */
const getActiveAccounts = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            search = '',
            accountType = '',
            leverage = '',
            status = ''
        } = req.query;

        // Build filter query
        let filterQuery = { user: userId };

        if (search) {
            filterQuery.$or = [
                { mt5Account: { $regex: search, $options: 'i' } },
                { name: { $regex: search, $options: 'i' } },
                { groupName: { $regex: search, $options: 'i' } }
            ];
        }

        if (accountType) {
            filterQuery.accountType = accountType;
        }

        if (leverage) {
            filterQuery.leverage = leverage;
        }

        if (status !== '') {
            filterQuery.status = status === 'true';
        }

        // Get all accounts
        const accounts = await Account.find(filterQuery)
            .populate('user', 'firstname lastname email isEmailVerified')
            .select('mt5Account name balance equity leverage accountType groupName status platform createdAt')
            .sort({ createdAt: -1 });

        // Format response with KYC status
        const formattedAccounts = accounts.map(account => ({
            id: account._id,
            mt5Account: account.mt5Account,
            name: account.name,
            balance: parseFloat(account.balance || 0).toFixed(2),
            equity: parseFloat(account.equity || 0).toFixed(2),
            leverage: account.leverage,
            accountType: account.accountType,
            groupName: account.groupName,
            platform: account.platform,
            status: account.status,
            kycStatus: account.user?.isEmailVerified ? 'Verified' : 'Pending',
            createdAt: account.createdAt,
            totalValue: (parseFloat(account.balance || 0) + parseFloat(account.equity || 0)).toFixed(2)
        }));

        // Get unique filter options for frontend dropdowns
        const filterOptions = await Account.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: null,
                    accountTypes: { $addToSet: '$accountType' },
                    leverages: { $addToSet: '$leverage' }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                accounts: formattedAccounts,
                totalAccounts: formattedAccounts.length,
                filterOptions: {
                    accountTypes: filterOptions[0]?.accountTypes || [],
                    leverages: filterOptions[0]?.leverages || []
                }
            }
        });

    } catch (error) {
        console.error('Active accounts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active accounts',
            error: error.message
        });
    }
};

/**
 * Get account performance data
 */
const getAccountPerformance = async (req, res) => {
    try {
        const userId = req.user.id;
        const { period = '7d' } = req.query; // 1d, 7d, 30d, 90d

        // Get all user accounts
        const accounts = await Account.find({ user: userId })
            .select('mt5Account balance equity createdAt')
            .sort({ createdAt: -1 });

        // Calculate performance metrics
        const performanceData = accounts.map(account => {
            const totalValue = (account.balance || 0) + (account.equity || 0);
            return {
                accountNumber: account.mt5Account,
                currentValue: totalValue.toFixed(2),
                balance: account.balance?.toFixed(2) || '0.00',
                equity: account.equity?.toFixed(2) || '0.00',
                // Note: For real implementation, you'd need historical data
                // This is a placeholder for performance calculation
                performance: {
                    dailyChange: 0,
                    weeklyChange: 0,
                    monthlyChange: 0,
                    totalReturn: 0
                }
            };
        });

        res.status(200).json({
            success: true,
            data: {
                accounts: performanceData,
                period,
                summary: {
                    totalAccounts: accounts.length,
                    totalValue: performanceData.reduce((sum, acc) => sum + parseFloat(acc.currentValue), 0).toFixed(2),
                    averagePerformance: 0 // Placeholder
                }
            }
        });

    } catch (error) {
        console.error('Account performance error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch account performance',
            error: error.message
        });
    }
};

// Get all transaction history - no pagination
// const getTransactionHistory = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const {
//             type = 'all',
//             status = 'all',
//             search = '',
//             startDate,
//             endDate
//         } = req.query;

//         let transactions = [];

//         // Build filters
//         const baseFilter = { user: userId };
//         const statusFilter = status !== 'all' ? { status } : {};

//         // Date filter
//         let dateFilter = {};
//         if (startDate && endDate) {
//             dateFilter = {
//                 createdAt: {
//                     $gte: new Date(startDate),
//                     $lte: new Date(endDate)
//                 }
//             };
//         }

//         if (type === 'all' || type === 'deposit') {
//             const deposits = await Deposit.find({ ...baseFilter, ...statusFilter, ...dateFilter })
//                 .populate('account', 'mt5Account name accountType')
//                 .sort({ createdAt: -1 })
//                 .lean();

//             const depositTransactions = deposits.map(deposit => ({
//                 _id: deposit._id,
//                 type: 'Deposit',
//                 amount: deposit.amount,
//                 formattedAmount: `+$${deposit.amount.toFixed(2)}`,
//                 account: deposit.account?.mt5Account || 'Unknown',
//                 accountName: deposit.account?.name || 'Unknown',
//                 status: deposit.status,
//                 date: deposit.approvedDate || deposit.createdAt,
//                 method: deposit.paymentType || 'Unknown',
//                 createdAt: deposit.createdAt
//             }));

//             transactions.push(...depositTransactions);
//         }

//         if (type === 'all' || type === 'withdrawal') {
//             const withdrawals = await Withdrawal.find({ ...baseFilter, ...statusFilter, ...dateFilter })
//                 .populate('account', 'mt5Account name accountType')
//                 .sort({ createdAt: -1 })
//                 .lean();

//             const withdrawalTransactions = withdrawals.map(withdrawal => ({
//                 _id: withdrawal._id,
//                 type: 'Withdrawal',
//                 amount: withdrawal.amount,
//                 formattedAmount: `-$${withdrawal.amount.toFixed(2)}`,
//                 account: withdrawal.account?.mt5Account || withdrawal.accountNumber || 'Unknown',
//                 accountName: withdrawal.account?.name || 'Unknown',
//                 status: withdrawal.status,
//                 date: withdrawal.approvedDate || withdrawal.createdAt,
//                 method: withdrawal.paymentMethod || 'Unknown',
//                 createdAt: withdrawal.createdAt
//             }));

//             transactions.push(...withdrawalTransactions);
//         }

//         // Apply search filter
//         if (search) {
//             transactions = transactions.filter(t =>
//                 t.account.toLowerCase().includes(search.toLowerCase()) ||
//                 t.accountName.toLowerCase().includes(search.toLowerCase()) ||
//                 t.method.toLowerCase().includes(search.toLowerCase()) ||
//                 t.type.toLowerCase().includes(search.toLowerCase())
//             );
//         }

//         // Sort by date (most recent first)
//         transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

//         res.status(200).json({
//             success: true,
//             count: transactions.length,
//             data: transactions
//         });

//     } catch (error) {
//         console.error('Error getting transaction history:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error retrieving transaction history',
//             error: error.message
//         });
//     }
// };

// Get account details
// const getAccountDetails = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const { accountId } = req.params;

//         const account = await Account.findOne({
//             _id: accountId,
//             user: userId,
//             status: true
//         });

//         if (!account) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Account not found'
//             });
//         }

//         // Update balance from external API
//         await updateAccountBalances([account]);

//         // Fetch updated account
//         const updatedAccount = await Account.findById(accountId);

//         res.status(200).json({
//             success: true,
//             data: {
//                 _id: updatedAccount._id,
//                 mt5Account: updatedAccount.mt5Account,
//                 name: updatedAccount.name,
//                 accountType: updatedAccount.accountType,
//                 leverage: updatedAccount.leverage,
//                 balance: parseFloat((updatedAccount.balance || 0).toFixed(2)),
//                 equity: parseFloat((updatedAccount.equity || 0).toFixed(2)),
//                 profitLoss: parseFloat(((updatedAccount.equity || 0) - (updatedAccount.balance || 0)).toFixed(2)),
//                 groupName: updatedAccount.groupName,
//                 platform: updatedAccount.platform || 'MetaTrader 5'
//             },
//             timestamp: Date.now()
//         });

//     } catch (error) {
//         console.error('Error getting account details:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to fetch account details',
//             error: error.message
//         });
//     }
// };


module.exports = {
    getDashboardOverview,
    getRecentTransactions,
    getActiveAccounts,
    getAccountPerformance
};