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

// Endpoint to initialize the database table
app.get('/init-db', async (req, res) => {
    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                telegram_id VARCHAR(255) UNIQUE NOT NULL,
                device_id VARCHAR(255),
                ip_address VARCHAR(255),
                name VARCHAR(255),
                is_blocked BOOLEAN DEFAULT FALSE
            )
        `);
        res.send('Database initialized successfully (Schema: id PK, telegram_id UNIQUE VARCHAR)');
    } catch (error) {
        console.error('Init DB error:', error);
        res.status(500).send('Error initializing database');
    }
});

app.post('/secure-login', async (req, res) => {
    try {
        const { telegram_id, device_id, name } = req.body;
        const telegramIdStr = String(telegram_id); // Ensure string for VARCHAR

        if (!telegram_id || !device_id) {
            return res.status(400).json({ error: 'Missing telegram_id or device_id' });
        }

        // Get real IP
        const ipHeader = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const ip_address = Array.isArray(ipHeader) ? ipHeader[0] : ipHeader.split(',')[0].trim();

        console.log(`Login attempt: TG=${telegramIdStr}, Device=${device_id}, IP=${ip_address}`);

        // 1. Check if user exists
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE telegram_id = ?',
            [telegramIdStr]
        );

        if (users.length > 0) {
            const user = users[0];

            // 2. Check if already blocked
            if (user.is_blocked) {
                return res.json({ blocked: true, reason: "Account is blocked." });
            }

            // 3. Strict Check: Must match registered Device ID
            // Note: IP check removed as per request to avoid blocking on network changes
            if (user.device_id !== device_id) {
                console.log(`Mismatch detected! Registered: [${user.device_id}] vs New: [${device_id}]`);

                // Block the user immediately
                await pool.execute(
                    'UPDATE users SET is_blocked = TRUE WHERE telegram_id = ?',
                    [telegramIdStr]
                );

                return res.json({
                    blocked: true,
                    reason: "Security Alert: Login attempt from new Device. Account Blocked."
                });
            }

            // Update IP address for logging purposes (optional, but good for tracking)
            if (user.ip_address !== ip_address) {
                await pool.execute(
                    'UPDATE users SET ip_address = ? WHERE telegram_id = ?',
                    [ip_address, telegramIdStr]
                );
            }

            // All good, welcome back
            return res.json({ blocked: false });

        } else {
            // 4. New User: Register and Lock to this Device/IP
            await pool.execute(
                `INSERT INTO users (telegram_id, device_id, ip_address, name) 
                 VALUES (?, ?, ?, ?)`,
                [telegramIdStr, device_id, ip_address, name]
            );

            return res.json({ blocked: false });
        }

    } catch (error) {
        console.error('Error in secure-login:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}
