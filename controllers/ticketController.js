// backend/controllers/ticketController.js (updates)
const Ticket = require('../models/Ticket');
const Message = require('../models/Message');
const Attachment = require('../models/Attachment');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const { createAttachment } = require('../utils/fileUtils');

// @desc    Create a new ticket
// @route   POST /api/tickets
// @access  Private
exports.createTicket = async (req, res, next) => {
    try {
        const { subject, category, description, clientId } = req.body;

        // Determine the creator ID
        let creatorId;

        // If clientId is provided and the current user is an admin, use the clientId
        if (clientId && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
            creatorId = clientId;
        } else {
            // Otherwise, use the current user's ID
            creatorId = req.user._id;
        }

        // Generate the ticket number
        const count = await Ticket.countDocuments();
        const ticketNumber = `T-${(10001 + count).toString()}`;

        // Create the ticket with the generated ticket number
        const ticket = new Ticket({
            ticketNumber,
            subject,
            description,
            category,
            createdBy: creatorId,
            status: 'new'
        });

        // If the current user is an admin, assign the ticket to them
        if (req.user.role === 'admin' || req.user.role === 'superadmin') {
            ticket.assignedTo = req.user._id;
        }

        // If there's an attachment, create an attachment record
        if (req.file) {
            const attachment = await createAttachment(req.file, req.user._id);
            ticket.attachments.push(attachment._id);
        }

        // Save the ticket
        await ticket.save();

        // Populate ticket data for notifications
        await ticket.populate('createdBy', 'firstname lastname email');

        // Trigger notifications
        if (req.notificationTriggers) {
            await req.notificationTriggers.handleTicketUpdate(
                ticket.toObject(),
                'created'
            );
        }

        // Create initial message from the creator
        const message = new Message({
            ticketId: ticket._id,
            sender: req.user._id, // The message is from the current user, not necessarily the ticket creator
            content: description
        });

        // If there's an attachment, link it to the message
        if (req.file) {
            const attachment = await Attachment.findOne({
                uploadedBy: req.user._id,
                fileName: req.file.originalname
            }).sort({ createdAt: -1 });

            if (attachment) {
                message.attachments.push(attachment._id);
            }
        }

        await message.save();

        // Link message to ticket
        ticket.messages.push(message._id);
        await ticket.save();

        // If admin created the ticket for a client, notify the client
        // if (clientId && req.user.role !== 'client') {
        //     const client = await User.findById(clientId);

        //     if (client) {
        //         await sendEmail({
        //             email: client.email,
        //             subject: `New Support Ticket Created: ${ticket.ticketNumber}`,
        //             message: `
        //                 <h1>New Support Ticket Created</h1>
        //                 <p>A support ticket has been created on your behalf.</p>
        //                 <p><strong>Ticket Number:</strong> ${ticket.ticketNumber}</p>
        //                 <p><strong>Subject:</strong> ${subject}</p>
        //                 <p><strong>Description:</strong> ${description}</p>
        //                 <p>You can view the details and respond in your client portal.</p>
        //             `
        //         });
        //     }
        // } else {
        //     // If client created the ticket, notify admins
        //     const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } });

        //     // Send email notification to admins
        //     for (const admin of admins) {
        //         await sendEmail({
        //             email: admin.email,
        //             subject: 'New Support Ticket Created',
        //             message: `
        //                 <h1>New Ticket: ${ticket.ticketNumber}</h1>
        //                 <p><strong>Subject:</strong> ${subject}</p>
        //                 <p><strong>Category:</strong> ${category}</p>
        //                 <p><strong>Created by:</strong> ${req.user.firstname} ${req.user.lastname}</p>
        //                 <p><strong>Description:</strong> ${description}</p>
        //                 <p>Please log in to the admin portal to respond.</p>
        //             `
        //         });
        //     }
        // }

        res.status(201).json({
            success: true,
            data: ticket
        });
    } catch (error) {
        next(error);
    }
};


