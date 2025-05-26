// backend/models/IBConfiguration.js
const mongoose = require('mongoose');

const IBAdminConfigurationSchema = new mongoose.Schema({
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        required: [true, 'Group ID is required']
    },
    level: {
        type: Number,
        required: [true, 'Level number is required'],
        min: 1,
        max: 10
    },
    bonusPerLot: {
        type: Number,
        required: [true, 'Bonus amount per lot is required'],
        min: 0
    }
}, { timestamps: true });

// Compound index to ensure unique level per group
IBAdminConfigurationSchema.index({ groupId: 1, level: 1 }, { unique: true });

module.exports = mongoose.model('IBAdminConfiguration', IBAdminConfigurationSchema);