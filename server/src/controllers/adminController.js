import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { supabase, getScopedSupabaseClient } from '../config/supabase.js';
import { getVideoProvider } from '../providers/index.js';
import { logSecurityEvent } from '../utils/auditLogger.js';
import { invalidateUserSessions } from '../middleware/auth.js';

// ==============================================================================
// 1. SQLITE IMPLEMENTATIONS (BASELINE & INSTANT ROLLBACK SAFETY NET)
// ==============================================================================

function getAdminStatsSqlite(req, res, next) {
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

function getStudentsSqlite(req, res, next) {
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

async function createStudentSqlite(req, res, next) {
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

function updateStudentSqlite(req, res, next) {
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

function updateStudentStatusSqlite(req, res, next) {
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

async function resetStudentPasswordSqlite(req, res, next) {
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

function getCoursesSqlite(req, res, next) {
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

function normalizeThumbnailUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Automatically convert Google Drive share links to direct Google User Content CDN URLs
  const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i)
    || trimmed.match(/drive\.google\.com\/(?:uc|open)\?(?:.*&)?id=([a-zA-Z0-9_-]+)/i);

  if (driveMatch && driveMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  }

  return trimmed;
}

function createCourseSqlite(req, res, next) {
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
      normalizeThumbnailUrl(thumbnail_url)
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

function updateCourseSqlite(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const { title, description, thumbnail_url, status } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Course title is required.'
      });
    }

    const existing = db.prepare('SELECT id, status FROM courses WHERE id = ?').get(courseId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Course not found.'
      });
    }

    const courseStatus = status && ['ACTIVE', 'ARCHIVED'].includes(status) ? status : existing.status;

    const stmt = db.prepare(`
      UPDATE courses 
      SET title = ?, description = ?, thumbnail_url = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(
      title.trim(),
      typeof description === 'string' ? description.trim() : '',
      normalizeThumbnailUrl(thumbnail_url),
      courseStatus,
      courseId
    );

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

function deleteCourseSqlite(req, res, next) {
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

function getVideosSqlite(req, res, next) {
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

function createVideoSqlite(req, res, next) {
  try {
    const {
      title,
      description,
      course_id,
      video_type = 'youtube',
      provider = 'youtube',
      privacy_type = 'youtube_unlisted',
      youtube_video_id,
      manifest_url,
      license_server_url,
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

    // Check course exists
    const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(Number(course_id));
    if (!course) {
      return res.status(404).json({ success: false, error: 'Selected course does not exist.' });
    }

    let cleanVideoId = '';
    let resolvedProvider = provider;
    let resolvedPrivacyType = privacy_type;

    if (video_type === 'widevine') {
      resolvedProvider = 'widevine';
      resolvedPrivacyType = 'widevine_drm';

      if (!manifest_url || !manifest_url.trim()) {
        return res.status(400).json({
          success: false,
          error: 'DASH Manifest URL (.mpd) is required for Widevine DRM videos.'
        });
      }

      const wvProvider = getVideoProvider('widevine');
      if (!wvProvider.validateManifest(manifest_url.trim())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid DASH manifest URL. Must be a valid URL pointing to a DASH manifest or .mpd resource.'
        });
      }

      cleanVideoId = (req.body.external_video_id || youtube_video_id || `wv-${Date.now()}`).trim();
    } else {
      // Default / YouTube validation
      if (!youtube_video_id || !youtube_video_id.trim()) {
        return res.status(400).json({ success: false, error: 'YouTube Video ID is required.' });
      }

      const ytProvider = getVideoProvider('youtube');
      cleanVideoId = ytProvider.extractVideoId(youtube_video_id);

      if (!cleanVideoId) {
        return res.status(400).json({
          success: false,
          error: 'Invalid YouTube Video ID format. Please provide an 11-character video ID or valid YouTube URL.'
        });
      }
    }

    const stmt = db.prepare(`
      INSERT INTO videos (
        course_id, title, description, video_type, provider, privacy_type, external_video_id, manifest_url, license_server_url, duration_seconds, order_index, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      Number(course_id),
      title.trim(),
      description ? description.trim() : '',
      video_type,
      resolvedProvider,
      resolvedPrivacyType,
      cleanVideoId,
      manifest_url ? manifest_url.trim() : null,
      license_server_url ? license_server_url.trim() : null,
      parseInt(duration_seconds, 10) || 0,
      parseInt(order_index, 10) || 0,
      status
    );

    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(result.lastInsertRowid);

    let warning = null;
    if (video_type === 'youtube' && privacy_type === 'youtube_private') {
      warning = 'Private YouTube videos require YouTube viewer authorization. For reliable student-specific access control, use YouTube Unlisted for the MVP or Widevine DRM.';
    }

    return res.status(201).json({
      success: true,
      message: `${video_type === 'widevine' ? 'Widevine DRM protected video' : 'YouTube video'} added successfully.`,
      warning,
      video
    });
  } catch (error) {
    next(error);
  }
}

function updateVideoSqlite(req, res, next) {
  try {
    const videoId = Number(req.params.id);
    const {
      title,
      description,
      course_id,
      video_type,
      provider,
      privacy_type,
      youtube_video_id,
      manifest_url,
      license_server_url,
      duration_seconds = 0,
      order_index = 0,
      status = 'ACTIVE'
    } = req.body;

    const existing = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Video not found.' });
    }

    const targetVideoType = video_type || existing.video_type || 'youtube';
    let cleanVideoId = existing.external_video_id;
    let resolvedProvider = provider || existing.provider;
    let resolvedPrivacyType = privacy_type || existing.privacy_type;

    if (targetVideoType === 'widevine') {
      resolvedProvider = 'widevine';
      resolvedPrivacyType = 'widevine_drm';

      const targetManifest = manifest_url !== undefined ? manifest_url : existing.manifest_url;
      if (!targetManifest || !targetManifest.trim()) {
        return res.status(400).json({
          success: false,
          error: 'DASH Manifest URL (.mpd) is required for Widevine DRM videos.'
        });
      }

      if (req.body.external_video_id) {
        cleanVideoId = req.body.external_video_id.trim();
      }
    } else {
      if (youtube_video_id) {
        const ytProvider = getVideoProvider('youtube');
        cleanVideoId = ytProvider.extractVideoId(youtube_video_id);
        if (!cleanVideoId) {
          return res.status(400).json({
            success: false,
            error: 'Invalid YouTube Video ID format.'
          });
        }
      }
    }

    const stmt = db.prepare(`
      UPDATE videos SET
        title = ?,
        description = ?,
        course_id = ?,
        video_type = ?,
        provider = ?,
        privacy_type = ?,
        external_video_id = ?,
        manifest_url = ?,
        license_server_url = ?,
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
      targetVideoType,
      resolvedProvider,
      resolvedPrivacyType,
      cleanVideoId,
      manifest_url !== undefined ? (manifest_url ? manifest_url.trim() : null) : existing.manifest_url,
      license_server_url !== undefined ? (license_server_url ? license_server_url.trim() : null) : existing.license_server_url,
      duration_seconds !== undefined ? parseInt(duration_seconds, 10) : existing.duration_seconds,
      order_index !== undefined ? parseInt(order_index, 10) : existing.order_index,
      status || existing.status,
      videoId
    );

    const updated = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);

    const warning = updated.privacy_type === 'youtube_private'
      ? 'Private YouTube videos require YouTube viewer authorization. For reliable student-specific access control, use YouTube Unlisted for the MVP or Widevine DRM.'
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

function deleteVideoSqlite(req, res, next) {
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

function getEnrollmentsSqlite(req, res, next) {
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

function createEnrollmentSqlite(req, res, next) {
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

function updateEnrollmentSqlite(req, res, next) {
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

function deleteEnrollmentSqlite(req, res, next) {
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

function getAuditLogsSqlite(req, res, next) {
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

function getAdminCourseDocumentsSqlite(req, res, next) {
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

function createAdminCourseDocumentSqlite(req, res, next) {
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

function deleteAdminCourseDocumentSqlite(req, res, next) {
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

// ==============================================================================
// 2. SUPABASE IMPLEMENTATIONS (TARGET RUNTIME)
// ==============================================================================

async function getAdminStatsSupabase(req, res, next) {
  try {
    const nowIso = new Date().toISOString();

    const [studentsRes, coursesRes, videosRes, enrollmentsRes, recentRes] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'STUDENT'),
      supabase.from('courses').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
      supabase.from('videos').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
      supabase.from('enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ACTIVE')
        .lte('access_start', nowIso)
        .gte('access_expiry', nowIso),
      supabase.from('enrollments')
        .select(`
          id,
          access_start,
          access_expiry,
          status,
          created_at,
          profiles!inner(name, email),
          courses!inner(title)
        `)
        .order('created_at', { ascending: false })
        .limit(5)
    ]);

    if (studentsRes.error) throw studentsRes.error;
    if (coursesRes.error) throw coursesRes.error;
    if (videosRes.error) throw videosRes.error;
    if (enrollmentsRes.error) throw enrollmentsRes.error;
    if (recentRes.error) throw recentRes.error;

    const recentEnrollments = (recentRes.data || []).map(e => ({
      id: e.id,
      student_name: e.profiles?.name || '',
      student_email: e.profiles?.email || '',
      course_title: e.courses?.title || '',
      access_start: e.access_start,
      access_expiry: e.access_expiry,
      status: e.status,
      created_at: e.created_at
    }));

    return res.json({
      success: true,
      stats: {
        students: studentsRes.count || 0,
        courses: coursesRes.count || 0,
        videos: videosRes.count || 0,
        activeEnrollments: enrollmentsRes.count || 0
      },
      recentEnrollments
    });
  } catch (error) {
    next(error);
  }
}

async function getStudentsSupabase(req, res, next) {
  try {
    const [studentsRes, enrollmentsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, name, email, status, created_at')
        .eq('role', 'STUDENT')
        .order('created_at', { ascending: false }),
      supabase
        .from('enrollments')
        .select('student_id, status')
    ]);

    if (studentsRes.error) throw studentsRes.error;
    if (enrollmentsRes.error) throw enrollmentsRes.error;

    const countMap = {};
    (enrollmentsRes.data || []).forEach(e => {
      if (!countMap[e.student_id]) {
        countMap[e.student_id] = { total: 0, active: 0 };
      }
      countMap[e.student_id].total += 1;
      if (e.status === 'ACTIVE') {
        countMap[e.student_id].active += 1;
      }
    });

    const students = (studentsRes.data || []).map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
      status: s.status,
      created_at: s.created_at,
      active_courses_count: countMap[s.id]?.active || 0,
      total_courses_count: countMap[s.id]?.total || 0
    }));

    return res.json({
      success: true,
      students
    });
  } catch (error) {
    next(error);
  }
}

async function createStudentSupabase(req, res, next) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and temporary password are required.'
      });
    }

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    // Check if user email already exists in profiles
    const { data: existing, error: existErr } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', trimmedEmail)
      .maybeSingle();

    if (existErr) throw existErr;
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'A user with this email address already exists.'
      });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: trimmedEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        name: trimmedName,
        role: 'STUDENT'
      }
    });

    if (authErr) {
      const msg = authErr.message || '';
      if (msg.toLowerCase().includes('already') || authErr.status === 422) {
        return res.status(409).json({
          success: false,
          error: 'A user with this email address already exists.'
        });
      }
      throw authErr;
    }

    // Ensure public.profiles record exists and is active
    const { data: createdProfile, error: profErr } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        name: trimmedName,
        email: trimmedEmail,
        role: 'STUDENT',
        status: 'ACTIVE'
      })
      .select('id, name, email, role, status, created_at')
      .single();

    if (profErr) throw profErr;

    logSecurityEvent({
      userId: authData.user.id,
      eventType: 'USER_CREATED',
      resourceType: 'user',
      resourceId: authData.user.id,
      req,
      status: 'SUCCESS',
      details: { role: 'STUDENT', email: trimmedEmail }
    });

    return res.status(201).json({
      success: true,
      message: 'Student created successfully.',
      student: createdProfile
    });
  } catch (error) {
    next(error);
  }
}

async function updateStudentSupabase(req, res, next) {
  try {
    const studentId = req.params.id; // String UUID
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required.'
      });
    }

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    // Check if target student exists with role STUDENT
    const { data: targetStudent, error: targetErr } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('id', studentId)
      .eq('role', 'STUDENT')
      .maybeSingle();

    if (targetErr) throw targetErr;
    if (!targetStudent) {
      return res.status(404).json({
        success: false,
        error: 'Student not found.'
      });
    }

    // Check if email already used by another account
    const { data: existing, error: existErr } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', trimmedEmail)
      .neq('id', studentId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Email is already used by another account.'
      });
    }

    // Update in Supabase Auth
    const { error: authUpdateErr } = await supabase.auth.admin.updateUserById(studentId, {
      email: trimmedEmail,
      user_metadata: { name: trimmedName }
    });

    if (authUpdateErr) {
      const msg = authUpdateErr.message || '';
      if (msg.toLowerCase().includes('already') || authUpdateErr.status === 422) {
        return res.status(409).json({
          success: false,
          error: 'Email is already used by another account.'
        });
      }
      throw authUpdateErr;
    }

    // Update in public.profiles using admin-scoped client
    const client = getScopedSupabaseClient(req);
    const { data: updated, error: profErr } = await client
      .from('profiles')
      .update({
        name: trimmedName,
        email: trimmedEmail,
        updated_at: new Date().toISOString()
      })
      .eq('id', studentId)
      .eq('role', 'STUDENT')
      .select('id, name, email, role, status, created_at')
      .single();

    if (profErr) throw profErr;

    return res.json({
      success: true,
      message: 'Student updated successfully.',
      student: updated
    });
  } catch (error) {
    next(error);
  }
}

async function updateStudentStatusSupabase(req, res, next) {
  try {
    const studentId = req.params.id; // String UUID
    const { status } = req.body;

    if (!['ACTIVE', 'DISABLED'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be ACTIVE or DISABLED.'
      });
    }

    // Update in public.profiles using admin-scoped client
    const client = getScopedSupabaseClient(req);
    const { data: updated, error: profErr } = await client
      .from('profiles')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', studentId)
      .eq('role', 'STUDENT')
      .select('id')
      .maybeSingle();

    if (profErr) throw profErr;
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Student not found.'
      });
    }

    // Reflect status in Supabase Auth (ban_duration: '876000h' for DISABLED, 'none' for ACTIVE)
    const banDuration = status === 'DISABLED' ? '876000h' : 'none';
    const { error: authErr } = await supabase.auth.admin.updateUserById(studentId, {
      ban_duration: banDuration
    });

    if (authErr) {
      console.warn(`Supabase Auth ban_duration update notice for ${studentId}:`, authErr.message);
    }

    if (status === 'DISABLED') {
      invalidateUserSessions(studentId);
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

async function resetStudentPasswordSupabase(req, res, next) {
  try {
    const studentId = req.params.id; // String UUID
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long.'
      });
    }

    // Verify student exists in profiles
    const { data: targetStudent, error: targetErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', studentId)
      .eq('role', 'STUDENT')
      .maybeSingle();

    if (targetErr) throw targetErr;
    if (!targetStudent) {
      return res.status(404).json({
        success: false,
        error: 'Student not found.'
      });
    }

    // Update password in Supabase Auth
    const { error: authErr } = await supabase.auth.admin.updateUserById(studentId, {
      password: newPassword
    });

    if (authErr) throw authErr;

    invalidateUserSessions(studentId);

    logSecurityEvent({
      userId: studentId,
      eventType: 'PASSWORD_RESET',
      resourceType: 'user',
      resourceId: studentId,
      req,
      status: 'SUCCESS',
      details: { resetBy: req.user.id }
    });

    return res.json({
      success: true,
      message: 'Student password has been reset successfully.'
    });
  } catch (error) {
    next(error);
  }
}

async function getCoursesSupabase(req, res, next) {
  try {
    const [coursesRes, videosRes, enrollmentsRes] = await Promise.all([
      supabase.from('courses').select('*').order('created_at', { ascending: false }),
      supabase.from('videos').select('course_id'),
      supabase.from('enrollments').select('course_id, status')
    ]);

    if (coursesRes.error) throw coursesRes.error;
    if (videosRes.error) throw videosRes.error;
    if (enrollmentsRes.error) throw enrollmentsRes.error;

    const videoMap = {};
    (videosRes.data || []).forEach(v => {
      videoMap[v.course_id] = (videoMap[v.course_id] || 0) + 1;
    });

    const enrollMap = {};
    (enrollmentsRes.data || []).forEach(e => {
      if (e.status === 'ACTIVE') {
        enrollMap[e.course_id] = (enrollMap[e.course_id] || 0) + 1;
      }
    });

    const courses = (coursesRes.data || []).map(c => ({
      ...c,
      total_videos: videoMap[c.id] || 0,
      active_enrollments: enrollMap[c.id] || 0
    }));

    return res.json({
      success: true,
      courses
    });
  } catch (error) {
    next(error);
  }
}

async function createCourseSupabase(req, res, next) {
  try {
    const { title, description, thumbnail_url } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Course title is required.'
      });
    }

    const { data: course, error } = await supabase
      .from('courses')
      .insert({
        title: title.trim(),
        description: description ? description.trim() : '',
        thumbnail_url: normalizeThumbnailUrl(thumbnail_url),
        status: 'ACTIVE',
        created_by: req.user?.id || null
      })
      .select('*')
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: 'Course created successfully.',
      course
    });
  } catch (error) {
    next(error);
  }
}

async function updateCourseSupabase(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const { title, description, thumbnail_url, status } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Course title is required.'
      });
    }

    // Verify course exists and retrieve existing record to preserve status if omitted
    const { data: existing, error: existErr } = await supabase
      .from('courses')
      .select('id, status, created_by')
      .eq('id', courseId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Course not found.'
      });
    }

    const courseStatus = status && ['ACTIVE', 'ARCHIVED'].includes(status) ? status : existing.status;

    const { data: updated, error } = await supabase
      .from('courses')
      .update({
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() : '',
        thumbnail_url: normalizeThumbnailUrl(thumbnail_url),
        status: courseStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', courseId)
      .select('*')
      .maybeSingle();

    if (error) throw error;

    return res.json({
      success: true,
      message: 'Course updated successfully.',
      course: updated
    });
  } catch (error) {
    next(error);
  }
}

async function deleteCourseSupabase(req, res, next) {
  try {
    const courseId = Number(req.params.id);

    // Verify course exists
    const { data: existing, error: existErr } = await supabase
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Course not found.'
      });
    }

    // Preserve database FK protection: check for existing enrollments
    const { count: enrollCount, error: countErr } = await supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', courseId);

    if (countErr) throw countErr;
    if (enrollCount && enrollCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete course with existing student enrollments. Revoke or remove enrollments first, or archive the course.'
      });
    }

    const { error: delErr } = await supabase
      .from('courses')
      .delete()
      .eq('id', courseId);

    if (delErr) {
      if (delErr.code === '23503') {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete course with dependent records. Please archive the course instead.'
        });
      }
      throw delErr;
    }

    return res.json({
      success: true,
      message: 'Course deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
}

async function getVideosSupabase(req, res, next) {
  try {
    const { courseId } = req.query;

    let query = supabase
      .from('videos')
      .select(`
        *,
        courses!inner(title)
      `);

    if (courseId) {
      query = query.eq('course_id', Number(courseId));
    }

    query = query
      .order('course_id', { ascending: true })
      .order('order_index', { ascending: true })
      .order('id', { ascending: true });

    const { data: rows, error } = await query;
    if (error) throw error;

    const videos = (rows || []).map(v => {
      const { courses, ...rest } = v;
      return {
        ...rest,
        course_title: courses?.title || ''
      };
    });

    return res.json({
      success: true,
      videos
    });
  } catch (error) {
    next(error);
  }
}

async function createVideoSupabase(req, res, next) {
  try {
    const {
      title,
      description,
      course_id,
      video_type = 'youtube',
      provider = 'youtube',
      privacy_type = 'youtube_unlisted',
      youtube_video_id,
      manifest_url,
      license_server_url,
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

    // Check course exists in Supabase
    const { data: course, error: courseErr } = await supabase
      .from('courses')
      .select('id')
      .eq('id', Number(course_id))
      .maybeSingle();

    if (courseErr) throw courseErr;
    if (!course) {
      return res.status(404).json({ success: false, error: 'Selected course does not exist.' });
    }

    let cleanVideoId = '';
    let resolvedProvider = provider;
    let resolvedPrivacyType = privacy_type;

    if (video_type === 'widevine') {
      resolvedProvider = 'widevine';
      resolvedPrivacyType = 'widevine_drm';

      if (!manifest_url || !manifest_url.trim()) {
        return res.status(400).json({
          success: false,
          error: 'DASH Manifest URL (.mpd) is required for Widevine DRM videos.'
        });
      }

      const wvProvider = getVideoProvider('widevine');
      if (!wvProvider.validateManifest(manifest_url.trim())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid DASH manifest URL. Must be a valid URL pointing to a DASH manifest or .mpd resource.'
        });
      }

      cleanVideoId = (req.body.external_video_id || youtube_video_id || `wv-${Date.now()}`).trim();
    } else {
      // Default / YouTube validation
      if (!youtube_video_id || !youtube_video_id.trim()) {
        return res.status(400).json({ success: false, error: 'YouTube Video ID is required.' });
      }

      const ytProvider = getVideoProvider('youtube');
      cleanVideoId = ytProvider.extractVideoId(youtube_video_id);

      if (!cleanVideoId) {
        return res.status(400).json({
          success: false,
          error: 'Invalid YouTube Video ID format. Please provide an 11-character video ID or valid YouTube URL.'
        });
      }
    }

    const { data: video, error } = await supabase
      .from('videos')
      .insert({
        course_id: Number(course_id),
        title: title.trim(),
        description: description ? description.trim() : '',
        video_type,
        provider: resolvedProvider,
        privacy_type: resolvedPrivacyType,
        external_video_id: cleanVideoId,
        manifest_url: manifest_url ? manifest_url.trim() : null,
        license_server_url: license_server_url ? license_server_url.trim() : null,
        duration_seconds: parseInt(duration_seconds, 10) || 0,
        order_index: parseInt(order_index, 10) || 0,
        status
      })
      .select('*')
      .single();

    if (error) throw error;

    let warning = null;
    if (video_type === 'youtube' && privacy_type === 'youtube_private') {
      warning = 'Private YouTube videos require YouTube viewer authorization. For reliable student-specific access control, use YouTube Unlisted for the MVP or Widevine DRM.';
    }

    return res.status(201).json({
      success: true,
      message: `${video_type === 'widevine' ? 'Widevine DRM protected video' : 'YouTube video'} added successfully.`,
      warning,
      video
    });
  } catch (error) {
    next(error);
  }
}

async function updateVideoSupabase(req, res, next) {
  try {
    const videoId = Number(req.params.id);
    const {
      title,
      description,
      course_id,
      video_type,
      provider,
      privacy_type,
      youtube_video_id,
      manifest_url,
      license_server_url,
      duration_seconds = 0,
      order_index = 0,
      status = 'ACTIVE'
    } = req.body;

    const { data: existing, error: existErr } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Video not found.' });
    }

    const targetVideoType = video_type || existing.video_type || 'youtube';
    let cleanVideoId = existing.external_video_id;
    let resolvedProvider = provider || existing.provider;
    let resolvedPrivacyType = privacy_type || existing.privacy_type;

    if (targetVideoType === 'widevine') {
      resolvedProvider = 'widevine';
      resolvedPrivacyType = 'widevine_drm';

      const targetManifest = manifest_url !== undefined ? manifest_url : existing.manifest_url;
      if (!targetManifest || !targetManifest.trim()) {
        return res.status(400).json({
          success: false,
          error: 'DASH Manifest URL (.mpd) is required for Widevine DRM videos.'
        });
      }

      if (req.body.external_video_id) {
        cleanVideoId = req.body.external_video_id.trim();
      }
    } else {
      if (youtube_video_id) {
        const ytProvider = getVideoProvider('youtube');
        cleanVideoId = ytProvider.extractVideoId(youtube_video_id);
        if (!cleanVideoId) {
          return res.status(400).json({
            success: false,
            error: 'Invalid YouTube Video ID format.'
          });
        }
      }
    }

    const { data: updated, error } = await supabase
      .from('videos')
      .update({
        title: title ? title.trim() : existing.title,
        description: description !== undefined ? description.trim() : existing.description,
        course_id: course_id ? Number(course_id) : existing.course_id,
        video_type: targetVideoType,
        provider: resolvedProvider,
        privacy_type: resolvedPrivacyType,
        external_video_id: cleanVideoId,
        manifest_url: manifest_url !== undefined ? (manifest_url ? manifest_url.trim() : null) : existing.manifest_url,
        license_server_url: license_server_url !== undefined ? (license_server_url ? license_server_url.trim() : null) : existing.license_server_url,
        duration_seconds: duration_seconds !== undefined ? parseInt(duration_seconds, 10) : existing.duration_seconds,
        order_index: order_index !== undefined ? parseInt(order_index, 10) : existing.order_index,
        status: status || existing.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId)
      .select('*')
      .single();

    if (error) throw error;

    const warning = updated.privacy_type === 'youtube_private'
      ? 'Private YouTube videos require YouTube viewer authorization. For reliable student-specific access control, use YouTube Unlisted for the MVP or Widevine DRM.'
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

async function deleteVideoSupabase(req, res, next) {
  try {
    const videoId = Number(req.params.id);

    const { data: existing, error: existErr } = await supabase
      .from('videos')
      .select('id')
      .eq('id', videoId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Video not found.' });
    }

    const { error: delErr } = await supabase
      .from('videos')
      .delete()
      .eq('id', videoId);

    if (delErr) throw delErr;

    return res.json({
      success: true,
      message: 'Video deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
}

async function getEnrollmentsSupabase(req, res, next) {
  try {
    const nowIso = new Date().toISOString();

    const { data: rows, error } = await supabase
      .from('enrollments')
      .select(`
        *,
        profiles!inner(name, email, status),
        courses!inner(title)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const enrollments = (rows || []).map(en => ({
      id: en.id,
      student_id: en.student_id,
      course_id: en.course_id,
      access_start: en.access_start,
      access_expiry: en.access_expiry,
      status: en.status,
      created_at: en.created_at,
      updated_at: en.updated_at,
      student_name: en.profiles?.name || '',
      student_email: en.profiles?.email || '',
      student_status: en.profiles?.status || 'ACTIVE',
      course_title: en.courses?.title || '',
      is_expired: nowIso > en.access_expiry,
      is_future: nowIso < en.access_start,
      is_active: en.status === 'ACTIVE' && nowIso >= en.access_start && nowIso <= en.access_expiry
    }));

    return res.json({
      success: true,
      enrollments
    });
  } catch (error) {
    next(error);
  }
}

async function createEnrollmentSupabase(req, res, next) {
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

    // Check student exists in profiles with role STUDENT
    const { data: student, error: studentErr } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', String(student_id))
      .eq('role', 'STUDENT')
      .maybeSingle();

    if (studentErr) throw studentErr;
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student does not exist.' });
    }

    // Check course exists in courses
    const { data: course, error: courseErr } = await supabase
      .from('courses')
      .select('id, title')
      .eq('id', Number(course_id))
      .maybeSingle();

    if (courseErr) throw courseErr;
    if (!course) {
      return res.status(404).json({ success: false, error: 'Course does not exist.' });
    }

    // Upsert enrollment on (student_id, course_id)
    const { data: upserted, error: upsertErr } = await supabase
      .from('enrollments')
      .upsert({
        student_id: String(student_id),
        course_id: Number(course_id),
        access_start: startDate.toISOString(),
        access_expiry: expiryDate.toISOString(),
        status,
        updated_at: new Date().toISOString()
      }, { onConflict: 'student_id,course_id' })
      .select('*, profiles!inner(name, email), courses!inner(title)')
      .single();

    if (upsertErr) throw upsertErr;

    const enrollment = {
      id: upserted.id,
      student_id: upserted.student_id,
      course_id: upserted.course_id,
      access_start: upserted.access_start,
      access_expiry: upserted.access_expiry,
      status: upserted.status,
      created_at: upserted.created_at,
      updated_at: upserted.updated_at,
      student_name: upserted.profiles?.name || student.name,
      student_email: upserted.profiles?.email || student.email,
      course_title: upserted.courses?.title || course.title
    };

    return res.status(201).json({
      success: true,
      message: 'Student enrolled in course successfully.',
      enrollment
    });
  } catch (error) {
    next(error);
  }
}

