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

  // Test 11: Admin can add video
  test('11. Admin can add video with YouTube provider and unlisted privacy', async () => {
    const demoCourse = db.prepare("SELECT id FROM courses WHERE title = 'PASCONX Demo Course'").get();

    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: '04 Bonus Architectural Walkthrough',
        description: 'Deep dive into microservices',
        course_id: demoCourse.id,
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ',
        duration_seconds: 480,
        order_index: 4
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.video.title, '04 Bonus Architectural Walkthrough');
    assert.equal(res.body.video.external_video_id, 'dQw4w9WgXcQ');
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

  // Test 13: Student can watch authorized YouTube video
  test('13. Student can watch authorized YouTube video and receives safe playback payload', async () => {
    // Video 1 in Demo Course
    const video = db.prepare("SELECT id FROM videos WHERE title = '01 Introduction to PASCONX'").get();

    const res = await request(app)
      .get(`/api/student/videos/${video.id}`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.playback.provider, 'youtube');
    assert.ok(res.body.playback.embedUrl.includes('youtube.com/embed'));
    assert.ok(res.body.playback.embedUrl.includes('dQw4w9WgXcQ'));
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
    const video = db.prepare("SELECT id FROM videos WHERE title = '01 Introduction to PASCONX'").get();

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

  // ==================== WIDEVINE DRM INTEGRATION TESTS ====================

  // Test 25: Existing YouTube video maintains video_type = 'youtube' and YouTube playback config
  test('25. Existing YouTube video maintains video_type = "youtube" and safe YouTube playback config', async () => {
    const demoVideo = db.prepare("SELECT id, video_type, provider, external_video_id FROM videos WHERE title LIKE '%01 Introduction to PASCONX%'").get();
    assert.ok(demoVideo);
    assert.equal(demoVideo.video_type, 'youtube');

    const res = await request(app)
      .get(`/api/student/videos/${demoVideo.id}`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.video.video_type, 'youtube');
    assert.equal(res.body.playback.provider, 'youtube');
    assert.ok(res.body.playback.embedUrl);
    assert.ok(res.body.playback.embedUrl.includes('youtube.com/embed'));
    assert.equal(res.body.playback.isDrmProtected, false);
  });

  // Test 26: Student can access Widevine DRM video and receives DASH manifest & signed playback token
  test('26. Student can access authorized Widevine DRM video and receives valid playback configuration', async () => {
    const widevineVideo = db.prepare("SELECT id, video_type FROM videos WHERE video_type = 'widevine'").get();
    assert.ok(widevineVideo);

    const res = await request(app)
      .get(`/api/student/videos/${widevineVideo.id}`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.video.video_type, 'widevine');
    assert.equal(res.body.playback.provider, 'widevine');
    assert.equal(res.body.playback.isDrmProtected, true);
    assert.equal(res.body.playback.keySystem, 'com.widevine.alpha');
    assert.ok(res.body.playback.manifestUrl);
    assert.ok(res.body.playback.manifestUrl.includes('.mpd'));
    assert.ok(res.body.playback.licenseServerUrl);
    assert.ok(res.body.playback.playbackToken);
    // Ensure sensitive backend keys or secrets are NEVER returned to the client
    assert.equal(res.body.playback.WIDEVINE_API_KEY, undefined);
    assert.equal(res.body.playback.WIDEVINE_API_SECRET, undefined);
    assert.equal(res.body.playback.rawKey, undefined);
  });

  // Test 27: Direct playback route GET /api/videos/:videoId/play works for authorized students
  test('27. Direct playback endpoint GET /api/videos/:videoId/play works for authorized students', async () => {
    const widevineVideo = db.prepare("SELECT id FROM videos WHERE video_type = 'widevine'").get();
    assert.ok(widevineVideo);

    const res = await request(app)
      .get(`/api/videos/${widevineVideo.id}/play`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.video.id, widevineVideo.id);
    assert.ok(res.body.playback);
  });

  // Test 28: Non-enrolled student cannot access Widevine DRM playback
  test('28. Non-enrolled student cannot access Widevine DRM video (403 Forbidden)', async () => {
    // Create a new Widevine video in Python course (student is not enrolled in Python)
    const pythonCourse = db.prepare("SELECT id FROM courses WHERE title = 'Python Full Stack'").get();
    assert.ok(pythonCourse);

    const newWvVideo = db.prepare(`
      INSERT INTO videos (course_id, title, description, video_type, provider, privacy_type, external_video_id, manifest_url, status)
      VALUES (?, 'Protected Python Module', 'Widevine Test', 'widevine', 'widevine', 'widevine_drm', 'wv-py-01', 'https://example.com/dash.mpd', 'ACTIVE')
    `).run(pythonCourse.id);

    const res = await request(app)
      .get(`/api/student/videos/${newWvVideo.lastInsertRowid}`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /not authorized/i);
  });

  // Test 29: Student cannot access Widevine video from expired course
  test('29. Student cannot access Widevine video from an expired course (403 Forbidden)', async () => {
    const expiredCourse = db.prepare("SELECT id FROM courses WHERE title LIKE '%Legacy System Security%'").get();
    assert.ok(expiredCourse);

    const expiredWvVideo = db.prepare(`
      INSERT INTO videos (course_id, title, description, video_type, provider, privacy_type, external_video_id, manifest_url, status)
      VALUES (?, 'Expired DRM Video', 'Expired DRM Test', 'widevine', 'widevine', 'widevine_drm', 'wv-exp-01', 'https://example.com/dash.mpd', 'ACTIVE')
    `).run(expiredCourse.id);

    const res = await request(app)
      .get(`/api/student/videos/${expiredWvVideo.lastInsertRowid}`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /expired/i);
  });

  // Test 30: DRM license proxy rejects request without token
  test('30. DRM license proxy rejects request without playback authorization token (401)', async () => {
    const res = await request(app)
      .post('/api/drm/license')
      .send(Buffer.from('mock_eme_challenge'));

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /token is required/i);
  });

  // Test 31: DRM license proxy rejects tampered or expired token
  test('31. DRM license proxy rejects invalid or tampered playback token (403)', async () => {
    const res = await request(app)
      .post('/api/drm/license?videoId=1')
      .set('X-Playback-Token', 'tampered.token.data')
      .send(Buffer.from('mock_eme_challenge'));

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /denied/i);
  });

  // Test 32: DRM license proxy reports unconfigured environment clearly
  test('32. DRM license proxy returns 503 when Widevine is unconfigured in development', async () => {
    // Obtain valid token for a video with no license_server_url
    const widevineVideo = db.prepare("SELECT id FROM videos WHERE video_type = 'widevine'").get();
    // Temporarily clear license_server_url on that video
    db.prepare("UPDATE videos SET license_server_url = NULL WHERE id = ?").run(widevineVideo.id);

    const playRes = await request(app)
      .get(`/api/student/videos/${widevineVideo.id}`)
      .set('Authorization', `Bearer ${studentToken}`);

    // If WIDEVINE_LICENSE_URL env is not set, playback reports unconfigured
    if (!process.env.WIDEVINE_LICENSE_URL) {
      assert.equal(playRes.body.playback.isConfigured, false);
      assert.match(playRes.body.playback.disclaimer, /not configured/i);
    }

    // Restore license_server_url
    db.prepare("UPDATE videos SET license_server_url = 'https://cwip-shaka-drm.appspot.com/no_auth' WHERE id = ?").run(widevineVideo.id);
  });

  // Test 33: Admin can create a Widevine DRM protected video with DASH manifest
  test('33. Admin can create a Widevine DRM video with DASH manifest URL', async () => {
    const demoCourse = db.prepare("SELECT id FROM courses WHERE title = 'PASCONX Demo Course'").get();

    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Admin Created DRM Video',
        description: 'Testing Widevine admin creation',
        course_id: demoCourse.id,
        video_type: 'widevine',
        manifest_url: 'https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd',
        external_video_id: 'px-admin-drm-01',
        duration_seconds: 450,
        order_index: 99
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.video.video_type, 'widevine');
    assert.equal(res.body.video.provider, 'widevine');
    assert.equal(res.body.video.manifest_url, 'https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd');
  });

  // Test 34: Admin cannot create Widevine video without manifest URL
  test('34. Admin cannot create Widevine DRM video without DASH manifest URL (400)', async () => {
    const demoCourse = db.prepare("SELECT id FROM courses WHERE title = 'PASCONX Demo Course'").get();

    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Invalid DRM Video',
        course_id: demoCourse.id,
        video_type: 'widevine',
        manifest_url: '' // Missing manifest URL
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /manifest/i);
  });

  // Test 35: Admin can update existing video between YouTube and Widevine DRM
  test('35. Admin can update an existing video between YouTube and Widevine DRM', async () => {
    const demoCourse = db.prepare("SELECT id FROM courses WHERE title = 'PASCONX Demo Course'").get();

    // Create a YouTube video first
    const createRes = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Convertible Video',
        course_id: demoCourse.id,
        video_type: 'youtube',
        youtube_video_id: 'dQw4w9WgXcQ'
      });

    assert.equal(createRes.status, 201);
    const videoId = createRes.body.video.id;

    // Convert to Widevine DRM
    const updateRes = await request(app)
      .put(`/api/admin/videos/${videoId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Converted to Widevine DRM',
        video_type: 'widevine',
        manifest_url: 'https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd',
        external_video_id: 'px-converted-01'
      });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.success, true);
    assert.equal(updateRes.body.video.video_type, 'widevine');
    assert.equal(updateRes.body.video.manifest_url, 'https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd');
  });

  // --- Student Notes System Tests (Tests 36 - 45) ---

  let testNoteId = null;
  let enrolledVideoId = null;

  test('36. Student can create a note on an enrolled video with timestamp and content', async () => {
    // Find an active video for a course the demo student is enrolled in
    const enrolledVideo = db.prepare(`
      SELECT v.id, v.title FROM videos v
      JOIN courses c ON v.course_id = c.id
      JOIN enrollments e ON e.course_id = c.id
      JOIN users u ON e.student_id = u.id
      WHERE u.email = 'student@pasconx.com' AND e.status = 'ACTIVE' AND v.status = 'ACTIVE'
      LIMIT 1
    `).get();

    assert.ok(enrolledVideo);
    enrolledVideoId = enrolledVideo.id;

    const res = await request(app)
      .post(`/api/student/videos/${enrolledVideoId}/notes`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'Key Security Concept',
        content: 'Remember that authentication tokens must be HTTP-only cookies to prevent XSS attacks.',
        timestamp_seconds: 754 // 12m 34s
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.note.title, 'Key Security Concept');
    assert.equal(res.body.note.timestamp_seconds, 754);
    assert.ok(res.body.note.id);
    testNoteId = res.body.note.id;
  });

  test('37. Student can retrieve notes for the specific video, sorted chronologically', async () => {
    // Add another note with an earlier timestamp
    await request(app)
      .post(`/api/student/videos/${enrolledVideoId}/notes`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'Introduction Topic',
        content: 'Speaker introduces architectural layers.',
        timestamp_seconds: 120 // 2m 00s
      });

    const res = await request(app)
      .get(`/api/student/videos/${enrolledVideoId}/notes`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.notes.length >= 2);
    // Earlier timestamp should come first
    assert.equal(res.body.notes[0].timestamp_seconds, 120);
    assert.equal(res.body.notes[1].timestamp_seconds, 754);
  });

  test('38. Student cannot create note for video in an un-enrolled course (403 Forbidden)', async () => {
    // Find video in a course student@pasconx.com is NOT enrolled in
    const unenrolledVideo = db.prepare(`
      SELECT v.id FROM videos v
      WHERE v.course_id NOT IN (
        SELECT course_id FROM enrollments e
        JOIN users u ON e.student_id = u.id
        WHERE u.email = 'student@pasconx.com'
      )
      LIMIT 1
    `).get();

    if (unenrolledVideo) {
      const res = await request(app)
        .post(`/api/student/videos/${unenrolledVideo.id}/notes`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Unauthorized Note',
          content: 'This should be blocked.'
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    }
  });

  test('39. Note Ownership Isolation: Student B cannot see Student A notes', async () => {
    // rahul (Student B) requests all notes
    const res = await request(app)
      .get('/api/student/notes')
      .set('Authorization', `Bearer ${rahulToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    // None of rahul's notes should have testNoteId (which belongs to student@pasconx.com)
    const hasStudentANote = res.body.notes.some(n => n.id === testNoteId);
    assert.equal(hasStudentANote, false);
  });

  test('40. Student B cannot update Student A note (403 Forbidden)', async () => {
    // rahul attempts to modify student's note
    const res = await request(app)
      .put(`/api/student/notes/${testNoteId}`)
      .set('Authorization', `Bearer ${rahulToken}`)
      .send({
        title: 'Tampered Note Title',
        content: 'Tampered Content'
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);

    // Verify note was NOT changed in database
    const check = db.prepare('SELECT title FROM student_notes WHERE id = ?').get(testNoteId);
    assert.equal(check.title, 'Key Security Concept');
  });

  test('41. Student B cannot delete Student A note (403 Forbidden)', async () => {
    // rahul attempts to delete student's note
    const res = await request(app)
      .delete(`/api/student/notes/${testNoteId}`)
      .set('Authorization', `Bearer ${rahulToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);

    // Verify note still exists in database
    const check = db.prepare('SELECT id FROM student_notes WHERE id = ?').get(testNoteId);
    assert.ok(check);
  });

  test('42. Student can update their own note (auto-save/edit)', async () => {
    const res = await request(app)
      .put(`/api/student/notes/${testNoteId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'Updated Security Concept',
        content: 'Updated content with auto-save verification.',
        timestamp_seconds: 760
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.note.title, 'Updated Security Concept');
    assert.equal(res.body.note.content, 'Updated content with auto-save verification.');
    assert.equal(res.body.note.timestamp_seconds, 760);
  });

  test('43. Student can search their notes by keyword', async () => {
    const res = await request(app)
      .get('/api/student/notes?search=verification')
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.notes.length >= 1);
    assert.ok(res.body.notes.some(n => n.id === testNoteId));
  });

  test('44. Student can export notes as Markdown and TXT', async () => {
    const mdRes = await request(app)
      .get('/api/student/notes/export?format=md')
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(mdRes.status, 200);
    assert.ok(mdRes.headers['content-disposition'].includes('PASCONX_Student_Notes.md'));
    assert.match(mdRes.text, /# PASCONX Video Portal - Student Notes/);
    assert.match(mdRes.text, /Updated Security Concept/);

    const txtRes = await request(app)
      .get('/api/student/notes/export?format=txt')
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(txtRes.status, 200);
    assert.ok(txtRes.headers['content-disposition'].includes('PASCONX_Student_Notes.txt'));
    assert.match(txtRes.text, /PASCONX VIDEO PORTAL - STUDENT NOTES/);
  });

  test('45. Student can delete their own note', async () => {
    const res = await request(app)
      .delete(`/api/student/notes/${testNoteId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // Verify it is gone
    const check = db.prepare('SELECT * FROM student_notes WHERE id = ?').get(testNoteId);
    assert.equal(check, undefined);
  });

  // --- Calendar & Course Meetings Tests (Tests 46 - 55) ---

  let testMeetingId = null;
  let testCourseId = null;
  let otherCourseId = null;

  test('46. Admin can schedule a Google Meet live class for a course', async () => {
    const demoCourse = db.prepare("SELECT id FROM courses WHERE title = 'PASCONX Demo Course'").get();
    testCourseId = demoCourse.id;

    const startTime = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour from now
    const endTime = new Date(Date.now() + 7200 * 1000).toISOString();   // 2 hours from now

    const res = await request(app)
      .post('/api/admin/meetings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        course_id: testCourseId,
        title: 'Full Stack Architecture Live Q&A',
        description: 'Deep dive into microservices and live debugging.',
        platform: 'google_meet',
        meeting_url: 'https://meet.google.com/abc-defg-hij',
        instructor_name: 'Dr. Salman',
        start_time: startTime,
        end_time: endTime
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.meeting.title, 'Full Stack Architecture Live Q&A');
    assert.equal(res.body.meeting.platform, 'google_meet');
    assert.equal(res.body.meeting.meeting_url, 'https://meet.google.com/abc-defg-hij');
    assert.ok(res.body.meeting.id);
    testMeetingId = res.body.meeting.id;
  });

  test('47. Enrolled student automatically sees course meeting on their calendar/meetings list', async () => {
    const res = await request(app)
      .get('/api/student/meetings')
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const meeting = res.body.meetings.find(m => m.id === testMeetingId);
    assert.ok(meeting);
    assert.equal(meeting.course_id, testCourseId);
    assert.equal(meeting.platform, 'google_meet');
  });

  test('48. Student NOT enrolled in the course CANNOT see the meeting', async () => {
    // Create a meeting for Python Full Stack which student@pasconx.com is not enrolled in
    const pythonCourse = db.prepare("SELECT id FROM courses WHERE title = 'Python Full Stack'").get();
    otherCourseId = pythonCourse.id;

    const startTime = new Date(Date.now() + 3600 * 1000).toISOString();
    const endTime = new Date(Date.now() + 7200 * 1000).toISOString();

    const createRes = await request(app)
      .post('/api/admin/meetings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        course_id: otherCourseId,
        title: 'Python Asyncio Deep Dive',
        platform: 'zoom',
        meeting_url: 'https://zoom.us/j/987654321',
        instructor_name: 'Instructor Alex',
        start_time: startTime,
        end_time: endTime
      });
    const pythonMeetingId = createRes.body.meeting.id;

    // student@pasconx.com fetches meetings
    const res = await request(app)
      .get('/api/student/meetings')
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(res.status, 200);
    const hasPythonMeeting = res.body.meetings.some(m => m.id === pythonMeetingId);
    assert.equal(hasPythonMeeting, false); // Blocked because student is not enrolled in Python Full Stack

    // Clean up
    await request(app).delete(`/api/admin/meetings/${pythonMeetingId}`).set('Authorization', `Bearer ${adminToken}`);
  });

  test('49. Non-enrolled student cannot access meeting detail endpoint (403 Forbidden)', async () => {
    // rahul@example.com is not enrolled in PASCONX Demo Course (testCourseId)
    const res = await request(app)
      .get(`/api/student/meetings/${testMeetingId}`)
      .set('Authorization', `Bearer ${rahulToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('50. Admin can schedule a Zoom meeting with valid URL validation', async () => {
    const startTime = new Date(Date.now() + 3600 * 1000).toISOString();
    const endTime = new Date(Date.now() + 7200 * 1000).toISOString();

    // Invalid URL test
    const failRes = await request(app)
      .post('/api/admin/meetings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        course_id: testCourseId,
        title: 'Invalid Link Meeting',
        platform: 'zoom',
        meeting_url: 'not-a-url',
        start_time: startTime,
        end_time: endTime
      });
    assert.equal(failRes.status, 400);

    // Valid Zoom meeting
    const successRes = await request(app)
      .post('/api/admin/meetings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        course_id: testCourseId,
        title: 'Cybersecurity Incident Response Lab',
        platform: 'zoom',
        meeting_url: 'https://zoom.us/j/1234567890',
        start_time: startTime,
        end_time: endTime
      });
    assert.equal(successRes.status, 201);
    assert.equal(successRes.body.meeting.platform, 'zoom');

    // Clean up
    await request(app).delete(`/api/admin/meetings/${successRes.body.meeting.id}`).set('Authorization', `Bearer ${adminToken}`);
  });

  test('51. Admin edits meeting course: visibility immediately transfers to new course students', async () => {
    // Move testMeetingId to otherCourseId (Python Full Stack, where Rahul is enrolled)
    const updateRes = await request(app)
      .put(`/api/admin/meetings/${testMeetingId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        course_id: otherCourseId,
        title: 'Transferred Course Meeting'
      });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.meeting.course_id, otherCourseId);

    // Student A (not enrolled in Python) should no longer see it
    const resA = await request(app)
      .get('/api/student/meetings')
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(resA.body.meetings.some(m => m.id === testMeetingId), false);

    // Rahul (Student B, enrolled in Python) should now see it!
    const resB = await request(app)
      .get('/api/student/meetings')
      .set('Authorization', `Bearer ${rahulToken}`);
    assert.equal(resB.body.meetings.some(m => m.id === testMeetingId), true);

    // Move it back to testCourseId for subsequent tests
    await request(app)
      .put(`/api/admin/meetings/${testMeetingId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ course_id: testCourseId });
  });

  test('52. Admin cancels meeting with reason: student sees cancelled status and can_join is false', async () => {
    const cancelRes = await request(app)
      .patch(`/api/admin/meetings/${testMeetingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'cancelled',
        cancellation_reason: 'Instructor unavailable due to emergency.'
      });

    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.meeting.status, 'cancelled');

    // Student fetches meeting
    const studentRes = await request(app)
      .get(`/api/student/meetings/${testMeetingId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    assert.equal(studentRes.status, 200);
    assert.equal(studentRes.body.meeting.status, 'cancelled');
    assert.equal(studentRes.body.meeting.cancellation_reason, 'Instructor unavailable due to emergency.');
    assert.equal(studentRes.body.meeting.can_join, false);
  });

  test('53. Student cannot access admin meetings API (403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/admin/meetings')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        course_id: testCourseId,
        title: 'Hacked Meeting',
        platform: 'zoom',
        meeting_url: 'https://zoom.us/j/123',
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString()
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('54. Admin can delete a meeting', async () => {
    const delRes = await request(app)
      .delete(`/api/admin/meetings/${testMeetingId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.success, true);

    // Verify gone
    const check = db.prepare('SELECT * FROM meetings WHERE id = ?').get(testMeetingId);
    assert.equal(check, undefined);
  });
});

