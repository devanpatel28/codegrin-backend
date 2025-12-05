const express = require("express")
const router = express.Router()
const upload = require("../middleware/upload.js");
const { authenticationToken } = require("../middleware/authMiddleware.js");
const {  adminLogin, getAdminProfile, editAdminProfile } = require("../controller/adminAuthController.js")


router.post("/login", adminLogin)
router.get("/profile", authenticationToken, getAdminProfile);
router.put("/editprofile", authenticationToken, upload.single("profileImage"), editAdminProfile);

module.exports = router;
