const PaymentMethod = require('../models/PaymentMethod');
// const asyncHandler = require('../middlewares/asyncHandler');

// /**
//  * @desc    Get all payment methods
//  * @route   GET /api/payment-methods
//  * @access  Private
//  */
exports.getPaymentMethods = async (req, res) => {
    const paymentMethods = await PaymentMethod.find();

    res.status(200).json({
        success: true,
        count: paymentMethods.length,
        data: paymentMethods
    });
};
// /**
//  * @desc    Create a new payment method
//  * @route   POST /api/payment-methods
//  * @access  Private
//  */
exports.createPaymentMethod = async (req, res) => {
    const paymentMethod = await PaymentMethod.create({
        ...req.body,
        user: req.user._id // Assuming you want to associate with the logged-in user
    });

    res.status(201).json({
        success: true,
        data: paymentMethod
    });
};

// /**
//  * @desc    Update a payment method
//  * @route   PUT /api/payment-methods/:id
//  * @access  Private
//  */
exports.updatePaymentMethod = async (req, res) => {
    const paymentMethod = await PaymentMethod.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
            new: true,
            runValidators: true
        }
    );

    if (!paymentMethod) {
        return res.status(404).json({
            success: false,
            message: 'Payment method not found'
        });
    }

    res.status(200).json({
        success: true,
        data: paymentMethod
    });
};

// /**
//  * @desc    Delete a payment method
//  * @route   DELETE /api/payment-methods/:id
//  * @access  Private
//  */
exports.deletePaymentMethod = async (req, res) => {
    const paymentMethod = await PaymentMethod.findByIdAndDelete(req.params.id);

    if (!paymentMethod) {
        return res.status(404).json({
            success: false,
            message: 'Payment method not found'
        });
    }

    res.status(200).json({
        success: true,
        data: {}
    });
};

// /**
//  * @desc    Toggle payment method status
//  * @route   PATCH /api/payment-methods/:id/status
//  * @access  Private
//  */
exports.togglePaymentMethodStatus = async (req, res) => {
    const paymentMethod = await PaymentMethod.findByIdAndUpdate(
        req.params.id,
        { active: req.body.active },
        { new: true }
    );

    if (!paymentMethod) {
        return res.status(404).json({
            success: false,
            message: 'Payment method not found'
        });
    }

    res.status(200).json({
        success: true,
        data: paymentMethod
    });
};

// /**
//  * @desc    Upload QR Code for payment method
//  * @route   POST /api/payment-methods/:id/upload-qr
//  * @access  Private
//  */
exports.uploadPaymentMethodQR = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No file uploaded'
        });
    }

    const paymentMethod = await PaymentMethod.findByIdAndUpdate(
        req.params.id,
        {
            qrCode: req.file.path,
            paymentLink: req.body.paymentLink // Optional payment link
        },
        { new: true }
    );

    if (!paymentMethod) {
        return res.status(404).json({
            success: false,
            message: 'Payment method not found'
        });
    }

    res.status(200).json({
        success: true,
        qrCodeUrl: req.file.path,
        data: paymentMethod
    });
};