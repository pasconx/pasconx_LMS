import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../config/database.js';
import { supabase, supabaseAuth } from '../config/supabase.js';
import { JWT_SECRET } from '../middleware/auth.js';
import { logSecurityEvent } from '../utils/auditLogger.js';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

/**
 * SQLite authentication implementation (existing baseline & rollback path)
 */
async function loginSqlite(req, res, next) {
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
      token
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Supabase Auth implementation with public.profiles validation
 */
async function loginSupabase(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Supabase authentication service is not configured.'
      });
    }

    const authClient = supabaseAuth || supabase;
    const { data, error } = await authClient.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      const errMsg = error.message || '';
      const isBanned = errMsg.toLowerCase().includes('banned') || errMsg.toLowerCase().includes('disabled');

      if (isBanned) {
        // Attempt to find profile UUID for security audit trail
        const { data: bannedProfile } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', email.trim())
          .maybeSingle();

        logSecurityEvent({
          userId: bannedProfile?.id || null,
          eventType: 'LOGIN_FAILED',
          resourceType: 'user',
          resourceId: bannedProfile?.id || null,
          req,
          status: 'DENIED',
          details: 'Account disabled'
        });

        return res.status(403).json({
          success: false,
          error: 'Your account has been disabled. Please contact the administrator.'
        });
      }

      logSecurityEvent({
        eventType: 'LOGIN_FAILED',
        resourceType: 'user',
        req,
        status: 'DENIED',
        details: errMsg === 'Invalid login credentials' ? 'Invalid email or password' : errMsg
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    // Validate authenticated user against public.profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, email, role, status')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      logSecurityEvent({
        userId: data.user.id,
        eventType: 'LOGIN_FAILED',
        resourceType: 'user',
        resourceId: data.user.id,
        req,
        status: 'DENIED',
        details: 'User profile not found'
      });
      return res.status(401).json({
        success: false,
        error: 'User profile not found.'
      });
    }

    if (profile.status === 'DISABLED') {
      logSecurityEvent({
        userId: profile.id,
        eventType: 'LOGIN_FAILED',
        resourceType: 'user',
        resourceId: profile.id,
        req,
        status: 'DENIED',
        details: 'Account disabled'
      });
      return res.status(403).json({
        success: false,
        error: 'Your account has been disabled. Please contact the administrator.'
      });
    }

    const token = data.session.access_token;
    res.cookie('pasconix_token', token, COOKIE_OPTIONS);

    const safeUser = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      status: profile.status
    };

    logSecurityEvent({
      userId: profile.id,
      eventType: 'LOGIN_SUCCESS',
      resourceType: 'user',
      resourceId: profile.id,
      req,
      status: 'SUCCESS'
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      user: safeUser,
      token
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Main login handler dispatching based on active DATA_BACKEND
 */
export async function login(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return loginSupabase(req, res, next);
  }
  return loginSqlite(req, res, next);
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
