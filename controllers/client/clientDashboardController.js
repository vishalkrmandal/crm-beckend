// Backend/controllers/client/clientDashboardController.js - DATABASE ONLY VERSION

const User = require('../../models/User');
const Account = require('../../models/client/Account');
const Deposit = require('../../models/Deposit');
const Withdrawal = require('../../models/Withdrawal');
const Transfer = require('../../models/client/Transfer');
const IBClientConfiguration = require('../../models/client/IBClientConfiguration');
const IBClosedTrades = require('../../models/IBClosedTrade'); // Add this if you have it
const axios = require('axios');

// Enhanced cache with better management
const tradingDataCache = new Map();
const CACHE_DURATION = 30000; // 30 seconds
const BATCH_API_TIMEOUT = 8000; // Reduced timeout for faster response

// Helper function to update accounts via getUserAccounts before fetching dashboard
const updateAccountsBeforeDashboard = async (userId) => {
    try {
        console.log(`Pre-updating accounts for user ${userId}`);

        const accounts = await Account.find({ user: userId, status: true })
            .select('mt5Account managerIndex _id')
            .lean();

        if (accounts.length === 0) return [];

        // Group accounts by manager index for batch processing
        const accountsByManager = {};
        accounts.forEach(account => {
            const managerIndex = account.managerIndex || '2';
            if (!accountsByManager[managerIndex]) {
                accountsByManager[managerIndex] = [];
            }
            accountsByManager[managerIndex].push({
                mt5Account: parseInt(account.mt5Account),
                accountId: account._id
            });
        });

        // Update accounts in parallel for each manager
        const updatePromises = Object.entries(accountsByManager).map(async ([managerIndex, managerAccounts]) => {
            try {
                const mt5AccountNumbers = managerAccounts.map(acc => acc.mt5Account);
                const apiUrl = 'https://api.infoapi.biz/api/mt5/GetUserInfoByAccounts';
                const requestData = {
                    Manager_Index: parseInt(managerIndex),
                    MT5Accounts: mt5AccountNumbers
                };

                const response = await axios.post(apiUrl, requestData, {
                    timeout: BATCH_API_TIMEOUT,
                    headers: { 'Content-Type': 'application/json' }
                });

                if (response.data && Array.isArray(response.data)) {
                    const bulkOps = response.data.map(userInfo => {
                        const mt5Account = userInfo.MT5Account || userInfo.Login || userInfo.login;
                        const balance = userInfo.Balance || userInfo.balance || 0;
                        const equity = userInfo.Equity || userInfo.equity || 0;

                        const accountMapping = managerAccounts.find(acc => acc.mt5Account === mt5Account);

                        if (accountMapping && mt5Account) {
                            return {
                                updateOne: {
                                    filter: { _id: accountMapping.accountId },
                                    update: { balance, equity }
                                }
                            };
                        }
                        return null;
                    }).filter(op => op !== null);

                    if (bulkOps.length > 0) {
                        await Account.bulkWrite(bulkOps);
                    }
                }
            } catch (error) {
                console.error(`Error updating accounts for manager ${managerIndex}:`, error.message);
            }
        });

        await Promise.allSettled(updatePromises);
        console.log(`Account update completed for user ${userId}`);

        return await Account.find({ user: userId, status: true }).lean();
    } catch (error) {
        console.error('Error in updateAccountsBeforeDashboard:', error);
        return await Account.find({ user: userId, status: true }).lean();
    }
};

// Helper function to fetch account balance from MT5 API
const fetchAccountBalance = async (mt5Account, managerIndex) => {
    try {
        const cacheKey = `balance_${mt5Account}_${managerIndex}`;
        const cached = tradingDataCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
            return cached.data;
        }

        const url = `https://api.infoapi.biz/api/mt5/GetAccountInfo?Manager_Index=${managerIndex}&MT5Account=${mt5Account}`;
        const response = await axios.get(url, { timeout: 10000 });

        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
            const accountInfo = response.data[0];
            const balanceData = {
                balance: parseFloat(accountInfo.Balance) || 0,
                equity: parseFloat(accountInfo.Equity) || 0,
                margin: parseFloat(accountInfo.Margin) || 0,
                freeMargin: parseFloat(accountInfo.Free_Margin) || 0,
                marginLevel: parseFloat(accountInfo.Margin_Level) || 0,
                profit: parseFloat(accountInfo.Profit) || 0,
                credit: parseFloat(accountInfo.Credit) || 0,
                currency: accountInfo.Currency || 'USD'
            };

            tradingDataCache.set(cacheKey, { data: balanceData, timestamp: Date.now() });
            return balanceData;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching balance for account ${mt5Account}:`, error.message);
        return null;
    }
};

// Helper function to fetch open trades from MT5 API
const fetchOpenTrades = async (mt5Account, managerIndex) => {
    try {
        const cacheKey = `open_trades_${mt5Account}_${managerIndex}`;
        const cached = tradingDataCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
            return cached.data;
        }

        const url = `https://api.infoapi.biz/api/mt5/GetOpenTradeByAccount?Manager_Index=${managerIndex}&MT5Accont=${mt5Account}`;
        const response = await axios.get(url, { timeout: 10000 });

        let tradesData = [];
        if (Array.isArray(response.data)) {
            tradesData = response.data.map(trade => ({
                ticket: trade.Ticket || 0,
                symbol: trade.Symbol || '',
                type: trade.BUY_SELL === 0 ? 'BUY' : 'SELL',
                volume: parseFloat(trade.Lot) || 0,
                openPrice: parseFloat(trade.Open_Price) || 0,
                currentPrice: parseFloat(trade.Price_Current) || 0,
                profit: parseFloat(trade.Profit) || 0,
                swap: parseFloat(trade.Swap) || 0,
                commission: parseFloat(trade.Commission) || 0,
                openTime: trade.Open_Time || '',
                stopLoss: parseFloat(trade.Stop_Loss) || 0,
                takeProfit: parseFloat(trade.Target_Price) || 0,
                comment: trade.Comment || ''
            }));
        }

        tradingDataCache.set(cacheKey, { data: tradesData, timestamp: Date.now() });
        return tradesData;
    } catch (error) {
        console.error(`Error fetching open trades for account ${mt5Account}:`, error.message);
        return [];
    }
};

