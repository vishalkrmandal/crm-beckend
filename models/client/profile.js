// Backend\models\client\Profile.js

const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    // Personal Information
    educationLevel: {
        type: String,
        enum: ['secondary', 'higher secondary', 'bachelor\'s degree', 'master\'s degree', 'doctorate', 'other'],
    },
    otherEducation: {
        type: String,
    },
    isEmployed: {
        type: Boolean,
    },
    idDocument: {
        type: String, // Path to uploaded file
    },
    address1Document: {
        type: String, // Path to uploaded file
    },
    address2Document: {
        type: String, // Path to uploaded file
    },

    // Account Details
    bankDetails: {
        bankName: String,
        accountHolderName: String,
        accountNumber: String,
        ifscSwiftCode: String
    },

    // Wallet Details
    walletDetails: {
        tetherWalletAddress: String,
        ethWalletAddress: String,
        accountNumber: String,
        trxWalletAddress: String
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

module.exports = mongoose.model('Profile', ProfileSchema);