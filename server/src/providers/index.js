import { YouTubeProvider } from './YouTubeProvider.js';
import { VdoCipherProvider } from './VdoCipherProvider.js';
import { WidevineProvider } from './WidevineProvider.js';
import { LinkProvider } from './LinkProvider.js';

const providers = {
  youtube: new YouTubeProvider(),
  vdocipher: new VdoCipherProvider(),
  widevine: new WidevineProvider(),
  link: new LinkProvider()
};

/**
 * Returns the requested video provider instance, or defaults to environment variable VIDEO_PROVIDER
 * @param {string} [name] 
 * @returns {VideoProvider}
 */
export function getVideoProvider(name) {
  const providerKey = (name || process.env.VIDEO_PROVIDER || 'youtube').toLowerCase();
  const provider = providers[providerKey];
  if (!provider) {
    throw new Error(`Unsupported video provider: "${providerKey}". Supported providers: youtube, widevine, vdocipher, link`);
  }
  return provider;
}

export { YouTubeProvider, VdoCipherProvider, WidevineProvider, LinkProvider };

