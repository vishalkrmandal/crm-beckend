// backend/models/Group.js
const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a name'],
    },
    value: {
        type: String,
        required: [true, 'Please add a value'],
    },
    description: {
        type: String,
        required: [true, 'Please add a description'],
    },
}, { timestamps: true });

module.exports = mongoose.model('Group', GroupSchema);