const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const User = require('../models/User');

// Get all clients (with optional filtering)
router.get('/', protect, async (req, res, next) => {
    try {
        let query = {};

        // Handle role parameter - properly process comma-separated roles
        if (req.query.role) {
            // Check if it's a comma-separated list
            if (req.query.role.includes(',')) {
                // Split the string into an array
                const roles = req.query.role.split(',');
                query.role = { $in: roles };
            } else {
                query.role = req.query.role;
            }
        }

        const clients = await User.find(query).select('-password');

        res.status(200).json({
            success: true,
            count: clients.length,
            data: clients
        });
    } catch (error) {
        next(error);
    }
});

// Get client by ID
router.get('/:id', protect, async (req, res, next) => {
    try {
        const client = await User.findById(req.params.id).select('-password');

        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        res.status(200).json({
            success: true,
            data: client
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
