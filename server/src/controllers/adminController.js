import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { getVideoProvider } from '../providers/index.js';
import { logSecurityEvent } from '../utils/auditLogger.js';

// ==================== DASHBOARD STATS ====================

export function getAdminStats(req, res, next) {
  try {
    const now = new Date().toISOString();

    const studentsCount = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'STUDENT'`).get().count;
    const coursesCount = db.prepare(`SELECT COUNT(*) AS count FROM courses WHERE status = 'ACTIVE'`).get().count;
    const videosCount = db.prepare(`SELECT COUNT(*) AS count FROM videos WHERE status = 'ACTIVE'`).get().count;
    const activeEnrollmentsCount = db.prepare(`
      SELECT COUNT(*) AS count FROM enrollments 
      WHERE status = 'ACTIVE' AND access_expiry >= ? AND access_start <= ?
    `).get(now, now).count;

    const recentEnrollments = db.prepare(`
      SELECT 
        e.id,
        u.name AS student_name,
        u.email AS student_email,
        c.title AS course_title,
        e.access_start,
        e.access_expiry,
        e.status,
        e.created_at
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      JOIN courses c ON e.course_id = c.id
      ORDER BY e.created_at DESC
      LIMIT 5
    `).all();

    return res.json({
      success: true,
      stats: {
        students: studentsCount,
        courses: coursesCount,
        videos: videosCount,
        activeEnrollments: activeEnrollmentsCount
      },
      recentEnrollments
    });
  } catch (error) {
    next(error);
  }
}

// ==================== STUDENT MANAGEMENT ====================

export function getStudents(req, res, next) {
  try {
    const students = db.prepare(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.status,
        u.created_at,
        (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = u.id AND e.status = 'ACTIVE') AS active_courses_count,
        (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = u.id) AS total_courses_count
      FROM users u
      WHERE u.role = 'STUDENT'
      ORDER BY u.created_at DESC
    `).all();

    return res.json({
      success: true,
      students
    });
  } catch (error) {
    next(error);
  }
}

export async function createStudent(req, res, next) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and temporary password are required.'
      });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email.trim());
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'A user with this email address already exists.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const stmt = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, status)
      VALUES (?, ?, ?, 'STUDENT', 'ACTIVE')
    `);

    const result = stmt.run(name.trim(), email.trim(), passwordHash);

    const created = db.prepare('SELECT id, name, email, role, status, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    return res.status(201).json({
      success: true,
      message: 'Student created successfully.',
      student: created
    });
  } catch (error) {
    next(error);
  }
}

export function updateStudent(req, res, next) {
  try {
    const studentId = Number(req.params.id);
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required.'
      });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id != ?').get(email.trim(), studentId);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Email is already used by another account.'
      });
    }

    const stmt = db.prepare(`
      UPDATE users SET name = ?, email = ?, updated_at = datetime('now')
      WHERE id = ? AND role = 'STUDENT'
    `);
    const result = stmt.run(name.trim(), email.trim(), studentId);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Student not found.'
      });
    }

    const updated = db.prepare('SELECT id, name, email, role, status, created_at FROM users WHERE id = ?').get(studentId);

    return res.json({
      success: true,
      message: 'Student updated successfully.',
      student: updated
    });
  } catch (error) {
    next(error);
  }
}

export function updateStudentStatus(req, res, next) {
  try {
    const studentId = Number(req.params.id);
    const { status } = req.body;

    if (!['ACTIVE', 'DISABLED'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be ACTIVE or DISABLED.'
      });
    }

    const stmt = db.prepare(`
      UPDATE users SET status = ?, updated_at = datetime('now')
      WHERE id = ? AND role = 'STUDENT'
    `);
    const result = stmt.run(status, studentId);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Student not found.'
      });
    }

    return res.json({
      success: true,
      message: `Student account has been ${status === 'ACTIVE' ? 'enabled' : 'disabled'}.`,
      status
    });
  } catch (error) {
    next(error);
  }
}

export async function resetStudentPassword(req, res, next) {
  try {
    const studentId = Number(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long.'
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const stmt = db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = datetime('now')
      WHERE id = ? AND role = 'STUDENT'
    `);
    const result = stmt.run(passwordHash, studentId);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Student not found.'
      });
    }

    return res.json({
      success: true,
      message: 'Student password has been reset successfully.'
    });
  } catch (error) {
    next(error);
  }
}

// ==================== COURSE MANAGEMENT ====================

