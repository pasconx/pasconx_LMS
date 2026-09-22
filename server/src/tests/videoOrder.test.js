import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

import app from '../app.js';
import { db } from '../config/database.js';
import { supabase } from '../config/supabase.js';

process.env.NODE_ENV = 'test';

describe('PASCONX Manual Video Order with Duplicate Prevention Test Suite', () => {
  let adminToken = '';
  let testCourseAId = null;
  let testCourseBId = null;
  let testCourseCId = null;
  let testCourseDId = null;

  async function getAdminToken() {
    for (const password of ['Salman@rk80!', 'Admin@12345']) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@pasconx.com', password });
      if (res.status === 200 && res.body.token) {
        return res.body.token;
      }
    }
    throw new Error('Failed to log in as admin');
  }

  before(async () => {
    adminToken = await getAdminToken();

    // Create isolated test courses
    const resA = await request(app)
      .post('/api/admin/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Manual Order Course A - ${Date.now()}`,
        description: 'Test course for manual video ordering',
        category: 'Testing',
        level: 'BEGINNER',
        status: 'PUBLISHED'
      });
    testCourseAId = resA.body.course?.id || resA.body.id;

    const resB = await request(app)
      .post('/api/admin/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Manual Order Course B - ${Date.now()}`,
        description: 'Test course for independent course scoping',
        category: 'Testing',
        level: 'BEGINNER',
        status: 'PUBLISHED'
      });
    testCourseBId = resB.body.course?.id || resB.body.id;

    const resC = await request(app)
      .post('/api/admin/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Manual Order Course C - ${Date.now()}`,
        description: 'Test course for edit & reorder operations',
        category: 'Testing',
        level: 'BEGINNER',
        status: 'PUBLISHED'
      });
    testCourseCId = resC.body.course?.id || resC.body.id;

    const resD = await request(app)
      .post('/api/admin/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Manual Order Course D - ${Date.now()}`,
        description: 'Test course for concurrency collision testing',
        category: 'Testing',
        level: 'BEGINNER',
        status: 'PUBLISHED'
      });
    testCourseDId = resD.body.course?.id || resD.body.id;
  });

  after(async () => {
    // Clean up created test courses and videos
    for (const cId of [testCourseAId, testCourseBId, testCourseCId, testCourseDId]) {
      if (cId) {
        try {
          if (supabase) {
            await supabase.from('videos').delete().eq('course_id', cId);
            await supabase.from('courses').delete().eq('id', cId);
          } else {
            db.prepare('DELETE FROM videos WHERE course_id = ?').run(cId);
            db.prepare('DELETE FROM courses WHERE id = ?').run(cId);
          }
        } catch (e) {
          // ignore cleanup errors
        }
      }
    }
  });

  // Test 1: Course with no videos -> manually enter #1 -> SUCCESS (201)
  test('1. Course with no videos -> manually enter order #1 -> SUCCESS (201)', async () => {
    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Video 1',
        course_id: testCourseAId,
        order_index: 1,
        video_type: 'youtube',
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ',
        duration_seconds: 120
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.video.order_index, 1);
  });

  // Test 2: Course with #1 -> manually enter #1 -> HTTP 409 Conflict
  test('2. Course with #1 -> manually enter duplicate order #1 -> HTTP 409 Conflict', async () => {
    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Duplicate Video 1',
        course_id: testCourseAId,
        order_index: 1,
        video_type: 'youtube',
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ',
        duration_seconds: 120
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.match(res.body.error || res.body.message, /Order #1 already exists for this course/);
  });

  // Test 3: Course with #1 -> manually enter #2 -> SUCCESS (201)
  test('3. Course with #1 -> manually enter order #2 -> SUCCESS (201)', async () => {
    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Video 2',
        course_id: testCourseAId,
        order_index: 2,
        video_type: 'youtube',
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ',
        duration_seconds: 180
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.video.order_index, 2);
  });

  // Test 4: Course with #1, #2, #3 -> manually enter #2 -> HTTP 409 Conflict
  test('4. Course with #1, #2, #3 -> manually enter duplicate order #2 -> HTTP 409 Conflict', async () => {
    // First add video 3
    const res3 = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Video 3',
        course_id: testCourseAId,
        order_index: 3,
        video_type: 'youtube',
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ',
        duration_seconds: 200
      });
    assert.equal(res3.status, 201);

    // Now try to add another video with order 2
    const resDup = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Duplicate Video 2',
        course_id: testCourseAId,
        order_index: 2,
        video_type: 'youtube',
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ',
        duration_seconds: 150
      });

    assert.equal(resDup.status, 409);
    assert.equal(resDup.body.success, false);
    assert.match(resDup.body.error || resDup.body.message, /Order #2 already exists for this course/);
  });

  // Test 5: Course with #1, #2, #3 -> manually enter #4 -> SUCCESS (201)
  test('5. Course with #1, #2, #3 -> manually enter order #4 -> SUCCESS (201)', async () => {
    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Video 4',
        course_id: testCourseAId,
        order_index: 4,
        video_type: 'youtube',
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ',
        duration_seconds: 240
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.video.order_index, 4);
  });

  // Test 6: Course A has #1, Course B has #1 -> Both allowed (per-course scoping)
  test('6. Course A has #1 and Course B has #1 -> Both allowed (per-course scoped)', async () => {
    const resB = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Course B Video 1',
        course_id: testCourseBId,
        order_index: 1,
        video_type: 'youtube',
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ',
        duration_seconds: 100
      });

    assert.equal(resB.status, 201);
    assert.equal(resB.body.success, true);
    assert.equal(resB.body.video.order_index, 1);
  });

  // Test 7: Edit video and keep its existing order -> SUCCESS (200)
  test('7. Edit video and retain its own current order -> SUCCESS (200)', async () => {
    // Add video in Course C with order 1
    const resC1 = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Course C Video 1',
        course_id: testCourseCId,
        order_index: 1,
        video_type: 'youtube',
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ',
        duration_seconds: 100
      });
    assert.equal(resC1.status, 201);
    const videoId = resC1.body.video.id;

    // Edit title, retaining order 1
    const editRes = await request(app)
      .put(`/api/admin/videos/${videoId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Course C Video 1 (Updated)',
        order_index: 1
      });

    assert.equal(editRes.status, 200);
    assert.equal(editRes.body.success, true);
    assert.equal(editRes.body.video.order_index, 1);
    assert.equal(editRes.body.video.title, 'Course C Video 1 (Updated)');
  });

  // Test 8: Edit video and change to another video's order in same course -> HTTP 409 Conflict
  test('8. Edit video and change to another existing video order -> HTTP 409 Conflict', async () => {
    // Add second video in Course C with order 2
    const resC2 = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Course C Video 2',
        course_id: testCourseCId,
        order_index: 2,
        video_type: 'youtube',
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ',
        duration_seconds: 100
      });
    assert.equal(resC2.status, 201);
    const video2Id = resC2.body.video.id;

    // Try to update Video 2's order to 1 (which belongs to Video 1)
    const editRes = await request(app)
      .put(`/api/admin/videos/${video2Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        order_index: 1
      });

    assert.equal(editRes.status, 409);
    assert.equal(editRes.body.success, false);
    assert.match(editRes.body.error || editRes.body.message, /Order #1 already exists for this course/);
  });

  // Test 9: Edit video and change to unused order -> SUCCESS (200)
  test('9. Edit video and change to unused order -> SUCCESS (200)', async () => {
    // Find Video 2 in Course C
    let video2Id = null;
    if (supabase) {
      const { data } = await supabase
        .from('videos')
        .select('id')
        .eq('course_id', testCourseCId)
        .eq('order_index', 2)
        .single();
      video2Id = data?.id;
    } else {
      const row = db.prepare('SELECT id FROM videos WHERE course_id = ? AND order_index = 2').get(testCourseCId);
      video2Id = row?.id;
    }
    assert.ok(video2Id);

    // Update Video 2's order to 5
    const editRes = await request(app)
      .put(`/api/admin/videos/${video2Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        order_index: 5
      });

    assert.equal(editRes.status, 200);
    assert.equal(editRes.body.success, true);
    assert.equal(editRes.body.video.order_index, 5);
  });

  // Test 10: Two simultaneous requests for the same course and same order -> exactly one succeeds, one gets 409
  test('10. Concurrent requests for same course & order -> one 201, one 409 Conflict', async () => {
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/admin/videos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Concurrent Video A',
          course_id: testCourseDId,
          order_index: 10,
          video_type: 'youtube',
          provider: 'youtube',
          privacy_type: 'youtube_unlisted',
          youtube_video_id: 'dQw4w9WgXcQ'
        }),
      request(app)
        .post('/api/admin/videos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Concurrent Video B',
          course_id: testCourseDId,
          order_index: 10,
          video_type: 'youtube',
          provider: 'youtube',
          privacy_type: 'youtube_unlisted',
          youtube_video_id: 'dQw4w9WgXcQ'
        })
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [201, 409], 'Exactly one request succeeds (201) and one conflicts (409)');

    const conflictRes = res1.status === 409 ? res1 : res2;
    assert.match(conflictRes.body.error || conflictRes.body.message, /Order #10 already exists for this course/);
  });

  // Test 11: Zero order (0) -> reject (400)
  test('11. Zero order index (0) -> HTTP 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Zero Order Video',
        course_id: testCourseAId,
        order_index: 0,
        video_type: 'youtube',
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ'
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /positive integer/);
  });

  // Test 12: Negative number (-1) -> reject (400)
  test('12. Negative order index (-1) -> HTTP 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Negative Order Video',
        course_id: testCourseAId,
        order_index: -1,
        video_type: 'youtube',
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ'
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /positive integer/);
  });

  // Test 13: Decimal number (2.5) -> reject (400)
  test('13. Decimal order index (2.5) -> HTTP 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Decimal Order Video',
        course_id: testCourseAId,
        order_index: 2.5,
        video_type: 'youtube',
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ'
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /positive integer/);
  });

  // Test 14: Empty order ("") -> reject (400)
  test('14. Empty order index ("") -> HTTP 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Empty Order Video',
        course_id: testCourseAId,
        order_index: '',
        video_type: 'youtube',
        provider: 'youtube',
        privacy_type: 'youtube_unlisted',
        youtube_video_id: 'dQw4w9WgXcQ'
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  // Test 15: Existing video playback remains unchanged
  test('15. Video retrieval and playback configuration remains completely intact', async () => {
    const listRes = await request(app)
      .get(`/api/admin/videos?courseId=${testCourseAId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.videos));
    assert.ok(listRes.body.videos.length > 0);
    const video = listRes.body.videos[0];
    assert.ok(video.id);
    assert.ok(video.order_index >= 1);
    assert.equal(video.external_video_id, 'dQw4w9WgXcQ');
    assert.equal(video.video_type, 'youtube');
  });
});
