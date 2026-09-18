import path from 'path';
import fs from 'fs';
import { db } from '../config/database.js';
import { supabase } from '../config/supabase.js';
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
  const idStr = typeof user.id === 'string' && user.id.includes('-')
    ? user.id.slice(0, 8).toUpperCase()
    : String(user.id).padStart(3, '0');

  return {
    studentName: user.name,
    email: user.email,
    maskedEmail: formatMaskedEmail(user.email),
    studentId: `PX2026-${idStr}`,
    institute: 'PASCONX ACADEMY'
  };
}

/**
 * ==========================================
 * SQLITE IMPLEMENTATIONS (ROLLBACK PATH)
 * ==========================================
 */

function getStudentCoursesSqlite(req, res, next) {
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

function getStudentCourseDetailSqlite(req, res, next) {
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

async function getStudentVideoPlaybackSqlite(req, res, next) {
  try {
    const studentId = req.user.id;
    const video = req.video;
    const enrollment = req.enrollment;

    const playbackToken = generateSignedToken({
      userId: studentId,
      resourceType: 'video',
      resourceId: video.id,
      expiresInSeconds: 900
    });

    logSecurityEvent({
      userId: studentId,
      eventType: 'VIDEO_PLAYBACK',
      resourceType: 'video',
      resourceId: video.id,
      req,
      status: 'SUCCESS',
      details: { courseId: video.course_id, videoTitle: video.title }
    });

    const videoType = video.video_type || (video.provider === 'widevine' ? 'widevine' : 'youtube');
    const providerKey = videoType === 'widevine' ? 'widevine' : (video.provider || 'youtube');
    const provider = getVideoProvider(providerKey);
    const playbackConfig = await provider.getPlaybackConfig(video, req.user);

    const progress = db.prepare(`
      SELECT progress_seconds, completed, last_watched_at
      FROM video_progress
      WHERE student_id = ? AND video_id = ?
    `).get(studentId, video.id) || { progress_seconds: 0, completed: 0, last_watched_at: null };

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

function getStudentCourseDocumentsSqlite(req, res, next) {
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

function updateStudentVideoProgressSqlite(req, res, next) {
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

/**
 * ==========================================
 * SUPABASE IMPLEMENTATIONS (TARGET RUNTIME)
 * ==========================================
 */

async function getStudentCoursesSupabase(req, res, next) {
  try {
    const studentId = req.user.id;
    const now = new Date().toISOString();

    const { data: enrollments, error: enrollErr } = await supabase
      .from('enrollments')
      .select('id, course_id, access_start, access_expiry, status, created_at, courses!inner(id, title, description, thumbnail_url, status)')
      .eq('student_id', studentId)
      .eq('courses.status', 'ACTIVE')
      .order('created_at', { ascending: false });

    if (enrollErr) throw enrollErr;

    if (!enrollments || enrollments.length === 0) {
      return res.json({
        success: true,
        courses: []
      });
    }

    const courseIds = enrollments.map(e => e.course_id);

    // Get total active videos per course
    const { data: activeVideos, error: vidErr } = await supabase
      .from('videos')
      .select('id, course_id')
      .eq('status', 'ACTIVE')
      .in('course_id', courseIds);

    if (vidErr) throw vidErr;

    const totalVideosMap = {};
    (activeVideos || []).forEach(v => {
      totalVideosMap[v.course_id] = (totalVideosMap[v.course_id] || 0) + 1;
    });

    // Get completed video count for this student
    const { data: progressRows, error: progErr } = await supabase
      .from('video_progress')
      .select('video_id, videos!inner(course_id)')
      .eq('student_id', studentId)
      .eq('completed', true)
      .in('videos.course_id', courseIds);

    if (progErr) throw progErr;

    const completedVideosMap = {};
    (progressRows || []).forEach(p => {
      const cid = p.videos?.course_id;
      if (cid) {
        completedVideosMap[cid] = (completedVideosMap[cid] || 0) + 1;
      }
    });

    const formatted = enrollments.map(e => {
      const isExpired = now > e.access_expiry;
      const isFuture = now < e.access_start;
      const isActive = !isExpired && !isFuture && e.status === 'ACTIVE';
      const total = totalVideosMap[e.course_id] || 0;
      const completed = completedVideosMap[e.course_id] || 0;

      return {
        id: e.courses.id,
        title: e.courses.title,
        description: e.courses.description,
        thumbnail_url: e.courses.thumbnail_url,
        access_start: e.access_start,
        access_expiry: e.access_expiry,
        enrollment_status: e.status,
        total_videos: total,
        completed_videos: completed,
        is_expired: isExpired,
        is_future: isFuture,
        is_active: isActive,
        progress_percentage: total > 0 
          ? Math.min(100, Math.round((completed / total) * 100))
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

async function getStudentCourseDetailSupabase(req, res, next) {
  try {
    const studentId = req.user.id;
    const course = req.course;
    const enrollment = req.enrollment;

    logSecurityEvent({
      userId: studentId,
      eventType: 'COURSE_ACCESS',
      resourceType: 'course',
      resourceId: course.id,
      req,
      status: 'SUCCESS'
    });

    // Fetch active videos
    const { data: videos, error: vErr } = await supabase
      .from('videos')
      .select('id, course_id, title, description, video_type, duration_seconds, order_index')
      .eq('course_id', course.id)
      .eq('status', 'ACTIVE')
      .order('order_index', { ascending: true })
      .order('id', { ascending: true });

    if (vErr) throw vErr;

    const videoIds = (videos || []).map(v => v.id);

    let progressMap = {};
    if (videoIds.length > 0) {
      const { data: progressRows, error: pErr } = await supabase
        .from('video_progress')
        .select('video_id, progress_seconds, completed, last_watched_at')
        .eq('student_id', studentId)
        .in('video_id', videoIds);

      if (pErr) throw pErr;

      (progressRows || []).forEach(p => {
        progressMap[p.video_id] = p;
      });
    }

    const enrichedVideos = (videos || []).map(v => {
      const p = progressMap[v.id];
      return {
        ...v,
        progress_seconds: p ? (p.progress_seconds || 0) : 0,
        completed: p ? (p.completed ? 1 : 0) : 0,
        last_watched_at: p ? p.last_watched_at : null
      };
    });

    // Fetch documents
    const { data: documents, error: dErr } = await supabase
      .from('course_documents')
      .select('id, course_id, title, description, file_type, file_size_bytes, order_index, created_at')
      .eq('course_id', course.id)
      .eq('status', 'ACTIVE')
      .order('order_index', { ascending: true })
      .order('id', { ascending: true });

    if (dErr) throw dErr;

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
      videos: enrichedVideos,
      documents: (documents || []).map(doc => ({
        ...doc,
        viewToken: generateSignedToken({
          userId: studentId,
          resourceType: 'document',
          resourceId: doc.id,
          expiresInSeconds: 900
        })
      })),
      watermarkProfile: watermark
    });
  } catch (error) {
    next(error);
  }
}

async function getStudentVideoPlaybackSupabase(req, res, next) {
  try {
    const studentId = req.user.id;
    const video = req.video;
    const enrollment = req.enrollment;

    const playbackToken = generateSignedToken({
      userId: studentId,
      resourceType: 'video',
      resourceId: video.id,
      expiresInSeconds: 900
    });

    logSecurityEvent({
      userId: studentId,
      eventType: 'VIDEO_PLAYBACK',
      resourceType: 'video',
      resourceId: video.id,
      req,
      status: 'SUCCESS',
      details: { courseId: video.course_id, videoTitle: video.title }
    });

    const videoType = video.video_type || (video.provider === 'widevine' ? 'widevine' : 'youtube');
    const providerKey = videoType === 'widevine' ? 'widevine' : (video.provider || 'youtube');
    const provider = getVideoProvider(providerKey);
    const playbackConfig = await provider.getPlaybackConfig(video, req.user);

    // Get progress from Supabase
    const { data: progressRow } = await supabase
      .from('video_progress')
      .select('progress_seconds, completed, last_watched_at')
      .eq('student_id', studentId)
      .eq('video_id', video.id)
      .maybeSingle();

    const progress = progressRow
      ? {
          progress_seconds: progressRow.progress_seconds || 0,
          completed: progressRow.completed ? 1 : 0,
          last_watched_at: progressRow.last_watched_at
        }
      : { progress_seconds: 0, completed: 0, last_watched_at: null };

    // Get siblings
    const { data: siblings, error: sErr } = await supabase
      .from('videos')
      .select('id, title, order_index')
      .eq('course_id', video.course_id)
      .eq('status', 'ACTIVE')
      .order('order_index', { ascending: true })
      .order('id', { ascending: true });

    if (sErr) throw sErr;

    const siblingList = siblings || [];
    const currentIndex = siblingList.findIndex(s => s.id === video.id);
    const prevVideo = currentIndex > 0 ? siblingList[currentIndex - 1] : null;
    const nextVideo = currentIndex < siblingList.length - 1 ? siblingList[currentIndex + 1] : null;

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

async function getStudentCourseDocumentsSupabase(req, res, next) {
  try {
    const studentId = req.user.id;
    const courseId = Number(req.params.courseId);

    const { data: documents, error } = await supabase
      .from('course_documents')
      .select('id, course_id, title, description, file_type, file_size_bytes, order_index, created_at')
      .eq('course_id', courseId)
      .eq('status', 'ACTIVE')
      .order('order_index', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;

    const docsWithTokens = (documents || []).map(doc => ({
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

async function updateStudentVideoProgressSupabase(req, res, next) {
  try {
    const studentId = req.user.id;
    const videoId = req.video.id;
    const { progress_seconds, completed } = req.body;

    const seconds = Math.max(0, parseInt(progress_seconds, 10) || 0);
    const isCompleted = Boolean(completed);

    // Look up previous completion state to preserve completed status
    const { data: existing } = await supabase
      .from('video_progress')
      .select('completed')
      .eq('student_id', studentId)
      .eq('video_id', videoId)
      .maybeSingle();

    const finalCompleted = isCompleted || Boolean(existing?.completed);
    const nowIso = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('video_progress')
      .upsert({
        student_id: studentId,
        video_id: videoId,
        progress_seconds: seconds,
        completed: finalCompleted,
        last_watched_at: nowIso
      }, { onConflict: 'student_id,video_id' })
      .select('progress_seconds, completed, last_watched_at')
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      progress: {
        progress_seconds: updated.progress_seconds,
        completed: updated.completed ? 1 : 0,
        last_watched_at: updated.last_watched_at
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * ==========================================
 * EXPORTED STUDENT CONTROLLER DISPATCHERS
 * ==========================================
 */

export function getStudentCourses(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getStudentCoursesSupabase(req, res, next);
  }
  return getStudentCoursesSqlite(req, res, next);
}

export function getStudentCourseDetail(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getStudentCourseDetailSupabase(req, res, next);
  }
  return getStudentCourseDetailSqlite(req, res, next);
}

export async function getStudentVideoPlayback(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getStudentVideoPlaybackSupabase(req, res, next);
  }
  return getStudentVideoPlaybackSqlite(req, res, next);
}

export function getStudentCourseDocuments(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return getStudentCourseDocumentsSupabase(req, res, next);
  }
  return getStudentCourseDocumentsSqlite(req, res, next);
}

export function updateStudentVideoProgress(req, res, next) {
  if (process.env.DATA_BACKEND === 'supabase') {
    return updateStudentVideoProgressSupabase(req, res, next);
  }
  return updateStudentVideoProgressSqlite(req, res, next);
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
