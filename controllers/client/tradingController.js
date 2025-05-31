// Backend/controllers/client/tradingController.js
const axios = require('axios');
const Account = require('../../models/client/Account');

// Cache to store trading data and reduce API calls
const tradingDataCache = new Map();
const CACHE_DURATION = 2000; // 2 seconds

// Helper function to fetch data from external API
const fetchExternalTradeData = async (mt5Account, managerIndex, type = 'open') => {
    try {
        let url;
        if (type === 'open') {
            url = `https://api.infoapi.biz/api/mt5/GetOpenTradeByAccount?Manager_Index=${managerIndex}&MT5Accont=${mt5Account}`;
        } else {
            // For closed trades, get trades from last 30 days
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);

            const startTime = startDate.toISOString().slice(0, 19).replace('T', ' ');
            const endTime = endDate.toISOString().slice(0, 19).replace('T', ' ');

            url = `https://api.infoapi.biz/api/mt5/GetCloseTradeAll?Manager_Index=${managerIndex}&MT5Accont=${mt5Account}&StartTime=${encodeURIComponent(startTime)}&EndTime=${encodeURIComponent(endTime)}`;
        }

        const response = await axios.get(url, {
            timeout: 10000, // 10 second timeout
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // Enhanced response validation
        console.log(`API Response for ${type} trades (${mt5Account}):`, {
            status: response.status,
            dataType: typeof response.data,
            isArray: Array.isArray(response.data),
            data: response.data
        });

        // Handle different response formats
        let trades = [];

        if (response.data) {
            if (Array.isArray(response.data)) {
                trades = response.data;
            } else if (typeof response.data === 'object') {
                // Check if the data is wrapped in another property
                if (response.data.data && Array.isArray(response.data.data)) {
                    trades = response.data.data;
                } else if (response.data.trades && Array.isArray(response.data.trades)) {
                    trades = response.data.trades;
                } else if (response.data.result && Array.isArray(response.data.result)) {
                    trades = response.data.result;
                } else {
                    console.warn(`Unexpected response format for ${type} trades:`, response.data);
                    trades = [];
                }
            }
        }

        return trades;

    } catch (error) {
        console.error(`Error fetching ${type} trades for account ${mt5Account}:`, {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data
        });
        return [];
    }
};

// Helper function to determine trade type based on order flags
const getTradeType = (trade, type) => {
    if (type === 'open') {
        // For open trades: BUY_SELL = 0 means Buy, BUY_SELL = 1 means Sell
        return trade.BUY_SELL === 0 ? 'Buy' : 'Sell';
    } else {
        // For closed trades: uTradeFlag = 0 means Buy, uTradeFlag = 1 means Sell
        return trade.uTradeFlag === 0 ? 'Buy' : 'Sell';
    }
};

// Helper function to format trade data
const formatTradeData = (trade, type = 'open', accountInfo = {}) => {
    const baseData = {
        account: trade.MT5Account?.toString() || 'N/A',
        accountName: accountInfo.name || 'Unknown',
        accountType: accountInfo.accountType || 'Unknown',
        groupName: accountInfo.groupName || 'Unknown',
        leverage: accountInfo.leverage || 0,
        symbol: trade.Symbol || 'N/A',
        openTime: trade.Open_Time || 'N/A',
        openPrice: trade.Open_Price?.toString() || 'N/A',
        trade: getTradeType(trade, type),
        tradeType: getTradeType(trade, type).toLowerCase(),
        volume: trade.Lot?.toString() || '0.00',
        lotSize: trade.Lot || 0,
        profit: trade.Profit ? parseFloat(trade.Profit.toFixed(2)) : 0,
        profitFormatted: trade.Profit ? (trade.Profit >= 0 ? `+$${trade.Profit.toFixed(2)}` : `-$${Math.abs(trade.Profit).toFixed(2)}`) : '$0.00',
        status: type,
        ticket: trade.Ticket?.toString() || 'N/A',
        ticketNumber: trade.Ticket || 0,
        commission: trade.Commission || 0,
        swap: trade.Swap || 0,
        stopLoss: trade.Stop_Loss || 0,
        takeProfit: trade.Target_Price || 0,
        comment: trade.Comment || '',
        taxes: trade.Taxes || 0,
    };

    if (type === 'open') {
        baseData.currentPrice = trade.Price_Current?.toString() || 'N/A';
        baseData.currentPriceValue = trade.Price_Current || 0;
        baseData.openTimeSec = trade.Open_Time_Sec || 0;
        baseData.volumeTotal = trade.Volume || 0;
    } else {
        baseData.closeTime = trade.Close_Time || 'N/A';
        baseData.closePrice = trade.Close_Price?.toString() || 'N/A';
        baseData.closePriceValue = trade.Close_Price || 0;
        baseData.positionId = trade.PositionId || 0;
        baseData.timestamp = trade.Timestamp || 0;
        baseData.openTimeSec = trade.Open_Time_Sec || 0;
        baseData.uPosStatus = trade.uPosStatus || 0;
        baseData.uTradeFlag = trade.uTradeFlag;
        baseData.oBSFlag = trade.oBSFlag || 0;
    }

    return baseData;
};

// Get user's MT5 accounts
const getUserAccounts = async (userId) => {
    try {
        const accounts = await Account.find({ user: userId, status: true })
            .select('mt5Account managerIndex name accountType groupName leverage');
        return accounts;
    } catch (error) {
        console.error('Error fetching user accounts:', error);
        return [];
    }
};

// Calculate trade statistics
const calculateTradeStats = (openTrades, closedTrades) => {
    const stats = {
        totalOpenTrades: openTrades.length,
        totalClosedTrades: closedTrades.length,
        totalTrades: openTrades.length + closedTrades.length,
        openTradesProfit: openTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0),
        closedTradesProfit: closedTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0),
        totalProfit: 0,
        profitableTrades: closedTrades.filter(trade => trade.profit > 0).length,
        losingTrades: closedTrades.filter(trade => trade.profit < 0).length,
        totalCommission: [...openTrades, ...closedTrades].reduce((sum, trade) => sum + (trade.commission || 0), 0),
        totalSwap: [...openTrades, ...closedTrades].reduce((sum, trade) => sum + (trade.swap || 0), 0),
        symbols: [...new Set([...openTrades, ...closedTrades].map(trade => trade.symbol))],
        buyTrades: [...openTrades, ...closedTrades].filter(trade => trade.tradeType === 'buy').length,
        sellTrades: [...openTrades, ...closedTrades].filter(trade => trade.tradeType === 'sell').length,
    };

    stats.totalProfit = stats.openTradesProfit + stats.closedTradesProfit;
    stats.winRate = stats.totalClosedTrades > 0 ? ((stats.profitableTrades / stats.totalClosedTrades) * 100).toFixed(2) : 0;

    return stats;
};

