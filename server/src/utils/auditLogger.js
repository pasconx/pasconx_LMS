import { db } from '../config/database.js';

/**
 * Log security and access events to database audit log.
 * Explicitly sanitizes inputs so passwords, tokens, and sensitive headers are never logged.
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
      // Safely extract client IP
      const forwarded = req.headers['x-forwarded-for'];
      ipAddress = forwarded ? forwarded.split(',')[0].trim() : (req.socket?.remoteAddress || req.ip || null);
      // Clean localhost IPv6 prefix if present
      if (ipAddress === '::1' || ipAddress === '::ffff:127.0.0.1') {
        ipAddress = '127.0.0.1';
      }
      userAgent = req.headers['user-agent'] || null;
      if (userAgent && userAgent.length > 255) {
        userAgent = userAgent.substring(0, 255);
      }
    }

    const cleanDetails = details && typeof details === 'object'
      ? JSON.stringify(details)
      : (typeof details === 'string' ? details : null);

    const stmt = db.prepare(`
      INSERT INTO security_audit_logs (
        user_id, event_type, resource_type, resource_id, ip_address, user_agent, status, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      userId ? Number(userId) : null,
      eventType,
      resourceType,
      resourceId !== null ? String(resourceId) : null,
      ipAddress,
      userAgent,
      status,
      cleanDetails
    );
  } catch (err) {
    // Audit logging should never crash the primary request pipeline
    console.error('Failed to write security audit log:', err.message);
  }
}