// Helper function to fetch closed trades from MT5 API
const fetchClosedTrades = async (mt5Account, managerIndex, days = 30) => {
    try {
        const cacheKey = `closed_trades_${mt5Account}_${managerIndex}_${days}`;
        const cached = tradingDataCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
            return cached.data;
        }

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const startTime = startDate.toISOString().slice(0, 19).replace('T', ' ');
        const endTime = endDate.toISOString().slice(0, 19).replace('T', ' ');

        const url = `https://api.infoapi.biz/api/mt5/GetCloseTradeAll?Manager_Index=${managerIndex}&MT5Accont=${mt5Account}&StartTime=${encodeURIComponent(startTime)}&EndTime=${encodeURIComponent(endTime)}`;
        const response = await axios.get(url, { timeout: 15000 });

        let tradesData = [];
        if (Array.isArray(response.data)) {
            tradesData = response.data.map(trade => ({
                ticket: trade.Ticket || 0,
                symbol: trade.Symbol || '',
                type: trade.uTradeFlag === 0 ? 'BUY' : 'SELL',
                volume: parseFloat(trade.Lot) || 0,
                openPrice: parseFloat(trade.Open_Price) || 0,
                closePrice: parseFloat(trade.Close_Price) || 0,
                profit: parseFloat(trade.Profit) || 0,
                swap: parseFloat(trade.Swap) || 0,
                commission: parseFloat(trade.Commission) || 0,
                openTime: trade.Open_Time || '',
                closeTime: trade.Close_Time || '',
                comment: trade.Comment || ''
            }));
        }

        tradingDataCache.set(cacheKey, { data: tradesData, timestamp: Date.now() });
        return tradesData;
    } catch (error) {
        console.error(`Error fetching closed trades for account ${mt5Account}:`, error.message);
        return [];
    }
};

// 1. Get client dashboard overview - DATABASE ONLY
exports.getClientDashboardOverview = async (req, res) => {
    try {
        const userId = req.user._id;
        console.log(`Dashboard overview requested for user: ${userId}`);

        // Step 1: Update accounts first, then get fresh data
        const accounts = await updateAccountsBeforeDashboard(userId);

        if (accounts.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    totalBalance: 0,
                    totalEquity: 0,
                    totalProfit: 0,
                    activeTrades: 0,
                    accounts: [],
                    recentActivity: [],
                    referrals: 0,
                    referralEarnings: 0,
                    performanceMetrics: { profitLoss: 0, marginLevel: 0, freeMargin: 0 }
                }
            });
        }

        // Step 2: Get live data for each account
        const accountsWithLiveData = await Promise.all(
            accounts.map(async (account) => {
                const [liveBalance, openTrades] = await Promise.all([
                    fetchAccountBalance(account.mt5Account, account.managerIndex || '2'),
                    fetchOpenTrades(account.mt5Account, account.managerIndex || '2')
                ]);

                return {
                    id: account._id,
                    mt5Account: account.mt5Account,
                    name: account.name,
                    accountType: account.accountType,
                    groupName: account.groupName,
                    leverage: account.leverage,
                    balance: liveBalance?.balance || account.balance || 0,
                    equity: liveBalance?.equity || account.equity || 0,
                    margin: liveBalance?.margin || 0,
                    freeMargin: liveBalance?.freeMargin || 0,
                    marginLevel: liveBalance?.marginLevel || 0,
                    profit: liveBalance?.profit || 0,
                    credit: liveBalance?.credit || 0,
                    currency: liveBalance?.currency || 'USD',
                    openTrades: openTrades.length,
                    openTradesProfit: openTrades.reduce((sum, trade) => sum + trade.profit, 0),
                    status: 'Active'
                };
            })
        );

        // Step 3: Calculate totals from actual data
        const totalBalance = accountsWithLiveData.reduce((sum, acc) => sum + acc.balance, 0);
        const totalEquity = accountsWithLiveData.reduce((sum, acc) => sum + acc.equity, 0);
        const totalProfit = accountsWithLiveData.reduce((sum, acc) => sum + acc.profit, 0);
        const activeTrades = accountsWithLiveData.reduce((sum, acc) => sum + acc.openTrades, 0);
        const avgMarginLevel = accountsWithLiveData.length > 0 ?
            accountsWithLiveData.reduce((sum, acc) => sum + acc.marginLevel, 0) / accountsWithLiveData.length : 0;
        const totalFreeMargin = accountsWithLiveData.reduce((sum, acc) => sum + acc.freeMargin, 0);

        // Step 4: Get recent activity from database only
        const [recentDeposits, recentWithdrawals, recentTransfers, ibConfig] = await Promise.all([
            Deposit.find({ user: userId })
                .sort({ createdAt: -1 })
                .limit(3)
                .populate('account', 'mt5Account name')
                .select('amount status createdAt account paymentType bonus')
                .lean(),
            Withdrawal.find({ user: userId })
                .sort({ createdAt: -1 })
                .limit(3)
                .select('amount status createdAt accountNumber accountType paymentMethod')
                .lean(),
            Transfer.find({ user: userId })
                .sort({ createdAt: -1 })
                .limit(3)
                .populate('fromAccount', 'mt5Account name')
                .populate('toAccount', 'mt5Account name')
                .select('amount status createdAt fromAccount toAccount')
                .lean(),
            IBClientConfiguration.findOne({ userId }).select('referralCode').lean()
        ]);

        // Step 5: Build recent activity from database data
        const recentActivity = [];

        recentDeposits.forEach(deposit => {
            recentActivity.push({
                id: deposit._id,
                type: 'Deposit',
                amount: deposit.amount,
                status: deposit.status,
                date: deposit.createdAt,
                account: deposit.account?.mt5Account || 'N/A',
                description: `Deposit to ${deposit.account?.name || 'Account'}`
            });
        });

        recentWithdrawals.forEach(withdrawal => {
            recentActivity.push({
                id: withdrawal._id,
                type: 'Withdrawal',
                amount: withdrawal.amount,
                status: withdrawal.status,
                date: withdrawal.createdAt,
                account: withdrawal.accountNumber,
                description: `Withdrawal from ${withdrawal.accountType || 'Account'}`
            });
        });

        recentTransfers.forEach(transfer => {
            recentActivity.push({
                id: transfer._id,
                type: 'Transfer',
                amount: transfer.amount,
                status: transfer.status,
                date: transfer.createdAt,
                account: `${transfer.fromAccount?.mt5Account} → ${transfer.toAccount?.mt5Account}`,
                description: 'Internal account transfer'
            });
        });

        recentActivity.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Step 6: Get referral stats from database only
        let referralCount = 0;
        let referralEarnings = 0;
        if (ibConfig?.referralCode) {
            referralCount = await IBClientConfiguration.countDocuments({
                referredBy: ibConfig.referralCode
            });
            // Calculate earnings based on actual referrals (customize as needed)
            referralEarnings = referralCount * 50; // $50 per referral or adjust based on your commission structure
        }

        console.log(`Dashboard data prepared for user ${userId} from database only`);

        res.status(200).json({
            success: true,
            data: {
                totalBalance: parseFloat(totalBalance.toFixed(2)),
                totalEquity: parseFloat(totalEquity.toFixed(2)),
                totalProfit: parseFloat(totalProfit.toFixed(2)),
                activeTrades,
                accounts: accountsWithLiveData,
                recentActivity: recentActivity.slice(0, 6),
                referrals: referralCount,
                referralEarnings: parseFloat(referralEarnings.toFixed(2)),
                performanceMetrics: {
                    profitLoss: parseFloat(totalProfit.toFixed(2)),
                    marginLevel: parseFloat(avgMarginLevel.toFixed(2)),
                    freeMargin: parseFloat(totalFreeMargin.toFixed(2))
                },
                lastUpdated: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error fetching dashboard overview:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard data',
            error: error.message
        });
    }
};

