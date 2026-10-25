import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';

import app from '../app.js';
import { seed } from '../seed/seed.js';
import { db, initDatabase } from '../config/database.js';
import {
  generateRecurringDates,
  extractISTDateAndTime,
  makeISTIsoString
} from '../controllers/meetingController.js';

describe('Recurring Live Meeting Scheduling Tests', () => {
  let adminToken = '';
  let studentToken = '';
  let nonEnrolledToken = '';
  let courseId = 0;

  before(async () => {
    // Ensure SQLite database is initialized with new recurrence columns
    initDatabase();
    await seed();

    // Dynamically retrieve course IDs from the seeded database
    const course1 = db.prepare("SELECT id FROM courses WHERE title LIKE '%Demo%' LIMIT 1").get();
    courseId = course1.id;

    // Log in admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@pasconx.com', password: 'Admin@12345' });
    assert.equal(adminRes.status, 200, `Admin login failed: ${JSON.stringify(adminRes.body)}`);
    adminToken = adminRes.body.token;

    // Log in student@pasconx.com (enrolled in courseDemo)
    const studentRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@pasconx.com', password: 'Student@12345' });
    assert.equal(studentRes.status, 200, `Student login failed: ${JSON.stringify(studentRes.body)}`);
    studentToken = studentRes.body.token;

    // Log in rahul@example.com (NOT enrolled in courseDemo)
    const rahulRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rahul@example.com', password: 'Rahul@12345' });
    assert.equal(rahulRes.status, 200, `Rahul login failed: ${JSON.stringify(rahulRes.body)}`);
    nonEnrolledToken = rahulRes.body.token;
  });

  // ==========================================
  // Unit Tests: Recurrence Date Calculation & Inclusivity
  // ==========================================
  describe('Recurrence Date Calculation & Inclusivity', () => {
    test('1. One-time meeting returns only the start date', () => {
      const dates = generateRecurringDates('2026-10-26', null, 'none');
      assert.deepEqual(dates, ['2026-10-26']);
    });

    test('2. Weekday recurrence (Mon-Fri) Oct 26 to Nov 27, 2026 returns exactly 25 sessions', () => {
      // Oct 26, 2026 is Monday; Nov 27, 2026 is Friday.
      // 5 weeks: 5 * 5 = 25 weekdays.
      const dates = generateRecurringDates('2026-10-26', '2026-11-27', 'weekdays');
      assert.equal(dates.length, 25);
      assert.equal(dates[0], '2026-10-26'); // Start date inclusive
      assert.equal(dates[dates.length - 1], '2026-11-27'); // End date inclusive

      // Verify no weekends (Saturday or Sunday) are in the array
      for (const d of dates) {
        const [y, m, day] = d.split('-').map(Number);
        const dayOfWeek = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
        assert.ok(dayOfWeek >= 1 && dayOfWeek <= 5, `Expected weekday but got ${dayOfWeek} on ${d}`);
      }
    });

    test('3. Custom days: Monday, Wednesday, Friday selection', () => {
      // Oct 26 (Mon) to Nov 6 (Fri) 2026 = 2 weeks -> Mon, Wed, Fri * 2 = 6 sessions
      const dates = generateRecurringDates('2026-10-26', '2026-11-06', 'custom', [1, 3, 5]);
      assert.equal(dates.length, 6);
      assert.deepEqual(dates, [
        '2026-10-26', // Mon
        '2026-10-28', // Wed
        '2026-10-30', // Fri
        '2026-11-02', // Mon
        '2026-11-04', // Wed
        '2026-11-06'  // Fri
      ]);
    });

    test('4. Correctly calculates weekdays when start date is a Sunday', () => {
      // 2026-10-25 is Sunday. Oct 25 to Oct 30 weekdays should start on Monday Oct 26 and end on Fri Oct 30 (5 days).
      const dates = generateRecurringDates('2026-10-25', '2026-10-30', 'weekdays');
      assert.equal(dates.length, 5);
      assert.equal(dates[0], '2026-10-26'); // Skipped Sunday Oct 25
      assert.equal(dates[4], '2026-10-30');
    });

    test('5. Recurrence end date earlier than start date throws error', () => {
      assert.throws(() => {
        generateRecurringDates('2026-11-10', '2026-10-10', 'daily');
      }, /Recurrence end date cannot be earlier than start date/);
    });

    test('6. Weekly / Custom without selecting any weekday throws error', () => {
      assert.throws(() => {
        generateRecurringDates('2026-10-26', '2026-11-01', 'custom', []);
      }, /At least one weekday must be selected/);
    });

    test('7. Daily recurrence generates every single day inclusively', () => {
      // Oct 26 to Oct 31 = 6 days (Mon, Tue, Wed, Thu, Fri, Sat)
      const dates = generateRecurringDates('2026-10-26', '2026-10-31', 'daily');
      assert.equal(dates.length, 6);
    });

    test('8. IST Time and Date extraction helpers', () => {
      const iso = makeISTIsoString('2026-10-26', '19:00');
      const { dateStr, timeStr } = extractISTDateAndTime(iso);
      assert.equal(dateStr, '2026-10-26');
      assert.equal(timeStr, '19:00');
    });
  });

  // ==========================================
  // API Integration Tests
  // ==========================================
  describe('API Endpoints for Recurring Meetings', () => {
    let seriesGroupId = '';
    let firstMeetingId = 0;
    let middleMeetingId = 0;

    test('9. Admin can schedule a recurring weekday meeting series (Mon-Fri)', async () => {
      const startISO = makeISTIsoString('2026-10-26', '19:00');
      const endISO = makeISTIsoString('2026-10-26', '20:00');

      const res = await request(app)
        .post('/api/admin/meetings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          course_id: courseId,
          title: 'Cybersecurity SOC Analyst – Daily Class',
          description: 'SOC monitoring, SIEM fundamentals, and practical exercises.',
          platform: 'google_meet',
          meeting_url: 'https://meet.google.com/abc-defg-hij',
          instructor_name: 'Academic Team',
          start_time: startISO,
          end_time: endISO,
          recurrence_type: 'weekdays',
          recurrence_end_date: '2026-10-30' // 1 week Mon-Fri: 5 sessions
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.count, 5);
      assert.ok(res.body.recurrence_group_id);
      seriesGroupId = res.body.recurrence_group_id;

      assert.equal(res.body.meetings.length, 5);
      firstMeetingId = res.body.meetings[0].id;
      middleMeetingId = res.body.meetings[2].id;

      // Verify each meeting has correct date and shared metadata
      const dates = res.body.meetings.map(m => m.scheduled_date || extractISTDateAndTime(m.start_time).dateStr);
      assert.deepEqual(dates, [
        '2026-10-26',
        '2026-10-27',
        '2026-10-28',
        '2026-10-29',
        '2026-10-30'
      ]);

      for (const m of res.body.meetings) {
        assert.equal(m.course_id, courseId);
        assert.equal(m.title, 'Cybersecurity SOC Analyst – Daily Class');
        assert.equal(m.platform, 'google_meet');
        assert.equal(m.recurrence_group_id, seriesGroupId);
      }
    });

    test('10. Enrolled student sees all recurring sessions in course', async () => {
      const res = await request(app)
        .get('/api/student/meetings')
        .set('Authorization', `Bearer ${studentToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const studentMeetings = res.body.meetings.filter(m => m.recurrence_group_id === seriesGroupId);
      assert.equal(studentMeetings.length, 5);
    });

    test('11. Non-enrolled student cannot see the recurring meetings', async () => {
      const res = await request(app)
        .get('/api/student/meetings')
        .set('Authorization', `Bearer ${nonEnrolledToken}`);

      assert.equal(res.status, 200);
      const studentMeetings = res.body.meetings.filter(m => m.recurrence_group_id === seriesGroupId);
      assert.equal(studentMeetings.length, 0);
    });

    test('12. Edit single meeting only (scope = single)', async () => {
      const res = await request(app)
        .put(`/api/admin/meetings/${middleMeetingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Cybersecurity SOC Analyst – Special Lab Session',
          apply_scope: 'single'
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.meeting.title, 'Cybersecurity SOC Analyst – Special Lab Session');

      // Verify first meeting title did not change
      const firstRes = await request(app)
        .get(`/api/student/meetings/${firstMeetingId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      assert.equal(firstRes.body.meeting.title, 'Cybersecurity SOC Analyst – Daily Class');
    });

    test('13. Edit this and future meetings (scope = future)', async () => {
      // Shift time from 19:00 to 20:00 for middleMeetingId (Wed) and future meetings (Thu, Fri)
      const newStartISO = makeISTIsoString('2026-10-28', '20:00');
      const newEndISO = makeISTIsoString('2026-10-28', '21:00');

      const res = await request(app)
        .put(`/api/admin/meetings/${middleMeetingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Cybersecurity SOC Analyst – Advanced Evening Class',
          start_time: newStartISO,
          end_time: newEndISO,
          apply_scope: 'future'
        });

      assert.equal(res.status, 200);

      // Verify Meeting 1 (Mon) still has 19:00 IST start time
      const m1 = await request(app)
        .get(`/api/student/meetings/${firstMeetingId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      const m1Time = extractISTDateAndTime(m1.body.meeting.start_time).timeStr;
      assert.equal(m1Time, '19:00');
      assert.equal(m1.body.meeting.title, 'Cybersecurity SOC Analyst – Daily Class');

      // Verify Meeting 3 (Wed) has updated 20:00 start time
      const m3 = await request(app)
        .get(`/api/student/meetings/${middleMeetingId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      const m3Time = extractISTDateAndTime(m3.body.meeting.start_time).timeStr;
      assert.equal(m3Time, '20:00');
      assert.equal(m3.body.meeting.title, 'Cybersecurity SOC Analyst – Advanced Evening Class');
    });

    test('14. Cancel this meeting only (scope = single)', async () => {
      const res = await request(app)
        .patch(`/api/admin/meetings/${firstMeetingId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'cancelled',
          cancellation_reason: 'Instructor on leave',
          apply_scope: 'single'
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.meeting.status, 'cancelled');

      // Verify student sees cancelled on meeting 1 but meeting 3 is still scheduled
      const m1 = await request(app)
        .get(`/api/student/meetings/${firstMeetingId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      assert.equal(m1.body.meeting.status, 'cancelled');

      const m3 = await request(app)
        .get(`/api/student/meetings/${middleMeetingId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      assert.equal(m3.body.meeting.status, 'scheduled');
    });

    test('15. Delete entire series (scope = all)', async () => {
      const res = await request(app)
        .delete(`/api/admin/meetings/${middleMeetingId}?apply_scope=all`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);

      // Verify all meetings in series are gone
      const studentList = await request(app)
        .get('/api/student/meetings')
        .set('Authorization', `Bearer ${studentToken}`);
      const remainingInSeries = studentList.body.meetings.filter(m => m.recurrence_group_id === seriesGroupId);
      assert.equal(remainingInSeries.length, 0);
    });

    test('16. Backward compatibility: One-time meeting scheduling still functions perfectly', async () => {
      const startISO = makeISTIsoString('2026-11-01', '10:00');
      const endISO = makeISTIsoString('2026-11-01', '11:00');

      const res = await request(app)
        .post('/api/admin/meetings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          course_id: courseId,
          title: 'One-time Orientation Session',
          platform: 'zoom',
          meeting_url: 'https://zoom.us/j/987654321',
          start_time: startISO,
          end_time: endISO,
          recurrence_type: 'none'
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.meeting.title, 'One-time Orientation Session');
      assert.equal(res.body.meeting.recurrence_type, 'none');
    });
  });
});