async function updateEnrollmentSupabase(req, res, next) {
  try {
    const enrollmentId = Number(req.params.id);
    const { access_start, access_expiry, status } = req.body;

    const { data: existing, error: existErr } = await supabase
      .from('enrollments')
      .select('*')
      .eq('id', enrollmentId)
      .maybeSingle();

    if (existErr) throw existErr;
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

    const { data: updated, error: updateErr } = await supabase
      .from('enrollments')
      .update({
        access_start: newStart,
        access_expiry: newExpiry,
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId)
      .select('*, profiles!inner(name, email), courses!inner(title)')
      .single();

    if (updateErr) throw updateErr;

    const formatted = {
      id: updated.id,
      student_id: updated.student_id,
      course_id: updated.course_id,
      access_start: updated.access_start,
      access_expiry: updated.access_expiry,
      status: updated.status,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      student_name: updated.profiles?.name || '',
      student_email: updated.profiles?.email || '',
      course_title: updated.courses?.title || ''
    };

    return res.json({
      success: true,
      message: 'Enrollment updated successfully.',
      enrollment: formatted
    });
  } catch (error) {
    next(error);
  }
}

async function deleteEnrollmentSupabase(req, res, next) {
  try {
    const enrollmentId = Number(req.params.id);

    const { data: existing, error: existErr } = await supabase
      .from('enrollments')
      .select('student_id, course_id')
      .eq('id', enrollmentId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Enrollment record not found.' });
    }

    const { error: delErr } = await supabase
      .from('enrollments')
      .delete()
      .eq('id', enrollmentId);

    if (delErr) throw delErr;

    logSecurityEvent({
      userId: existing.student_id,
      eventType: 'ACCESS_REVOKED',
      resourceType: 'course',
      resourceId: existing.course_id,
      req,
      status: 'SUCCESS',
      details: { revokedBy: req.user.id }
    });

    return res.json({
      success: true,
      message: 'Course access revoked successfully.'
    });
  } catch (error) {
    next(error);
  }
}

async function getAuditLogsSupabase(req, res, next) {
  try {
    const { eventType, userId, status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('security_audit_logs')
      .select(`
        id,
        user_id,
        event_type,
        resource_type,
        resource_id,
        ip_address,
        user_agent,
        status,
        details,
        created_at,
        profiles (name, email)
      `, { count: 'exact' });

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    if (userId) {
      query = query.eq('user_id', String(userId));
    }

    if (status) {
      query = query.eq('status', status);
    }

    const parsedLimit = Math.min(200, parseInt(limit, 10) || 50);
    const parsedOffset = parseInt(offset, 10) || 0;

    query = query
      .order('created_at', { ascending: false })
      .range(parsedOffset, parsedOffset + parsedLimit - 1);

    const { data: rows, count: totalCount, error } = await query;
    if (error) throw error;

    const logs = (rows || []).map(l => ({
      id: l.id,
      user_id: l.user_id,
      user_name: l.profiles?.name || null,
      user_email: l.profiles?.email || null,
      event_type: l.event_type,
      resource_type: l.resource_type,
      resource_id: l.resource_id,
      ip_address: l.ip_address,
      user_agent: l.user_agent,
      status: l.status,
      details: l.details,
      created_at: l.created_at
    }));

    return res.json({
      success: true,
      total: totalCount || 0,
      logs
    });
  } catch (error) {
    next(error);
  }
}

async function getAdminCourseDocumentsSupabase(req, res, next) {
  try {
    const courseId = Number(req.params.courseId);

    const { data: documents, error } = await supabase
      .from('course_documents')
      .select('*')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;

    return res.json({
      success: true,
      documents: documents || []
    });
  } catch (error) {
    next(error);
  }
}

async function createAdminCourseDocumentSupabase(req, res, next) {
  try {
    const courseId = Number(req.params.courseId);
    const { title, description, file_path, file_type = 'application/pdf', file_size_bytes = 0, order_index = 0 } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Document title is required.' });
    }

    const { data: course, error: courseErr } = await supabase
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .maybeSingle();

    if (courseErr) throw courseErr;
    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found.' });
    }

    const { data: document, error } = await supabase
      .from('course_documents')
      .insert({
        course_id: courseId,
        title: title.trim(),
        description: description ? description.trim() : '',
        file_path: file_path ? file_path.trim() : `course_${courseId}_doc_${Date.now()}`,
        file_type,
        file_size_bytes: parseInt(file_size_bytes, 10) || 0,
        order_index: parseInt(order_index, 10) || 0,
        status: 'ACTIVE'
      })
      .select('*')
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: 'Document added to course successfully.',
      document
    });
  } catch (error) {
    next(error);
  }
}

