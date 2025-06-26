// Backend/services/notificationService.js (Updated to work with integrated socket)
const Notification = require('../models/Notification');
const User = require('../models/User');
const emailService = require('./notificationEmailService');

class NotificationService {
    constructor(io) {
        this.io = io;
    }

    // Create and send notification
    async createNotification({
        recipients,
        title,
        message,
        type,
        priority = 'medium',
        data = {},
        relatedModel,
        relatedId,
        sendEmail = true
    }) {
        try {
            const notifications = [];

            // Ensure recipients is an array
            const recipientIds = Array.isArray(recipients) ? recipients : [recipients];

            for (const recipientId of recipientIds) {
                const notification = await Notification.create({
                    recipient: recipientId,
                    title,
                    message,
                    type,
                    priority,
                    data,
                    relatedModel,
                    relatedId
                });

                await notification.populate('recipient', 'firstname lastname email');
                notifications.push(notification);

                // Send real-time notification via WebSocket
                this.sendRealTimeNotification(recipientId, notification);

                // Send email notification
                if (sendEmail) {
                    this.sendEmailNotification(notification);
                }
            }

            return notifications;
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    }

    // Send real-time notification via WebSocket (Updated for integrated socket)
    sendRealTimeNotification(userId, notification) {
        try {
            if (this.io) {
                // Use the utility function we added to the socket server
                if (this.io.sendNotificationToUser) {
                    this.io.sendNotificationToUser(userId, {
                        id: notification._id,
                        title: notification.title,
                        message: notification.message,
                        type: notification.type,
                        priority: notification.priority,
                        data: notification.data,
                        timeAgo: notification.timeAgo,
                        createdAt: notification.createdAt
                    });
                } else {
                    // Fallback to direct room emission
                    this.io.to(`user_${userId}`).emit('newNotification', {
                        id: notification._id,
                        title: notification.title,
                        message: notification.message,
                        type: notification.type,
                        priority: notification.priority,
                        data: notification.data,
                        timeAgo: notification.timeAgo,
                        createdAt: notification.createdAt
                    });
                }
            }
        } catch (error) {
            console.error('Error sending real-time notification:', error);
        }
    }

    // Send email notification
    async sendEmailNotification(notification) {
        try {
            if (!notification.recipient.email) return;

            const emailTemplate = this.getEmailTemplate(notification);

            await emailService.sendEmail({
                to: notification.recipient.email,
                subject: notification.title,
                html: emailTemplate
            });

            // Mark email as sent
            await Notification.findByIdAndUpdate(notification._id, {
                emailSent: true,
                emailSentAt: new Date()
            });

        } catch (error) {
            console.error('Error sending email notification:', error);
        }
    }

    // Get notification for specific user
    async getUserNotifications(userId, page = 1, limit = 20) {
        try {
            const skip = (page - 1) * limit;

            const notifications = await Notification.find({ recipient: userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('recipient', 'firstname lastname');

            const total = await Notification.countDocuments({ recipient: userId });
            const unreadCount = await Notification.countDocuments({
                recipient: userId,
                read: false
            });

            return {
                notifications,
                pagination: {
                    current: page,
                    pages: Math.ceil(total / limit),
                    total,
                    limit
                },
                unreadCount
            };
        } catch (error) {
            console.error('Error getting user notifications:', error);
            throw error;
        }
    }

    // Mark notification as read
    async markAsRead(notificationId, userId) {
        try {
            const notification = await Notification.findOneAndUpdate(
                { _id: notificationId, recipient: userId },
                { read: true, readAt: new Date() },
                { new: true }
            );

            if (notification && this.io) {
                // Send real-time update
                this.io.to(`user_${userId}`).emit('notificationRead', {
                    notificationId: notification._id
                });
            }

            return notification;
        } catch (error) {
            console.error('Error marking notification as read:', error);
            throw error;
        }
    }

    // Mark all notifications as read for a user
    async markAllAsRead(userId) {
        try {
            await Notification.updateMany(
                { recipient: userId, read: false },
                { read: true, readAt: new Date() }
            );

            // Send real-time update
            if (this.io) {
                this.io.to(`user_${userId}`).emit('allNotificationsRead');
            }

            return true;
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            throw error;
        }
    }

    // Delete notification
    async deleteNotification(notificationId, userId) {
        try {
            const notification = await Notification.findOneAndDelete({
                _id: notificationId,
                recipient: userId
            });

            if (notification && this.io) {
                // Send real-time update
                this.io.to(`user_${userId}`).emit('notificationDeleted', {
                    notificationId: notification._id
                });
            }

            return notification;
        } catch (error) {
            console.error('Error deleting notification:', error);
            throw error;
        }
    }

    // Get email template for different notification types
    getEmailTemplate(notification) {
        const { type, title, message, recipient, data } = notification;
        const userName = `${recipient.firstname} ${recipient.lastname}`;

        const baseTemplate = (content) => `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                    .notification-badge { background: #28a745; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px; display: inline-block; margin-bottom: 20px; }
                    .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔔 Test CRM Notification</h1>
                        <p>Important update for your account</p>
                    </div>
                    <div class="content">
                        <div class="notification-badge">${type.replace('_', ' ').toUpperCase()}</div>
                        <h2>Hi ${userName}!</h2>
                        ${content}
                        <div class="footer">
                            <p>This is an automated notification from Test CRM.</p>
                            <p>If you have any questions, please contact our support team.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;

        // Return appropriate template based on notification type
        switch (type) {
            case 'account_created':
                return baseTemplate(`
                    <p>${message}</p>
                    <div class="details">
                        <h3>📊 Account Details</h3>
                        <p><strong>MT5 Account:</strong> ${data.mt5Account || 'N/A'}</p>
                        <p><strong>Account Type:</strong> ${data.accountType || 'N/A'}</p>
                        <p><strong>Leverage:</strong> ${data.leverage || 'N/A'}</p>
                        <p><strong>Platform:</strong> MetaTrader 5</p>
                    </div>
                `);

            case 'deposit_status':
                const statusColor = data.status === 'Approved' ? '#28a745' : data.status === 'Rejected' ? '#dc3545' : '#ffc107';
                return baseTemplate(`
                    <p>${message}</p>
                    <div class="details">
                        <h3>💰 Deposit Information</h3>
                        <p><strong>Amount:</strong> $${data.amount || 'N/A'}</p>
                        <p><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${data.status || 'N/A'}</span></p>
                        <p><strong>Payment Method:</strong> ${data.paymentMethod || 'N/A'}</p>
                    </div>
                `);

            case 'ticket_update':
                return baseTemplate(`
                    <p>${message}</p>
                    <div class="details">
                        <h3>🎫 Ticket Information</h3>
                        <p><strong>Ticket Number:</strong> ${data.ticketNumber || 'N/A'}</p>
                        <p><strong>Subject:</strong> ${data.subject || 'N/A'}</p>
                        <p><strong>Status:</strong> ${data.status || 'N/A'}</p>
                    </div>
                `);

            default:
                return baseTemplate(`
                    <p>${message}</p>
                    <div class="details">
                        <h3>📋 Details</h3>
                        <p>Please check your account for more information.</p>
                    </div>
                `);
        }
    }

    // Clean up old notifications (keep last 90 days)
    async cleanupOldNotifications(daysToKeep = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            const result = await Notification.deleteMany({
                createdAt: { $lt: cutoffDate }
            });

            return result.deletedCount;
        } catch (error) {
            console.error('Error cleaning up old notifications:', error);
            throw error;
        }
    }

    // Get all admin users
    async getAdminUsers() {
        try {
            return await User.find({
                role: { $in: ['admin', 'superadmin'] },
                status: 'activated'
            }).select('_id');
        } catch (error) {
            console.error('Error getting admin users:', error);
            return [];
        }
    }
}

module.exports = NotificationService;