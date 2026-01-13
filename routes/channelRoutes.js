const express = require('express');
const router = express.Router();
const channelController = require('../controllers/channelController');
const { checkAdmin } = require('../middleware/authMiddleware');

router.post('/verify-channels', channelController.verifyChannels);

// Admin Routes
router.get('/admin/channels', checkAdmin, channelController.getChannels);
router.post('/admin/channels', checkAdmin, channelController.addChannel);
router.delete('/admin/channels/:id', checkAdmin, channelController.deleteChannel);

module.exports = router;
