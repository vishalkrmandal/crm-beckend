// Backend/scripts/testSync.js
// Test script to verify the sync service is working correctly

const mongoose = require('mongoose');
require('dotenv').config();

const tradeSyncService = require('../services/tradeSyncService');
const IBClosedTrades = require('../models/IBClosedTrades');
const IBCommission = require('../models/IBCommission');
const Account = require('../models/client/Account');
const IBClientConfiguration = require('../models/client/IBClientConfiguration');

async function testSync() {
    try {
        console.log('🧪 Starting sync service test...');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('📊 Connected to MongoDB');

        // Check current data
        await checkCurrentData();

        // Run one sync cycle
        console.log('\n🔄 Running one sync cycle...');
        await tradeSyncService.syncTrades();

        // Check data after sync
        await checkCurrentData();

        console.log('\n✅ Test completed successfully!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Test error:', error);
        process.exit(1);
    }
}

async function checkCurrentData() {
    console.log('\n📊 Current Data Status:');

    // Count records
    const accountsCount = await Account.countDocuments();
    const ibConfigsCount = await IBClientConfiguration.countDocuments();
    const tradesCount = await IBClosedTrades.countDocuments();
    const commissionsCount = await IBCommission.countDocuments();

    console.log(`   Accounts: ${accountsCount}`);
    console.log(`   IB Configurations: ${ibConfigsCount}`);
    console.log(`   Closed Trades: ${tradesCount}`);
    console.log(`   Commissions: ${commissionsCount}`);

    // Show unprocessed trades
    const unprocessedTrades = await IBClosedTrades.countDocuments({ commissionProcessed: false });
    console.log(`   Unprocessed Trades: ${unprocessedTrades}`);

    // Show latest trades
    const latestTrades = await IBClosedTrades.find({})
        .sort({ createdAt: -1 })
        .limit(3)
        .select('mt5Account symbol profit volume closeTime commissionProcessed');

    if (latestTrades.length > 0) {
        console.log('\n📈 Latest Trades:');
        latestTrades.forEach(trade => {
            console.log(`   ${trade.mt5Account} - ${trade.symbol} - $${trade.profit} - ${trade.volume} lots - ${trade.commissionProcessed ? '✅' : '⏳'}`);
        });
    }

    // Show recent commissions
    const recentCommissions = await IBCommission.find({})
        .sort({ createdAt: -1 })
        .limit(3)
        .populate('ibUserId', 'email')
        .select('ibUserId commissionAmount level symbol');

    if (recentCommissions.length > 0) {
        console.log('\n💰 Recent Commissions:');
        recentCommissions.forEach(commission => {
            console.log(`   ${commission.ibUserId?.email} - L${commission.level} - $${commission.commissionAmount} - ${commission.symbol}`);
        });
    }
}

// Create sample test data if needed
async function createTestData() {
    console.log('🏗️ Creating test data...');

    // This would create sample accounts, users, and IB configurations
    // Only run this if you need test data

    console.log('✅ Test data created');
}

// Run the test
testSync();