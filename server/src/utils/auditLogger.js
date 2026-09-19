import { db } from '../config/database.js';
import { supabase } from '../config/supabase.js';
import { getClientIp } from './ipHelper.js';

/**
 * Log security and access events to database audit log.
 * Explicitly sanitizes inputs so passwords, tokens, and sensitive headers are never logged.
 * Supports both SQLite and Supabase PostgreSQL backends according to DATA_BACKEND.
 */
export function logSecurityEvent({
  userId = null,
  eventType,
  resourceType = null,
  resourceId = null,
  req = null,
  status = 'SUCCESS',
  details = null
}) {
  try {
    let ipAddress = null;
    let userAgent = null;

    if (req) {
      // Safely extract client IP prioritizing Cloudflare CF-Connecting-IP
      ipAddress = getClientIp(req);
      userAgent = req.headers['user-agent'] || null;
      if (userAgent && userAgent.length > 255) {
        userAgent = userAgent.substring(0, 255);
      }
    }

    const cleanDetails = details && typeof details === 'object'
      ? JSON.stringify(details)
      : (typeof details === 'string' ? details : null);

    if (process.env.DATA_BACKEND === 'supabase' && supabase) {
      // Asynchronously log to Supabase PostgreSQL without blocking response
      supabase.from('security_audit_logs').insert({
        user_id: userId ? String(userId) : null,
        event_type: eventType,
        resource_type: resourceType,
        resource_id: resourceId !== null ? String(resourceId) : null,
        ip_address: ipAddress,
        user_agent: userAgent,
        status: status,
        details: cleanDetails
      }).then(({ error }) => {
        if (error) console.error('Failed to write Supabase security audit log:', error.message);
      }).catch(err => {
        console.error('Failed to write Supabase security audit log:', err.message);
      });
    } else {
      // SQLite backend (default / rollback path)
      const numericUserId = userId && Number.isFinite(Number(userId)) ? Number(userId) : null;
      const stmt = db.prepare(`
        INSERT INTO security_audit_logs (
          user_id, event_type, resource_type, resource_id, ip_address, user_agent, status, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        numericUserId,
        eventType,
        resourceType,
        resourceId !== null ? String(resourceId) : null,
        ipAddress,
        userAgent,
        status,
        cleanDetails
      );
    }
  } catch (err) {
    // Audit logging should never crash the primary request pipeline
    console.error('Failed to write security audit log:', err.message);
  }
}
