// Backend/models/Notification.js
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: [
            'account_created',
            'deposit_status',
            'withdrawal_status',
            'transfer_success',
            'new_referral',
            'ticket_update',
            'profile_update',
            'new_signup'
        ],
        required: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    data: {
        type: Object,
        default: {}
    },
    read: {
        type: Boolean,
        default: false
    },
    readAt: {
        type: Date
    },
    emailSent: {
        type: Boolean,
        default: false
    },
    emailSentAt: {
        type: Date
    },
    relatedModel: {
        type: String,
        enum: ['Account', 'Deposit', 'Withdrawal', 'Transfer', 'Ticket', 'Message', 'Profile', 'IBClientConfiguration']
    },
    relatedId: {
        type: mongoose.Schema.Types.ObjectId
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for better performance
NotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ type: 1 });

// Virtual for time since creation
NotificationSchema.virtual('timeAgo').get(function () {
    const now = new Date();
    const diff = now - this.createdAt;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
});

module.exports = mongoose.model('Notification', NotificationSchema);