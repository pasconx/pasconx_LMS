/**
 * Base Video Provider Interface
 * All video providers (YouTube, VdoCipher, etc.) must extend this class
 * and implement playback payload generation and validation.
 */
export class VideoProvider {
  /**
   * @param {string} name Provider identifier
   */
  constructor(name) {
    if (new.target === VideoProvider) {
      throw new TypeError("Cannot construct VideoProvider instances directly.");
    }
    this.name = name;
  }

  /**
   * Generates client playback configuration payload for the video
   * @param {Object} video Video record from database
   * @param {Object} user Authenticated user details
   * @returns {Object} Clean playback payload without sensitive credentials
   */
  getPlaybackConfig(video, user) {
    throw new Error("Method 'getPlaybackConfig()' must be implemented.");
  }

  /**
   * Validates provider-specific video ID or upload metadata
   * @param {string} externalId 
   * @returns {boolean}
   */
  validateId(externalId) {
    throw new Error("Method 'validateId()' must be implemented.");
  }

  /**
   * Provider security disclaimer and admin advisories
   * @returns {Object}
   */
  getSecurityAdvisory() {
    return {
      provider: this.name,
      isDrmProtected: false,
      advisoryText: ""
    };
  }
}
