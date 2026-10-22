import crypto from 'crypto';
import { db } from '../config/database.js';
import { supabase } from '../config/supabase.js';
import { logSecurityEvent } from './auditLogger.js';

/**
 * ==========================================================================
 * SINGLE ACTIVE SESSION LOCK  (students only)  +  DESKTOP-ONLY GATE
 * ==========================================================================
 * Rule: a STUDENT account can be logged in on ONE device at a time.
 *  - While a session is alive, any new login (other laptop / phone) is BLOCKED.
 *  - A session is "alive" while the browser keeps sending requests/heartbeats.
 *    If no heartbeat arrives for SESSION_STALE_SECONDS (tab closed, laptop off,
 *    power cut) the lock expires automatically so the student is never locked
 *    out forever. Admin can also force-release from the Students page.
 *  - Admin accounts are NOT locked (so admin can never get stuck).
 *
 * Env:
 *   SINGLE_SESSION=off            -> disable the lock completely (emergency switch)
 *   SESSION_STALE_SECONDS=180     -> inactivity window after which lock expires
 */

export const SESSION_COOKIE = 'pasconix_sid';

const STALE_SECONDS = Number(process.env.SESSION_STALE_SECONDS) > 0
  ? Number(process.env.SESSION_STALE_SECONDS)
  : 180;
export const SESSION_STALE_MS = STALE_SECONDS * 1000;

// Only write last_seen to DB if older than this (reduces DB writes)
const TOUCH_INTERVAL_MS = 20 * 1000;

// If DB migration was not applied yet we fail-open (log loudly) instead of locking everyone out.
let schemaMissingLogged = false;

function useSupabase() {
  return process.env.DATA_BACKEND === 'supabase';
}

export function isSessionLockEnabled() {
  if (process.env.SINGLE_SESSION === 'off') return false;
  // Existing legacy tests log the same student in repeatedly. Enforce in tests only when asked.
  if (process.env.NODE_ENV === 'test' && process.env.ENFORCE_SESSION_IN_TEST !== '1') return false;
  return true;
}

function isSchemaError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('active_session_id') ||
    msg.includes('session_last_seen') ||
    msg.includes('no such column')
  );
}

function logSchemaProblem(err) {
  if (!schemaMissingLogged) {
    schemaMissingLogged = true;
    console.error(
      '[SESSION LOCK] DB columns missing! Run supabase/migrations/002_single_session_and_link_videos.sql ' +
      '(Supabase) or restart server (SQLite). Single-session lock is TEMPORARILY DISABLED. Error:',
      err?.message || err
    );
  }
}

export function newSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

export function getSessionIdFromReq(req) {
  const fromCookie = req.cookies?.[SESSION_COOKIE];
  const fromHeader = req.headers?.['x-session-id'];
  const sid = fromCookie || (typeof fromHeader === 'string' ? fromHeader : null);
  return sid ? String(sid).trim() : null;
}

/* -------------------------------------------------------------------------- */
/*  Desktop-only check                                                         */
/* -------------------------------------------------------------------------- */

const MOBILE_UA_REGEX =
  /Android|iPhone|iPad|iPod|Mobile|Windows Phone|BlackBerry|BB10|Opera Mini|Opera Mobi|IEMobile|Tablet|Silk|Kindle|PlayBook|CriOS|FxiOS|SamsungBrowser\/.*Mobile/i;

/**
 * Server-side best-effort check. (The client also runs a stricter check.)
 * Requests with NO user-agent at all are allowed so API tools / tests keep working.
 */
export function isMobileRequest(req) {
  const ua = String(req.headers?.['user-agent'] || '');
  const chMobile = String(req.headers?.['sec-ch-ua-mobile'] || '');
  if (chMobile === '?1') return true;
  if (ua && MOBILE_UA_REGEX.test(ua)) return true;
  // client reported info (see client/src/utils/device.js)
  const info = req.body?.clientInfo;
  if (info && typeof info === 'object' && info.isMobile === true) return true;
  return false;
}

function deviceLabel(req) {
  const ua = String(req.headers?.['user-agent'] || 'unknown');
  return ua.length > 200 ? ua.slice(0, 200) : ua;
}

/* -------------------------------------------------------------------------- */
/*  Acquire / validate / release                                               */
/* -------------------------------------------------------------------------- */

/**
 * Atomically try to take the single-session lock for a user.
 * @returns {Promise<{ok:boolean, sid?:string, degraded?:boolean}>}
 */
export async function acquireSession(userId, req) {
  const sid = newSessionId();
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoffIso = new Date(now.getTime() - SESSION_STALE_MS).toISOString();
  const device = deviceLabel(req);

  try {
    if (useSupabase()) {
      if (!supabase) return { ok: true, degraded: true };
      const { data, error } = await supabase
        .from('profiles')
        .update({ active_session_id: sid, session_last_seen: nowIso, session_device: device })
        .eq('id', userId)
        .or(`active_session_id.is.null,session_last_seen.is.null,session_last_seen.lt.${cutoffIso}`)
        .select('id');
      if (error) throw error;
      return { ok: Array.isArray(data) && data.length === 1, sid };
    }

    const result = db.prepare(`
      UPDATE users
      SET active_session_id = ?, session_last_seen = ?, session_device = ?
      WHERE id = ?
        AND (active_session_id IS NULL OR session_last_seen IS NULL OR session_last_seen < ?)
    `).run(sid, nowIso, device, userId, cutoffIso);
    return { ok: result.changes === 1, sid };
  } catch (err) {
    if (isSchemaError(err)) {
      logSchemaProblem(err);
      return { ok: true, degraded: true };
    }
    throw err;
  }
}

