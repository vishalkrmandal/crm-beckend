// backend/models/IBConfiguration.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const IBClientConfigurationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    referralCode: {
        type: String,
        required: true,
        unique: true
    },
    commissionRate: {
        type: Number,
        default: 0.1 // Default commission rate (10%)
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    level: {
        type: Number,
        default: 0
    },
    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'IBConfiguration',
        default: null
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

// Generate unique referral code
IBClientConfigurationSchema.statics.generateReferralCode = function () {
    // Generate a 6-digit random alphanumeric code
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    return code;
};

// Method to get all downline partners (recursive)
IBClientConfigurationSchema.methods.getDownlinePartners = async function (maxLevel = 10) {
    const IBClientConfiguration = this.constructor;
    let partners = [];

    // Function to recursively get downline partners
    const getDownlines = async (parentId, currentLevel = 1) => {
        if (currentLevel > maxLevel) return; // Limit depth

        const downlines = await IClientConfiguration.find({ parent: parentId })
            .populate('userId', 'firstname lastname email')
            .lean();

        for (const downline of downlines) {
            partners.push({
                ...downline,
                level: currentLevel
            });

            // Recursively get next level
            await getDownlines(downline._id, currentLevel + 1);
        }
    };

    // Start recursive search from this IB
    await getDownlines(this._id);

    return partners;
};

const IBClientConfiguration = mongoose.model('IBClientConfiguration', IBClientConfigurationSchema);

module.exports = IBClientConfiguration;