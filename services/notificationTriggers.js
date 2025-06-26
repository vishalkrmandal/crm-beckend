// Backend/services/notificationTriggers.js
const NotificationService = require('./notificationService');

class NotificationTriggers {
    constructor(io) {
        this.notificationService = new NotificationService(io);
    }

    // 1. Account Created Notifications
    async handleAccountCreated(accountData) {
        try {
            const { user, mt5Account, accountType, leverage } = accountData;

            // Notify the client
            await this.notificationService.createNotification({
                recipients: user,
                title: '🎉 New MT5 Account Created!',
                message: `Your new MT5 account ${mt5Account} has been successfully created and is ready for trading.`,
                type: 'account_created',
                priority: 'high',
                data: {
                    mt5Account,
                    accountType,
                    leverage
                },
                relatedModel: 'Account',
                relatedId: accountData._id
            });

            // Notify all admins
            const adminUsers = await this.notificationService.getAdminUsers();
            console.log('Admin users for account created notification:', adminUsers);
            if (adminUsers.length > 0) {
                await this.notificationService.createNotification({
                    recipients: adminUsers.map(admin => admin._id),
                    title: '📊 New MT5 Account Created',
                    message: `A new MT5 account ${mt5Account} has been created for client.`,
                    type: 'account_created',
                    priority: 'medium',
                    data: {
                        mt5Account,
                        accountType,
                        leverage,
                        clientId: user
                    },
                    relatedModel: 'Account',
                    relatedId: accountData._id
                });
            }
        } catch (error) {
            console.error('Error handling account created notification:', error);
        }
    }

    // 2. Deposit Status Notifications
    async handleDepositStatusChange(depositData, previousStatus) {
        try {
            const { user, amount, status, paymentMethod, remarks } = depositData;

            // Notify the client about deposit status change
            const statusMessages = {
                'Pending': 'Your deposit request is being processed.',
                'Approved': 'Great news! Your deposit has been approved and funds have been added to your account.',
                'Rejected': 'Your deposit request has been rejected. Please contact support for more information.'
            };

            const statusIcons = {
                'Pending': '⏳',
                'Approved': '✅',
                'Rejected': '❌'
            };

            await this.notificationService.createNotification({
                recipients: user,
                title: `${statusIcons[status]} Deposit ${status}`,
                message: statusMessages[status],
                type: 'deposit_status',
                priority: status === 'Rejected' ? 'high' : 'medium',
                data: {
                    amount,
                    status,
                    paymentMethod: paymentMethod.name || paymentMethod,
                    remarks,
                    previousStatus
                },
                relatedModel: 'Deposit',
                relatedId: depositData._id
            });

            // Notify admins when deposit is submitted (Pending status)
            if (status === 'Pending' && previousStatus !== 'Pending') {
                const adminUsers = await this.notificationService.getAdminUsers();
                console.log('Admin users for deposit status change notification:', adminUsers);
                if (adminUsers.length > 0) {
                    await this.notificationService.createNotification({
                        recipients: adminUsers.map(admin => admin._id),
                        title: '💰 New Deposit Request',
                        message: `A new deposit request of $${amount} has been submitted and requires approval.`,
                        type: 'deposit_status',
                        priority: 'medium',
                        data: {
                            amount,
                            status,
                            paymentMethod: paymentMethod.name || paymentMethod,
                            clientId: user
                        },
                        relatedModel: 'Deposit',
                        relatedId: depositData._id
                    });
                }
            }
        } catch (error) {
            console.error('Error handling deposit status notification:', error);
        }
    }

