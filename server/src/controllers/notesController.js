import { db } from '../config/database.js';
import { logSecurityEvent } from '../utils/auditLogger.js';

function formatTimestamp(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return null;
  const s = Math.round(Number(seconds));
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  if (h > 0) {
    return `${h}:${remMin.toString().padStart(2, '0')}:${remSec.toString().padStart(2, '0')}`;
  }
  return `${remMin.toString().padStart(2, '0')}:${remSec.toString().padStart(2, '0')}`;
}

/**
 * GET /api/student/videos/:videoId/notes
 * Returns all notes written by the authenticated student for the specified video.
 */
export function getVideoNotes(req, res) {
  const studentId = req.user.id;
  const videoId = Number(req.params.videoId);

  if (!videoId || isNaN(videoId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid video ID provided.'
    });
  }

  const notes = db.prepare(`
    SELECT n.*, v.title AS video_title, c.title AS course_title
    FROM student_notes n
    JOIN videos v ON n.video_id = v.id
    JOIN courses c ON n.course_id = c.id
    WHERE n.student_id = ? AND n.video_id = ?
    ORDER BY 
      CASE WHEN n.timestamp_seconds IS NOT NULL THEN 0 ELSE 1 END,
      n.timestamp_seconds ASC,
      n.created_at DESC
  `).all(studentId, videoId);

  res.json({
    success: true,
    count: notes.length,
    notes
  });
}

/**
 * GET /api/student/notes
 * Returns all notes for the authenticated student across all enrolled courses and videos.
 * Supports query parameters: search, course_id, video_id.
 */
export function getAllStudentNotes(req, res) {
  const studentId = req.user.id;
  const search = (req.query.search || '').trim();
  const courseId = req.query.course_id ? Number(req.query.course_id) : null;
  const videoId = req.query.video_id ? Number(req.query.video_id) : null;

  let query = `
    SELECT 
      n.*, 
      v.title AS video_title, 
      c.title AS course_title,
      e.status AS enrollment_status,
      e.access_start,
      e.access_expiry,
      CASE 
        WHEN e.status = 'ACTIVE' AND datetime('now') BETWEEN e.access_start AND e.access_expiry THEN 1 
        ELSE 0 
      END AS can_access_video
    FROM student_notes n
    JOIN videos v ON n.video_id = v.id
    JOIN courses c ON n.course_id = c.id
    LEFT JOIN enrollments e ON e.student_id = n.student_id AND e.course_id = n.course_id
    WHERE n.student_id = ?
  `;

  const params = [studentId];

  if (courseId && !isNaN(courseId)) {
    query += ` AND n.course_id = ?`;
    params.push(courseId);
  }

  if (videoId && !isNaN(videoId)) {
    query += ` AND n.video_id = ?`;
    params.push(videoId);
  }

  if (search) {
    query += ` AND (
      n.title LIKE ? OR 
      n.content LIKE ? OR 
      c.title LIKE ? OR 
      v.title LIKE ?
    )`;
    const wildcard = `%${search}%`;
    params.push(wildcard, wildcard, wildcard, wildcard);
  }

  query += ` ORDER BY n.updated_at DESC`;

  const notes = db.prepare(query).all(...params);

  res.json({
    success: true,
    count: notes.length,
    notes
  });
}

/**
 * POST /api/student/videos/:videoId/notes
 * Creates a new note for the authenticated student on a video.
 */
