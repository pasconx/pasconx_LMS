import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../app.js';
import { db } from '../config/database.js';
import { supabase } from '../config/supabase.js';
import { seed } from '../seed/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment credentials from gitignored .env.test
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

// Safe credential access via environment variables (never printed in test outputs)
const adminEmail = process.env.TEST_ADMIN_EMAIL || 'admin@pasconx.com';
const adminInitialPassword = process.env.TEST_ADMIN_PASSWORD || 'Salman@rk80!';

const studentEmail = process.env.TEST_STUDENT_EMAIL || 'student@pasconx.com';
const studentInitialPassword = process.env.TEST_STUDENT_PASSWORD || 'Student@12345';

const studentBEmail = process.env.TEST_STUDENT_B_EMAIL || 'rahul@example.com';
const studentBPassword = process.env.TEST_STUDENT_B_PASSWORD || 'Rahul@12345';

// Dynamic test passwords (derived without logging or hardcoding)
const adminNewPassword = `${adminInitialPassword}_N3w`;
const studentNewPassword = `${studentInitialPassword}_N3w`;

describe('PASCONX Self-Service Change Password Test Suite', () => {
  let adminToken = '';
  let studentToken = '';
  let studentBToken = '';
  let studentId = null;
  let studentBId = null;

  async function acquireUserSession(email, initialPassword, alternatePassword) {
    let res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: initialPassword });

    if (res.status === 401 && alternatePassword) {
      // If password was previously changed, log in with alternate password and restore initial password
      const altRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: alternatePassword });

      if (altRes.status === 200 && altRes.body.token) {
        await request(app)
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${altRes.body.token}`)
          .send({
            currentPassword: alternatePassword,
            newPassword: initialPassword,
            confirmPassword: initialPassword
          });
        // Re-login with initial password
        res = await request(app)
          .post('/api/auth/login')
          .send({ email, password: initialPassword });
      }
    }
    return res;
  }

  before(async () => {
    // Seed fresh database state
    await seed();

    // Acquire tokens for test users with idempotency reset
    const adminLoginRes = await acquireUserSession(adminEmail, adminInitialPassword, adminNewPassword);
    assert.equal(adminLoginRes.status, 200);
    adminToken = adminLoginRes.body.token;

    const studentLoginRes = await acquireUserSession(studentEmail, studentInitialPassword, studentNewPassword);
    assert.equal(studentLoginRes.status, 200);
    studentToken = studentLoginRes.body.token;
    studentId = studentLoginRes.body.user.id;

    const studentBLoginRes = await acquireUserSession(studentBEmail, studentBPassword, `${studentBPassword}_N3w`);
    assert.equal(studentBLoginRes.status, 200);
    studentBToken = studentBLoginRes.body.token;
    studentBId = studentBLoginRes.body.user.id;
  });


  // 1. Validation Tests
  describe('Input Validation & Error Handling', () => {
    test('rejects request with missing fields (HTTP 400)', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ currentPassword: adminInitialPassword });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /required/i);
    });

    test('rejects request when new password is shorter than 6 characters (HTTP 400)', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          currentPassword: studentInitialPassword,
          newPassword: '123',
          confirmPassword: '123'
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /at least 6 characters/i);
    });

    test('rejects request when new password and confirm password do not match (HTTP 400)', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          currentPassword: studentInitialPassword,
          newPassword: studentNewPassword,
          confirmPassword: `${studentNewPassword}_mismatch`
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /do not match/i);
    });

    test('rejects request when new password is identical to current password (HTTP 400)', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          currentPassword: studentInitialPassword,
          newPassword: studentInitialPassword,
          confirmPassword: studentInitialPassword
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /must be different/i);
    });

    test('rejects request with incorrect current password (HTTP 400)', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          currentPassword: 'TotallyIncorrectPassword123!',
          newPassword: studentNewPassword,
          confirmPassword: studentNewPassword
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'Current password is incorrect.');
    });
  });

  // 2. Security & Authority Enforcement Tests
  describe('Authority & Access Control Enforcement', () => {
    test('unauthenticated request returns HTTP 401', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: studentInitialPassword,
          newPassword: studentNewPassword,
          confirmPassword: studentNewPassword
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    test('disabled user cannot perform password change (HTTP 403 or 401)', async () => {
      // Find disabled user in database
      const disabledUser = db.prepare("SELECT id, email FROM users WHERE status = 'DISABLED'").get();
      assert.ok(disabledUser);

      // Create token for disabled user
      const disabledToken = (await import('jsonwebtoken')).default.sign(
        { id: disabledUser.id, role: 'STUDENT' },
        process.env.SESSION_SECRET || 'pasconix_default_jwt_secret_dev'
      );

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${disabledToken}`)
        .send({
          currentPassword: 'AnyPassword123',
          newPassword: studentNewPassword,
          confirmPassword: studentNewPassword
        });

      assert.ok(res.status === 403 || res.status === 401);
      assert.equal(res.body.success, false);
    });

    test('ignores arbitrary userId in body: Student A cannot change Student B password', async () => {
      // Student A sends request attempting to pass Student B ID
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          userId: studentBId,
          studentId: studentBId,
          currentPassword: studentBPassword, // using Student B password will fail against Student A session
          newPassword: studentNewPassword,
          confirmPassword: studentNewPassword
        });

      // Because the authority is req.user (Student A), verifying Student B's password fails
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Current password is incorrect.');
    });

    test('ignores arbitrary studentId in body: Admin cannot change another student password through this endpoint', async () => {
      // Admin sends request attempting to pass studentId
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          studentId: studentId,
          userId: studentId,
          currentPassword: studentInitialPassword, // using student password against admin session
          newPassword: adminNewPassword,
          confirmPassword: adminNewPassword
        });

      // The authority is strictly the Admin session, so student's password is rejected
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Current password is incorrect.');
    });
  });

  // 3. Student Self-Service Flow & Session Handling
  describe('Student Self-Service Password Change Flow', () => {
    test('student successfully changes their own password', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          currentPassword: studentInitialPassword,
          newPassword: studentNewPassword,
          confirmPassword: studentNewPassword
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, 'Password changed successfully.');
      assert.ok(res.body.token);
    });

    test('old student password no longer authenticates (HTTP 401)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: studentEmail,
          password: studentInitialPassword
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'Invalid email or password.');
    });

    test('new student password successfully authenticates (HTTP 200)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: studentEmail,
          password: studentNewPassword
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.email, studentEmail);
      assert.equal(res.body.user.role, 'STUDENT');
      assert.ok(res.body.token);

      // Update studentToken for any subsequent requests
      studentToken = res.body.token;
    });

    test('student role remains unchanged after password update', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${studentToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.user.role, 'STUDENT');
      assert.equal(res.body.user.id, studentId);
    });
  });

  // 4. Admin Self-Service Flow & Session Handling
  describe('Admin Self-Service Password Change Flow', () => {
    test('admin successfully changes their own password', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          currentPassword: adminInitialPassword,
          newPassword: adminNewPassword,
          confirmPassword: adminNewPassword
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, 'Password changed successfully.');
      assert.ok(res.body.token);
    });

    test('old admin password no longer authenticates (HTTP 401)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: adminEmail,
          password: adminInitialPassword
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'Invalid email or password.');
    });

    test('new admin password successfully authenticates (HTTP 200)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: adminEmail,
          password: adminNewPassword
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.email, adminEmail);
      assert.equal(res.body.user.role, 'ADMIN');
      assert.ok(res.body.token);

      // Update adminToken
      adminToken = res.body.token;
    });

    test('admin role remains unchanged after password update', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.user.role, 'ADMIN');
    });
  });

  // 5. Audit Logging Verification
  describe('Security Audit Logging', () => {
    test('audit log records USER_CHANGED_OWN_PASSWORD event without exposing passwords', async () => {
      let auditLog = null;
      if (process.env.DATA_BACKEND === 'supabase' && supabase) {
        await new Promise(r => setTimeout(r, 600));
        const { data } = await supabase
          .from('security_audit_logs')
          .select('*')
          .eq('event_type', 'USER_CHANGED_OWN_PASSWORD')
          .order('created_at', { ascending: false })
          .limit(1);
        auditLog = data?.[0];
      } else {
        auditLog = db.prepare(`
          SELECT * FROM security_audit_logs 
          WHERE event_type = 'USER_CHANGED_OWN_PASSWORD' 
          ORDER BY id DESC LIMIT 1
        `).get();
      }

      assert.ok(auditLog, 'Audit log entry should exist');
      assert.equal(auditLog.event_type, 'USER_CHANGED_OWN_PASSWORD');
      assert.equal(auditLog.status, 'SUCCESS');

      // Verify passwords and hashes are strictly absent
      const logString = JSON.stringify(auditLog);
      assert.ok(!logString.includes(adminNewPassword));
      assert.ok(!logString.includes(studentNewPassword));
      assert.ok(!logString.includes('password_hash'));
    });

    test('audit log records USER_PASSWORD_CHANGE_FAILED on incorrect current password', async () => {
      let failedLog = null;
      if (process.env.DATA_BACKEND === 'supabase' && supabase) {
        await new Promise(r => setTimeout(r, 600));
        const { data } = await supabase
          .from('security_audit_logs')
          .select('*')
          .eq('event_type', 'USER_PASSWORD_CHANGE_FAILED')
          .order('created_at', { ascending: false })
          .limit(1);
        failedLog = data?.[0];
      } else {
        failedLog = db.prepare(`
          SELECT * FROM security_audit_logs 
          WHERE event_type = 'USER_PASSWORD_CHANGE_FAILED' 
          ORDER BY id DESC LIMIT 1
        `).get();
      }

      assert.ok(failedLog, 'Failed audit log entry should exist');
      assert.equal(failedLog.event_type, 'USER_PASSWORD_CHANGE_FAILED');
      assert.equal(failedLog.status, 'DENIED');
    });
  });

  after(async () => {
    // Restore demo credentials so manual browser testing remains seamless
    if (adminToken) {
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          currentPassword: adminNewPassword,
          newPassword: adminInitialPassword,
          confirmPassword: adminInitialPassword
        });
    }
    if (studentToken) {
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          currentPassword: studentNewPassword,
          newPassword: studentInitialPassword,
          confirmPassword: studentInitialPassword
        });
    }
  });

});

