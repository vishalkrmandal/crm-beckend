// backend/services/emailService.js
const nodemailer = require('nodemailer');
const config = require('../config/config');
const { verificationEmailTemplate, passwordResetTemplate } = require('../utils/emailTemplates');

const sendEmail = async (options) => {
    // Create transporter
    const transporter = nodemailer.createTransport({
        service: config.EMAIL_SERVICE,
        auth: {
            user: config.EMAIL_USERNAME,
            pass: config.EMAIL_PASSWORD
        }
    });

    // Define email options
    const mailOptions = {
        from: `"vishal mandal" <${config.EMAIL_FROM}>`,
        to: options.to,
        subject: options.subject,
        html: options.html
    };

    // Send email
    await transporter.sendMail(mailOptions);
};

const sendVerificationEmail = async (user, verificationToken) => {
    const verificationURL = `${config.SERVER_URL}/api/auth/verify-email/${verificationToken}`;

    await sendEmail({
        to: user.email,
        subject: 'Email Verification',
        html: verificationEmailTemplate(user.firstname, verificationURL)
    });
};


// Add new function
const sendPasswordResetEmail = async (user, resetToken) => {
    const resetURL = `${config.CLIENT_URL}/reset-password/${resetToken}`;

    await sendEmail({
        to: user.email,
        subject: 'Password Reset',
        html: passwordResetTemplate(user.firstname, resetURL)
    });
};

// Update module exports
module.exports = {
    sendEmail,
    sendVerificationEmail,
    sendPasswordResetEmail
};

