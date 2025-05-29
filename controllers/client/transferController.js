// controllers/transferController.js
const Transfer = require('../../models/client/Transfer');
const Account = require('../../models/client/Account');
const axios = require('axios');

// MT5 API Configuration
const MT5_API_BASE_URL = 'https://api.infoapi.biz/api/mt5';
const MANAGER_INDEX = 2; // You may want to move this to config

// Helper function to make MT5 withdrawal
const makeWithdrawal = async (mt5Account, amount, comment = 'Transfer withdrawal') => {
    try {
        const response = await axios.get(`${MT5_API_BASE_URL}/MakeWithdrawBalance`, {
            params: {
                Manager_Index: MANAGER_INDEX,
                MT5Account: mt5Account,
                Amount: amount,
                Comment: comment
            },
            timeout: 30000 // 30 seconds timeout
        });

        if (response.data.error || !response.data.Result) {
            throw new Error(response.data.message || 'Withdrawal failed');
        }

        return response.data;
    } catch (error) {
        throw new Error(`MT5 Withdrawal failed: ${error.message}`);
    }
};

// Helper function to make MT5 deposit
const makeDeposit = async (mt5Account, amount, comment = 'Transfer deposit') => {
    try {
        const response = await axios.get(`${MT5_API_BASE_URL}/MakeDepositBalance`, {
            params: {
                Manager_Index: MANAGER_INDEX,
                MT5Account: mt5Account,
                Amount: amount,
                Comment: comment
            },
            timeout: 30000 // 30 seconds timeout
        });

        if (response.data.error || !response.data.Result) {
            throw new Error(response.data.message || 'Deposit failed');
        }

        return response.data;
    } catch (error) {
        throw new Error(`MT5 Deposit failed: ${error.message}`);
    }
};

// Get all transfers for a user or all transfers for admin
exports.getTransfers = async (req, res) => {
    try {
        let transfers;

        // Check if the user is an admin
        if (req.user.role === 'admin') {
            // Admin gets all transfers from all users
            transfers = await Transfer.find({})
                .populate('user', 'firstname lastname email')
                .populate('fromAccount', 'mt5Account accountType')
                .populate('toAccount', 'mt5Account accountType')
                .sort({ createdAt: -1 });
        } else {
            // Regular users only get their own transfers
            transfers = await Transfer.find({ user: req.user.id })
                .populate('fromAccount', 'mt5Account accountType')
                .populate('toAccount', 'mt5Account accountType')
                .sort({ createdAt: -1 });
        }

        res.status(200).json({
            success: true,
            data: transfers
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transfers',
            error: error.message
        });
    }
};

