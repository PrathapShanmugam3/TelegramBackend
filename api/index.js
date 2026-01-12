require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Triple-Lock Security Backend is running');
});

app.post('/secure-login', async (req, res) => {
    try {
        const { telegram_id, device_id, name } = req.body;

        if (!telegram_id || !device_id) {
            return res.status(400).json({ error: 'Missing telegram_id or device_id' });
        }

        // Get real IP from Vercel/Proxy headers
        const ipHeader = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        // Normalize IP (handle array or string)
        const ip_address = Array.isArray(ipHeader) ? ipHeader[0] : ipHeader.split(',')[0].trim();

        console.log(`Login attempt: TG=${telegram_id}, Device=${device_id}, IP=${ip_address}`);

        // Check if Device ID or IP is already used by someone else
        const conflictingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { device_id: device_id },
                    { ip_address: ip_address }
                ],
                NOT: {
                    telegram_id: BigInt(telegram_id)
                }
            }
        });

        if (conflictingUser) {
            console.log('Blocked user due to conflict:', conflictingUser);
            return res.json({ blocked: true, reason: "Multi-account detected via Device ID or IP" });
        }

        // If safe, save/update user info
        await prisma.user.upsert({
            where: { telegram_id: BigInt(telegram_id) },
            update: {
                device_id: device_id,
                ip_address: ip_address,
                name: name
            },
            create: {
                telegram_id: BigInt(telegram_id),
                device_id: device_id,
                ip_address: ip_address,
                name: name
            }
        });

        res.json({ blocked: false });

    } catch (error) {
        console.error('Error in secure-login:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// For Vercel, we export the app
module.exports = app;

// For local dev
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}
