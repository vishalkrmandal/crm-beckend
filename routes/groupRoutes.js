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
    .post(protect, authorize('admin'), createGroup);

router.route('/:id')
    .put(protect, authorize('admin'), updateGroup)
    .delete(protect, authorize('admin'), deleteGroup);

router.route('/mt5-groups')
    .get(protect, authorize('admin'), getMt5Groups);

module.exports = router;