export function createNote(req, res) {
  const studentId = req.user.id;
  const videoId = Number(req.params.videoId);

  if (!videoId || isNaN(videoId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid video ID provided.'
    });
  }

  // Verify video exists and is accessible by this student
  const video = db.prepare(`
    SELECT v.*, c.title AS course_title, c.status AS course_status
    FROM videos v
    JOIN courses c ON v.course_id = c.id
    WHERE v.id = ?
  `).get(videoId);

  if (!video || video.status !== 'ACTIVE' || video.course_status !== 'ACTIVE') {
    return res.status(404).json({
      success: false,
      error: 'Video is currently unavailable.'
    });
  }

  const enrollment = db.prepare(`
    SELECT * FROM enrollments 
    WHERE student_id = ? AND course_id = ?
  `).get(studentId, video.course_id);

  if (!enrollment || enrollment.status !== 'ACTIVE') {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'note',
      resourceId: videoId,
      req,
      status: 'DENIED',
      details: 'Attempted to add note to un-enrolled or inactive course'
    });
    return res.status(403).json({
      success: false,
      error: 'You are not authorized to create notes for this video.'
    });
  }

  const now = new Date().toISOString();
  if (now < enrollment.access_start || now > enrollment.access_expiry) {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'note',
      resourceId: videoId,
      req,
      status: 'DENIED',
      details: 'Attempted to add note while course access is expired or not started'
    });
    return res.status(403).json({
      success: false,
      error: 'Your course access period does not allow adding notes.'
    });
  }

  let { title, content, timestamp_seconds } = req.body;

  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Note content cannot be empty.'
    });
  }
  content = content.trim();

  let parsedSeconds = null;
  if (timestamp_seconds !== undefined && timestamp_seconds !== null && timestamp_seconds !== '') {
    const num = Number(timestamp_seconds);
    if (!isNaN(num) && num >= 0) {
      parsedSeconds = Math.round(num);
    }
  }

  title = (title || '').trim();
  if (!title) {
    title = parsedSeconds !== null 
      ? `Note @ ${formatTimestamp(parsedSeconds)}`
      : 'Untitled Note';
  }

  const result = db.prepare(`
    INSERT INTO student_notes (student_id, course_id, video_id, title, content, timestamp_seconds)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(studentId, video.course_id, videoId, title, content, parsedSeconds);

  const newNote = db.prepare(`
    SELECT n.*, v.title AS video_title, c.title AS course_title
    FROM student_notes n
    JOIN videos v ON n.video_id = v.id
    JOIN courses c ON n.course_id = c.id
    WHERE n.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({
    success: true,
    message: 'Note saved successfully.',
    note: newNote
  });
}

/**
 * PUT /api/student/notes/:noteId
 * Updates an existing note belonging to the authenticated student.
 */
export function updateNote(req, res) {
  const studentId = req.user.id;
  const noteId = Number(req.params.noteId);

  if (!noteId || isNaN(noteId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid note ID provided.'
    });
  }

  const existingNote = db.prepare('SELECT * FROM student_notes WHERE id = ?').get(noteId);

  if (!existingNote) {
    return res.status(404).json({
      success: false,
      error: 'Note not found.'
    });
  }

  // Enforce strict ownership
  if (existingNote.student_id !== studentId) {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'note',
      resourceId: noteId,
      req,
      status: 'DENIED',
      details: 'Attempted to modify another student note'
    });
    return res.status(403).json({
      success: false,
      error: 'You do not have permission to modify this note.'
    });
  }

  let { title, content, timestamp_seconds } = req.body;

  if (content !== undefined && (typeof content !== 'string' || !content.trim())) {
    return res.status(400).json({
      success: false,
      error: 'Note content cannot be empty.'
    });
  }

  const newContent = content !== undefined ? content.trim() : existingNote.content;
  let newTitle = title !== undefined ? title.trim() : existingNote.title;

  let newSeconds = existingNote.timestamp_seconds;
  if (timestamp_seconds !== undefined) {
    if (timestamp_seconds === null || timestamp_seconds === '') {
      newSeconds = null;
    } else {
      const num = Number(timestamp_seconds);
      if (!isNaN(num) && num >= 0) {
        newSeconds = Math.round(num);
      }
    }
  }

  if (!newTitle) {
    newTitle = newSeconds !== null 
      ? `Note @ ${formatTimestamp(newSeconds)}`
      : 'Untitled Note';
  }

  db.prepare(`
    UPDATE student_notes 
    SET title = ?, content = ?, timestamp_seconds = ?, updated_at = datetime('now')
    WHERE id = ? AND student_id = ?
  `).run(newTitle, newContent, newSeconds, noteId, studentId);

  const updatedNote = db.prepare(`
    SELECT n.*, v.title AS video_title, c.title AS course_title
    FROM student_notes n
    JOIN videos v ON n.video_id = v.id
    JOIN courses c ON n.course_id = c.id
    WHERE n.id = ?
  `).get(noteId);

  res.json({
    success: true,
    message: 'Note updated successfully.',
    note: updatedNote
  });
}

/**
 * DELETE /api/student/notes/:noteId
 * Deletes a note belonging to the authenticated student.
 */
