// Backend/controllers/notificationController.js - Fixed Version
const NotificationService = require('../services/notificationService');
const Notification = require('../models/Notification');
const User = require('../models/User');

class NotificationController {
    // Get user notifications
    async getNotifications(req, res) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const userId = req.user._id;

            // Get io instance from app
            const io = req.app.get('io');
            if (!io || !io.notificationService) {
                return res.status(500).json({
                    success: false,
                    message: 'Notification service not available'
                });
            }

            const result = await io.notificationService.getUserNotifications(
                userId,
                parseInt(page),
                parseInt(limit)
            );

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error getting notifications:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get notifications'
            });
        }
    }

    // Get unread count
    async getUnreadCount(req, res) {
        try {
            const userId = req.user._id;

            const unreadCount = await Notification.countDocuments({
                recipient: userId,
                read: false
            });

            res.status(200).json({
                success: true,
                data: { unreadCount }
            });
        } catch (error) {
            console.error('Error getting unread count:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get unread count'
            });
        }
    }

    // Mark notification as read
    async markAsRead(req, res) {
        try {
            const { notificationId } = req.params;
            const userId = req.user._id;

            // Get io instance from app
            const io = req.app.get('io');
            if (!io || !io.notificationService) {
                return res.status(500).json({
                    success: false,
                    message: 'Notification service not available'
                });
            }

            const notification = await io.notificationService.markAsRead(notificationId, userId);

            if (!notification) {
                return res.status(404).json({
                    success: false,
                    message: 'Notification not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Notification marked as read'
            });
        } catch (error) {
            console.error('Error marking notification as read:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark notification as read'
            });
        }
    }

    // Mark all notifications as read
    async markAllAsRead(req, res) {
        try {
            const userId = req.user._id;

            // Get io instance from app
            const io = req.app.get('io');
            if (!io || !io.notificationService) {
                return res.status(500).json({
                    success: false,
                    message: 'Notification service not available'
                });
            }

            await io.notificationService.markAllAsRead(userId);

            res.status(200).json({
                success: true,
                message: 'All notifications marked as read'
            });
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark all notifications as read'
            });
        }
    }

    // Delete notification
    async deleteNotification(req, res) {
        try {
            const { notificationId } = req.params;
            const userId = req.user._id;

            // Get io instance from app
            const io = req.app.get('io');
            if (!io || !io.notificationService) {
                return res.status(500).json({
                    success: false,
                    message: 'Notification service not available'
                });
            }

            const notification = await io.notificationService.deleteNotification(notificationId, userId);

            if (!notification) {
                return res.status(404).json({
                    success: false,
                    message: 'Notification not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Notification deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting notification:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete notification'
            });
        }
    }
}

module.exports = new NotificationController();