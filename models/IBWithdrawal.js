// Backend/models/IBWithdrawal.js
const mongoose = require('mongoose');

const IBWithdrawalSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    ibConfigurationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'IBClientConfiguration',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    withdrawalMethod: {
        type: String,
        enum: ['bank', 'wallet'],
        required: true
    },
    // Bank Details (if bank withdrawal)
    bankDetails: {
        bankName: String,
        accountHolderName: String,
        accountNumber: String,
        ifscSwiftCode: String
    },
    // Wallet Details (if wallet withdrawal)
    walletDetails: {
        walletType: {
            type: String,
            enum: ['tether', 'eth', 'trx']
        },
        walletAddress: String
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'completed'],
        default: 'pending'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },
    rejectedReason: {
        type: String,
        default: null
    },
    adminNotes: {
        type: String,
        default: null
    },
    transactionId: {
        type: String,
        default: null
    },
    processedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Indexes for better performance
IBWithdrawalSchema.index({ userId: 1, status: 1 });
IBWithdrawalSchema.index({ ibConfigurationId: 1 });
IBWithdrawalSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('IBWithdrawal', IBWithdrawalSchema);