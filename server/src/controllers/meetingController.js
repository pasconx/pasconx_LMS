import { db } from '../config/database.js';
import { logSecurityEvent } from '../utils/auditLogger.js';

const JOIN_WINDOW_MINUTES = 15;

/**
 * Calculates meeting live/upcoming/completed status and join eligibility based on time.
 */
function enrichMeetingStatus(meeting) {
  const now = new Date();
  const start = new Date(meeting.start_time);
  const end = new Date(meeting.end_time);

  let runtimeStatus = meeting.status; // 'scheduled' | 'cancelled' | 'completed'

  if (meeting.status === 'scheduled') {
    if (now > end) {
      runtimeStatus = 'completed';
    } else if (now >= start && now <= end) {
      runtimeStatus = 'live';
    } else {
      runtimeStatus = 'upcoming';
    }
  }

  // Join window: starts JOIN_WINDOW_MINUTES before start_time and ends at end_time
  const joinWindowOpenTime = new Date(start.getTime() - JOIN_WINDOW_MINUTES * 60 * 1000);
  const isWithinJoinWindow = now >= joinWindowOpenTime && now <= end;
  const canJoin = (runtimeStatus === 'live' || runtimeStatus === 'upcoming') && isWithinJoinWindow;

  return {
    ...meeting,
    runtime_status: runtimeStatus,
    can_join: canJoin,
    join_window_minutes: JOIN_WINDOW_MINUTES,
    is_live: runtimeStatus === 'live',
    is_upcoming: runtimeStatus === 'upcoming',
    is_completed: runtimeStatus === 'completed',
    is_cancelled: runtimeStatus === 'cancelled'
  };
}

/**
 * GET /api/student/meetings
 * Returns meetings for courses the student is actively and currently enrolled in.
 * Supports filters: from, to, limit.
 */
export function getStudentMeetings(req, res) {
  const studentId = req.user.id;
  const { from, to, limit } = req.query;

  let query = `
    SELECT 
      m.*,
      c.title AS course_title,
      c.thumbnail_url AS course_thumbnail,
      e.access_start,
      e.access_expiry
    FROM meetings m
    JOIN courses c ON m.course_id = c.id
    JOIN enrollments e ON e.course_id = c.id AND e.student_id = ?
    JOIN users u ON u.id = ?
    WHERE e.status = 'ACTIVE' 
      AND c.status = 'ACTIVE' 
      AND u.status = 'ACTIVE'
      AND datetime('now') BETWEEN e.access_start AND e.access_expiry
  `;

  const params = [studentId, studentId];

  if (from) {
    query += ` AND m.end_time >= ?`;
    params.push(from);
  }

  if (to) {
    query += ` AND m.start_time <= ?`;
    params.push(to);
  }

  query += ` ORDER BY m.start_time ASC`;

  if (limit && !isNaN(Number(limit))) {
    query += ` LIMIT ?`;
    params.push(Math.max(1, Number(limit)));
  }

  const rows = db.prepare(query).all(...params);
  const meetings = rows.map(enrichMeetingStatus);

  res.json({
    success: true,
    count: meetings.length,
    meetings
  });
}

/**
 * GET /api/student/meetings/:id
 * Returns meeting details if student has active course access.
 */
export function getStudentMeetingDetail(req, res) {
  const studentId = req.user.id;
  const meetingId = Number(req.params.id);

  if (!meetingId || isNaN(meetingId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid meeting ID provided.'
    });
  }

  const meeting = db.prepare(`
    SELECT 
      m.*,
      c.title AS course_title,
      c.thumbnail_url AS course_thumbnail,
      e.access_start,
      e.access_expiry
    FROM meetings m
    JOIN courses c ON m.course_id = c.id
    JOIN enrollments e ON e.course_id = c.id AND e.student_id = ?
    JOIN users u ON u.id = ?
    WHERE m.id = ?
      AND e.status = 'ACTIVE' 
      AND c.status = 'ACTIVE' 
      AND u.status = 'ACTIVE'
      AND datetime('now') BETWEEN e.access_start AND e.access_expiry
  `).get(studentId, studentId, meetingId);

  if (!meeting) {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'meeting',
      resourceId: meetingId,
      req,
      status: 'DENIED',
      details: 'Attempted to access meeting from un-enrolled or expired course'
    });
    return res.status(403).json({
      success: false,
      error: 'You do not have access to this meeting or your course enrollment has expired.'
    });
  }

  res.json({
    success: true,
    meeting: enrichMeetingStatus(meeting)
  });
}

/**
 * GET /api/admin/meetings
 * Returns all meetings with enrolled student counts and course info.
 */
