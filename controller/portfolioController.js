const { db } = require("../config/db");
const asyncHandler = require("express-async-handler");
const { imagekit, ImagekitFolder } = require("../config/imagekit");


const getPortfolioWithRelations = async (portfolioId) => {
  const [portfolio] = await db.query(
    "SELECT * FROM portfolio WHERE id = ?",
    [portfolioId]
  );

  if (portfolio.length === 0) return null;
  const portfolioData = portfolio[0];

  // CATEGORIES
  const [categories] = await db.query(
    `SELECT pmc.id, pmc.name, pmc.slug 
     FROM portfolio_categories pc
     JOIN portfolio_main_categories pmc ON pc.category_id = pmc.id
     WHERE pc.portfolio_id = ?
     ORDER BY pmc.id ASC`,
    [portfolioId]
  );

  // DESCRIPTIONS
  const [descriptions] = await db.query(
    `SELECT description 
     FROM portfolio_descriptions 
     WHERE portfolio_id = ?
     ORDER BY display_order ASC`,
    [portfolioId]
  );

  // IMAGES (header included)
  const [images] = await db.query(
    `SELECT id, image_url, is_header, display_order, alt_text 
     FROM portfolio_images 
     WHERE portfolio_id = ?
     ORDER BY is_header DESC, display_order ASC`,
    [portfolioId]
  );

  return {
    ...portfolioData,
    categories,
    descriptions: descriptions.map((d) => d.description),

    // ⭐ Header + Screenshots together
    images: images.map((img) => ({
      id: img.id,
      image_url: img.image_url,
      is_header: img.is_header,
      display_order: img.display_order,
      alt_text: img.alt_text
    }))
  };
};

const getNextPortfolio = async (currentPortfolioId) => {
  // Get next portfolio by ID
  const [next] = await db.query(
    `
    SELECT 
      p.id, 
      p.title, 
      p.slug,
      pi.image_url AS header_image
    FROM portfolio p
    LEFT JOIN portfolio_images pi 
      ON p.id = pi.portfolio_id 
      AND pi.is_header = 1
    WHERE p.id > ?
    ORDER BY p.id ASC 
    LIMIT 1
    `,
    [currentPortfolioId]
  );

  // If next exists → return it
  if (next.length) return next[0];

  // If no next (meaning last portfolio) → return ID 1
  const [first] = await db.query(
    `
    SELECT 
      p.id, 
      p.title, 
      p.slug,
      pi.image_url AS header_image
    FROM portfolio p
    LEFT JOIN portfolio_images pi 
      ON p.id = pi.portfolio_id 
      AND pi.is_header = 1
    ORDER BY p.id ASC 
    LIMIT 1
    `
  );

  return first[0] || null;
};

const getAllPortfolios = asyncHandler(async (req, res) => {
  const [rows] = await db.query(`SELECT id FROM portfolio ORDER BY created_at DESC`);

  const data = await Promise.all(rows.map((p) => getPortfolioWithRelations(p.id)));

  res.status(200).json({
    success: true,
    count: data.length,
    portfolios: data,
  });
});

const getPortfolioById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const portfolio = await getPortfolioWithRelations(id);

  if (!portfolio) {
    return res.status(404).json({
      success: false,
      message: "Portfolio not found",
    });
  }

  const nextPortfolio = await getNextPortfolio(id);

  res.status(200).json({
    success: true,
    portfolio,
    nextPortfolio,
  });
});


const getPortfolioBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const [row] = await db.query("SELECT id FROM portfolio WHERE slug = ?", [slug]);

  if (row.length === 0) {
    return res.status(404).json({
      success: false,
      message: "Portfolio not found",
    });
  }

  const portfolio = await getPortfolioWithRelations(row[0].id);
  const nextPortfolio = await getNextPortfolio(row[0].id);

  res.status(200).json({
    success: true,
    portfolio,
    nextPortfolio,
  });
});


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

  const [rows] = await db.query(
    `SELECT DISTINCT p.id 
     FROM portfolio p
     JOIN portfolio_categories pc ON pc.portfolio_id = p.id
     WHERE pc.category_id = ?
     ORDER BY p.created_at DESC`,
    [category[0].id]
  );

  const data = await Promise.all(rows.map((p) => getPortfolioWithRelations(p.id)));

  res.status(200).json({
    success: true,
    category: category[0],
    count: data.length,
    portfolios: data,
  });
});

