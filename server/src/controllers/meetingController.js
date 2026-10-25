import crypto from 'crypto';
import { db } from '../config/database.js';
import { supabase } from '../config/supabase.js';
import { logSecurityEvent } from '../utils/auditLogger.js';

const JOIN_WINDOW_MINUTES = 15;

/**
 * Calculates meeting live/upcoming/completed status and join eligibility based on time.
 */
function enrichMeetingStatus(meeting) {
  if (!meeting) return null;
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
 * Extracts IST date (YYYY-MM-DD) and time (HH:mm) from an ISO timestamp string or Date object.
 */
export function extractISTDateAndTime(isoOrDate) {
  const d = new Date(isoOrDate);
  const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  const timeStr = d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }); // HH:mm
  return { dateStr, timeStr };
}

/**
 * Constructs an ISO string from an IST date (YYYY-MM-DD) and time (HH:mm).
 */
export function makeISTIsoString(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00+05:30`).toISOString();
}

/**
 * Generates an array of date strings 'YYYY-MM-DD' inclusively between startDateStr and endDateStr
 * in Asia/Kolkata timezone according to recurrence rules.
 *
 * @param {string} startDateStr - YYYY-MM-DD
 * @param {string} endDateStr - YYYY-MM-DD
 * @param {string} recurrenceType - 'none' | 'daily' | 'weekdays' | 'weekly' | 'custom'
 * @param {number[]} selectedDays - Array of day indices (0=Sun, 1=Mon, ..., 6=Sat)
 * @returns {string[]} Array of date strings 'YYYY-MM-DD'
 */
export function generateRecurringDates(startDateStr, endDateStr, recurrenceType, selectedDays = []) {
  if (!startDateStr) return [];
  if (!recurrenceType || recurrenceType === 'none') {
    return [startDateStr];
  }

  if (!endDateStr) {
    throw new Error('Recurrence end date is required for recurring meetings.');
  }

  // Parse YYYY-MM-DD
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);

  const startUtc = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ey, em - 1, ed);

  if (endUtc < startUtc) {
    throw new Error('Recurrence end date cannot be earlier than start date.');
  }

  // Determine allowed day-of-week indices (0=Sun, 1=Mon, ..., 6=Sat)
  let allowedDays = [];
  if (recurrenceType === 'daily') {
    allowedDays = [0, 1, 2, 3, 4, 5, 6];
  } else if (recurrenceType === 'weekdays') {
    allowedDays = [1, 2, 3, 4, 5]; // Mon, Tue, Wed, Thu, Fri
  } else if (recurrenceType === 'weekly' || recurrenceType === 'custom') {
    if (!Array.isArray(selectedDays) || selectedDays.length === 0) {
      throw new Error('At least one weekday must be selected for weekly or custom recurrence.');
    }
    allowedDays = selectedDays.map(Number);
  } else {
    throw new Error(`Unsupported recurrence type: "${recurrenceType}".`);
  }

  const MAX_SESSIONS = 150;
  const dates = [];
  const oneDayMs = 24 * 60 * 60 * 1000;

  for (let currentMs = startUtc; currentMs <= endUtc; currentMs += oneDayMs) {
    const curDate = new Date(currentMs);
    const dayOfWeek = curDate.getUTCDay();

    if (allowedDays.includes(dayOfWeek)) {
      const year = curDate.getUTCFullYear();
      const month = String(curDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(curDate.getUTCDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);

      if (dates.length > MAX_SESSIONS) {
        throw new Error(`Recurring series exceeds the maximum allowed limit of ${MAX_SESSIONS} sessions.`);
      }
    }
  }

  return dates;
}

let supabaseHasRecurrenceCols = null;
async function checkSupabaseRecurrenceColumns() {
  if (supabaseHasRecurrenceCols !== null) return supabaseHasRecurrenceCols;
  try {
    const { error } = await supabase.from('meetings').select('recurrence_group_id').limit(1);
    supabaseHasRecurrenceCols = !error || error.code !== '42703';
  } catch {
    supabaseHasRecurrenceCols = false;
  }
  return supabaseHasRecurrenceCols;
}

/**
 * ==========================================
 * SQLITE STUDENT MEETINGS (ROLLBACK PATH)
 * ==========================================
 */

function getStudentMeetingsSqlite(req, res) {
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

function getStudentMeetingDetailSqlite(req, res) {
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
 * ==========================================
 * SUPABASE STUDENT MEETINGS (TARGET RUNTIME)
 * ==========================================
 */

async function getStudentMeetingsSupabase(req, res) {
  try {
    const studentId = req.user.id;
    const { from, to, limit } = req.query;
    const nowIso = new Date().toISOString();

    const { data: enrollments, error: enrollErr } = await supabase
      .from('enrollments')
      .select('course_id, access_start, access_expiry, courses!inner(id, title, thumbnail_url, status)')
      .eq('student_id', studentId)
      .eq('status', 'ACTIVE')
      .eq('courses.status', 'ACTIVE')
      .lte('access_start', nowIso)
      .gte('access_expiry', nowIso);

    if (enrollErr) throw enrollErr;

    if (!enrollments || enrollments.length === 0) {
      return res.json({
        success: true,
        count: 0,
        meetings: []
      });
    }

    const courseMap = {};
    enrollments.forEach(e => {
      courseMap[e.course_id] = e;
    });
    const courseIds = Object.keys(courseMap).map(Number);

    let query = supabase
      .from('meetings')
      .select('*, courses!inner(title, thumbnail_url)')
      .in('course_id', courseIds);

    if (from) {
      query = query.gte('end_time', from);
    }
    if (to) {
      query = query.lte('start_time', to);
    }

    query = query.order('start_time', { ascending: true });

    if (limit && !isNaN(Number(limit))) {
      query = query.limit(Math.max(1, Number(limit)));
    }

    const { data: rows, error: meetErr } = await query;
    if (meetErr) throw meetErr;

    const flattened = (rows || []).map(m => {
      const e = courseMap[m.course_id];
      return {
        ...m,
        course_title: m.courses?.title,
        course_thumbnail: m.courses?.thumbnail_url,
        access_start: e?.access_start,
        access_expiry: e?.access_expiry
      };
    });

    const meetings = flattened.map(enrichMeetingStatus);

    return res.json({
      success: true,
      count: meetings.length,
      meetings
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function getStudentMeetingDetailSupabase(req, res) {
  try {
    const studentId = req.user.id;
    const meetingId = Number(req.params.id);

    if (!meetingId || isNaN(meetingId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid meeting ID provided.'
      });
    }

    const { data: meeting, error: mErr } = await supabase
      .from('meetings')
      .select('*, courses!inner(title, thumbnail_url, status)')
      .eq('id', meetingId)
      .maybeSingle();

    if (mErr || !meeting || meeting.courses?.status !== 'ACTIVE') {
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

    const nowIso = new Date().toISOString();
    const { data: enrollment, error: eErr } = await supabase
      .from('enrollments')
      .select('*')
      .eq('student_id', studentId)
      .eq('course_id', meeting.course_id)
      .eq('status', 'ACTIVE')
      .lte('access_start', nowIso)
      .gte('access_expiry', nowIso)
      .maybeSingle();

    if (eErr || !enrollment) {
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

    const enriched = {
      ...meeting,
      course_title: meeting.courses?.title,
      course_thumbnail: meeting.courses?.thumbnail_url,
      access_start: enrollment.access_start,
      access_expiry: enrollment.access_expiry
    };

    return res.json({
      success: true,
      meeting: enrichMeetingStatus(enriched)
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * ==========================================
 * EXPORTED STUDENT MEETING DISPATCHERS
 * ==========================================
 */

export function getStudentMeetings(req, res) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getStudentMeetingsSupabase(req, res);
  }
  return getStudentMeetingsSqlite(req, res);
}

export function getStudentMeetingDetail(req, res) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getStudentMeetingDetailSupabase(req, res);
  }
  return getStudentMeetingDetailSqlite(req, res);
}

/**
 * ==========================================
 * ADMIN MEETING ENDPOINTS (SQLITE PRESERVED)
 * ==========================================
 */

function getAdminMeetingsSqlite(req, res) {
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

function createMeetingSqlite(req, res) {
  const adminId = req.user.id;
  const {
    course_id,
    title,
    description,
    platform,
    meeting_url,
    instructor_name,
    start_time,
    end_time,
    recurrence_type = 'none',
    recurrence_end_date,
    selected_days = []
  } = req.body;

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

  const { dateStr: startDateStr, timeStr: startTimeStr } = extractISTDateAndTime(startDate);
  const { timeStr: endTimeStr } = extractISTDateAndTime(endDate);

  const isRecurring = recurrence_type && recurrence_type !== 'none';

  if (!isRecurring) {
    // Single one-time meeting
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
        created_by,
        recurrence_group_id,
        recurrence_type,
        recurrence_end_date,
        scheduled_date,
        timezone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, NULL, 'none', NULL, ?, 'Asia/Kolkata')
    `).run(
      Number(course_id),
      title.trim(),
      (description || '').trim(),
      platform,
      trimmedUrl,
      (instructor_name || '').trim(),
      startDate.toISOString(),
      endDate.toISOString(),
      Number(adminId) || null,
      startDateStr
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

    return res.status(201).json({
      success: true,
      message: 'Meeting scheduled successfully.',
      meeting: enrichMeetingStatus(newMeeting)
    });
  }

  // Recurring series
  let recurrenceEndDateStr = recurrence_end_date;
  if (!recurrenceEndDateStr) {
    return res.status(400).json({
      success: false,
      error: 'Recurrence end date is required for recurring meetings.'
    });
  }
  if (recurrenceEndDateStr.includes('T')) {
    recurrenceEndDateStr = extractISTDateAndTime(recurrenceEndDateStr).dateStr;
  }

  let sessionDates = [];
  try {
    sessionDates = generateRecurringDates(startDateStr, recurrenceEndDateStr, recurrence_type, selected_days);
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }

  if (sessionDates.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No meeting dates match the selected weekdays within this date range.'
    });
  }

  const recurrenceGroupId = crypto.randomUUID();
  const recurrenceEndIso = makeISTIsoString(recurrenceEndDateStr, endTimeStr);

  const insertStmt = db.prepare(`
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
      created_by,
      recurrence_group_id,
      recurrence_type,
      recurrence_end_date,
      scheduled_date,
      timezone
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, 'Asia/Kolkata')
  `);

  const insertMany = db.transaction((dates) => {
    const ids = [];
    for (const d of dates) {
      const sessionStart = makeISTIsoString(d, startTimeStr);
      const sessionEnd = makeISTIsoString(d, endTimeStr);
      const r = insertStmt.run(
        Number(course_id),
        title.trim(),
        (description || '').trim(),
        platform,
        trimmedUrl,
        (instructor_name || '').trim(),
        sessionStart,
        sessionEnd,
        Number(adminId) || null,
        recurrenceGroupId,
        recurrence_type,
        recurrenceEndIso,
        d
      );
      ids.push(r.lastInsertRowid);
    }
    return ids;
  });

  const insertedIds = insertMany(sessionDates);

  const insertedMeetings = db.prepare(`
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
    WHERE m.recurrence_group_id = ?
    ORDER BY m.start_time ASC
  `).all(recurrenceGroupId).map(enrichMeetingStatus);

  return res.status(201).json({
    success: true,
    message: `Successfully scheduled ${insertedMeetings.length} recurring class sessions.`,
    count: insertedMeetings.length,
    recurrence_group_id: recurrenceGroupId,
    meeting: insertedMeetings[0],
    meetings: insertedMeetings
  });
}

