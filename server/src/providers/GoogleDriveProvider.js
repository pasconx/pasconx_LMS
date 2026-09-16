import { VideoProvider } from './VideoProvider.js';

/**
 * Google Drive Video Provider Implementation for PASCONX Academy MVP
 * Uses official Google Drive preview embed format:
 * https://drive.google.com/file/d/{FILE_ID}/preview
 */
export class GoogleDriveProvider extends VideoProvider {
  constructor() {
    super('google_drive');
  }

  /**
   * Extract Google Drive File ID from input string (full URL or raw ID)
   * Examples:
   * - https://drive.google.com/file/d/1fkJOdRIonDNO4YYDSno_0hwcBvlcMbMy/view?usp=drive_link
   * - https://drive.google.com/file/d/1fkJOdRIonDNO4YYDSno_0hwcBvlcMbMy/preview
   * - https://drive.google.com/open?id=1fkJOdRIonDNO4YYDSno_0hwcBvlcMbMy
   * - 1fkJOdRIonDNO4YYDSno_0hwcBvlcMbMy
   * @param {string} input 
   * @returns {string|null}
   */
  extractFileId(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();

    // Match /file/d/{FILE_ID}
    const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileDMatch && fileDMatch[1]) {
      return fileDMatch[1];
    }

    // Match open?id={FILE_ID} or uc?id={FILE_ID}
    const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParamMatch && idParamMatch[1]) {
      return idParamMatch[1];
    }

    // Direct File ID check (Google Drive IDs are typically 25-50 characters)
    if (/^[a-zA-Z0-9_-]{15,60}$/.test(trimmed)) {
      return trimmed;
    }

    return null;
  }

  /**
   * Validate Google Drive File ID
   * @param {string} externalId 
   * @returns {boolean}
   */
  validateId(externalId) {
    if (!externalId || typeof externalId !== 'string') return false;
    const cleanId = this.extractFileId(externalId);
    return cleanId !== null;
  }

  /**
   * Generate client-safe playback configuration for Google Drive preview
   * @param {Object} video Database video record
   * @param {Object} user Authenticated student details
   * @returns {Object}
   */
  getPlaybackConfig(video, user) {
    const rawId = video.drive_file_id || video.external_video_id;
    const fileId = this.extractFileId(rawId) || rawId;

    const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;

    return {
      provider: 'google_drive',
      type: 'google_drive',
      fileId: fileId,
      embedUrl: embedUrl,
      isDrmProtected: false,
      disclaimer: 'Google Drive is being used only as an MVP video source. Google Drive does not provide DRM or guaranteed protection against video downloading or sharing. For production-grade protected training videos, migrate the video provider to VdoCipher or another secure video streaming/DRM provider.'
    };
  }

  getSecurityAdvisory() {
    return {
      provider: 'google_drive',
      isDrmProtected: false,
      advisoryText: 'Google Drive is being used only as an MVP video source. Google Drive does not provide DRM or guaranteed protection against video downloading or sharing. For production-grade protected training videos, migrate the video provider to VdoCipher or another secure video streaming/DRM provider.'
    };
  }
}
