import { db } from '../config/database.js';
import { supabase } from '../config/supabase.js';
import { logSecurityEvent } from '../utils/auditLogger.js';

/**
 * ==========================================
 * SQLITE ACCESS CONTROL (ROLLBACK PATH)
 * ==========================================
 */

function checkCourseAccessSqlite(req, res, next, studentId, courseId) {
  // Course must exist and be active
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course || course.status !== 'ACTIVE') {
    return res.status(404).json({
      success: false,
      error: 'Course not found or is currently unavailable.'
    });
  }

  // Look up enrollment strictly by studentId from the authenticated token
  const enrollment = db.prepare(`
    SELECT * FROM enrollments 
    WHERE student_id = ? AND course_id = ?
  `).get(studentId, courseId);

  if (!enrollment) {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'course',
      resourceId: courseId,
      req,
      status: 'DENIED',
      details: 'Not enrolled in course'
    });
    return res.status(403).json({
      success: false,
      error: 'You do not have access to this course.'
    });
  }

  if (enrollment.status !== 'ACTIVE') {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'course',
      resourceId: courseId,
      req,
      status: 'DENIED',
      details: 'Enrollment inactive'
    });
    return res.status(403).json({
      success: false,
      error: 'Your enrollment in this course is inactive. Please contact the administrator.'
    });
  }

  const now = new Date().toISOString();

  // Check access start date
  if (now < enrollment.access_start) {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'course',
      resourceId: courseId,
      req,
      status: 'DENIED',
      details: 'Course access not started yet'
    });
    return res.status(403).json({
      success: false,
      error: `Course access has not started yet. Your access begins on ${new Date(enrollment.access_start).toLocaleDateString()}.`
    });
  }

  // Check access expiry date
  if (now > enrollment.access_expiry) {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'course',
      resourceId: courseId,
      req,
      status: 'DENIED',
      details: 'Course access expired'
    });
    return res.status(403).json({
      success: false,
      error: 'Your access to this course has expired. Please contact PASCONX Academy for access renewal.'
    });
  }

  req.course = course;
  req.enrollment = enrollment;
  next();
}

function checkVideoAccessSqlite(req, res, next, studentId, videoId) {
  // Look up video
  const video = db.prepare(`
    SELECT v.*, c.title AS course_title, c.status AS course_status 
    FROM videos v
    JOIN courses c ON v.course_id = c.id
    WHERE v.id = ?
  `).get(videoId);

  if (!video || video.status !== 'ACTIVE' || video.course_status !== 'ACTIVE') {
    return res.status(404).json({
      success: false,
      error: 'This video is currently unavailable.'
    });
  }

  // Look up enrollment strictly by studentId and video.course_id
  const enrollment = db.prepare(`
    SELECT * FROM enrollments 
    WHERE student_id = ? AND course_id = ?
  `).get(studentId, video.course_id);

  if (!enrollment) {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'video',
      resourceId: videoId,
      req,
      status: 'DENIED',
      details: 'Not enrolled in video course'
    });
    return res.status(403).json({
      success: false,
      error: 'You are not authorized to watch this video.'
    });
  }

  if (enrollment.status !== 'ACTIVE') {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'video',
      resourceId: videoId,
      req,
      status: 'DENIED',
      details: 'Enrollment inactive'
    });
    return res.status(403).json({
      success: false,
      error: 'Your enrollment in this course is inactive.'
    });
  }

  const now = new Date().toISOString();

  if (now < enrollment.access_start) {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'video',
      resourceId: videoId,
      req,
      status: 'DENIED',
      details: 'Video course access not started'
    });
    return res.status(403).json({
      success: false,
      error: 'Course access has not started yet.'
    });
  }

  if (now > enrollment.access_expiry) {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'video',
      resourceId: videoId,
      req,
      status: 'DENIED',
      details: 'Video course access expired'
    });
    return res.status(403).json({
      success: false,
      error: 'Your access to this course has expired. Please contact PASCONX Academy for access renewal.'
    });
  }

  req.video = video;
  req.enrollment = enrollment;
  next();
}

