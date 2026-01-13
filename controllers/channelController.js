const pool = require('../config/db');

// Helper: Check Membership via Telegram API
async function checkTelegramMembership(userId, channelId) {
    const token = process.env.BOT_TOKEN;
    if (!token) {
        console.error('BOT_TOKEN is missing in .env');
        return false;
    }
    try {
        const url = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${channelId}&user_id=${userId}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) {
            console.error(`Telegram API Error for ${channelId}:`, data.description);
            return false;
        }

        const status = data.result.status;
        return ['creator', 'administrator', 'member', 'restricted'].includes(status);
    } catch (error) {
        console.error('Membership check network error:', error);
        return false;
    }
}

exports.getChannels = async (req, res) => {
    try {
        const [channels] = await pool.execute('SELECT * FROM channels ORDER BY id DESC');
        res.json(channels);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
};

exports.addChannel = async (req, res) => {
    const { channel_id, channel_name, channel_url } = req.body;
    if (!channel_id || !channel_name || !channel_url) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    try {
        await pool.execute(
            'INSERT INTO channels (channel_id, channel_name, channel_url) VALUES (?, ?, ?)',
            [channel_id, channel_name, channel_url]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add channel' });
    }
};

exports.deleteChannel = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.execute('DELETE FROM channels WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete channel' });
    }
};

exports.verifyChannels = async (req, res) => {
    const { telegram_id } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'Missing telegram_id' });

    try {
        const [channels] = await pool.execute('SELECT * FROM channels');

        if (channels.length === 0) {
            return res.json({ verified: true, missing_channels: [] });
        }

        const missing_channels = [];

        for (const channel of channels) {
            const isMember = await checkTelegramMembership(telegram_id, channel.channel_id);
            if (!isMember) {
                missing_channels.push(channel);
            }
        }

        if (missing_channels.length > 0) {
            return res.json({ verified: false, missing_channels });
        }

        return res.json({ verified: true });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