    // 3. Withdrawal Status Notifications  
    async handleWithdrawalStatusChange(withdrawalData, previousStatus) {
        try {
            const { user, amount, status, remarks } = withdrawalData;

            const statusMessages = {
                'Pending': 'Your withdrawal request is being processed.',
                'Approved': 'Your withdrawal has been approved and will be processed shortly.',
                'Rejected': 'Your withdrawal request has been rejected. Please contact support for more information.'
            };

            const statusIcons = {
                'Pending': '⏳',
                'Approved': '✅',
                'Rejected': '❌'
            };

            // Notify the client
            await this.notificationService.createNotification({
                recipients: user,
                title: `${statusIcons[status]} Withdrawal ${status}`,
                message: statusMessages[status],
                type: 'withdrawal_status',
                priority: status === 'Rejected' ? 'high' : 'medium',
                data: {
                    amount,
                    status,
                    remarks,
                    previousStatus
                },
                relatedModel: 'Withdrawal',
                relatedId: withdrawalData._id
            });

            // Notify admins when withdrawal is submitted
            if (status === 'Pending' && previousStatus !== 'Pending') {
                const adminUsers = await this.notificationService.getAdminUsers();
                if (adminUsers.length > 0) {
                    await this.notificationService.createNotification({
                        recipients: adminUsers.map(admin => admin._id),
                        title: '💸 New Withdrawal Request',
                        message: `A new withdrawal request of $${amount} has been submitted and requires approval.`,
                        type: 'withdrawal_status',
                        priority: 'medium',
                        data: {
                            amount,
                            status,
                            clientId: user
                        },
                        relatedModel: 'Withdrawal',
                        relatedId: withdrawalData._id
                    });
                }
            }
        } catch (error) {
            console.error('Error handling withdrawal status notification:', error);
        }
    }

    // 4. Transfer Success Notifications
    async handleTransferSuccess(transferData) {
        try {
            const { user, amount, fromAccount, toAccount } = transferData;

            await this.notificationService.createNotification({
                recipients: user,
                title: '💱 Transfer Completed Successfully',
                message: `Your transfer of $${amount} has been completed successfully.`,
                type: 'transfer_success',
                priority: 'medium',
                data: {
                    amount,
                    fromAccount: fromAccount.mt5Account || fromAccount,
                    toAccount: toAccount.mt5Account || toAccount
                },
                relatedModel: 'Transfer',
                relatedId: transferData._id
            });
        } catch (error) {
            console.error('Error handling transfer success notification:', error);
        }
    }

    // 5. New Referral Notifications
    async handleNewReferral(ibConfigData, referrerData) {
        try {
            const { userId: newUserId, referredBy } = ibConfigData;

            // Get new user details
            const User = require('../models/User');
            const newUser = await User.findById(newUserId).select('firstname lastname email');

            if (referrerData && newUser) {
                await this.notificationService.createNotification({
                    recipients: referrerData._id,
                    title: '👥 New Referral Joined!',
                    message: `Congratulations! ${newUser.firstname} ${newUser.lastname} has joined using your referral code.`,
                    type: 'new_referral',
                    priority: 'medium',
                    data: {
                        referredUserName: `${newUser.firstname} ${newUser.lastname}`,
                        referralCode: referredBy,
                        joinDate: new Date().toLocaleDateString()
                    },
                    relatedModel: 'IBClientConfiguration',
                    relatedId: ibConfigData._id
                });
            }
        } catch (error) {
            console.error('Error handling new referral notification:', error);
        }
    }

    // 6. Ticket Update Notifications
    async handleTicketUpdate(ticketData, updateType = 'update') {
        try {
            const { createdBy, ticketNumber, subject, status, priority, assignedTo } = ticketData;

            // Notify ticket creator
            const updateMessages = {
                'created': 'Your support ticket has been created and assigned to our team.',
                'updated': 'Your support ticket has been updated.',
                'status_changed': `Your support ticket status has been changed to ${status}.`,
                'message_added': 'A new message has been added to your support ticket.'
            };

            const ticketIcons = {
                'new': '🆕',
                'open': '📂',
                'inProgress': '🔄',
                'resolved': '✅',
                'closed': '🔒'
            };

            await this.notificationService.createNotification({
                recipients: createdBy,
                title: `${ticketIcons[status] || '🎫'} Ticket ${ticketNumber} ${updateType === 'created' ? 'Created' : 'Updated'}`,
                message: updateMessages[updateType] || updateMessages['updated'],
                type: 'ticket_update',
                priority: priority === 'high' ? 'high' : 'medium',
                data: {
                    ticketNumber,
                    subject,
                    status,
                    priority,
                    updateType
                },
                relatedModel: 'Ticket',
                relatedId: ticketData._id
            });

            // Notify all admins
            const adminUsers = await this.notificationService.getAdminUsers();
            if (adminUsers.length > 0) {
                await this.notificationService.createNotification({
                    recipients: adminUsers.map(admin => admin._id),
                    title: `🎫 Ticket ${ticketNumber} ${updateType === 'created' ? 'Created' : 'Updated'}`,
                    message: `Ticket ${ticketNumber} has been ${updateType === 'created' ? 'created' : 'updated'} and requires attention.`,
                    type: 'ticket_update',
                    priority: priority === 'high' ? 'high' : 'medium',
                    data: {
                        ticketNumber,
                        subject,
                        status,
                        priority,
                        updateType,
                        clientId: createdBy
                    },
                    relatedModel: 'Ticket',
                    relatedId: ticketData._id
                });
            }
        } catch (error) {
            console.error('Error handling ticket update notification:', error);
        }
    }

