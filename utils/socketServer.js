// Backend\utils\socketServer.js
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');

/**
 * Set up WebSocket server for real-time chat
 * @param {Object} server - HTTP server instance
 */
const setupWebSocket = (server) => {
    const io = require('socket.io')(server, {
        cors: {
            origin: config.CLIENT_URL,
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    // Authentication middleware for Socket.io
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;

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
            next();
        } catch (error) {
            return next(new Error('Authentication error: ' + error.message));
        }
    });

    // Handle connections
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.user.firstname} ${socket.user.lastname}`);

        // Join ticket room
        socket.on('joinTicket', (ticketId) => {
            socket.join(`ticket:${ticketId}`);
            console.log(`User ${socket.user.firstname} joined ticket room: ${ticketId}`);
        });

        // Leave ticket room
        socket.on('leaveTicket', (ticketId) => {
            socket.leave(`ticket:${ticketId}`);
            console.log(`User ${socket.user.firstname} left ticket room: ${ticketId}`);
        });

        // Handle new message
        socket.on('sendMessage', async (data) => {
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
        });

        // Handle typing indicator
        socket.on('typing', (data) => {
            socket.to(`ticket:${data.ticketId}`).emit('userTyping', {
                user: `${socket.user.firstname} ${socket.user.lastname}`,
                isTyping: data.isTyping
            });
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.user.firstname} ${socket.user.lastname}`);
        });
    });

    return io;
};

module.exports = setupWebSocket;