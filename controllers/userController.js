const pool = require('../config/db');

exports.initDb = async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.send('Database connection successful. Please create "users", "channels", and "allowed_origins" tables manually using the provided DDL.');
    } catch (error) {
        console.error('DB Connection error:', error);
        res.status(500).send('Error connecting to database: ' + error.message);
    }
};

exports.secureLogin = async (req, res) => {
    try {
        const { telegram_id, device_id, name, username, first_name, last_name, photo_url, auth_date } = req.body;
        const telegramIdStr = String(telegram_id);
        const deviceIdStr = String(device_id);

        if (!telegram_id || !device_id) {
            return res.status(400).json({ error: 'Missing telegram_id or device_id' });
        }

        // 0. Device Ownership Check
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
            if (user.device_id !== deviceIdStr) {
                console.log(`Mismatch detected! Registered: [${user.device_id}] vs New: [${deviceIdStr}]`);
                await pool.execute(
                    'UPDATE users SET is_blocked = TRUE WHERE telegram_id = ?',
                    [telegramIdStr]
                );
                return res.json({
                    blocked: true,
                    reason: "Security Alert: Login attempt from new Device. Account Blocked."
                });
            }

            // Update user details
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

            return res.json({ blocked: false, role: user.role || 'user' });

        } else {
            // 4. New User
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
};

exports.getUsers = async (req, res) => {
    try {
        const [users] = await pool.execute('SELECT * FROM users ORDER BY id DESC');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

exports.updateUser = async (req, res) => {
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
};

exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.execute('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
};
