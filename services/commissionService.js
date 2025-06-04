// Backend/services/commissionService.js - Debug Version
const axios = require('axios');
const IBClosedTrade = require('../models/IBClosedTrade');
const IBCommission = require('../models/IBCommission');
const IBClientConfiguration = require('../models/client/IBClientConfiguration');
const IBAdminConfiguration = require('../models/admin/IBAdminConfiguration');
const Account = require('../models/client/Account');
const Group = require('../models/Group');
const User = require('../models/User');

class CommissionService {
    constructor() {
        this.isProcessing = false;
        this.apiBaseUrl = 'https://api.infoapi.biz/api/mt5';
        this.debugMode = true; // Enable detailed logging
    }

    // Start the automatic commission processing
    startAutomaticProcessing() {
        console.log('🚀 Starting automatic commission processing...');

        // First, let's test database connectivity
        this.testDatabaseConnectivity();

        // Process immediately
        setTimeout(() => {
            this.processCommissions();
        }, 30000); // Wait 30 seconds after server start

        // Then process every 30 seconds for debugging (change back to 10000 later)
        setInterval(() => {
            this.processCommissions();
        }, 300000);
    }

    // Test database connectivity
    async testDatabaseConnectivity() {
        try {
            console.log('🔍 Testing database connectivity...');

            // Test Account model
            const accountCount = await Account.countDocuments();
            console.log(`📊 Found ${accountCount} accounts in database`);

            // Test IBClientConfiguration model
            const ibConfigCount = await IBClientConfiguration.countDocuments();
            console.log(`📊 Found ${ibConfigCount} IB configurations in database`);

            // Test Group model
            const groupCount = await Group.countDocuments();
            console.log(`📊 Found ${groupCount} groups in database`);

            // Test if we can create a test record in IBClosedTrade
            console.log('🧪 Testing IBClosedTrade model...');
            const testTrade = {
                mt5Account: 'TEST123',
                userId: '507f1f77bcf86cd799439011', // Dummy ObjectId
                positionId: 999999999,
                ticket: 999999999,
                symbol: 'TESTPAIR',
                openPrice: 1.0000,
                closePrice: 1.0001,
                openTime: new Date(),
                closeTime: new Date(),
                profit: 1.0,
                volume: 0.01,
                groupName: 'TEST',
                processed: false
            };

            // Try to create and immediately delete test record
            const testRecord = new IBClosedTrade(testTrade);
            await testRecord.validate();
            console.log('✅ IBClosedTrade model validation passed');

            console.log('✅ Database connectivity test completed');

        } catch (error) {
            console.error('❌ Database connectivity test failed:', error);
        }
    }

