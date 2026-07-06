const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// User Authentication
router.post('/login', authController.login);

// User Management (Admin only)
router.get('/users', authController.listUsers);
router.post('/users', authController.createUser);
router.put('/users/:id', authController.updateUser);
router.delete('/users/:id', authController.deleteUser);

module.exports = router;
