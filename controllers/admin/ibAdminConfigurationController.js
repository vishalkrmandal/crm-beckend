// backend/controllers/ibConfigurationController.js
const IBConfiguration = require('../../models/admin/IBAdminConfiguration');
const Group = require('../../models/Group');

// Get all IB configurations for a specific group
exports.getIBConfigurationsByGroup = async (req, res) => {
    try {
        const { groupId } = req.params;

        // Validate group exists
        const groupExists = await Group.findById(groupId);
        if (!groupExists) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        const configurations = await IBConfiguration.find({ groupId })
            .sort({ level: 1 })
            .populate('groupId', 'name value');

        res.status(200).json({
            success: true,
            count: configurations.length,
            data: configurations
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Could not fetch IB configurations',
            error: error.message
        });
    }
};

// Get all groups with their IB configurations
exports.getAllGroupsWithConfigurations = async (req, res) => {
    try {
        const groups = await Group.find();

        const groupsWithConfigs = await Promise.all(groups.map(async (group) => {
            const configurations = await IBConfiguration.find({ groupId: group._id })
                .sort({ level: 1 });

            return {
                _id: group._id,
                name: group.name,
                value: group.value,
                description: group.description,
                configurations
            };
        }));

        res.status(200).json({
            success: true,
            count: groupsWithConfigs.length,
            data: groupsWithConfigs
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Could not fetch groups with configurations',
            error: error.message
        });
    }
};

// Create new IB configuration
exports.createIBConfiguration = async (req, res) => {
    try {
        const { groupId, level, bonusPerLot, defaultTimeInSeconds } = req.body;

        // Validate group exists
        const groupExists = await Group.findById(groupId);
        if (!groupExists) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        // Check if level already exists for this group
        const existingConfig = await IBConfiguration.findOne({ groupId, level });
        if (existingConfig) {
            return res.status(400).json({
                success: false,
                message: `Level ${level} already exists for this group`
            });
        }

        // Validate level is between 1 and 10
        if (level < 1 || level > 10) {
            return res.status(400).json({
                success: false,
                message: 'Level must be between 1 and 10'
            });
        }

        const newConfig = await IBConfiguration.create({
            groupId,
            level,
            bonusPerLot,
            defaultTimeInSeconds: defaultTimeInSeconds || 0
        });

        res.status(201).json({
            success: true,
            data: newConfig
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Could not create IB configuration',
            error: error.message
        });
    }
};

// Update IB configuration
exports.updateIBConfiguration = async (req, res) => {
    try {
        const { id } = req.params;
        const { bonusPerLot, defaultTimeInSeconds } = req.body;

        // Make sure only bonus amount can be updated, not group or level
        const updatedConfig = await IBConfiguration.findByIdAndUpdate(
            id,
            { bonusPerLot, ...(defaultTimeInSeconds !== undefined && { defaultTimeInSeconds }) },
            { new: true, runValidators: true }
        );

        if (!updatedConfig) {
            return res.status(404).json({
                success: false,
                message: 'IB configuration not found'
            });
        }

        res.status(200).json({
            success: true,
            data: updatedConfig
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Could not update IB configuration',
            error: error.message
        });
    }
};

// Add this new function
exports.updateGroupDefaultTime = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { defaultTimeInSeconds } = req.body;

        // Update all configurations for this group
        const updatedConfigs = await IBConfiguration.updateMany(
            { groupId },
            { defaultTimeInSeconds },
            { runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: `Updated ${updatedConfigs.modifiedCount} configurations`,
            data: updatedConfigs
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Could not update group default time',
            error: error.message
        });
    }
};

// Delete IB configuration
exports.deleteIBConfiguration = async (req, res) => {
    try {
        const { id } = req.params;

        const deletedConfig = await IBConfiguration.findByIdAndDelete(id);

        if (!deletedConfig) {
            return res.status(404).json({
                success: false,
                message: 'IB configuration not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Could not delete IB configuration',
            error: error.message
        });
    }
};

