require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./config/db'); // Import pool for CORS check
const userRoutes = require('./routes/userRoutes');
const channelRoutes = require('./routes/channelRoutes');
const originRoutes = require('./routes/originRoutes');

const app = express();

// Dynamic CORS Configuration
const corsOptions = {
    origin: async function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        try {
            // Always allow localhost for development
            if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
                return callback(null, true);
            }

            // Check DB for allowed origin
            const [rows] = await pool.execute('SELECT origin_url FROM allowed_origins WHERE origin_url = ?', [origin]);

            if (rows.length > 0) {
                callback(null, true);
            } else {
                console.warn(`Blocked by CORS: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        } catch (err) {
            console.error('CORS Error:', err);
            callback(err);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-id'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Use Routes
app.use('/', userRoutes);
app.use('/', channelRoutes);
app.use('/', originRoutes);

app.get('/', (req, res) => {
    res.send('Triple-Lock Security Backend is running (MySQL) - MVC Pattern');
});

module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}
