// backend/models/IBWithdrawal.js
const mongoose = require('mongoose');

const IBWithdrawalSchema = new mongoose.Schema({
    ibConfigurationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'IBConfiguration',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01
    },
    reference: {
        type: String,
        unique: true
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
    paymentDetails: {
        method: {
            type: String,
            default: null
        },
        transactionId: {
            type: String,
            default: null
        },
        notes: {
            type: String,
            default: null
        }
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

// Pre-save hook to generate reference if not provided
IBWithdrawalSchema.pre('save', function (next) {
    if (!this.reference) {
        // Generate a unique reference number: IB-W-TIMESTAMP-RANDOM
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        this.reference = `IB-W-${timestamp}${random}`;
    }
    next();
});

const IBWithdrawal = mongoose.model('IBWithdrawal', IBWithdrawalSchema);

module.exports = IBWithdrawal;
