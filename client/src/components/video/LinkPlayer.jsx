import React, { useEffect, useRef, useState } from 'react';
import shaka from 'shaka-player';
import DynamicWatermark from './DynamicWatermark.jsx';
import { AlertCircle, ExternalLink, ShieldCheck } from 'lucide-react';

/**
 * Plays "Video Link" lessons. `playback.kind` decides how:
 *   direct  -> <video> (mp4/webm/...)      hls -> <video> via shaka-player (.m3u8)
 *   youtube | drive | vimeo | loom | embed -> sandboxed <iframe>
 * Direct/HLS videos report progress; iframe embeds cannot (browser limitation).
 */
export default function LinkPlayer({
  playback,
  initialProgressSeconds = 0,
  onProgressUpdate,
  student,
  watermarkProfile,
  playerControlRef
}) {
  const videoRef = useRef(null);
  const lastSyncRef = useRef(0);
  const [error, setError] = useState('');

  const kind = playback?.kind;
  const isFileVideo = kind === 'direct' || kind === 'hls';

  // expose seekTo for notes timestamps
  useEffect(() => {
    if (!playerControlRef) return;
    playerControlRef.current = {
      seekTo: (sec) => {
        if (videoRef.current) {
          videoRef.current.currentTime = sec;
          videoRef.current.play?.().catch(() => {});
        }
      },
      getCurrentTime: () => videoRef.current?.currentTime || 0
    };
    return () => { playerControlRef.current = null; };
  }, [playerControlRef, kind]);

  // attach HLS / direct source
  useEffect(() => {
    if (!isFileVideo || !videoRef.current || !playback?.directUrl) return;
    const el = videoRef.current;
    let player = null;
    let cancelled = false;

    const onLoaded = () => {
      if (initialProgressSeconds > 5 && el.duration && initialProgressSeconds < el.duration - 5) {
        el.currentTime = initialProgressSeconds;
      }
    };
    el.addEventListener('loadedmetadata', onLoaded);

    (async () => {
      try {
        if (kind === 'hls') {
          if (el.canPlayType('application/vnd.apple.mpegurl')) {
            el.src = playback.directUrl; // Safari native HLS
          } else {
            shaka.polyfill.installAll();
            if (!shaka.Player.isBrowserSupported()) throw new Error('Browser not supported for this stream.');
            player = new shaka.Player();
            await player.attach(el);
            player.addEventListener('error', (e) => setError(`Playback error (${e.detail?.code || 'unknown'}).`));
            await player.load(playback.directUrl);
          }
        } else {
          el.src = playback.directUrl;
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Unable to load this video.');
      }
    })();

    return () => {
      cancelled = true;
      el.removeEventListener('loadedmetadata', onLoaded);
      if (player) player.destroy().catch(() => {});
    };
  }, [isFileVideo, kind, playback?.directUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncProgress = (force = false) => {
    const el = videoRef.current;
    if (!el || !onProgressUpdate || !el.duration) return;
    const now = Date.now();
    if (!force && now - lastSyncRef.current < 15000) return;
    lastSyncRef.current = now;
    const pct = el.currentTime / el.duration;
    onProgressUpdate(Math.floor(el.currentTime), pct >= 0.9);
  };

  if (!playback) return null;

  return (
    <div className="rounded-2xl overflow-hidden bg-black shadow-xl border border-slate-800">
      <div className="relative w-full aspect-video bg-black select-none">
        {isFileVideo ? (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full bg-black"
            controls
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            disableRemotePlayback
            playsInline
            onContextMenu={(e) => e.preventDefault()}
            onTimeUpdate={() => syncProgress(false)}
            onPause={() => syncProgress(true)}
            onEnded={() => syncProgress(true)}
          />
        ) : (
          <iframe
            src={playback.embedUrl}
            title="Lesson video"
            className="absolute inset-0 w-full h-full border-0"
            allow="autoplay; fullscreen; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
          />
        )}

        {/* dynamic watermark (student identity) */}
        <div className="absolute inset-0 pointer-events-none">
          <DynamicWatermark student={student} watermarkProfile={watermarkProfile} />
        </div>

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center">
            <div className="space-y-2">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
              <p className="text-sm text-slate-200">{error}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-2.5 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          {playback.disclaimer}
        </span>
        {!isFileVideo && (
          <span className="inline-flex items-center gap-1 text-slate-500">
            <ExternalLink className="w-3 h-3" /> Progress tracking not available for this source
          </span>
        )}
      </div>
    </div>
  );
}
