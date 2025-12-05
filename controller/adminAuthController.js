const { db } = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");

require("dotenv").config();

// Admin Login with Email and Password
const adminLogin = asyncHandler(async (req, res) => {
    const { admin_email, admin_password } = req.body;

    // Validate input
    if (!admin_email || !admin_password) {
        res.status(400);
        throw new Error("Email and password are required");
    }

    // Get admin by email
    const [admin] = await db.query(
        "SELECT * FROM admin WHERE admin_email = ?",
        [admin_email]
    );

    if (!admin || admin.length === 0) {
        res.status(401);
       return res.json({
           success: false,
           message: "Invalid email or password"
       })
    }

    // Compare password with hashed password
    const isPasswordValid = await bcrypt.compare(admin_password, admin[0].admin_password);

    if (!isPasswordValid) {
        res.status(401);
       return res.json({
           success: false,
           message: "Invalid email or password"
       })
    }

    // Generate JWT token
    const token = jwt.sign(
        { 
            adminId: admin[0].adminId, 
            email: admin[0].admin_email,
            role: 'admin'
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

    res.status(200).json({
        success: true,
        message: "Login successful",
        token,
        admin: {
            adminId: admin[0].adminId,
            firstname: admin[0].admin_firstname,
            lastname: admin[0].admin_lastname,
            email: admin[0].admin_email
        }
    });
});

// Get Admin Profile
const getAdminProfile = asyncHandler(async (req, res) => {
    const adminId = req.admin.adminId;

    const [admin] = await db.query(
        "SELECT adminId, admin_firstname, admin_lastname, admin_email, created_at FROM admin WHERE adminId = ?",
        [adminId]
    );

    if (!admin || admin.length === 0) {
        res.status(404);
        throw new Error("Admin not found");
    }

    res.status(200).json({
        success: true,
        admin: {
            adminId: admin[0].adminId,
            firstname: admin[0].admin_firstname,
            lastname: admin[0].admin_lastname,
            email: admin[0].admin_email,
            created_at: admin[0].created_at
        }
    });
});

// Edit Admin Profile
const editAdminProfile = asyncHandler(async (req, res) => {
    const adminId = req.admin.adminId;
    const { admin_firstname, admin_lastname } = req.body;

    if (!admin_firstname || !admin_lastname) {
        res.status(400);
        throw new Error("First name and last name are required");
    }

    await db.query(
        "UPDATE admin SET admin_firstname = ?, admin_lastname = ? WHERE adminId = ?",
        [admin_firstname, admin_lastname, adminId]
    );

    res.status(200).json({
        success: true,
        message: "Profile updated successfully"
    });
});

module.exports = {
    adminLogin,
    getAdminProfile,
    editAdminProfile
};
