const express = require('express');
const cors = require('cors');
const { db } = require("./config/db")
require('dotenv').config();
const path = require("path")


const adminAuthRoutes = require('./routes/adminAuthRoutes');
const portfolioRoutes = require('./routes/portfolioRoutes');
const categoryRoutes = require('./routes/categoryRoutes');

const app = express();

app.use(cors({
    origin: "*", // allows all origins
}));

app.use(express.json())
app.use(express.static(path.join(process.cwd(), "public")));

// Serve public folder at /public
app.use("/public", express.static(path.join(process.cwd(), "public")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));


app.use('/api/admin', adminAuthRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/portfolios", portfolioRoutes);

async function testConnection() {
    try {
        const [rows] = await db.query("SELECT 1")
        console.log("DB connected");
    } catch (error) {
        console.error("Failed to connect", error.message);
        process.exit(1)
    }
}
const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
    await testConnection()
    console.log(`Server running :${PORT}`);
})

