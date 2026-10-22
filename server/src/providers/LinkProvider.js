import { VideoProvider } from './VideoProvider.js';

/**
 * Generic "Video Link" provider.
 * Admin pastes ANY video URL (or an <iframe ...> embed snippet) and the portal figures out how to play it:
 *   - YouTube (watch / youtu.be / shorts / embed)    -> privacy-friendly iframe
 *   - Google Drive file link                          -> /preview iframe
 *   - Vimeo                                           -> player.vimeo.com iframe
 *   - Loom                                            -> loom embed iframe
 *   - Direct files  (.mp4 .webm .ogg .mov .m4v)       -> HTML5 <video>
 *   - HLS streams   (.m3u8)                           -> HTML5 <video> + hls.js
 *   - Anything else (https)                           -> generic iframe embed
 *
 * The final playable URL is stored in videos.manifest_url (video_type = 'link').
 */
export class LinkProvider extends VideoProvider {
  constructor() {
    super('link');
  }

  /** Accepts a URL or a pasted <iframe src="..."> snippet. Returns { ok, url, error } */
  parseInput(input) {
    if (!input || typeof input !== 'string') {
      return { ok: false, error: 'Video link / URL is required.' };
    }
    let raw = input.trim();

    const iframeMatch = raw.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
    if (iframeMatch) raw = iframeMatch[1].trim();
    if (raw.startsWith('//')) raw = `https:${raw}`;

    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return { ok: false, error: 'Invalid link. Please paste a full URL starting with https://' };
    }

    if (parsed.protocol !== 'https:') {
      return { ok: false, error: 'Only secure https:// links are allowed.' };
    }
    if (raw.length > 2000) {
      return { ok: false, error: 'Link is too long.' };
    }
    return { ok: true, url: parsed.toString() };
  }

  /** Works out how to play a stored URL */
  classify(urlString) {
    let u;
    try {
      u = new URL(urlString);
    } catch {
      return { kind: 'embed', embedUrl: urlString };
    }
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname;

    // YouTube
    if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      let id = null;
      if (host === 'youtu.be') id = path.slice(1).split('/')[0];
      else if (path.startsWith('/watch')) id = u.searchParams.get('v');
      else {
        const m = path.match(/^\/(embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
        if (m) id = m[2];
      }
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
        return {
          kind: 'youtube',
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&iv_load_policy=3`
        };
      }
    }

    // Google Drive
    if (host === 'drive.google.com' || host === 'docs.google.com') {
      const m = path.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || null;
      const id = m ? m[1] : u.searchParams.get('id');
      if (id) {
        return { kind: 'drive', embedUrl: `https://drive.google.com/file/d/${id}/preview` };
      }
    }

    // Vimeo
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const m = path.match(/\/(?:video\/)?(\d+)(?:\/([a-z0-9]+))?/i);
      if (m) {
        const hash = u.searchParams.get('h') || m[2];
        const q = hash ? `?h=${encodeURIComponent(hash)}` : '';
        return { kind: 'vimeo', embedUrl: `https://player.vimeo.com/video/${m[1]}${q}` };
      }
    }

    // Loom
    if (host === 'loom.com') {
      const m = path.match(/\/(?:share|embed)\/([a-f0-9]{32})/i);
      if (m) return { kind: 'loom', embedUrl: `https://www.loom.com/embed/${m[1]}` };
    }

    // Direct files / HLS
    if (/\.(mp4|webm|ogg|ogv|mov|m4v)$/i.test(path)) {
      return { kind: 'direct', directUrl: u.toString() };
    }
    if (/\.m3u8$/i.test(path)) {
      return { kind: 'hls', directUrl: u.toString() };
    }

    // Anything else: try as iframe embed
    return { kind: 'embed', embedUrl: u.toString() };
  }

  getPlaybackConfig(video, user) {
    const url = video.manifest_url || '';
    const info = this.classify(url);
    let host = '';
    try { host = new URL(url).hostname; } catch { /* ignore */ }

    return {
      provider: 'link',
      type: 'link',
      kind: info.kind,
      embedUrl: info.embedUrl || null,
      directUrl: info.directUrl || null,
      sourceHost: host,
      isDrmProtected: false,
      disclaimer: 'This lesson is delivered from an external video link. Sharing, recording or redistributing PASCONX class videos is strictly prohibited.'
    };
  }

  validateId(externalId) {
    return !!externalId && typeof externalId === 'string';
  }

  getSecurityAdvisory() {
    return {
      provider: 'link',
      isDrmProtected: false,
      advisoryText: 'Link videos are only as private as the source link. Use unlisted/private-share links and restrict sharing at the source (YouTube Unlisted, Drive "Anyone with link", Vimeo domain-restricted embed).'
    };
  }
}
