// Backend/utils/socketServer.js (Integrated Chat + Notifications)
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');
const NotificationService = require('../services/notificationService');
const NotificationTriggers = require('../services/notificationTriggers');

/**
 * Set up WebSocket server for real-time chat and notifications
 * @param {Object} server - HTTP server instance
 */
const setupWebSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*", // You can change this to config.CLIENT_URL for production
            methods: ["GET", "POST"],
            credentials: true
        },
        transports: ['websocket', 'polling']
    });

    // Create notification service instances
    const notificationService = new NotificationService(io);
    const notificationTriggers = new NotificationTriggers(io);

    // Attach services to io for access in other parts of the app
    io.notificationService = notificationService;
    io.notificationTriggers = notificationTriggers;

    // Authentication middleware for Socket.io
    io.use(async (socket, next) => {
        try {
            // Support both auth methods for backward compatibility
            const token = socket.handshake.auth.token || socket.handshake.query.token;

            if (!token) {
                return next(new Error('Authentication error: Token not provided'));
            }

            // Verify the token
            const decoded = jwt.verify(token, config.JWT_SECRET);

            // Get user from the token
            const user = await User.findById(decoded.id).select('-password');

            if (!user) {
                return next(new Error('Authentication error: User not found'));
            }

            // Attach the user to the socket
            socket.user = user;
            socket.userId = user._id.toString(); // For notification compatibility
            next();
        } catch (error) {
            console.error('Socket authentication error:', error);
            return next(new Error('Authentication error: ' + error.message));
        }
    });

    // Handle connections
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.user.firstname} ${socket.user.lastname}`);

        // ==================== NOTIFICATION FUNCTIONALITY ====================

        // Join user to their personal notification room
        socket.join(`user_${socket.userId}`);

        // Join admin users to admin notification room
        if (['admin', 'superadmin'].includes(socket.user.role)) {
            socket.join('admin_room');
        }

        // Handle notification events
        socket.on('markNotificationAsRead', async (data) => {
            try {
                const { notificationId } = data;
                await notificationService.markAsRead(notificationId, socket.userId);
            } catch (error) {
                console.error('Error marking notification as read:', error);
                socket.emit('error', { message: 'Failed to mark notification as read' });
            }
        });

        socket.on('markAllNotificationsAsRead', async () => {
            try {
                await notificationService.markAllAsRead(socket.userId);
            } catch (error) {
                console.error('Error marking all notifications as read:', error);
                socket.emit('error', { message: 'Failed to mark all notifications as read' });
            }
        });

        socket.on('deleteNotification', async (data) => {
            try {
                const { notificationId } = data;
                await notificationService.deleteNotification(notificationId, socket.userId);
            } catch (error) {
                console.error('Error deleting notification:', error);
                socket.emit('error', { message: 'Failed to delete notification' });
            }
        });

        // ==================== CHAT/TICKET FUNCTIONALITY ====================

        // Join ticket room for chat
        socket.on('joinTicket', (ticketId) => {
            socket.join(`ticket:${ticketId}`);
            console.log(`User ${socket.user.firstname} joined ticket room: ${ticketId}`);
        });

        // Leave ticket room
        socket.on('leaveTicket', (ticketId) => {
            socket.leave(`ticket:${ticketId}`);
            console.log(`User ${socket.user.firstname} left ticket room: ${ticketId}`);
        });

        // Handle new message in ticket
        socket.on('sendMessage', async (data) => {
            try {
                // Emit the message to all users in the ticket room
                io.to(`ticket:${data.ticketId}`).emit('newMessage', {
                    ...data,
                    sender: {
                        _id: socket.user._id,
                        firstname: socket.user.firstname,
                        lastname: socket.user.lastname,
                        role: socket.user.role
                    },
                    createdAt: new Date()
                });

                // Optional: Trigger notification for new message
                // You can uncomment this if you want notifications for every message
                /*
                if (notificationTriggers && data.ticketId) {
                    const Ticket = require('../models/Ticket');
                    const ticket = await Ticket.findById(data.ticketId)
                        .populate('createdBy', 'firstname lastname email');
                    
                    if (ticket) {
                        await notificationTriggers.handleTicketMessageAdded(
                            {
                                sender: socket.user._id,
                                content: data.content,
                                ticketId: data.ticketId
                            },
                            ticket.toObject()
                        );
                    }
                }
                */
            } catch (error) {
                console.error('Error handling sendMessage:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Handle typing indicator
        socket.on('typing', (data) => {
            socket.to(`ticket:${data.ticketId}`).emit('userTyping', {
                user: `${socket.user.firstname} ${socket.user.lastname}`,
                isTyping: data.isTyping
            });
        });

        // ==================== GENERAL EVENTS ====================

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.user.firstname} ${socket.user.lastname}`);
        });

        // Send welcome message (for both notification and chat systems)
        socket.emit('connected', {
            message: 'Connected to notification and chat service',
            userId: socket.userId,
            user: {
                id: socket.user._id,
                name: `${socket.user.firstname} ${socket.user.lastname}`,
                role: socket.user.role
            }
        });

        // ==================== ADMIN SPECIFIC EVENTS ====================

        // Admin can join special admin rooms for notifications
        if (['admin', 'superadmin'].includes(socket.user.role)) {
            socket.on('joinAdminRoom', (roomType) => {
                socket.join(`admin_${roomType}`);
                console.log(`Admin ${socket.user.firstname} joined admin room: ${roomType}`);
            });

            socket.on('leaveAdminRoom', (roomType) => {
                socket.leave(`admin_${roomType}`);
                console.log(`Admin ${socket.user.firstname} left admin room: ${roomType}`);
            });
        }

        // ==================== UTILITY EVENTS ====================

        // Get online users count for a ticket
        socket.on('getTicketOnlineUsers', (ticketId) => {
            const room = io.sockets.adapter.rooms.get(`ticket:${ticketId}`);
            const onlineCount = room ? room.size : 0;
            socket.emit('ticketOnlineUsers', { ticketId, count: onlineCount });
        });

        // Get notification count
        socket.on('getNotificationCount', async () => {
            try {
                const Notification = require('../models/Notification');
                const unreadCount = await Notification.countDocuments({
                    recipient: socket.userId,
                    read: false
                });
                socket.emit('notificationCount', { count: unreadCount });
            } catch (error) {
                console.error('Error getting notification count:', error);
                socket.emit('error', { message: 'Failed to get notification count' });
            }
        });
    });

    // ==================== UTILITY FUNCTIONS ====================

    // Function to send notification to specific user
    io.sendNotificationToUser = (userId, notification) => {
        io.to(`user_${userId}`).emit('newNotification', notification);
    };

    // Function to send notification to all admins
    io.sendNotificationToAdmins = (notification) => {
        io.to('admin_room').emit('newNotification', notification);
    };

    // Function to send message to ticket room
    io.sendMessageToTicket = (ticketId, message) => {
        io.to(`ticket:${ticketId}`).emit('newMessage', message);
    };

    // Function to broadcast system notification
    io.broadcastSystemNotification = (notification) => {
        io.emit('systemNotification', notification);
    };

    return io;
};

module.exports = setupWebSocket;