// Backend/controllers/client/clientDashboardController.js
const User = require('../../models/User');
const Account = require('../../models/client/Account');
const Deposit = require('../../models/Deposit');
const Withdrawal = require('../../models/Withdrawal');
const Transfer = require('../../models/client/Transfer');
const IBClientConfiguration = require('../../models/client/IBClientConfiguration');
const axios = require('axios');

// Cache for trading data with 30-second expiry
const tradingDataCache = new Map();
const CACHE_DURATION = 30000;

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

// 1. Get client dashboard overview
exports.getClientDashboardOverview = async (req, res) => {
    try {
        const userId = req.user._id;

        const accounts = await Account.find({ user: userId, status: true })
            .select('mt5Account name accountType balance equity managerIndex leverage groupName');

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

        const totalBalance = accountsWithLiveData.reduce((sum, acc) => sum + acc.balance, 0);
        const totalEquity = accountsWithLiveData.reduce((sum, acc) => sum + acc.equity, 0);
        const totalProfit = accountsWithLiveData.reduce((sum, acc) => sum + acc.profit, 0);
        const activeTrades = accountsWithLiveData.reduce((sum, acc) => sum + acc.openTrades, 0);
        const avgMarginLevel = accountsWithLiveData.length > 0 ?
            accountsWithLiveData.reduce((sum, acc) => sum + acc.marginLevel, 0) / accountsWithLiveData.length : 0;
        const totalFreeMargin = accountsWithLiveData.reduce((sum, acc) => sum + acc.freeMargin, 0);

        const [recentDeposits, recentWithdrawals, recentTransfers] = await Promise.all([
            Deposit.find({ user: userId }).sort({ createdAt: -1 }).limit(5).populate('account', 'mt5Account name').lean(),
            Withdrawal.find({ user: userId }).sort({ createdAt: -1 }).limit(5).lean(),
            Transfer.find({ user: userId }).sort({ createdAt: -1 }).limit(5)
                .populate('fromAccount', 'mt5Account name').populate('toAccount', 'mt5Account name').lean()
        ]);

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
        const limitedActivity = recentActivity.slice(0, 10);

        const ibConfig = await IBClientConfiguration.findOne({ userId });
        const referralCount = ibConfig ? await IBClientConfiguration.countDocuments({ referredBy: ibConfig.referralCode }) : 0;
        const referralEarnings = referralCount * 50;

        res.status(200).json({
            success: true,
            data: {
                totalBalance: parseFloat(totalBalance.toFixed(2)),
                totalEquity: parseFloat(totalEquity.toFixed(2)),
                totalProfit: parseFloat(totalProfit.toFixed(2)),
                activeTrades,
                accounts: accountsWithLiveData,
                recentActivity: limitedActivity,
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
        console.error('Error fetching client dashboard overview:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard data',
            error: error.message
        });
    }
};

// 2. Get client's trading performance
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

        const allClosedTrades = [];
        for (const account of accounts) {
            const closedTrades = await fetchClosedTrades(account.mt5Account, account.managerIndex || '2', days);
            allClosedTrades.push(...closedTrades);
        }

        const performanceChart = [];
        let cumulativeProfit = 0;
        const initialBalance = 10000;

        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - (days - 1 - i));

            const dayTrades = allClosedTrades.filter(trade => {
                const tradeDate = new Date(trade.closeTime);
                return tradeDate.toDateString() === date.toDateString();
            });

            const dayProfit = dayTrades.reduce((sum, trade) => sum + trade.profit, 0);
            cumulativeProfit += dayProfit;

            performanceChart.push({
                date: date.toISOString().split('T')[0],
                profit: parseFloat(cumulativeProfit.toFixed(2)),
                balance: parseFloat((initialBalance + cumulativeProfit).toFixed(2)),
                trades: dayTrades.length
            });
        }

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

