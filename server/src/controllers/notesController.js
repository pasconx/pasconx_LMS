import { db } from '../config/database.js';
import { supabase } from '../config/supabase.js';
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
 * ==========================================
 * SQLITE IMPLEMENTATIONS (ROLLBACK PATH)
 * ==========================================
 */

function getVideoNotesSqlite(req, res) {
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

function getAllStudentNotesSqlite(req, res) {
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

function createNoteSqlite(req, res) {
  const studentId = req.user.id;
  const videoId = Number(req.params.videoId);

  if (!videoId || isNaN(videoId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid video ID provided.'
    });
  }

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

function updateNoteSqlite(req, res) {
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

function deleteNoteSqlite(req, res) {
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

function exportStudentNotesSqlite(req, res) {
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

  return renderNotesExport(res, notes, studentName, student?.email || '', timestamp, format);
}

/**
 * ==========================================
 * SUPABASE IMPLEMENTATIONS (TARGET RUNTIME)
 * ==========================================
 */

async function getVideoNotesSupabase(req, res) {
  try {
    const studentId = req.user.id;
    const videoId = Number(req.params.videoId);

    if (!videoId || isNaN(videoId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid video ID provided.'
      });
    }

    const { data: notes, error } = await supabase
      .from('student_notes')
      .select('*, videos!inner(title), courses!inner(title)')
      .eq('student_id', studentId)
      .eq('video_id', videoId)
      .order('timestamp_seconds', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    const flattened = (notes || []).map(n => ({
      id: n.id,
      student_id: n.student_id,
      course_id: n.course_id,
      video_id: n.video_id,
      title: n.title,
      content: n.content,
      timestamp_seconds: n.timestamp_seconds,
      created_at: n.created_at,
      updated_at: n.updated_at,
      video_title: n.videos?.title,
      course_title: n.courses?.title
    }));

    return res.json({
      success: true,
      count: flattened.length,
      notes: flattened
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function getAllStudentNotesSupabase(req, res) {
  try {
    const studentId = req.user.id;
    const search = (req.query.search || '').trim();
    const courseId = req.query.course_id ? Number(req.query.course_id) : null;
    const videoId = req.query.video_id ? Number(req.query.video_id) : null;

    let query = supabase
      .from('student_notes')
      .select('*, videos!inner(title), courses!inner(title)')
      .eq('student_id', studentId);

    if (courseId && !isNaN(courseId)) {
      query = query.eq('course_id', courseId);
    }
    if (videoId && !isNaN(videoId)) {
      query = query.eq('video_id', videoId);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    }

    query = query.order('updated_at', { ascending: false });

    const { data: notes, error } = await query;
    if (error) throw error;

    // Fetch student's enrollments to determine video access status
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('course_id, status, access_start, access_expiry')
      .eq('student_id', studentId);

    const enrollMap = {};
    (enrollments || []).forEach(e => {
      enrollMap[e.course_id] = e;
    });

    const now = new Date().toISOString();

    const flattened = (notes || []).map(n => {
      const e = enrollMap[n.course_id];
      const canAccess = (e && e.status === 'ACTIVE' && now >= e.access_start && now <= e.access_expiry) ? 1 : 0;
      return {
        id: n.id,
        student_id: n.student_id,
        course_id: n.course_id,
        video_id: n.video_id,
        title: n.title,
        content: n.content,
        timestamp_seconds: n.timestamp_seconds,
        created_at: n.created_at,
        updated_at: n.updated_at,
        video_title: n.videos?.title,
        course_title: n.courses?.title,
        enrollment_status: e ? e.status : null,
        access_start: e ? e.access_start : null,
        access_expiry: e ? e.access_expiry : null,
        can_access_video: canAccess
      };
    });

    return res.json({
      success: true,
      count: flattened.length,
      notes: flattened
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function createNoteSupabase(req, res) {
  try {
    const studentId = req.user.id;
    const videoId = Number(req.params.videoId);

    if (!videoId || isNaN(videoId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid video ID provided.'
      });
    }

    // Verify video exists & is active
    const { data: video, error: vErr } = await supabase
      .from('videos')
      .select('*, courses!inner(status, title)')
      .eq('id', videoId)
      .maybeSingle();

    if (vErr || !video || video.status !== 'ACTIVE' || video.courses?.status !== 'ACTIVE') {
      return res.status(404).json({
        success: false,
        error: 'Video is currently unavailable.'
      });
    }

    // Check enrollment
    const { data: enrollment, error: eErr } = await supabase
      .from('enrollments')
      .select('*')
      .eq('student_id', studentId)
      .eq('course_id', video.course_id)
      .maybeSingle();

    if (eErr || !enrollment || enrollment.status !== 'ACTIVE') {
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

    const { data: inserted, error: insErr } = await supabase
      .from('student_notes')
      .insert({
        student_id: studentId,
        course_id: video.course_id,
        video_id: videoId,
        title,
        content,
        timestamp_seconds: parsedSeconds
      })
      .select('*, videos!inner(title), courses!inner(title)')
      .single();

    if (insErr) throw insErr;

    const newNote = {
      id: inserted.id,
      student_id: inserted.student_id,
      course_id: inserted.course_id,
      video_id: inserted.video_id,
      title: inserted.title,
      content: inserted.content,
      timestamp_seconds: inserted.timestamp_seconds,
      created_at: inserted.created_at,
      updated_at: inserted.updated_at,
      video_title: inserted.videos?.title,
      course_title: inserted.courses?.title
    };

    return res.status(201).json({
      success: true,
      message: 'Note saved successfully.',
      note: newNote
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function updateNoteSupabase(req, res) {
  try {
    const studentId = req.user.id;
    const noteId = Number(req.params.noteId);

    if (!noteId || isNaN(noteId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid note ID provided.'
      });
    }

    const { data: existingNote, error: fetchErr } = await supabase
      .from('student_notes')
      .select('*')
      .eq('id', noteId)
      .maybeSingle();

    if (fetchErr || !existingNote) {
      return res.status(404).json({
        success: false,
        error: 'Note not found.'
      });
    }

    // Strict student ownership check
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

    const { data: updated, error: updateErr } = await supabase
      .from('student_notes')
      .update({
        title: newTitle,
        content: newContent,
        timestamp_seconds: newSeconds,
        updated_at: new Date().toISOString()
      })
      .eq('id', noteId)
      .eq('student_id', studentId)
      .select('*, videos!inner(title), courses!inner(title)')
      .single();

    if (updateErr) throw updateErr;

    const updatedNote = {
      id: updated.id,
      student_id: updated.student_id,
      course_id: updated.course_id,
      video_id: updated.video_id,
      title: updated.title,
      content: updated.content,
      timestamp_seconds: updated.timestamp_seconds,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      video_title: updated.videos?.title,
      course_title: updated.courses?.title
    };

    return res.json({
      success: true,
      message: 'Note updated successfully.',
      note: updatedNote
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function deleteNoteSupabase(req, res) {
  try {
    const studentId = req.user.id;
    const noteId = Number(req.params.noteId);

    if (!noteId || isNaN(noteId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid note ID provided.'
      });
    }

    const { data: existingNote, error: fetchErr } = await supabase
      .from('student_notes')
      .select('*')
      .eq('id', noteId)
      .maybeSingle();

    if (fetchErr || !existingNote) {
      return res.status(404).json({
        success: false,
        error: 'Note not found.'
      });
    }

    // Strict student ownership check
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

    const { error: delErr } = await supabase
      .from('student_notes')
      .delete()
      .eq('id', noteId)
      .eq('student_id', studentId);

    if (delErr) throw delErr;

    return res.json({
      success: true,
      message: 'Note deleted successfully.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function exportStudentNotesSupabase(req, res) {
  try {
    const studentId = req.user.id;
    const format = (req.query.format || 'txt').toLowerCase();
    const courseId = req.query.course_id ? Number(req.query.course_id) : null;
    const videoId = req.query.video_id ? Number(req.query.video_id) : null;

    let query = supabase
      .from('student_notes')
      .select('*, videos!inner(title, order_index), courses!inner(title)')
      .eq('student_id', studentId);

    if (courseId && !isNaN(courseId)) query = query.eq('course_id', courseId);
    if (videoId && !isNaN(videoId)) query = query.eq('video_id', videoId);

    query = query.order('created_at', { ascending: true });

    const { data: notes, error } = await query;
    if (error) throw error;

    const flattened = (notes || []).map(n => ({
      ...n,
      video_title: n.videos?.title,
      course_title: n.courses?.title,
      order_index: n.videos?.order_index || 0
    })).sort((a, b) => {
      if (a.course_title !== b.course_title) return a.course_title.localeCompare(b.course_title);
      if (a.order_index !== b.order_index) return a.order_index - b.order_index;
      return (a.timestamp_seconds || 0) - (b.timestamp_seconds || 0);
    });

    const studentName = req.user.name || 'PASCONX Student';
    const timestamp = new Date().toLocaleString();

    return renderNotesExport(res, flattened, studentName, req.user.email || '', timestamp, format);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

function renderNotesExport(res, notes, studentName, studentEmail, timestamp, format) {
  if (format === 'md') {
    let md = `# PASCONX Video Portal - Student Notes\n\n`;
    md += `**Student:** ${studentName} (${studentEmail})\n`;
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
  txt += `   Student:     ${studentName} (${studentEmail})\n`;
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

/**
 * ==========================================
 * EXPORTED NOTES CONTROLLER DISPATCHERS
 * ==========================================
 */

export function getVideoNotes(req, res) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getVideoNotesSupabase(req, res);
  }
  return getVideoNotesSqlite(req, res);
}

export function getAllStudentNotes(req, res) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getAllStudentNotesSupabase(req, res);
  }
  return getAllStudentNotesSqlite(req, res);
}

export function createNote(req, res) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return createNoteSupabase(req, res);
  }
  return createNoteSqlite(req, res);
}

export function updateNote(req, res) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return updateNoteSupabase(req, res);
  }
  return updateNoteSqlite(req, res);
}

export function deleteNote(req, res) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return deleteNoteSupabase(req, res);
  }
  return deleteNoteSqlite(req, res);
}

export function exportStudentNotes(req, res) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return exportStudentNotesSupabase(req, res);
  }
  return exportStudentNotesSqlite(req, res);
}
