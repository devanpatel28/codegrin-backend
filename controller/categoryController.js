const { db } = require("../config/db");
const asyncHandler = require("express-async-handler");

// Get all categories
const getAllCategories = asyncHandler(async (req, res) => {
  const [categories] = await db.query(
    "SELECT id, name, slug, created_at, updated_at FROM portfolio_main_categories ORDER BY id ASC"
  );

  res.status(200).json({
    success: true,
    count: categories.length,
    categories
  });
});

// Add new category
const addCategory = asyncHandler(async (req, res) => {
  const { name, slug } = req.body;

  if (!name || !slug) {
    res.status(400);
    throw new Error("Name and slug are required");
  }

  const [existing] = await db.query(
    "SELECT id FROM portfolio_main_categories WHERE slug = ?",
    [slug]
  );

  if (existing.length > 0) {
    res.status(400);
    throw new Error("Category with this slug already exists");
  }

  const [result] = await db.query(
    "INSERT INTO portfolio_main_categories (name, slug, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
    [name, slug]
  );

  res.status(201).json({
    success: true,
    message: "Category created successfully",
    category: {
      id: result.insertId,
      name,
      slug
    }
  });
});

// Update category
const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, slug } = req.body;

  if (!name || !slug) {
    res.status(400);
    throw new Error("Name and slug are required");
  }

  const [category] = await db.query(
    "SELECT id FROM portfolio_main_categories WHERE id = ?",
    [id]
  );

  if (category.length === 0) {
    res.status(404);
    throw new Error("Category not found");
  }

  const [existing] = await db.query(
    "SELECT id FROM portfolio_main_categories WHERE slug = ? AND id != ?",
    [slug, id]
  );

  if (existing.length > 0) {
    res.status(400);
    throw new Error("Slug already taken by another category");
  }

  await db.query(
    "UPDATE portfolio_main_categories SET name = ?, slug = ?, updated_at = NOW() WHERE id = ?",
    [name, slug, id]
  );

  res.status(200).json({
    success: true,
    message: "Category updated successfully"
  });
});

// Delete category
const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [category] = await db.query(
    "SELECT id FROM portfolio_main_categories WHERE id = ?",
    [id]
  );

  if (category.length === 0) {
    res.status(404);
    throw new Error("Category not found");
  }

  const [portfolioCount] = await db.query(
    "SELECT COUNT(*) as count FROM portfolio_categories WHERE category_id = ?",
    [id]
  );

  if (portfolioCount[0].count > 0) {
    res.status(400);
    throw new Error(`Cannot delete category. It is used by ${portfolioCount[0].count} portfolio(s)`);
  }

  await db.query("DELETE FROM portfolio_main_categories WHERE id = ?", [id]);

  res.status(200).json({
    success: true,
    message: "Category deleted successfully"
  });
});

module.exports = {
  getAllCategories,
  addCategory,
  updateCategory,
  deleteCategory
};