export function getCourses(req, res, next) {
  try {
    const courses = db.prepare(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM videos v WHERE v.course_id = c.id) AS total_videos,
        (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'ACTIVE') AS active_enrollments
      FROM courses c
      ORDER BY c.created_at DESC
    `).all();

    return res.json({
      success: true,
      courses
    });
  } catch (error) {
    next(error);
  }
}

export function createCourse(req, res, next) {
  try {
    const { title, description, thumbnail_url } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Course title is required.'
      });
    }

    const stmt = db.prepare(`
      INSERT INTO courses (title, description, thumbnail_url, status)
      VALUES (?, ?, ?, 'ACTIVE')
    `);
    const result = stmt.run(
      title.trim(),
      description ? description.trim() : '',
      thumbnail_url ? thumbnail_url.trim() : null
    );

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(result.lastInsertRowid);

    return res.status(201).json({
      success: true,
      message: 'Course created successfully.',
      course
    });
  } catch (error) {
    next(error);
  }
}

export function updateCourse(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const { title, description, thumbnail_url, status } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Course title is required.'
      });
    }

    const courseStatus = status && ['ACTIVE', 'ARCHIVED'].includes(status) ? status : 'ACTIVE';

    const stmt = db.prepare(`
      UPDATE courses 
      SET title = ?, description = ?, thumbnail_url = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    const result = stmt.run(
      title.trim(),
      description ? description.trim() : '',
      thumbnail_url ? thumbnail_url.trim() : null,
      courseStatus,
      courseId
    );

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Course not found.'
      });
    }

    const updated = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);

    return res.json({
      success: true,
      message: 'Course updated successfully.',
      course: updated
    });
  } catch (error) {
    next(error);
  }
}

export function deleteCourse(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const stmt = db.prepare('DELETE FROM courses WHERE id = ?');
    const result = stmt.run(courseId);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Course not found.'
      });
    }

    return res.json({
      success: true,
      message: 'Course deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
}

// ==================== VIDEO MANAGEMENT ====================

export function getVideos(req, res, next) {
  try {
    const { courseId } = req.query;

    let query = `
      SELECT 
        v.*,
        c.title AS course_title
      FROM videos v
      JOIN courses c ON v.course_id = c.id
    `;
    const params = [];

    if (courseId) {
      query += ` WHERE v.course_id = ?`;
      params.push(Number(courseId));
    }

    query += ` ORDER BY v.course_id ASC, v.order_index ASC, v.id ASC`;

    const videos = db.prepare(query).all(...params);

    return res.json({
      success: true,
      videos
    });
  } catch (error) {
    next(error);
  }
}

export function createVideo(req, res, next) {
  try {
    const {
      title,
      description,
      course_id,
      provider = 'youtube',
      privacy_type = 'youtube_unlisted',
      youtube_video_id,
      duration_seconds = 0,
      order_index = 0,
      status = 'ACTIVE'
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Video title is required.' });
    }
    if (!course_id) {
      return res.status(400).json({ success: false, error: 'Course ID is required.' });
    }
    if (!youtube_video_id || !youtube_video_id.trim()) {
      return res.status(400).json({ success: false, error: 'YouTube Video ID is required.' });
    }

    // Validate YouTube Video ID using provider
    const ytProvider = getVideoProvider('youtube');
    const cleanVideoId = ytProvider.extractVideoId(youtube_video_id);

    if (!cleanVideoId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid YouTube Video ID format. Please provide an 11-character video ID or valid YouTube URL.'
      });
    }

    // Check course exists
    const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(Number(course_id));
    if (!course) {
      return res.status(404).json({ success: false, error: 'Selected course does not exist.' });
    }

    const stmt = db.prepare(`
      INSERT INTO videos (
        course_id, title, description, provider, privacy_type, external_video_id, duration_seconds, order_index, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      Number(course_id),
      title.trim(),
      description ? description.trim() : '',
      provider,
      privacy_type,
      cleanVideoId,
      parseInt(duration_seconds, 10) || 0,
      parseInt(order_index, 10) || 0,
      status
    );

    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(result.lastInsertRowid);

    const warning = privacy_type === 'youtube_private'
      ? 'Private YouTube videos require YouTube viewer authorization. For reliable student-specific access control, use YouTube Unlisted for the MVP or integrate VdoCipher later.'
      : null;

    return res.status(201).json({
      success: true,
      message: 'Video added successfully.',
      warning,
      video
    });
  } catch (error) {
    next(error);
  }
}

export function updateVideo(req, res, next) {
  try {
    const videoId = Number(req.params.id);
    const {
      title,
      description,
      course_id,
      provider = 'youtube',
      privacy_type = 'youtube_unlisted',
      youtube_video_id,
      duration_seconds = 0,
      order_index = 0,
      status = 'ACTIVE'
    } = req.body;

    const existing = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Video not found.' });
    }

    const ytProvider = getVideoProvider('youtube');
    const cleanVideoId = youtube_video_id ? ytProvider.extractVideoId(youtube_video_id) : existing.external_video_id;

    if (!cleanVideoId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid YouTube Video ID format.'
      });
    }

    const stmt = db.prepare(`
      UPDATE videos SET
        title = ?,
        description = ?,
        course_id = ?,
        provider = ?,
        privacy_type = ?,
        external_video_id = ?,
        duration_seconds = ?,
        order_index = ?,
        status = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(
      title ? title.trim() : existing.title,
      description !== undefined ? description.trim() : existing.description,
      course_id ? Number(course_id) : existing.course_id,
      provider || existing.provider,
      privacy_type || existing.privacy_type,
      cleanVideoId,
      duration_seconds !== undefined ? parseInt(duration_seconds, 10) : existing.duration_seconds,
      order_index !== undefined ? parseInt(order_index, 10) : existing.order_index,
      status || existing.status,
      videoId
    );

    const updated = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);

    const warning = updated.privacy_type === 'youtube_private'
      ? 'Private YouTube videos require YouTube viewer authorization. For reliable student-specific access control, use YouTube Unlisted for the MVP or integrate VdoCipher later.'
      : null;

    return res.json({
      success: true,
      message: 'Video updated successfully.',
      warning,
      video: updated
    });
  } catch (error) {
    next(error);
  }
}

