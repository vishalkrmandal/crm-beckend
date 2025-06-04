// Backend/services/tradeSyncService.js - Production version with configurable time range
const axios = require('axios');
const IBClosedTrades = require('../models/IBClosedTrade'); // Fixed: was IBClosedTrade
const Account = require('../models/client/Account');
const IBCommission = require('../models/IBCommission');
const IBClientConfiguration = require('../models/client/IBClientConfiguration');
const IBAdminConfiguration = require('../models/admin/IBAdminConfiguration'); // Fixed: was admin/IBAdminConfiguration
const Group = require('../models/Group');
const User = require('../models/User');

class TradeSyncService {
    constructor() {
        this.isProcessing = false;
        this.lastSyncTime = new Date();
        this.managerIndexes = ['1']; // Add all your manager indexes
        this.apiBaseUrl = 'https://api.infoapi.biz/api/mt5';

        // Configuration for different sync modes
        this.syncModes = {
            INITIAL_SETUP: 365, // days - for initial setup to get all historical trades
            REGULAR_SYNC: 1,    // days - for regular ongoing sync
            MANUAL_RANGE: null  // will be set manually if needed
        };

        this.currentSyncMode = 'INITIAL_SETUP'; // Change this after initial setup
    }

    async startAutoSync() {
        console.log('🔄 Starting automated trade sync service...');
        console.log(`📅 Current sync mode: ${this.currentSyncMode}`);

        // Initial sync
        await this.syncTrades();

        // Schedule every 10 seconds
        setInterval(async () => {
            try {
                await this.syncTrades();
            } catch (error) {
                console.error('❌ Auto sync error:', error);
            }
        }, 10000);
    }

    // Method to change sync mode
    setSyncMode(mode, customDays = null) {
        this.currentSyncMode = mode;
        if (mode === 'MANUAL_RANGE' && customDays) {
            this.syncModes.MANUAL_RANGE = customDays;
        }
        console.log(`🔧 Sync mode changed to: ${mode}`);
    }

    // Method to switch to regular sync after initial setup
    switchToRegularSync() {
        this.currentSyncMode = 'REGULAR_SYNC';
        console.log('🔄 Switched to regular sync mode (24 hours)');
    }

