// backend/models/User.js - Updated with referral field
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
    firstname: {
        type: String,
        required: [true, 'First name is required']
    },
    lastname: {
        type: String,
        required: [true, 'Last name is required']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    role: {
        type: String,
        enum: ['client', 'admin', 'superadmin'],
        default: 'client'
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 6,
        select: false
    },
    country: {
        name: {
            type: String,
            required: [true, 'Country is required']
        },
        state: {
            type: String
        }
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required']
    },
    dateofbirth: {
        type: Date,
        required: [true, 'Date of birth is required']
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['activated', 'suspended'],
        default: 'activated'
    },
    referredBy: {
        type: String,
        default: null
    },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-save middleware to hash password
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to check if password is correct
UserSchema.methods.isPasswordCorrect = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Method to generate email verification token
UserSchema.methods.generateEmailVerificationToken = function () {
    const verificationToken = crypto.randomBytes(32).toString('hex');

    this.emailVerificationToken = crypto
        .createHash('sha256')
        .update(verificationToken)
        .digest('hex');

    this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;

    return verificationToken;
};

// Method to generate password reset token
UserSchema.methods.generatePasswordResetToken = function () {
    const resetToken = crypto.randomBytes(32).toString('hex');

    this.passwordResetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

    return resetToken;
};

const User = mongoose.model('User', UserSchema);

module.exports = User;