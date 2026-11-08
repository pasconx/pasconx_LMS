import rateLimit from 'express-rate-limit';
import { getClientIp } from '../utils/ipHelper.js';

const isDev = process.env.NODE_ENV === 'development' || process.env.APP_ENV === 'development';

/**
 * Authentication rate limiter (protects /api/auth/login from brute-force)
 */
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: isDev ? 1000 : 20, // generous in dev, strict in prod
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  skip: (req) => {
    if (process.env.RATE_LIMIT === 'off') return true;
    if (isDev && (getClientIp(req) === '127.0.0.1' || getClientIp(req) === 'localhost')) {
      return true;
    }
    return false;
  },
  message: {
    success: false,
    error: 'Too many login attempts from this IP. Please try again after 5 minutes.'
  }
});

/**
 * General API rate limiter (protects /api routes from denial-of-service)
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 50000 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  skip: (req) => {
    if (process.env.RATE_LIMIT === 'off') return true;
    // Never block development/local testing
    if (isDev) return true;
    return false;
  },
  message: {
    success: false,
    error: 'API rate limit exceeded. Please try again later.'
  }
});
