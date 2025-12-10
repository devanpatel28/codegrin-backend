const express = require("express");
const router = express.Router();
const { authenticationToken } = require("../middleware/authMiddleware.js");
const {
  getAllCategories,
  addCategory,
  updateCategory,
  deleteCategory
} = require("../controller/categoryController.js");

router.get("/", getAllCategories);
router.post("/", authenticationToken, addCategory);
router.put("/:id", authenticationToken, updateCategory);
router.delete("/:id", authenticationToken, deleteCategory);

module.exports = router;
