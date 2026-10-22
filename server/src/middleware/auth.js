import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../config/database.js';
import { supabase } from '../config/supabase.js';
import { enforceSessionOnRequest } from '../utils/sessionLock.js';

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
    return enforceSessionOnRequest(req, res).then((ok) => {
      if (ok) next();
    }).catch((err) => {
      console.error('Session validation error:', err?.message || err);
      return res.status(500).json({ success: false, error: 'Session validation failed.' });
    });
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

// Lightweight in-memory session cache (60 seconds TTL) to avoid redundant remote Supabase auth network calls on every request
const supabaseSessionCache = new Map();
const SESSION_CACHE_TTL_MS = 60 * 1000; // 60 seconds

function hashToken(token) {
  if (!token || typeof token !== 'string') return '';
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export function extractToken(req) {
  let token = req.cookies?.pasconix_token;
  if (!token && req.headers?.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    } else if (parts.length === 1 && parts[0].length > 10) {
      token = parts[0];
    }
  }
  return token ? token.trim() : null;
}

export function invalidateSessionCache(token) {
  if (token) {
    const key = hashToken(token);
    supabaseSessionCache.delete(key);
  }
}

export function invalidateUserSessions(userId) {
  if (!userId) return;
  for (const [k, v] of supabaseSessionCache.entries()) {
    if (v.user?.id === userId) {
      supabaseSessionCache.delete(k);
    }
  }
}

export function clearSessionCache() {
  supabaseSessionCache.clear();
}

/**
 * Supabase Auth verification with public.profiles validation (with in-memory caching)
 */
async function authenticateSupabaseUser(req, res, next, token) {
  const tokenKey = hashToken(token);
  try {
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Supabase authentication service is not configured.'
      });
    }

    const now = Date.now();

    // 1. Inspect token expiration directly via JWT payload to prevent serving expired tokens
    let jwtExpMs = Infinity;
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) {
        jwtExpMs = decoded.exp * 1000;
        if (now >= jwtExpMs) {
          supabaseSessionCache.delete(tokenKey);
          return res.status(401).json({
            success: false,
            error: 'Your session has expired. Please log in again.'
          });
        }
      }
    } catch {
      // If decoding fails, proceed to Supabase validation
    }

    // 2. Check in-memory cache
    const cached = supabaseSessionCache.get(tokenKey);
    if (cached && now < cached.expiresAt) {
      req.user = cached.user;
      // single-session lock is re-checked on EVERY request (never cached)
      if (!(await enforceSessionOnRequest(req, res))) return;
      return next();
    }

    // 3. Validate with Supabase remote Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      supabaseSessionCache.delete(tokenKey);
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

    // 4. Validate against public.profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, email, role, status')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      supabaseSessionCache.delete(tokenKey);
      return res.status(401).json({
        success: false,
        error: 'User account no longer exists.'
      });
    }

    if (profile.status === 'DISABLED') {
      supabaseSessionCache.delete(tokenKey);
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

    // 5. Store in cache bounded by whichever expires first: 60s TTL or token expiration
    const expiresAt = Math.min(now + SESSION_CACHE_TTL_MS, jwtExpMs);

    // Prune expired entries or if map exceeds 1000 entries
    if (supabaseSessionCache.size > 1000) {
      for (const [k, v] of supabaseSessionCache.entries()) {
        if (now >= v.expiresAt || supabaseSessionCache.size > 800) {
          supabaseSessionCache.delete(k);
        }
      }
    }

    supabaseSessionCache.set(tokenKey, {
      user: req.user,
      cachedAt: now,
      expiresAt: expiresAt
    });

    if (!(await enforceSessionOnRequest(req, res))) return;
    next();
  } catch (error) {
    supabaseSessionCache.delete(tokenKey);
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
  const token = extractToken(req);

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
