// backend/models/IBCommission.js
// backend/models/IBCommission.js - Updated to work with bonusPerLot
const mongoose = require('mongoose');

const IBCommissionSchema = new mongoose.Schema({
    ibConfigurationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'IBClientConfiguration',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction',
        required: true
    },
    level: {
        type: Number,
        required: true
    },
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        required: true
    },
    lotSize: {
        type: Number,
        required: true
    },
    bonusPerLot: {
        type: Number,
        required: true
    },
    baseAmount: {
        type: Number,
        required: true
    },
    commissionAmount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'paid', 'cancelled'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

const IBCommission = mongoose.model('IBCommission', IBCommissionSchema);

module.exports = IBCommission;