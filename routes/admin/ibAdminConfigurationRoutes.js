// backend/routes/ibAdminConfigurationRoutes.js
const express = require('express');
const {
    getIBConfigurationsByGroup,
    getAllGroupsWithConfigurations,
    createIBConfiguration,
    updateIBConfiguration,
    deleteIBConfiguration
} = require('../../controllers/admin/ibAdminConfigurationController');
const { protect, authorize } = require('../../middlewares/auth');

const router = express.Router();

// All routes require authentication and admin authorization
router.use(protect);
router.use(authorize('admin'));

router.route('/groups')
    .get(getAllGroupsWithConfigurations);

router.route('/group/:groupId')
    .get(getIBConfigurationsByGroup);

router.route('/')
    .post(createIBConfiguration);

router.route('/:id')
    .put(updateIBConfiguration)
    .delete(deleteIBConfiguration);

module.exports = router;