export function getAdminMeetings(req, res) {
  const { course_id, platform, status, from, to } = req.query;

  let query = `
    SELECT 
      m.*,
      c.title AS course_title,
      c.thumbnail_url AS course_thumbnail,
      (
        SELECT COUNT(*) 
        FROM enrollments e 
        WHERE e.course_id = m.course_id AND e.status = 'ACTIVE'
      ) AS enrolled_students_count
    FROM meetings m
    JOIN courses c ON m.course_id = c.id
    WHERE 1=1
  `;

  const params = [];

  if (course_id && course_id !== 'ALL' && !isNaN(Number(course_id))) {
    query += ` AND m.course_id = ?`;
    params.push(Number(course_id));
  }

  if (platform && platform !== 'ALL') {
    query += ` AND m.platform = ?`;
    params.push(platform);
  }

  if (status && status !== 'ALL') {
    query += ` AND m.status = ?`;
    params.push(status);
  }

  if (from) {
    query += ` AND m.end_time >= ?`;
    params.push(from);
  }

  if (to) {
    query += ` AND m.start_time <= ?`;
    params.push(to);
  }

  query += ` ORDER BY m.start_time DESC`;

  const rows = db.prepare(query).all(...params);
  const meetings = rows.map(enrichMeetingStatus);

  res.json({
    success: true,
    count: meetings.length,
    meetings
  });
}

/**
 * POST /api/admin/meetings
 * Schedules a new live meeting for a course.
 */
export function createMeeting(req, res) {
  const adminId = req.user.id;
  const {
    course_id,
    title,
    description,
    platform,
    meeting_url,
    instructor_name,
    start_time,
    end_time
  } = req.body;

  // Validation
  if (!course_id || isNaN(Number(course_id))) {
    return res.status(400).json({
      success: false,
      error: 'Course selection is mandatory.'
    });
  }

  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(course_id));
  if (!course) {
    return res.status(404).json({
      success: false,
      error: 'Selected course does not exist.'
    });
  }

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Meeting title is required.'
    });
  }

  if (!platform || !['google_meet', 'zoom'].includes(platform)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid platform. Allowed values are "google_meet" or "zoom".'
    });
  }

  if (!meeting_url || typeof meeting_url !== 'string' || !meeting_url.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Meeting URL is required.'
    });
  }

  // Ensure URL is a valid http/https format
  const trimmedUrl = meeting_url.trim();
  try {
    const parsed = new URL(trimmedUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch (e) {
    return res.status(400).json({
      success: false,
      error: 'Please provide a valid web URL for the meeting (e.g. https://meet.google.com/... or https://zoom.us/j/...)'
    });
  }

  if (!start_time || !end_time) {
    return res.status(400).json({
      success: false,
      error: 'Start time and end time are required.'
    });
  }

  const startDate = new Date(start_time);
  const endDate = new Date(end_time);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({
      success: false,
      error: 'Invalid start time or end time format.'
    });
  }

  if (endDate <= startDate) {
    return res.status(400).json({
      success: false,
      error: 'End time must be after start time.'
    });
  }

  const result = db.prepare(`
    INSERT INTO meetings (
      course_id,
      title,
      description,
      platform,
      meeting_url,
      instructor_name,
      start_time,
      end_time,
      status,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
  `).run(
    Number(course_id),
    title.trim(),
    (description || '').trim(),
    platform,
    trimmedUrl,
    (instructor_name || '').trim(),
    startDate.toISOString(),
    endDate.toISOString(),
    adminId
  );

  const newMeeting = db.prepare(`
    SELECT 
      m.*,
      c.title AS course_title,
      c.thumbnail_url AS course_thumbnail,
      (
        SELECT COUNT(*) 
        FROM enrollments e 
        WHERE e.course_id = m.course_id AND e.status = 'ACTIVE'
      ) AS enrolled_students_count
    FROM meetings m
    JOIN courses c ON m.course_id = c.id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({
    success: true,
    message: 'Meeting scheduled successfully.',
    meeting: enrichMeetingStatus(newMeeting)
  });
}

/**
 * PUT /api/admin/meetings/:id
 * Updates meeting details.
 */
export function updateMeeting(req, res) {
  const meetingId = Number(req.params.id);

  if (!meetingId || isNaN(meetingId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid meeting ID provided.'
    });
  }

  const existing = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meetingId);
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Meeting not found.'
    });
  }

  const {
    course_id,
    title,
    description,
    platform,
    meeting_url,
    instructor_name,
    start_time,
    end_time,
    status,
    cancellation_reason
  } = req.body;

  let newCourseId = existing.course_id;
  if (course_id !== undefined) {
    newCourseId = Number(course_id);
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(newCourseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Selected course does not exist.'
      });
    }
  }

  let newTitle = title !== undefined ? title.trim() : existing.title;
  if (!newTitle) {
    return res.status(400).json({
      success: false,
      error: 'Meeting title cannot be empty.'
    });
  }

  let newPlatform = platform !== undefined ? platform : existing.platform;
  if (!['google_meet', 'zoom'].includes(newPlatform)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid platform. Allowed values are "google_meet" or "zoom".'
    });
  }

  let newUrl = meeting_url !== undefined ? meeting_url.trim() : existing.meeting_url;
  try {
    const parsed = new URL(newUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch (e) {
    return res.status(400).json({
      success: false,
      error: 'Please provide a valid URL (http/https).'
    });
  }

  let newStart = existing.start_time;
  let newEnd = existing.end_time;
  if (start_time !== undefined) {
    const d = new Date(start_time);
    if (isNaN(d.getTime())) return res.status(400).json({ success: false, error: 'Invalid start time.' });
    newStart = d.toISOString();
  }
  if (end_time !== undefined) {
    const d = new Date(end_time);
    if (isNaN(d.getTime())) return res.status(400).json({ success: false, error: 'Invalid end time.' });
    newEnd = d.toISOString();
  }

  if (new Date(newEnd) <= new Date(newStart)) {
    return res.status(400).json({
      success: false,
      error: 'End time must be after start time.'
    });
  }

  let newStatus = status !== undefined ? status : existing.status;
  if (!['scheduled', 'cancelled', 'completed'].includes(newStatus)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid status.'
    });
  }

  const newReason = cancellation_reason !== undefined ? cancellation_reason : existing.cancellation_reason;

  db.prepare(`
    UPDATE meetings SET
      course_id = ?,
      title = ?,
      description = ?,
      platform = ?,
      meeting_url = ?,
      instructor_name = ?,
      start_time = ?,
      end_time = ?,
      status = ?,
      cancellation_reason = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    newCourseId,
    newTitle,
    description !== undefined ? description.trim() : existing.description,
    newPlatform,
    newUrl,
    instructor_name !== undefined ? instructor_name.trim() : existing.instructor_name,
    newStart,
    newEnd,
    newStatus,
    newReason,
    meetingId
  );

  const updated = db.prepare(`
    SELECT 
      m.*,
      c.title AS course_title,
      c.thumbnail_url AS course_thumbnail,
      (
        SELECT COUNT(*) 
        FROM enrollments e 
        WHERE e.course_id = m.course_id AND e.status = 'ACTIVE'
      ) AS enrolled_students_count
    FROM meetings m
    JOIN courses c ON m.course_id = c.id
    WHERE m.id = ?
  `).get(meetingId);

  res.json({
    success: true,
    message: 'Meeting updated successfully.',
    meeting: enrichMeetingStatus(updated)
  });
}

