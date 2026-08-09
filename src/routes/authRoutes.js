const express = require('express');
const authController = require('../controllers/authController');
const asyncHandler = require('../http/asyncHandler');
const { authenticate, requirePermission } = require('../middleware/authenticate');
const roleController = require('../controllers/roleController');

const router = express.Router();

router.post('/login', asyncHandler(authController.login));
router.post('/forgot-password', asyncHandler(authController.forgotPassword));
router.post('/reset-password', asyncHandler(authController.resetPassword));

router.get('/me', authenticate, asyncHandler(authController.me));
router.post('/logout', authenticate, asyncHandler(authController.logout));
router.post('/change-password', authenticate, asyncHandler(authController.changePassword));

router.get('/users', authenticate, requirePermission('users.view'), asyncHandler(authController.listUsers));
router.post('/users', authenticate, requirePermission('users.manage'), asyncHandler(authController.createUser));
router.post('/users/:id/resend-invite', authenticate, requirePermission('users.manage'), asyncHandler(authController.resendInvite));
router.put('/users/:id', authenticate, requirePermission('users.manage'), asyncHandler(authController.updateUser));
router.delete('/users/:id', authenticate, requirePermission('users.manage'), asyncHandler(authController.deleteUser));

router.get('/roles', authenticate, requirePermission('roles.view', 'users.manage'), asyncHandler(roleController.list));
router.post('/roles', authenticate, requirePermission('roles.manage'), asyncHandler(roleController.create));
router.put('/roles/:slug', authenticate, requirePermission('roles.manage'), asyncHandler(roleController.update));
router.delete('/roles/:slug', authenticate, requirePermission('roles.manage'), asyncHandler(roleController.remove));

module.exports = router;