// Get all trades (open + closed) for authenticated user
exports.getUserTrades = async (req, res) => {
    try {
        const userId = req.user._id;
        const cacheKey = `trades_${userId}`;

        console.log('Fetching trades for user:', userId);

        // Check cache first
        const cachedData = tradingDataCache.get(cacheKey);
        if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_DURATION) {
            console.log('Returning cached trade data');
            return res.status(200).json({
                success: true,
                data: cachedData.data,
                cached: true,
                timestamp: cachedData.timestamp
            });
        }

        // Get user's MT5 accounts
        const accounts = await getUserAccounts(userId);
        console.log('Found accounts:', accounts.length);

        if (accounts.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    openTrades: [],
                    closedTrades: [],
                    totalOpenTrades: 0,
                    totalClosedTrades: 0,
                    accountsCount: 0,
                    statistics: calculateTradeStats([], []),
                    accounts: []
                },
                message: 'No MT5 accounts found'
            });
        }

        // Fetch trades for all accounts
        const allOpenTrades = [];
        const allClosedTrades = [];

        const promises = accounts.map(async (account) => {
            const accountInfo = {
                name: account.name,
                accountType: account.accountType,
                groupName: account.groupName,
                leverage: account.leverage
            };

            try {
                // Fetch open trades with proper error handling
                const openTrades = await fetchExternalTradeData(
                    account.mt5Account,
                    account.managerIndex || '1',
                    'open'
                );

                // Fetch closed trades with proper error handling
                const closedTrades = await fetchExternalTradeData(
                    account.mt5Account,
                    account.managerIndex || '1',
                    'closed'
                );

                // Ensure we have arrays before calling forEach
                if (Array.isArray(openTrades)) {
                    openTrades.forEach(trade => {
                        allOpenTrades.push(formatTradeData(trade, 'open', accountInfo));
                    });
                } else {
                    console.warn(`Open trades not an array for account ${account.mt5Account}:`, openTrades);
                }

                if (Array.isArray(closedTrades)) {
                    closedTrades.forEach(trade => {
                        allClosedTrades.push(formatTradeData(trade, 'closed', accountInfo));
                    });
                } else {
                    console.warn(`Closed trades not an array for account ${account.mt5Account}:`, closedTrades);
                }

            } catch (error) {
                console.error(`Error processing trades for account ${account.mt5Account}:`, error);
                // Continue with other accounts even if one fails
            }
        });

        await Promise.all(promises);

        // Sort trades by time (most recent first)
        allOpenTrades.sort((a, b) => new Date(b.openTime) - new Date(a.openTime));
        allClosedTrades.sort((a, b) => new Date(b.closeTime || b.openTime) - new Date(a.closeTime || a.openTime));

        // Calculate statistics
        const statistics = calculateTradeStats(allOpenTrades, allClosedTrades);

        const responseData = {
            openTrades: allOpenTrades,
            closedTrades: allClosedTrades,
            totalOpenTrades: allOpenTrades.length,
            totalClosedTrades: allClosedTrades.length,
            accountsCount: accounts.length,
            statistics,
            accounts: accounts.map(acc => ({
                mt5Account: acc.mt5Account,
                name: acc.name,
                accountType: acc.accountType,
                groupName: acc.groupName,
                leverage: acc.leverage
            }))
        };

        // Update cache
        tradingDataCache.set(cacheKey, {
            data: responseData,
            timestamp: Date.now()
        });

        // Clean old cache entries (optional)
        setTimeout(() => {
            tradingDataCache.delete(cacheKey);
        }, CACHE_DURATION * 2);

        res.status(200).json({
            success: true,
            data: responseData,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error in getUserTrades:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch trading data',
            error: error.message
        });
    }
};

