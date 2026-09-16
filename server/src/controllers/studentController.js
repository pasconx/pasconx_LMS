import path from 'path';
import fs from 'fs';
import { db } from '../config/database.js';
import { getVideoProvider } from '../providers/index.js';
import { logSecurityEvent } from '../utils/auditLogger.js';
import { generateSignedToken, verifySignedToken } from '../utils/tokenSigner.js';

export function formatMaskedEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local}***@${domain}`;
  }
  const prefix = local.substring(0, 3);
  return `${prefix}****@${domain}`;
}

export function formatWatermarkProfile(user) {
  if (!user) return null;
  return {
    studentName: user.name,
    email: user.email,
    maskedEmail: formatMaskedEmail(user.email),
    studentId: `PX2026-${String(user.id).padStart(3, '0')}`,
    institute: 'PASCONX ACADEMY'
  };
}

/**
 * Get all courses assigned to the authenticated student
 */
export function getStudentCourses(req, res, next) {
  try {
    const studentId = req.user.id;
    const now = new Date().toISOString();

    const courses = db.prepare(`
      SELECT 
        c.id,
        c.title,
        c.description,
        c.thumbnail_url,
        e.access_start,
        e.access_expiry,
        e.status AS enrollment_status,
        (SELECT COUNT(*) FROM videos v WHERE v.course_id = c.id AND v.status = 'ACTIVE') AS total_videos,
        (
          SELECT COUNT(DISTINCT vp.video_id) 
          FROM video_progress vp 
          JOIN videos v ON vp.video_id = v.id 
          WHERE vp.student_id = ? AND v.course_id = c.id AND vp.completed = 1
        ) AS completed_videos
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE e.student_id = ? AND c.status = 'ACTIVE'
      ORDER BY e.created_at DESC
    `).all(studentId, studentId);

    const formatted = courses.map(course => {
      const isExpired = now > course.access_expiry;
      const isFuture = now < course.access_start;
      const isActive = !isExpired && !isFuture && course.enrollment_status === 'ACTIVE';

      return {
        ...course,
        is_expired: isExpired,
        is_future: isFuture,
        is_active: isActive,
        progress_percentage: course.total_videos > 0 
          ? Math.min(100, Math.round((course.completed_videos / course.total_videos) * 100))
          : 0
      };
    });

    return res.json({
      success: true,
      courses: formatted
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get single course detail with video syllabus and documents for authenticated student
 * (Already validated by checkCourseAccess)
 */
export function getStudentCourseDetail(req, res, next) {
  try {
    const studentId = req.user.id;
    const course = req.course;
    const enrollment = req.enrollment;

    // Log course access
    logSecurityEvent({
      userId: studentId,
      eventType: 'COURSE_ACCESS',
      resourceType: 'course',
      resourceId: course.id,
      req,
      status: 'SUCCESS'
    });

    const videos = db.prepare(`
      SELECT 
        v.id,
        v.course_id,
        v.title,
        v.description,
        v.video_type,
        v.duration_seconds,
        v.order_index,
        COALESCE(vp.progress_seconds, 0) AS progress_seconds,
        COALESCE(vp.completed, 0) AS completed,
        vp.last_watched_at
      FROM videos v
      LEFT JOIN video_progress vp ON v.id = vp.video_id AND vp.student_id = ?
      WHERE v.course_id = ? AND v.status = 'ACTIVE'
      ORDER BY v.order_index ASC, v.id ASC
    `).all(studentId, course.id);

    const documents = db.prepare(`
      SELECT 
        id, course_id, title, description, file_type, file_size_bytes, order_index, created_at
      FROM course_documents
      WHERE course_id = ? AND status = 'ACTIVE'
      ORDER BY order_index ASC, id ASC
    `).all(course.id);

    const watermark = formatWatermarkProfile(req.user);

    return res.json({
      success: true,
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        thumbnail_url: course.thumbnail_url,
        access_start: enrollment.access_start,
        access_expiry: enrollment.access_expiry,
        enrollment_status: enrollment.status
      },
      videos: videos,
      documents: documents.map(doc => ({
        ...doc,
        viewToken: generateSignedToken({
          userId: studentId,
          resourceType: 'document',
          resourceId: doc.id,
          expiresInSeconds: 900 // 15 minutes
        })
      })),
      watermarkProfile: watermark
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get video playback details and next/previous links
 * (Already validated by checkVideoAccess)
 */
export async function getStudentVideoPlayback(req, res, next) {
  try {
    const studentId = req.user.id;
    const video = req.video;
    const enrollment = req.enrollment;

    // Generate short-lived media authorization token
    const playbackToken = generateSignedToken({
      userId: studentId,
      resourceType: 'video',
      resourceId: video.id,
      expiresInSeconds: 900
    });

    // Log video playback access
    logSecurityEvent({
      userId: studentId,
      eventType: 'VIDEO_PLAYBACK',
      resourceType: 'video',
      resourceId: video.id,
      req,
      status: 'SUCCESS',
      details: { courseId: video.course_id, videoTitle: video.title }
    });

    // Determine video type & provider (preserving default 'youtube')
    const videoType = video.video_type || (video.provider === 'widevine' ? 'widevine' : 'youtube');
    const providerKey = videoType === 'widevine' ? 'widevine' : (video.provider || 'youtube');
    const provider = getVideoProvider(providerKey);
    const playbackConfig = await provider.getPlaybackConfig(video, req.user);

    // Get existing progress
    const progress = db.prepare(`
      SELECT progress_seconds, completed, last_watched_at
      FROM video_progress
      WHERE student_id = ? AND video_id = ?
    `).get(studentId, video.id) || { progress_seconds: 0, completed: 0, last_watched_at: null };

    // Get sibling videos for navigation
    const siblings = db.prepare(`
      SELECT id, title, order_index
      FROM videos
      WHERE course_id = ? AND status = 'ACTIVE'
      ORDER BY order_index ASC, id ASC
    `).all(video.course_id);

    const currentIndex = siblings.findIndex(s => s.id === video.id);
    const prevVideo = currentIndex > 0 ? siblings[currentIndex - 1] : null;
    const nextVideo = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

    const watermark = formatWatermarkProfile(req.user);

    return res.json({
      success: true,
      video: {
        id: video.id,
        course_id: video.course_id,
        course_title: video.course_title,
        title: video.title,
        description: video.description,
        video_type: videoType,
        manifest_url: video.manifest_url,
        duration_seconds: video.duration_seconds,
        order_index: video.order_index,
        access_expiry: enrollment.access_expiry
      },
      playback: playbackConfig,
      playbackToken: playbackToken,
      watermarkProfile: watermark,
      stealthMode: {
        enabled: true,
        protectionLevel: 'STEALTH_CONTENT_MODE',
        watermarkEnabled: true,
        allowDownload: false,
        copyRestricted: true
      },
      progress: progress,
      navigation: {
        prevVideo: prevVideo ? { id: prevVideo.id, title: prevVideo.title } : null,
        nextVideo: nextVideo ? { id: nextVideo.id, title: nextVideo.title } : null
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get documents for an enrolled course
 * (Already validated by checkCourseAccess)
 */
export function getStudentCourseDocuments(req, res, next) {
  try {
    const studentId = req.user.id;
    const courseId = Number(req.params.courseId);

    const documents = db.prepare(`
      SELECT id, course_id, title, description, file_type, file_size_bytes, order_index, created_at
      FROM course_documents
      WHERE course_id = ? AND status = 'ACTIVE'
      ORDER BY order_index ASC, id ASC
    `).all(courseId);

    const docsWithTokens = documents.map(doc => ({
      ...doc,
      viewToken: generateSignedToken({
        userId: studentId,
        resourceType: 'document',
        resourceId: doc.id,
        expiresInSeconds: 900
      })
    }));

    return res.json({
      success: true,
      documents: docsWithTokens
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Stream or serve document securely with student watermark headers and signed token validation
 * (Already validated by checkDocumentAccess)
 */
export function streamStudentDocument(req, res, next) {
  try {
    const studentId = req.user.id;
    const doc = req.document;
    const token = req.query.token;

    // If token provided in query, verify it
    if (token) {
      const verifyResult = verifySignedToken(token, {
        expectedUserId: studentId,
        expectedResourceType: 'document',
        expectedResourceId: doc.id
      });
      if (!verifyResult.valid) {
        logSecurityEvent({
          userId: studentId,
          eventType: 'UNAUTHORIZED_ATTEMPT',
          resourceType: 'document',
          resourceId: doc.id,
          req,
          status: 'DENIED',
          details: verifyResult.error
        });
        return res.status(403).json({
          success: false,
          error: `Media token error: ${verifyResult.error}`
        });
      }
    }

    // Log document access
    logSecurityEvent({
      userId: studentId,
      eventType: 'DOCUMENT_ACCESS',
      resourceType: 'document',
      resourceId: doc.id,
      req,
      status: 'SUCCESS',
      details: { docTitle: doc.title, courseId: doc.course_id }
    });

    const watermark = formatWatermarkProfile(req.user);

    // Set anti-caching & watermarking headers
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Student-Watermark', `${watermark.institute} | Student: ${watermark.studentName} (${watermark.maskedEmail}) | ID: ${watermark.studentId}`);

    // Check if physical file exists on disk
    if (doc.file_path && fs.existsSync(doc.file_path)) {
      res.setHeader('Content-Type', doc.file_type || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.title)}.pdf"`);
      return fs.createReadStream(doc.file_path).pipe(res);
    }

    // If no physical file on disk (e.g. synthetic or note document), serve a structured PDF/text response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.title)}.txt"`);
    
    const content = [
      `================================================================================`,
      `PASCONX ACADEMY - OFFICIAL PROTECTED COURSE MATERIAL`,
      `================================================================================`,
      `Course: ${doc.course_title || 'Enrolled Course'}`,
      `Document: ${doc.title}`,
      `Description: ${doc.description || 'No additional notes'}`,
      ``,
      `--- STUDENT IDENTIFICATION WATERMARK ---`,
      `Issued To: ${watermark.studentName}`,
      `Student ID: ${watermark.studentId}`,
      `Account: ${watermark.maskedEmail}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Notice: This document contains personalized digital watermarking.`,
      `Unauthorized distribution, copying, or public sharing is strictly prohibited.`,
      `================================================================================`,
      ``,
      `Content and lab instructions for this module are available inside the secure player.`
    ].join('\n');

    return res.send(content);
  } catch (error) {
    next(error);
  }
}

/**
 * Save playback progress
 * (Already validated by checkVideoAccess)
 */
export function updateStudentVideoProgress(req, res, next) {
  try {
    const studentId = req.user.id;
    const videoId = req.video.id;
    const { progress_seconds, completed } = req.body;

    const seconds = Math.max(0, parseInt(progress_seconds, 10) || 0);
    const isCompleted = completed ? 1 : 0;

    const upsertStmt = db.prepare(`
      INSERT INTO video_progress (student_id, video_id, progress_seconds, completed, last_watched_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(student_id, video_id) DO UPDATE SET
        progress_seconds = excluded.progress_seconds,
        completed = MAX(video_progress.completed, excluded.completed),
        last_watched_at = datetime('now')
    `);

    upsertStmt.run(studentId, videoId, seconds, isCompleted);

    const updated = db.prepare(`
      SELECT progress_seconds, completed, last_watched_at
      FROM video_progress
      WHERE student_id = ? AND video_id = ?
    `).get(studentId, videoId);

    return res.json({
      success: true,
      progress: updated
    });
  } catch (error) {
    next(error);
  }
}