export function deleteVideo(req, res, next) {
  try {
    const videoId = Number(req.params.id);
    const stmt = db.prepare('DELETE FROM videos WHERE id = ?');
    const result = stmt.run(videoId);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Video not found.' });
    }

    return res.json({
      success: true,
      message: 'Video deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
}

// ==================== ENROLLMENT MANAGEMENT ====================

export function getEnrollments(req, res, next) {
  try {
    const now = new Date().toISOString();

    const enrollments = db.prepare(`
      SELECT 
        e.*,
        u.name AS student_name,
        u.email AS student_email,
        u.status AS student_status,
        c.title AS course_title
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      JOIN courses c ON e.course_id = c.id
      ORDER BY e.created_at DESC
    `).all();

    const formatted = enrollments.map(en => ({
      ...en,
      is_expired: now > en.access_expiry,
      is_future: now < en.access_start,
      is_active: en.status === 'ACTIVE' && now >= en.access_start && now <= en.access_expiry
    }));

    return res.json({
      success: true,
      enrollments: formatted
    });
  } catch (error) {
    next(error);
  }
}

export function createEnrollment(req, res, next) {
  try {
    const { student_id, course_id, access_start, access_expiry, status = 'ACTIVE' } = req.body;

    if (!student_id || !course_id || !access_start || !access_expiry) {
      return res.status(400).json({
        success: false,
        error: 'Student, course, access start date, and access expiry date are required.'
      });
    }

    const startDate = new Date(access_start);
    const expiryDate = new Date(access_expiry);

    if (isNaN(startDate.getTime()) || isNaN(expiryDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid start date or expiry date format.'
      });
    }

    if (expiryDate <= startDate) {
      return res.status(400).json({
        success: false,
        error: 'Access expiry date must be strictly after the access start date.'
      });
    }

    // Check student and course exist
    const student = db.prepare(`SELECT id, name FROM users WHERE id = ? AND role = 'STUDENT'`).get(Number(student_id));
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student does not exist.' });
    }

    const course = db.prepare('SELECT id, title FROM courses WHERE id = ?').get(Number(course_id));
    if (!course) {
      return res.status(404).json({ success: false, error: 'Course does not exist.' });
    }

    // Upsert or insert enrollment
    const stmt = db.prepare(`
      INSERT INTO enrollments (student_id, course_id, access_start, access_expiry, status)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(student_id, course_id) DO UPDATE SET
        access_start = excluded.access_start,
        access_expiry = excluded.access_expiry,
        status = excluded.status,
        updated_at = datetime('now')
    `);

    stmt.run(
      Number(student_id),
      Number(course_id),
      startDate.toISOString(),
      expiryDate.toISOString(),
      status
    );

    const enrollment = db.prepare(`
      SELECT e.*, u.name AS student_name, u.email AS student_email, c.title AS course_title
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      JOIN courses c ON e.course_id = c.id
      WHERE e.student_id = ? AND e.course_id = ?
    `).get(Number(student_id), Number(course_id));

    return res.status(201).json({
      success: true,
      message: 'Student enrolled in course successfully.',
      enrollment
    });
  } catch (error) {
    next(error);
  }
}