/**
 * Validate that `sid` is still THE active session for this user, and touch last_seen.
 * @returns {Promise<boolean>}
 */
export async function validateSession(userId, sid) {
  if (schemaMissingLogged) return true; // migration not applied -> lock temporarily off
  if (!sid) return false;
  try {
    let row;
    if (useSupabase()) {
      if (!supabase) return true;
      const { data, error } = await supabase
        .from('profiles')
        .select('active_session_id, session_last_seen')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      row = data;
    } else {
      row = db.prepare('SELECT active_session_id, session_last_seen FROM users WHERE id = ?').get(userId);
    }

    if (!row || !row.active_session_id) return false;

    // constant-time compare
    const a = Buffer.from(String(row.active_session_id));
    const b = Buffer.from(String(sid));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

    const last = row.session_last_seen ? new Date(row.session_last_seen).getTime() : 0;
    if (Date.now() - last > TOUCH_INTERVAL_MS) {
      const nowIso = new Date().toISOString();
      if (useSupabase()) {
        supabase.from('profiles')
          .update({ session_last_seen: nowIso })
          .eq('id', userId)
          .eq('active_session_id', sid)
          .then(() => {}, () => {});
      } else {
        db.prepare('UPDATE users SET session_last_seen = ? WHERE id = ? AND active_session_id = ?')
          .run(nowIso, userId, sid);
      }
    }
    return true;
  } catch (err) {
    if (isSchemaError(err)) {
      logSchemaProblem(err);
      return true; // fail-open only for a missing migration
    }
    throw err;
  }
}

/** Release lock by session id (used by logout - no auth needed, sid is a secret). */
export async function releaseSessionBySid(sid) {
  if (!sid) return;
  try {
    if (useSupabase()) {
      if (!supabase) return;
      await supabase
        .from('profiles')
        .update({ active_session_id: null, session_last_seen: null, session_device: null })
        .eq('active_session_id', sid);
    } else {
      db.prepare(
        'UPDATE users SET active_session_id = NULL, session_last_seen = NULL, session_device = NULL WHERE active_session_id = ?'
      ).run(sid);
    }
  } catch (err) {
    if (isSchemaError(err)) return logSchemaProblem(err);
    console.error('releaseSessionBySid failed:', err?.message || err);
  }
}

/** Admin: force-release a student's lock by user id. */
export async function forceReleaseSession(userId) {
  if (useSupabase()) {
    if (!supabase) throw new Error('Supabase not configured.');
    const { error } = await supabase
      .from('profiles')
      .update({ active_session_id: null, session_last_seen: null, session_device: null })
      .eq('id', userId);
    if (error) throw error;
    return;
  }
  db.prepare(
    'UPDATE users SET active_session_id = NULL, session_last_seen = NULL, session_device = NULL WHERE id = ?'
  ).run(userId);
}

/* -------------------------------------------------------------------------- */
/*  Login gate used by authController (both backends)                          */
/* -------------------------------------------------------------------------- */

/**
 * Called AFTER password is verified. For STUDENT accounts:
 *   1) blocks mobile / tablet,
 *   2) takes the single-session lock (or rejects with 409).
 * Sends the error response itself and returns null when blocked.
 * Returns { sid } (sid may be null for admins / lock disabled) when allowed.
 */
export async function gateLogin(req, res, user, cookieOptions) {
  if (user.role !== 'STUDENT') return { sid: null };

  if (isMobileRequest(req)) {
    logSecurityEvent({
      userId: user.id,
      eventType: 'LOGIN_FAILED',
      resourceType: 'user',
      resourceId: user.id,
      req,
      status: 'DENIED',
      details: 'Mobile/tablet device blocked (desktop only)'
    });
    res.status(403).json({
      success: false,
      code: 'DESKTOP_ONLY',
      error: 'This portal works only on a laptop or desktop computer. Mobile phones and tablets are not supported.'
    });
    return null;
  }

  if (!isSessionLockEnabled()) return { sid: null };

  const lock = await acquireSession(user.id, req);
  if (!lock.ok) {
    logSecurityEvent({
      userId: user.id,
      eventType: 'LOGIN_FAILED',
      resourceType: 'user',
      resourceId: user.id,
      req,
      status: 'DENIED',
      details: 'Blocked: account already logged in on another device'
    });
    res.status(409).json({
      success: false,
      code: 'SESSION_ACTIVE',
      error: 'This account is already logged in on another device. Please log out there first, or contact PASCONX admin to reset your session.'
    });
    return null;
  }

  if (lock.sid) {
    res.cookie(SESSION_COOKIE, lock.sid, cookieOptions);
  }
  return { sid: lock.sid || null };
}

/** Used by auth middleware for STUDENT requests. Sends 401 and returns false when invalid. */
export async function enforceSessionOnRequest(req, res) {
  if (!isSessionLockEnabled()) return true;
  if (!req.user || req.user.role !== 'STUDENT') return true;

  const sid = getSessionIdFromReq(req);
  const valid = await validateSession(req.user.id, sid);
  if (valid) return true;

  res.status(401).json({
    success: false,
    code: 'SESSION_INVALID',
    error: 'Your session has ended because this account was logged in or reset from another place. Please log in again.'
  });
  return false;
}
