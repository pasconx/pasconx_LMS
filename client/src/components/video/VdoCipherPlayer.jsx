import React, { useState, useRef, useEffect } from 'react';
import DynamicWatermark from './DynamicWatermark.jsx';
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
  Captions,
  Info
} from 'lucide-react';

export default function VdoCipherPlayer({
  videoId,
  otp,
  playbackInfo,
  embedUrl,
  title,
  duration = 0,
  initialCompleted = 0,
  initialProgressSeconds = 0,
  onProgressUpdate,
  disclaimer,
  student,
  watermarkProfile
}) {
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const vdoPlayerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const progressIntervalRef = useRef(null);

  // Playback states
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(initialProgressSeconds || 0);
  const [videoDuration, setVideoDuration] = useState(duration || 0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [completed, setCompleted] = useState(initialCompleted === 1);
  const [isCcEnabled, setIsCcEnabled] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const playerSrc = embedUrl || `https://player.vdocipher.com/v2/?otp=${otp}&playbackInfo=${playbackInfo}`;

  const progressPercent = videoDuration > 0
    ? Math.min(100, (currentSeconds / videoDuration) * 100)
    : (completed ? 100 : 0);

  // Load VdoCipher JS SDK and hook video element events
  useEffect(() => {
    let isMounted = true;

    function attachPlayerEvents() {
      if (!isMounted || !iframeRef.current || !window.VdoPlayer) return;
      try {
        const player = window.VdoPlayer.getInstance(iframeRef.current);
        if (player) {
          vdoPlayerRef.current = player;
          setPlayerReady(true);

          if (player.video) {
            const vid = player.video;

            const handleTimeUpdate = () => {
              if (!isMounted) return;
              const curr = Math.round(vid.currentTime || 0);
              const dur = Math.round(vid.duration || videoDuration || duration || 0);
              setCurrentSeconds(curr);
              if (dur > 0 && dur !== videoDuration) {
                setVideoDuration(dur);
              }
              const isNearEnd = dur > 0 && (curr / dur) >= 0.90;
              if (isNearEnd && !completed) {
                setCompleted(true);
              }
              if (onProgressUpdate) {
                onProgressUpdate(curr, isNearEnd || completed);
              }
            };

            const handlePlay = () => isMounted && setIsPlaying(true);
            const handlePause = () => isMounted && setIsPlaying(false);
            const handleEnded = () => {
              if (!isMounted) return;
              setIsPlaying(false);
              setCompleted(true);
              if (onProgressUpdate) {
                onProgressUpdate(videoDuration || currentSeconds, true);
              }
            };

            vid.addEventListener('timeupdate', handleTimeUpdate);
            vid.addEventListener('play', handlePlay);
            vid.addEventListener('pause', handlePause);
            vid.addEventListener('ended', handleEnded);

            if (initialProgressSeconds && initialProgressSeconds > 0) {
              try { vid.currentTime = initialProgressSeconds; } catch (e) {}
            }
          }
        }
      } catch (err) {
        console.warn('VdoPlayer instance connection notice:', err);
      }
    }

    if (window.VdoPlayer) {
      attachPlayerEvents();
    } else {
      const existing = document.querySelector('script[src*="vdocipher.com/v2/api.js"]');
      if (!existing) {
        const tag = document.createElement('script');
        tag.src = 'https://player.vdocipher.com/v2/api.js';
        tag.onload = attachPlayerEvents;
        document.body.appendChild(tag);
      } else {
        existing.addEventListener('load', attachPlayerEvents);
      }

      const pollTimer = setInterval(() => {
        if (window.VdoPlayer) {
          clearInterval(pollTimer);
          attachPlayerEvents();
        }
      }, 300);

      return () => {
        isMounted = false;
        clearInterval(pollTimer);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [otp, playbackInfo]);

  // Track Fullscreen status
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

  // Controls Handlers
  const handleTogglePlay = (e) => {
    e?.stopPropagation();
    if (vdoPlayerRef.current?.video) {
      const vid = vdoPlayerRef.current.video;
      if (isPlaying) {
        vid.pause();
      } else {
        if (vid.duration && vid.currentTime >= vid.duration - 2) {
          vid.currentTime = 0;
          setCurrentSeconds(0);
        }
        vid.play().catch(() => {});
      }
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e) => {
    if (!videoDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = Math.max(0, Math.min(videoDuration, Math.round(pos * videoDuration)));
    setCurrentSeconds(target);
    if (vdoPlayerRef.current?.video) {
      vdoPlayerRef.current.video.currentTime = target;
    }
  };

  const handleToggleMute = (e) => {
    e?.stopPropagation();
    if (vdoPlayerRef.current?.video) {
      const vid = vdoPlayerRef.current.video;
      if (isMuted) {
        vid.muted = false;
        vid.volume = (volume || 80) / 100;
        setIsMuted(false);
      } else {
        vid.muted = true;
        setIsMuted(true);
      }
    } else {
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    if (vdoPlayerRef.current?.video) {
      const vid = vdoPlayerRef.current.video;
      vid.volume = val / 100;
      if (val === 0) {
        vid.muted = true;
        setIsMuted(true);
      } else if (isMuted) {
        vid.muted = false;
        setIsMuted(false);
      }
    }
  };

  const handleSpeedChange = (speed) => {
    setPlaybackRate(speed);
    if (vdoPlayerRef.current?.video) {
      vdoPlayerRef.current.video.playbackRate = speed;
    }
  };

  const handleToggleCc = async (e) => {
    e?.stopPropagation();
    if (!vdoPlayerRef.current) {
      setIsCcEnabled(!isCcEnabled);
      return;
    }
    try {
      if (isCcEnabled) {
        if (vdoPlayerRef.current.api?.setCaptionLanguage) {
          await vdoPlayerRef.current.api.setCaptionLanguage('');
        }
        setIsCcEnabled(false);
      } else {
        if (vdoPlayerRef.current.api?.getAvailableCaptions) {
          const captions = await vdoPlayerRef.current.api.getAvailableCaptions();
          if (captions && captions.length > 0) {
            const lang = captions[0].lang || 'en';
            await vdoPlayerRef.current.api.setCaptionLanguage(lang);
          } else if (vdoPlayerRef.current.api?.setCaptionLanguage) {
            await vdoPlayerRef.current.api.setCaptionLanguage('en');
          }
        }
        setIsCcEnabled(true);
      }
    } catch (err) {
      console.warn('VdoCipher caption toggle error:', err);
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

  const handleToggleCompleted = async () => {
    setIsUpdating(true);
    const newStatus = !completed;
    setCompleted(newStatus);
    if (onProgressUpdate) {
      await onProgressUpdate(newStatus ? (videoDuration || duration || 300) : 0, newStatus);
    }
    setIsUpdating(false);
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
      {/* Main Video Frame with Custom PASCONX Controls and Dynamic Watermark */}
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        className="relative aspect-video w-full bg-black overflow-hidden select-none rounded-2xl shadow-2xl border border-slate-800"
      >
        {/* VdoCipher DRM Video Iframe */}
        <div className="absolute inset-0 w-full h-full pointer-events-auto">
          <iframe
            ref={iframeRef}
            src={playerSrc}
            title={title || 'PASCONX VdoCipher DRM Video'}
            className="w-full h-full border-0 bg-black"
            allow="encrypted-media; autoplay; fullscreen"
            allowFullScreen
          />
        </div>

        {/* Dynamic Student Watermark Overlay */}
        <DynamicWatermark 
          student={student} 
          watermarkProfile={watermarkProfile} 
        />

        {/* PASCONX TOP HEADER */}
        <div 
          className={`absolute top-0 left-0 right-0 h-16 z-25 pointer-events-none bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-start justify-between px-5 pt-3 transition-opacity duration-300 ${
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center gap-2.5 pointer-events-auto">
            <div className="h-7 w-7 rounded-lg bg-white border border-slate-700 overflow-hidden flex items-center justify-center p-0.5 shadow-sm">
              <img src="/logo.jpg" alt="PX" className="h-full w-full object-contain" />
            </div>
            <div>
              <span className="font-extrabold text-xs text-white tracking-wider flex items-center gap-1.5">
                PASCON<span className="text-[#0c8ee7]">X</span> ACADEMY
                <span className="text-[9px] font-mono uppercase bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-400/30">
                  VdoCipher Multi-DRM
                </span>
              </span>
              <p className="text-[10px] text-slate-400 font-medium">Transforming Talent into IT Xperts</p>
            </div>
          </div>

          <div className="text-[11px] text-slate-300 font-mono bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 hidden sm:flex items-center gap-1.5 pointer-events-auto">
            <Lock className="w-3 h-3 text-cyan-400" />
            <span>{student?.email || 'Authorized Student'}</span>
          </div>
        </div>

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
            {/* Left Controls: Play/Pause, Rewind, Time, Volume */}
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
                  if (vdoPlayerRef.current?.video) {
                    vdoPlayerRef.current.video.currentTime = target;
                  }
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
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
                  className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors cursor-pointer"
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

            {/* Right Controls: Speed, CC, Fullscreen, Badge */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Playback Speed Selector */}
              <div className="flex items-center bg-white/10 rounded-lg p-0.5 border border-white/10">
                {[1, 1.25, 1.5, 2].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => handleSpeedChange(speed)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
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
                className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors cursor-pointer"
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
        <div className="w-full sm:w-auto flex-1 flex items-center gap-3">
          <button
            onClick={handleToggleCompleted}
            disabled={isUpdating}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all shadow-xs cursor-pointer ${
              completed
                ? 'bg-emerald-600/20 text-emerald-700 border border-emerald-500/40 hover:bg-emerald-600/30'
                : 'bg-brand-600 text-white hover:bg-brand-500'
            }`}
          >
            <CheckCircle2 className={`w-4 h-4 ${completed ? 'text-emerald-600' : 'text-white'}`} />
            <span>{completed ? 'Lesson Completed' : 'Mark as Completed'}</span>
          </button>

          <div className="flex-1">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-brand-600" />
                Progress: <strong className="text-slate-900">{Math.round(progressPercent)}%</strong>
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
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-cyan-300 border border-brand-200 dark:border-brand-800">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-600" /> VdoCipher DRM
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            Student-specific watermark enabled
          </span>
        </div>
      </div>

      {/* Security Statement */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/60 p-3.5 flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300">
        <Info className="w-4 h-4 text-brand-600 dark:text-cyan-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          {disclaimer || 'Protected training content. Secured with studio-grade VdoCipher Multi-DRM & personalized student watermark.'}
        </div>
      </div>
    </div>
  );
}

