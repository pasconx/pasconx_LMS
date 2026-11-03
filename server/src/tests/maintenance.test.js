import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { seed } from '../seed/seed.js';

process.env.NODE_ENV = 'test';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const STUDENT = { email: 'student@pasconx.com', password: 'Student@12345' };
const ADMIN = { email: 'admin@pasconx.com', password: 'Admin@12345' };

const login = (creds) =>
  request(app).post('/api/auth/login').set('User-Agent', DESKTOP_UA).send(creds);

describe('Platform Maintenance Mode Verification', () => {
  let adminToken;
  let studentToken;

  before(async () => {
    await seed();
    const adminRes = await login(ADMIN);
    assert.equal(adminRes.status, 200, 'Admin login failed during test setup');
    adminToken = adminRes.body.token;

    const studentRes = await login(STUDENT);
    assert.equal(studentRes.status, 200, 'Student login failed during test setup');
    studentToken = studentRes.body.token;
  });

  after(async () => {
    // Ensure maintenance is disabled after tests complete
    if (adminToken) {
      await request(app)
        .post('/api/admin/maintenance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: false });
    }
  });

  test('1. Public endpoint GET /api/system/maintenance returns current status', async () => {
    const res = await request(app).get('/api/system/maintenance');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.maintenance);
    assert.equal(typeof res.body.maintenance.enabled, 'boolean');
  });

  test('2. Non-admin POST /api/admin/maintenance is rejected', async () => {
    // Without auth
    const anonRes = await request(app)
      .post('/api/admin/maintenance')
      .send({ enabled: true });
    assert.equal(anonRes.status, 401);

    // With student auth
    const studentRes = await request(app)
      .post('/api/admin/maintenance')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ enabled: true });
    assert.equal(studentRes.status, 403);
  });

  test('3. Admin can activate Maintenance Mode', async () => {
    const res = await request(app)
      .post('/api/admin/maintenance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enabled: true,
        title: "Platform Maintenance Active",
        message: "We are upgrading system security."
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.maintenance.enabled, true);
    assert.equal(res.body.maintenance.title, "Platform Maintenance Active");

    // Public endpoint confirms status is active
    const pubRes = await request(app).get('/api/system/maintenance');
    assert.equal(pubRes.body.maintenance.enabled, true);
  });

  test('4. While maintenance is active, student login is BLOCKED (503 MAINTENANCE_MODE)', async () => {
    const res = await login(STUDENT);
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'MAINTENANCE_MODE');
    assert.ok(res.body.error);
    assert.equal(res.body.maintenance.enabled, true);
  });

  test('5. While maintenance is active, student API access is BLOCKED (503 MAINTENANCE_MODE)', async () => {
    const res = await request(app)
      .get('/api/student/courses')
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'MAINTENANCE_MODE');
  });

  test('6. While maintenance is active, Admin login and Admin APIs remain accessible', async () => {
    // Admin login still works
    const loginRes = await login(ADMIN);
    assert.equal(loginRes.status, 200);

    // Admin dashboard stats still work
    const statsRes = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(statsRes.status, 200);
    assert.equal(statsRes.body.success, true);
  });

  test('7. Admin can deactivate Maintenance Mode and restore student access', async () => {
    const res = await request(app)
      .post('/api/admin/maintenance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false });

    assert.equal(res.status, 200);
    assert.equal(res.body.maintenance.enabled, false);

    // Public endpoint confirms status is disabled
    const pubRes = await request(app).get('/api/system/maintenance');
    assert.equal(pubRes.body.maintenance.enabled, false);

    // Student login works again
    const sLoginRes = await login(STUDENT);
    assert.equal(sLoginRes.status, 200);

    // Student courses API works again
    const sCoursesRes = await request(app)
      .get('/api/student/courses')
      .set('Authorization', `Bearer ${sLoginRes.body.token}`)
      .set('x-session-id', sLoginRes.body.sessionId || 'none');
    assert.equal(sCoursesRes.status, 200);
  });
});
