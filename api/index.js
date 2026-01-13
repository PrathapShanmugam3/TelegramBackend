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

// Endpoint to check DB connection (Table creation is manual)
app.get('/init-db', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.send('Database connection successful. Please create the "users" table manually using the provided DDL.');
    } catch (error) {
        console.error('DB Connection error:', error);
        res.status(500).send('Error connecting to database: ' + error.message);
    }
});

app.post('/secure-login', async (req, res) => {
    try {
        const { telegram_id, device_id, name, username, first_name, last_name, photo_url, auth_date } = req.body;
        const telegramIdStr = String(telegram_id); // Ensure string for VARCHAR
        const deviceIdStr = String(device_id);     // Ensure string for VARCHAR

        if (!telegram_id || !device_id) {
            return res.status(400).json({ error: 'Missing telegram_id or device_id' });
        }

        // 0. Device Ownership Check: Ensure this device isn't owned by someone else
        // Check if any user *other than the current one* is linked to this device
        const [conflictingOwners] = await pool.execute(
            'SELECT telegram_id, name FROM users WHERE device_id = ? AND telegram_id != ? LIMIT 1',
            [deviceIdStr, telegramIdStr]
        );

        if (conflictingOwners.length > 0) {
            const owner = conflictingOwners[0];
            console.log(`Device ${deviceIdStr} is owned by ${owner.name} (${owner.telegram_id}). Login denied for ${telegramIdStr}.`);
            return res.json({
                blocked: true,
                reason: `This device is already linked to account "${owner.name}". Multiple accounts per device are not allowed.`
            });
        }

        // Get real IP
        const ipHeader = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const ip_address = Array.isArray(ipHeader) ? ipHeader[0] : ipHeader.split(',')[0].trim();

        console.log(`Login attempt: TG=${telegramIdStr}, Device=${deviceIdStr}, IP=${ip_address}`);

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
            if (user.device_id !== deviceIdStr) {
                console.log(`Mismatch detected! Registered: [${user.device_id}] vs New: [${deviceIdStr}]`);

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

            // Update user details (IP, username, photo, etc.) to keep them fresh
            await pool.execute(
                `UPDATE users SET 
                    ip_address = ?, 
                    username = ?, 
                    first_name = ?, 
                    last_name = ?, 
                    photo_url = ?, 
                    auth_date = ? 
                 WHERE telegram_id = ?`,
                [ip_address, username || null, first_name || null, last_name || null, photo_url || null, auth_date || null, telegramIdStr]
            );

            // All good, welcome back
            return res.json({ blocked: false, role: user.role || 'user' });

        } else {
            // 4. New User: Register and Lock to this Device/IP
            await pool.execute(
                `INSERT INTO users (telegram_id, device_id, ip_address, name, username, first_name, last_name, photo_url, auth_date, role) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')`,
                [telegramIdStr, deviceIdStr, ip_address, name, username || null, first_name || null, last_name || null, photo_url || null, auth_date || null]
            );

            return res.json({ blocked: false, role: 'user' });
        }

    } catch (error) {
        console.error('Error in secure-login:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// --- Admin Endpoints ---

// Helper to check if requester is admin
const checkAdmin = async (req, res, next) => {
    const adminId = req.headers['x-admin-id'];
    if (!adminId) return res.status(401).json({ error: 'Unauthorized: Missing Admin ID' });

    try {
        const adminIdStr = String(adminId);
        // console.log(`Checking admin privileges for ID: ${adminIdStr}`); // Debug log

        const [admins] = await pool.execute('SELECT role FROM users WHERE telegram_id = ?', [adminIdStr]);

        if (admins.length === 0) {
            console.log(`Admin check failed: User ${adminIdStr} not found`);
            return res.status(403).json({ error: 'Forbidden: User not found' });
        }

        if (admins[0].role !== 'admin') {
            console.log(`Admin check failed: User ${adminIdStr} has role ${admins[0].role}`);
            return res.status(403).json({ error: 'Forbidden: You are not an admin' });
        }

        next();
    } catch (error) {
        console.error('Admin Auth Check Error:', error);
        res.status(500).json({ error: 'Auth Check Failed: ' + error.message });
    }
};

// Get All Users
app.get('/admin/users', checkAdmin, async (req, res) => {
    try {
        const [users] = await pool.execute('SELECT * FROM users ORDER BY id DESC');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Update User
app.put('/admin/users/:id', checkAdmin, async (req, res) => {
    const { id } = req.params;
    const { role, is_blocked, name, device_id } = req.body;
    try {
        await pool.execute(
            'UPDATE users SET role = ?, is_blocked = ?, name = ?, device_id = ? WHERE id = ?',
            [role, is_blocked, name, device_id, id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete User
app.delete('/admin/users/:id', checkAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.execute('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}
