import { db } from '../config/database.js';
import { supabase } from '../config/supabase.js';
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

    // Query active enrollments for student within access window
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
    end_time
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
    Number(adminId) || null
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

function updateMeetingSqlite(req, res) {
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

function updateMeetingStatusSqlite(req, res) {
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

function deleteMeetingSqlite(req, res) {
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
      end_time
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

    const { data: newMeeting, error: insertErr } = await supabase
      .from('meetings')
      .insert({
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
      })
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
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function updateMeetingSupabase(req, res) {
  try {
    const meetingId = Number(req.params.id);

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
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function updateMeetingStatusSupabase(req, res) {
  try {
    const meetingId = Number(req.params.id);
    const { status, cancellation_reason } = req.body;

    if (!meetingId || isNaN(meetingId)) {
      return res.status(400).json({ success: false, error: 'Invalid meeting ID.' });
    }

    if (!['scheduled', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value.' });
    }

    const { data: existing, error: existErr } = await supabase
      .from('meetings')
      .select('id, course_id')
      .eq('id', meetingId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Meeting not found.' });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('meetings')
      .update({
        status,
        cancellation_reason: cancellation_reason || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', meetingId)
      .select('*, courses!inner(title, thumbnail_url)')
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

    if (!meetingId || isNaN(meetingId)) {
      return res.status(400).json({ success: false, error: 'Invalid meeting ID.' });
    }

    const { data: existing, error: existErr } = await supabase
      .from('meetings')
      .select('id')
      .eq('id', meetingId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Meeting not found.' });
    }

    const { error: delErr } = await supabase
      .from('meetings')
      .delete()
      .eq('id', meetingId);

    if (delErr) throw delErr;

    return res.json({
      success: true,
      message: 'Meeting deleted successfully.'
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
