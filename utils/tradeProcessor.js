// backend/utils/tradeProcessor.js
const cron = require('node-cron');
const axios = require('axios');
const Account = require('../models/client/Account');
const IBClientConfiguration = require('../models/client/IBClientConfiguration');
const IBAdminConfiguration = require('../models/admin/IBAdminConfiguration');
const IBClosedTrade = require('../models/IBClosedTrade');
const IBCommission = require('../models/IBCommission');
const Group = require('../models/Group');

// Helper function to fetch trades from external API
const fetchClosedTrades = async (managerIndex, startTime, endTime) => {
    try {
        const response = await axios.get(`https://api.infoapi.biz/api/mt5/GetCloseTradeAllUsers`, {
            params: {
                Manager_Index: managerIndex,
                StartTime: startTime,
                EndTime: endTime
            },
            timeout: 30000 // 30 seconds timeout
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching closed trades:', error);
        throw error;
    }
};

// Helper function to get all upline configurations
const getUplineConfigurations = async (ibConfigId) => {
    const uplines = [];
    let currentConfig = await IBClientConfiguration.findById(ibConfigId).populate('parent');

    while (currentConfig && currentConfig.parent) {
        uplines.push(currentConfig.parent);
        currentConfig = await IBClientConfiguration.findById(currentConfig.parent._id).populate('parent');
    }

    return uplines;
};

// Helper function to calculate commission for individual trades
const calculateTradeCommission = async (trade, traderConfig) => {
    try {
        // Get group information
        const account = await Account.findOne({ mt5Account: trade.mt5Account });
        if (!account) {
            console.log(`Account not found for MT5 account: ${trade.mt5Account}`);
            return null;
        }

        const group = await Group.findOne({ value: account.groupName });
        if (!group) {
            console.log(`Group not found for group name: ${account.groupName}`);
            return null;
        }

        // Get the trader's level to find appropriate bonus rate
        const adminConfig = await IBAdminConfiguration.findOne({
            groupId: group._id,
            level: traderConfig.level
        });

        if (!adminConfig) {
            console.log(`Admin config not found for group ${group._id} and level ${traderConfig.level}`);
            return null;
        }

        // Calculate commission for this individual trade
        const commissionAmount = trade.lot * adminConfig.bonusPerLot;

        return {
            ibConfigurationId: traderConfig._id,
            clientId: traderConfig.userId,
            tradeId: null, // Will be set after saving the trade
            mt5Account: trade.mt5Account,
            symbol: trade.symbol,
            volume: trade.lot,
            baseAmount: trade.lot,
            level: traderConfig.level,
            bonusPerLot: adminConfig.bonusPerLot,
            commissionAmount: commissionAmount,
            groupValue: group.value,
            tradeProfit: trade.profit,
            openTime: new Date(trade.openTime),
            closeTime: new Date(trade.closeTime),
            openPrice: trade.openPrice,
            closePrice: trade.closePrice
        };
    } catch (error) {
        console.error('Error calculating trade commission:', error);
        return null;
    }
};

// Main function to process trades
const processClosedTradesAutomated = async () => {
    try {
        console.log('🔄 Starting automated trade processing...');

        // Get all unique manager indexes from accounts
        const managerIndexes = await Account.distinct('managerIndex');

        if (managerIndexes.length === 0) {
            console.log('ℹ️ No manager indexes found in accounts');
            return;
        }

        // Get all accounts with IB configurations
        const ibConfigs = await IBClientConfiguration.find({ status: 'active' })
            .populate('userId');

        const userAccounts = await Account.find({
            user: { $in: ibConfigs.map(config => config.userId._id) }
        });

        if (userAccounts.length === 0) {
            console.log('ℹ️ No IB accounts found to process');
            return;
        }

        // Process each manager index
        for (const managerIndex of managerIndexes) {
            try {
                console.log(`📊 Processing trades for manager index: ${managerIndex}`);

                // Get trades from last 24 hours
                const endTime = new Date();
                const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

                const startTimeStr = startTime.toISOString().replace('T', ' ').substring(0, 19);
                const endTimeStr = endTime.toISOString().replace('T', ' ').substring(0, 19);

                console.log(`⏰ Fetching trades from ${startTimeStr} to ${endTimeStr}`);

                // Fetch closed trades from external API
                const externalTrades = await fetchClosedTrades(managerIndex, startTimeStr, endTimeStr);

                if (!externalTrades || externalTrades.length === 0) {
                    console.log(`ℹ️ No trades found for manager index ${managerIndex}`);
                    continue;
                }

                let processedTrades = 0;
                let totalCommissions = 0;

                // Process each external trade
                for (const externalTrade of externalTrades) {
                    try {
                        // Check if trade already exists
                        const existingTrade = await IBClosedTrade.findOne({
                            positionId: externalTrade.PositionId.toString()
                        });

                        if (existingTrade) {
                            continue; // Skip already processed trades
                        }

                        // Find matching account
                        const matchingAccount = userAccounts.find(
                            account => account.mt5Account === externalTrade.MT5Account.toString()
                        );

                        if (!matchingAccount) {
                            continue; // Skip trades for non-IB accounts
                        }

                        // Find trader's IB configuration
                        const traderConfig = ibConfigs.find(
                            config => config.userId._id.toString() === matchingAccount.user.toString()
                        );

                        if (!traderConfig) {
                            continue; // Skip if no IB configuration found
                        }

                        // Create new trade record
                        const newTrade = new IBClosedTrade({
                            positionId: externalTrade.PositionId.toString(),
                            mt5Account: externalTrade.MT5Account.toString(),
                            userId: matchingAccount.user,
                            symbol: externalTrade.Symbol,
                            openTime: new Date(externalTrade.Open_Time),
                            closeTime: new Date(externalTrade.Close_Time),
                            openPrice: externalTrade.Open_Price,
                            closePrice: externalTrade.Close_Price,
                            lot: externalTrade.Lot,
                            profit: externalTrade.Profit,
                            commission: externalTrade.Commission || 0,
                            swap: externalTrade.Swap || 0,
                            comment: externalTrade.Comment || '',
                            groupName: matchingAccount.groupName,
                            managerIndex: managerIndex,
                            processed: true
                        });

                        const savedTrade = await newTrade.save();
                        processedTrades++;

                        // Calculate commission for this individual trade
                        const commissionData = await calculateTradeCommission({
                            mt5Account: externalTrade.MT5Account.toString(),
                            symbol: externalTrade.Symbol,
                            openTime: externalTrade.Open_Time,
                            closeTime: externalTrade.Close_Time,
                            openPrice: externalTrade.Open_Price,
                            closePrice: externalTrade.Close_Price,
                            lot: externalTrade.Lot,
                            profit: externalTrade.Profit
                        }, traderConfig);

                        // Save commission if calculated successfully
                        if (commissionData) {
                            commissionData.tradeId = savedTrade._id;
                            const commission = new IBCommission(commissionData);
                            await commission.save();
                            totalCommissions++;
                        }

                    } catch (error) {
                        console.error('❌ Error processing trade:', externalTrade.PositionId, error);
                        continue;
                    }
                }

                console.log(`✅ Manager ${managerIndex}: Processed ${processedTrades} trades, generated ${totalCommissions} commissions`);

            } catch (error) {
                console.error(`❌ Error processing manager index ${managerIndex}:`, error);
                continue;
            }
        }

        console.log('✅ Automated trade processing completed successfully');

    } catch (error) {
        console.error('❌ Fatal error in automated trade processing:', error);
    }
};

// Schedule the cron job to run every hour
const startTradeProcessor = () => {
    console.log('🚀 Starting trade processor cron job...');

    // Run every hour at minute 0
    cron.schedule('0 * * * *', async () => {
        console.log('⏰ Trade processor cron job triggered');
        await processClosedTradesAutomated();
    }, {
        scheduled: true,
        timezone: "UTC"
    });

    // Also run a daily cleanup at midnight
    cron.schedule('0 0 * * *', async () => {
        console.log('🧹 Running daily cleanup...');
        try {
            // Clean up old unprocessed trades (older than 7 days)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const deletedCount = await IBClosedTrade.deleteMany({
                processed: false,
                createdAt: { $lt: sevenDaysAgo }
            });

            console.log(`🗑️ Cleaned up ${deletedCount.deletedCount} old unprocessed trades`);
        } catch (error) {
            console.error('❌ Error during daily cleanup:', error);
        }
    }, {
        scheduled: true,
        timezone: "UTC"
    });

    console.log('✅ Trade processor cron jobs scheduled successfully');
    console.log('📅 Hourly processing: Every hour at minute 0');
    console.log('📅 Daily cleanup: Every day at midnight UTC');
};

