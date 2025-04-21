// controllers/transferController.js
const Transfer = require('../../models/client/Transfer');
const Account = require('../../models/client/Account');

// Get all transfers for a user
exports.getTransfers = async (req, res) => {
    try {
        const transfers = await Transfer.find({ user: req.user.id })
            .populate('fromAccount', 'mt5Account accountType')
            .populate('toAccount', 'mt5Account accountType')
            .sort({ createdAt: -1 });

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

// Create new transfer
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

        // Perform the transfer (update account balances)
        fromAccount.balance -= parseFloat(amount);
        toAccount.balance += parseFloat(amount);

        // Update equity as well
        fromAccount.equity -= parseFloat(amount);
        toAccount.equity += parseFloat(amount);

        await fromAccount.save();
        await toAccount.save();

        // Create transfer record
        const transfer = await Transfer.create({
            user: req.user.id,
            fromAccount: fromAccountId,
            toAccount: toAccountId,
            amount,
            status: 'Completed'
        });

        res.status(201).json({
            success: true,
            data: transfer,
            message: 'Funds transferred successfully'
        });
    } catch (error) {
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