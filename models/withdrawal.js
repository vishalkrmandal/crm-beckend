//Backend\models\withdrawal.js

const mongoose = require('mongoose');

const WithdrawalSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true
    },
    accountNumber: {
        type: String,
        required: true
    },
    accountType: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true,
    },
    paymentMethod: {
        type: String,
        required: true,
    },
    bankDetails: {
        bankName: String,
        accountHolderName: String,
        accountNumber: String,
        ifscCode: String,
    },
    eWalletDetails: {
        walletId: String,
        type: String
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    requestedDate: {
        type: Date,
        default: Date.now
    },
    approvedDate: {
        type: Date
    },
    rejectedDate: {
        type: Date
    },
    remarks: {
        type: String,
        default: ''
    }
}, { timestamps: true });

module.exports = mongoose.model('Withdrawal', WithdrawalSchema);