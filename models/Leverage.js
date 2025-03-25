// backend/models/Leverage.js
const mongoose = require('mongoose');

const LeverageSchema = new mongoose.Schema({
    value: {
        type: String,
        required: [true, 'Please add a value'],
    },
    name: {
        type: String,
        required: [true, 'Please add a name'],
    },
    active: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

module.exports = mongoose.model('Leverage', LeverageSchema);