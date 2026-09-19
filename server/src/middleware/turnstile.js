import { getClientIp } from '../utils/ipHelper.js';
import { logSecurityEvent } from '../utils/auditLogger.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to verify Cloudflare Turnstile CAPTCHA response token.
 * Provides frictionless bot & brute-force protection.
 * Automatically skips verification in automated tests or when secret key is unset.
 */
export async function verifyTurnstile(req, res, next) {
  const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

  // Gracefully skip in automated tests or when Turnstile is not enabled
  if (process.env.NODE_ENV === 'test' || !secretKey) {
    return next();
  }

  const token = req.body?.turnstileToken || req.headers?.['cf-turnstile-response'];

  if (!token || typeof token !== 'string') {
    logSecurityEvent({
      eventType: 'BOT_CHALLENGE_FAILED',
      resourceType: 'auth',
      req,
      status: 'DENIED',
      details: 'Missing Turnstile challenge token'
    });
    return res.status(400).json({
      success: false,
      error: 'Security challenge token is required.'
    });
  }

  try {
    const clientIp = getClientIp(req);
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token.trim());
    if (clientIp) {
      formData.append('remoteip', clientIp);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const result = await response.json();

    if (!result.success) {
      logger.warn(`Turnstile verification failed for IP ${clientIp}: ${JSON.stringify(result['error-codes'] || [])}`);
      logSecurityEvent({
        eventType: 'BOT_CHALLENGE_FAILED',
        resourceType: 'auth',
        req,
        status: 'DENIED',
        details: { errorCodes: result['error-codes'] }
      });
      return res.status(400).json({
        success: false,
        error: 'Security verification failed. Please try again.'
      });
    }

    // Verification succeeded
    next();
  } catch (error) {
    logger.error('Error verifying Turnstile token:', error.message);
    // In case of network timeout to Cloudflare API, decide fail-open vs fail-closed.
    // For resilience against Cloudflare outages, we can log error and allow or challenge.
    logSecurityEvent({
      eventType: 'BOT_CHALLENGE_ERROR',
      resourceType: 'auth',
      req,
      status: 'ERROR',
      details: error.message
    });
    return res.status(500).json({
      success: false,
      error: 'Security verification service temporarily unavailable.'
    });
  }
}
