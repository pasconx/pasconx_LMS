import { VideoProvider } from './VideoProvider.js';

export class YouTubeProvider extends VideoProvider {
  constructor() {
    super('youtube');
  }

  /**
   * Return client-safe playback configuration
   */
  getPlaybackConfig(video, user) {
    const origin = process.env.CLIENT_URL || 'http://localhost:5173';
    const videoId = video.external_video_id;

    const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(origin)}&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=0`;

    return {
      provider: 'youtube',
      videoId: videoId,
      embedUrl: embedUrl,
      privacyType: video.privacy_type || 'youtube_unlisted',
      requiresSpecialAuth: video.privacy_type === 'youtube_private',
      isDrmProtected: false,
      disclaimer: video.privacy_type === 'youtube_unlisted'
        ? 'Notice: This course uses YouTube Unlisted video delivery for MVP testing. Direct link sharing outside PASCONX is strictly prohibited by institute policy.'
        : 'Notice: Private YouTube videos require YouTube viewer authorization. If playback fails, ensure your Google account is authorized for this video.'
    };
  }

  /**
   * Validate standard YouTube 11-char ID
   */
  validateId(externalId) {
    if (!externalId || typeof externalId !== 'string') return false;
    const cleanId = externalId.trim();
    return /^[a-zA-Z0-9_-]{11}$/.test(cleanId);
  }

  /**
   * Extract YouTube ID if full URL was accidentally pasted
   */
  extractVideoId(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (this.validateId(trimmed)) return trimmed;

    // Support https://www.youtube.com/watch?v=... and https://youtu.be/...
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = trimmed.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  getSecurityAdvisory() {
    return {
      provider: 'youtube',
      isDrmProtected: false,
      advisoryText: 'YouTube Unlisted videos are intended for testing/MVP delivery. For commercial grade DRM and download prevention, configure VdoCipherProvider.'
    };
  }
}