// Function to manually trigger trade processing (for testing)
const manualProcessTrades = async (startTime, endTime, managerIndex = '1') => {
    try {
        console.log('🔧 Manual trade processing triggered...');

        const startTimeStr = new Date(startTime).toISOString().replace('T', ' ').substring(0, 19);
        const endTimeStr = new Date(endTime).toISOString().replace('T', ' ').substring(0, 19);

        console.log(`⏰ Processing trades from ${startTimeStr} to ${endTimeStr} for manager ${managerIndex}`);

        // Get all accounts with IB configurations
        const ibConfigs = await IBClientConfiguration.find({ status: 'active' })
            .populate('userId');

        const userAccounts = await Account.find({
            user: { $in: ibConfigs.map(config => config.userId._id) }
        });

        if (userAccounts.length === 0) {
            console.log('ℹ️ No IB accounts found to process');
            return { processed: 0, commissions: 0 };
        }

        // Fetch closed trades from external API
        const externalTrades = await fetchClosedTrades(managerIndex, startTimeStr, endTimeStr);

        if (!externalTrades || externalTrades.length === 0) {
            console.log('ℹ️ No trades found from external API');
            return { processed: 0, commissions: 0 };
        }

        let processedTrades = 0;
        let totalCommissions = 0;

        // Process each external trade
        for (const externalTrade of externalTrades) {
            try {
                // Check if trade already exists
                const existingTrade = await IBClosedTrade.findOne({
                    positionId: externalTrade.PositionId.toString()
                });

                if (existingTrade) {
                    continue; // Skip already processed trades
                }

                // Find matching account
                const matchingAccount = userAccounts.find(
                    account => account.mt5Account === externalTrade.MT5Account.toString()
                );

                if (!matchingAccount) {
                    continue; // Skip trades for non-IB accounts
                }

                // Find trader's IB configuration
                const traderConfig = ibConfigs.find(
                    config => config.userId._id.toString() === matchingAccount.user.toString()
                );

                if (!traderConfig) {
                    continue; // Skip if no IB configuration found
                }

                // Create new trade record
                const newTrade = new IBClosedTrade({
                    positionId: externalTrade.PositionId.toString(),
                    mt5Account: externalTrade.MT5Account.toString(),
                    userId: matchingAccount.user,
                    symbol: externalTrade.Symbol,
                    openTime: new Date(externalTrade.Open_Time),
                    closeTime: new Date(externalTrade.Close_Time),
                    openPrice: externalTrade.Open_Price,
                    closePrice: externalTrade.Close_Price,
                    lot: externalTrade.Lot,
                    profit: externalTrade.Profit,
                    commission: externalTrade.Commission || 0,
                    swap: externalTrade.Swap || 0,
                    comment: externalTrade.Comment || '',
                    groupName: matchingAccount.groupName,
                    managerIndex: managerIndex,
                    processed: true
                });

                const savedTrade = await newTrade.save();
                processedTrades++;

                // Calculate commissions for uplines
                const commissions = await calculateCommissions({
                    mt5Account: externalTrade.MT5Account.toString(),
                    symbol: externalTrade.Symbol,
                    openTime: externalTrade.Open_Time,
                    closeTime: externalTrade.Close_Time,
                    openPrice: externalTrade.Open_Price,
                    closePrice: externalTrade.Close_Price,
                    lot: externalTrade.Lot,
                    profit: externalTrade.Profit
                }, traderConfig);

                // Save commissions
                for (const commissionData of commissions) {
                    commissionData.tradeId = savedTrade._id;
                    const commission = new IBCommission(commissionData);
                    await commission.save();
                    totalCommissions++;
                }

            } catch (error) {
                console.error('❌ Error processing trade:', externalTrade.PositionId, error);
                continue;
            }
        }

        console.log(`✅ Manual processing completed: ${processedTrades} trades, ${totalCommissions} commissions`);
        return { processed: processedTrades, commissions: totalCommissions };

    } catch (error) {
        console.error('❌ Error in manual trade processing:', error);
        throw error;
    }
};

module.exports = {
    startTradeProcessor,
    manualProcessTrades,
    processClosedTradesAutomated
};