// 2. Get trading performance from actual data
exports.getTradingPerformance = async (req, res) => {
    try {
        const userId = req.user._id;
        const { period = '30d' } = req.query;

        let days = 30;
        switch (period) {
            case '7d': days = 7; break;
            case '30d': days = 30; break;
            case '90d': days = 90; break;
            case '1y': days = 365; break;
            default: days = 30;
        }

        const accounts = await Account.find({ user: userId, status: true });

        if (accounts.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    performanceChart: [],
                    totalTrades: 0,
                    winRate: 0,
                    profitFactor: 0,
                    avgWin: 0,
                    avgLoss: 0,
                    maxDrawdown: 0,
                    sharpeRatio: 0,
                    period
                }
            });
        }

        // Get actual closed trades from database/API
        const allClosedTrades = [];
        for (const account of accounts) {
            const closedTrades = await fetchClosedTrades(account.mt5Account, account.managerIndex || '2', days);
            allClosedTrades.push(...closedTrades.map(trade => ({
                ...trade,
                accountId: account._id,
                accountName: account.name
            })));
        }

        // Build performance chart from actual trade data
        const performanceChart = [];
        let cumulativeProfit = 0;
        const initialBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

        // Group trades by date
        const tradesByDate = {};
        allClosedTrades.forEach(trade => {
            const date = new Date(trade.closeTime).toISOString().split('T')[0];
            if (!tradesByDate[date]) {
                tradesByDate[date] = [];
            }
            tradesByDate[date].push(trade);
        });

        // Create performance chart from actual data
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - (days - 1 - i));
            const dateStr = date.toISOString().split('T')[0];

            const dayTrades = tradesByDate[dateStr] || [];
            const dayProfit = dayTrades.reduce((sum, trade) => sum + trade.profit, 0);
            cumulativeProfit += dayProfit;

            performanceChart.push({
                date: dateStr,
                profit: parseFloat(cumulativeProfit.toFixed(2)),
                balance: parseFloat((initialBalance + cumulativeProfit).toFixed(2)),
                trades: dayTrades.length
            });
        }

        // Calculate actual metrics from trade data
        const totalTrades = allClosedTrades.length;
        const winningTrades = allClosedTrades.filter(trade => trade.profit > 0);
        const losingTrades = allClosedTrades.filter(trade => trade.profit < 0);

        const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades * 100) : 0;
        const avgWin = winningTrades.length > 0 ?
            winningTrades.reduce((sum, trade) => sum + trade.profit, 0) / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ?
            Math.abs(losingTrades.reduce((sum, trade) => sum + trade.profit, 0) / losingTrades.length) : 0;

        const grossProfit = winningTrades.reduce((sum, trade) => sum + trade.profit, 0);
        const grossLoss = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.profit, 0));
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 1 : 0;

        // Calculate maximum drawdown from actual data
        let maxDrawdown = 0;
        let peak = initialBalance;
        for (const point of performanceChart) {
            if (point.balance > peak) {
                peak = point.balance;
            }
            const drawdown = (peak - point.balance) / peak * 100;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }

        // Calculate Sharpe ratio from actual returns
        const returns = performanceChart.slice(1).map((point, index) =>
            (point.balance - performanceChart[index].balance) / performanceChart[index].balance
        );
        const avgReturn = returns.length > 0 ? returns.reduce((sum, ret) => sum + ret, 0) / returns.length : 0;
        const returnStdDev = returns.length > 1 ? Math.sqrt(
            returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / (returns.length - 1)
        ) : 0;
        const sharpeRatio = returnStdDev > 0 ? avgReturn / returnStdDev : 0;

        res.status(200).json({
            success: true,
            data: {
                performanceChart,
                totalTrades,
                winRate: parseFloat(winRate.toFixed(2)),
                profitFactor: parseFloat(profitFactor.toFixed(2)),
                avgWin: parseFloat(avgWin.toFixed(2)),
                avgLoss: parseFloat(avgLoss.toFixed(2)),
                maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
                sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
                grossProfit: parseFloat(grossProfit.toFixed(2)),
                grossLoss: parseFloat(grossLoss.toFixed(2)),
                netProfit: parseFloat((grossProfit - grossLoss).toFixed(2)),
                period
            }
        });

    } catch (error) {
        console.error('Error fetching trading performance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch trading performance',
            error: error.message
        });
    }
};