// @desc    Get all tickets (filtered by user role)
// @route   GET /api/tickets
// @access  Private
exports.getTickets = async (req, res, next) => {
    try {
        console.log('User:', req.user);
        console.log('Request:', req);
        let query = {};

        // If user is a client, only show their tickets
        if (req.user.role === 'client') {
            query.createdBy = req.user._id;
        }

        // Add filters if provided
        if (req.query.status) {
            query.status = req.query.status;
        }

        if (req.query.category) {
            query.category = req.query.category;
        }

        // Add search if provided
        if (req.query.search) {
            query.$or = [
                { subject: { $regex: req.query.search, $options: 'i' } },
                { description: { $regex: req.query.search, $options: 'i' } },
                { ticketNumber: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        const tickets = await Ticket.find(query)
            .populate('createdBy', 'firstname lastname email')
            .populate('assignedTo', 'firstname lastname email')
            .sort({ updatedAt: -1 });


        console.log('Tickets:', tickets);
        res.status(200).json({
            success: true,
            count: tickets.length,
            data: tickets
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get a single ticket
// @route   GET /api/tickets/:id
// @access  Private
exports.getTicketById = async (req, res, next) => {
    try {
        const ticket = await Ticket.findById(req.params.id)
            .populate('createdBy', 'firstname lastname email')
            .populate('assignedTo', 'firstname lastname email')
            .populate({
                path: 'messages',
                populate: [
                    {
                        path: 'sender',
                        select: 'firstname lastname email role'
                    },
                    {
                        path: 'attachments',
                        select: 'fileName fileSize fileType filePath'
                    }
                ]
            })
            .populate('attachments');

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Check if user is authorized to view this ticket
        if (req.user.role === 'client' && ticket.createdBy._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this ticket'
            });
        }

        res.status(200).json({
            success: true,
            data: ticket
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update a ticket
// @route   PUT /api/tickets/:id
// @access  Private (Admin, SuperAdmin, and Agent)
exports.updateTicket = async (req, res, next) => {
    try {
        let ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Get the old status to check if it changed
        const oldStatus = ticket.status;

        // Update the ticket
        ticket = await Ticket.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        // If status was changed, send email notification to the client
        if (oldStatus !== ticket.status) {
            const user = await User.findById(ticket.createdBy);

            // Populate ticket data for notifications
            await ticket.populate('createdBy', 'firstname lastname email');

            // Trigger notifications for status change
            if (oldStatus !== ticket.status && req.notificationTriggers) {
                await req.notificationTriggers.handleTicketUpdate(
                    ticket.toObject(),
                    'status changed'
                );
            }

            // if (user) {
            //     await sendEmail({
            //         email: user.email,
            //         subject: `Ticket Status Updated: ${ticket.ticketNumber}`,
            //         message: `
            //             <h1>Ticket Status Update</h1>
            //             <p>Your ticket <strong>${ticket.ticketNumber}</strong> has been updated.</p>
            //             <p><strong>Subject:</strong> ${ticket.subject}</p>
            //             <p><strong>New Status:</strong> ${ticket.status}</p>
            //             <p>You can view the details in your client portal.</p>
            //         `
            //     });
            // }
        }

        res.status(200).json({
            success: true,
            data: ticket
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Add a message to a ticket
// @route   POST /api/tickets/:id/messages
// @access  Private
exports.addMessage = async (req, res, next) => {
    try {
        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Check if user is authorized to add message to this ticket
        if (
            req.user.role === 'client' &&
            ticket.createdBy.toString() !== req.user._id.toString()
        ) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this ticket'
            });
        }

        // If ticket is closed, don't allow new messages
        if (ticket.status === 'closed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot add messages to a closed ticket'
            });
        }

        const { content } = req.body;

        // Create the message
        const message = new Message({
            ticketId: ticket._id,
            sender: req.user._id,
            content
        });

        // If there's an attachment, create an attachment record
        if (req.file) {
            const attachment = await createAttachment(req.file, req.user._id);
            message.attachments.push(attachment._id);
        }

        await message.save();

        // Add message to ticket
        ticket.messages.push(message._id);
        ticket.updatedAt = Date.now();
        await ticket.save();

        // Populate message with sender info
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'firstname lastname email role')
            .populate('attachments');


        // Populate ticket data for notifications
        await ticket.populate('createdBy', 'firstname lastname email');

        // Trigger notifications for new message
        if (req.notificationTriggers) {
            await req.notificationTriggers.handleTicketMessageAdded(
                populatedMessage.toObject(),
                ticket.toObject()
            );
        }

        // Send email notification
        // let recipient;
        // if (req.user.role === 'client') {
        //     // If client sent message, notify assigned admin
        //     if (ticket.assignedTo) {
        //         recipient = await User.findById(ticket.assignedTo);
        //     } else {
        //         // If no assigned admin, find an admin
        //         recipient = await User.findOne({ role: 'admin' });
        //     }
        // } else {
        //     // If admin sent message, notify client
        //     recipient = await User.findById(ticket.createdBy);
        // }

        // if (recipient) {
        //     await sendEmail({
        //         email: recipient.email,
        //         subject: `New Message on Ticket: ${ticket.ticketNumber}`,
        //         message: `
        //             <h1>New Message on Ticket ${ticket.ticketNumber}</h1>
        //             <p><strong>Subject:</strong> ${ticket.subject}</p>
        //             <p><strong>Message from:</strong> ${req.user.firstname} ${req.user.lastname}</p>
        //             <p><strong>Message:</strong> ${content}</p>
        //             <p>Please log in to the portal to respond.</p>
        //         `
        //     });
        // }

        res.status(201).json({
            success: true,
            data: populatedMessage
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get ticket statistics
// @route   GET /api/tickets/stats
// @access  Private (Admin only)
exports.getTicketStats = async (req, res, next) => {
    try {
        const totalTickets = await Ticket.countDocuments();
        const newTickets = await Ticket.countDocuments({ status: 'new' });
        const openTickets = await Ticket.countDocuments({ status: 'open' });
        const inProgressTickets = await Ticket.countDocuments({ status: 'inProgress' });
        const resolvedTickets = await Ticket.countDocuments({ status: 'resolved' });
        const closedTickets = await Ticket.countDocuments({ status: 'closed' });

        // Get monthly trends (last 12 months)
        const today = new Date();
        const oneYearAgo = new Date(today);
        oneYearAgo.setMonth(oneYearAgo.getMonth() - 12);

        const monthlyTrends = await Ticket.aggregate([
            {
                $match: {
                    createdAt: { $gte: oneYearAgo }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: '$createdAt' },
                        year: { $year: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: {
                    '_id.year': 1,
                    '_id.month': 1
                }
            }
        ]);

        // Format monthly trends data
        const trends = monthlyTrends.map(item => ({
            date: `${item._id.year}-${item._id.month}`,
            count: item.count
        }));

        res.status(200).json({
            success: true,
            data: {
                totalTickets,
                newTickets,
                openTickets,
                inProgressTickets,
                resolvedTickets,
                closedTickets,
                trends
            }
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get ticket statistics for a specific client
// @route   GET /api/tickets/client/:clientId/stats
// @access  Private (Admin only)
exports.getClientTicketStats = async (req, res, next) => {
    try {
        const { clientId } = req.params;

        // Get total tickets for this client
        const totalTickets = await Ticket.countDocuments({ createdBy: clientId });
        const openTickets = await Ticket.countDocuments({
            createdBy: clientId,
            status: { $in: ['new', 'open', 'inProgress'] }
        });
        const closedTickets = await Ticket.countDocuments({
            createdBy: clientId,
            status: 'closed'
        });

        res.status(200).json({
            success: true,
            data: {
                totalTickets,
                openTickets,
                closedTickets
            }
        });
    } catch (error) {
        next(error);
    }
};


exports.getClientTickets = async (req, res, next) => {
    try {
        const { clientId } = req.params;

        // Find tickets for this client
        const tickets = await Ticket.find({ createdBy: clientId })
            .populate('createdBy', 'firstname lastname email')
            .populate('assignedTo', 'firstname lastname email')
            .sort({ updatedAt: -1 });

        res.status(200).json({
            success: true,
            count: tickets.length,
            data: tickets
        });
    } catch (error) {
        next(error);
    }
};