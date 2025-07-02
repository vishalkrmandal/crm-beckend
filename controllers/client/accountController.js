const Account = require('../../models/client/Account');
const User = require('../../models/User');
const Group = require('../../models/Group');
const axios = require('axios');

// Helper function to generate a random MT5 account with format YYMMDD + 3 random digits
const generateRandomMT5Account = () => {
    const today = new Date();
    const formattedDate = today.getFullYear().toString().slice(-2) +  // Last 2 digits of year
        String(today.getMonth() + 1).padStart(2, '0') + // Month (01-12)
        String(today.getDate()).padStart(2, '0'); // Date (01-31)

    // Generate random 3-digit number (100-999)
    const randomDigits = String(Math.floor(Math.random() * 900) + 100);

    return formattedDate + randomDigits;
};

// @desc    Create a new trading account
// @route   POST /api/accounts/create
// @access  Private
exports.createAccount = async (req, res) => {
    try {
        const { leverage, accountType, platform } = req.body;
        console.log("Req.body:", req.body);

        // Get user details
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Create account name from user first and last name
        const name = `${user.firstname} ${user.lastname}`;

        // Get Group details
        const group = await Group.findOne({ value: accountType });
        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Account Type not found'
            });
        }

        const accountName = group.name;
        console.log("accountName:", accountName);

        // Generate a random MT5 account number
        const mt5Account = generateRandomMT5Account();

        // Check if account already exists in our database
        const existingAccount = await Account.findOne({ mt5Account });
        if (existingAccount) {
            return res.status(409).json({
                success: false,
                message: 'Account number already exists. Please try again.'
            });
        }

        // Create payload for external API
        const externalAPIPayload = {
            Manager_Index: "1",
            MT5Account: mt5Account,
            Name: name,
            Leverage: leverage,
            Group_Name: accountType
        };

        // Call external API to create account
        let externalAPIResponse;
        try {
            externalAPIResponse = await axios.post(
                'https://api.infoapi.biz/api/mt5/Adduser',
                externalAPIPayload
            );
            console.log(externalAPIResponse.data);
            console.log(externalAPIResponse.data.status);

            if (externalAPIResponse.data.status !== 'success') {
                return res.status(400).json({
                    success: false,
                    message: 'Failed to create account in external system. Please try again.',
                    details: externalAPIResponse.data
                });
            }
        } catch (apiError) {
            console.error(`⚠️ Error in external API call: ${apiError.message}`);
            console.error(`Status: ${apiError.response?.status}, Data:`, apiError.response?.data);

            // Check if error is about duplicate account
            const errorMessage = apiError.response?.data?.ERR_Message || '';
            if (errorMessage.includes('User with the same login already exists')) {
                return res.status(409).json({
                    success: false,
                    message: 'Account number already exists in external system. Please try again.'
                });
            }

            // For other types of errors, return the error response
            return res.status(500).json({
                success: false,
                message: 'Error contacting external API',
                error: apiError.message,
                details: apiError.response?.data || 'No additional details'
            });
        }

        const externalAPIResult = {
            investor_pwd: externalAPIResponse.data.Investor_Pwd,
            master_pwd: externalAPIResponse.data.Master_Pwd
        };

        // Create account in the database
        const account = await Account.create({
            user: req.user.id,
            mt5Account,
            name,
            leverage,
            groupName: accountType,
            accountType: accountName,
            investor_pwd: externalAPIResult.investor_pwd,
            master_pwd: externalAPIResult.master_pwd,
            platform,
            balance: 0,
            equity: 0,
            status: true,
            managerIndex: "1"
        });

        // Populate user data for notifications
        await account.populate('user', 'firstname lastname email');

        // Trigger notifications for new account creation
        if (req.notificationTriggers) {
            await req.notificationTriggers.handleAccountCreated({
                ...account.toObject(),
                user: req.user.id
            });
        }

        res.status(201).json({
            success: true,
            data: account
        });
    } catch (error) {
        console.error('Error creating account:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// @desc    Get all user accounts
// @route   GET /api/accounts
// @access  Private
exports.getAccounts = async (req, res) => {
    try {
        const accounts = await Account.find({ user: req.user.id });

        res.status(200).json({
            success: true,
            count: accounts.length,
            data: accounts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// @desc    Get single account
// @route   GET /api/accounts/:id
// @access  Private
exports.getAccount = async (req, res) => {
    try {
        console.log("Fetching account with ID:", req.params.accountId);
        const account = await Account.findOne({
            _id: req.params.accountId,
            user: req.user.id
        });

        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'Account not found'
            });
        }

        res.status(200).json({
            success: true,
            data: account
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};