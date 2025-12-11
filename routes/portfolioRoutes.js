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
  deletePortfolio,
  getCarouselPortfolios
} = require("../controller/portfolioController.js");

// Public routes
router.get("/", getAllPortfolios);
router.get("/carousel", getCarouselPortfolios);
router.get("/slug/:slug", getPortfolioBySlug);
router.get("/category/:categorySlug", getPortfoliosByCategory);

// ID route MUST be last
router.get("/:id", getPortfolioById);

// Protected routes
router.post("/", authenticationToken, upload.array("images", 11), addPortfolio);
router.put("/:id", authenticationToken, upload.array("images", 11), updatePortfolio);
router.delete("/:id", authenticationToken, deletePortfolio);

module.exports = router;
