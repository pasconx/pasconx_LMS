import jwt from 'jsonwebtoken';
import { db } from '../config/database.js';
import { supabase } from '../config/supabase.js';

export const JWT_SECRET = process.env.SESSION_SECRET || 'pasconix_default_jwt_secret_dev';

/**
 * SQLite authentication verification (existing baseline & rollback path)
 */
function authenticateSqliteUser(req, res, next, token) {
  try {
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
 * Supabase Auth verification with public.profiles validation
 */
async function authenticateSupabaseUser(req, res, next, token) {
  try {
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Supabase authentication service is not configured.'
      });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      const errMsg = error?.message || '';
      if (errMsg.toLowerCase().includes('expired')) {
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

    // Validate against public.profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, email, role, status')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({
        success: false,
        error: 'User account no longer exists.'
      });
    }

    if (profile.status === 'DISABLED') {
      return res.status(403).json({
        success: false,
        error: 'Your account has been disabled. Please contact the administrator.'
      });
    }

    req.user = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      status: profile.status
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication session.'
    });
  }
}

/**
 * Verifies JWT token from HTTP-only cookie or Authorization header,
 * routes verification according to DATA_BACKEND, and attaches user to req.
 */
export function authenticateUser(req, res, next) {
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

  if (process.env.DATA_BACKEND === 'supabase') {
    return authenticateSupabaseUser(req, res, next, token);
  }

  return authenticateSqliteUser(req, res, next, token);
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
