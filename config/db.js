const mysql = require('mysql2/promise');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is missing!');
}

const pool = mysql.createPool(process.env.DATABASE_URL || '');

module.exports = pool;
