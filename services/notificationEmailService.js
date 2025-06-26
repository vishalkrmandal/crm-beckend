// Backend/services/emailService.js - Fixed
const nodemailer = require('nodemailer');
const config = require('../config/config');

class EmailService {
    constructor() {
        this.transporter = this.createTransporter();
    }

    createTransporter() {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    }

    async sendEmail({ to, subject, html, attachments = [] }) {
        try {
            // Check if SMTP credentials are configured
            if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
                console.warn('SMTP credentials not configured. Email will not be sent.');
                return { success: false, message: 'SMTP not configured' };
            }

            const mailOptions = {
                from: `"Test CRM" <${process.env.SMTP_USER}>`,
                to,
                subject,
                html,
                attachments
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log('Email sent successfully:', result.messageId);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('Error sending email:', error);
            return { success: false, error: error.message };
        }
    }

    async verifyConnection() {
        try {
            if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
                console.warn('SMTP credentials not configured. Email service unavailable.');
                return false;
            }

            await this.transporter.verify();
            console.log('Email service is ready');
            return true;
        } catch (error) {
            console.error('Email service error:', error);
            return false;
        }
    }
}

module.exports = new EmailService();