    // 7. Profile Update Notifications (Admin only)
    async handleProfileUpdate(profileData, userId) {
        try {
            const User = require('../models/User');
            const user = await User.findById(userId).select('firstname lastname email');

            if (user) {
                const adminUsers = await this.notificationService.getAdminUsers();
                if (adminUsers.length > 0) {
                    await this.notificationService.createNotification({
                        recipients: adminUsers.map(admin => admin._id),
                        title: '👤 Client Profile Updated',
                        message: `${user.firstname} ${user.lastname} has updated their profile information.`,
                        type: 'profile_update',
                        priority: 'low',
                        data: {
                            clientName: `${user.firstname} ${user.lastname}`,
                            clientEmail: user.email,
                            clientId: userId,
                            updateDate: new Date().toLocaleDateString()
                        },
                        relatedModel: 'Profile',
                        relatedId: profileData._id
                    });
                }
            }
        } catch (error) {
            console.error('Error handling profile update notification:', error);
        }
    }

    // 8. New User Signup Notifications (Admin only)
    async handleNewUserSignup(userData, ibConfigData = null) {
        try {
            const { _id, firstname, lastname, email } = userData;
            const isIBUser = !!ibConfigData;

            const adminUsers = await this.notificationService.getAdminUsers();
            if (adminUsers.length > 0) {
                await this.notificationService.createNotification({
                    recipients: adminUsers.map(admin => admin._id),
                    title: `🆕 New ${isIBUser ? 'IB Partner' : 'Client'} Registration`,
                    message: `A new ${isIBUser ? 'IB partner' : 'client'} ${firstname} ${lastname} has registered on the platform.`,
                    type: 'new_signup',
                    priority: isIBUser ? 'medium' : 'low',
                    data: {
                        userName: `${firstname} ${lastname}`,
                        email,
                        isIBUser,
                        referredBy: ibConfigData?.referredBy || null,
                        signupDate: new Date().toLocaleDateString(),
                        clientId: _id
                    },
                    relatedModel: 'User',
                    relatedId: _id
                });
            }
        } catch (error) {
            console.error('Error handling new user signup notification:', error);
        }
    }

    // 9. Message Added to Ticket Notifications
    async handleTicketMessageAdded(messageData, ticketData) {
        try {
            const { sender, content, ticketId } = messageData;
            const { createdBy, ticketNumber, subject } = ticketData;

            // Don't notify if sender is the ticket creator
            if (sender.toString() === createdBy.toString()) {
                // Notify admins about new message from client
                const adminUsers = await this.notificationService.getAdminUsers();
                if (adminUsers.length > 0) {
                    await this.notificationService.createNotification({
                        recipients: adminUsers.map(admin => admin._id),
                        title: `💬 New Message in Ticket ${ticketNumber}`,
                        message: `Client has added a new message to ticket ${ticketNumber}.`,
                        type: 'ticket_update',
                        priority: 'medium',
                        data: {
                            ticketNumber,
                            subject,
                            messagePreview: content.substring(0, 100),
                            updateType: 'message_added',
                            clientId: createdBy
                        },
                        relatedModel: 'Message',
                        relatedId: messageData._id
                    });
                }
            } else {
                // Notify ticket creator about admin response
                await this.notificationService.createNotification({
                    recipients: createdBy,
                    title: `💬 New Response to Ticket ${ticketNumber}`,
                    message: 'You have received a new response to your support ticket.',
                    type: 'ticket_update',
                    priority: 'medium',
                    data: {
                        ticketNumber,
                        subject,
                        messagePreview: content.substring(0, 100),
                        updateType: 'message_added'
                    },
                    relatedModel: 'Message',
                    relatedId: messageData._id
                });
            }
        } catch (error) {
            console.error('Error handling ticket message notification:', error);
        }
    }
}

module.exports = NotificationTriggers;