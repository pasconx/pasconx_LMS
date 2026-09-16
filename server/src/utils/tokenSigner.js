import crypto from 'crypto';

const SIGNING_SECRET = process.env.SESSION_SECRET || 'pasconix_default_signing_secret_dev';

/**
 * Generate an HMAC-SHA256 signed short-lived access token.
 * Token expires in `expiresInSeconds` (default: 15 minutes / 900 seconds).
 */
export function generateSignedToken({ userId, resourceType, resourceId, expiresInSeconds = 900 }) {
  const expiresAt = Date.now() + (expiresInSeconds * 1000);
  const payload = JSON.stringify({
    uid: userId,
    rt: resourceType,
    rid: resourceId,
    exp: expiresAt,
    rnd: crypto.randomBytes(6).toString('hex')
  });

  const payloadB64 = Buffer.from(payload).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Verify HMAC-SHA256 signed token and validate bounds.
 */
export function verifySignedToken(token, expected = {}) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Missing access token' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed access token' };
  }

  const [payloadB64, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(payloadB64)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: 'Invalid token signature' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (e) {
    return { valid: false, error: 'Invalid token payload' };
  }

  if (Date.now() > payload.exp) {
    return { valid: false, error: 'Media access token has expired' };
  }

  if (expected.expectedUserId !== undefined && payload.uid !== expected.expectedUserId) {
    return { valid: false, error: 'Token user mismatch' };
  }

  if (expected.expectedResourceType && payload.rt !== expected.expectedResourceType) {
    return { valid: false, error: 'Token resource type mismatch' };
  }

  if (expected.expectedResourceId !== undefined && String(payload.rid) !== String(expected.expectedResourceId)) {
    return { valid: false, error: 'Token resource ID mismatch' };
  }

  return { valid: true, payload };
}
