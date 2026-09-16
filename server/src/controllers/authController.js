import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../config/database.js';
import { JWT_SECRET } from '../middleware/auth.js';
import { logSecurityEvent } from '../utils/auditLogger.js';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email.trim());

    if (!user) {
      logSecurityEvent({
        eventType: 'LOGIN_FAILED',
        resourceType: 'user',
        req,
        status: 'DENIED',
        details: 'User not found'
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    if (user.status === 'DISABLED') {
      logSecurityEvent({
        userId: user.id,
        eventType: 'LOGIN_FAILED',
        resourceType: 'user',
        resourceId: user.id,
        req,
        status: 'DENIED',
        details: 'Account disabled'
      });
      return res.status(403).json({
        success: false,
        error: 'Your account has been disabled. Please contact the administrator.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      logSecurityEvent({
        userId: user.id,
        eventType: 'LOGIN_FAILED',
        resourceType: 'user',
        resourceId: user.id,
        req,
        status: 'DENIED',
        details: 'Password mismatch'
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('pasconix_token', token, COOKIE_OPTIONS);

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    };

    logSecurityEvent({
      userId: user.id,
      eventType: 'LOGIN_SUCCESS',
      resourceType: 'user',
      resourceId: user.id,
      req,
      status: 'SUCCESS'
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      user: safeUser,
      token // Provided so test suites or non-browser clients can use Bearer auth
    });
  } catch (error) {
    next(error);
  }
}

export function logout(req, res) {
  if (req.user?.id) {
    logSecurityEvent({
      userId: req.user.id,
      eventType: 'LOGOUT',
      resourceType: 'user',
      resourceId: req.user.id,
      req,
      status: 'SUCCESS'
    });
  }

  res.clearCookie('pasconix_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  return res.json({
    success: true,
    message: 'Successfully logged out.'
  });
}

export function getCurrentUser(req, res) {
  return res.json({
    success: true,
    user: req.user
  });
}
