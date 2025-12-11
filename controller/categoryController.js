const { db } = require("../config/db");
const asyncHandler = require("express-async-handler");


const generateSlug = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const addCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: "Name is required" });
  }

  const slug = generateSlug(name);

  // Prevent duplicates
  const [exists] = await db.query(
    "SELECT id FROM portfolio_main_categories WHERE slug=?",
    [slug]
  );

  if (exists.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Category already exists",
    });
  }

  await db.query(
    "INSERT INTO portfolio_main_categories (name, slug) VALUES (?, ?)",
    [name.trim(), slug]
  );

  res.json({
    success: true,
    message: "Category added successfully",
  });
});

const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: "Name is required" });
  }

  const slug = generateSlug(name);

  // Check for duplicate slug (except own id)
  const [exists] = await db.query(
    "SELECT id FROM portfolio_main_categories WHERE slug=? AND id!=?",
    [slug, id]
  );

  if (exists.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Another category with this name already exists",
    });
  }

  await db.query(
    "UPDATE portfolio_main_categories SET name=?, slug=?, updated_at=NOW() WHERE id=?",
    [name.trim(), slug, id]
  );

  res.json({
    success: true,
    message: "Category updated successfully",
  });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await db.query("DELETE FROM portfolio_main_categories WHERE id=?", [id]);

  res.json({
    success: true,
    message: "Category deleted successfully",
  });
});

const getAllCategories = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    "SELECT id, name, slug, created_at, updated_at FROM portfolio_main_categories ORDER BY name ASC"
  );

  res.json({
    success: true,
    categories: rows,
  });
});

const getCategoryWithTotal = asyncHandler(async (req, res) => {
  const [rows] = await db.query(`
    SELECT 
      c.id,
      c.name,
      c.slug,
      c.created_at,
      c.updated_at,
      COUNT(pc.portfolio_id) AS total_projects
    FROM portfolio_main_categories c
    LEFT JOIN portfolio_categories pc
      ON c.id = pc.category_id
    GROUP BY c.id
    ORDER BY total_projects DESC, c.name ASC
  `);

  res.json({
    success: true,
    categories: rows,
  });
});


module.exports = {
  getAllCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getCategoryWithTotal
};
