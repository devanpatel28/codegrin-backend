const { db } = require("../config/db");
const asyncHandler = require("express-async-handler");
const { imagekit } = require("../config/imagekit");

// Helper function to get portfolio with all relations
const getPortfolioWithRelations = async (portfolioId) => {
  const [portfolio] = await db.query(
    "SELECT * FROM portfolio WHERE id = ?",
    [portfolioId]
  );

  if (portfolio.length === 0) {
    return null;
  }

  const [categories] = await db.query(
    `SELECT pmc.id, pmc.name, pmc.slug 
     FROM portfolio_categories pc
     JOIN portfolio_main_categories pmc ON pc.category_id = pmc.id
     WHERE pc.portfolio_id = ?
     ORDER BY pmc.id ASC`,
    [portfolioId]
  );

  const [descriptions] = await db.query(
    `SELECT id, description, display_order 
     FROM portfolio_descriptions 
     WHERE portfolio_id = ?
     ORDER BY display_order ASC`,
    [portfolioId]
  );

  const [images] = await db.query(
    `SELECT id, image_url, display_order, alt_text 
     FROM portfolio_images 
     WHERE portfolio_id = ?
     ORDER BY display_order ASC`,
    [portfolioId]
  );

  return {
    ...portfolio[0],
    categories,
    descriptions: descriptions.map(d => d.description),
    images
  };
};

const getNextPortfolio = async (currentPortfolioId) => {
  // Get next portfolio (by ID order)
  const [nextPortfolio] = await db.query(
    `SELECT id, title, slug, header_image_url 
     FROM portfolio 
     WHERE id > ? 
     ORDER BY id ASC 
     LIMIT 1`,
    [currentPortfolioId]
  );

  // If no next portfolio found, get the first one (circular)
  if (nextPortfolio.length === 0) {
    const [firstPortfolio] = await db.query(
      `SELECT id, title, slug, header_image_url 
       FROM portfolio 
       ORDER BY id ASC 
       LIMIT 1`
    );
    return firstPortfolio[0] || null;
  }

  return nextPortfolio[0];
};

// Get all portfolios
const getAllPortfolios = asyncHandler(async (req, res) => {
  const [portfolios] = await db.query(
    `SELECT p.id 
     FROM portfolio p
     ORDER BY p.created_at DESC`
  );

  const portfoliosWithDetails = await Promise.all(
    portfolios.map(p => getPortfolioWithRelations(p.id))
  );

  res.status(200).json({
    success: true,
    count: portfoliosWithDetails.length,
    portfolios: portfoliosWithDetails
  });
});

// Get portfolio by ID (with next portfolio)
const getPortfolioById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const portfolio = await getPortfolioWithRelations(id);

  if (!portfolio) {
    res.status(404);
    throw new Error("Portfolio not found");
  }

  // Get next portfolio
  const nextPortfolio = await getNextPortfolio(id);

  res.status(200).json({
    success: true,
    portfolio,
    nextPortfolio: nextPortfolio ? {
      id: nextPortfolio.id,
      title: nextPortfolio.title,
      slug: nextPortfolio.slug,
      header_image_url: nextPortfolio.header_image_url
    } : null
  });
});

// Get portfolio by slug (with next portfolio)
const getPortfolioBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const [portfolio] = await db.query(
    "SELECT id FROM portfolio WHERE slug = ?",
    [slug]
  );

  if (portfolio.length === 0) {
    res.status(404);
    throw new Error("Portfolio not found");
  }

  const portfolioDetails = await getPortfolioWithRelations(portfolio[0].id);
  
  // Get next portfolio
  const nextPortfolio = await getNextPortfolio(portfolio[0].id);

  res.status(200).json({
    success: true,
    portfolio: portfolioDetails,
    nextPortfolio: nextPortfolio ? {
      id: nextPortfolio.id,
      title: nextPortfolio.title,
      slug: nextPortfolio.slug,
      header_image_url: nextPortfolio.header_image_url
    } : null
  });
});

