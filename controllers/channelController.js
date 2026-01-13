const pool = require('../config/db');

// Helper: Check Membership via Telegram API
async function checkTelegramMembership(userId, channelId) {
    const token = process.env.BOT_TOKEN;
    if (!token) {
        console.error('BOT_TOKEN is missing in .env');
        return false;
    }
    try {
        // Auto-fix private channel IDs (missing -100 prefix)
        let targetId = channelId;
        if (!String(channelId).startsWith('-') && !String(channelId).startsWith('@')) {
            targetId = '-100' + channelId;
        }

        const url = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${targetId}&user_id=${userId}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) {
            console.error(`Telegram API Error for ${channelId}:`, data.description);
            return false;
        }

        const status = data.result.status;
        // User requested logic:
        if (['left', 'kicked'].includes(status)) {
            return false;
        }
        return true;
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
    let { channel_id, channel_url } = req.body;

    // If no ID provided, try to extract username from URL
    if (!channel_id && channel_url) {
        const match = channel_url.match(/t\.me\/([\w\d_]+)/);
        if (match && !channel_url.includes('+')) { // Public username
            channel_id = '@' + match[1];
        }
    }

    if (!channel_id) {
        return res.status(400).json({ error: 'Could not determine Channel ID. For private channels, you MUST provide the ID (-100...). For public channels, provide the Link.' });
    }

    const token = process.env.BOT_TOKEN;
    let channel_name = 'Unknown Channel';
    // let channel_url = '#'; // Already declared above

    try {
        // 1. Fetch Channel Details from Telegram
        const url = `https://api.telegram.org/bot${token}/getChat?chat_id=${channel_id}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.ok) {
            const chat = data.result;
            channel_name = chat.title || 'Unknown';
            if (chat.username) {
                channel_url = `https://t.me/${chat.username}`;
            } else if (chat.invite_link) {
                channel_url = chat.invite_link;
            }
        } else {
            console.warn(`Could not fetch details for ${channel_id}: ${data.description}`);
            // Proceed anyway, maybe user knows it's correct
        }

        // 2. Insert into DB
        await pool.execute(
            'INSERT INTO channels (channel_id, channel_name, channel_url) VALUES (?, ?, ?)',
            [channel_id, channel_name, channel_url]
        );
        res.json({ success: true, channel: { channel_id, channel_name, channel_url } });

    } catch (error) {
        console.error('Add Channel Error:', error);
        res.status(500).json({ error: 'Failed to add channel: ' + error.message });
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

exports.resolveChannelId = async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Missing username' });

    const token = process.env.BOT_TOKEN;
    try {
        const url = `https://api.telegram.org/bot${token}/getChat?chat_id=${username}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) {
            return res.status(400).json({ error: 'Could not find channel. Ensure the bot is an admin or the username is correct.' });
        }

        res.json({ id: data.result.id, title: data.result.title });
    } catch (error) {
        res.status(500).json({ error: 'Failed to resolve channel ID' });
    }
};