function updateMeetingSqlite(req, res) {
  const meetingId = Number(req.params.id);
  const applyScope = req.body.apply_scope || req.query.apply_scope || 'single';

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
  let timeOfDayChanged = false;
  let newStartTimeStr = null;
  let newEndTimeStr = null;

  if (start_time !== undefined) {
    const d = new Date(start_time);
    if (isNaN(d.getTime())) return res.status(400).json({ success: false, error: 'Invalid start time.' });
    newStart = d.toISOString();
    newStartTimeStr = extractISTDateAndTime(d).timeStr;
    timeOfDayChanged = true;
  }
  if (end_time !== undefined) {
    const d = new Date(end_time);
    if (isNaN(d.getTime())) return res.status(400).json({ success: false, error: 'Invalid end time.' });
    newEnd = d.toISOString();
    newEndTimeStr = extractISTDateAndTime(d).timeStr;
    timeOfDayChanged = true;
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
  const newDesc = description !== undefined ? description.trim() : existing.description;
  const newInstructor = instructor_name !== undefined ? instructor_name.trim() : existing.instructor_name;

  // Check if series update applies
  const isSeries = Boolean(existing.recurrence_group_id);

  if (!isSeries || applyScope === 'single') {
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
      newDesc,
      newPlatform,
      newUrl,
      newInstructor,
      newStart,
      newEnd,
      newStatus,
      newReason,
      meetingId
    );
  } else {
    // Series update: 'future' or 'all'
    let targetsQuery = 'SELECT * FROM meetings WHERE recurrence_group_id = ?';
    const params = [existing.recurrence_group_id];
    if (applyScope === 'future') {
      targetsQuery += ' AND start_time >= ?';
      params.push(existing.start_time);
    }
    const targetMeetings = db.prepare(targetsQuery).all(...params);

    const updateTx = db.transaction((targets) => {
      for (const t of targets) {
        let mStart = t.start_time;
        let mEnd = t.end_time;
        if (timeOfDayChanged && newStartTimeStr && newEndTimeStr) {
          const tDateStr = t.scheduled_date || extractISTDateAndTime(t.start_time).dateStr;
          mStart = makeISTIsoString(tDateStr, newStartTimeStr);
          mEnd = makeISTIsoString(tDateStr, newEndTimeStr);
        }
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
          newDesc,
          newPlatform,
          newUrl,
          newInstructor,
          mStart,
          mEnd,
          newStatus,
          newReason,
          t.id
        );
      }
    });

    updateTx(targetMeetings);
  }

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

  return res.json({
    success: true,
    message: applyScope !== 'single' && isSeries
      ? `Updated series meetings successfully (${applyScope} scope).`
      : 'Meeting updated successfully.',
    meeting: enrichMeetingStatus(updated)
  });
}