    async syncTrades() {
        if (this.isProcessing) {
            console.log('⏳ Sync already in progress, skipping...');
            return;
        }

        this.isProcessing = true;
        const batchId = `batch_${Date.now()}`;

        try {
            console.log('🔄 Starting trade sync at:', new Date().toISOString());
            console.log(`📅 Sync mode: ${this.currentSyncMode}`);

            // Get all valid MT5 accounts from our database
            const accounts = await Account.find({}).populate('user', 'firstname lastname email');
            const validMT5Accounts = accounts.map(acc => acc.mt5Account);

            if (validMT5Accounts.length === 0) {
                console.log('⚠️ No valid MT5 accounts found');
                return;
            }

            console.log(`📊 Found ${validMT5Accounts.length} valid MT5 accounts`);

            // Fetch trades from external API for each manager
            let allNewTrades = [];

            for (const managerIndex of this.managerIndexes) {
                const trades = await this.fetchTradesFromAPI(managerIndex);
                if (trades && trades.length > 0) {
                    // Filter trades for valid accounts only
                    const validTrades = trades.filter(trade =>
                        validMT5Accounts.includes(trade.MT5Account.toString())
                    );
                    allNewTrades = allNewTrades.concat(validTrades);
                }
            }

            if (allNewTrades.length === 0) {
                console.log('✅ No new trades found');
                return;
            }

            console.log(`📈 Found ${allNewTrades.length} potential new trades`);

            // Process and store new trades
            const storedTrades = await this.processAndStoreTrades(allNewTrades);

            if (storedTrades.length > 0) {
                console.log(`💾 Stored ${storedTrades.length} new trades`);

                // Calculate commissions for new trades
                await this.calculateCommissions(storedTrades, batchId);

                // After successful initial setup, consider switching to regular sync
                if (this.currentSyncMode === 'INITIAL_SETUP' && storedTrades.length < 100) {
                    console.log('💡 Consider switching to regular sync mode with: tradeSyncService.switchToRegularSync()');
                }
            }

            this.lastSyncTime = new Date();
            console.log('✅ Trade sync completed successfully');

        } catch (error) {
            console.error('❌ Trade sync error:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async fetchTradesFromAPI(managerIndex) {
        try {
            // Calculate time range based on sync mode
            const endTime = new Date();
            let daysToFetch;

            switch (this.currentSyncMode) {
                case 'INITIAL_SETUP':
                    daysToFetch = this.syncModes.INITIAL_SETUP;
                    break;
                case 'REGULAR_SYNC':
                    daysToFetch = this.syncModes.REGULAR_SYNC;
                    break;
                case 'MANUAL_RANGE':
                    daysToFetch = this.syncModes.MANUAL_RANGE;
                    break;
                default:
                    daysToFetch = 1; // fallback
            }

            const startTime = new Date(endTime.getTime() - (daysToFetch * 24 * 60 * 60 * 1000));

            const startTimeStr = this.formatDateForAPI(startTime);
            const endTimeStr = this.formatDateForAPI(endTime);

            const url = `${this.apiBaseUrl}/GetCloseTradeAllUsers`;
            const params = {
                Manager_Index: managerIndex,
                StartTime: startTimeStr,
                EndTime: endTimeStr
            };

            console.log(`📡 Fetching trades from API for Manager ${managerIndex}...`);
            console.log(`📅 Time range: ${startTimeStr} to ${endTimeStr} (${daysToFetch} days - ${this.currentSyncMode} mode)`);

            const response = await axios.get(url, {
                params,
                timeout: 30000 // 30 second timeout
            });

            if (response.data && Array.isArray(response.data)) {
                console.log(`📊 API returned ${response.data.length} trades for Manager ${managerIndex}`);
                return response.data;
            }

            return [];
        } catch (error) {
            console.error(`❌ API fetch error for Manager ${managerIndex}:`, error.message);
            return [];
        }
    }

    formatDateForAPI(date) {
        return date.toISOString()
            .replace('T', ' ')
            .replace(/\.\d{3}Z$/, '');
    }

    async processAndStoreTrades(apiTrades) {
        const storedTrades = [];

        for (const apiTrade of apiTrades) {
            try {
                // Check if trade already exists
                const existingTrade = await IBClosedTrades.findOne({
                    positionId: apiTrade.PositionId.toString()
                });

                if (existingTrade) {
                    continue; // Skip already processed trade
                }

                // Convert API data to our schema
                const tradeData = {
                    mt5Account: apiTrade.MT5Account.toString(),
                    positionId: apiTrade.PositionId.toString(),
                    ticket: apiTrade.Ticket.toString(),
                    symbol: apiTrade.Symbol,
                    openTime: this.parseAPIDate(apiTrade.Open_Time),
                    closeTime: this.parseAPIDate(apiTrade.Close_Time),
                    openPrice: parseFloat(apiTrade.Open_Price),
                    closePrice: parseFloat(apiTrade.Close_Price),
                    profit: parseFloat(apiTrade.Profit),
                    volume: parseFloat(apiTrade.Lot),
                    commission: parseFloat(apiTrade.Commission || 0),
                    swap: parseFloat(apiTrade.Swap || 0),
                    comment: apiTrade.Comment || '',
                    stopLoss: parseFloat(apiTrade.Stop_Loss || 0),
                    targetPrice: parseFloat(apiTrade.Target_Price || 0),
                    taxes: parseFloat(apiTrade.Taxes || 0),
                    oBSFlag: parseInt(apiTrade.oBSFlag || 0),
                    uPosStatus: parseInt(apiTrade.uPosStatus || 0),
                    uTradeFlag: parseInt(apiTrade.uTradeFlag || 0),
                    timestamp: parseInt(apiTrade.Timestamp),
                    openTimeSec: parseInt(apiTrade.Open_Time_Sec),
                    commissionProcessed: false
                };

                // Save to database
                const savedTrade = await IBClosedTrades.create(tradeData);
                storedTrades.push(savedTrade);

                console.log(`💾 Stored trade: ${savedTrade.symbol} - ${savedTrade.mt5Account} - $${savedTrade.profit}`);

            } catch (error) {
                console.error('❌ Error processing trade:', error);
            }
        }

        return storedTrades;
    }

    parseAPIDate(dateString) {
        // Convert "2025.05.31 14:00:37" to JavaScript Date
        const [datePart, timePart] = dateString.split(' ');
        const [year, month, day] = datePart.split('.');
        const formattedDate = `${year}-${month}-${day} ${timePart}`;
        return new Date(formattedDate);
    }

    async calculateCommissions(trades, batchId) {
        console.log(`💰 Calculating commissions for ${trades.length} trades...`);

        for (const trade of trades) {
            try {
                console.log(`🔄 Processing trade ${trade._id} for MT5 account: ${trade.mt5Account}`);
                await this.processTradeCommissions(trade, batchId);

                // Mark trade as processed
                await IBClosedTrades.findByIdAndUpdate(trade._id, {
                    commissionProcessed: true,
                    processedAt: new Date()
                });

            } catch (error) {
                console.error(`❌ Error calculating commission for trade ${trade._id}:`, error);
            }
        }
    }

    async processTradeCommissions(trade, batchId) {
        // Find the account and user who made this trade
        const account = await Account.findOne({ mt5Account: trade.mt5Account })
            .populate('user');

        if (!account || !account.user) {
            console.log(`⚠️ No account/user found for MT5 account: ${trade.mt5Account}`);
            return;
        }

        console.log(`👤 Found account for user: ${account.user.email}, group: ${account.groupName}`);

        // Find the IB configuration for this user
        const clientIBConfig = await IBClientConfiguration.findOne({
            userId: account.user._id
        });

        if (!clientIBConfig) {
            console.log(`⚠️ No IB configuration found for user: ${account.user.email}`);
            return;
        }

        console.log(`🔗 Found IB config for user: ${account.user.email}, level: ${clientIBConfig.level}, parent: ${clientIBConfig.parent ? 'Yes' : 'No'}`);

        // Get the hierarchy chain (all parents up to root)
        const hierarchy = await this.getHierarchyChain(clientIBConfig);

        if (hierarchy.length === 0) {
            console.log(`⚠️ No hierarchy found for user: ${account.user.email} (this user is likely at the top level with no parents)`);
            return;
        }

        console.log(`🔗 Processing hierarchy chain of ${hierarchy.length} levels for user: ${account.user.email}`);

        // Calculate commission for each level in the hierarchy
        for (let i = 0; i < hierarchy.length; i++) {
            const ibConfig = hierarchy[i];
            const level = i + 1; // Level 1, 2, 3, etc.

            try {
                console.log(`💰 Creating commission for level ${level}, IB: ${ibConfig.userId.email}`);
                await this.createCommissionRecord(
                    trade,
                    account,
                    ibConfig,
                    level,
                    batchId
                );
            } catch (error) {
                console.error(`❌ Error creating commission record for level ${level}:`, error);
            }
        }
    }

    async getHierarchyChain(clientIBConfig) {
        const hierarchy = [];
        let currentConfig = clientIBConfig;

        console.log(`🔍 Building hierarchy chain starting from user ID: ${clientIBConfig.userId}`);

        // Traverse up the hierarchy
        while (currentConfig && currentConfig.parent) {
            const parentConfig = await IBClientConfiguration.findById(currentConfig.parent)
                .populate('userId', 'firstname lastname email');

            if (parentConfig) {
                console.log(`📈 Found parent: ${parentConfig.userId.email}, level: ${parentConfig.level}`);
                hierarchy.push(parentConfig);
                currentConfig = parentConfig;
            } else {
                console.log(`⚠️ Parent config not found for ID: ${currentConfig.parent}`);
                break;
            }
        }

        console.log(`📊 Final hierarchy chain length: ${hierarchy.length}`);
        return hierarchy;
    }

    async createCommissionRecord(trade, account, ibConfig, level, batchId) {
        try {
            // Check if commission record already exists for this trade + IB + level
            const existingCommission = await IBCommission.findOne({
                tradeId: trade._id,
                ibUserId: ibConfig.userId._id,
                level: level
            });

            if (existingCommission) {
                console.log(`ℹ️ Commission already exists for trade ${trade._id}, IB ${ibConfig.userId.email}, level ${level}`);
                return existingCommission;
            }

            // Get the account type/group for commission calculation
            console.log(`🔍 Looking for group with value: ${account.groupName}`);
            const group = await Group.findOne({ value: account.groupName });

            if (!group) {
                console.log(`⚠️ No group found for groupName: ${account.groupName}`);
                // List all available groups for debugging
                const allGroups = await Group.find({}, 'name value');
                console.log(`📋 Available groups:`, allGroups.map(g => `${g.name} (${g.value})`));
                return;
            }

            console.log(`✅ Found group: ${group.name} (${group.value})`);

            // Find the admin configuration for this group and level
            console.log(`🔍 Looking for admin config - Group ID: ${group._id}, Level: ${level}`);
            const adminConfig = await IBAdminConfiguration.findOne({
                groupId: group._id,
                level: level
            });

            if (!adminConfig) {
                console.log(`⚠️ No admin configuration found for group: ${group.name}, level: ${level}`);
                // List all available admin configs for this group
                const allAdminConfigs = await IBAdminConfiguration.find({ groupId: group._id });
                console.log(`📋 Available admin configs for this group:`, allAdminConfigs.map(ac => `Level ${ac.level}: $${ac.bonusPerLot}/lot`));
                return;
            }

            console.log(`✅ Found admin config: Level ${adminConfig.level}, Bonus: $${adminConfig.bonusPerLot}/lot`);

            // Calculate commission amount
            const commissionAmount = adminConfig.bonusPerLot * trade.volume;

            console.log(`💵 Calculating commission: $${adminConfig.bonusPerLot} × ${trade.volume} lots = $${commissionAmount}`);

            // Create commission record
            const commissionData = {
                tradeId: trade._id,
                clientId: account.user._id,
                clientMT5Account: trade.mt5Account,
                ibUserId: ibConfig.userId._id,
                ibConfigurationId: ibConfig._id,
                level: level,
                bonusPerLot: adminConfig.bonusPerLot,
                volume: trade.volume,
                commissionAmount: commissionAmount,
                symbol: trade.symbol,
                profit: trade.profit,
                openTime: trade.openTime,
                closeTime: trade.closeTime,
                openPrice: trade.openPrice,
                closePrice: trade.closePrice,
                baseAmount: Math.abs(trade.profit), // Use absolute profit as base amount
                groupName: account.groupName,
                status: 'confirmed',
                batchId: batchId
            };

            const commission = await IBCommission.create(commissionData);

            console.log(`💰 ✅ Created commission: $${commissionAmount.toFixed(4)} for ${ibConfig.userId.email} (Level ${level})`);

            return commission;

        } catch (error) {
            // If it's a duplicate key error, it means another process already created this commission
            if (error.code === 11000) {
                console.log(`ℹ️ Commission already exists (duplicate prevented) for trade ${trade._id}, IB ${ibConfig.userId.email}, level ${level}`);
                return null;
            }
            throw error; // Re-throw other errors
        }
    }

    // Utility method to get sync status
    getSyncStatus() {
        return {
            isProcessing: this.isProcessing,
            lastSyncTime: this.lastSyncTime,
            nextSyncIn: this.isProcessing ? 'Processing...' : '10 seconds',
            syncMode: this.currentSyncMode,
            daysRange: this.syncModes[this.currentSyncMode]
        };
    }

    // Method to manually process specific date range
    async processDateRange(startDate, endDate) {
        console.log(`🔄 Manual processing for date range: ${startDate} to ${endDate}`);

        const customDays = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
        this.setSyncMode('MANUAL_RANGE', customDays);

        await this.syncTrades();

        // Reset to previous mode
        this.setSyncMode('INITIAL_SETUP');
    }
}

module.exports = new TradeSyncService();