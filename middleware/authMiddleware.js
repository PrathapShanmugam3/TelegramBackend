const pool = require('../config/db');

// Helper to check if requester is admin
const checkAdmin = async (req, res, next) => {
    const adminId = req.headers['x-admin-id'];
    if (!adminId) return res.status(401).json({ error: 'Unauthorized: Missing Admin ID' });

    try {
        const adminIdStr = String(adminId);
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

module.exports = { checkAdmin };