function checkDocumentAccessSqlite(req, res, next, studentId, courseId, docId) {
  const document = db.prepare(`
    SELECT d.*, c.title AS course_title, c.status AS course_status
    FROM course_documents d
    JOIN courses c ON d.course_id = c.id
    WHERE d.id = ? AND d.course_id = ?
  `).get(docId, courseId);

  if (!document || document.status !== 'ACTIVE' || document.course_status !== 'ACTIVE') {
    return res.status(404).json({
      success: false,
      error: 'Requested document is not available.'
    });
  }

  const enrollment = db.prepare(`
    SELECT * FROM enrollments 
    WHERE student_id = ? AND course_id = ?
  `).get(studentId, courseId);

  if (!enrollment || enrollment.status !== 'ACTIVE') {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'document',
      resourceId: docId,
      req,
      status: 'DENIED',
      details: 'Not enrolled or inactive'
    });
    return res.status(403).json({
      success: false,
      error: 'You are not authorized to view this document.'
    });
  }

  const now = new Date().toISOString();
  if (now < enrollment.access_start || now > enrollment.access_expiry) {
    logSecurityEvent({
      userId: studentId,
      eventType: 'UNAUTHORIZED_ATTEMPT',
      resourceType: 'document',
      resourceId: docId,
      req,
      status: 'DENIED',
      details: 'Document access date expired or not started'
    });
    return res.status(403).json({
      success: false,
      error: 'Your course access period does not allow viewing this document.'
    });
  }

  req.document = document;
  req.enrollment = enrollment;
  next();
}

/**
 * ==========================================
 * SUPABASE ACCESS CONTROL (TARGET RUNTIME)
 * ==========================================
 */

async function checkCourseAccessSupabase(req, res, next, studentId, courseId) {
  try {
    // 1. Course must exist and be active
    const { data: course, error: courseErr } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .maybeSingle();

    if (courseErr || !course || course.status !== 'ACTIVE') {
      return res.status(404).json({
        success: false,
        error: 'Course not found or is currently unavailable.'
      });
    }

    // 2. Look up enrollment strictly by studentId (UUID) and courseId
    const { data: enrollment, error: enrollErr } = await supabase
      .from('enrollments')
      .select('*')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .maybeSingle();

    if (enrollErr || !enrollment) {
      logSecurityEvent({
        userId: studentId,
        eventType: 'UNAUTHORIZED_ATTEMPT',
        resourceType: 'course',
        resourceId: courseId,
        req,
        status: 'DENIED',
        details: 'Not enrolled in course'
      });
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this course.'
      });
    }

    if (enrollment.status !== 'ACTIVE') {
      logSecurityEvent({
        userId: studentId,
        eventType: 'UNAUTHORIZED_ATTEMPT',
        resourceType: 'course',
        resourceId: courseId,
        req,
        status: 'DENIED',
        details: 'Enrollment inactive'
      });
      return res.status(403).json({
        success: false,
        error: 'Your enrollment in this course is inactive. Please contact the administrator.'
      });
    }

    const now = new Date().toISOString();

    // Check access start date
    if (now < enrollment.access_start) {
      logSecurityEvent({
        userId: studentId,
        eventType: 'UNAUTHORIZED_ATTEMPT',
        resourceType: 'course',
        resourceId: courseId,
        req,
        status: 'DENIED',
        details: 'Course access not started yet'
      });
      return res.status(403).json({
        success: false,
        error: `Course access has not started yet. Your access begins on ${new Date(enrollment.access_start).toLocaleDateString()}.`
      });
    }

    // Check access expiry date
    if (now > enrollment.access_expiry) {
      logSecurityEvent({
        userId: studentId,
        eventType: 'UNAUTHORIZED_ATTEMPT',
        resourceType: 'course',
        resourceId: courseId,
        req,
        status: 'DENIED',
        details: 'Course access expired'
      });
      return res.status(403).json({
        success: false,
        error: 'Your access to this course has expired. Please contact PASCONX Academy for access renewal.'
      });
    }

    req.course = course;
    req.enrollment = enrollment;
    next();
  } catch (err) {
    next(err);
  }
}

