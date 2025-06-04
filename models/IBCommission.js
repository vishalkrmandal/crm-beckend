// Backend/models/IBCommission.js
const mongoose = require('mongoose');

const IBCommissionSchema = new mongoose.Schema({
    // Trade reference
    tradeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'IBClosedTrades',
        required: true
    },

    // Client who made the trade
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    clientMT5Account: {
        type: String,
        required: true
    },

    // IB who receives the commission
    ibUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    ibConfigurationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'IBClientConfiguration',
        required: true
    },

    // Commission details
    level: {
        type: Number,
        required: true
    },
    bonusPerLot: {
        type: Number,
        required: true
    },
    volume: { // lot size from trade
        type: Number,
        required: true
    },
    commissionAmount: {
        type: Number,
        required: true
    },

    // Trade details for reference
    symbol: {
        type: String,
        required: true
    },
    profit: {
        type: Number,
        required: true
    },
    openTime: {
        type: Date,
        required: true
    },
    closeTime: {
        type: Date,
        required: true
    },
    openPrice: {
        type: Number,
        required: true
    },
    closePrice: {
        type: Number,
        required: true
    },

    // Base amount for percentage calculations if needed
    baseAmount: {
        type: Number,
        default: 0
    },

    // Group information
    groupName: {
        type: String,
        required: true
    },

    // Status
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'paid'],
        default: 'confirmed'
    },

    // Processing metadata
    processedAt: {
        type: Date,
        default: Date.now
    },

    // For batch processing reference
    batchId: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Indexes for performance - Remove any conflicting indexes
IBCommissionSchema.index({ ibUserId: 1, createdAt: -1 });
IBCommissionSchema.index({ clientId: 1, createdAt: -1 });
IBCommissionSchema.index({ tradeId: 1 });
IBCommissionSchema.index({ ibConfigurationId: 1, level: 1 });
IBCommissionSchema.index({ status: 1 });
IBCommissionSchema.index({ clientMT5Account: 1 });

// Compound index for commission queries
IBCommissionSchema.index({
    ibUserId: 1,
    status: 1,
    createdAt: -1
});

// Unique compound index to prevent duplicate commissions for the same trade/IB/level
IBCommissionSchema.index({
    tradeId: 1,
    ibUserId: 1,
    level: 1
}, { unique: true });

module.exports = mongoose.model('IBCommission', IBCommissionSchema);