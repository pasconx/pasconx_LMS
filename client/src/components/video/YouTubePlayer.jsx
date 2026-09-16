import React, { useEffect, useRef, useState } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  RotateCcw, 
  CheckCircle2, 
  Clock, 
  Lock, 
  ShieldCheck, 
  Captions
} from 'lucide-react';
import DynamicWatermark from './DynamicWatermark.jsx';

export default function YouTubePlayer({
  videoId,
  duration = 0,
  initialProgressSeconds = 0,
  onProgressUpdate,
  privacyType = 'youtube_unlisted',
  disclaimer,
  student,
  watermarkProfile
}) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const shouldAutoPlayRef = useRef(false);

  // Playback states
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [videoDuration, setVideoDuration] = useState(duration || 0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [isCcEnabled, setIsCcEnabled] = useState(false);

  const progressPercent = videoDuration > 0
    ? Math.min(100, (currentSeconds / videoDuration) * 100)
    : 0;

  // Initialize YouTube Player with controls: 0 (completely removes native YouTube share & logo)
  useEffect(() => {
    let isMounted = true;
    const playerId = `yt-player-${videoId}`;

    function initPlayer() {
      if (!isMounted) return;
      if (!window.YT || !window.YT.Player) return;

      const containerElem = document.getElementById(playerId);
      if (!containerElem) return;

      try {
        if (playerRef.current && typeof playerRef.current.destroy === 'function') {
          try { playerRef.current.destroy(); } catch (e) {}
        }

        playerRef.current = new window.YT.Player(playerId, {
          width: '100%',
          height: '100%',
          videoId: videoId,
          playerVars: {
            controls: 0,        // Hides native YouTube control bar, Share button, and YouTube logo
            disablekb: 1,       // Disables native YouTube hotkeys
            modestbranding: 1,  // Minimal branding
            rel: 0,             // No related videos outside channel
            fs: 0,              // Hides native fullscreen button
            iv_load_policy: 3,  // Turns off video annotations
            playsinline: 1,
            enablejsapi: 1,
            cc_lang_pref: 'en',
            cc_load_policy: 1,
            origin: window.location.origin
          },
          events: {
            onReady: (event) => {
              if (!isMounted) return;
              setPlayerReady(true);
              const total = event.target.getDuration();
              if (total && total > 0) {
                setVideoDuration(Math.round(total));
              }

              // Handle initial progress: if video was previously finished, start at 0
              if (initialProgressSeconds && initialProgressSeconds > 0 && total && initialProgressSeconds < (total - 3)) {
                event.target.seekTo(initialProgressSeconds, true);
                setCurrentSeconds(Math.round(initialProgressSeconds));
              } else {
                setCurrentSeconds(0);
              }

              // If student clicked play while player was initializing, play now
              if (shouldAutoPlayRef.current) {
                event.target.playVideo();
                shouldAutoPlayRef.current = false;
              }
            },
            onStateChange: (event) => {
              if (!isMounted) return;
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setIsPlaying(false);
                syncProgress();
              } else if (event.data === window.YT.PlayerState.ENDED) {
                setIsPlaying(false);
                setCompleted(true);
                if (onProgressUpdate) {
                  onProgressUpdate(videoDuration || currentSeconds, true);
                }
              }
            },
            onError: (err) => {
              console.warn('YouTube Player API issue:', err);
              setApiError(true);
            }
          }
        });
      } catch (e) {
        console.error('Player instantiation failed:', e);
        setApiError(true);
      }
    }

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!existing) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }

      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevCallback === 'function') prevCallback();
        initPlayer();
      };

      const checkTimer = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkTimer);
          initPlayer();
        }
      }, 300);

      const failTimeout = setTimeout(() => {
        clearInterval(checkTimer);
      }, 6000);

      return () => {
        isMounted = false;
        clearInterval(checkTimer);
        clearTimeout(failTimeout);
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        if (playerRef.current && typeof playerRef.current.destroy === 'function') {
          try { playerRef.current.destroy(); } catch (e) {}
        }
      };
    }

    return () => {
      isMounted = false;
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try { playerRef.current.destroy(); } catch (e) {}
      }
    };
  }, [videoId]);

  // Periodic progress polling
  useEffect(() => {
    if (isPlaying) {
      progressIntervalRef.current = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          const currentTime = Math.round(playerRef.current.getCurrentTime());
          const totalDuration = Math.round(playerRef.current.getDuration() || videoDuration);

          setCurrentSeconds(currentTime);
          if (totalDuration > 0 && videoDuration !== totalDuration) {
            setVideoDuration(totalDuration);
          }

          const isNearEnd = totalDuration > 0 && (currentTime / totalDuration) >= 0.90;
          if (isNearEnd && !completed) {
            setCompleted(true);
          }

          if (onProgressUpdate) {
            onProgressUpdate(currentTime, isNearEnd || completed);
          }
        }
      }, 3000);
    } else {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isPlaying, videoDuration, completed, onProgressUpdate]);

  // Track native fullscreen changes
  useEffect(() => {
    const onFullscreenChange = () => {
      const inFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(inFullscreen);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  const syncProgress = () => {
    if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
      const currentTime = Math.round(playerRef.current.getCurrentTime());
      const totalDuration = Math.round(playerRef.current.getDuration() || videoDuration);
      setCurrentSeconds(currentTime);
      const isNearEnd = totalDuration > 0 && (currentTime / totalDuration) >= 0.90;
      if (onProgressUpdate) {
        onProgressUpdate(currentTime, isNearEnd || completed);
      }
    }
  };

  // Custom Controls Handlers
  const handleTogglePlay = (e) => {
    e?.stopPropagation();
    if (!playerRef.current || typeof playerRef.current.playVideo !== 'function') {
      shouldAutoPlayRef.current = !shouldAutoPlayRef.current;
      return;
    }
    try {
      if (isPlaying) {
        playerRef.current.pauseVideo();
      } else {
        // If completed or within 2 seconds of end, seek back to 0
        if (typeof playerRef.current.getCurrentTime === 'function' && typeof playerRef.current.getDuration === 'function') {
          const curr = playerRef.current.getCurrentTime();
          const dur = playerRef.current.getDuration();
          if (dur > 0 && curr >= dur - 2) {
            playerRef.current.seekTo(0, true);
            setCurrentSeconds(0);
          }
        }
        playerRef.current.playVideo();
      }
    } catch (err) {
      console.warn('Playback toggle error:', err);
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = Math.max(0, Math.min(videoDuration, Math.round(pos * videoDuration)));
    setCurrentSeconds(target);
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(target, true);
    }
  };

  const handleToggleMute = (e) => {
    e?.stopPropagation();
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.unMute?.();
      setIsMuted(false);
      playerRef.current.setVolume?.(volume || 80);
    } else {
      playerRef.current.mute?.();
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    if (playerRef.current) {
      playerRef.current.setVolume?.(val);
      if (val === 0) {
        playerRef.current.mute?.();
        setIsMuted(true);
      } else if (isMuted) {
        playerRef.current.unMute?.();
        setIsMuted(false);
      }
    }
  };

  const handleSpeedChange = (speed) => {
    setPlaybackRate(speed);
    if (playerRef.current && typeof playerRef.current.setPlaybackRate === 'function') {
      playerRef.current.setPlaybackRate(speed);
    }
  };

  const handleToggleCc = (e) => {
    e?.stopPropagation();
    if (!playerRef.current) return;
    try {
      if (isCcEnabled) {
        if (typeof playerRef.current.unloadModule === 'function') {
          playerRef.current.unloadModule('captions');
        }
        if (typeof playerRef.current.setOption === 'function') {
          playerRef.current.setOption('captions', 'track', {});
          playerRef.current.setOption('cc', 'track', {});
        }
        setIsCcEnabled(false);
      } else {
        if (typeof playerRef.current.loadModule === 'function') {
          playerRef.current.loadModule('captions');
        }
        if (typeof playerRef.current.setOption === 'function') {
          playerRef.current.setOption('captions', 'track', { languageCode: 'en' });
          playerRef.current.setOption('cc', 'track', { languageCode: 'en' });
        }
        setIsCcEnabled(true);
      }
    } catch (err) {
      console.warn('Captions toggle error:', err);
      setIsCcEnabled(!isCcEnabled);
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div 
      className="space-y-4 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <style>{`
        #yt-player-${videoId} {
          width: 100% !important;
          height: 100% !important;
          display: block;
        }
        #yt-player-${videoId} iframe {
          width: 100% !important;
          height: 100% !important;
        }
        @media print {
          body, html, * {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}</style>

      {/* Main Video Frame with Custom PASCONX Controls and Dynamic Watermark */}
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        className="relative aspect-video w-full bg-black overflow-hidden select-none rounded-2xl shadow-2xl border border-slate-800"
      >
        {/* The YouTube Iframe */}
        <div className="absolute inset-0 w-full h-full pointer-events-none">
          {!apiError ? (
            <div id={`yt-player-${videoId}`} className="w-full h-full" />
          ) : (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&controls=0&disablekb=1&fs=0&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`}
              title="PASCONX Video Player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              className="w-full h-full border-0 pointer-events-none"
            />
          )}
        </div>

        {/* Dynamic Student Watermark Overlay */}
        <DynamicWatermark 
          student={student} 
          watermarkProfile={watermarkProfile} 
        />

        {/* Full-Frame Transparent Click Layer for Play/Pause */}
        <div 
          className="absolute inset-0 z-10 cursor-pointer pointer-events-auto"
          onClick={handleTogglePlay}
          onDoubleClick={handleToggleFullscreen}
        />

        {/* PASCONX TOP HEADER */}
        <div 
          className={`absolute top-0 left-0 right-0 h-16 z-25 pointer-events-auto bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-start justify-between px-5 pt-3 transition-opacity duration-300 ${
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-white border border-slate-700 overflow-hidden flex items-center justify-center p-0.5 shadow-sm">
              <img src="/logo.jpg" alt="PX" className="h-full w-full object-contain" />
            </div>
            <div>
              <span className="font-extrabold text-xs text-white tracking-wider flex items-center gap-1.5">
                PASCON<span className="text-[#0c8ee7]">X</span> ACADEMY
                <span className="text-[9px] font-mono uppercase bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded border border-brand-400/30">
                  Protected Stream
                </span>
              </span>
              <p className="text-[10px] text-slate-400 font-medium">Transforming Talent into IT Xperts</p>
            </div>
          </div>

          <div className="text-[11px] text-slate-300 font-mono bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 hidden sm:flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-brand-400" />
            <span>{student?.email || 'Authorized Student'}</span>
          </div>
        </div>

        {/* Center Play/Pause Indicator Animation */}
        {!isPlaying && (
          <div 
            onClick={handleTogglePlay}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-auto cursor-pointer group"
          >
            <div className="w-20 h-20 rounded-full bg-brand-600/90 hover:bg-brand-500 text-white flex items-center justify-center shadow-2xl backdrop-blur-sm transition-all transform group-hover:scale-110 cursor-pointer">
              <Play className="w-9 h-9 fill-current ml-1" />
            </div>
            {!playerReady && !apiError && (
              <div className="mt-4 text-xs font-semibold text-slate-300 bg-black/70 px-3.5 py-1 rounded-full border border-white/10 flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                <span>Connecting secure stream...</span>
              </div>
            )}
          </div>
        )}

        {/* Custom PASCONX Control Bar */}
        <div 
          className={`absolute bottom-0 left-0 right-0 z-30 pointer-events-auto bg-gradient-to-t from-black/95 via-black/80 to-transparent pt-6 pb-3 px-4 space-y-2 transition-opacity duration-300 ${
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress Timeline Scrubber */}
          <div 
            onClick={handleSeek}
            className="w-full h-2 bg-slate-700/60 hover:h-3 rounded-full cursor-pointer relative overflow-hidden transition-all group/scrub"
          >
            <div 
              className={`h-full rounded-full transition-all duration-100 ${
                completed ? 'bg-emerald-500' : 'bg-brand-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between gap-4 text-white text-xs">
            {/* Left Controls: Play/Pause, Time */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleTogglePlay}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              <button
                onClick={() => {
                  const target = Math.max(0, currentSeconds - 10);
                  setCurrentSeconds(target);
                  playerRef.current?.seekTo?.(target, true);
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                title="Rewind 10 seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <div className="font-mono text-xs text-slate-300">
                <span>{formatTime(currentSeconds)}</span>
                <span className="text-slate-500 mx-1">/</span>
                <span className="text-slate-400">{formatTime(videoDuration)}</span>
              </div>

              {/* Volume & Mute */}
              <div className="flex items-center gap-1.5 group/vol">
                <button
                  onClick={handleToggleMute}
                  className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 bg-slate-600 accent-brand-500 cursor-pointer hidden group-hover/vol:inline-block sm:inline-block"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Playback Speed Selector */}
              <div className="flex items-center bg-white/10 rounded-lg p-0.5 border border-white/10">
                {[1, 1.25, 1.5, 2].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => handleSpeedChange(speed)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                      playbackRate === speed 
                        ? 'bg-brand-600 text-white shadow-xs' 
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              {/* Subtitles / Closed Captions (CC) Toggle */}
              <button
                onClick={handleToggleCc}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold font-mono uppercase flex items-center gap-1 transition-all cursor-pointer ${
                  isCcEnabled 
                    ? 'bg-brand-600 text-white shadow-xs border border-brand-400/40 ring-1 ring-brand-400/50' 
                    : 'bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white border border-white/10'
                }`}
                title={isCcEnabled ? "Disable Subtitles (CC)" : "Enable Subtitles (CC)"}
              >
                <Captions className="w-3.5 h-3.5" />
                <span>CC</span>
              </button>

              {/* Fullscreen Toggle */}
              <button
                onClick={handleToggleFullscreen}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>

              {/* PASCONX Official Logo Badge */}
              <div className="flex items-center gap-1.5 pl-2 border-l border-white/15">
                <img src="/logo.jpg" alt="PX" className="w-4 h-4 object-contain rounded" />
                <span className="font-extrabold tracking-wider text-[11px] text-white hidden sm:inline">PASCON<span className="text-[#0c8ee7]">X</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-auto flex-1">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-brand-600" />
              Module Progress: <strong className="text-slate-900">{Math.round(progressPercent)}%</strong>
              {completed && (
                <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] font-bold border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" /> Completed
                </span>
              )}
            </span>
            <span className="text-slate-500 font-mono text-[11px]">
              {formatTime(currentSeconds)} / {formatTime(videoDuration)}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 transition-all duration-300 rounded-full ${
                completed ? 'bg-emerald-500' : 'bg-brand-600'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
            <ShieldCheck className="w-3.5 h-3.5" /> STEALTH_CONTENT_MODE
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <Lock className="w-3.5 h-3.5" /> Watermarked Session
          </span>
        </div>
      </div>

      {/* Security Statement */}
      <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-3.5 flex items-start gap-3 text-xs text-slate-700">
        <ShieldCheck className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="font-semibold text-slate-900">Protected Course Stream: </strong>
          Streaming session authorized for <code className="font-mono text-slate-900 font-bold">{student?.email}</code>. Content is dynamically watermarked under academic policy. Casual downloading and direct link sharing are restricted.
        </div>
      </div>
    </div>
  );
}