// 3. Get account summary from database
exports.getAccountSummary = async (req, res) => {
    try {
        const userId = req.user._id;
        const accounts = await Account.find({ user: userId, status: true });

        if (accounts.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    accounts: [],
                    summary: {
                        totalAccounts: 0,
                        totalBalance: 0,
                        totalEquity: 0,
                        totalProfit: 0,
                        totalDeposited: 0,
                        totalWithdrawn: 0
                    }
                }
            });
        }

        const accountSummaries = await Promise.all(
            accounts.map(async (account) => {
                const [liveBalance, openTrades, totalDeposited, totalWithdrawn] = await Promise.all([
                    fetchAccountBalance(account.mt5Account, account.managerIndex || '2'),
                    fetchOpenTrades(account.mt5Account, account.managerIndex || '2'),
                    Deposit.aggregate([
                        { $match: { user: userId, account: account._id, status: 'Approved' } },
                        { $group: { _id: null, total: { $sum: '$amount' } } }
                    ]),
                    Withdrawal.aggregate([
                        { $match: { user: userId, status: 'Approved' } },
                        { $group: { _id: null, total: { $sum: '$amount' } } }
                    ])
                ]);

                const deposited = totalDeposited[0]?.total || 0;
                const withdrawn = totalWithdrawn[0]?.total || 0;
                const currentBalance = liveBalance?.balance || account.balance || 0;
                const currentEquity = liveBalance?.equity || account.equity || 0;

                return {
                    id: account._id,
                    mt5Account: account.mt5Account,
                    name: account.name,
                    accountType: account.accountType,
                    groupName: account.groupName,
                    leverage: account.leverage,
                    platform: account.platform || 'MetaTrader 5',
                    balance: currentBalance,
                    equity: currentEquity,
                    margin: liveBalance?.margin || 0,
                    freeMargin: liveBalance?.freeMargin || 0,
                    marginLevel: liveBalance?.marginLevel || 0,
                    profit: liveBalance?.profit || 0,
                    credit: liveBalance?.credit || 0,
                    currency: liveBalance?.currency || 'USD',
                    totalDeposited: deposited,
                    totalWithdrawn: withdrawn,
                    netDeposit: deposited - withdrawn,
                    profitLoss: currentBalance - (deposited - withdrawn),
                    openTrades: openTrades.length,
                    openTradesProfit: openTrades.reduce((sum, trade) => sum + trade.profit, 0),
                    createdAt: account.createdAt,
                    status: 'Active',
                    lastUpdated: new Date().toISOString()
                };
            })
        );

        const summary = {
            totalAccounts: accountSummaries.length,
            totalBalance: accountSummaries.reduce((sum, acc) => sum + acc.balance, 0),
            totalEquity: accountSummaries.reduce((sum, acc) => sum + acc.equity, 0),
            totalProfit: accountSummaries.reduce((sum, acc) => sum + acc.profit, 0),
            totalDeposited: accountSummaries.reduce((sum, acc) => sum + acc.totalDeposited, 0),
            totalWithdrawn: accountSummaries.reduce((sum, acc) => sum + acc.totalWithdrawn, 0),
            totalOpenTrades: accountSummaries.reduce((sum, acc) => sum + acc.openTrades, 0),
            totalFreeMargin: accountSummaries.reduce((sum, acc) => sum + acc.freeMargin, 0)
        };

        res.status(200).json({
            success: true,
            data: { accounts: accountSummaries, summary }
        });

    } catch (error) {
        console.error('Error fetching account summary:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch account summary',
            error: error.message
        });
    }
};

// Continue with all other methods using database data only...
// (I'll include the essential ones and you can copy the rest from the previous version)

