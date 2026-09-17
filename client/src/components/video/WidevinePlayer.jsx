import React, { useEffect, useRef, useState } from 'react';
import shaka from 'shaka-player';
import DynamicWatermark from './DynamicWatermark.jsx';
import { useScreenSecurity, BlackoutOverlay } from './ScreenCaptureGuard.jsx';
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
  ShieldAlert,
  AlertTriangle,
  Layers
} from 'lucide-react';

export default function WidevinePlayer({
  manifestUrl,
  licenseServerUrl,
  playbackToken,
  isConfigured = true,
  unconfiguredMessage,
  duration = 0,
  initialProgressSeconds = 0,
  onProgressUpdate,
  disclaimer,
  student,
  watermarkProfile,
  playerControlRef
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  // Playback & DRM state
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(initialProgressSeconds || 0);
  const [videoDuration, setVideoDuration] = useState(duration || 0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [selectedTrackId, setSelectedTrackId] = useState('auto');

  // Specific Error States
  const [drmError, setDrmError] = useState('');
  const [widevineSupported, setWidevineSupported] = useState(true);

  const { isBlackedOut, alertReason, resumePlayback } = useScreenSecurity();

  // Expose player control interface for notes timestamp capture & seeking
  useEffect(() => {
    if (playerControlRef) {
      playerControlRef.current = {
        getCurrentTime: () => {
          try {
            if (videoRef.current) {
              return Math.round(videoRef.current.currentTime);
            }
          } catch (e) {}
          return currentSeconds || 0;
        },
        seekTo: (sec) => {
          try {
            if (videoRef.current) {
              videoRef.current.currentTime = sec;
              setCurrentSeconds(sec);
            }
          } catch (e) {}
        }
      };
    }
  }, [playerControlRef, currentSeconds]);

  // Instantly pause DRM video element on blackout
  useEffect(() => {
    if (isBlackedOut && videoRef.current) {
      videoRef.current.pause();
    }
  }, [isBlackedOut]);

  const progressPercent = videoDuration > 0
    ? Math.min(100, (currentSeconds / videoDuration) * 100)
    : 0;

  // Initialize Shaka Player with EME & Widevine DRM
  useEffect(() => {
    let isMounted = true;

    // Check development / unconfigured state
    if (!isConfigured) {
      setDrmError(unconfiguredMessage || 'Widevine DRM is not configured for this environment.');
      return;
    }

    if (!manifestUrl) {
      setDrmError('Encrypted DASH manifest URL (.mpd) is missing.');
      return;
    }

    // Install built-in polyfills for EME and MediaSource
    shaka.polyfill.installAll();

    // Check general browser support for EME / MSE
    if (!shaka.Player.isBrowserSupported()) {
      setDrmError('Your browser does not support MediaSource Extensions (MSE) and Encrypted Media Extensions (EME) required for Widevine DRM.');
      return;
    }

    async function initShaka() {
      if (!isMounted || !videoRef.current) return;

      // Detect hardware / software Widevine CDM support
      if (window.navigator?.requestMediaKeySystemAccess) {
        try {
          await window.navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
            initDataTypes: ['cenc'],
            videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }]
          }]);
          if (isMounted) setWidevineSupported(true);
        } catch (emeErr) {
          console.warn('Widevine CDM access notice:', emeErr.message);
          // Safari macOS/iOS uses FairPlay, Firefox without CDM, etc.
          if (isMounted) {
            setWidevineSupported(false);
            setDrmError('Widevine DRM is not supported on this browser or platform. If using Safari, FairPlay DRM is required; for Widevine, please use Google Chrome, Microsoft Edge, or Firefox with DRM enabled.');
            return;
          }
        }
      }

      try {
        const player = new shaka.Player();
        await player.attach(videoRef.current);
        playerRef.current = player;

        // Configure DRM Key Systems: com.widevine.alpha
        const effectiveLicenseUrl = licenseServerUrl || '/api/drm/license';
        player.configure({
          drm: {
            servers: {
              'com.widevine.alpha': effectiveLicenseUrl
            },
            advanced: {
              'com.widevine.alpha': {
                videoRobustness: ['SW_SECURE_CRYPTO', 'SW_SECURE_DECODE'],
                audioRobustness: ['SW_SECURE_CRYPTO']
              }
            }
          },
          streaming: {
            bufferingGoal: 30,
            rebufferingGoal: 2,
            bufferBehind: 30,
            retryParameters: {
              maxAttempts: 3,
              baseDelay: 1000,
              backoffFactor: 2
            }
          }
        });

        // Register request filter to add short-lived authorization token to license requests
        player.getNetworkingEngine().registerRequestFilter((type, request) => {
          if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
            if (playbackToken) {
              request.headers['X-Playback-Token'] = playbackToken;
            }
          }
        });

        // Error listener
        player.addEventListener('error', (event) => {
          if (!isMounted) return;
          const errorDetail = event.detail;
          console.error('Shaka DRM Player Error:', errorDetail);

          let friendlyMessage = 'DRM Playback error encountered.';
          if (errorDetail.category === shaka.util.Error.Category.DRM) {
            if (errorDetail.code === shaka.util.Error.Code.NO_LICENSE_SERVER_GIVEN) {
              friendlyMessage = 'Widevine DRM is not configured for this environment.';
            } else if (errorDetail.code === shaka.util.Error.Code.ENCRYPTED_CONTENT_WITHOUT_DRM_INFO) {
              friendlyMessage = 'Encrypted content detected without DRM configuration metadata.';
            } else {
              friendlyMessage = `DRM Authorization or License Acquisition Error (Code: ${errorDetail.code}). Please verify course enrollment.`;
            }
          } else if (errorDetail.category === shaka.util.Error.Category.NETWORK) {
            friendlyMessage = 'Network error fetching video manifest or DRM license. Please check your internet connection.';
          } else {
            friendlyMessage = `Playback initialization issue (${errorDetail.message || 'code ' + errorDetail.code}).`;
          }

          setDrmError(friendlyMessage);
        });

        // Load encrypted DASH manifest
        await player.load(manifestUrl);

        if (!isMounted) return;
        setPlayerReady(true);

        // Populate adaptive bitrate tracks
        const availableTracks = player.getVariantTracks();
        setTracks(availableTracks);

        // Resume initial progress
        if (initialProgressSeconds && initialProgressSeconds > 0 && videoRef.current) {
          videoRef.current.currentTime = initialProgressSeconds;
          setCurrentSeconds(Math.round(initialProgressSeconds));
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Shaka load failure:', err);
        setDrmError(err.message || 'Failed to initialize Widevine DRM player.');
      }
    }

    initShaka();

    return () => {
      isMounted = false;
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (playerRef.current) {
        playerRef.current.destroy().catch(() => {});
        playerRef.current = null;
      }
    };
  }, [manifestUrl, licenseServerUrl, playbackToken, isConfigured]);

  // Hook HTML5 video element events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const curr = Math.round(video.currentTime || 0);
      const dur = Math.round(video.duration || videoDuration || duration || 0);
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

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCompleted(true);
      if (onProgressUpdate) {
        onProgressUpdate(videoDuration || currentSeconds, true);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [videoDuration, completed, onProgressUpdate]);

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
    const vid = videoRef.current;
    if (!vid) return;

    if (isPlaying) {
      vid.pause();
    } else {
      if (vid.duration && vid.currentTime >= vid.duration - 2) {
        vid.currentTime = 0;
        setCurrentSeconds(0);
      }
      vid.play().catch((err) => {
        console.warn('Playback resume blocked:', err);
      });
    }
  };

  const handleSeek = (e) => {
    if (!videoDuration || !videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = Math.max(0, Math.min(videoDuration, Math.round(pos * videoDuration)));
    setCurrentSeconds(target);
    videoRef.current.currentTime = target;
  };

  const handleToggleMute = (e) => {
    e?.stopPropagation();
    const vid = videoRef.current;
    if (!vid) return;

    if (isMuted) {
      vid.muted = false;
      vid.volume = (volume || 80) / 100;
      setIsMuted(false);
    } else {
      vid.muted = true;
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    const vid = videoRef.current;
    if (vid) {
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
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const handleTrackChange = (trackId) => {
    setSelectedTrackId(trackId);
    if (!playerRef.current) return;

    if (trackId === 'auto') {
      playerRef.current.configure({ abr: { enabled: true } });
    } else {
      playerRef.current.configure({ abr: { enabled: false } });
      const selected = tracks.find((t) => String(t.id) === String(trackId));
      if (selected) {
        playerRef.current.selectVariantTrack(selected, /* clearBuffer */ true);
      }
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

  // If unconfigured or critical DRM error
  if (drmError) {
    const isUnconfigured = drmError.includes('not configured');
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-8 shadow-2xl text-center space-y-4">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${
          isUnconfigured ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
        }`}>
          {isUnconfigured ? <AlertTriangle className="w-7 h-7" /> : <ShieldAlert className="w-7 h-7" />}
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-extrabold text-white">
            {isUnconfigured ? 'Widevine DRM Configuration Notice' : 'Widevine DRM Protection Notice'}
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            {drmError}
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 max-w-lg mx-auto text-left font-mono space-y-1">
          <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Protection Architecture:</div>
          <div>• Key System: <span className="text-brand-300">com.widevine.alpha</span> (Modular DRM)</div>
          <div>• Manifest: <span className="text-slate-400 truncate inline-block max-w-xs align-bottom">{manifestUrl || 'None configured'}</span></div>
          <div>• Player: <span className="text-emerald-400">Shaka Player v5 (EME)</span></div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-4 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Main Video Frame with Custom PASCONX Controls & Watermark */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        className="relative aspect-video w-full bg-black overflow-hidden select-none rounded-2xl shadow-2xl border border-slate-800"
      >
        {/* Native HTML5 Video element driven by Shaka Player */}
        <video
          ref={videoRef}
          playsInline
          className="w-full h-full object-contain bg-black"
          onDoubleClick={handleToggleFullscreen}
        />

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
                  Widevine DRM Protected
                </span>
              </span>
              <p className="text-[10px] text-slate-400 font-medium">Encrypted Media Extensions (EME) • DASH</p>
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
            {!playerReady && (
              <div className="mt-4 text-xs font-semibold text-slate-300 bg-black/70 px-3.5 py-1 rounded-full border border-white/10 flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                <span>Acquiring Widevine DRM license...</span>
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
                  const vid = videoRef.current;
                  if (vid) {
                    const target = Math.max(0, vid.currentTime - 10);
                    vid.currentTime = target;
                    setCurrentSeconds(Math.round(target));
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

            {/* Right Controls: Quality/ABR, Speed, Fullscreen, Logo */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Adaptive Bitrate Selector */}
              {tracks.length > 1 && (
                <div className="flex items-center gap-1 bg-white/10 rounded-lg px-2 py-0.5 border border-white/10 text-[10px] font-mono">
                  <Layers className="w-3 h-3 text-slate-300" />
                  <select
                    value={selectedTrackId}
                    onChange={(e) => handleTrackChange(e.target.value)}
                    className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="auto" className="bg-slate-900 text-white">Auto (ABR)</option>
                    {tracks.filter((t, i, arr) => arr.findIndex(x => x.height === t.height) === i).map((track) => (
                      <option key={track.id} value={track.id} className="bg-slate-900 text-white">
                        {track.height ? `${track.height}p` : `${Math.round(track.bandwidth / 1000)}k`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                <span className="font-extrabold tracking-wider text-[11px] text-white hidden sm:inline">
                  PASCON<span className="text-[#0c8ee7]">X</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Solid Blackout Veil directly inside containerRef for native fullscreen protection */}
        {isBlackedOut && (
          <BlackoutOverlay alertReason={alertReason} onResume={resumePlayback} />
        )}
      </div>

      {/* Status Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors">
        <div className="w-full sm:w-auto flex-1">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400" />
              Module Progress: <strong className="text-slate-900 dark:text-white">{Math.round(progressPercent)}%</strong>
              {completed && (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full text-[11px] font-bold border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" /> Completed
                </span>
              )}
            </span>
            <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
              {formatTime(currentSeconds)} / {formatTime(videoDuration)}
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 transition-all duration-300 rounded-full ${
                completed ? 'bg-emerald-500' : 'bg-brand-600'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-cyan-300 border border-brand-200 dark:border-brand-800">
            <ShieldCheck className="w-3.5 h-3.5" /> Widevine EME DRM
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Lock className="w-3.5 h-3.5" /> Watermarked Session
          </span>
        </div>
      </div>

      {/* Security Statement */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/70 p-3.5 flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300 transition-colors">
        <ShieldCheck className="w-4 h-4 text-brand-600 dark:text-cyan-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="font-semibold text-slate-900 dark:text-white">Protected Course Stream (Widevine DRM): </strong>
          {disclaimer || 'Encrypted video stream delivered via Shaka Player and Google Widevine Modular DRM. Casual downloading and screen grabbing are prohibited under academic policy.'}
        </div>
      </div>
    </div>
  );
}
