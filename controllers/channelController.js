const pool = require('../config/db');

// Helper: Check Membership via Telegram API
async function checkTelegramMembership(userId, channelId) {
    const token = process.env.BOT_TOKEN;
    if (!token) {
        console.error('BOT_TOKEN is missing in .env');
        return false;
    }
    try {
        let targetId = channelId;
        // Auto-fix private channel IDs (missing -100 prefix)
        let addedPrefix = false;
        if (!String(channelId).startsWith('-') && !String(channelId).startsWith('@')) {
            targetId = '-100' + channelId;
            addedPrefix = true;
        }

        const url = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${targetId}&user_id=${userId}`;
        console.log(`Checking Membership URL: ${url.replace(token, 'HIDDEN_TOKEN')}`);

        let response = await fetch(url);
        let data = await response.json();
        console.log(`Telegram API Response for ${targetId}:`, JSON.stringify(data));

        // Retry without prefix if failed and we added one
        if (!data.ok && addedPrefix) {
            console.log(`Retry: Checking original ID ${channelId} without prefix...`);
            const retryUrl = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${channelId}&user_id=${userId}`;
            response = await fetch(retryUrl);
            data = await response.json();
            console.log(`Retry Response for ${channelId}:`, JSON.stringify(data));
        }

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
    let { channel_name, channel_url } = req.body;

    if (!channel_name || !channel_url) {
        return res.status(400).json({ error: 'Missing channel_name or channel_url' });
    }

    try {
        // Insert into DB (No channel_id column)
        await pool.execute(
            'INSERT INTO channels (channel_name, channel_url) VALUES (?, ?)',
            [channel_name, channel_url]
        );
        res.json({ success: true, channel: { channel_name, channel_url } });

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
            // Extract ID/Username from URL
            let targetId = null;
            const url = channel.channel_url;

            // Case 1: Public Username (t.me/username)
            const match = url.match(/t\.me\/([\w\d_]+)/);
            if (match && !url.includes('+')) {
                targetId = '@' + match[1];
            }
            // Case 2: Private Invite Link (Cannot verify without ID)
            else {
                console.warn(`Cannot verify private link without ID: ${url}`);
                // We can't verify, so we assume they joined? Or fail?
                // Safest is to fail (require join), but we can't check.
                // Let's mark as missing so they see the link.
                missing_channels.push(channel);
                continue;
            }

            console.log(`Verifying User ${telegram_id} in Channel ${targetId}...`);
            const isMember = await checkTelegramMembership(telegram_id, targetId);
            console.log(`Result for ${targetId}: ${isMember}`);

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
