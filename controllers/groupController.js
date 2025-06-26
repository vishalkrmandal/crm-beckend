// backend/controllers/groupController.js
const Group = require('../models/Group');
const axios = require('axios');

// @desc    Get all groups
// @route   GET /api/groups
// @access  Public
exports.getGroups = async (req, res, next) => {
    try {
        const groups = await Group.find();

        res.status(200).json({
            success: true,
            count: groups.length,
            data: groups
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Create new group
// @route   POST /api/groups
// @access  Private/Admin
exports.createGroup = async (req, res, next) => {
    try {
        const group = await Group.create(req.body);

        res.status(201).json({
            success: true,
            data: group
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update group
// @route   PUT /api/groups/:id
// @access  Private/Admin
exports.updateGroup = async (req, res, next) => {
    try {
        let group = await Group.findById(req.params.id);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: `Group not found with id of ${req.params.id}`
            });
        }

        group = await Group.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: group
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete group
// @route   DELETE /api/groups/:id
// @access  Private/Admin
exports.deleteGroup = async (req, res, next) => {
    try {
        const group = await Group.findById(req.params.id);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: `Group not found with id of ${req.params.id}`
            });
        }

        await group.deleteOne();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get MT5 groups from external API
// @route   GET /api/groups/mt5-groups
// @access  Private/Admin
exports.getMt5Groups = async (req, res, next) => {
    try {
        const managerIndex = process.env.Manager_Index;
        const mt5ApiUrl = process.env.MT5_API_URL;

        const response = await axios.get(`${mt5ApiUrl}/GetGroups?Manager_Index=${managerIndex}`);
        res.status(200).json({
            success: true,
            data: response.data
        });

        console.log(response.data);
    } catch (error) {
        next(error);
    }
};