async function checkVideoAccessSupabase(req, res, next, studentId, videoId) {
  try {
    // Look up video with its course
    const { data: video, error: vErr } = await supabase
      .from('videos')
      .select('*, courses!inner(title, status)')
      .eq('id', videoId)
      .maybeSingle();

    if (vErr || !video || video.status !== 'ACTIVE' || video.courses?.status !== 'ACTIVE') {
      return res.status(404).json({
        success: false,
        error: 'This video is currently unavailable.'
      });
    }

    video.course_title = video.courses.title;
    video.course_status = video.courses.status;

    // Look up enrollment strictly by studentId (UUID) and course_id
    const { data: enrollment, error: eErr } = await supabase
      .from('enrollments')
      .select('*')
      .eq('student_id', studentId)
      .eq('course_id', video.course_id)
      .maybeSingle();

    if (eErr || !enrollment) {
      logSecurityEvent({
        userId: studentId,
        eventType: 'UNAUTHORIZED_ATTEMPT',
        resourceType: 'video',
        resourceId: videoId,
        req,
        status: 'DENIED',
        details: 'Not enrolled in video course'
      });
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to watch this video.'
      });
    }

    if (enrollment.status !== 'ACTIVE') {
      logSecurityEvent({
        userId: studentId,
        eventType: 'UNAUTHORIZED_ATTEMPT',
        resourceType: 'video',
        resourceId: videoId,
        req,
        status: 'DENIED',
        details: 'Enrollment inactive'
      });
      return res.status(403).json({
        success: false,
        error: 'Your enrollment in this course is inactive.'
      });
    }

    const now = new Date().toISOString();

    if (now < enrollment.access_start) {
      logSecurityEvent({
        userId: studentId,
        eventType: 'UNAUTHORIZED_ATTEMPT',
        resourceType: 'video',
        resourceId: videoId,
        req,
        status: 'DENIED',
        details: 'Video course access not started'
      });
      return res.status(403).json({
        success: false,
        error: 'Course access has not started yet.'
      });
    }

    if (now > enrollment.access_expiry) {
      logSecurityEvent({
        userId: studentId,
        eventType: 'UNAUTHORIZED_ATTEMPT',
        resourceType: 'video',
        resourceId: videoId,
        req,
        status: 'DENIED',
        details: 'Video course access expired'
      });
      return res.status(403).json({
        success: false,
        error: 'Your access to this course has expired. Please contact PASCONX Academy for access renewal.'
      });
    }

    req.video = video;
    req.enrollment = enrollment;
    next();
  } catch (err) {
    next(err);
  }
}

async function checkDocumentAccessSupabase(req, res, next, studentId, courseId, docId) {
  try {
    const { data: document, error: dErr } = await supabase
      .from('course_documents')
      .select('*, courses!inner(title, status)')
      .eq('id', docId)
      .eq('course_id', courseId)
      .maybeSingle();

    if (dErr || !document || document.status !== 'ACTIVE' || document.courses?.status !== 'ACTIVE') {
      return res.status(404).json({
        success: false,
        error: 'Requested document is not available.'
      });
    }

    document.course_title = document.courses.title;
    document.course_status = document.courses.status;

    const { data: enrollment, error: eErr } = await supabase
      .from('enrollments')
      .select('*')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .maybeSingle();

    if (eErr || !enrollment || enrollment.status !== 'ACTIVE') {
      logSecurityEvent({
        userId: studentId,
        eventType: 'UNAUTHORIZED_ATTEMPT',
        resourceType: 'document',
        resourceId: docId,
        req,
        status: 'DENIED',
        details: 'Not enrolled or inactive'
      });
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to view this document.'
      });
    }

    const now = new Date().toISOString();
    if (now < enrollment.access_start || now > enrollment.access_expiry) {
      logSecurityEvent({
        userId: studentId,
        eventType: 'UNAUTHORIZED_ATTEMPT',
        resourceType: 'document',
        resourceId: docId,
        req,
        status: 'DENIED',
        details: 'Document access date expired or not started'
      });
      return res.status(403).json({
        success: false,
        error: 'Your course access period does not allow viewing this document.'
      });
    }

    req.document = document;
    req.enrollment = enrollment;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * ==========================================
 * EXPORTED ACCESS CONTROL DISPATCHERS
 * ==========================================
 */

export function checkCourseAccess(req, res, next) {
  const studentId = req.user.id;
  const courseId = Number(req.params.courseId);

  if (!courseId || isNaN(courseId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid course ID provided.'
    });
  }

  if (process.env.DATA_BACKEND === 'supabase') {
    return checkCourseAccessSupabase(req, res, next, studentId, courseId);
  }
  return checkCourseAccessSqlite(req, res, next, studentId, courseId);
}

export function checkVideoAccess(req, res, next) {
  const studentId = req.user.id;
  const videoId = Number(req.params.videoId);

  if (!videoId || isNaN(videoId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid video ID provided.'
    });
  }

  if (process.env.DATA_BACKEND === 'supabase') {
    return checkVideoAccessSupabase(req, res, next, studentId, videoId);
  }
  return checkVideoAccessSqlite(req, res, next, studentId, videoId);
}

export function checkDocumentAccess(req, res, next) {
  const studentId = req.user.id;
  const courseId = Number(req.params.courseId);
  const docId = Number(req.params.docId);

  if (!courseId || isNaN(courseId) || !docId || isNaN(docId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid course or document ID provided.'
    });
  }

  if (process.env.DATA_BACKEND === 'supabase') {
    return checkDocumentAccessSupabase(req, res, next, studentId, courseId, docId);
  }
  return checkDocumentAccessSqlite(req, res, next, studentId, courseId, docId);
}
