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
    amount: {
        type: Number,
        required: true,
    },
    planType: {
        type: String,
    },
    paymentMethod: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaymentMethod',
        required: true
    },
    paymentType: {
        type: String,
        required: true,
    },
    proofOfPayment: {
        type: String,
        required: true
    },
    accountNumber: {    //mt5account
        type: String,
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