// Get portfolios by category slug
const getPortfoliosByCategory = asyncHandler(async (req, res) => {
  const { categorySlug } = req.params;

  const [category] = await db.query(
    "SELECT id, name FROM portfolio_main_categories WHERE slug = ?",
    [categorySlug]
  );

  if (category.length === 0) {
    res.status(404);
    throw new Error("Category not found");
  }

  const [portfolioIds] = await db.query(
    `SELECT DISTINCT p.id 
     FROM portfolio p
     JOIN portfolio_categories pc ON p.id = pc.portfolio_id
     WHERE pc.category_id = ?
     ORDER BY p.created_at DESC`,
    [category[0].id]
  );

  const portfolios = await Promise.all(
    portfolioIds.map(p => getPortfolioWithRelations(p.id))
  );

  res.status(200).json({
    success: true,
    category: {
      id: category[0].id,
      name: category[0].name,
      slug: categorySlug
    },
    count: portfolios.length,
    portfolios
  });
});

// Add new portfolio
const addPortfolio = asyncHandler(async (req, res) => {
  const {
    title,
    slug,
    project_type,
    publisher_name,
    project_link,
    tech_category,
    descriptions
  } = req.body;

  if (!title || !slug || !project_type || !publisher_name) {
    res.status(400);
    throw new Error("Title, slug, project_type, and publisher_name are required");
  }

  const [existing] = await db.query(
    "SELECT id FROM portfolio WHERE slug = ?",
    [slug]
  );

  if (existing.length > 0) {
    res.status(400);
    throw new Error("Portfolio with this slug already exists");
  }

  let categories = [];
  let descArray = [];

  try {
    categories = tech_category ? JSON.parse(tech_category) : [];
    descArray = descriptions ? JSON.parse(descriptions) : [];
  } catch (error) {
    res.status(400);
    throw new Error("Invalid JSON format for categories or descriptions");
  }

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const [result] = await connection.query(
      `INSERT INTO portfolio (title, slug, project_type, publisher_name, project_link, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [title, slug, project_type, publisher_name, project_link || null]
    );

    const portfolioId = result.insertId;

    if (categories.length > 0) {
      const [categoryData] = await connection.query(
        `SELECT id, slug FROM portfolio_main_categories WHERE slug IN (?)`,
        [categories]
      );

      for (const cat of categoryData) {
        await connection.query(
          "INSERT INTO portfolio_categories (portfolio_id, category_id) VALUES (?, ?)",
          [portfolioId, cat.id]
        );
      }
    }

    if (descArray.length > 0) {
      for (let i = 0; i < descArray.length; i++) {
        await connection.query(
          "INSERT INTO portfolio_descriptions (portfolio_id, description, display_order) VALUES (?, ?, ?)",
          [portfolioId, descArray[i], i + 1]
        );
      }
    }

    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const imageUrl = `/uploads/${file.filename}`;
        const altText = `${title} - Image ${i + 1}`;

        await connection.query(
          "INSERT INTO portfolio_images (portfolio_id, image_url, display_order, alt_text) VALUES (?, ?, ?, ?)",
          [portfolioId, imageUrl, i + 1, altText]
        );
      }
    }

    await connection.commit();
    const portfolio = await getPortfolioWithRelations(portfolioId);

    res.status(201).json({
      success: true,
      message: "Portfolio created successfully",
      portfolio
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});


const updatePortfolio = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    title,
    slug,
    project_type,
    publisher_name,
    project_link,
    tech_category,
    descriptions
  } = req.body;

  // Check portfolio exists
  const [portfolio] = await db.query(
    "SELECT id FROM portfolio WHERE id = ?",
    [id]
  );

  if (portfolio.length === 0) {
    res.status(404);
    throw new Error("Portfolio not found");
  }

  // Validate slug uniqueness
  if (slug) {
    const [existing] = await db.query(
      "SELECT id FROM portfolio WHERE slug = ? AND id != ?",
      [slug, id]
    );

    if (existing.length > 0) {
      res.status(400);
      throw new Error("Slug already taken by another portfolio");
    }
  }

  // Parse JSON
  let categories = null;
  let descArray = null;

  try {
    if (tech_category) categories = JSON.parse(tech_category);
    if (descriptions) descArray = JSON.parse(descriptions);
  } catch (error) {
    res.status(400);
    throw new Error("Invalid JSON format");
  }

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const updateFields = [];
    const updateValues = [];

    if (title) { updateFields.push("title = ?"); updateValues.push(title); }
    if (slug) { updateFields.push("slug = ?"); updateValues.push(slug); }
    if (project_type) { updateFields.push("project_type = ?"); updateValues.push(project_type); }
    if (publisher_name) { updateFields.push("publisher_name = ?"); updateValues.push(publisher_name); }
    if (project_link !== undefined) {
      updateFields.push("project_link = ?");
      updateValues.push(project_link || null);
    }

    if (updateFields.length > 0) {
      updateFields.push("updated_at = NOW()");
      updateValues.push(id);

      await connection.query(
        `UPDATE portfolio SET ${updateFields.join(", ")} WHERE id = ?`,
        updateValues
      );
    }

    // Update categories
    if (categories && Array.isArray(categories)) {
      await connection.query(
        "DELETE FROM portfolio_categories WHERE portfolio_id = ?",
        [id]
      );

      if (categories.length > 0) {
        for (const slug of categories) {
          const [category] = await connection.query(
            "SELECT id FROM portfolio_main_categories WHERE slug = ?",
            [slug]
          );

          if (category.length > 0) {
            await connection.query(
              "INSERT INTO portfolio_categories (portfolio_id, category_id) VALUES (?, ?)",
              [id, category[0].id]
            );
          }
        }
      }
    }

    // Update descriptions
    if (descArray && Array.isArray(descArray)) {
      await connection.query(
        "DELETE FROM portfolio_descriptions WHERE portfolio_id = ?",
        [id]
      );

      for (let i = 0; i < descArray.length; i++) {
        await connection.query(
          "INSERT INTO portfolio_descriptions (portfolio_id, description, display_order) VALUES (?, ?, ?)",
          [id, descArray[i], i + 1]
        );
      }
    }

    // Upload images & update table
    if (req.files && req.files.length > 0) {
      await connection.query(
        "DELETE FROM portfolio_images WHERE portfolio_id = ?",
        [id]
      );

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];

        const uploaded = await imagekit.upload({
          file: file.buffer,
          fileName: file.originalname,
          folder: "/codegrin/portfolio_images/",
          isPrivateFile: false
        });

        await connection.query(
          "INSERT INTO portfolio_images (portfolio_id, image_url, display_order, alt_text) VALUES (?, ?, ?, ?)",
          [id, uploaded.url, i + 1, `${title || "Portfolio"} - Image ${i + 1}`]
        );
      }
    }

    await connection.commit();
    const updatedPortfolio = await getPortfolioWithRelations(id);

    res.status(200).json({
      success: true,
      message: "Portfolio updated successfully",
      portfolio: updatedPortfolio
    });

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});


// Delete portfolio
const deletePortfolio = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [portfolio] = await db.query(
    "SELECT id FROM portfolio WHERE id = ?",
    [id]
  );

  if (portfolio.length === 0) {
    res.status(404);
    throw new Error("Portfolio not found");
  }

  await db.query("DELETE FROM portfolio WHERE id = ?", [id]);

  res.status(200).json({
    success: true,
    message: "Portfolio deleted successfully"
  });
});

module.exports = {
  getAllPortfolios,
  getPortfolioById,
  getPortfolioBySlug,
  getPortfoliosByCategory,
  addPortfolio,
  updatePortfolio,
  deletePortfolio
};
