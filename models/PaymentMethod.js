const mongoose = require('mongoose');


const PaymentMethodSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Please add a name for the payment method']
    },
    type: {
        type: String,
        required: [true, 'Please specify the payment method type'],
        enum: ['Bank Account', 'Crypto Wallet', 'Online Banking', 'Other']
    },
    accounts: {
        type: String,
        required: [true, 'Please provide account details']
    },
    active: {
        type: Boolean,
        default: false
    },
    bankName: {
        type: String
    },
    accountNumber: {
        type: String
    },
    ifsc: {
        type: String
    },
    bank: {
        type: String
    },
    walletAddress: {
        type: String
    },
    qrCode: {
        type: String
    },
    paymentLink: {
        type: String
    },
    description: {
        type: String
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('PaymentMethod', PaymentMethodSchema);