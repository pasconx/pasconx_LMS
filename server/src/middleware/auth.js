import jwt from 'jsonwebtoken';
import { db } from '../config/database.js';

export const JWT_SECRET = process.env.SESSION_SECRET || 'pasconix_default_jwt_secret_dev';

/**
 * Verifies JWT token from HTTP-only cookie or Authorization header,
 * checks user active status in the database, and attaches user to req.
 */
export function authenticateUser(req, res, next) {
  try {
    let token = req.cookies?.pasconix_token;

    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Always check the latest user record in database
    const user = db.prepare('SELECT id, name, email, role, status FROM users WHERE id = ?').get(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User account no longer exists.'
      });
    }

    if (user.status === 'DISABLED') {
      return res.status(403).json({
        success: false,
        error: 'Your account has been disabled. Please contact the administrator.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Your session has expired. Please log in again.'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication session.'
    });
  }
}

/**
 * Guard that enforces STUDENT role
 */
export function requireStudent(req, res, next) {
  if (!req.user || req.user.role !== 'STUDENT') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Student portal only.'
    });
  }
  next();
}

/**
 * Guard that enforces ADMIN role
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Administrator privileges required.'
    });
  }
  next();
}