async function deleteAdminCourseDocumentSupabase(req, res, next) {
  try {
    const docId = Number(req.params.docId);

    const { data: existing, error: existErr } = await supabase
      .from('course_documents')
      .select('id')
      .eq('id', docId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }

    const { error: delErr } = await supabase
      .from('course_documents')
      .delete()
      .eq('id', docId);

    if (delErr) throw delErr;

    return res.json({
      success: true,
      message: 'Document deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
}

// ==============================================================================
// 3. EXPORTED UNIFIED DISPATCHERS (DUAL RUNTIME)
// ==============================================================================

export function getAdminStats(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getAdminStatsSupabase(req, res, next);
  }
  return getAdminStatsSqlite(req, res, next);
}

export function getStudents(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getStudentsSupabase(req, res, next);
  }
  return getStudentsSqlite(req, res, next);
}

export function createStudent(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return createStudentSupabase(req, res, next);
  }
  return createStudentSqlite(req, res, next);
}

export function updateStudent(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return updateStudentSupabase(req, res, next);
  }
  return updateStudentSqlite(req, res, next);
}

export function updateStudentStatus(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return updateStudentStatusSupabase(req, res, next);
  }
  return updateStudentStatusSqlite(req, res, next);
}

export function resetStudentPassword(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return resetStudentPasswordSupabase(req, res, next);
  }
  return resetStudentPasswordSqlite(req, res, next);
}

