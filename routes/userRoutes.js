const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { checkAdmin } = require('../middleware/authMiddleware');

router.get('/init-db', userController.initDb);
router.post('/secure-login', userController.secureLogin);

// Admin Routes
router.get('/admin/users', checkAdmin, userController.getUsers);
router.put('/admin/users/:id', checkAdmin, userController.updateUser);
router.delete('/admin/users/:id', checkAdmin, userController.deleteUser);

module.exports = router;
