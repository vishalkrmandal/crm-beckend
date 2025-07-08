// Backend/controllers/transactionController.js
const Deposit = require('../../models/Deposit');
const Withdrawal = require('../../models/Withdrawal');
const Transfer = require('../../models/client/Transfer');
const { generateExcel, generatePDF } = require('../../utils/exportUtils');
// const Account = require('../models/client/Account');

// Get all transactions for a user
exports.getUserTransactions = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            type = 'all',
            status = 'all',
            startDate,
            endDate,
            search = '',
            page = 1,
            limit = 10
        } = req.query;

        const skip = (page - 1) * limit;

        // Date filtering
        const dateFilter = {};
        if (startDate && endDate) {
            dateFilter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Prepare status filter
        const statusFilter = status !== 'all' ? { status } : {};

        // Search regex
        const searchRegex = search ? new RegExp(search, 'i') : null;

        // Initialize results
        let deposits = [];
        let withdrawals = [];
        let transfers = [];

        // Get transactions by type
        if (type === 'all' || type === 'deposit') {
            // Find deposits
            const depositQuery = {
                user: userId,
                ...dateFilter,
                ...statusFilter
            };

            // Add search condition for deposits if search parameter exists
            if (searchRegex) {
                depositQuery.$or = [
                    { 'accountNumber': searchRegex },
                    { 'paymentType': searchRegex },
                    { 'notes': searchRegex },
                    { 'remarks': searchRegex }
                ];
            }

            deposits = await Deposit.find(depositQuery)
                .populate({
                    path: 'account',
                    select: 'mt5Account name accountType'
                })
                .populate({
                    path: 'paymentMethod',
                    select: 'name'
                })
                .lean();

            // Transform deposit data
            deposits = deposits.map(deposit => ({
                _id: deposit._id,
                date: deposit.status === 'Pending' ? deposit.requestedDate :
                    deposit.status === 'Approved' ? deposit.approvedDate :
                        deposit.status === 'Rejected' ? deposit.rejectedDate :
                            deposit.createdAt,
                type: 'Deposit',
                description: `${deposit.paymentType} Deposit`,
                amount: `+$${deposit.amount.toFixed(2)}`,
                account: deposit.account?.mt5Account || deposit.accountNumber || 'Unknown',
                accountName: deposit.account?.name || 'Unknown',
                accountType: deposit.account?.accountType || 'Unknown',
                status: deposit.status,
                rawAmount: deposit.amount,
                createdAt: deposit.createdAt
            }));
        }

        if (type === 'all' || type === 'withdrawal') {
            // Find withdrawals
            const withdrawalQuery = {
                user: userId,
                ...dateFilter,
                ...statusFilter
            };

            // Add search condition for withdrawals if search parameter exists
            if (searchRegex) {
                withdrawalQuery.$or = [
                    { 'accountNumber': searchRegex },
                    { 'paymentMethod': searchRegex },
                    { 'remarks': searchRegex },
                    { 'bankDetails.bankName': searchRegex },
                    { 'bankDetails.accountHolderName': searchRegex },
                    { 'eWalletDetails.type': searchRegex }
                ];
            }

            withdrawals = await Withdrawal.find(withdrawalQuery)
                .populate({
                    path: 'account',
                    select: 'mt5Account name accountType'
                })
                .lean();

            // Transform withdrawal data
            withdrawals = withdrawals.map(withdrawal => ({
                _id: withdrawal._id,
                date: withdrawal.status === 'Pending' ? withdrawal.requestedDate :
                    withdrawal.status === 'Approved' ? withdrawal.approvedDate :
                        withdrawal.status === 'Rejected' ? withdrawal.rejectedDate :
                            withdrawal.createdAt,
                type: 'Withdrawal',
                description: `${withdrawal.paymentMethod} Withdrawal`,
                amount: `-$${withdrawal.amount.toFixed(2)}`,
                account: withdrawal.account?.mt5Account || withdrawal.accountNumber || 'Unknown',
                accountName: withdrawal.account?.name || 'Unknown',
                accountType: withdrawal.account?.accountType || 'Unknown',
                status: withdrawal.status,
                rawAmount: -withdrawal.amount,
                createdAt: withdrawal.createdAt
            }));
        }

        if (type === 'all' || type === 'transfer') {
            // Find transfers
            const transferQuery = {
                user: userId,
                ...dateFilter,
                ...statusFilter
            };

            // Get both sent and received transfers
            transfers = await Transfer.find(transferQuery)
                .populate({
                    path: 'fromAccount',
                    select: 'mt5Account name accountType'
                })
                .populate({
                    path: 'toAccount',
                    select: 'mt5Account name accountType'
                })
                .lean();

            // Create double entries for transfers (debit and credit)
            const transformedTransfers = [];

            transfers.forEach(transfer => {
                // Skip this transfer record if search is applied and doesn't match
                if (searchRegex &&
                    !transfer.fromAccount?.mt5Account?.match(searchRegex) &&
                    !transfer.toAccount?.mt5Account?.match(searchRegex)) {
                    return;
                }

                // Add debit entry
                transformedTransfers.push({
                    _id: `${transfer._id}-from`,
                    date: transfer.createdAt,
                    type: 'Transfer',
                    description: 'Internal Transfer',
                    amount: `-$${transfer.amount.toFixed(2)}`,
                    account: transfer.fromAccount?.mt5Account || 'Unknown',
                    accountName: transfer.fromAccount?.name || 'Unknown',
                    accountType: transfer.fromAccount?.accountType || 'Unknown',
                    status: transfer.status,
                    rawAmount: -transfer.amount,
                    createdAt: transfer.createdAt
                });

                // Add credit entry
                transformedTransfers.push({
                    _id: `${transfer._id}-to`,
                    date: transfer.createdAt,
                    type: 'Transfer',
                    description: 'Internal Transfer',
                    amount: `+$${transfer.amount.toFixed(2)}`,
                    account: transfer.toAccount?.mt5Account || 'Unknown',
                    accountName: transfer.toAccount?.name || 'Unknown',
                    accountType: transfer.toAccount?.accountType || 'Unknown',
                    status: transfer.status,
                    rawAmount: transfer.amount,
                    createdAt: transfer.createdAt
                });
            });

            transfers = transformedTransfers;
        }

        // Combine all transactions
        let allTransactions = [...deposits, ...withdrawals, ...transfers];

        // Apply general search if provided
        if (searchRegex && type === 'all') {
            allTransactions = allTransactions.filter(transaction =>
                transaction.account.match(searchRegex) ||
                transaction.description.match(searchRegex) ||
                transaction.status.match(searchRegex) ||
                transaction.type.match(searchRegex) ||
                (transaction.accountName && transaction.accountName.match(searchRegex))
            );
        }

        // Sort by date (most recent first)
        allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Calculate total count for pagination
        const totalCount = allTransactions.length;

        // Apply pagination
        const paginatedTransactions = allTransactions.slice(skip, skip + parseInt(limit));

        // Format dates for display
        paginatedTransactions.forEach(transaction => {
            const date = new Date(transaction.date);
            transaction.date = date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        });

        res.status(200).json({
            success: true,
            count: totalCount,
            data: paginatedTransactions,
            pagination: {
                page: parseInt(page),
                pages: Math.ceil(totalCount / limit),
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error getting transactions:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving transaction history',
            error: error.message
        });
    }
};

