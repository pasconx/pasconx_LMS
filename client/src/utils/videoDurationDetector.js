/**
 * Utility to extract video metadata and duration from YouTube, Vimeo, and direct video links.
 */

// Helper to extract 11-char YouTube ID from URL or ID string
export function extractYouTubeId(input) {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  const match = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
  return match ? match[1] : null;
}

// Helper to extract Vimeo ID
export function extractVimeoId(input) {
  if (!input || typeof input !== 'string') return null;
  const match = input.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)/i);
  return match ? match[3] : null;
}

// Convert seconds into human-readable string (e.g. "5m 30s", "1h 15m")
export function formatDurationHuman(seconds) {
  const sec = parseInt(seconds, 10);
  if (!sec || isNaN(sec) || sec <= 0) return '';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const remainingSecs = sec % 60;
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  if (mins > 0) {
    return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;
  }
  return `${remainingSecs}s`;
}

// Load YouTube IFrame API script once
let ytApiPromise = null;
export function loadYouTubeIFrameApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Browser only'));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);

  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!existing) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.onerror = () => reject(new Error('Failed to load YouTube API'));
        document.body.appendChild(tag);
      }

      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev();
        resolve(window.YT);
      };

      const interval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(interval);
          resolve(window.YT);
        }
      }, 150);

      setTimeout(() => {
        clearInterval(interval);
        if (window.YT && window.YT.Player) {
          resolve(window.YT);
        } else {
          reject(new Error('YouTube API load timeout'));
        }
      }, 8000);
    });
  }

  return ytApiPromise;
}

// Detect duration from YouTube video ID using offscreen YT player
export async function getYouTubeDuration(videoId) {
  try {
    const YT = await loadYouTubeIFrameApi();

    return new Promise((resolve) => {
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.top = '-9999px';
      container.style.left = '-9999px';
      container.style.width = '200px';
      container.style.height = '200px';
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);

      let resolved = false;
      let player = null;

      const cleanup = () => {
        if (player && typeof player.destroy === 'function') {
          try { player.destroy(); } catch (_) {}
        }
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      }, 8000);

      try {
        player = new YT.Player(container, {
          videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0
          },
          events: {
            onReady: (event) => {
              if (resolved) return;
              resolved = true;
              clearTimeout(timer);
              try {
                const dur = Math.round(event.target.getDuration());
                const data = event.target.getVideoData();
                cleanup();
                resolve({ duration: dur > 0 ? dur : null, title: data?.title || '' });
              } catch (_) {
                cleanup();
                resolve(null);
              }
            },
            onError: () => {
              if (resolved) return;
              resolved = true;
              clearTimeout(timer);
              cleanup();
              resolve(null);
            }
          }
        });
      } catch (_) {
        clearTimeout(timer);
        cleanup();
        resolve(null);
      }
    });
  } catch (_) {
    return null;
  }
}

// Fetch YouTube oEmbed metadata (instant, no iframe needed)
export async function getYouTubeOEmbed(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (res.ok) {
      const data = await res.json();
      return { title: data.title || '', author: data.author_name || '', thumbnail: data.thumbnail_url || '' };
    }
  } catch (_) {}
  return null;
}

// Fetch Vimeo metadata & duration
export async function getVimeoMetadata(vimeoId) {
  try {
    const res = await fetch(`https://vimeo.com/api/v2/video/${vimeoId}.json`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data[0]) {
        return {
          duration: Math.round(data[0].duration),
          title: data[0].title || ''
        };
      }
    }
  } catch (_) {}
  return null;
}

// Direct video element duration detection (.mp4, .webm, etc.)
export async function getDirectVideoDuration(url) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;

    const timer = setTimeout(() => {
      video.src = '';
      resolve(null);
    }, 6000);

    video.onloadedmetadata = () => {
      clearTimeout(timer);
      const d = Math.round(video.duration);
      video.src = '';
      if (d && !isNaN(d) && isFinite(d) && d > 0) {
        resolve({ duration: d });
      } else {
        resolve(null);
      }
    };

    video.onerror = () => {
      clearTimeout(timer);
      video.src = '';
      resolve(null);
    };
  });
}

/**
 * Main detection orchestrator:
 * Given a URL or ID, automatically inspects provider and returns:
 * { duration: number, title?: string, provider: string, videoId?: string }
 */
export async function detectVideoDuration(input, videoType = 'youtube') {
  if (!input || typeof input !== 'string') return null;
  const cleanInput = input.trim();
  if (!cleanInput) return null;

  // 1. YouTube detection
  const ytId = extractYouTubeId(cleanInput);
  if (ytId || (videoType === 'youtube' && cleanInput.length === 11)) {
    const targetId = ytId || cleanInput;
    const [playerData, oEmbedData] = await Promise.all([
      getYouTubeDuration(targetId),
      getYouTubeOEmbed(targetId)
    ]);
    return {
      provider: 'youtube',
      videoId: targetId,
      duration: playerData?.duration || null,
      title: oEmbedData?.title || playerData?.title || null
    };
  }

  // 2. Vimeo detection
  const vimeoId = extractVimeoId(cleanInput);
  if (vimeoId) {
    const vimeoData = await getVimeoMetadata(vimeoId);
    if (vimeoData) {
      return {
        provider: 'vimeo',
        videoId: vimeoId,
        duration: vimeoData.duration,
        title: vimeoData.title
      };
    }
  }

  // 3. Direct HTML5 video file (.mp4, .webm, .m4v, .mov, etc.)
  if (/\.(mp4|webm|ogg|m4v|mov)(\?.*)?$/i.test(cleanInput)) {
    const directData = await getDirectVideoDuration(cleanInput);
    if (directData && directData.duration) {
      return {
        provider: 'direct',
        duration: directData.duration
      };
    }
  }

  return null;
}
