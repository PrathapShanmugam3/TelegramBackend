const express = require('express');
const router = express.Router();
const originController = require('../controllers/originController');
const { checkAdmin } = require('../middleware/authMiddleware');

router.get('/admin/origins', checkAdmin, originController.getOrigins);
router.post('/admin/origins', checkAdmin, originController.addOrigin);
router.delete('/admin/origins/:id', checkAdmin, originController.deleteOrigin);

module.exports = router;