// Export transactions data (JSON only)
exports.exportTransactions = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            type = 'all',
            status = 'all',
            startDate,
            endDate,
            search = ''
        } = req.query;

        // Date filtering
        const dateFilter = {};
        if (startDate && endDate) {
            dateFilter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Prepare status filter
        const statusFilter = status !== 'all' ? { status } : {};

        // Search regex
        const searchRegex = search ? new RegExp(search, 'i') : null;

        // Initialize results
        let deposits = [];
        let withdrawals = [];
        let transfers = [];

        // Get transactions by type (same logic as getUserTransactions)
        if (type === 'all' || type === 'deposit') {
            const depositQuery = {
                user: userId,
                ...dateFilter,
                ...statusFilter
            };

            if (searchRegex) {
                depositQuery.$or = [
                    { 'accountNumber': searchRegex },
                    { 'paymentType': searchRegex },
                    { 'notes': searchRegex },
                    { 'remarks': searchRegex }
                ];
            }

            deposits = await Deposit.find(depositQuery)
                .populate({
                    path: 'account',
                    select: 'mt5Account name accountType'
                })
                .populate({
                    path: 'paymentMethod',
                    select: 'name'
                })
                .lean();

            deposits = deposits.map(deposit => ({
                _id: deposit._id,
                date: deposit.status === 'Pending' ? deposit.requestedDate :
                    deposit.status === 'Approved' ? deposit.approvedDate :
                        deposit.status === 'Rejected' ? deposit.rejectedDate :
                            deposit.createdAt,
                type: 'Deposit',
                description: `${deposit.paymentType} Deposit`,
                amount: `+$${deposit.amount.toFixed(2)}`,
                account: deposit.account?.mt5Account || deposit.accountNumber || 'Unknown',
                status: deposit.status,
                createdAt: deposit.createdAt
            }));
        }

        if (type === 'all' || type === 'withdrawal') {
            const withdrawalQuery = {
                user: userId,
                ...dateFilter,
                ...statusFilter
            };

            if (searchRegex) {
                withdrawalQuery.$or = [
                    { 'accountNumber': searchRegex },
                    { 'paymentMethod': searchRegex },
                    { 'remarks': searchRegex },
                    { 'bankDetails.bankName': searchRegex },
                    { 'bankDetails.accountHolderName': searchRegex },
                    { 'eWalletDetails.type': searchRegex }
                ];
            }

            withdrawals = await Withdrawal.find(withdrawalQuery)
                .populate({
                    path: 'account',
                    select: 'mt5Account name accountType'
                })
                .lean();

            withdrawals = withdrawals.map(withdrawal => ({
                _id: withdrawal._id,
                date: withdrawal.status === 'Pending' ? withdrawal.requestedDate :
                    withdrawal.status === 'Approved' ? withdrawal.approvedDate :
                        withdrawal.status === 'Rejected' ? withdrawal.rejectedDate :
                            withdrawal.createdAt,
                type: 'Withdrawal',
                description: `${withdrawal.paymentMethod} Withdrawal`,
                amount: `-$${withdrawal.amount.toFixed(2)}`,
                account: withdrawal.account?.mt5Account || withdrawal.accountNumber || 'Unknown',
                status: withdrawal.status,
                createdAt: withdrawal.createdAt
            }));
        }

        if (type === 'all' || type === 'transfer') {
            const transferQuery = {
                user: userId,
                ...dateFilter,
                ...statusFilter
            };

            transfers = await Transfer.find(transferQuery)
                .populate({
                    path: 'fromAccount',
                    select: 'mt5Account name accountType'
                })
                .populate({
                    path: 'toAccount',
                    select: 'mt5Account name accountType'
                })
                .lean();

            const transformedTransfers = [];
            transfers.forEach(transfer => {
                if (searchRegex &&
                    !transfer.fromAccount?.mt5Account?.match(searchRegex) &&
                    !transfer.toAccount?.mt5Account?.match(searchRegex)) {
                    return;
                }

                transformedTransfers.push({
                    _id: `${transfer._id}-from`,
                    date: transfer.createdAt,
                    type: 'Transfer',
                    description: 'Internal Transfer',
                    amount: `-$${transfer.amount.toFixed(2)}`,
                    account: transfer.fromAccount?.mt5Account || 'Unknown',
                    status: transfer.status,
                    createdAt: transfer.createdAt
                });

                transformedTransfers.push({
                    _id: `${transfer._id}-to`,
                    date: transfer.createdAt,
                    type: 'Transfer',
                    description: 'Internal Transfer',
                    amount: `+$${transfer.amount.toFixed(2)}`,
                    account: transfer.toAccount?.mt5Account || 'Unknown',
                    status: transfer.status,
                    createdAt: transfer.createdAt
                });
            });

            transfers = transformedTransfers;
        }

        // Combine all transactions
        let allTransactions = [...deposits, ...withdrawals, ...transfers];

        // Apply general search if provided
        if (searchRegex && type === 'all') {
            allTransactions = allTransactions.filter(transaction =>
                transaction.account.match(searchRegex) ||
                transaction.description.match(searchRegex) ||
                transaction.status.match(searchRegex) ||
                transaction.type.match(searchRegex)
            );
        }

        // Sort by date (most recent first)
        allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Format dates for export
        allTransactions.forEach(transaction => {
            const date = new Date(transaction.date);
            transaction.formattedDate = date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        });

        res.json({
            success: true,
            data: allTransactions
        });

    } catch (error) {
        console.error('Error exporting transactions:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching transactions for export',
            error: error.message
        });
    }
};