export function getCourses(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getCoursesSupabase(req, res, next);
  }
  return getCoursesSqlite(req, res, next);
}

export function createCourse(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return createCourseSupabase(req, res, next);
  }
  return createCourseSqlite(req, res, next);
}

export function updateCourse(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return updateCourseSupabase(req, res, next);
  }
  return updateCourseSqlite(req, res, next);
}

export function deleteCourse(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return deleteCourseSupabase(req, res, next);
  }
  return deleteCourseSqlite(req, res, next);
}

export function getVideos(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getVideosSupabase(req, res, next);
  }
  return getVideosSqlite(req, res, next);
}

export function createVideo(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return createVideoSupabase(req, res, next);
  }
  return createVideoSqlite(req, res, next);
}

export function updateVideo(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return updateVideoSupabase(req, res, next);
  }
  return updateVideoSqlite(req, res, next);
}

export function deleteVideo(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return deleteVideoSupabase(req, res, next);
  }
  return deleteVideoSqlite(req, res, next);
}

export function getEnrollments(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getEnrollmentsSupabase(req, res, next);
  }
  return getEnrollmentsSqlite(req, res, next);
}

export function createEnrollment(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return createEnrollmentSupabase(req, res, next);
  }
  return createEnrollmentSqlite(req, res, next);
}

export function updateEnrollment(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return updateEnrollmentSupabase(req, res, next);
  }
  return updateEnrollmentSqlite(req, res, next);
}

export function deleteEnrollment(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return deleteEnrollmentSupabase(req, res, next);
  }
  return deleteEnrollmentSqlite(req, res, next);
}

export function getAuditLogs(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getAuditLogsSupabase(req, res, next);
  }
  return getAuditLogsSqlite(req, res, next);
}

export function getAdminCourseDocuments(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getAdminCourseDocumentsSupabase(req, res, next);
  }
  return getAdminCourseDocumentsSqlite(req, res, next);
}

export function createAdminCourseDocument(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return createAdminCourseDocumentSupabase(req, res, next);
  }
  return createAdminCourseDocumentSqlite(req, res, next);
}

export function deleteAdminCourseDocument(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return deleteAdminCourseDocumentSupabase(req, res, next);
  }
  return deleteAdminCourseDocumentSqlite(req, res, next);
}