export function updateEnrollment(req, res, next) {
  try {
    const enrollmentId = Number(req.params.id);
    const { access_start, access_expiry, status } = req.body;

    const existing = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(enrollmentId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Enrollment record not found.' });
    }

    let newStart = existing.access_start;
    let newExpiry = existing.access_expiry;

    if (access_start) {
      const parsedStart = new Date(access_start);
      if (isNaN(parsedStart.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid access start date.' });
      }
      newStart = parsedStart.toISOString();
    }

    if (access_expiry) {
      const parsedExpiry = new Date(access_expiry);
      if (isNaN(parsedExpiry.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid access expiry date.' });
      }
      newExpiry = parsedExpiry.toISOString();
    }

    if (new Date(newExpiry) <= new Date(newStart)) {
      return res.status(400).json({
        success: false,
        error: 'Access expiry date must be strictly after the access start date.'
      });
    }

    const newStatus = status && ['ACTIVE', 'INACTIVE'].includes(status) ? status : existing.status;

    const stmt = db.prepare(`
      UPDATE enrollments SET
        access_start = ?,
        access_expiry = ?,
        status = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(newStart, newExpiry, newStatus, enrollmentId);

    const updated = db.prepare(`
      SELECT e.*, u.name AS student_name, u.email AS student_email, c.title AS course_title
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      JOIN courses c ON e.course_id = c.id
      WHERE e.id = ?
    `).get(enrollmentId);

    return res.json({
      success: true,
      message: 'Enrollment updated successfully.',
      enrollment: updated
    });
  } catch (error) {
    next(error);
  }
}

export function deleteEnrollment(req, res, next) {
  try {
    const enrollmentId = Number(req.params.id);
    const existing = db.prepare('SELECT student_id, course_id FROM enrollments WHERE id = ?').get(enrollmentId);

    const stmt = db.prepare('DELETE FROM enrollments WHERE id = ?');
    const result = stmt.run(enrollmentId);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Enrollment record not found.' });
    }

    if (existing) {
      logSecurityEvent({
        userId: existing.student_id,
        eventType: 'ACCESS_REVOKED',
        resourceType: 'course',
        resourceId: existing.course_id,
        req,
        status: 'SUCCESS',
        details: { revokedBy: req.user.id }
      });
    }

    return res.json({
      success: true,
      message: 'Course access revoked successfully.'
    });
  } catch (error) {
    next(error);
  }
}

// ==================== AUDIT LOGS & ACCESS MONITORING ====================

export function getAuditLogs(req, res, next) {
  try {
    const { eventType, userId, status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        l.id,
        l.user_id,
        u.name AS user_name,
        u.email AS user_email,
        l.event_type,
        l.resource_type,
        l.resource_id,
        l.ip_address,
        l.user_agent,
        l.status,
        l.details,
        l.created_at
      FROM security_audit_logs l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (eventType) {
      query += ` AND l.event_type = ?`;
      params.push(eventType);
    }

    if (userId) {
      query += ` AND l.user_id = ?`;
      params.push(Number(userId));
    }

    if (status) {
      query += ` AND l.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
    params.push(Math.min(200, parseInt(limit, 10) || 50));
    params.push(parseInt(offset, 10) || 0);

    const logs = db.prepare(query).all(...params);

    const totalCount = db.prepare(`SELECT COUNT(*) as count FROM security_audit_logs`).get().count;

    return res.json({
      success: true,
      total: totalCount,
      logs
    });
  } catch (error) {
    next(error);
  }
}

// ==================== COURSE DOCUMENT MANAGEMENT ====================

export function getAdminCourseDocuments(req, res, next) {
  try {
    const courseId = Number(req.params.courseId);
    const documents = db.prepare(`
      SELECT * FROM course_documents WHERE course_id = ? ORDER BY order_index ASC, id ASC
    `).all(courseId);

    return res.json({
      success: true,
      documents
    });
  } catch (error) {
    next(error);
  }
}

export function createAdminCourseDocument(req, res, next) {
  try {
    const courseId = Number(req.params.courseId);
    const { title, description, file_path, file_type = 'application/pdf', file_size_bytes = 0, order_index = 0 } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Document title is required.' });
    }

    const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(courseId);
    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found.' });
    }

    const stmt = db.prepare(`
      INSERT INTO course_documents (course_id, title, description, file_path, file_type, file_size_bytes, order_index, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `);

    const result = stmt.run(
      courseId,
      title.trim(),
      description ? description.trim() : '',
      file_path ? file_path.trim() : `course_${courseId}_doc_${Date.now()}`,
      file_type,
      parseInt(file_size_bytes, 10) || 0,
      parseInt(order_index, 10) || 0
    );

    const document = db.prepare('SELECT * FROM course_documents WHERE id = ?').get(result.lastInsertRowid);

    return res.status(201).json({
      success: true,
      message: 'Document added to course successfully.',
      document
    });
  } catch (error) {
    next(error);
  }
}

export function deleteAdminCourseDocument(req, res, next) {
  try {
    const docId = Number(req.params.docId);
    const stmt = db.prepare('DELETE FROM course_documents WHERE id = ?');
    const result = stmt.run(docId);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }

    return res.json({
      success: true,
      message: 'Document deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
}

