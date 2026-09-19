import { logger } from '../utils/logger.js';

/**
 * Middleware to protect origin from direct bypass.
 * When deployed behind Cloudflare, Cloudflare attaches 'X-Pasconx-Origin-Secret'
 * via a Transform Rule. Direct requests to the underlying .vercel.app deployment
 * will lack this header and be rejected in production.
 */
export function verifyCloudflareOrigin(req, res, next) {
  // Always allow health checks for deployment verification and uptime probes
  if (req.path === '/api/health' || req.path === '/health') {
    return next();
  }

  const originSecret = process.env.CLOUDFLARE_ORIGIN_SECRET;

  // Only enforce if secret is configured and running in production
  if (process.env.NODE_ENV === 'production' && originSecret) {
    const incomingSecret = req.headers['x-pasconx-origin-secret'];

    if (!incomingSecret || incomingSecret !== originSecret) {
      logger.warn(`OriginShield: Direct origin access blocked from IP ${req.ip || 'unknown'} on ${req.method} ${req.originalUrl}`);
      return res.status(403).json({
        success: false,
        error: 'Direct origin access forbidden. Requests must pass through authorized proxy.'
      });
    }
  }

  next();
}
