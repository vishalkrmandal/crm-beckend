// Backend/test-commission.js - Manual Test Script
// Run this file separately to test the commission system

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');

// Import models
const Account = require('./models/client/Account');
const IBClientConfiguration = require('./models/client/IBClientConfiguration');
const IBAdminConfiguration = require('./models/admin/IBAdminConfiguration');
const Group = require('./models/Group');
const User = require('./models/User');
const IBClosedTrade = require('./models/IBClosedTrade');
const IBCommission = require('./models/IBCommission');

async function runTests() {
    try {
        console.log('🔌 Connecting to database...');
        await connectDB();
        console.log('✅ Database connected');

        // Test 1: Check if models are working
        console.log('\n📊 Test 1: Model Connectivity');

        const accountCount = await Account.countDocuments();
        console.log(`📋 Accounts: ${accountCount}`);

        const userCount = await User.countDocuments();
        console.log(`👤 Users: ${userCount}`);

        const ibConfigCount = await IBClientConfiguration.countDocuments();
        console.log(`🔗 IB Configurations: ${ibConfigCount}`);

        const groupCount = await Group.countDocuments();
        console.log(`📂 Groups: ${groupCount}`);

        const adminConfigCount = await IBAdminConfiguration.countDocuments();
        console.log(`⚙️ Admin Configurations: ${adminConfigCount}`);

        // Test 2: Check data structure
        console.log('\n📊 Test 2: Data Structure');

        if (accountCount > 0) {
            const sampleAccount = await Account.findOne().populate('user').lean();
            console.log('📄 Sample Account:', {
                _id: sampleAccount._id,
                mt5Account: sampleAccount.mt5Account,
                status: sampleAccount.status,
                groupName: sampleAccount.groupName,
                managerIndex: sampleAccount.managerIndex,
                user: sampleAccount.user ? {
                    _id: sampleAccount.user._id,
                    email: sampleAccount.user.email,
                    firstname: sampleAccount.user.firstname,
                    lastname: sampleAccount.user.lastname
                } : 'No user populated'
            });
        }

        if (ibConfigCount > 0) {
            const sampleIBConfig = await IBClientConfiguration.findOne().populate('userId').lean();
            console.log('📄 Sample IB Config:', {
                _id: sampleIBConfig._id,
                userId: sampleIBConfig.userId ? sampleIBConfig.userId._id : 'No user',
                level: sampleIBConfig.level,
                parent: sampleIBConfig.parent,
                referralCode: sampleIBConfig.referralCode,
                status: sampleIBConfig.status
            });
        }

        if (groupCount > 0) {
            const sampleGroup = await Group.findOne().lean();
            console.log('📄 Sample Group:', {
                _id: sampleGroup._id,
                name: sampleGroup.name,
                value: sampleGroup.value,
                description: sampleGroup.description
            });
        }

        if (adminConfigCount > 0) {
            const sampleAdminConfig = await IBAdminConfiguration.findOne().populate('groupId').lean();
            console.log('📄 Sample Admin Config:', {
                _id: sampleAdminConfig._id,
                groupId: sampleAdminConfig.groupId,
                level: sampleAdminConfig.level,
                bonusPerLot: sampleAdminConfig.bonusPerLot
            });
        }

        // Test 3: Test IBClosedTrade model
        console.log('\n📊 Test 3: IBClosedTrade Model');

        try {
            const testTrade = new IBClosedTrade({
                mt5Account: 'TEST123456',
                userId: new mongoose.Types.ObjectId(),
                positionId: Math.floor(Math.random() * 1000000),
                ticket: Math.floor(Math.random() * 1000000),
                symbol: 'EURUSD.s',
                openPrice: 1.1000,
                closePrice: 1.1010,
                openTime: new Date(),
                closeTime: new Date(),
                profit: 10.0,
                volume: 0.1,
                groupName: 'Standard',
                processed: false
            });

            await testTrade.validate();
            console.log('✅ IBClosedTrade model validation passed');

            // Don't save the test trade, just validate
        } catch (error) {
            console.error('❌ IBClosedTrade model validation failed:', error.message);
        }

        // Test 4: Test IBCommission model
        console.log('\n📊 Test 4: IBCommission Model');

        try {
            const testCommission = new IBCommission({
                ibConfigurationId: new mongoose.Types.ObjectId(),
                clientId: new mongoose.Types.ObjectId(),
                tradeId: new mongoose.Types.ObjectId(),
                mt5Account: 'TEST123456',
                positionId: Math.floor(Math.random() * 1000000),
                symbol: 'EURUSD.s',
                openTime: new Date(),
                closeTime: new Date(),
                openPrice: 1.1000,
                closePrice: 1.1010,
                profit: 10.0,
                volume: 0.1,
                baseAmount: 0.1,
                rebate: 1.0,
                commissionAmount: 1.0,
                level: 1,
                bonusPerLot: 10.0,
                groupName: 'Standard',
                status: 'pending'
            });

            await testCommission.validate();
            console.log('✅ IBCommission model validation passed');

        } catch (error) {
            console.error('❌ IBCommission model validation failed:', error.message);
        }

        // Test 5: Check relationships
        console.log('\n📊 Test 5: Data Relationships');

        if (accountCount > 0 && ibConfigCount > 0) {
            // Check if any accounts have matching IB configurations
            const accountsWithIB = await Account.aggregate([
                {
                    $lookup: {
                        from: 'ibclientconfigurations',
                        localField: 'user',
                        foreignField: 'userId',
                        as: 'ibConfig'
                    }
                },
                {
                    $match: {
                        'ibConfig.0': { $exists: true }
                    }
                },
                {
                    $limit: 1
                }
            ]);

            if (accountsWithIB.length > 0) {
                console.log('✅ Found accounts with IB configurations');
                console.log('📄 Sample account with IB:', {
                    mt5Account: accountsWithIB[0].mt5Account,
                    ibConfigId: accountsWithIB[0].ibConfig[0]._id,
                    level: accountsWithIB[0].ibConfig[0].level
                });
            } else {
                console.log('⚠️ No accounts found with matching IB configurations');
                console.log('💡 This means no commissions will be calculated');
            }
        }

        // Test 6: Check if groups match account group names
        console.log('\n📊 Test 6: Group Matching');

        if (accountCount > 0 && groupCount > 0) {
            const distinctGroupNames = await Account.distinct('groupName');
            console.log('📋 Account group names:', distinctGroupNames);

            const groupNames = await Group.distinct('name');
            console.log('📋 Group table names:', groupNames);

            const matchingGroups = distinctGroupNames.filter(name => groupNames.includes(name));
            console.log('✅ Matching groups:', matchingGroups);

            const missingGroups = distinctGroupNames.filter(name => !groupNames.includes(name));
            if (missingGroups.length > 0) {
                console.log('⚠️ Missing groups in Group table:', missingGroups);
            }
        }

        // Test 7: Test external API (optional)
        console.log('\n📊 Test 7: External API Test');

        try {
            const axios = require('axios');
            const managerIndex = 1; // Test with manager index 1
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - (24 * 60 * 60 * 1000)); // Last 24 hours

            const formatDate = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            };

            const apiUrl = `https://api.infoapi.biz/api/mt5/GetCloseTradeAllUsers?Manager_Index=${managerIndex}&StartTime=${formatDate(startTime)}&EndTime=${formatDate(endTime)}`;

            console.log('🌐 Testing API call...');
            console.log('🔗 URL:', apiUrl);

            const response = await axios.get(apiUrl, { timeout: 10000 });

            console.log('✅ API response received');
            console.log('📊 Status:', response.status);
            console.log('📊 Data type:', typeof response.data);
            console.log('📊 Data length:', Array.isArray(response.data) ? response.data.length : 'Not an array');

            if (Array.isArray(response.data) && response.data.length > 0) {
                console.log('📄 Sample trade from API:', response.data[0]);
            }

        } catch (error) {
            console.error('❌ API test failed:', error.message);
            if (error.response) {
                console.error('📊 Response status:', error.response.status);
                console.error('📊 Response data:', error.response.data);
            }
        }

        // Test 8: Check existing trades
        console.log('\n📊 Test 8: Existing Data Check');

        const existingTrades = await IBClosedTrade.countDocuments();
        console.log(`📊 Existing IBClosedTrades: ${existingTrades}`);

        const existingCommissions = await IBCommission.countDocuments();
        console.log(`📊 Existing IBCommissions: ${existingCommissions}`);

        if (existingTrades > 0) {
            const sampleTrade = await IBClosedTrade.findOne().lean();
            console.log('📄 Sample existing trade:', {
                _id: sampleTrade._id,
                mt5Account: sampleTrade.mt5Account,
                symbol: sampleTrade.symbol,
                volume: sampleTrade.volume,
                processed: sampleTrade.processed
            });
        }

        console.log('\n✅ All tests completed!');
        console.log('\n📋 Summary:');
        console.log(`- Accounts: ${accountCount}`);
        console.log(`- IB Configurations: ${ibConfigCount}`);
        console.log(`- Groups: ${groupCount}`);
        console.log(`- Admin Configurations: ${adminConfigCount}`);
        console.log(`- Existing Trades: ${existingTrades}`);
        console.log(`- Existing Commissions: ${existingCommissions}`);

        // Recommendations
        console.log('\n💡 Recommendations:');

        if (accountCount === 0) {
            console.log('❌ No accounts found - Create accounts first');
        }

        if (ibConfigCount === 0) {
            console.log('❌ No IB configurations found - Set up referral system first');
        }

        if (adminConfigCount === 0) {
            console.log('❌ No admin configurations found - Set up commission rates first');
        }

        if (accountCount > 0 && ibConfigCount > 0 && adminConfigCount > 0) {
            console.log('✅ Basic setup looks good - Commission system should work');
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        mongoose.disconnect();
        console.log('🔌 Database disconnected');
        process.exit(0);
    }
}

// Run the tests
runTests();