    // Main processing function
    async processCommissions() {
        if (this.isProcessing) {
            console.log('⏳ Commission processing already in progress, skipping...');
            return;
        }

        try {
            this.isProcessing = true;
            console.log('📊 Starting commission processing cycle...', new Date().toISOString());

            // Step 1: Fetch and store closed trades
            await this.fetchAndStoreClosedTrades();

            // Step 2: Process commissions for unprocessed trades
            await this.calculateAndStoreCommissions();

            console.log('✅ Commission processing cycle completed', new Date().toISOString());
        } catch (error) {
            console.error('❌ Error in commission processing:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    // Fetch closed trades from external API and store in database
    async fetchAndStoreClosedTrades() {
        try {
            console.log('🔄 Fetching closed trades from external API...');

            // Get all accounts with their user and group information
            const accounts = await Account.find({ status: true })
                .populate('user', 'firstname lastname email')
                .lean();

            console.log(`📋 Database query result: Found ${accounts.length} active accounts`);

            if (accounts.length === 0) {
                console.log('ℹ️ No active accounts found in database');

                // Let's check if there are any accounts at all
                const totalAccounts = await Account.countDocuments();
                console.log(`📊 Total accounts in database (including inactive): ${totalAccounts}`);

                if (totalAccounts > 0) {
                    const sampleAccount = await Account.findOne().populate('user').lean();
                    console.log('📄 Sample account structure:', {
                        _id: sampleAccount._id,
                        mt5Account: sampleAccount.mt5Account,
                        status: sampleAccount.status,
                        groupName: sampleAccount.groupName,
                        managerIndex: sampleAccount.managerIndex,
                        user: sampleAccount.user ? {
                            _id: sampleAccount.user._id,
                            email: sampleAccount.user.email
                        } : 'NULL'
                    });
                }
                return;
            }

            // Log account details for debugging
            console.log('📄 Active accounts found:', accounts.map(acc => ({
                mt5Account: acc.mt5Account,
                managerIndex: acc.managerIndex,
                groupName: acc.groupName,
                userId: acc.user?._id,
                userEmail: acc.user?.email
            })));

            // Get all manager indices for API calls
            const managerIndices = [...new Set(accounts.map(acc => acc.managerIndex))];
            console.log('🎯 Manager indices to query:', managerIndices);

            for (const managerIndex of managerIndices) {
                await this.fetchTradesForManager(managerIndex, accounts);
            }

        } catch (error) {
            console.error('❌ Error fetching closed trades:', error);
            throw error;
        }
    }

    // Fetch trades for a specific manager
    async fetchTradesForManager(managerIndex, accounts) {
        try {
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - (30 * 24 * 60 * 60 * 1000)); // Last 7 days for testing

            const startTimeStr = this.formatDateForAPI(startTime);
            const endTimeStr = this.formatDateForAPI(endTime);

            const apiUrl = `${this.apiBaseUrl}/GetCloseTradeAllUsers?Manager_Index=${managerIndex}&StartTime=${startTimeStr}&EndTime=${endTimeStr}`;

            console.log(`🌐 API URL: ${apiUrl}`);
            console.log(`🌐 Fetching trades for Manager ${managerIndex}...`);

            const response = await axios.get(apiUrl, {
                timeout: 300000,
                headers: {
                    'User-Agent': 'Commission-Service/1.0'
                }
            });

            console.log(`📡 API Response Status: ${response.status}`);
            console.log(`📡 API Response Headers:`, response.headers);

            if (!response.data) {
                console.log(`⚠️ No data received for Manager ${managerIndex}`);
                return;
            }

            if (!Array.isArray(response.data)) {
                console.log(`⚠️ Invalid data format for Manager ${managerIndex}:`, typeof response.data);
                console.log(`📄 Raw response:`, response.data);
                return;
            }

            console.log(`📈 Received ${response.data.length} trades for Manager ${managerIndex}`);

            // Log first trade for debugging
            if (response.data.length > 0) {
                console.log('📄 Sample trade from API:', response.data[0]);
            }

            // Filter trades for accounts in our database
            const accountMap = new Map();
            accounts.filter(acc => acc.managerIndex === managerIndex).forEach(acc => {
                accountMap.set(acc.mt5Account, acc);
                accountMap.set(acc.mt5Account.toString(), acc); // Also add string version
            });

            console.log(`🎯 Accounts to match for Manager ${managerIndex}:`, Array.from(accountMap.keys()));

            const relevantTrades = response.data.filter(trade => {
                const mt5Account = trade.MT5Account?.toString();
                const isRelevant = accountMap.has(mt5Account);
                if (this.debugMode && !isRelevant) {
                    console.log(`⏭️ Skipping trade for account ${mt5Account} (not in our database)`);
                }
                return isRelevant;
            });

            console.log(`🎯 Found ${relevantTrades.length} relevant trades for our accounts`);

            if (relevantTrades.length > 0) {
                console.log('📄 Sample relevant trade:', relevantTrades[0]);
            }

            // Store relevant trades in database
            let storedCount = 0;
            for (const trade of relevantTrades) {
                const stored = await this.storeSingleTrade(trade, accountMap.get(trade.MT5Account.toString()));
                if (stored) storedCount++;
            }

            console.log(`💾 Successfully stored ${storedCount} new trades for Manager ${managerIndex}`);

        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.error(`⏰ Timeout fetching trades for Manager ${managerIndex}`);
            } else if (error.response) {
                console.error(`❌ API Error for Manager ${managerIndex}:`, {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    data: error.response.data
                });
            } else if (error.request) {
                console.error(`❌ Network Error for Manager ${managerIndex}:`, error.message);
            } else {
                console.error(`❌ Error fetching trades for Manager ${managerIndex}:`, error.message);
            }
        }
    }

    // Store a single trade in database
    async storeSingleTrade(apiTrade, accountInfo) {
        try {
            // Check if trade already exists
            const existingTrade = await IBClosedTrade.findOne({
                positionId: apiTrade.PositionId
            });

            if (existingTrade) {
                if (this.debugMode) {
                    console.log(`⏭️ Trade ${apiTrade.PositionId} already exists, skipping`);
                }
                return false;
            }

            // Parse dates from API format
            const openTime = this.parseAPIDate(apiTrade.Open_Time);
            const closeTime = this.parseAPIDate(apiTrade.Close_Time);

            const tradeData = {
                mt5Account: apiTrade.MT5Account.toString(),
                userId: accountInfo.user._id,
                positionId: apiTrade.PositionId,
                ticket: apiTrade.Ticket,
                symbol: apiTrade.Symbol,
                openPrice: apiTrade.Open_Price,
                closePrice: apiTrade.Close_Price,
                openTime: openTime,
                closeTime: closeTime,
                profit: apiTrade.Profit,
                volume: apiTrade.Lot,
                commission: apiTrade.Commission || 0,
                swap: apiTrade.Swap || 0,
                comment: apiTrade.Comment || '',
                groupName: accountInfo.groupName,
                processed: false
            };

            console.log(`💾 Attempting to store trade:`, {
                positionId: tradeData.positionId,
                mt5Account: tradeData.mt5Account,
                symbol: tradeData.symbol,
                volume: tradeData.volume,
                userId: tradeData.userId,
                groupName: tradeData.groupName
            });

            const newTrade = await IBClosedTrade.create(tradeData);
            console.log(`✅ Successfully stored trade ${apiTrade.PositionId} with ID: ${newTrade._id}`);

            return true;

        } catch (error) {
            if (error.code === 11000) {
                console.log(`⏭️ Duplicate trade ${apiTrade.PositionId}, skipping`);
                return false;
            }
            console.error(`❌ Error storing trade ${apiTrade.PositionId}:`, {
                message: error.message,
                stack: error.stack
            });
            return false;
        }
    }

    // Calculate and store commissions for unprocessed trades
    async calculateAndStoreCommissions() {
        try {
            console.log('🧮 Calculating commissions for unprocessed trades...');

            // Get all unprocessed trades
            const unprocessedTrades = await IBClosedTrade.find({ processed: false })
                .populate('userId', 'firstname lastname email')
                .lean();

            console.log(`📊 Found ${unprocessedTrades.length} unprocessed trades`);

            if (unprocessedTrades.length === 0) {
                // Check total trades in database
                const totalTrades = await IBClosedTrade.countDocuments();
                console.log(`📊 Total trades in database: ${totalTrades}`);

                if (totalTrades > 0) {
                    const processedCount = await IBClosedTrade.countDocuments({ processed: true });
                    console.log(`📊 Processed trades: ${processedCount}, Unprocessed: ${totalTrades - processedCount}`);
                }
                return;
            }

            console.log('📄 Sample unprocessed trade:', {
                _id: unprocessedTrades[0]._id,
                mt5Account: unprocessedTrades[0].mt5Account,
                userId: unprocessedTrades[0].userId,
                symbol: unprocessedTrades[0].symbol,
                volume: unprocessedTrades[0].volume
            });

            let processedCount = 0;
            for (const trade of unprocessedTrades) {
                const result = await this.calculateCommissionForTrade(trade);
                if (result) processedCount++;
            }

            console.log(`✅ Successfully processed commissions for ${processedCount} trades`);

        } catch (error) {
            console.error('❌ Error calculating commissions:', error);
            throw error;
        }
    }

    // Calculate commission for a single trade
    async calculateCommissionForTrade(trade) {
        try {
            console.log(`🔍 Processing trade ${trade.positionId} for user ${trade.userId._id}`);

            // Get the trader's IB configuration
            const traderIBConfig = await IBClientConfiguration.findOne({
                userId: trade.userId._id
            }).lean();

            if (!traderIBConfig) {
                console.log(`ℹ️ No IB config found for user ${trade.userId.email}, marking trade as processed`);
                await IBClosedTrade.findByIdAndUpdate(trade._id, { processed: true });
                return true;
            }

            console.log(`📋 Trader IB Config:`, {
                _id: traderIBConfig._id,
                level: traderIBConfig.level,
                parent: traderIBConfig.parent,
                referralCode: traderIBConfig.referralCode
            });

            // Get all upline IB configurations (parents)
            const uplineConfigs = await this.getAllUplineConfigs(traderIBConfig);
            console.log(`👥 Found ${uplineConfigs.length} upline configurations`);

            if (uplineConfigs.length === 0) {
                console.log(`ℹ️ No uplines found for trade ${trade.positionId}, marking as processed`);
                await IBClosedTrade.findByIdAndUpdate(trade._id, { processed: true });
                return true;
            }

            // Calculate commission for each upline
            let commissionsCreated = 0;
            for (const uplineConfig of uplineConfigs) {
                const result = await this.calculateCommissionForUpline(trade, traderIBConfig, uplineConfig);
                if (result) commissionsCreated++;
            }

            // Mark trade as processed
            await IBClosedTrade.findByIdAndUpdate(trade._id, { processed: true });
            console.log(`✅ Processed trade ${trade.positionId}, created ${commissionsCreated} commission records`);

            return true;

        } catch (error) {
            console.error(`❌ Error calculating commission for trade ${trade.positionId}:`, error);
            return false;
        }
    }

    // Get all upline configurations for a trader
    async getAllUplineConfigs(traderConfig) {
        const uplines = [];
        let currentConfig = traderConfig;
        let depth = 0;
        const maxDepth = 10; // Prevent infinite loops

        console.log(`🔍 Getting upline configs starting from level ${traderConfig.level}`);

        while (currentConfig && currentConfig.parent && depth < maxDepth) {
            depth++;
            console.log(`🔍 Looking for parent: ${currentConfig.parent}`);

            const parentConfig = await IBClientConfiguration.findById(currentConfig.parent)
                .populate('userId', 'firstname lastname email')
                .lean();

            if (parentConfig) {
                console.log(`👤 Found upline at level ${parentConfig.level}: ${parentConfig.userId.email}`);
                uplines.push(parentConfig);
                currentConfig = parentConfig;
            } else {
                console.log(`⚠️ Parent config not found for ID: ${currentConfig.parent}`);
                break;
            }
        }

        console.log(`📊 Total uplines found: ${uplines.length}`);
        return uplines;
    }

    // Calculate commission for a specific upline
    async calculateCommissionForUpline(trade, traderConfig, uplineConfig) {
        try {
            // Calculate level difference
            const levelDifference = traderConfig.level - uplineConfig.level;
            console.log(`📊 Level difference: ${traderConfig.level} - ${uplineConfig.level} = ${levelDifference}`);

            if (levelDifference <= 0) {
                console.log(`⚠️ Invalid level difference: ${levelDifference}`);
                return false;
            }

            // Get group value from trade's group name
            const group = await Group.findOne({ name: trade.groupName }).lean();
            if (!group) {
                console.error(`❌ Group not found for name: ${trade.groupName}`);
                return false;
            }

            console.log(`📋 Group found:`, { _id: group._id, name: group.name, value: group.value });

            // Get bonus per lot from admin configuration
            const adminConfig = await IBAdminConfiguration.findOne({
                groupId: group._id,
                level: levelDifference
            }).lean();

            if (!adminConfig) {
                console.log(`⚠️ No admin config found for group ${group.value} level ${levelDifference}`);
                return false;
            }

            console.log(`📋 Admin config found:`, {
                groupId: adminConfig.groupId,
                level: adminConfig.level,
                bonusPerLot: adminConfig.bonusPerLot
            });

            // Calculate rebate
            const rebate = trade.volume * adminConfig.bonusPerLot;
            console.log(`💰 Commission calculation: ${trade.volume} × ${adminConfig.bonusPerLot} = ${rebate}`);

            // Check if commission already exists for this trade and upline
            const existingCommission = await IBCommission.findOne({
                tradeId: trade._id,
                ibConfigurationId: uplineConfig._id
            });

            if (existingCommission) {
                console.log(`⏭️ Commission already exists for trade ${trade.positionId} and upline ${uplineConfig.userId.email}`);
                return false;
            }

            // Create commission record
            const commissionData = {
                ibConfigurationId: uplineConfig._id,
                clientId: trade.userId._id,
                tradeId: trade._id,
                mt5Account: trade.mt5Account,
                positionId: trade.positionId,
                symbol: trade.symbol,
                openTime: trade.openTime,
                closeTime: trade.closeTime,
                openPrice: trade.openPrice,
                closePrice: trade.closePrice,
                profit: trade.profit,
                volume: trade.volume,
                baseAmount: trade.volume,
                rebate: rebate,
                commissionAmount: rebate,
                level: levelDifference,
                bonusPerLot: adminConfig.bonusPerLot,
                groupName: trade.groupName,
                status: 'pending'
            };

            console.log(`💾 Creating commission record:`, {
                uplineEmail: uplineConfig.userId.email,
                amount: rebate,
                level: levelDifference,
                tradeId: trade._id
            });

            const newCommission = await IBCommission.create(commissionData);
            console.log(`✅ Created commission ${rebate.toFixed(4)} for upline ${uplineConfig.userId.email} with ID: ${newCommission._id}`);

            return true;

        } catch (error) {
            if (error.code === 11000) {
                console.log(`⏭️ Duplicate commission for trade ${trade.positionId} and upline ${uplineConfig.userId.email}`);
                return false;
            }
            console.error(`❌ Error creating commission for upline:`, error);
            return false;
        }
    }

    // Utility function to format date for API
    formatDateForAPI(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    // Parse API date format to JavaScript Date
    parseAPIDate(apiDateString) {
        try {
            // API format: "2025.05.31 14:00:37"
            const [datePart, timePart] = apiDateString.split(' ');
            const [year, month, day] = datePart.split('.');
            const [hours, minutes, seconds] = timePart.split(':');

            return new Date(
                parseInt(year),
                parseInt(month) - 1, // Month is 0-indexed
                parseInt(day),
                parseInt(hours),
                parseInt(minutes),
                parseInt(seconds)
            );
        } catch (error) {
            console.error(`❌ Error parsing date: ${apiDateString}`, error);
            return new Date(); // Return current date as fallback
        }
    }
}

module.exports = new CommissionService();