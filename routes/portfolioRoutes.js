const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload.js");
const { authenticationToken } = require("../middleware/authMiddleware.js");
const {
  getAllPortfolios,
  getPortfolioById,
  getPortfolioBySlug,
  getPortfoliosByCategory,
  addPortfolio,
  updatePortfolio,
  deletePortfolio
} = require("../controller/portfolioController.js");

// Public routes
router.get("/", getAllPortfolios);
router.get("/slug/:slug", getPortfolioBySlug);
router.get("/category/:categorySlug", getPortfoliosByCategory);
router.get("/:id", getPortfolioById);

// Protected routes (admin only)
router.post("/", authenticationToken, upload.array("images", 10), addPortfolio);
router.put("/:id", authenticationToken, upload.array("images", 10), updatePortfolio);
router.delete("/:id", authenticationToken, deletePortfolio);

module.exports = router;
