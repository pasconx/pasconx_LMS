import { Router } from 'express';
import { login, logout, getCurrentUser, changePassword } from '../controllers/authController.js';
import { authenticateUser } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { verifyTurnstile } from '../middleware/turnstile.js';

const router = Router();

// In automated test environments, avoid hitting rate limits
const loginMiddleware = process.env.NODE_ENV === 'test' ? [] : [authLimiter];

router.post('/login', ...loginMiddleware, verifyTurnstile, login);
router.post('/logout', logout);
router.get('/me', authenticateUser, getCurrentUser);
router.post('/change-password', authenticateUser, changePassword);



export default router;