// 4. Get transaction history from database
exports.getTransactionHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const { page = 1, limit = 20, type = 'all', status = 'all', startDate, endDate } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        let dateFilter = {};

        if (startDate && endDate) {
            dateFilter = {
                createdAt: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        const transactions = [];

        if (type === 'all' || type === 'deposit') {
            const deposits = await Deposit.find({
                user: userId,
                ...(status !== 'all' && { status: status.charAt(0).toUpperCase() + status.slice(1) }),
                ...dateFilter
            }).populate('account', 'mt5Account name').sort({ createdAt: -1 }).lean();

            deposits.forEach(deposit => {
                transactions.push({
                    id: deposit._id,
                    type: 'Deposit',
                    amount: deposit.amount,
                    status: deposit.status,
                    date: deposit.createdAt,
                    account: deposit.account?.mt5Account || 'N/A',
                    accountName: deposit.account?.name || 'Unknown',
                    paymentMethod: deposit.paymentType,
                    reference: deposit._id.toString(),
                    description: `Deposit via ${deposit.paymentType}`,
                    bonus: deposit.bonus || 0
                });
            });
        }

        if (type === 'all' || type === 'withdrawal') {
            const withdrawals = await Withdrawal.find({
                user: userId,
                ...(status !== 'all' && { status: status.charAt(0).toUpperCase() + status.slice(1) }),
                ...dateFilter
            }).sort({ createdAt: -1 }).lean();

            withdrawals.forEach(withdrawal => {
                transactions.push({
                    id: withdrawal._id,
                    type: 'Withdrawal',
                    amount: withdrawal.amount,
                    status: withdrawal.status,
                    date: withdrawal.createdAt,
                    account: withdrawal.accountNumber,
                    accountName: withdrawal.accountType,
                    paymentMethod: withdrawal.paymentMethod,
                    reference: withdrawal._id.toString(),
                    description: `Withdrawal via ${withdrawal.paymentMethod}`
                });
            });
        }

        if (type === 'all' || type === 'transfer') {
            const transfers = await Transfer.find({
                user: userId,
                ...(status !== 'all' && { status: status.charAt(0).toUpperCase() + status.slice(1) }),
                ...dateFilter
            }).populate('fromAccount', 'mt5Account name').populate('toAccount', 'mt5Account name')
                .sort({ createdAt: -1 }).lean();

            transfers.forEach(transfer => {
                transactions.push({
                    id: transfer._id,
                    type: 'Transfer',
                    amount: transfer.amount,
                    status: transfer.status,
                    date: transfer.createdAt,
                    account: `${transfer.fromAccount?.mt5Account} → ${transfer.toAccount?.mt5Account}`,
                    accountName: `${transfer.fromAccount?.name} → ${transfer.toAccount?.name}`,
                    paymentMethod: 'Internal Transfer',
                    reference: transfer._id.toString(),
                    description: 'Internal account transfer'
                });
            });
        }

        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        const paginatedTransactions = transactions.slice(skip, skip + parseInt(limit));
        const total = transactions.length;

        const summary = {
            totalDeposits: transactions.filter(t => t.type === 'Deposit' && t.status === 'Approved').reduce((sum, t) => sum + t.amount, 0),
            totalWithdrawals: transactions.filter(t => t.type === 'Withdrawal' && t.status === 'Approved').reduce((sum, t) => sum + t.amount, 0),
            totalTransfers: transactions.filter(t => t.type === 'Transfer' && t.status === 'Completed').reduce((sum, t) => sum + t.amount, 0),
            pendingCount: transactions.filter(t => t.status === 'Pending').length,
            approvedCount: transactions.filter(t => t.status === 'Approved' || t.status === 'Completed').length,
            rejectedCount: transactions.filter(t => t.status === 'Rejected' || t.status === 'Failed').length
        };

        res.status(200).json({
            success: true,
            data: {
                transactions: paginatedTransactions,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / parseInt(limit)),
                    total,
                    limit: parseInt(limit),
                    hasNext: skip + parseInt(limit) < total,
                    hasPrev: parseInt(page) > 1
                },
                summary,
                filters: { type, status, startDate, endDate }
            }
        });

    } catch (error) {
        console.error('Error fetching transaction history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transaction history',
            error: error.message
        });
    }
};

// 5. Get referral statistics from database
exports.getReferralStats = async (req, res) => {
    try {
        const userId = req.user._id;
        const ibConfig = await IBClientConfiguration.findOne({ userId });

        if (!ibConfig || !ibConfig.referralCode) {
            return res.status(200).json({
                success: true,
                data: {
                    referralCode: null,
                    totalReferrals: 0,
                    activeReferrals: 0,
                    totalEarnings: 0,
                    monthlyEarnings: 0,
                    referrals: [],
                    commissionRate: 0,
                    referralLink: null
                }
            });
        }

        const referredUsers = await IBClientConfiguration.find({
            referredBy: ibConfig.referralCode
        }).populate('userId', 'firstname lastname email createdAt');

        const baseCommission = 50;
        const totalEarnings = referredUsers.length * baseCommission;

        const currentMonth = new Date();
        const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const monthlyReferrals = referredUsers.filter(ref => new Date(ref.createdAt) >= startOfMonth);
        const monthlyEarnings = monthlyReferrals.length * baseCommission;

        const referralStats = referredUsers.map(ref => ({
            id: ref._id,
            user: {
                name: `${ref.userId.firstname} ${ref.userId.lastname}`,
                email: ref.userId.email
            },
            joinDate: ref.createdAt,
            status: ref.status,
            level: ref.level,
            earnings: baseCommission
        }));

        res.status(200).json({
            success: true,
            data: {
                referralCode: ibConfig.referralCode,
                totalReferrals: referredUsers.length,
                activeReferrals: referredUsers.filter(ref => ref.status === 'active').length,
                totalEarnings: parseFloat(totalEarnings.toFixed(2)),
                monthlyEarnings: parseFloat(monthlyEarnings.toFixed(2)),
                referrals: referralStats,
                commissionRate: parseFloat(((ibConfig.commissionRate || 0.0001) * 100).toFixed(2)),
                referralLink: `${process.env.CLIENT_URL}/register?ref=${ibConfig.referralCode}`,
                statistics: {
                    thisWeek: referredUsers.filter(ref => {
                        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                        return new Date(ref.createdAt) >= weekAgo;
                    }).length,
                    thisMonth: monthlyReferrals.length
                }
            }
        });

    } catch (error) {
        console.error('Error fetching referral stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch referral statistics',
            error: error.message
        });
    }
};

