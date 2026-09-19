import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { getClientIp } from '../utils/ipHelper.js';
import { verifyCloudflareOrigin } from '../middleware/originShield.js';
import { verifyTurnstile } from '../middleware/turnstile.js';

describe('Cloudflare Security & Bot Protection Suite', () => {

  describe('1. Client IP Resolution (CF-Connecting-IP Priority)', () => {
    test('prioritizes CF-Connecting-IP over X-Forwarded-For and req.ip', () => {
      const mockReq = {
        headers: {
          'cf-connecting-ip': '203.0.113.195',
          'x-forwarded-for': '198.51.100.22, 10.0.0.1'
        },
        ip: '10.0.0.1'
      };

      assert.equal(getClientIp(mockReq), '203.0.113.195');
    });

    test('falls back to first X-Forwarded-For IP when CF-Connecting-IP is absent', () => {
      const mockReq = {
        headers: {
          'x-forwarded-for': '198.51.100.45, 10.2.0.1'
        },
        ip: '10.2.0.1'
      };

      assert.equal(getClientIp(mockReq), '198.51.100.45');
    });

    test('normalizes IPv6 localhost to 127.0.0.1', () => {
      const mockReq1 = { headers: { 'cf-connecting-ip': '::1' } };
      const mockReq2 = { headers: { 'cf-connecting-ip': '::ffff:127.0.0.1' } };
      const mockReq3 = { headers: {}, ip: '::1' };

      assert.equal(getClientIp(mockReq1), '127.0.0.1');
      assert.equal(getClientIp(mockReq2), '127.0.0.1');
      assert.equal(getClientIp(mockReq3), '127.0.0.1');
    });
  });

  describe('2. Direct Origin Bypass Protection (OriginShield)', () => {
    test('always allows /api/health regardless of secret', (t, done) => {
      const mockReq = { path: '/api/health', headers: {} };
      const mockRes = {
        status: (code) => {
          assert.fail(`Health check should not receive status ${code}`);
        }
      };

      verifyCloudflareOrigin(mockReq, mockRes, () => {
        assert.ok(true);
        done();
      });
    });

    test('blocks requests when secret is configured and missing in production', (t, done) => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.CLOUDFLARE_ORIGIN_SECRET;

      process.env.NODE_ENV = 'production';
      process.env.CLOUDFLARE_ORIGIN_SECRET = 'super-secret-token-12345';

      let blockedStatus = null;
      let blockedBody = null;

      const mockReq = {
        path: '/api/student/courses',
        method: 'GET',
        originalUrl: '/api/student/courses',
        headers: {}
      };
      const mockRes = {
        status: (code) => {
          blockedStatus = code;
          return {
            json: (data) => {
              blockedBody = data;
              assert.equal(blockedStatus, 403);
              assert.match(blockedBody.error, /Direct origin access forbidden/i);
              // restore
              process.env.NODE_ENV = originalEnv;
              process.env.CLOUDFLARE_ORIGIN_SECRET = originalSecret;
              done();
            }
          };
        }
      };

      verifyCloudflareOrigin(mockReq, mockRes, () => {
        process.env.NODE_ENV = originalEnv;
        process.env.CLOUDFLARE_ORIGIN_SECRET = originalSecret;
        assert.fail('Should not proceed to next() without secret');
      });
    });

    test('allows requests when secret matches in production', (t, done) => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.CLOUDFLARE_ORIGIN_SECRET;

      process.env.NODE_ENV = 'production';
      process.env.CLOUDFLARE_ORIGIN_SECRET = 'super-secret-token-12345';

      const mockReq = {
        path: '/api/student/courses',
        headers: { 'x-pasconx-origin-secret': 'super-secret-token-12345' }
      };
      const mockRes = {};

      verifyCloudflareOrigin(mockReq, mockRes, () => {
        assert.ok(true);
        process.env.NODE_ENV = originalEnv;
        process.env.CLOUDFLARE_ORIGIN_SECRET = originalSecret;
        done();
      });
    });
  });

  describe('3. Cloudflare Turnstile Verification Middleware', () => {
    test('skips verification in test mode or when secret key is unset', async () => {
      const mockReq = { body: {}, headers: {} };
      let calledNext = false;
      const mockNext = () => { calledNext = true; };

      await verifyTurnstile(mockReq, {}, mockNext);
      assert.equal(calledNext, true);
    });

    test('requires token when secret is configured in non-test mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

      process.env.NODE_ENV = 'production';
      process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = '0x4AAAAAAtestkey';

      let statusCode = null;
      let responseBody = null;

      const mockReq = { body: {}, headers: {} };
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return {
            json: (body) => { responseBody = body; }
          };
        }
      };

      await verifyTurnstile(mockReq, mockRes, () => {});

      process.env.NODE_ENV = originalEnv;
      process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = originalKey;

      assert.equal(statusCode, 400);
      assert.match(responseBody.error, /Security challenge token is required/i);
    });
  });

  describe('4. API Edge Response Headers & Tracing', () => {
    test('/api/health sets anti-caching headers and reflects CF-Ray', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('CF-Ray', '8a123bc45de67890-BOM');

      assert.equal(res.status, 200);
      assert.equal(res.headers['cache-control'], 'private, no-cache, no-store, must-revalidate');
      assert.equal(res.headers['cf-ray'], '8a123bc45de67890-BOM');
      assert.equal(res.body.status, 'healthy');
    });
  });

  describe('5. DRM License Binary Stream Preservation', () => {
    test('POST /api/drm/license correctly receives raw binary stream without corruption', async () => {
      const fakeBinaryPayload = Buffer.from([0x08, 0x01, 0x12, 0x10, 0xAA, 0xBB, 0xCC, 0xDD]);

      const res = await request(app)
        .post('/api/drm/license')
        .set('Content-Type', 'application/octet-stream')
        .send(fakeBinaryPayload);

      // Without DRM token in header/body, it should reject cleanly with 401 Unauthorized, NOT a 500 JSON parse error
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Playback authorization token/i);
    });
  });

});