// Get only open trades for authenticated user
exports.getUserOpenTrades = async (req, res) => {
    try {
        const userId = req.user._id;
        console.log('Fetching open trades for user:', userId);

        const accounts = await getUserAccounts(userId);

        if (accounts.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    trades: [],
                    total: 0,
                    totalProfit: 0,
                    accounts: []
                },
                message: 'No MT5 accounts found'
            });
        }

        const allOpenTrades = [];

        const promises = accounts.map(async (account) => {
            const accountInfo = {
                name: account.name,
                accountType: account.accountType,
                groupName: account.groupName,
                leverage: account.leverage
            };

            try {
                const openTrades = await fetchExternalTradeData(
                    account.mt5Account,
                    account.managerIndex || '1',
                    'open'
                );

                if (Array.isArray(openTrades)) {
                    openTrades.forEach(trade => {
                        allOpenTrades.push(formatTradeData(trade, 'open', accountInfo));
                    });
                } else {
                    console.warn(`Open trades not an array for account ${account.mt5Account}:`, openTrades);
                }
            } catch (error) {
                console.error(`Error processing open trades for account ${account.mt5Account}:`, error);
            }
        });

        await Promise.all(promises);
        allOpenTrades.sort((a, b) => new Date(b.openTime) - new Date(a.openTime));

        const totalProfit = allOpenTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);

        res.status(200).json({
            success: true,
            data: {
                trades: allOpenTrades,
                total: allOpenTrades.length,
                totalProfit: parseFloat(totalProfit.toFixed(2)),
                totalProfitFormatted: totalProfit >= 0 ? `+$${totalProfit.toFixed(2)}` : `-$${Math.abs(totalProfit).toFixed(2)}`,
                accounts: accounts.map(acc => ({
                    mt5Account: acc.mt5Account,
                    name: acc.name,
                    accountType: acc.accountType
                }))
            },
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error in getUserOpenTrades:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch open trades',
            error: error.message
        });
    }
};

// Get only closed trades for authenticated user
exports.getUserClosedTrades = async (req, res) => {
    try {
        const userId = req.user._id;
        console.log('Fetching closed trades for user:', userId);

        const accounts = await getUserAccounts(userId);

        if (accounts.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    trades: [],
                    total: 0,
                    totalProfit: 0,
                    profitableTrades: 0,
                    losingTrades: 0,
                    winRate: 0,
                    accounts: []
                },
                message: 'No MT5 accounts found'
            });
        }

        const allClosedTrades = [];

        const promises = accounts.map(async (account) => {
            const accountInfo = {
                name: account.name,
                accountType: account.accountType,
                groupName: account.groupName,
                leverage: account.leverage
            };

            try {
                const closedTrades = await fetchExternalTradeData(
                    account.mt5Account,
                    account.managerIndex || '1',
                    'closed'
                );

                if (Array.isArray(closedTrades)) {
                    closedTrades.forEach(trade => {
                        allClosedTrades.push(formatTradeData(trade, 'closed', accountInfo));
                    });
                } else {
                    console.warn(`Closed trades not an array for account ${account.mt5Account}:`, closedTrades);
                }
            } catch (error) {
                console.error(`Error processing closed trades for account ${account.mt5Account}:`, error);
            }
        });

        await Promise.all(promises);
        allClosedTrades.sort((a, b) => new Date(b.closeTime || b.openTime) - new Date(a.closeTime || a.openTime));

        const totalProfit = allClosedTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);
        const profitableTrades = allClosedTrades.filter(trade => trade.profit > 0).length;
        const losingTrades = allClosedTrades.filter(trade => trade.profit < 0).length;
        const winRate = allClosedTrades.length > 0 ? ((profitableTrades / allClosedTrades.length) * 100).toFixed(2) : 0;

        res.status(200).json({
            success: true,
            data: {
                trades: allClosedTrades,
                total: allClosedTrades.length,
                totalProfit: parseFloat(totalProfit.toFixed(2)),
                totalProfitFormatted: totalProfit >= 0 ? `+$${totalProfit.toFixed(2)}` : `-$${Math.abs(totalProfit).toFixed(2)}`,
                profitableTrades,
                losingTrades,
                winRate: parseFloat(winRate),
                accounts: accounts.map(acc => ({
                    mt5Account: acc.mt5Account,
                    name: acc.name,
                    accountType: acc.accountType
                }))
            },
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error in getUserClosedTrades:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch closed trades',
            error: error.message
        });
    }
};