// 6. Get portfolio allocation from database
exports.getPortfolioAllocation = async (req, res) => {
    try {
        const userId = req.user._id;
        const accounts = await Account.find({ user: userId, status: true });

        if (accounts.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    allocation: [],
                    totalValue: 0,
                    currencies: []
                }
            });
        }

        const allocationMap = new Map();
        const currencyMap = new Map();
        let totalValue = 0;

        for (const account of accounts) {
            const liveBalance = await fetchAccountBalance(account.mt5Account, account.managerIndex || '2');
            const balance = liveBalance?.balance || account.balance || 0;
            const currency = liveBalance?.currency || 'USD';

            totalValue += balance;

            if (allocationMap.has(account.accountType)) {
                allocationMap.set(account.accountType, allocationMap.get(account.accountType) + balance);
            } else {
                allocationMap.set(account.accountType, balance);
            }

            if (currencyMap.has(currency)) {
                currencyMap.set(currency, currencyMap.get(currency) + balance);
            } else {
                currencyMap.set(currency, balance);
            }
        }

        const allocation = Array.from(allocationMap.entries()).map(([type, value]) => ({
            type,
            value: parseFloat(value.toFixed(2)),
            percentage: totalValue > 0 ? parseFloat(((value / totalValue) * 100).toFixed(2)) : 0,
            accounts: accounts.filter(acc => acc.accountType === type).length
        }));

        const currencies = Array.from(currencyMap.entries()).map(([currency, value]) => ({
            currency,
            value: parseFloat(value.toFixed(2)),
            percentage: totalValue > 0 ? parseFloat(((value / totalValue) * 100).toFixed(2)) : 0
        }));

        res.status(200).json({
            success: true,
            data: {
                allocation,
                currencies,
                totalValue: parseFloat(totalValue.toFixed(2)),
                totalAccounts: accounts.length,
                lastUpdated: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error fetching portfolio allocation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch portfolio allocation',
            error: error.message
        });
    }
};

// 7. Get account balance for specific account
exports.getAccountBalance = async (req, res) => {
    try {
        const userId = req.user._id;
        const { accountId } = req.params;

        const account = await Account.findOne({ _id: accountId, user: userId, status: true });

        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'Account not found or access denied'
            });
        }

        const [liveBalance, openTrades] = await Promise.all([
            fetchAccountBalance(account.mt5Account, account.managerIndex || '2'),
            fetchOpenTrades(account.mt5Account, account.managerIndex || '2')
        ]);

        const accountData = {
            accountId: account._id,
            mt5Account: account.mt5Account,
            name: account.name,
            accountType: account.accountType,
            groupName: account.groupName,
            leverage: account.leverage,
            balance: liveBalance?.balance || account.balance || 0,
            equity: liveBalance?.equity || account.equity || 0,
            margin: liveBalance?.margin || 0,
            freeMargin: liveBalance?.freeMargin || 0,
            marginLevel: liveBalance?.marginLevel || 0,
            profit: liveBalance?.profit || 0,
            credit: liveBalance?.credit || 0,
            currency: liveBalance?.currency || 'USD',
            openTrades: openTrades.length,
            openTradesProfit: openTrades.reduce((sum, trade) => sum + trade.profit, 0),
            recentTrades: openTrades.slice(-5),
            lastUpdated: new Date().toISOString()
        };

        res.status(200).json({
            success: true,
            data: accountData
        });

    } catch (error) {
        console.error('Error fetching account balance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch account balance',
            error: error.message
        });
    }
};

