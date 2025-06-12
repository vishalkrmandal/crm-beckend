const Account = require('../../models/client/Account');
const Deposit = require('../../models/Deposit');
const Withdrawal = require('../../models/Withdrawal');
const axios = require('axios');

// Cache for performance optimization
const dashboardCache = new Map();
const CACHE_DURATION = 30000; // 30 seconds

// Helper function to fetch external trading data
const fetchExternalTradeData = async (mt5Account, managerIndex, type = 'open') => {
    try {
        let url;
        if (type === 'open') {
            url = `https://api.infoapi.biz/api/mt5/GetOpenTradeByAccount?Manager_Index=${managerIndex}&MT5Accont=${mt5Account}`;
        } else {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);

            const startTime = startDate.toISOString().slice(0, 19).replace('T', ' ');
            const endTime = endDate.toISOString().slice(0, 19).replace('T', ' ');

            url = `https://api.infoapi.biz/api/mt5/GetCloseTradeAll?Manager_Index=${managerIndex}&MT5Accont=${mt5Account}&StartTime=${encodeURIComponent(startTime)}&EndTime=${encodeURIComponent(endTime)}`;
        }

        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
        console.error(`Error fetching ${type} trades for account ${mt5Account}:`, error.message);
        return [];
    }
};

// Helper function to update account balances
const updateAccountBalances = async (accounts) => {
    try {
        const accountsByManager = {};
        accounts.forEach(account => {
            const managerIndex = account.managerIndex || '1';
            if (!accountsByManager[managerIndex]) {
                accountsByManager[managerIndex] = [];
            }
            accountsByManager[managerIndex].push({
                mt5Account: parseInt(account.mt5Account),
                accountId: account._id
            });
        });

        for (const [managerIndex, managerAccounts] of Object.entries(accountsByManager)) {
            const mt5AccountNumbers = managerAccounts.map(acc => acc.mt5Account);

            const apiUrl = 'https://api.infoapi.biz/api/mt5/GetUserInfoByAccounts';
            const requestData = {
                Manager_Index: parseInt(managerIndex),
                MT5Accounts: mt5AccountNumbers
            };

            try {
                const response = await axios.post(apiUrl, requestData, {
                    timeout: 30000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data && Array.isArray(response.data)) {
                    const updatePromises = response.data.map(async (userInfo) => {
                        const mt5Account = userInfo.MT5Account || userInfo.Login || userInfo.login;
                        const balance = userInfo.Balance || userInfo.balance || 0;
                        const equity = userInfo.Equity || userInfo.equity || 0;

                        if (mt5Account) {
                            const accountMapping = managerAccounts.find(acc => acc.mt5Account === mt5Account);
                            if (accountMapping) {
                                await Account.findByIdAndUpdate(
                                    accountMapping.accountId,
                                    { balance: balance, equity: equity },
                                    { new: true }
                                );
                            }
                        }
                    });

                    await Promise.all(updatePromises.filter(p => p !== null));
                }
            } catch (apiError) {
                console.error(`External API Error for Manager ${managerIndex}:`, apiError.message);
            }
        }
    } catch (error) {
        console.error('Error updating account balances:', error);
    }
};

// Main dashboard data controller
exports.getDashboardData = async (req, res) => {
    try {
        console.log('Dashboard API called by user:', req.user._id);

        const userId = req.user._id;
        const cacheKey = `dashboard_${userId}`;

        // Check cache first
        const cachedData = dashboardCache.get(cacheKey);
        if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_DURATION) {
            console.log('Returning cached dashboard data');
            return res.status(200).json({
                success: true,
                data: cachedData.data,
                cached: true,
                timestamp: cachedData.timestamp
            });
        }

        console.log('Fetching fresh dashboard data...');

        // Get user's accounts
        const accounts = await Account.find({ user: userId, status: true })
            .select('mt5Account managerIndex name accountType groupName leverage balance equity');

        console.log(`Found ${accounts.length} accounts for user`);

        if (accounts.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    stats: {
                        totalBalance: 0,
                        totalDeposits: 0,
                        totalWithdrawals: 0,
                        totalActiveTrades: 0,
                        totalProfit: 0,
                        totalLoss: 0
                    },
                    recentTransactions: [],
                    activeAccounts: [],
                    tradingPerformance: []
                },
                message: 'No accounts found'
            });
        }

        // Update account balances from external API
        console.log('Updating account balances from external API...');
        await updateAccountBalances(accounts);

        // Fetch updated accounts
        const updatedAccounts = await Account.find({ user: userId, status: true })
            .select('mt5Account managerIndex name accountType groupName leverage balance equity');

        // Calculate total balance
        const totalBalance = updatedAccounts.reduce((sum, account) => sum + (account.balance || 0), 0);
        console.log('Total balance calculated:', totalBalance);

        // Get deposits data
        const deposits = await Deposit.find({ user: userId, status: 'Approved' })
            .populate('account', 'mt5Account name accountType')
            .sort({ createdAt: -1 });

        const totalDeposits = deposits.reduce((sum, deposit) => sum + (deposit.amount || 0), 0);

        // Get withdrawals data
        const withdrawals = await Withdrawal.find({ user: userId, status: 'Approved' })
            .populate('account', 'mt5Account name accountType')
            .sort({ createdAt: -1 });

        const totalWithdrawals = withdrawals.reduce((sum, withdrawal) => sum + (withdrawal.amount || 0), 0);

        // Fetch trading data for all accounts
        console.log('Fetching trading data...');
        const allOpenTrades = [];
        const allClosedTrades = [];

        const tradingPromises = updatedAccounts.map(async (account) => {
            try {
                const [openTrades, closedTrades] = await Promise.all([
                    fetchExternalTradeData(account.mt5Account, account.managerIndex || '1', 'open'),
                    fetchExternalTradeData(account.mt5Account, account.managerIndex || '1', 'closed')
                ]);

                allOpenTrades.push(...(Array.isArray(openTrades) ? openTrades : []));
                allClosedTrades.push(...(Array.isArray(closedTrades) ? closedTrades : []));
            } catch (error) {
                console.error(`Error processing trades for account ${account.mt5Account}:`, error);
            }
        });

        await Promise.all(tradingPromises);

        // Calculate trading statistics
        const totalActiveTrades = allOpenTrades.length;
        const profitTrades = [...allOpenTrades, ...allClosedTrades].filter(trade => (trade.Profit || 0) > 0);
        const lossTrades = [...allOpenTrades, ...allClosedTrades].filter(trade => (trade.Profit || 0) < 0);

        const totalProfitAmount = profitTrades.reduce((sum, trade) => sum + (trade.Profit || 0), 0);
        const totalLossAmount = Math.abs(lossTrades.reduce((sum, trade) => sum + (trade.Profit || 0), 0));

        // Get recent transactions (last 10)
        const recentTransactions = [
            ...deposits.slice(0, 10).map(deposit => ({
                _id: deposit._id,
                type: 'Deposit',
                amount: deposit.amount,
                account: deposit.account?.mt5Account || 'Unknown',
                accountName: deposit.account?.name || 'Unknown',
                status: deposit.status,
                date: deposit.approvedDate || deposit.createdAt,
                method: deposit.paymentType || 'Unknown'
            })),
            ...withdrawals.slice(0, 10).map(withdrawal => ({
                _id: withdrawal._id,
                type: 'Withdrawal',
                amount: withdrawal.amount,
                account: withdrawal.accountNumber || 'Unknown',
                accountName: 'Unknown',
                status: withdrawal.status,
                date: withdrawal.approvedDate || withdrawal.createdAt,
                method: withdrawal.paymentMethod || 'Unknown'
            }))
        ]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10);

        // Prepare trading performance data for charts (last 30 days)
        const tradingPerformance = allClosedTrades
            .slice(-30)
            .map(trade => ({
                profit: trade.Profit || 0,
                symbol: trade.Symbol || 'Unknown'
            }));

        // Prepare dashboard response
        const dashboardData = {
            stats: {
                totalBalance: parseFloat(totalBalance.toFixed(2)),
                totalDeposits: parseFloat(totalDeposits.toFixed(2)),
                totalWithdrawals: parseFloat(totalWithdrawals.toFixed(2)),
                totalActiveTrades: totalActiveTrades,
                totalProfit: parseFloat(totalProfitAmount.toFixed(2)),
                totalLoss: parseFloat(totalLossAmount.toFixed(2))
            },
            recentTransactions,
            activeAccounts: updatedAccounts.map(account => ({
                _id: account._id,
                mt5Account: account.mt5Account,
                name: account.name,
                accountType: account.accountType,
                leverage: account.leverage,
                balance: parseFloat((account.balance || 0).toFixed(2)),
                equity: parseFloat((account.equity || 0).toFixed(2)),
                profitLoss: parseFloat(((account.equity || 0) - (account.balance || 0)).toFixed(2)),
                groupName: account.groupName
            })),
            tradingPerformance
        };

        // Update cache
        dashboardCache.set(cacheKey, {
            data: dashboardData,
            timestamp: Date.now()
        });

        console.log('Dashboard data prepared successfully');

        res.status(200).json({
            success: true,
            data: dashboardData,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error in getDashboardData:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard data',
            error: error.message
        });
    }
};

