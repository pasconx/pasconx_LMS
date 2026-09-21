import rateLimit from 'express-rate-limit';
import { getClientIp } from '../utils/ipHelper.js';

export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 login attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: {
    success: false,
    error: 'Too many login attempts from this IP. Please try again after 5 minutes.'
  }
});


export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: {
    success: false,
    error: 'API rate limit exceeded. Please try again later.'
  }
});

