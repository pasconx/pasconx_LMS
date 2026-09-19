/**
 * Utility to extract the authentic client IP address.
 * Prioritizes Cloudflare's authoritative 'CF-Connecting-IP' header,
 * then falls back to 'X-Forwarded-For', then socket remote address / req.ip.
 */
export function getClientIp(req) {
  if (!req) return '127.0.0.1';

  // Cloudflare sets CF-Connecting-IP at the edge and strips any client-supplied value
  const cfConnectingIp = req.headers?.['cf-connecting-ip'];
  if (cfConnectingIp && typeof cfConnectingIp === 'string') {
    let cleanIp = cfConnectingIp.trim();
    if (cleanIp === '::1' || cleanIp === '::ffff:127.0.0.1') return '127.0.0.1';
    return cleanIp;
  }

  // Fallback to X-Forwarded-For (first hop is the original client)
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    let cleanIp = forwarded.split(',')[0].trim();
    if (cleanIp === '::1' || cleanIp === '::ffff:127.0.0.1') return '127.0.0.1';
    return cleanIp;
  }

  // Fallback to Express req.ip or socket remote address
  let rawIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  if (rawIp === '::1' || rawIp === '::ffff:127.0.0.1') {
    return '127.0.0.1';
  }

  return rawIp;
}
