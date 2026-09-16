import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { seed } from '../seed/seed.js';
import { db } from '../config/database.js';

process.env.NODE_ENV = 'test';

describe('PASCONX Video Portal - Automated Integration Tests', () => {
  let adminToken = '';
  let studentToken = '';
  let rahulToken = '';

  before(async () => {
    await seed();

    // Log in admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@pasconx.com', password: 'Admin@12345' });
    adminToken = adminRes.body.token;

    // Log in student
    const studentRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@pasconx.com', password: 'Student@12345' });
    studentToken = studentRes.body.token;

    // Log in rahul
    const rahulRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rahul@example.com', password: 'Rahul@12345' });
    rahulToken = rahulRes.body.token;
  });

  // Test 1: Student login
  test('1. Student login succeeds with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@pasconx.com', password: 'Student@12345' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.email, 'student@pasconx.com');
    assert.equal(res.body.user.role, 'STUDENT');
    assert.ok(res.body.token);
  });

  // Test 2: Invalid login
  test('2. Invalid login fails with 401 and user-friendly error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@pasconx.com', password: 'WrongPassword123' });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error, 'Invalid email or password.');
  });

  // Test 3: Disabled student
  test('3. Disabled student login is rejected with 403', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'disabled@pasconx.com', password: 'Disabled@12345' });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /disabled/i);
  });

  // Test 4: Student sees only assigned courses
  test('4. Student sees only assigned courses on dashboard', async () => {
    const res = await request(app)
      .get('/api/student/courses')
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    // Student should have access to Demo Course, Cybersecurity, and Expired Course (3 enrollments)
    // But should NOT see 'Python Full Stack' which is only assigned to Rahul
    const titles = res.body.courses.map(c => c.title);
    assert.ok(titles.includes('PASCONX Demo Course'));
    assert.ok(titles.includes('Cybersecurity Fundamentals'));
    assert.ok(!titles.includes('Python Full Stack'));
  });

  // Test 5: Student cannot access another student's course
  test("5. Student cannot access another student's course (403)", async () => {
    // Python Full Stack is course ID 3 (enrolled only for Rahul)
    const pythonCourse = db.prepare("SELECT id FROM courses WHERE title = 'Python Full Stack'").get();
    assert.ok(pythonCourse);

    const res = await request(app)
      .get(`/api/student/courses/${pythonCourse.id}`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /do not have access/i);
  });

  // Test 6: Student cannot access expired course
  test('6. Student cannot access expired course (403 with expiry message)', async () => {
    const expiredCourse = db.prepare("SELECT id FROM courses WHERE title LIKE '%Legacy System Security%'").get();
    assert.ok(expiredCourse);

    const res = await request(app)
      .get(`/api/student/courses/${expiredCourse.id}`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /access to this course has expired/i);
  });

  // Test 7: Student cannot access course before start date
  test('7. Student cannot access course before start date (403)', async () => {
    // Create a future course and enrollment for student
    const futureCourseResult = db.prepare(`
      INSERT INTO courses (title, description, status) VALUES ('Future AI Course', 'Starts in 2030', 'ACTIVE')
    `).run();
    const futureCourseId = futureCourseResult.lastInsertRowid;

    const studentUser = db.prepare("SELECT id FROM users WHERE email = 'student@pasconx.com'").get();
    db.prepare(`
      INSERT INTO enrollments (student_id, course_id, access_start, access_expiry, status)
      VALUES (?, ?, '2030-01-01T00:00:00.000Z', '2030-12-31T23:59:59.000Z', 'ACTIVE')
    `).run(studentUser.id, futureCourseId);

    const res = await request(app)
      .get(`/api/student/courses/${futureCourseId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /has not started yet/i);
  });

  // Test 8: Student cannot access admin API
  test('8. Student cannot access admin API (403 Forbidden)', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /administrator privileges required/i);
  });

  // Test 9: Admin can create student
  test('9. Admin can create new student', async () => {
    const res = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'New Test Student',
        email: 'newstudent@test.com',
        password: 'Password@123'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.student.email, 'newstudent@test.com');
  });

  // Test 10: Admin can create course
  test('10. Admin can create course', async () => {
    const res = await request(app)
      .post('/api/admin/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'DevSecOps Masterclass',
        description: 'Automated CI/CD security pipelines'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.course.title, 'DevSecOps Masterclass');
  });

  // Test 11: Admin can add video with Google Drive provider
  test('11. Admin can add video with Google Drive provider and full URL auto-extraction', async () => {
    const demoCourse = db.prepare("SELECT id FROM courses WHERE title = 'PASCONX Demo Course'").get();

    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: '04 Bonus Architectural Walkthrough',
        description: 'Deep dive into microservices',
        course_id: demoCourse.id,
        provider: 'google_drive',
        drive_file_id: 'https://drive.google.com/file/d/1fkJOdRIonDNO4YYDSno_0hwcBvlcMbMy/view?usp=drive_link',
        duration_seconds: 480,
        order_index: 4
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.video.title, '04 Bonus Architectural Walkthrough');
    assert.equal(res.body.video.external_video_id, '1fkJOdRIonDNO4YYDSno_0hwcBvlcMbMy');
  });

  // Test 11b: Admin can add video with VdoCipher 32-char hex ID
  test('11b. Admin can add video with VdoCipher provider and 32-char hex ID', async () => {
    const demoCourse = db.prepare("SELECT id FROM courses WHERE title = 'PASCONX Demo Course'").get();

    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'VdoCipher DRM Lecture',
        description: 'Multi-DRM protected lecture',
        course_id: demoCourse.id,
        provider: 'vdocipher',
        external_video_id: '44dea8bbc5324ee896da129c132e3a5c',
        duration_seconds: 300,
        order_index: 5
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.video.title, 'VdoCipher DRM Lecture');
    assert.equal(res.body.video.provider, 'vdocipher');
    assert.equal(res.body.video.external_video_id, '44dea8bbc5324ee896da129c132e3a5c');
  });

  // Test 12: Admin can enroll student
  test('12. Admin can enroll student into a course with access dates', async () => {
    const student = db.prepare("SELECT id FROM users WHERE email = 'newstudent@test.com'").get();
    const demoCourse = db.prepare("SELECT id FROM courses WHERE title = 'PASCONX Demo Course'").get();

    const res = await request(app)
      .post('/api/admin/enrollments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        student_id: student.id,
        course_id: demoCourse.id,
        access_start: '2026-01-01T00:00:00.000Z',
        access_expiry: '2026-12-31T23:59:59.000Z',
        status: 'ACTIVE'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.enrollment.student_id, student.id);
  });

  // Test 13: Student can watch authorized Google Drive video
  test('13. Student can watch authorized Google Drive video and receives safe preview embed payload', async () => {
    // Video 1 in Demo Course
    const video = db.prepare("SELECT id FROM videos WHERE title LIKE '%01 Introduction to PASCONX%'").get();
    assert.ok(video, 'Demo course video 1 should exist');

    const res = await request(app)
      .get(`/api/student/videos/${video.id}`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.playback.provider, 'google_drive');
    assert.equal(res.body.playback.fileId, '1fkJOdRIonDNO4YYDSno_0hwcBvlcMbMy');
    assert.equal(res.body.playback.embedUrl, 'https://drive.google.com/file/d/1fkJOdRIonDNO4YYDSno_0hwcBvlcMbMy/preview');
  });

  // Test 14: Student cannot watch unauthorized video
  test('14. Student cannot watch unauthorized video (403 Forbidden)', async () => {
    // Rahul is enrolled in Python Full Stack, but Student is NOT
    const pythonCourse = db.prepare("SELECT id FROM courses WHERE title = 'Python Full Stack'").get();
    // Add a video to Python Full Stack
    const videoResult = db.prepare(`
      INSERT INTO videos (course_id, title, external_video_id, status)
      VALUES (?, 'Python Advanced Concurrency', 'dQw4w9WgXcQ', 'ACTIVE')
    `).run(pythonCourse.id);

    const pythonVideoId = videoResult.lastInsertRowid;

    // Student tries to access this video directly
    const res = await request(app)
      .get(`/api/student/videos/${pythonVideoId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /not authorized to watch this video/i);
  });

  // Test 16: Video playback payload contains STEALTH_CONTENT_MODE metadata and dynamic watermark profile
  test('16. Video playback payload contains STEALTH_CONTENT_MODE metadata and dynamic watermark profile', async () => {
    const video = db.prepare("SELECT id FROM videos WHERE title LIKE '%01 Introduction to PASCONX%'").get();

    const res = await request(app)
      .get(`/api/student/videos/${video.id}`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.playbackToken);
    assert.equal(res.body.stealthMode.enabled, true);
    assert.equal(res.body.stealthMode.protectionLevel, 'STEALTH_CONTENT_MODE');
    assert.equal(res.body.stealthMode.allowDownload, false);
    assert.equal(res.body.watermarkProfile.studentName, 'PASCONX Student');
    assert.equal(res.body.watermarkProfile.institute, 'PASCONX ACADEMY');
    assert.ok(res.body.watermarkProfile.maskedEmail.includes('***'));
    assert.ok(res.body.watermarkProfile.studentId.startsWith('PX2026-'));
  });

  // Test 17: Security audit logs record LOGIN_SUCCESS and VIDEO_PLAYBACK events
  test('17. Security audit logs record LOGIN_SUCCESS and VIDEO_PLAYBACK events', async () => {
    const loginLog = db.prepare("SELECT * FROM security_audit_logs WHERE event_type = 'LOGIN_SUCCESS'").all();
    assert.ok(loginLog.length > 0);

    const videoLog = db.prepare("SELECT * FROM security_audit_logs WHERE event_type = 'VIDEO_PLAYBACK'").all();
    assert.ok(videoLog.length > 0);
    assert.equal(videoLog[0].status, 'SUCCESS');
    assert.equal(videoLog[0].resource_type, 'video');
  });

  // Test 18: Unauthorized video access logs UNAUTHORIZED_ATTEMPT with status DENIED
  test('18. Unauthorized video access logs UNAUTHORIZED_ATTEMPT with status DENIED', async () => {
    const deniedLog = db.prepare("SELECT * FROM security_audit_logs WHERE event_type = 'UNAUTHORIZED_ATTEMPT' AND status = 'DENIED'").all();
    assert.ok(deniedLog.length > 0);
  });

  // Test 19: Authorized student can access course documents with signed tokens
  test('19. Authorized student can retrieve course documents with signed view tokens', async () => {
    const demoCourse = db.prepare("SELECT id FROM courses WHERE title = 'PASCONX Demo Course'").get();

    const res = await request(app)
      .get(`/api/student/courses/${demoCourse.id}/documents`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.documents));
    assert.ok(res.body.documents.length > 0);
    assert.ok(res.body.documents[0].viewToken);
  });

  // Test 20: Student cannot access documents from an unassigned course (403)
  test('20. Student cannot access documents from an unassigned course (403)', async () => {
    const pythonCourse = db.prepare("SELECT id FROM courses WHERE title = 'Python Full Stack'").get();

    const res = await request(app)
      .get(`/api/student/courses/${pythonCourse.id}/documents`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  // Test 21: Document streaming returns anti-caching and student watermark headers
  test('21. Document streaming returns anti-caching and student watermark headers', async () => {
    const demoCourse = db.prepare("SELECT id FROM courses WHERE title = 'PASCONX Demo Course'").get();
    const doc = db.prepare("SELECT id FROM course_documents WHERE course_id = ?").get(demoCourse.id);
    assert.ok(doc);

    const res = await request(app)
      .get(`/api/student/courses/${demoCourse.id}/documents/${doc.id}/view`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.headers['x-student-watermark']);
    assert.ok(res.headers['x-student-watermark'].includes('PASCONX ACADEMY'));
    assert.ok(res.headers['cache-control'].includes('no-store'));
  });

  // Test 22: Document streaming with invalid/tampered token fails (403)
  test('22. Document streaming with invalid/tampered token fails with 403', async () => {
    const demoCourse = db.prepare("SELECT id FROM courses WHERE title = 'PASCONX Demo Course'").get();
    const doc = db.prepare("SELECT id FROM course_documents WHERE course_id = ?").get(demoCourse.id);

    const res = await request(app)
      .get(`/api/student/courses/${demoCourse.id}/documents/${doc.id}/view?token=tampered_invalid_token.signature`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /token/i);
  });

  // Test 23: Admin can view security audit logs via /api/admin/audit-logs
  test('23. Admin can view security audit logs via /api/admin/audit-logs', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.logs));
    assert.ok(res.body.logs.length > 0);
  });

  // Test 24: Logout invalidates session
  test('24. Logout clears cookie and invalidates session', async () => {
    const logoutRes = await request(app)
      .post('/api/auth/logout');

    assert.equal(logoutRes.status, 200);
    assert.equal(logoutRes.body.success, true);

    // Any request with no token / cleared cookie fails authentication
    const authRes = await request(app)
      .get('/api/auth/me');

    assert.equal(authRes.status, 401);
    assert.equal(authRes.body.success, false);
  });
});
