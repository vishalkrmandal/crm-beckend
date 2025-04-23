const Profile = require('../../models/client/Profile')
const User = require('../../models/User');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { required } = require('joi');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/documents';

        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExt = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${fileExt}`);
    }
});

// File filter for document uploads
const fileFilter = (req, file, cb) => {
    // Accept only image and PDF files
    if (file.mimetype === 'image/jpeg' ||
        file.mimetype === 'image/png' ||
        file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, PNG and PDF files are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max file size
});

// Middleware for handling document uploads
exports.uploadDocuments = upload.fields([
    { name: 'idDocument', maxCount: 1 },
    { name: 'address1Document', maxCount: 1 },
    { name: 'address2Document', maxCount: 1 }
]);

// Get user profile
exports.getProfile = async (req, res) => {
    try {


        // console.log('req:', req.user.id)
        // Find profile for the authenticated user
        const profile = await Profile.findOne({ user: req.user.id });
        const user = await User.findById(req.user.id);

        console.log('user:', user)
        console.log('profile:', profile)


        if (!profile) {
            return res.status(200).json({
                success: true,
                data: {
                    personalInfo: {
                        firstname: user.firstname,
                        lastname: user.lastname,
                        dateofbirth: user.dateofbirth,
                        phone: user.phone,
                        email: user.email
                    }
                }
            });
        }

        // Add the fixed user data to the response
        const responseData = {
            ...profile.toObject(),
            personalInfo: {
                firstname: user.firstname,
                lastname: user.lastname,
                dateofbirth: user.dateofbirth,
                phone: user.phone,
                email: user.email
            }
        };

        res.status(200).json({
            success: true,
            data: responseData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Update personal information
exports.updatePersonalInfo = async (req, res) => {
    try {
        const { educationLevel, otherEducation, isEmployed } = req.body;

        // Prepare update data
        const updateData = {
            educationLevel,
            otherEducation,
            isEmployed: isEmployed === 'yes',
            updatedAt: Date.now()
        };

        // Add file paths if files were uploaded
        if (req.files) {
            if (req.files.idDocument) {
                updateData.idDocument = req.files.idDocument[0].path;
            }
            if (req.files.address1Document) {
                updateData.address1Document = req.files.address1Document[0].path;
            }
            if (req.files.address2Document) {
                updateData.address2Document = req.files.address2Document[0].path;
            }
        }

        // Find and update profile or create if it doesn't exist
        let profile = await Profile.findOne({ user: req.user.id });

        if (profile) {
            profile = await Profile.findOneAndUpdate(
                { user: req.user.id },
                { $set: updateData },
                { new: true }
            );
        } else {
            // Create new profile with user reference
            updateData.user = req.user.id;
            profile = await Profile.create(updateData);
        }

        res.status(200).json({
            success: true,
            message: 'Personal information updated successfully',
            data: profile
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Update account details
exports.updateAccountDetails = async (req, res) => {
    try {
        const { bankName, accountHolderName, accountNumber, ifscSwiftCode } = req.body;

        // Prepare bank details object
        const bankDetails = {
            bankName,
            accountHolderName,
            accountNumber,
            ifscSwiftCode
        };

        // Find and update profile or create if it doesn't exist
        let profile = await Profile.findOne({ user: req.user.id });

        if (profile) {
            profile = await Profile.findOneAndUpdate(
                { user: req.user.id },
                {
                    $set: {
                        bankDetails,
                        updatedAt: Date.now()
                    }
                },
                { new: true }
            );
        } else {
            // Create new profile with user reference and bank details
            profile = await Profile.create({
                user: req.user.id,
                bankDetails
            });
        }

        res.status(200).json({
            success: true,
            message: 'Account details updated successfully',
            data: profile
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Update wallet details
exports.updateWalletDetails = async (req, res) => {
    try {
        const { tetherWalletAddress, ethWalletAddress, accountNumber, trxWalletAddress } = req.body;

        // Prepare wallet details object
        const walletDetails = {
            tetherWalletAddress,
            ethWalletAddress,
            accountNumber,
            trxWalletAddress
        };

        // Find and update profile or create if it doesn't exist
        let profile = await Profile.findOne({ user: req.user.id });

        if (profile) {
            profile = await Profile.findOneAndUpdate(
                { user: req.user.id },
                {
                    $set: {
                        walletDetails,
                        updatedAt: Date.now()
                    }
                },
                { new: true }
            );
        } else {
            // Create new profile with user reference and wallet details
            profile = await Profile.create({
                user: req.user.id,
                walletDetails
            });
        }

        res.status(200).json({
            success: true,
            message: 'Wallet details updated successfully',
            data: profile
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};