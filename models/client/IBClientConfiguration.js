// backend/models/client/IBClientConfiguration.js
const mongoose = require('mongoose');

const IBClientConfigurationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    referralCode: {
        type: String,
        unique: true,
        sparse: true // Allows null values while maintaining uniqueness for non-null values
    },
    referredBy: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'inactive'],
        default: 'pending'
    },
    level: {
        type: Number,
        default: 0
    },
    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'IBClientConfiguration',
        default: null
    }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt
});

// Add indexes for better performance
IBClientConfigurationSchema.index({ parent: 1 });
IBClientConfigurationSchema.index({ status: 1 });
IBClientConfigurationSchema.index({ level: 1 });

const IBClientConfiguration = mongoose.model('IBClientConfiguration', IBClientConfigurationSchema);

module.exports = IBClientConfiguration;