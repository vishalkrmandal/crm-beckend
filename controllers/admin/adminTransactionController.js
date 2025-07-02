// Backend/controllers/admin/adminTransactionController.js
const axios = require('axios');

// Get all transactions (deposits, withdrawals, transfers)
exports.getAllTransactions = async (req, res) => {
    try {
        // Get the authorization token from the request
        const authToken = req.headers.authorization;

        if (!authToken) {
            return res.status(401).json({ success: false, message: 'Authorization token required' });
        }

        // Set up API configuration
        const apiConfig = {
            headers: {
                Authorization: authToken
            }
        };

        // Base URL for API requests
        const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000';

        // Fetch data from all three endpoints in parallel
        const [depositsResponse, withdrawalsResponse, transfersResponse] = await Promise.all([
            axios.get(`${baseUrl}/api/admindeposits`, apiConfig),
            axios.get(`${baseUrl}/api/adminwithdrawals`, apiConfig),
            axios.get(`${baseUrl}/api/transfers`, apiConfig)
        ]);

        // Extract data from responses
        const depositsData = depositsResponse.data.data || [];
        const withdrawalsData = Array.isArray(withdrawalsResponse.data)
            ? withdrawalsResponse.data
            : (withdrawalsResponse.data.data || []);
        const transfersData = transfersResponse.data.data || [];

        // Format deposits
        const formattedDeposits = depositsData.map(deposit => ({
            id: deposit._id,
            user: {
                name: deposit.user.name || `${deposit.user.firstname || ''} ${deposit.user.lastname || ''}`.trim(),
                email: deposit.user.email,
            },
            accountNumber: deposit.accountNumber,
            amount: deposit.amount,
            paymentMethod: deposit.paymentMethod,
            type: 'Deposit',
            planType: deposit.planType,
            // document: deposit.proofOfPayment ? true : false,
            // documentUrl: deposit.proofOfPayment,
            requestedOn: deposit.requestedOn,
            completedOn: deposit.approvedOn || deposit.rejectedOn,
            status: deposit.status,
            remarks: deposit.remarks || '',
            bonus: deposit.bonus || 0
        }));

        // Format withdrawals
        const formattedWithdrawals = withdrawalsData.map(withdrawal => ({
            id: withdrawal._id,
            user: {
                name: withdrawal.user.name || `${withdrawal.user.firstname || ''} ${withdrawal.user.lastname || ''}`.trim(),
                email: withdrawal.user.email,
            },
            accountNumber: withdrawal.accountNumber,
            amount: withdrawal.amount,
            paymentMethod: withdrawal.paymentMethod,
            type: 'Withdrawal',
            planType: withdrawal.accountType,
            // document: false, // Withdrawals typically don't have uploaded documents
            requestedOn: withdrawal.requestedDate,
            completedOn: withdrawal.approvedDate || withdrawal.rejectedDate,
            status: withdrawal.status,
            remarks: withdrawal.remarks || '',
            bankDetails: withdrawal.bankDetails || {}
        }));

        // Format transfers
        // Format transfers
        const formattedTransfers = transfersData.map(transfer => {
            // Get user name safely
            let userName = '';
            if (transfer.user) {
                if (transfer.user.name) {
                    userName = transfer.user.name;
                } else if (transfer.user.firstname || transfer.user.lastname) {
                    userName = `${transfer.user.firstname || ''} ${transfer.user.lastname || ''}`.trim();
                }
            }

            // Safe access to account data
            const fromAccountNumber = transfer.fromAccount?.mt5Account || 'N/A';
            const toAccountNumber = transfer.toAccount?.mt5Account || 'N/A';
            const fromAccountType = transfer.fromAccount?.accountType || 'Unknown';
            const toAccountType = transfer.toAccount?.accountType || 'Unknown';

            return {
                id: transfer._id,
                user: {
                    name: userName,
                    email: transfer.user ? transfer.user.email : '',
                },
                fromAccount: {
                    accountNumber: fromAccountNumber,
                    planType: fromAccountType
                },
                toAccount: {
                    accountNumber: toAccountNumber,
                    planType: toAccountType
                },
                accountNumber: `${fromAccountNumber} → ${toAccountNumber}`,
                amount: transfer.amount,
                paymentMethod: 'Internal Transfer',
                type: 'Transfer',
                planType: `${fromAccountType} → ${toAccountType}`,
                requestedOn: transfer.createdAt,
                completedOn: transfer.updatedAt,
                status: transfer.status
            };
        });

        // Combine all transactions
        const allTransactions = [
            ...formattedDeposits,
            ...formattedWithdrawals,
            ...formattedTransfers
        ]
            // Sort by requestedOn date (most recent first)
            .sort((a, b) => new Date(b.requestedOn) - new Date(a.requestedOn));

        res.json({
            success: true,
            count: allTransactions.length,
            data: allTransactions
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transactions',
            error: error.message
        });
    }
};