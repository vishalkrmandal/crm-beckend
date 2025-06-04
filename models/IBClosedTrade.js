// Backend/models/IBClosedTrades.js
const mongoose = require('mongoose');

const IBClosedTradesSchema = new mongoose.Schema({
    mt5Account: {
        type: String,
        required: true,
        index: true
    },
    positionId: {
        type: String,
        required: true,
        unique: true // Prevent duplicate trades
    },
    ticket: {
        type: String,
        required: true
    },
    symbol: {
        type: String,
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
    profit: {
        type: Number,
        required: true
    },
    volume: { // lot size
        type: Number,
        required: true
    },
    commission: {
        type: Number,
        default: 0
    },
    swap: {
        type: Number,
        default: 0
    },
    comment: {
        type: String,
        default: ''
    },
    // Additional fields from API
    stopLoss: {
        type: Number,
        default: 0
    },
    targetPrice: {
        type: Number,
        default: 0
    },
    taxes: {
        type: Number,
        default: 0
    },
    oBSFlag: {
        type: Number,
        default: 0
    },
    uPosStatus: {
        type: Number,
        default: 0
    },
    uTradeFlag: {
        type: Number,
        default: 0
    },
    timestamp: {
        type: Number,
        required: true
    },
    openTimeSec: {
        type: Number,
        required: true
    },
    // Processing status
    commissionProcessed: {
        type: Boolean,
        default: false
    },
    processedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Compound indexes for better performance
IBClosedTradesSchema.index({ mt5Account: 1, closeTime: -1 });
IBClosedTradesSchema.index({ commissionProcessed: 1 });
IBClosedTradesSchema.index({ positionId: 1, mt5Account: 1 });

module.exports = mongoose.model('IBClosedTrades', IBClosedTradesSchema);