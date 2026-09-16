import { db } from '../config/database.js';
import { verifySignedToken } from '../utils/tokenSigner.js';
import { logSecurityEvent } from '../utils/auditLogger.js';

/**
 * Handles Widevine DRM EME license challenge request from Shaka Player
 * Receives EME challenge, verifies authorization token & student enrollment,
 * forwards to upstream Widevine license server, and returns binary license response.
 */
export async function handleWidevineLicense(req, res, next) {
  try {
    const playbackToken = req.headers['x-playback-token'] || req.query.token;
    const videoId = req.query.videoId || req.body?.videoId;

    // 1. Verify playback token
    if (!playbackToken) {
      return res.status(401).json({
        success: false,
        error: 'Playback authorization token is required for Widevine license request.'
      });
    }

    const tokenPayload = verifySignedToken(playbackToken, {
      expectedResourceType: 'video'
    });

    if (!tokenPayload.valid) {
      logSecurityEvent({
        userId: req.user?.id || null,
        eventType: 'UNAUTHORIZED_ATTEMPT',
        resourceType: 'drm_license',
        resourceId: videoId,
        req,
        status: 'DENIED',
        details: `Invalid or expired playback token: ${tokenPayload.error}`
      });

      return res.status(403).json({
        success: false,
        error: `DRM license request denied: ${tokenPayload.error}`
      });
    }

    const studentId = tokenPayload.data.userId;
    const targetVideoId = videoId || tokenPayload.data.resourceId;

    // 2. Validate student enrollment and video status
    const video = db.prepare(`
      SELECT v.*, c.status AS course_status 
      FROM videos v
      JOIN courses c ON v.course_id = c.id
      WHERE v.id = ?
    `).get(Number(targetVideoId));

    if (!video || video.status !== 'ACTIVE' || video.course_status !== 'ACTIVE') {
      return res.status(404).json({
        success: false,
        error: 'Requested DRM video is unavailable.'
      });
    }

    const enrollment = db.prepare(`
      SELECT * FROM enrollments
      WHERE student_id = ? AND course_id = ?
    `).get(studentId, video.course_id);

    if (!enrollment || enrollment.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: 'Student is not actively enrolled in this course.'
      });
    }

    const now = new Date().toISOString();
    if (now < enrollment.access_start || now > enrollment.access_expiry) {
      return res.status(403).json({
        success: false,
        error: 'Course enrollment access period has expired.'
      });
    }

    // 3. Check upstream Widevine license server configuration
    const licenseUrl = video.license_server_url || process.env.WIDEVINE_LICENSE_URL;
    if (!licenseUrl || !licenseUrl.trim()) {
      return res.status(503).json({
        success: false,
        error: 'Widevine DRM is not configured for this environment.',
        configured: false
      });
    }

    // 4. Forward EME challenge to upstream Widevine license server
    const challengeBody = req.body; // Buffer from express.raw()
    const upstreamHeaders = {
      'Content-Type': 'application/octet-stream'
    };

    if (process.env.WIDEVINE_API_KEY) {
      upstreamHeaders['X-Api-Key'] = process.env.WIDEVINE_API_KEY;
    }
    if (process.env.WIDEVINE_API_SECRET) {
      upstreamHeaders['Authorization'] = `Bearer ${process.env.WIDEVINE_API_SECRET}`;
    }

    try {
      const upstreamResponse = await fetch(licenseUrl, {
        method: 'POST',
        headers: upstreamHeaders,
        body: challengeBody
      });

      if (!upstreamResponse.ok) {
        const errorText = await upstreamResponse.text();
        logSecurityEvent({
          userId: studentId,
          eventType: 'SECURITY_ALERT',
          resourceType: 'drm_license',
          resourceId: targetVideoId,
          req,
          status: 'WARNING',
          details: `Upstream DRM license server error: ${upstreamResponse.status}`
        });

        return res.status(upstreamResponse.status).json({
          success: false,
          error: 'Widevine DRM license server rejected request.'
        });
      }

      const licenseBuffer = await upstreamResponse.arrayBuffer();

      logSecurityEvent({
        userId: studentId,
        eventType: 'VIDEO_PLAYBACK',
        resourceType: 'drm_license',
        resourceId: targetVideoId,
        req,
        status: 'SUCCESS',
        details: { videoTitle: video.title, keySystem: 'com.widevine.alpha' }
      });

      res.setHeader('Content-Type', 'application/octet-stream');
      return res.send(Buffer.from(licenseBuffer));
    } catch (fetchErr) {
      return res.status(502).json({
        success: false,
        error: `Failed to contact Widevine license server: ${fetchErr.message}`
      });
    }
  } catch (error) {
    next(error);
  }
}
