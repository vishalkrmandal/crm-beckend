// Backend\models\PaymentMethod.js
const mongoose = require('mongoose');


const PaymentMethodSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    accountHolderName: {
        type: String,
    },
    type: {
        type: String,
        required: [true, 'Please specify the payment method type'],
        enum: ['Bank Account', 'Crypto Wallet', 'Online Banking', 'Other']
    },
    accountNumber: {
        type: String,
    },
    bankName: {
        type: String
    },
    ifsc_swift: {
        type: String
    },
    walletName: {
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
    },
    active: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// ✅ **Pre-save Middleware for Conditional Validation**
PaymentMethodSchema.pre("save", function (next) {
    if (this.type === "Bank Account") {
        if (!this.accountHolderName || !this.accountNumber || !this.bankName || !this.ifsc_swift) {
            return next(new Error("All bank account fields (accountHolderName, accountNumber, bankName, ifsc) are required"));
        }
    }

    if (this.type === "Crypto Wallet") {
        if (!this.walletName || !this.walletAddress) {
            return next(new Error("Both walletName and walletAddress are required for Crypto Wallet"));
        }
    }

    next();
});

module.exports = mongoose.model('PaymentMethod', PaymentMethodSchema);