// Get detailed transaction history
exports.getTransactionHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const {
            page = 1,
            limit = 20,
            type = 'all',
            status = 'all',
            search = '',
            startDate,
            endDate
        } = req.query;

        const skip = (page - 1) * limit;
        let transactions = [];

        // Build filters
        const baseFilter = { user: userId };
        const statusFilter = status !== 'all' ? { status } : {};

        // Date filter
        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                createdAt: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        if (type === 'all' || type === 'deposit') {
            const deposits = await Deposit.find({ ...baseFilter, ...statusFilter, ...dateFilter })
                .populate('account', 'mt5Account name accountType')
                .sort({ createdAt: -1 })
                .lean();

            const depositTransactions = deposits.map(deposit => ({
                _id: deposit._id,
                type: 'Deposit',
                amount: deposit.amount,
                formattedAmount: `+$${deposit.amount.toFixed(2)}`,
                account: deposit.account?.mt5Account || 'Unknown',
                accountName: deposit.account?.name || 'Unknown',
                status: deposit.status,
                date: deposit.approvedDate || deposit.createdAt,
                method: deposit.paymentType || 'Unknown',
                createdAt: deposit.createdAt
            }));

            transactions.push(...depositTransactions);
        }

        if (type === 'all' || type === 'withdrawal') {
            const withdrawals = await Withdrawal.find({ ...baseFilter, ...statusFilter, ...dateFilter })
                .populate('account', 'mt5Account name accountType')
                .sort({ createdAt: -1 })
                .lean();

            const withdrawalTransactions = withdrawals.map(withdrawal => ({
                _id: withdrawal._id,
                type: 'Withdrawal',
                amount: withdrawal.amount,
                formattedAmount: `-$${withdrawal.amount.toFixed(2)}`,
                account: withdrawal.account?.mt5Account || withdrawal.accountNumber || 'Unknown',
                accountName: withdrawal.account?.name || 'Unknown',
                status: withdrawal.status,
                date: withdrawal.approvedDate || withdrawal.createdAt,
                method: withdrawal.paymentMethod || 'Unknown',
                createdAt: withdrawal.createdAt
            }));

            transactions.push(...withdrawalTransactions);
        }

        // Apply search filter
        if (search) {
            transactions = transactions.filter(t =>
                t.account.toLowerCase().includes(search.toLowerCase()) ||
                t.accountName.toLowerCase().includes(search.toLowerCase()) ||
                t.method.toLowerCase().includes(search.toLowerCase()) ||
                t.type.toLowerCase().includes(search.toLowerCase())
            );
        }

        // Sort by date (most recent first)
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Apply pagination
        const totalCount = transactions.length;
        const paginatedTransactions = transactions.slice(skip, skip + parseInt(limit));

        res.status(200).json({
            success: true,
            count: totalCount,
            data: paginatedTransactions,
            pagination: {
                page: parseInt(page),
                pages: Math.ceil(totalCount / limit),
                limit: parseInt(limit),
                total: totalCount
            }
        });

    } catch (error) {
        console.error('Error getting transaction history:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving transaction history',
            error: error.message
        });
    }
};

// Get account details
exports.getAccountDetails = async (req, res) => {
    try {
        const userId = req.user._id;
        const { accountId } = req.params;

        const account = await Account.findOne({
            _id: accountId,
            user: userId,
            status: true
        });

        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'Account not found'
            });
        }

        // Update balance from external API
        await updateAccountBalances([account]);

        // Fetch updated account
        const updatedAccount = await Account.findById(accountId);

        res.status(200).json({
            success: true,
            data: {
                _id: updatedAccount._id,
                mt5Account: updatedAccount.mt5Account,
                name: updatedAccount.name,
                accountType: updatedAccount.accountType,
                leverage: updatedAccount.leverage,
                balance: parseFloat((updatedAccount.balance || 0).toFixed(2)),
                equity: parseFloat((updatedAccount.equity || 0).toFixed(2)),
                profitLoss: parseFloat(((updatedAccount.equity || 0) - (updatedAccount.balance || 0)).toFixed(2)),
                groupName: updatedAccount.groupName,
                platform: updatedAccount.platform || 'MetaTrader 5'
            },
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error getting account details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch account details',
            error: error.message
        });
    }
};
