const pool = require('../config/db');

exports.getOrigins = async (req, res) => {
    try {
        const [origins] = await pool.execute('SELECT * FROM allowed_origins ORDER BY id DESC');
        res.json(origins);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch origins' });
    }
};

exports.addOrigin = async (req, res) => {
    const { origin_url } = req.body;
    if (!origin_url) return res.status(400).json({ error: 'Missing origin_url' });
    try {
        await pool.execute('INSERT INTO allowed_origins (origin_url) VALUES (?)', [origin_url]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add origin' });
    }
};

exports.deleteOrigin = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.execute('DELETE FROM allowed_origins WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete origin' });
    }
};
