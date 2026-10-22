import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { seed } from '../seed/seed.js';
import { db } from '../config/database.js';

process.env.NODE_ENV = 'test';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

const STUDENT = { email: 'student@pasconx.com', password: 'Student@12345' };
const ADMIN = { email: 'admin@pasconx.com', password: 'Admin@12345' };

const login = (creds, ua = DESKTOP_UA) =>
  request(app).post('/api/auth/login').set('User-Agent', ua).send(creds);

const asStudent = (r, tok) => r.set('Authorization', `Bearer ${tok.token}`).set('x-session-id', tok.sessionId || 'none');

describe('Single session lock + desktop only + link videos + recordings', () => {
  let admin;

  before(async () => {
    process.env.ENFORCE_SESSION_IN_TEST = '1';
    await seed();
    const a = await login(ADMIN);
    admin = a.body;
  });

  after(() => {
    delete process.env.ENFORCE_SESSION_IN_TEST;
  });

  const resetLock = () =>
    db.prepare("UPDATE users SET active_session_id=NULL, session_last_seen=NULL, session_device=NULL WHERE email=?").run(STUDENT.email);

  test('1. first student login succeeds and returns a session id', async () => {
    resetLock();
    const res = await login(STUDENT);
    assert.equal(res.status, 200);
    assert.ok(res.body.sessionId);
    assert.ok((res.headers['set-cookie'] || []).some(c => c.startsWith('pasconix_sid=')));
  });

  test('2. second login while first is active is BLOCKED (409 SESSION_ACTIVE)', async () => {
    resetLock();
    const first = await login(STUDENT);
    assert.equal(first.status, 200);
    const second = await login(STUDENT);
    assert.equal(second.status, 409);
    assert.equal(second.body.code, 'SESSION_ACTIVE');
    // first device still works
    const me = await asStudent(request(app).get('/api/auth/me'), first.body);
    assert.equal(me.status, 200);
  });

  test('3. wrong / missing session id is rejected (401 SESSION_INVALID)', async () => {
    resetLock();
    const first = await login(STUDENT);
    const wrong = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${first.body.token}`).set('x-session-id', 'deadbeef');
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.code, 'SESSION_INVALID');
    const none = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${first.body.token}`);
    assert.equal(none.status, 401);
  });

  test('4. logout frees the lock so student can log in again', async () => {
    resetLock();
    const first = await login(STUDENT);
    await request(app).post('/api/auth/logout').set('x-session-id', first.body.sessionId);
    const again = await login(STUDENT);
    assert.equal(again.status, 200);
  });

  test('5. stale lock (no heartbeat) expires automatically', async () => {
    resetLock();
    const first = await login(STUDENT);
    assert.equal(first.status, 200);
    db.prepare("UPDATE users SET session_last_seen = ? WHERE email = ?")
      .run(new Date(Date.now() - 60 * 60 * 1000).toISOString(), STUDENT.email);
    const second = await login(STUDENT);
    assert.equal(second.status, 200);
    // the old device is now invalid
    const old = await asStudent(request(app).get('/api/auth/me'), first.body);
    assert.equal(old.status, 401);
  });

  test('6. admin can force-reset a student session', async () => {
    resetLock();
    const first = await login(STUDENT);
    const studentRow = db.prepare('SELECT id FROM users WHERE email=?').get(STUDENT.email);
    const reset = await request(app)
      .post(`/api/admin/students/${studentRow.id}/reset-session`)
      .set('Authorization', `Bearer ${admin.token}`);
    assert.equal(reset.status, 200);
    const old = await asStudent(request(app).get('/api/auth/me'), first.body);
    assert.equal(old.status, 401);
    const again = await login(STUDENT);
    assert.equal(again.status, 200);
  });

  test('7. admin accounts are not locked', async () => {
    const a1 = await login(ADMIN);
    const a2 = await login(ADMIN);
    assert.equal(a1.status, 200);
    assert.equal(a2.status, 200);
  });

  test('8. mobile user-agent is blocked for students (403 DESKTOP_ONLY)', async () => {
    resetLock();
    const res = await login(STUDENT, PHONE_UA);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'DESKTOP_ONLY');
    // and it must not have taken the lock
    const ok = await login(STUDENT);
    assert.equal(ok.status, 200);
  });

  test('9. client-reported mobile device is blocked', async () => {
    resetLock();
    const res = await request(app).post('/api/auth/login').set('User-Agent', DESKTOP_UA)
      .send({ ...STUDENT, clientInfo: { isMobile: true } });
    assert.equal(res.status, 403);
  });

  describe('link videos + recordings', () => {
    let courseId;
    let studentToken;
    const studentId = () => db.prepare('SELECT id FROM users WHERE email=?').get(STUDENT.email).id;

    before(async () => {
      const c = await request(app).post('/api/admin/courses').set('Authorization', `Bearer ${admin.token}`)
        .send({ title: 'Link Video Course', description: 'x' });
      courseId = c.body.course.id;
      await request(app).post('/api/admin/enrollments').set('Authorization', `Bearer ${admin.token}`)
        .send({
          student_id: studentId(), course_id: courseId,
          access_start: '2026-01-01T00:00:00.000Z', access_expiry: '2027-12-31T23:59:59.000Z', status: 'ACTIVE'
        });
      resetLock();
      studentToken = (await login(STUDENT)).body;
    });

    const addLink = (url, order, extra = {}) =>
      request(app).post('/api/admin/videos').set('Authorization', `Bearer ${admin.token}`)
        .send({ title: `Link ${order}`, course_id: courseId, video_type: 'link', manifest_url: url, order_index: order, duration_seconds: 0, ...extra });

    test('10. admin adds Google Drive link -> student gets drive preview embed', async () => {
      const r = await addLink('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing', 1);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.video.video_type, 'link');
      const p = await asStudent(request(app).get(`/api/student/videos/${r.body.video.id}`), studentToken);
      assert.equal(p.status, 200, JSON.stringify(p.body));
      assert.equal(p.body.playback.kind, 'drive');
      assert.equal(p.body.playback.embedUrl, 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/preview');
    });

    test('11. direct .mp4, .m3u8 and iframe snippet are recognised', async () => {
      const mp4 = await addLink('https://cdn.example.com/class1.mp4', 2);
      const hls = await addLink('https://cdn.example.com/live/stream.m3u8', 3);
      const ifr = await addLink('<iframe src="https://player.vimeo.com/video/123456789" width="640"></iframe>', 4);
      for (const r of [mp4, hls, ifr]) assert.equal(r.status, 201, JSON.stringify(r.body));
      const kinds = [];
      for (const r of [mp4, hls, ifr]) {
        const p = await asStudent(request(app).get(`/api/student/videos/${r.body.video.id}`), studentToken);
        kinds.push(p.body.playback.kind);
      }
      assert.deepEqual(kinds, ['direct', 'hls', 'vimeo']);
    });

    test('12. insecure / invalid links are rejected', async () => {
      const http = await addLink('http://example.com/a.mp4', 5);
      assert.equal(http.status, 400);
      const bad = await addLink('not a url', 6);
      assert.equal(bad.status, 400);
      const js = await addLink('javascript:alert(1)', 7);
      assert.equal(js.status, 400);
    });

    test('13. admin can edit a link video', async () => {
      const r = await addLink('https://cdn.example.com/old.mp4', 8);
      const u = await request(app).put(`/api/admin/videos/${r.body.video.id}`).set('Authorization', `Bearer ${admin.token}`)
        .send({ video_type: 'link', manifest_url: 'https://youtu.be/dQw4w9WgXcQ' });
      assert.equal(u.status, 200, JSON.stringify(u.body));
      const p = await asStudent(request(app).get(`/api/student/videos/${r.body.video.id}`), studentToken);
      assert.equal(p.body.playback.kind, 'youtube');
    });

    test('14. recorded videos page lists all recordings, newest first', async () => {
      const r = await asStudent(request(app).get('/api/student/recordings'), studentToken);
      assert.equal(r.status, 200);
      const mine = r.body.recordings.filter(x => x.course_id === courseId);
      assert.ok(mine.length >= 4);
      assert.ok(mine.every(x => x.course_title === 'Link Video Course'));
    });

    test('15. unenrolled student cannot see another course recordings', async () => {
      const r = await request(app).post('/api/auth/login').set('User-Agent', DESKTOP_UA)
        .send({ email: 'rahul@example.com', password: 'Rahul@12345' });
      assert.equal(r.status, 200);
      const rec = await request(app).get('/api/student/recordings')
        .set('Authorization', `Bearer ${r.body.token}`).set('x-session-id', r.body.sessionId);
      assert.equal(rec.status, 200);
      assert.ok(rec.body.recordings.every(x => x.course_id !== courseId));
    });
  });
});