export function deleteNote(req, res) {
  const studentId = req.user.id;
  const noteId = Number(req.params.noteId);

  if (!noteId || isNaN(noteId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid note ID provided.'
    });
  }

  const existingNote = db.prepare('SELECT * FROM student_notes WHERE id = ?').get(noteId);

  if (!existingNote) {
    return res.status(404).json({
      success: false,
      error: 'Note not found.'
    });
  }

  // Enforce strict ownership
  if (existingNote.student_id !== studentId) {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'note',
      resourceId: noteId,
      req,
      status: 'DENIED',
      details: 'Attempted to delete another student note'
    });
    return res.status(403).json({
      success: false,
      error: 'You do not have permission to delete this note.'
    });
  }

  db.prepare('DELETE FROM student_notes WHERE id = ? AND student_id = ?').run(noteId, studentId);

  res.json({
    success: true,
    message: 'Note deleted successfully.'
  });
}

/**
 * GET /api/student/notes/export
 * Exports all notes or filtered notes for the authenticated student as TXT or Markdown.
 */
export function exportStudentNotes(req, res) {
  const studentId = req.user.id;
  const format = (req.query.format || 'txt').toLowerCase();
  const courseId = req.query.course_id ? Number(req.query.course_id) : null;
  const videoId = req.query.video_id ? Number(req.query.video_id) : null;

  let query = `
    SELECT n.*, v.title AS video_title, c.title AS course_title
    FROM student_notes n
    JOIN videos v ON n.video_id = v.id
    JOIN courses c ON n.course_id = c.id
    WHERE n.student_id = ?
  `;
  const params = [studentId];

  if (courseId && !isNaN(courseId)) {
    query += ` AND n.course_id = ?`;
    params.push(courseId);
  }
  if (videoId && !isNaN(videoId)) {
    query += ` AND n.video_id = ?`;
    params.push(videoId);
  }

  query += ` ORDER BY c.title ASC, v.order_index ASC, n.timestamp_seconds ASC, n.created_at ASC`;
  const notes = db.prepare(query).all(...params);

  const student = db.prepare('SELECT name, email FROM users WHERE id = ?').get(studentId);
  const studentName = student?.name || 'PASCONX Student';
  const timestamp = new Date().toLocaleString();

  if (format === 'md') {
    let md = `# PASCONX Video Portal - Student Notes\n\n`;
    md += `**Student:** ${studentName} (${student?.email || ''})\n`;
    md += `**Exported On:** ${timestamp}\n`;
    md += `**Total Notes:** ${notes.length}\n\n---\n\n`;

    let currentCourse = '';
    let currentVideo = '';

    for (const note of notes) {
      if (note.course_title !== currentCourse) {
        currentCourse = note.course_title;
        md += `## Course: ${currentCourse}\n\n`;
      }
      if (note.video_title !== currentVideo) {
        currentVideo = note.video_title;
        md += `### Video: ${currentVideo}\n\n`;
      }

      const timeStr = note.timestamp_seconds !== null ? `⏱ [${formatTimestamp(note.timestamp_seconds)}] ` : '';
      md += `#### ${timeStr}${note.title}\n`;
      md += `*Created: ${new Date(note.created_at).toLocaleDateString()}*\n\n`;
      md += `${note.content}\n\n---\n\n`;
    }

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="PASCONX_Student_Notes.md"');
    return res.send(md);
  }

  // Default TXT format
  let txt = `====================================================\n`;
  txt += `   PASCONX VIDEO PORTAL - STUDENT NOTES\n`;
  txt += `   Student:     ${studentName} (${student?.email || ''})\n`;
  txt += `   Exported:    ${timestamp}\n`;
  txt += `   Total Notes: ${notes.length}\n`;
  txt += `====================================================\n\n`;

  let currentCourse = '';
  let currentVideo = '';

  for (const note of notes) {
    if (note.course_title !== currentCourse) {
      currentCourse = note.course_title;
      txt += `\n####################################################\n`;
      txt += `COURSE: ${currentCourse}\n`;
      txt += `####################################################\n\n`;
    }
    if (note.video_title !== currentVideo) {
      currentVideo = note.video_title;
      txt += `----------------------------------------------------\n`;
      txt += `Video: ${currentVideo}\n`;
      txt += `----------------------------------------------------\n`;
    }

    const timeStr = note.timestamp_seconds !== null ? `⏱ [${formatTimestamp(note.timestamp_seconds)}] ` : '';
    txt += `\n* ${timeStr}${note.title}\n`;
    txt += `  Date: ${new Date(note.created_at).toLocaleDateString()}\n`;
    txt += `  Notes:\n  ${note.content.replace(/\n/g, '\n  ')}\n\n`;
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="PASCONX_Student_Notes.txt"');
  return res.send(txt);
}
