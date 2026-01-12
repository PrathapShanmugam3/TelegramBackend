require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();

app.use(cors({
    origin: '*', // Allow all origins for now (can be restricted to Vercel app domain later)
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Create a connection pool
if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is missing!');
}
const pool = mysql.createPool(process.env.DATABASE_URL || '');

app.get('/', (req, res) => {
    res.send('Triple-Lock Security Backend is running (MySQL)');
});

app.post('/secure-login', async (req, res) => {
    try {
        const { telegram_id, device_id, name } = req.body;

        if (!telegram_id || !device_id) {
            return res.status(400).json({ error: 'Missing telegram_id or device_id' });
        }

        // Get real IP from Vercel/Proxy headers
        const ipHeader = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const ip_address = Array.isArray(ipHeader) ? ipHeader[0] : ipHeader.split(',')[0].trim();

        console.log(`Login attempt: TG=${telegram_id}, Device=${device_id}, IP=${ip_address}`);

        // Check if Device ID or IP is already used by someone else
        const [conflicts] = await pool.execute(
            `SELECT telegram_id FROM users 
       WHERE (device_id = ? OR ip_address = ?) 
       AND telegram_id != ?`,
            [device_id, ip_address, telegram_id]
        );

        if (conflicts.length > 0) {
            console.log('Blocked user due to conflict:', conflicts[0]);
            return res.json({ blocked: true, reason: "Multi-account detected via Device ID or IP" });
        }

        // If safe, save/update user info
        // MySQL ON DUPLICATE KEY UPDATE
        await pool.execute(
            `INSERT INTO users (telegram_id, device_id, ip_address, name) 
       VALUES (?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE device_id = ?, ip_address = ?, name = ?`,
            [telegram_id, device_id, ip_address, name, device_id, ip_address, name]
        );

        res.json({ blocked: false });

    } catch (error) {
        console.error('Error in secure-login:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Endpoint to initialize the database table (run once)
app.get('/init-db', async (req, res) => {
    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                telegram_id BIGINT PRIMARY KEY,
                device_id VARCHAR(255),
                ip_address VARCHAR(255),
                name VARCHAR(255),
                is_blocked BOOLEAN DEFAULT FALSE
            )
        `);
        res.send('Database initialized successfully');
    } catch (error) {
        console.error('Init DB error:', error);
        res.status(500).send('Error initializing database');
    }
});

module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}
