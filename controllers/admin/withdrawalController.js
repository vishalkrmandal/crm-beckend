// Backend\controllers\admin\withdrawalController.js

const Withdrawal = require('../../models/withdrawal');
const Account = require('../../models/client/Account');
const User = require('../../models/User');

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

        // Update account balance
        await Account.findByIdAndUpdate(withdrawal.account._id, {
            $inc: { balance: -withdrawal.amount }
        });

        // Update withdrawal status
        withdrawal.status = 'Approved';
        withdrawal.approvedDate = new Date();
        withdrawal.remarks = remarks;
        await withdrawal.save();

        // TODO: Send notification email to user

        res.status(200).json({
            success: true,
            message: 'Withdrawal approved successfully',
            withdrawal
        });
    } catch (error) {
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