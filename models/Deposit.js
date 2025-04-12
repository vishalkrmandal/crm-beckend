// Backend/models/Deposit.js 
const mongoose = require('mongoose');

const DepositSchema = new mongoose.Schema({
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
    amount: {
        type: Number,
        required: true,
        min: [100, 'Minimum deposit amount is $100']
    },
    planType: {
        type: String,
        enum: ['Basic', 'Standard', 'Premium'],
        required: true
    },
    paymentMethod: {
        type: String,
        required: true,
        enum: ['Bank Transfer', 'Credit Card', 'Cryptocurrency', 'E-Wallet']
    },
    proofOfPayment: {
        type: String,
        required: true
    },
    bonus: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    notes: {
        type: String,
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

module.exports = mongoose.model('Deposit', DepositSchema);