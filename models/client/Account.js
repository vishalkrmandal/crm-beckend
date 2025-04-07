const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    mt5Account: {
        type: String,
        required: true,
        unique: true
    },
    investor_pwd: {
        type: String,
        required: true
    },
    master_pwd: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    leverage: {
        type: String,
        required: true
    },
    accountType: {
        type: String,
        required: true
    },
    groupName: {
        type: String,
        required: true
    },
    platform: {
        type: String,
        default: 'MetaTrader 5'
    },
    balance: {
        type: Number,
        default: 0
    },
    equity: {
        type: Number,
        default: 0
    },
    status: {
        type: Boolean,
        default: true
    },
    managerIndex: {
        type: String,
        default: '2'
    }
}, { timestamps: true });

module.exports = mongoose.model('Account', AccountSchema);