function updateMeetingStatusSqlite(req, res) {
  const meetingId = Number(req.params.id);
  const { status, cancellation_reason, apply_scope = 'single' } = req.body;

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

  const isSeries = Boolean(existing.recurrence_group_id);

  if (!isSeries || apply_scope === 'single') {
    db.prepare(`
      UPDATE meetings 
      SET status = ?, cancellation_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, cancellation_reason || null, meetingId);
  } else if (apply_scope === 'future') {
    db.prepare(`
      UPDATE meetings 
      SET status = ?, cancellation_reason = ?, updated_at = datetime('now')
      WHERE recurrence_group_id = ? AND start_time >= ?
    `).run(status, cancellation_reason || null, existing.recurrence_group_id, existing.start_time);
  } else if (apply_scope === 'all') {
    db.prepare(`
      UPDATE meetings 
      SET status = ?, cancellation_reason = ?, updated_at = datetime('now')
      WHERE recurrence_group_id = ?
    `).run(status, cancellation_reason || null, existing.recurrence_group_id);
  }

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

  return res.json({
    success: true,
    message: `Meeting marked as ${status}.`,
    meeting: enrichMeetingStatus(updated)
  });
}

function deleteMeetingSqlite(req, res) {
  const meetingId = Number(req.params.id);
  const applyScope = req.query.apply_scope || req.body?.apply_scope || 'single';

  if (!meetingId || isNaN(meetingId)) {
    return res.status(400).json({ success: false, error: 'Invalid meeting ID.' });
  }

  const existing = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meetingId);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Meeting not found.' });
  }

  const isSeries = Boolean(existing.recurrence_group_id);

  if (!isSeries || applyScope === 'single') {
    db.prepare('DELETE FROM meetings WHERE id = ?').run(meetingId);
  } else if (applyScope === 'future') {
    db.prepare('DELETE FROM meetings WHERE recurrence_group_id = ? AND start_time >= ?')
      .run(existing.recurrence_group_id, existing.start_time);
  } else if (applyScope === 'all') {
    db.prepare('DELETE FROM meetings WHERE recurrence_group_id = ?')
      .run(existing.recurrence_group_id);
  }

  return res.json({
    success: true,
    message: isSeries && applyScope !== 'single'
      ? `Series meetings deleted successfully (${applyScope} scope).`
      : 'Meeting deleted successfully.'
  });
}

/**
 * ==========================================
 * ADMIN MEETING ENDPOINTS (SUPABASE RUNTIME)
 * ==========================================
 */

async function getAdminMeetingsSupabase(req, res) {
  try {
    const { course_id, platform, status, from, to } = req.query;

    let query = supabase
      .from('meetings')
      .select(`
        *,
        courses!inner(title, thumbnail_url)
      `);

    if (course_id && course_id !== 'ALL' && !isNaN(Number(course_id))) {
      query = query.eq('course_id', Number(course_id));
    }

    if (platform && platform !== 'ALL') {
      query = query.eq('platform', platform);
    }

    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }

    if (from) {
      query = query.gte('end_time', from);
    }

    if (to) {
      query = query.lte('start_time', to);
    }

    query = query.order('start_time', { ascending: false });

    const [meetingsRes, enrollmentsRes] = await Promise.all([
      query,
      supabase.from('enrollments').select('course_id').eq('status', 'ACTIVE')
    ]);

    if (meetingsRes.error) throw meetingsRes.error;
    if (enrollmentsRes.error) throw enrollmentsRes.error;

    const enrollCountMap = {};
    (enrollmentsRes.data || []).forEach(e => {
      enrollCountMap[e.course_id] = (enrollCountMap[e.course_id] || 0) + 1;
    });

    const flattened = (meetingsRes.data || []).map(m => ({
      ...m,
      course_title: m.courses?.title || '',
      course_thumbnail: m.courses?.thumbnail_url || null,
      enrolled_students_count: enrollCountMap[m.course_id] || 0
    }));

    const meetings = flattened.map(enrichMeetingStatus);

    return res.json({
      success: true,
      count: meetings.length,
      meetings
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function createMeetingSupabase(req, res) {
  try {
    const adminId = req.user.id;
    const {
      course_id,
      title,
      description,
      platform,
      meeting_url,
      instructor_name,
      start_time,
      end_time,
      recurrence_type = 'none',
      recurrence_end_date,
      selected_days = []
    } = req.body;

    if (!course_id || isNaN(Number(course_id))) {
      return res.status(400).json({
        success: false,
        error: 'Course selection is mandatory.'
      });
    }

    const { data: course, error: courseErr } = await supabase
      .from('courses')
      .select('*')
      .eq('id', Number(course_id))
      .maybeSingle();

    if (courseErr) throw courseErr;
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

    const { dateStr: startDateStr, timeStr: startTimeStr } = extractISTDateAndTime(startDate);
    const { timeStr: endTimeStr } = extractISTDateAndTime(endDate);

    const hasRecurrenceCols = await checkSupabaseRecurrenceColumns();
    const isRecurring = recurrence_type && recurrence_type !== 'none';

    if (!isRecurring) {
      const payload = {
        course_id: Number(course_id),
        title: title.trim(),
        description: (description || '').trim(),
        platform,
        meeting_url: trimmedUrl,
        instructor_name: (instructor_name || '').trim(),
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        status: 'scheduled',
        created_by: adminId || null
      };

      if (hasRecurrenceCols) {
        payload.recurrence_group_id = null;
        payload.recurrence_type = 'none';
        payload.scheduled_date = startDateStr;
        payload.timezone = 'Asia/Kolkata';
      }

      const { data: newMeeting, error: insertErr } = await supabase
        .from('meetings')
        .insert(payload)
        .select('*, courses!inner(title, thumbnail_url)')
        .single();

      if (insertErr) throw insertErr;

      const { count: enrolledCount } = await supabase
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', Number(course_id))
        .eq('status', 'ACTIVE');

      const enriched = {
        ...newMeeting,
        course_title: newMeeting.courses?.title,
        course_thumbnail: newMeeting.courses?.thumbnail_url,
        enrolled_students_count: enrolledCount || 0
      };

      return res.status(201).json({
        success: true,
        message: 'Meeting scheduled successfully.',
        meeting: enrichMeetingStatus(enriched)
      });
    }

    // Recurring in Supabase
    let recurrenceEndDateStr = recurrence_end_date;
    if (!recurrenceEndDateStr) {
      return res.status(400).json({
        success: false,
        error: 'Recurrence end date is required for recurring meetings.'
      });
    }
    if (recurrenceEndDateStr.includes('T')) {
      recurrenceEndDateStr = extractISTDateAndTime(recurrenceEndDateStr).dateStr;
    }

    let sessionDates = [];
    try {
      sessionDates = generateRecurringDates(startDateStr, recurrenceEndDateStr, recurrence_type, selected_days);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }

    if (sessionDates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No meeting dates match the selected weekdays within this date range.'
      });
    }

    const recurrenceGroupId = crypto.randomUUID();
    const recurrenceEndIso = makeISTIsoString(recurrenceEndDateStr, endTimeStr);

    const rows = sessionDates.map(d => {
      const sessionStart = makeISTIsoString(d, startTimeStr);
      const sessionEnd = makeISTIsoString(d, endTimeStr);
      const r = {
        course_id: Number(course_id),
        title: title.trim(),
        description: (description || '').trim(),
        platform,
        meeting_url: trimmedUrl,
        instructor_name: (instructor_name || '').trim(),
        start_time: sessionStart,
        end_time: sessionEnd,
        status: 'scheduled',
        created_by: adminId || null
      };

      if (hasRecurrenceCols) {
        r.recurrence_group_id = recurrenceGroupId;
        r.recurrence_type = recurrence_type;
        r.recurrence_end_date = recurrenceEndIso;
        r.scheduled_date = d;
        r.timezone = 'Asia/Kolkata';
      }
      return r;
    });

    const { data: insertedRows, error: batchErr } = await supabase
      .from('meetings')
      .insert(rows)
      .select('*, courses!inner(title, thumbnail_url)');

    if (batchErr) throw batchErr;

    const { count: enrolledCount } = await supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', Number(course_id))
      .eq('status', 'ACTIVE');

    const enrichedList = (insertedRows || []).map(m => enrichMeetingStatus({
      ...m,
      course_title: m.courses?.title,
      course_thumbnail: m.courses?.thumbnail_url,
      enrolled_students_count: enrolledCount || 0
    }));

    return res.status(201).json({
      success: true,
      message: `Successfully scheduled ${enrichedList.length} recurring class sessions.`,
      count: enrichedList.length,
      recurrence_group_id: recurrenceGroupId,
      meeting: enrichedList[0],
      meetings: enrichedList
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function updateMeetingSupabase(req, res) {
  try {
    const meetingId = Number(req.params.id);
    const applyScope = req.body.apply_scope || req.query.apply_scope || 'single';

    if (!meetingId || isNaN(meetingId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid meeting ID provided.'
      });
    }

    const { data: existing, error: existErr } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .maybeSingle();

    if (existErr) throw existErr;
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
      const { data: course } = await supabase.from('courses').select('id').eq('id', newCourseId).maybeSingle();
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
    let timeOfDayChanged = false;
    let newStartTimeStr = null;
    let newEndTimeStr = null;

    if (start_time !== undefined) {
      const d = new Date(start_time);
      if (isNaN(d.getTime())) return res.status(400).json({ success: false, error: 'Invalid start time.' });
      newStart = d.toISOString();
      newStartTimeStr = extractISTDateAndTime(d).timeStr;
      timeOfDayChanged = true;
    }
    if (end_time !== undefined) {
      const d = new Date(end_time);
      if (isNaN(d.getTime())) return res.status(400).json({ success: false, error: 'Invalid end time.' });
      newEnd = d.toISOString();
      newEndTimeStr = extractISTDateAndTime(d).timeStr;
      timeOfDayChanged = true;
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
    const isSeries = Boolean(existing.recurrence_group_id);

    if (!isSeries || applyScope === 'single') {
      const { data: updated, error: updateErr } = await supabase
        .from('meetings')
        .update({
          course_id: newCourseId,
          title: newTitle,
          description: description !== undefined ? description.trim() : existing.description,
          platform: newPlatform,
          meeting_url: newUrl,
          instructor_name: instructor_name !== undefined ? instructor_name.trim() : existing.instructor_name,
          start_time: newStart,
          end_time: newEnd,
          status: newStatus,
          cancellation_reason: newReason,
          updated_at: new Date().toISOString()
        })
        .eq('id', meetingId)
        .select('*, courses!inner(title, thumbnail_url)')
        .single();

      if (updateErr) throw updateErr;

      const { count: enrolledCount } = await supabase
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', newCourseId)
        .eq('status', 'ACTIVE');

      const enriched = {
        ...updated,
        course_title: updated.courses?.title,
        course_thumbnail: updated.courses?.thumbnail_url,
        enrolled_students_count: enrolledCount || 0
      };

      return res.json({
        success: true,
        message: 'Meeting updated successfully.',
        meeting: enrichMeetingStatus(enriched)
      });
    }

    // Series update in Supabase
    let targetsQuery = supabase
      .from('meetings')
      .select('id, start_time, scheduled_date')
      .eq('recurrence_group_id', existing.recurrence_group_id);

    if (applyScope === 'future') {
      targetsQuery = targetsQuery.gte('start_time', existing.start_time);
    }

    const { data: targetMeetings, error: targetsErr } = await targetsQuery;
    if (targetsErr) throw targetsErr;

    const baseUpdate = {
      course_id: newCourseId,
      title: newTitle,
      description: description !== undefined ? description.trim() : existing.description,
      platform: newPlatform,
      meeting_url: newUrl,
      instructor_name: instructor_name !== undefined ? instructor_name.trim() : existing.instructor_name,
      status: newStatus,
      cancellation_reason: newReason,
      updated_at: new Date().toISOString()
    };

    if (timeOfDayChanged && newStartTimeStr && newEndTimeStr) {
      for (const t of (targetMeetings || [])) {
        const tDateStr = t.scheduled_date || extractISTDateAndTime(t.start_time).dateStr;
        const mStart = makeISTIsoString(tDateStr, newStartTimeStr);
        const mEnd = makeISTIsoString(tDateStr, newEndTimeStr);
        await supabase
          .from('meetings')
          .update({ ...baseUpdate, start_time: mStart, end_time: mEnd })
          .eq('id', t.id);
      }
    } else {
      const ids = (targetMeetings || []).map(t => t.id);
      if (ids.length > 0) {
        await supabase.from('meetings').update(baseUpdate).in('id', ids);
      }
    }

    const { data: updatedTarget, error: fetchErr } = await supabase
      .from('meetings')
      .select('*, courses!inner(title, thumbnail_url)')
      .eq('id', meetingId)
      .single();

    if (fetchErr) throw fetchErr;

    const { count: enrolledCount } = await supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', newCourseId)
      .eq('status', 'ACTIVE');

    const enriched = {
      ...updatedTarget,
      course_title: updatedTarget.courses?.title,
      course_thumbnail: updatedTarget.courses?.thumbnail_url,
      enrolled_students_count: enrolledCount || 0
    };

    return res.json({
      success: true,
      message: `Updated series meetings successfully (${applyScope} scope).`,
      meeting: enrichMeetingStatus(enriched)
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function updateMeetingStatusSupabase(req, res) {
  try {
    const meetingId = Number(req.params.id);
    const { status, cancellation_reason, apply_scope = 'single' } = req.body;

    if (!meetingId || isNaN(meetingId)) {
      return res.status(400).json({ success: false, error: 'Invalid meeting ID.' });
    }

    if (!['scheduled', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value.' });
    }

    const { data: existing, error: existErr } = await supabase
      .from('meetings')
      .select('id, course_id, recurrence_group_id, start_time')
      .eq('id', meetingId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Meeting not found.' });
    }

    const isSeries = Boolean(existing.recurrence_group_id);
    const updatePayload = {
      status,
      cancellation_reason: cancellation_reason || null,
      updated_at: new Date().toISOString()
    };

    if (!isSeries || apply_scope === 'single') {
      await supabase.from('meetings').update(updatePayload).eq('id', meetingId);
    } else if (apply_scope === 'future') {
      await supabase
        .from('meetings')
        .update(updatePayload)
        .eq('recurrence_group_id', existing.recurrence_group_id)
        .gte('start_time', existing.start_time);
    } else if (apply_scope === 'all') {
      await supabase
        .from('meetings')
        .update(updatePayload)
        .eq('recurrence_group_id', existing.recurrence_group_id);
    }

    const { data: updated, error: updateErr } = await supabase
      .from('meetings')
      .select('*, courses!inner(title, thumbnail_url)')
      .eq('id', meetingId)
      .single();

    if (updateErr) throw updateErr;

    const { count: enrolledCount } = await supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', existing.course_id)
      .eq('status', 'ACTIVE');

    const enriched = {
      ...updated,
      course_title: updated.courses?.title,
      course_thumbnail: updated.courses?.thumbnail_url,
      enrolled_students_count: enrolledCount || 0
    };

    return res.json({
      success: true,
      message: `Meeting marked as ${status}.`,
      meeting: enrichMeetingStatus(enriched)
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function deleteMeetingSupabase(req, res) {
  try {
    const meetingId = Number(req.params.id);
    const applyScope = req.query.apply_scope || req.body?.apply_scope || 'single';

    if (!meetingId || isNaN(meetingId)) {
      return res.status(400).json({ success: false, error: 'Invalid meeting ID.' });
    }

    const { data: existing, error: existErr } = await supabase
      .from('meetings')
      .select('id, recurrence_group_id, start_time')
      .eq('id', meetingId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Meeting not found.' });
    }

    const isSeries = Boolean(existing.recurrence_group_id);

    if (!isSeries || applyScope === 'single') {
      const { error: delErr } = await supabase.from('meetings').delete().eq('id', meetingId);
      if (delErr) throw delErr;
    } else if (applyScope === 'future') {
      const { error: delErr } = await supabase
        .from('meetings')
        .delete()
        .eq('recurrence_group_id', existing.recurrence_group_id)
        .gte('start_time', existing.start_time);
      if (delErr) throw delErr;
    } else if (applyScope === 'all') {
      const { error: delErr } = await supabase
        .from('meetings')
        .delete()
        .eq('recurrence_group_id', existing.recurrence_group_id);
      if (delErr) throw delErr;
    }

    return res.json({
      success: true,
      message: isSeries && applyScope !== 'single'
        ? `Series meetings deleted successfully (${applyScope} scope).`
        : 'Meeting deleted successfully.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * ==========================================
 * EXPORTED ADMIN MEETING DISPATCHERS
 * ==========================================
 */

export function getAdminMeetings(req, res) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getAdminMeetingsSupabase(req, res);
  }
  return getAdminMeetingsSqlite(req, res);
}

export function createMeeting(req, res) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return createMeetingSupabase(req, res);
  }
  return createMeetingSqlite(req, res);
}

export function updateMeeting(req, res) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return updateMeetingSupabase(req, res);
  }
  return updateMeetingSqlite(req, res);
}

export function updateMeetingStatus(req, res) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return updateMeetingStatusSupabase(req, res);
  }
  return updateMeetingStatusSqlite(req, res);
}

export function deleteMeeting(req, res) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return deleteMeetingSupabase(req, res);
  }
  return deleteMeetingSqlite(req, res);
}