// Create new transfer with MT5 API integration
exports.createTransfer = async (req, res) => {
    try {
        const { fromAccountId, toAccountId, amount } = req.body;

        // Validate input
        if (!fromAccountId || !toAccountId || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Please provide fromAccountId, toAccountId and amount'
            });
        }

        if (fromAccountId === toAccountId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot transfer to the same account'
            });
        }

        if (amount < 10) {
            return res.status(400).json({
                success: false,
                message: 'Minimum transfer amount is $10'
            });
        }

        // Check if accounts exist and belong to the user
        const fromAccount = await Account.findOne({
            _id: fromAccountId,
            user: req.user.id
        });

        const toAccount = await Account.findOne({
            _id: toAccountId,
            user: req.user.id
        });

        if (!fromAccount || !toAccount) {
            return res.status(404).json({
                success: false,
                message: 'One or both accounts not found'
            });
        }

        // Check if fromAccount has sufficient balance
        if (fromAccount.balance < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance in the source account'
            });
        }

        // Validate MT5 accounts
        if (!fromAccount.mt5Account || !toAccount.mt5Account) {
            return res.status(400).json({
                success: false,
                message: 'MT5 account information is missing'
            });
        }

        let withdrawalResult = null;
        let depositResult = null;
        let transferRecord = null;

        try {
            // Step 1: Execute withdrawal from source MT5 account
            console.log(`Executing withdrawal from MT5 account: ${fromAccount.mt5Account}, Amount: ${amount}`);
            withdrawalResult = await makeWithdrawal(
                fromAccount.mt5Account,
                amount,
                `Transfer to ${toAccount.mt5Account}`
            );

            console.log('Withdrawal successful:', withdrawalResult);

            // Step 2: Execute deposit to destination MT5 account
            console.log(`Executing deposit to MT5 account: ${toAccount.mt5Account}, Amount: ${amount}`);
            depositResult = await makeDeposit(
                toAccount.mt5Account,
                amount,
                `Transfer from ${fromAccount.mt5Account}`
            );

            console.log('Deposit successful:', depositResult);

            // Step 3: Update local database balances
            fromAccount.balance = withdrawalResult.Balance;
            fromAccount.equity = withdrawalResult.Equity;
            toAccount.balance = depositResult.Balance;
            toAccount.equity = depositResult.Equity;

            await fromAccount.save();
            await toAccount.save();

            // Step 4: Create transfer record in database
            transferRecord = await Transfer.create({
                user: req.user.id,
                fromAccount: fromAccountId,
                toAccount: toAccountId,
                amount: parseFloat(amount),
                status: 'Completed',
                mt5WithdrawalTicket: withdrawalResult.Ticket,
                mt5DepositTicket: depositResult.Ticket,
                mt5WithdrawalData: {
                    balance: withdrawalResult.Balance,
                    equity: withdrawalResult.Equity,
                    freeMargin: withdrawalResult.FreeMargin,
                    message: withdrawalResult.Message
                },
                mt5DepositData: {
                    balance: depositResult.Balance,
                    equity: depositResult.Equity,
                    freeMargin: depositResult.FreeMargin,
                    message: depositResult.Message
                }
            });

            // Populate the transfer record with account details for response
            await transferRecord.populate([
                { path: 'fromAccount', select: 'mt5Account accountType balance equity' },
                { path: 'toAccount', select: 'mt5Account accountType balance equity' }
            ]);

            res.status(201).json({
                success: true,
                data: transferRecord,
                message: 'Funds transferred successfully',
                mt5Data: {
                    withdrawal: {
                        ticket: withdrawalResult.Ticket,
                        newBalance: withdrawalResult.Balance
                    },
                    deposit: {
                        ticket: depositResult.Ticket,
                        newBalance: depositResult.Balance
                    }
                }
            });

        } catch (mt5Error) {
            console.error('MT5 API Error:', mt5Error.message);

            // If withdrawal succeeded but deposit failed, we need to handle this carefully
            if (withdrawalResult && !depositResult) {
                console.error('Critical: Withdrawal succeeded but deposit failed. Manual intervention required.');

                // Create a failed transfer record for tracking
                transferRecord = await Transfer.create({
                    user: req.user.id,
                    fromAccount: fromAccountId,
                    toAccount: toAccountId,
                    amount: parseFloat(amount),
                    status: 'Failed',
                    errorMessage: `Deposit failed after successful withdrawal. Withdrawal Ticket: ${withdrawalResult.Ticket}`,
                    mt5WithdrawalTicket: withdrawalResult.Ticket,
                    mt5WithdrawalData: {
                        balance: withdrawalResult.Balance,
                        equity: withdrawalResult.Equity,
                        freeMargin: withdrawalResult.FreeMargin,
                        message: withdrawalResult.Message
                    }
                });

                return res.status(500).json({
                    success: false,
                    message: 'Transfer partially completed. Withdrawal successful but deposit failed. Please contact support immediately.',
                    error: mt5Error.message,
                    withdrawalTicket: withdrawalResult.Ticket,
                    transferId: transferRecord._id
                });
            }

            // If withdrawal failed, create a failed transfer record
            transferRecord = await Transfer.create({
                user: req.user.id,
                fromAccount: fromAccountId,
                toAccount: toAccountId,
                amount: parseFloat(amount),
                status: 'Failed',
                errorMessage: mt5Error.message
            });

            return res.status(500).json({
                success: false,
                message: 'Transfer failed',
                error: mt5Error.message,
                transferId: transferRecord._id
            });
        }

    } catch (error) {
        console.error('Transfer Controller Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to process transfer',
            error: error.message
        });
    }
};

// Get user accounts with balances (for transfer form)
exports.getUserAccounts = async (req, res) => {
    try {
        const accounts = await Account.find({
            user: req.user.id,
            status: true
        })
            .select('mt5Account accountType platform balance equity')
            .sort({ balance: -1 });

        res.status(200).json({
            success: true,
            data: accounts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch accounts',
            error: error.message
        });
    }
};