const mongoose = require('mongoose');

const exchangeSchema = new mongoose.Schema({
    baseCurrency: {
        type: String,
        required: true,
        trim: true
    },
    targetCurrency: {
        type: String,
        required: true,
        trim: true
    },
    rate: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['deposit', 'withdrawal'],
        required: true
    },
    isCustomRate: {
        type: Boolean,
        default: false
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Compound index to ensure uniqueness of baseCurrency, targetCurrency, and type
exchangeSchema.index({ baseCurrency: 1, targetCurrency: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Exchange', exchangeSchema);