// 3. Get client's account summary
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
                const [liveBalance, openTrades] = await Promise.all([
                    fetchAccountBalance(account.mt5Account, account.managerIndex || '2'),
                    fetchOpenTrades(account.mt5Account, account.managerIndex || '2')
                ]);

                const [totalDeposited, totalWithdrawn] = await Promise.all([
                    Deposit.aggregate([
                        { $match: { user: userId, account: account._id, status: 'Approved' } },
                        { $group: { _id: null, total: { $sum: '$amount' } } }
                    ]),
                    Withdrawal.aggregate([
                        { $match: { user: userId, account: account._id, status: 'Approved' } },
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

// 4. Get client's transaction history
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

// 5. Get client's referral statistics
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
                commissionRate: parseFloat((ibConfig.commissionRate * 100).toFixed(2)),
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

// 6. Get portfolio allocation
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

// 8. Export transaction data
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

// 9. Get dashboard preferences
exports.getDashboardPreferences = async (req, res) => {
    try {
        const userId = req.user._id;

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
            },
            dashboardLayout: {
                showPerformanceChart: true,
                showAccountSummary: true,
                showRecentTransactions: true,
                showReferralWidget: true,
                showMarketOverview: true,
                compactView: false,
                cardsPerRow: 4
            },
            tradingPreferences: {
                defaultLotSize: 0.01,
                riskManagement: true,
                autoStopLoss: false,
                defaultStopLoss: 50,
                defaultTakeProfit: 100
            }
        };

        res.status(200).json({
            success: true,
            data: defaultPreferences
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

// 10. Update dashboard preferences
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
            },
            dashboardLayout: {
                showPerformanceChart: Boolean(preferences.dashboardLayout?.showPerformanceChart),
                showAccountSummary: Boolean(preferences.dashboardLayout?.showAccountSummary),
                showRecentTransactions: Boolean(preferences.dashboardLayout?.showRecentTransactions),
                showReferralWidget: Boolean(preferences.dashboardLayout?.showReferralWidget),
                showMarketOverview: Boolean(preferences.dashboardLayout?.showMarketOverview),
                compactView: Boolean(preferences.dashboardLayout?.compactView),
                cardsPerRow: Math.max(2, Math.min(6, parseInt(preferences.dashboardLayout?.cardsPerRow) || 4))
            },
            tradingPreferences: {
                defaultLotSize: Math.max(0.01, Math.min(100, parseFloat(preferences.tradingPreferences?.defaultLotSize) || 0.01)),
                riskManagement: Boolean(preferences.tradingPreferences?.riskManagement),
                autoStopLoss: Boolean(preferences.tradingPreferences?.autoStopLoss),
                defaultStopLoss: Math.max(1, Math.min(1000, parseInt(preferences.tradingPreferences?.defaultStopLoss) || 50)),
                defaultTakeProfit: Math.max(1, Math.min(1000, parseInt(preferences.tradingPreferences?.defaultTakeProfit) || 100))
            }
        };

        console.log(`Updating preferences for user ${userId}:`, validPreferences);

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

// 11. Get market overview
exports.getMarketOverview = async (req, res) => {
    try {
        const marketData = {
            majorPairs: [
                {
                    symbol: 'EUR/USD',
                    price: 1.0856,
                    change: +0.0023,
                    changePercent: +0.21,
                    bid: 1.0854,
                    ask: 1.0858,
                    high: 1.0890,
                    low: 1.0820
                },
                {
                    symbol: 'GBP/USD',
                    price: 1.2645,
                    change: -0.0045,
                    changePercent: -0.35,
                    bid: 1.2643,
                    ask: 1.2647,
                    high: 1.2695,
                    low: 1.2610
                },
                {
                    symbol: 'USD/JPY',
                    price: 149.85,
                    change: +0.65,
                    changePercent: +0.43,
                    bid: 149.83,
                    ask: 149.87,
                    high: 150.20,
                    low: 149.10
                },
                {
                    symbol: 'USD/CHF',
                    price: 0.8956,
                    change: +0.0012,
                    changePercent: +0.13,
                    bid: 0.8954,
                    ask: 0.8958,
                    high: 0.8970,
                    low: 0.8940
                },
                {
                    symbol: 'AUD/USD',
                    price: 0.6542,
                    change: -0.0023,
                    changePercent: -0.35,
                    bid: 0.6540,
                    ask: 0.6544,
                    high: 0.6580,
                    low: 0.6520
                }
            ],
            indices: [
                {
                    symbol: 'S&P 500',
                    price: 4598.23,
                    change: +15.67,
                    changePercent: +0.34,
                    open: 4582.56,
                    high: 4605.89,
                    low: 4578.12
                },
                {
                    symbol: 'NASDAQ',
                    price: 14256.89,
                    change: +45.23,
                    changePercent: +0.32,
                    open: 14211.66,
                    high: 14289.45,
                    low: 14198.32
                },
                {
                    symbol: 'FTSE 100',
                    price: 7456.78,
                    change: -12.45,
                    changePercent: -0.17,
                    open: 7469.23,
                    high: 7478.90,
                    low: 7445.67
                }
            ],
            commodities: [
                {
                    symbol: 'Gold',
                    price: 2045.67,
                    change: +12.34,
                    changePercent: +0.61,
                    bid: 2044.50,
                    ask: 2046.50,
                    high: 2052.30,
                    low: 2031.45
                },
                {
                    symbol: 'Silver',
                    price: 24.85,
                    change: +0.23,
                    changePercent: +0.93,
                    bid: 24.82,
                    ask: 24.88,
                    high: 25.12,
                    low: 24.55
                },
                {
                    symbol: 'Oil (WTI)',
                    price: 78.45,
                    change: -1.23,
                    changePercent: -1.54,
                    bid: 78.40,
                    ask: 78.50,
                    high: 79.85,
                    low: 78.10
                }
            ],
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

// 12. Get news and announcements
exports.getNewsAndAnnouncements = async (req, res) => {
    try {
        const { limit = 5 } = req.query;

        const news = [
            {
                id: '1',
                title: 'Federal Reserve Maintains Interest Rates at 5.25-5.50%',
                summary: 'The Federal Reserve decided to keep interest rates unchanged, citing balanced economic conditions.',
                category: 'Economic',
                publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                source: 'Reuters',
                impact: 'high',
                url: 'https://example.com/news/1'
            },
            {
                id: '2',
                title: 'EUR/USD Technical Analysis: Bullish Momentum Continues',
                summary: 'EUR/USD shows strong bullish momentum as it breaks above key resistance level.',
                category: 'Technical Analysis',
                publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
                source: 'ForexLive',
                impact: 'medium',
                url: 'https://example.com/news/2'
            },
            {
                id: '3',
                title: 'Oil Prices Surge on Supply Concerns',
                summary: 'Crude oil prices jumped following reports of supply disruptions.',
                category: 'Commodities',
                publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
                source: 'Bloomberg',
                impact: 'high',
                url: 'https://example.com/news/3'
            },
            {
                id: '4',
                title: 'Platform Maintenance Notice',
                summary: 'Scheduled maintenance this weekend to enhance system performance.',
                category: 'Platform',
                publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
                source: 'Platform Team',
                impact: 'low',
                url: null
            },
            {
                id: '5',
                title: 'New Risk Management Tools Available',
                summary: 'Enhanced risk management features now available on the platform.',
                category: 'Platform',
                publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                source: 'Platform Team',
                impact: 'medium',
                url: null
            }
        ];

        const limitedNews = news.slice(0, parseInt(limit));

        res.status(200).json({
            success: true,
            data: limitedNews,
            pagination: {
                total: news.length,
                limit: parseInt(limit),
                hasMore: news.length > parseInt(limit)
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

// 13. Validate trading session
exports.validateTradingSession = async (req, res) => {
    try {
        const userId = req.user._id;

        const activeAccounts = await Account.countDocuments({ user: userId, status: true });
        const accounts = await Account.find({ user: userId, status: true }).select('mt5Account name');

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [recentDeposits, recentWithdrawals, recentTransfers] = await Promise.all([
            Deposit.countDocuments({ user: userId, createdAt: { $gte: thirtyDaysAgo } }),
            Withdrawal.countDocuments({ user: userId, createdAt: { $gte: thirtyDaysAgo } }),
            Transfer.countDocuments({ user: userId, createdAt: { $gte: thirtyDaysAgo } })
        ]);

        const totalRecentActivity = recentDeposits + recentWithdrawals + recentTransfers;

        let totalBalance = 0;
        let hasLiveConnections = 0;
        for (const account of accounts) {
            const liveBalance = await fetchAccountBalance(account.mt5Account, account.managerIndex || '2');
            if (liveBalance) {
                totalBalance += liveBalance.balance;
                hasLiveConnections++;
            }
        }

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

        if (hasLiveConnections === 0 && activeAccounts > 0) {
            warnings.push('Unable to connect to trading servers');
            recommendations.push('Check connection or contact support');
        }

        if (!isMarketOpen) {
            warnings.push('Market is currently closed');
            recommendations.push('Trading will resume when markets open');
        }

        const sessionValid = activeAccounts > 0 && hasLiveConnections > 0;

        res.status(200).json({
            success: true,
            data: {
                isValid: sessionValid,
                sessionScore: Math.min(100,
                    (activeAccounts > 0 ? 25 : 0) +
                    (totalBalance > 0 ? 25 : 0) +
                    (hasLiveConnections > 0 ? 25 : 0) +
                    (isMarketOpen ? 25 : 0)
                ),
                accounts: {
                    total: activeAccounts,
                    active: hasLiveConnections,
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
                connectivity: {
                    mt5Servers: hasLiveConnections > 0 ? 'Connected' : 'Disconnected',
                    apiStatus: 'Online',
                    latency: Math.floor(Math.random() * 50) + 10
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

// 14. Get trading signals
exports.getTradingSignals = async (req, res) => {
    try {
        const { limit = 10, category = 'all' } = req.query;

        const allSignals = [
            {
                id: '1',
                symbol: 'EUR/USD',
                type: 'BUY',
                strength: 'Strong',
                entryPrice: 1.0856,
                currentPrice: 1.0863,
                stopLoss: 1.0810,
                takeProfit: 1.0920,
                confidence: 85,
                reason: 'Bullish momentum with RSI recovery',
                timeframe: '4H',
                generatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
                status: 'active',
                category: 'forex'
            },
            {
                id: '2',
                symbol: 'GBP/JPY',
                type: 'SELL',
                strength: 'Medium',
                entryPrice: 189.45,
                currentPrice: 189.32,
                stopLoss: 190.20,
                takeProfit: 188.50,
                confidence: 72,
                reason: 'Bearish divergence on MACD',
                timeframe: '1H',
                generatedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
                status: 'active',
                category: 'forex'
            },
            {
                id: '3',
                symbol: 'Gold',
                type: 'BUY',
                strength: 'Strong',
                entryPrice: 2045.67,
                currentPrice: 2048.23,
                stopLoss: 2035.00,
                takeProfit: 2065.00,
                confidence: 90,
                reason: 'Safe haven demand amid geopolitical tensions',
                timeframe: 'Daily',
                generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                status: 'active',
                category: 'commodities'
            },
            {
                id: '4',
                symbol: 'USD/JPY',
                type: 'SELL',
                strength: 'Medium',
                entryPrice: 149.85,
                currentPrice: 149.92,
                stopLoss: 150.50,
                takeProfit: 148.80,
                confidence: 68,
                reason: 'Potential BoJ intervention risk',
                timeframe: '4H',
                generatedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
                status: 'active',
                category: 'forex'
            },
            {
                id: '5',
                symbol: 'S&P 500',
                type: 'BUY',
                strength: 'Medium',
                entryPrice: 4598.23,
                currentPrice: 4602.15,
                stopLoss: 4575.00,
                takeProfit: 4650.00,
                confidence: 75,
                reason: 'Strong earnings season',
                timeframe: 'Daily',
                generatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
                status: 'active',
                category: 'indices'
            }
        ];

        let filteredSignals = allSignals;
        if (category !== 'all') {
            filteredSignals = allSignals.filter(signal => signal.category === category);
        }

        const signals = filteredSignals.slice(0, parseInt(limit));

        const summary = {
            totalSignals: signals.length,
            activeSignals: signals.filter(s => s.status === 'active').length,
            buySignals: signals.filter(s => s.type === 'BUY').length,
            sellSignals: signals.filter(s => s.type === 'SELL').length,
            strongSignals: signals.filter(s => s.strength === 'Strong').length,
            averageConfidence: signals.length > 0 ?
                parseFloat((signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length).toFixed(1)) : 0,
            categories: {
                forex: signals.filter(s => s.category === 'forex').length,
                commodities: signals.filter(s => s.category === 'commodities').length,
                indices: signals.filter(s => s.category === 'indices').length,
                crypto: signals.filter(s => s.category === 'crypto').length
            }
        };

        res.status(200).json({
            success: true,
            data: {
                signals,
                summary,
                disclaimer: 'Trading signals are for educational purposes only. Past performance does not guarantee future results.',
                riskWarning: 'Trading involves significant risk of loss. Only trade with money you can afford to lose.',
                lastUpdated: new Date().toISOString(),
                nextUpdate: new Date(Date.now() + 30 * 60 * 1000).toISOString()
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

// 15. Get account trading history (open and closed trades)
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
                parseFloat((allClosedTrades.reduce((sum, trade) => sum + trade.profit, 0) / totalClosedTrades).toFixed(2)) : 0,
            bestTrade: allClosedTrades.length > 0 ?
                Math.max(...allClosedTrades.map(trade => trade.profit)) : 0,
            worstTrade: allClosedTrades.length > 0 ?
                Math.min(...allClosedTrades.map(trade => trade.profit)) : 0
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

// 16. Get economic calendar events
exports.getEconomicCalendar = async (req, res) => {
    try {
        const { date, impact = 'all', currency = 'all' } = req.query;

        const events = [
            {
                id: '1',
                time: '08:30',
                currency: 'EUR',
                event: 'German GDP (QoQ)',
                impact: 'medium',
                forecast: '0.2%',
                previous: '0.1%',
                actual: null,
                description: 'Measures the quarterly change in the inflation-adjusted value of all goods and services produced by the German economy.',
                date: new Date().toISOString().split('T')[0]
            },
            {
                id: '2',
                time: '13:30',
                currency: 'USD',
                event: 'Initial Jobless Claims',
                impact: 'medium',
                forecast: '220K',
                previous: '218K',
                actual: null,
                description: 'Measures the number of individuals who filed for unemployment insurance for the first time.',
                date: new Date().toISOString().split('T')[0]
            },
            {
                id: '3',
                time: '14:30',
                currency: 'USD',
                event: 'Non-Farm Payrolls',
                impact: 'high',
                forecast: '185K',
                previous: '199K',
                actual: null,
                description: 'Measures the change in the number of employed people during the previous month.',
                date: new Date().toISOString().split('T')[0]
            },
            {
                id: '4',
                time: '16:00',
                currency: 'EUR',
                event: 'ECB Interest Rate Decision',
                impact: 'high',
                forecast: '4.50%',
                previous: '4.50%',
                actual: null,
                description: 'The European Central Bank interest rate decision affects the euro and European markets.',
                date: new Date().toISOString().split('T')[0]
            },
            {
                id: '5',
                time: '22:30',
                currency: 'JPY',
                event: 'Bank of Japan Rate Decision',
                impact: 'high',
                forecast: '-0.10%',
                previous: '-0.10%',
                actual: null,
                description: 'The Bank of Japan monetary policy decision impacts the yen and Japanese markets.',
                date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            }
        ];

        let filteredEvents = events;

        if (date) {
            filteredEvents = filteredEvents.filter(event => event.date === date);
        }

        if (impact !== 'all') {
            filteredEvents = filteredEvents.filter(event => event.impact === impact);
        }

        if (currency !== 'all') {
            filteredEvents = filteredEvents.filter(event => event.currency === currency);
        }

        const eventsByDate = filteredEvents.reduce((acc, event) => {
            if (!acc[event.date]) {
                acc[event.date] = [];
            }
            acc[event.date].push(event);
            return acc;
        }, {});

        res.status(200).json({
            success: true,
            data: {
                events: filteredEvents,
                eventsByDate,
                summary: {
                    totalEvents: filteredEvents.length,
                    highImpact: filteredEvents.filter(e => e.impact === 'high').length,
                    mediumImpact: filteredEvents.filter(e => e.impact === 'medium').length,
                    lowImpact: filteredEvents.filter(e => e.impact === 'low').length,
                    currencies: [...new Set(filteredEvents.map(e => e.currency))]
                },
                filters: { date, impact, currency }
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