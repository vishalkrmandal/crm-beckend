// Backend\controllers\admin\withdrawalController.js

const Withdrawal = require('../../models/Withdrawal');
const Account = require('../../models/client/Account');
const User = require('../../models/User');
const axios = require('axios');

// MT5 API Configuration
const MT5_API_BASE_URL = 'https://api.infoapi.biz/api/mt5';
const MANAGER_INDEX = 1; // You might want to move this to environment variables

exports.getAllWithdrawals = async (req, res) => {
    console.log('Fetching all withdrawals...', req);
    try {
        console.log('Fetching all withdrawals...', req.user);
        const withdrawals = await Withdrawal.find()
            .populate({
                path: 'user',
                select: 'firstname lastname email avatar'
            })
            .populate({
                path: 'account',
                select: 'mt5Account balance accountType'
            })
            .sort({ requestedDate: -1 });

        console.log('Withdrawals:', withdrawals);
        res.status(200).json(withdrawals);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching withdrawals',
            error: error.message
        });
    }
};

exports.approveWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks = 'Congratulations' } = req.body;

        // Find withdrawal with populated data
        const withdrawal = await Withdrawal.findById(id)
            .populate('account')
            .populate('user');

        if (!withdrawal) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal not found'
            });
        }

        if (withdrawal.status !== 'Pending') {
            return res.status(400).json({
                success: false,
                message: 'Withdrawal has already been processed'
            });
        }

        // Check if account has sufficient balance
        if (withdrawal.account.balance < withdrawal.amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance in account'
            });
        }

        console.log('Calling MT5 API for withdrawal...');

        // Call MT5 API to execute withdrawal
        const mt5Response = await callMT5WithdrawAPI(
            withdrawal.account.mt5Account,
            withdrawal.amount,
            `Withdrawal approval for ${withdrawal.user.firstname} ${withdrawal.user.lastname}`
        );

        if (!mt5Response.success) {
            return res.status(400).json({
                success: false,
                message: 'MT5 withdrawal failed',
                error: mt5Response.error
            });
        }

        console.log('MT5 API Response:', mt5Response.data);

        // Update account balance in database with the actual balance from MT5
        const updatedAccount = await Account.findByIdAndUpdate(
            withdrawal.account._id,
            {
                balance: mt5Response.data.Balance,
                equity: mt5Response.data.Equity,
                freeMargin: mt5Response.data.FreeMargin,
                margin: mt5Response.data.Margin,
                credit: mt5Response.data.Credit,
                lastUpdated: new Date()
            },
            { new: true }
        );

        console.log('Account updated:', updatedAccount);

        // Update withdrawal status with MT5 transaction details
        withdrawal.status = 'Approved';
        withdrawal.approvedDate = new Date();
        withdrawal.remarks = remarks;
        withdrawal.mt5Ticket = mt5Response.data.Ticket;
        withdrawal.mt5TransactionId = mt5Response.data.Ticket;
        withdrawal.processedAmount = mt5Response.data.Amount;
        await withdrawal.save();

        // Populate user data for notifications
        await withdrawal.populate('user', 'firstname lastname email');

        // Trigger notifications
        if (req.notificationTriggers) {
            await req.notificationTriggers.handleWithdrawalStatusChange(
                withdrawal.toObject(),
                'Pending' // Previous status before approval
            );
        }

        console.log('Withdrawal updated:', withdrawal);

        // TODO: Send notification email to user

        res.status(200).json({
            success: true,
            message: 'Withdrawal approved and processed successfully',
            withdrawal: {
                ...withdrawal.toObject(),
                account: {
                    ...withdrawal.account.toObject(),
                    balance: updatedAccount.balance,
                    equity: updatedAccount.equity
                }
            },
            mt5Response: {
                ticket: mt5Response.data.Ticket,
                newBalance: mt5Response.data.Balance,
                message: mt5Response.data.Message
            }
        });

    } catch (error) {
        console.error('Error in withdrawal approval:', error);

        // If it's an MT5 API error, provide more specific error message
        if (error.response && error.response.data) {
            return res.status(500).json({
                success: false,
                message: 'MT5 API Error: ' + (error.response.data.message || 'Unknown error'),
                error: error.response.data
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error approving withdrawal',
            error: error.message
        });
    }
};

exports.rejectWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: 'Rejection remarks are required'
            });
        }

        const withdrawal = await Withdrawal.findById(id);

        if (!withdrawal) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal not found'
            });
        }

        if (withdrawal.status !== 'Pending') {
            return res.status(400).json({
                success: false,
                message: 'Withdrawal has already been processed'
            });
        }

        // Update withdrawal status
        withdrawal.status = 'Rejected';
        withdrawal.rejectedDate = new Date();
        withdrawal.remarks = remarks;
        await withdrawal.save();

        // Populate user data for notifications
        await withdrawal.populate('user', 'firstname lastname email');

        // Trigger notifications
        if (req.notificationTriggers) {
            await req.notificationTriggers.handleWithdrawalStatusChange(
                withdrawal.toObject(),
                'Pending' // Previous status before rejection
            );
        }

        // TODO: Send notification email to user

        res.status(200).json({
            success: true,
            message: 'Withdrawal rejected successfully',
            withdrawal
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error rejecting withdrawal',
            error: error.message
        });
    }
};

// Helper function to call MT5 API
async function callMT5WithdrawAPI(mt5Account, amount, comment) {
    try {
        const url = `${MT5_API_BASE_URL}/MakeWithdrawBalance`;
        const params = {
            Manager_Index: MANAGER_INDEX,
            MT5Account: mt5Account,
            Amount: amount,
            Comment: comment
        };

        console.log('Calling MT5 API with params:', params);

        const response = await axios.get(url, {
            params,
            timeout: 30000 // 30 second timeout
        });

        console.log('MT5 API Raw Response:', response.data);

        // Check if the response indicates success
        if (response.data && response.data.status === 'success' && response.data.Result === true) {
            return {
                success: true,
                data: response.data
            };
        } else {
            return {
                success: false,
                error: response.data?.message || response.data?.Message || 'Unknown MT5 API error',
                data: response.data
            };
        }

    } catch (error) {
        console.error('MT5 API Error:', error.response?.data || error.message);

        return {
            success: false,
            error: error.response?.data?.message || error.message || 'MT5 API connection failed',
            data: null
        };
    }
}