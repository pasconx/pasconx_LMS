import { YouTubeProvider } from './YouTubeProvider.js';
import { VdoCipherProvider } from './VdoCipherProvider.js';
import { GoogleDriveProvider } from './GoogleDriveProvider.js';

const providers = {
  google_drive: new GoogleDriveProvider(),
  googledrive: new GoogleDriveProvider(),
  youtube: new YouTubeProvider(),
  vdocipher: new VdoCipherProvider()
};

/**
 * Returns the requested video provider instance, or defaults to environment variable VIDEO_PROVIDER
 * @param {string} [name] 
 * @returns {VideoProvider}
 */
export function getVideoProvider(name) {
  const providerKey = (name || process.env.VIDEO_PROVIDER || 'google_drive').toLowerCase();
  const provider = providers[providerKey];
  if (!provider) {
    throw new Error(`Unsupported video provider: "${providerKey}". Supported providers: google_drive, youtube, vdocipher`);
  }
  return provider;
}

export { YouTubeProvider, VdoCipherProvider, GoogleDriveProvider };
