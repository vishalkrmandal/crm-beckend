// backend/websocket/socket.js
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const Message = require('../models/Message');
const Attachment = require('../models/Attachment');
const config = require('../config/config');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Initialize WebSocket server
const initializeWebSocket = (server) => {
    const io = socketIo(server, {
        cors: {
            origin: config.CLIENT_URL,
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    // Authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;

            if (!token) {
                return next(new Error('Authentication error: Token not provided'));
            }

            // Verify token
            const decoded = jwt.verify(token, config.JWT_SECRET);

            // Get user from token
            const user = await User.findById(decoded.id).select('-password');

            if (!user) {
                return next(new Error('User not found'));
            }

            // Add user data to socket
            socket.user = {
                id: user._id,
                firstname: user.firstname,
                lastname: user.lastname,
                role: user.role
            };

            next();
        } catch (error) {
            return next(new Error('Authentication error: Invalid token'));
        }
    });

    // Connection event
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.user.firstname} ${socket.user.lastname} (${socket.user.role})`);

        // Join user to their role room and personal room
        socket.join(socket.user.role);
        socket.join(socket.user.id.toString());

        // Handle joining a ticket room
        socket.on('joinTicket', async ({ ticketId }) => {
            try {
                const ticket = await Ticket.findById(ticketId);

                if (!ticket) {
                    socket.emit('error', { message: 'Ticket not found' });
                    return;
                }

                // Check if user is authorized to access this ticket
                if (socket.user.role === 'client' &&
                    ticket.createdBy.toString() !== socket.user.id.toString()) {
                    socket.emit('error', { message: 'Not authorized to access this ticket' });
                    return;
                }

                // Join the ticket room
                socket.join(`ticket:${ticketId}`);
                console.log(`${socket.user.firstname} joined ticket room: ${ticketId}`);

                socket.emit('joinedTicket', { ticketId });
            } catch (error) {
                socket.emit('error', { message: error.message });
            }
        });

        // Handle leaving a ticket room
        socket.on('leaveTicket', ({ ticketId }) => {
            socket.leave(`ticket:${ticketId}`);
            console.log(`${socket.user.firstname} left ticket room: ${ticketId}`);
        });

        // Handle file upload
        socket.on('uploadFile', async (data, callback) => {
            try {
                const { ticketId, file, fileName, fileType } = data;

                // Check ticket exists and user has access
                const ticket = await Ticket.findById(ticketId);

                if (!ticket) {
                    return callback({ success: false, message: 'Ticket not found' });
                }

                if (socket.user.role === 'client' &&
                    ticket.createdBy.toString() !== socket.user.id.toString()) {
                    return callback({ success: false, message: 'Not authorized to access this ticket' });
                }

                // Check if ticket is closed
                if (ticket.status === 'closed' || ticket.status === 'resolved') {
                    return callback({ success: false, message: 'Cannot upload to a closed ticket' });
                }

                // Check file type
                if (!fileType.startsWith('image/') && fileType !== 'application/pdf') {
                    return callback({ success: false, message: 'Only images and PDFs are allowed' });
                }

                // Decode base64 file
                const fileData = file.split(';base64,').pop();

                // Create directory if it doesn't exist
                const uploadDir = './uploads/tickets';
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                // Generate unique filename
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(fileName);
                const filePath = path.join(uploadDir, `ticket-${uniqueSuffix}${ext}`);

                // Save file
                fs.writeFileSync(filePath, fileData, { encoding: 'base64' });

                // Get file size
                const stats = fs.statSync(filePath);
                const fileSize = stats.size;

                // Create attachment record
                const attachment = new Attachment({
                    fileName: fileName,
                    fileSize: fileSize,
                    fileType: fileType,
                    filePath: filePath,
                    uploadedBy: socket.user.id
                });

                const savedAttachment = await attachment.save();

                // Return success with attachment info
                callback({
                    success: true,
                    attachment: savedAttachment
                });

            } catch (error) {
                console.error('File upload error:', error);
                callback({ success: false, message: 'File upload failed' });
            }
        });

        // Handle new message from client
        socket.on('newMessage', async ({ ticketId, content, attachmentId }) => {
            try {
                const ticket = await Ticket.findById(ticketId);

                if (!ticket) {
                    socket.emit('error', { message: 'Ticket not found' });
                    return;
                }

                // Check if user is authorized to access this ticket
                if (socket.user.role === 'client' &&
                    ticket.createdBy.toString() !== socket.user.id.toString()) {
                    socket.emit('error', { message: 'Not authorized to access this ticket' });
                    return;
                }

                // Check if ticket is closed
                if (ticket.status === 'closed' || ticket.status === 'resolved') {
                    socket.emit('error', { message: 'Cannot add message to a closed ticket' });
                    return;
                }

                // Create new message
                const newMessage = new Message({
                    ticketId: ticket._id,
                    sender: socket.user.id,
                    content
                });

                // Add attachment if provided
                if (attachmentId) {
                    newMessage.attachments.push(attachmentId);
                }

                // Save the message
                const savedMessage = await newMessage.save();

                // Add message to ticket
                ticket.messages.push(savedMessage._id);

                // Update status if admin/agent replies to a new ticket
                if (socket.user.role !== 'client' && ticket.status === 'new') {
                    ticket.status = 'inProgress';
                }

                // Update updatedAt
                ticket.updatedAt = Date.now();

                await ticket.save();

                // Populate message data
                const populatedMessage = await Message.findById(savedMessage._id)
                    .populate('sender', 'firstname lastname role')
                    .populate('attachments');

                // Emit message to all users in the ticket room
                io.to(`ticket:${ticketId}`).emit('messageReceived', {
                    ticketId,
                    message: populatedMessage,
                    status: ticket.status
                });

                // If client message, notify all admins
                if (socket.user.role === 'client') {
                    io.to('admin').to('superadmin').emit('newTicketActivity', {
                        ticketId,
                        subject: ticket.subject,
                        status: ticket.status,
                        clientName: `${socket.user.firstname} ${socket.user.lastname}`
                    });
                }
                // If admin message, notify client
                else {
                    io.to(ticket.createdBy.toString()).emit('newTicketActivity', {
                        ticketId,
                        subject: ticket.subject,
                        status: ticket.status,
                        agentName: `${socket.user.firstname} ${socket.user.lastname}`
                    });
                }
            } catch (error) {
                console.error('New message error:', error);
                socket.emit('error', { message: error.message });
            }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.user.firstname} ${socket.user.lastname}`);
        });
    });

    return io;
};

module.exports = initializeWebSocket;