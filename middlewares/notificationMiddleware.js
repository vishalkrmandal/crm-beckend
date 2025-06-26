// Backend/middlewares/notificationMiddleware.js
// Middleware to add notification triggers to request object
const addNotificationTriggers = (req, res, next) => {
    // Get io instance from app
    const io = req.app.get('io');
    if (io && io.notificationTriggers) {
        req.notificationTriggers = io.notificationTriggers;
    }
    next();
};

module.exports = { addNotificationTriggers };