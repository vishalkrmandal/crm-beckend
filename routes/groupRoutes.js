// backend/routes/groupRoutes.js
const express = require('express');
const {
    getGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    getMt5Groups
} = require('../controllers/groupController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

router.route('/')
    .get(getGroups)
    .post(protect, authorize('admin', 'superadmin'), createGroup);

router.route('/:id')
    .put(protect, authorize('admin', 'superadmin'), updateGroup)
    .delete(protect, authorize('admin', 'superadmin'), deleteGroup);

router.route('/mt5-groups')
    .get(protect, authorize('superadmin'), getMt5Groups);

module.exports = router;