const addPortfolio = asyncHandler(async (req, res) => {
  const {
    title,
    slug,
    project_type,
    publisher_name,
    project_link,
    tech_category,
    descriptions,
  } = req.body;

  const files = req.files || []; // all uploaded files
  const imagesMeta = JSON.parse(req.body.images_meta || "[]");

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    /* ---------------------------------------------
       1) INSERT INTO portfolio table
    --------------------------------------------- */
    const [insertResult] = await connection.query(
      `INSERT INTO portfolio 
      (title, slug, project_type, publisher_name, project_link, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        title,
        slug,
        project_type || null,
        publisher_name || null,
        project_link || null,
      ]
    );

    const portfolioId = insertResult.insertId;

    /* ---------------------------------------------
       2) INSERT CATEGORIES
    --------------------------------------------- */
    const categories = tech_category ? JSON.parse(tech_category) : [];

    for (const slug of categories) {
      const [cat] = await connection.query(
        "SELECT id FROM portfolio_main_categories WHERE slug=?",
        [slug]
      );
      if (cat.length) {
        await connection.query(
          "INSERT INTO portfolio_categories (portfolio_id, category_id) VALUES (?,?)",
          [portfolioId, cat[0].id]
        );
      }
    }

    /* ---------------------------------------------
       3) INSERT DESCRIPTIONS
    --------------------------------------------- */
    const descArr = descriptions ? JSON.parse(descriptions) : [];

    for (let i = 0; i < descArr.length; i++) {
      await connection.query(
        `INSERT INTO portfolio_descriptions (portfolio_id, description, display_order)
         VALUES (?, ?, ?)`,
        [portfolioId, descArr[i], i + 1]
      );
    }

    /* ---------------------------------------------
       4) PROCESS IMAGES
          images_meta tells index + isNew + fileIndex
    --------------------------------------------- */
    const uploadedImageRecords = [];

    for (let i = 0; i < imagesMeta.length; i++) {
      const meta = imagesMeta[i];
      const isHeader = i === 0 ? 1 : 0;

      if (!meta.isNew) {
        throw new Error("Add Portfolio MUST have all images as new");
      }

      const file = files[meta.fileIndex];
      if (!file || !file.buffer) throw new Error("Missing uploaded file");

      const fileName = `${portfolioId}_${isHeader ? "header" : i}_${Date.now()}.webp`;

      const uploaded = await imagekit.upload({
        file: file.buffer,
        fileName,
        folder: ImagekitFolder.portfolio_images,
        useUniqueFileName: false,
      });

      uploadedImageRecords.push({
        url: uploaded.url,
        fileId: uploaded.fileId,
        index: i,
        isHeader,
      });
    }

    /* ---------------------------------------------
       5) SAVE IMAGES INTO portfolio_images
    --------------------------------------------- */
    for (const img of uploadedImageRecords) {
      await connection.query(
        `INSERT INTO portfolio_images 
        (portfolio_id, image_url, file_id, display_order, alt_text, is_header)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          portfolioId,
          img.url,
          img.fileId,
          img.index,
          `${title} - Image ${img.index}`,
          img.isHeader,
        ]
      );
    }

    /* ---------------------------------------------
       6) COMMIT
    --------------------------------------------- */
    await connection.commit();

    res.json({
      success: true,
      message: "Portfolio created successfully",
      portfolio: await getPortfolioWithRelations(portfolioId),
    });

  } catch (err) {
    await connection.rollback();
    console.error("Add Portfolio Error:", err.message);
    throw err;
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
    descriptions,
  } = req.body;

  const newFiles = req.files || [];
  const incomingImages = JSON.parse(req.body.images_meta || "[]");

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    /* 1) UPDATE BASIC FIELDS */
    const updates = [];
    const values = [];

    if (title) { updates.push("title=?"); values.push(title); }
    if (slug) { updates.push("slug=?"); values.push(slug); }
    if (project_type) { updates.push("project_type=?"); values.push(project_type); }
    if (publisher_name) { updates.push("publisher_name=?"); values.push(publisher_name); }

    updates.push("project_link=?");
    values.push(project_link || null);

    updates.push("updated_at=NOW()");
    values.push(id);

    await connection.query(
      `UPDATE portfolio SET ${updates.join(", ")} WHERE id=?`,
      values
    );

    /* 2) UPDATE CATEGORIES */
    const categories = tech_category ? JSON.parse(tech_category) : [];
    await connection.query("DELETE FROM portfolio_categories WHERE portfolio_id=?", [id]);

    for (const slug of categories) {
      const [cat] = await connection.query(
        "SELECT id FROM portfolio_main_categories WHERE slug=?",
        [slug]
      );
      if (cat.length) {
        await connection.query(
          "INSERT INTO portfolio_categories (portfolio_id, category_id) VALUES (?,?)",
          [id, cat[0].id]
        );
      }
    }

    /* 3) UPDATE DESCRIPTIONS */
    const descArray = descriptions ? JSON.parse(descriptions) : [];
    await connection.query("DELETE FROM portfolio_descriptions WHERE portfolio_id=?", [id]);

    for (let i = 0; i < descArray.length; i++) {
      await connection.query(
        `INSERT INTO portfolio_descriptions (portfolio_id, description, display_order)
         VALUES (?, ?, ?)`,
        [id, descArray[i], i + 1]
      );
    }

    /* 4) LOAD OLD IMAGES */
    /* 4) LOAD OLD IMAGES */
    const [oldImages] = await connection.query(
      `SELECT id, image_url, file_id, is_header, display_order 
   FROM portfolio_images 
   WHERE portfolio_id=?
   ORDER BY is_header DESC, display_order ASC`,
      [id]
    );


    const imagesToDelete = [];
    const imagesToUpload = [];

    /* 5) NEW LOGIC: ANY CHANGE = FULL REPLACE */
    for (let i = 0; i < incomingImages.length; i++) {
      const incoming = incomingImages[i];
      const existing = oldImages[i];
      const isHeader = i === 0 ? 1 : 0;

      /* Removed slot */
      if (!incoming && existing) {
        imagesToDelete.push(existing);
        continue;
      }

      /* No existing slot → new image */
      if (!existing && incoming) {
        const file = newFiles[incoming.fileIndex];
        if (!file || !file.buffer) throw new Error("Missing file for new upload");

        imagesToUpload.push({
          index: i,
          isHeader,
          file
        });
        continue;
      }

      const orderChanged = existing.display_order !== i;
      const urlChanged = incoming.image_url !== existing.image_url;
      const newUploadedRequired = incoming.isNew === true;

      /* If it's new → upload */
      if (newUploadedRequired) {
        const file = newFiles[incoming.fileIndex];
        if (!file || !file.buffer) throw new Error("Missing file for new upload");

        imagesToDelete.push(existing);
        imagesToUpload.push({
          index: i,
          isHeader,
          file
        });
        continue;
      }

      /* If ONLY order changed → keep file, just update order */
      if (orderChanged && !urlChanged) {
        await connection.query(
          `UPDATE portfolio_images SET display_order=?, is_header=? WHERE id=?`,
          [i, isHeader, existing.id]
        );
        continue;
      }

      /* If URL changed → replace */
      if (urlChanged) {
        const file = newFiles[incoming.fileIndex];
        if (!file || !file.buffer) throw new Error("Missing file for replacement");

        imagesToDelete.push(existing);
        imagesToUpload.push({
          index: i,
          isHeader,
          file
        });
        continue;
      }


      /* This case will never happen now because reorder forces replace */
    }

    /* 6) DELETE OLD IMAGES AFTER COMMIT */
    const deleteAfterCommit = [...imagesToDelete];

    /* 7) UPLOAD ALL NEW IMAGES */
    for (const img of imagesToUpload) {
      const fileName = `${id}_${img.isHeader ? "header" : img.index}_${Date.now()}.webp`;

      const uploaded = await imagekit.upload({
        file: img.file.buffer,
        fileName,
        folder: ImagekitFolder.portfolio_images,
        useUniqueFileName: false,
      });

      await connection.query(
        `INSERT INTO portfolio_images (portfolio_id, image_url, file_id, display_order, alt_text, is_header)
   VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          uploaded.url,
          uploaded.fileId,  // ← store fileId
          img.index,
          `${title} - Image ${img.index}`,
          img.isHeader
        ]
      );

    }

    /* 8) DELETE OLD DB ENTRIES */
    for (const img of imagesToDelete) {
      await connection.query("DELETE FROM portfolio_images WHERE id=?", [img.id]);
    }

    /* 9) COMMIT */
    await connection.commit();

    /* 10) DELETE OLD FILES (safe, outside transaction) */
    for (const img of deleteAfterCommit) {
      if (img.file_id) {
        try {
          await imagekit.deleteFile(img.file_id);
        } catch (e) {
          console.log("ImageKit delete failed:", e.message);
        }
      }

    }

    res.json({
      success: true,
      message: "Portfolio updated successfully",
      portfolio: await getPortfolioWithRelations(id),
    });

  } catch (err) {
    await connection.rollback();
    console.error("Update Portfolio Error:", err.message);
    throw err;
  } finally {
    connection.release();
  }
});

const deletePortfolio = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    /* 1️⃣ Load all ImageKit file IDs for this portfolio */
    const [images] = await connection.query(
      "SELECT id, file_id FROM portfolio_images WHERE portfolio_id=?",
      [id]
    );

    /* 2️⃣ Delete image rows from DB */
    await connection.query(
      "DELETE FROM portfolio_images WHERE portfolio_id=?",
      [id]
    );

    /* 3️⃣ Delete categories */
    await connection.query(
      "DELETE FROM portfolio_categories WHERE portfolio_id=?",
      [id]
    );

    /* 4️⃣ Delete descriptions */
    await connection.query(
      "DELETE FROM portfolio_descriptions WHERE portfolio_id=?",
      [id]
    );

    /* 5️⃣ Delete the portfolio row */
    await connection.query("DELETE FROM portfolio WHERE id=?", [id]);

    /* 6️⃣ Commit DB changes */
    await connection.commit();

    /* 7️⃣ Now delete files safely from ImageKit (outside transaction) */
    for (const img of images) {
      if (img.file_id) {
        try {
          await imagekit.deleteFile(img.file_id);
        } catch (err) {
          console.log("ImageKit delete failed:", img.file_id, err.message);
        }
      }
    }

    res.json({
      success: true,
      message: "Portfolio deleted successfully",
    });
  } catch (err) {
    await connection.rollback();
    console.error("Delete portfolio error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete portfolio",
    });
  } finally {
    connection.release();
  }
});

const getCarouselPortfolios = asyncHandler(async (req, res) => {
  let limit = parseInt(req.query.limit) || 5;

  const [rows] = await db.query(
    `
    SELECT 
      p.id,
      p.title,
      p.slug,
      p.project_type,

      (SELECT image_url 
         FROM portfolio_images 
         WHERE portfolio_id = p.id AND is_header = 1
         LIMIT 1
      ) AS header_image,

      (
        SELECT IFNULL(
          CONCAT(
            '[',
              GROUP_CONCAT('"', mc.slug, '"' SEPARATOR ','),
            ']'
          ),
          '[]'
        )
        FROM portfolio_categories pc
        JOIN portfolio_main_categories mc ON pc.category_id = mc.id
        WHERE pc.portfolio_id = p.id
      ) AS tech_category

    FROM portfolio p
    ORDER BY p.created_at DESC
    LIMIT ?;
  `,
    [limit]
  );

  const formatted = rows.map(item => ({
    id: item.id,
    title: item.title,
    slug: item.slug,
    project_type: item.project_type,
    header_image: item.header_image,
    tech_category: JSON.parse(item.tech_category)
  }));

  res.json({
    success: true,
    portfolios: formatted
  });
});




module.exports = {
  getAllPortfolios,
  getPortfolioById,
  getPortfolioBySlug,
  getPortfoliosByCategory,
  addPortfolio,
  updatePortfolio,
  deletePortfolio,
  getCarouselPortfolios
};
