// backend/controllers/leverageController.js
const Leverage = require('../models/Leverage');

// @desc    Get all leverages
// @route   GET /api/leverages
// @access  Public
exports.getLeverages = async (req, res, next) => {
    try {
        const leverages = await Leverage.find();

        res.status(200).json({
            success: true,
            count: leverages.length,
            data: leverages
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Create new leverage
// @route   POST /api/leverages
// @access  Private/Admin
exports.createLeverage = async (req, res, next) => {
    try {
        const leverage = await Leverage.create(req.body);

        res.status(201).json({
            success: true,
            data: leverage
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update leverage
// @route   PUT /api/leverages/:id
// @access  Private/Admin
exports.updateLeverage = async (req, res, next) => {
    try {
        let leverage = await Leverage.findById(req.params.id);

        if (!leverage) {
            return res.status(404).json({
                success: false,
                message: `Leverage not found with id of ${req.params.id}`
            });
        }

        leverage = await Leverage.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: leverage
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete leverage
// @route   DELETE /api/leverages/:id
// @access  Private/Admin
exports.deleteLeverage = async (req, res, next) => {
    try {
        const leverage = await Leverage.findById(req.params.id);

        if (!leverage) {
            return res.status(404).json({
                success: false,
                message: `Leverage not found with id of ${req.params.id}`
            });
        }

        await leverage.deleteOne();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        next(error);
    }
};