// 8. Export transaction data from database
exports.exportTransactionData = async (req, res) => {
    try {
        const userId = req.user._id;
        const { format = 'csv', type = 'all', status = 'all', startDate, endDate } = req.query;

        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                createdAt: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        const transactions = [];

        if (type === 'all' || type === 'deposit') {
            const deposits = await Deposit.find({
                user: userId,
                ...(status !== 'all' && { status: status.charAt(0).toUpperCase() + status.slice(1) }),
                ...dateFilter
            }).populate('account', 'mt5Account name').sort({ createdAt: -1 }).lean();

            deposits.forEach(deposit => {
                transactions.push({
                    Date: new Date(deposit.createdAt).toLocaleDateString(),
                    Time: new Date(deposit.createdAt).toLocaleTimeString(),
                    Type: 'Deposit',
                    Amount: deposit.amount,
                    Status: deposit.status,
                    Account: deposit.account?.mt5Account || 'N/A',
                    AccountName: deposit.account?.name || 'Unknown',
                    PaymentMethod: deposit.paymentType,
                    Reference: deposit._id.toString(),
                    Bonus: deposit.bonus || 0
                });
            });
        }

        if (type === 'all' || type === 'withdrawal') {
            const withdrawals = await Withdrawal.find({
                user: userId,
                ...(status !== 'all' && { status: status.charAt(0).toUpperCase() + status.slice(1) }),
                ...dateFilter
            }).sort({ createdAt: -1 }).lean();

            withdrawals.forEach(withdrawal => {
                transactions.push({
                    Date: new Date(withdrawal.createdAt).toLocaleDateString(),
                    Time: new Date(withdrawal.createdAt).toLocaleTimeString(),
                    Type: 'Withdrawal',
                    Amount: withdrawal.amount,
                    Status: withdrawal.status,
                    Account: withdrawal.accountNumber,
                    AccountName: withdrawal.accountType,
                    PaymentMethod: withdrawal.paymentMethod,
                    Reference: withdrawal._id.toString(),
                    Bonus: 0
                });
            });
        }

        if (type === 'all' || type === 'transfer') {
            const transfers = await Transfer.find({
                user: userId,
                ...(status !== 'all' && { status: status.charAt(0).toUpperCase() + status.slice(1) }),
                ...dateFilter
            }).populate('fromAccount', 'mt5Account name').populate('toAccount', 'mt5Account name')
                .sort({ createdAt: -1 }).lean();

            transfers.forEach(transfer => {
                transactions.push({
                    Date: new Date(transfer.createdAt).toLocaleDateString(),
                    Time: new Date(transfer.createdAt).toLocaleTimeString(),
                    Type: 'Transfer',
                    Amount: transfer.amount,
                    Status: transfer.status,
                    Account: `${transfer.fromAccount?.mt5Account} → ${transfer.toAccount?.mt5Account}`,
                    AccountName: `${transfer.fromAccount?.name} → ${transfer.toAccount?.name}`,
                    PaymentMethod: 'Internal Transfer',
                    Reference: transfer._id.toString(),
                    Bonus: 0
                });
            });
        }

        transactions.sort((a, b) => new Date(`${b.Date} ${b.Time}`) - new Date(`${a.Date} ${a.Time}`));

        if (format === 'csv') {
            if (transactions.length === 0) {
                return res.status(200).json({
                    success: true,
                    message: 'No transactions found for export'
                });
            }

            const headers = Object.keys(transactions[0]);
            const csvContent = [
                headers.join(','),
                ...transactions.map(row =>
                    headers.map(header => `"${row[header] || ''}"`).join(',')
                )
            ].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=transactions-${new Date().toISOString().split('T')[0]}.csv`);
            return res.send(csvContent);
        }

        res.status(200).json({
            success: true,
            data: transactions,
            format,
            summary: {
                totalRecords: transactions.length,
                dateRange: { startDate, endDate },
                filters: { type, status }
            },
            exportedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error exporting transaction data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export transaction data',
            error: error.message
        });
    }
};

// 9. Get dashboard preferences from database
exports.getDashboardPreferences = async (req, res) => {
    try {
        const userId = req.user._id;

        // You can store preferences in the User model or create a separate DashboardPreferences model
        const user = await User.findById(userId).select('dashboardPreferences');

        const defaultPreferences = {
            defaultPeriod: '30d',
            defaultCurrency: 'USD',
            showRealTimeUpdates: true,
            refreshInterval: 30,
            chartType: 'line',
            theme: 'light',
            timezone: 'UTC',
            notificationSettings: {
                email: true,
                push: true,
                sms: false,
                tradeAlerts: true,
                marketNews: false,
                accountUpdates: true,
                depositWithdrawal: true
            }
        };

        const preferences = user?.dashboardPreferences || defaultPreferences;

        res.status(200).json({
            success: true,
            data: preferences
        });

    } catch (error) {
        console.error('Error fetching dashboard preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard preferences',
            error: error.message
        });
    }
};

// 10. Update dashboard preferences in database
exports.updateDashboardPreferences = async (req, res) => {
    try {
        const userId = req.user._id;
        const preferences = req.body;

        const validPreferences = {
            defaultPeriod: preferences.defaultPeriod || '30d',
            defaultCurrency: preferences.defaultCurrency || 'USD',
            showRealTimeUpdates: Boolean(preferences.showRealTimeUpdates),
            refreshInterval: Math.max(10, Math.min(300, parseInt(preferences.refreshInterval) || 30)),
            chartType: ['line', 'area', 'candlestick'].includes(preferences.chartType) ? preferences.chartType : 'line',
            theme: ['light', 'dark'].includes(preferences.theme) ? preferences.theme : 'light',
            timezone: preferences.timezone || 'UTC',
            notificationSettings: {
                email: Boolean(preferences.notificationSettings?.email),
                push: Boolean(preferences.notificationSettings?.push),
                sms: Boolean(preferences.notificationSettings?.sms),
                tradeAlerts: Boolean(preferences.notificationSettings?.tradeAlerts),
                marketNews: Boolean(preferences.notificationSettings?.marketNews),
                accountUpdates: Boolean(preferences.notificationSettings?.accountUpdates),
                depositWithdrawal: Boolean(preferences.notificationSettings?.depositWithdrawal)
            }
        };

        // Save to database (you might need to add dashboardPreferences field to User model)
        await User.findByIdAndUpdate(userId, {
            dashboardPreferences: validPreferences
        });

        res.status(200).json({
            success: true,
            message: 'Dashboard preferences updated successfully',
            data: validPreferences
        });

    } catch (error) {
        console.error('Error updating dashboard preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update dashboard preferences',
            error: error.message
        });
    }
};

// 11. Get market overview (you can store this in database or fetch from external API)
exports.getMarketOverview = async (req, res) => {
    try {
        // For now, returning static data, but you can fetch from external APIs or your database
        const marketData = {
            majorPairs: [],
            indices: [],
            commodities: [],
            marketStatus: {
                isOpen: true,
                session: 'London',
                nextClose: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
                timezone: 'UTC'
            },
            lastUpdated: new Date().toISOString()
        };

        res.status(200).json({
            success: true,
            data: marketData
        });

    } catch (error) {
        console.error('Error fetching market overview:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch market overview',
            error: error.message
        });
    }
};

// 12. Get news and announcements from database
exports.getNewsAndAnnouncements = async (req, res) => {
    try {
        const { limit = 5 } = req.query;

        // You can create a News model to store announcements in database
        // For now returning empty array since no News model exists
        const news = [];

        res.status(200).json({
            success: true,
            data: news,
            pagination: {
                total: news.length,
                limit: parseInt(limit),
                hasMore: false
            }
        });

    } catch (error) {
        console.error('Error fetching news and announcements:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch news and announcements',
            error: error.message
        });
    }
};

// 13. Validate trading session from database
exports.validateTradingSession = async (req, res) => {
    try {
        const userId = req.user._id;

        const activeAccounts = await Account.countDocuments({ user: userId, status: true });
        const accounts = await Account.find({ user: userId, status: true }).select('mt5Account name balance');

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [recentDeposits, recentWithdrawals, recentTransfers] = await Promise.all([
            Deposit.countDocuments({ user: userId, createdAt: { $gte: thirtyDaysAgo } }),
            Withdrawal.countDocuments({ user: userId, createdAt: { $gte: thirtyDaysAgo } }),
            Transfer.countDocuments({ user: userId, createdAt: { $gte: thirtyDaysAgo } })
        ]);

        const totalRecentActivity = recentDeposits + recentWithdrawals + recentTransfers;
        const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

        const now = new Date();
        const dayOfWeek = now.getDay();
        const hour = now.getUTCHours();

        const isMarketOpen = !(
            dayOfWeek === 6 ||
            dayOfWeek === 0 ||
            (dayOfWeek === 5 && hour >= 22) ||
            (dayOfWeek === 0 && hour < 22)
        );

        const warnings = [];
        const recommendations = [];

        if (activeAccounts === 0) {
            warnings.push('No active trading accounts found');
            recommendations.push('Create a trading account to start trading');
        }

        if (totalBalance === 0) {
            warnings.push('No account balance available');
            recommendations.push('Make a deposit to begin trading');
        }

        if (!isMarketOpen) {
            warnings.push('Market is currently closed');
            recommendations.push('Trading will resume when markets open');
        }

        const sessionValid = activeAccounts > 0 && totalBalance > 0;

        res.status(200).json({
            success: true,
            data: {
                isValid: sessionValid,
                sessionScore: Math.min(100,
                    (activeAccounts > 0 ? 25 : 0) +
                    (totalBalance > 0 ? 25 : 0) +
                    (isMarketOpen ? 25 : 0) +
                    (totalRecentActivity > 0 ? 25 : 0)
                ),
                accounts: {
                    total: activeAccounts,
                    totalBalance: parseFloat(totalBalance.toFixed(2))
                },
                activity: {
                    hasRecentActivity: totalRecentActivity > 0,
                    recentDeposits,
                    recentWithdrawals,
                    recentTransfers,
                    totalActivity: totalRecentActivity
                },
                market: {
                    isOpen: isMarketOpen,
                    currentSession: isMarketOpen ? 'Active' : 'Closed',
                    timezone: 'UTC'
                },
                sessionExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                warnings,
                recommendations,
                lastChecked: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error validating trading session:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate trading session',
            error: error.message
        });
    }
};

// 14. Get trading signals (return empty if no signals in database)
exports.getTradingSignals = async (req, res) => {
    try {
        // You can create a TradingSignals model to store signals in database
        // For now returning empty array since no signals model exists
        res.status(200).json({
            success: true,
            data: {
                signals: [],
                disclaimer: 'Trading signals are for educational purposes only.',
                riskWarning: 'Trading involves significant risk of loss.',
                lastUpdated: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error fetching trading signals:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch trading signals',
            error: error.message
        });
    }
};

// 15. Get account trading history from database/API
exports.getAccountTradingHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const { accountId, period = '30d', status = 'all' } = req.query;

        let accounts;
        if (accountId) {
            const account = await Account.findOne({ _id: accountId, user: userId, status: true });
            if (!account) {
                return res.status(404).json({
                    success: false,
                    message: 'Account not found or access denied'
                });
            }
            accounts = [account];
        } else {
            accounts = await Account.find({ user: userId, status: true });
        }

        if (accounts.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    openTrades: [],
                    closedTrades: [],
                    summary: {
                        totalTrades: 0,
                        openTrades: 0,
                        closedTrades: 0,
                        totalProfit: 0,
                        winRate: 0
                    }
                }
            });
        }

        let days = 30;
        switch (period) {
            case '7d': days = 7; break;
            case '30d': days = 30; break;
            case '90d': days = 90; break;
            case '1y': days = 365; break;
        }

        const allOpenTrades = [];
        const allClosedTrades = [];

        for (const account of accounts) {
            const [openTrades, closedTrades] = await Promise.all([
                status === 'all' || status === 'open' ?
                    fetchOpenTrades(account.mt5Account, account.managerIndex || '2') : [],
                status === 'all' || status === 'closed' ?
                    fetchClosedTrades(account.mt5Account, account.managerIndex || '2', days) : []
            ]);

            openTrades.forEach(trade => {
                allOpenTrades.push({
                    ...trade,
                    accountId: account._id,
                    accountName: account.name,
                    mt5Account: account.mt5Account
                });
            });

            closedTrades.forEach(trade => {
                allClosedTrades.push({
                    ...trade,
                    accountId: account._id,
                    accountName: account.name,
                    mt5Account: account.mt5Account
                });
            });
        }

        const totalProfit = [...allOpenTrades, ...allClosedTrades].reduce((sum, trade) => sum + trade.profit, 0);
        const winningTrades = allClosedTrades.filter(trade => trade.profit > 0).length;
        const totalClosedTrades = allClosedTrades.length;
        const winRate = totalClosedTrades > 0 ? (winningTrades / totalClosedTrades * 100) : 0;

        const summary = {
            totalTrades: allOpenTrades.length + allClosedTrades.length,
            openTrades: allOpenTrades.length,
            closedTrades: allClosedTrades.length,
            totalProfit: parseFloat(totalProfit.toFixed(2)),
            winRate: parseFloat(winRate.toFixed(2)),
            totalVolume: [...allOpenTrades, ...allClosedTrades].reduce((sum, trade) => sum + trade.volume, 0),
            averageProfit: totalClosedTrades > 0 ?
                parseFloat((allClosedTrades.reduce((sum, trade) => sum + trade.profit, 0) / totalClosedTrades).toFixed(2)) : 0
        };

        res.status(200).json({
            success: true,
            data: {
                openTrades: allOpenTrades,
                closedTrades: allClosedTrades,
                summary,
                period,
                accountId: accountId || 'all',
                lastUpdated: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error fetching account trading history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch trading history',
            error: error.message
        });
    }
};

// 16. Get economic calendar events (return empty if no events in database)
exports.getEconomicCalendar = async (req, res) => {
    try {
        // You can create an EconomicEvents model to store events in database
        // For now returning empty array since no events model exists
        res.status(200).json({
            success: true,
            data: {
                events: [],
                eventsByDate: {},
                summary: {
                    totalEvents: 0,
                    highImpact: 0,
                    mediumImpact: 0,
                    lowImpact: 0,
                    currencies: []
                }
            }
        });

    } catch (error) {
        console.error('Error fetching economic calendar:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch economic calendar',
            error: error.message
        });
    }
};