/**
 * PATCH /api/admin/meetings/:id/status
 * Quick update status (e.g. cancel with reason or mark completed).
 */
export function updateMeetingStatus(req, res) {
  const meetingId = Number(req.params.id);
  const { status, cancellation_reason } = req.body;

  if (!meetingId || isNaN(meetingId)) {
    return res.status(400).json({ success: false, error: 'Invalid meeting ID.' });
  }

  if (!['scheduled', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status value.' });
  }

  const existing = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meetingId);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Meeting not found.' });
  }

  db.prepare(`
    UPDATE meetings 
    SET status = ?, cancellation_reason = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, cancellation_reason || null, meetingId);

  const updated = db.prepare(`
    SELECT 
      m.*,
      c.title AS course_title,
      c.thumbnail_url AS course_thumbnail,
      (
        SELECT COUNT(*) 
        FROM enrollments e 
        WHERE e.course_id = m.course_id AND e.status = 'ACTIVE'
      ) AS enrolled_students_count
    FROM meetings m
    JOIN courses c ON m.course_id = c.id
    WHERE m.id = ?
  `).get(meetingId);

  res.json({
    success: true,
    message: `Meeting marked as ${status}.`,
    meeting: enrichMeetingStatus(updated)
  });
}

/**
 * DELETE /api/admin/meetings/:id
 * Deletes a scheduled meeting.
 */
export function deleteMeeting(req, res) {
  const meetingId = Number(req.params.id);

  if (!meetingId || isNaN(meetingId)) {
    return res.status(400).json({ success: false, error: 'Invalid meeting ID.' });
  }

  const existing = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meetingId);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Meeting not found.' });
  }

  db.prepare('DELETE FROM meetings WHERE id = ?').run(meetingId);

  res.json({
    success: true,
    message: 'Meeting deleted successfully.'
  });
}
