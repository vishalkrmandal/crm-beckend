// models/Exchange.js
const mongoose = require('mongoose');

const ExchangeSchema = new mongoose.Schema({
    fromCurrency: {
        code: { type: String, required: true },
        name: { type: String, required: true }
    },
    toCurrency: {
        code: { type: String, required: true },
        name: { type: String, required: true }
    },
    exchangeRate: { type: Number, required: true },
    type: {
        type: String,
        enum: ['deposit', 'withdrawal'],
        required: true
    },
    isCustomRate: { type: Boolean, default: false },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

module.exports = mongoose.model('Exchange', ExchangeSchema);