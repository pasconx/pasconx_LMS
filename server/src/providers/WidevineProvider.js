import { VideoProvider } from './VideoProvider.js';
import { generateSignedToken } from '../utils/tokenSigner.js';

export class WidevineProvider extends VideoProvider {
  constructor() {
    super('widevine');
  }

  get licenseUrl() {
    return process.env.WIDEVINE_LICENSE_URL || '';
  }

  get providerName() {
    return (process.env.WIDEVINE_PROVIDER || 'generic').toLowerCase();
  }

  get apiKey() {
    return process.env.WIDEVINE_API_KEY || '';
  }

  get apiSecret() {
    return process.env.WIDEVINE_API_SECRET || '';
  }

  /**
   * Check if legitimate DRM license provider credentials/URL are configured
   */
  isConfigured() {
    return Boolean(this.licenseUrl && this.licenseUrl.trim());
  }

  /**
   * Return client-safe playback configuration
   * Never exposes raw encryption keys, cloud storage credentials, or DRM provider secrets.
   */
  getPlaybackConfig(video, user) {
    const isConfigured = this.isConfigured() || Boolean(video.license_server_url);

    if (!isConfigured) {
      return {
        provider: 'widevine',
        videoType: 'widevine',
        videoId: video.external_video_id,
        manifestUrl: video.manifest_url || null,
        licenseServerUrl: null,
        isDrmProtected: true,
        isConfigured: false,
        keySystem: 'com.widevine.alpha',
        disclaimer: 'Widevine DRM is not configured for this environment.',
        unconfiguredMessage: 'Widevine DRM is not configured for this environment.'
      };
    }

    // Generate short-lived media authorization token for Shaka Player license acquisition
    const playbackToken = generateSignedToken({
      userId: user.id,
      resourceType: 'video',
      resourceId: video.id,
      courseId: video.course_id,
      expiresInSeconds: 900 // 15 minutes
    });

    return {
      provider: 'widevine',
      videoType: 'widevine',
      videoId: video.external_video_id,
      manifestUrl: video.manifest_url,
      // Shaka Player acquires license through our protected backend proxy
      licenseServerUrl: `/api/drm/license?videoId=${video.id}`,
      isDrmProtected: true,
      isConfigured: true,
      keySystem: 'com.widevine.alpha',
      playbackToken: playbackToken,
      licenseHeaders: {
        'X-Playback-Token': playbackToken
      },
      disclaimer: 'Secured with Google Widevine Modular DRM. Content is encrypted and watermarked.'
    };
  }

  /**
   * Validate DASH manifest URL
   */
  validateManifest(manifestUrl) {
    if (!manifestUrl || typeof manifestUrl !== 'string') return false;
    try {
      const parsed = new URL(manifestUrl);
      return parsed.pathname.endsWith('.mpd') || parsed.pathname.includes('/dash/') || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Validate Widevine asset/external ID
   */
  validateId(externalId) {
    if (!externalId || typeof externalId !== 'string') return false;
    return /^[a-zA-Z0-9_\-\.\/]{1,128}$/.test(externalId.trim());
  }

  getSecurityAdvisory() {
    return {
      provider: 'widevine',
      isDrmProtected: true,
      advisoryText: 'Widevine DRM encrypts video segments with standard AES-128-CTR and delivers licenses through authenticated EME exchange.'
    };
  }
}
