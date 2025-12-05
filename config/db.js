const mysql = require('mysql2/promise');
require('dotenv').config();
const util = require("util");

// Use connection pool instead of a single connection
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'codegrin',
  dateStrings: true,
});

// Promisify the pool.query method
// pool.query = util.promisify(pool.query);

// module.exports = pool;
module.exports = { db }
    
