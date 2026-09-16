import React, { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, EyeOff } from 'lucide-react';

export const ScreenSecurityContext = createContext({
  isBlackedOut: false,
  alertReason: '',
  resumePlayback: () => {}
});

export function useScreenSecurity() {
  return useContext(ScreenSecurityContext);
}

/**
 * Reusable full-frame blackout overlay
 */
export function BlackoutOverlay({ alertReason, onResume }) {
  return (
    <div 
      onClick={onResume}
      className="absolute inset-0 z-[99999] bg-black flex flex-col items-center justify-center text-center p-6 cursor-pointer select-none"
      style={{ zIndex: 99999 }}
    >
      <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mb-4 animate-pulse">
        <EyeOff className="w-8 h-8" />
      </div>
      <h3 className="text-base sm:text-lg font-extrabold text-white tracking-wide">
        Content Masked: Security Protection Active
      </h3>
      <p className="text-xs text-slate-400 max-w-md mt-1 mb-4 leading-relaxed font-mono">
        {alertReason || 'Screen capture or window backgrounding detected.'}
      </p>
      <button
        onClick={onResume}
        className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-all shadow-lg cursor-pointer"
      >
        Click here to resume playback
      </button>
      <span className="text-[10px] text-slate-500 mt-3 font-mono">
        PASCONX Stealth Content Protection • Screen capture prohibited
      </span>
    </div>
  );
}

/**
 * ScreenCaptureGuard
 * 
 * Active client-side anti-screen-capture and screen-recording deterrent:
 * 1. Focus-Loss Blackout: Blanks video whenever the browser window loses focus
 * 2. Keyboard Interception: Catches PrintScreen (keydown + keyup on window & document), Win+Shift+S, F12
 * 3. Fullscreen Defense: Portals blackout veil directly into Fullscreen Top Layer & forces exitFullscreen
 * 4. Visibility Change Blackout: Pauses & covers video when user switches tabs or minimizes
 * 5. Clipboard Buffer Overwrite: Overwrites system clipboard with security warning text
 */
export default function ScreenCaptureGuard({ onSecurityStateChange, children }) {
  const [isBlackedOut, setIsBlackedOut] = useState(false);
  const [alertReason, setAlertReason] = useState('');
  const [fullscreenTarget, setFullscreenTarget] = useState(
    () => (typeof document !== 'undefined' ? (document.fullscreenElement || document.webkitFullscreenElement || null) : null)
  );

  // Track fullscreen element changes so we can portal the veil into whichever element is in fullscreen
  useEffect(() => {
    const handleFsChange = () => {
      setFullscreenTarget(document.fullscreenElement || document.webkitFullscreenElement || null);
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    window.addEventListener('fullscreenchange', handleFsChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      window.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  const resumePlayback = useCallback(() => {
    setIsBlackedOut(false);
    setAlertReason('');
    if (onSecurityStateChange) {
      onSecurityStateChange(false);
    }
  }, [onSecurityStateChange]);

  const triggerBlackout = useCallback((reason) => {
    setIsBlackedOut(true);
    setAlertReason(reason);
    if (onSecurityStateChange) {
      onSecurityStateChange(true);
    }

    // Instantly wipe OS clipboard buffer
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText('⚠️ Screenshot Prohibited: This course video is protected under PASCONX Academy security policy.').catch(() => {});
    }

    // If currently in fullscreen mode, exit fullscreen immediately to disrupt screen grabbers
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs && typeof document.exitFullscreen === 'function') {
      document.exitFullscreen().catch(() => {});
    }
  }, [onSecurityStateChange]);

  useEffect(() => {
    // 1. Window Blur: Triggers when external screen capture tools (Snipping Tool, Lightshot, OBS) gain focus
    const handleBlur = () => {
      triggerBlackout('Window focus lost. Playback masked to prevent external screen capture.');
    };

    const handleFocus = () => {
      // Auto-resume when student returns focus to the window
      resumePlayback();
    };

    // 2. Tab / Window Visibility Change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerBlackout('Tab minimized or hidden. Video stream masked.');
      } else {
        resumePlayback();
      }
    };

    // 3. Keyboard Shortcut Interception (keydown)
    const handleKeyDown = (e) => {
      const isPrtScn = e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.keyCode === 44;
      if (isPrtScn) {
        e.preventDefault();
        e.stopPropagation();
        triggerBlackout('Screenshot shortcut (PrintScreen) detected. Image capture blocked and clipboard cleared.');
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText('⚠️ Screenshot Prohibited: This course video is protected under PASCONX Academy security policy.').catch(() => {});
        }
        setTimeout(resumePlayback, 3500);
        return false;
      }

      // Windows + Shift + S or Mac Shift + Cmd + 3 / 4
      if ((e.shiftKey && e.metaKey) || (e.shiftKey && (e.key === 'S' || e.key === 's') && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        e.stopPropagation();
        triggerBlackout('Screen capture shortcut detected. Video stream protected.');
        setTimeout(resumePlayback, 2500);
        return false;
      }

      // F12 or Developer Tools (Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C)
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
        (e.metaKey && e.altKey && ['I', 'i', 'J', 'j', 'U', 'u'].includes(e.key))
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerBlackout('Inspection / Developer tools shortcut blocked.');
        setTimeout(resumePlayback, 2500);
        return false;
      }

      // Ctrl + P (Print) or Ctrl + S (Save)
      if ((e.ctrlKey || e.metaKey) && ['p', 'P', 's', 'S', 'u', 'U'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        triggerBlackout('Page export and source viewing are disabled for protected videos.');
        setTimeout(resumePlayback, 2000);
        return false;
      }
    };

    // 4. Keyboard Shortcut Interception (keyup) - Essential for Windows PrintScreen
    const handleKeyUp = (e) => {
      const isPrtScn = e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.keyCode === 44;
      if (isPrtScn) {
        e.preventDefault();
        e.stopPropagation();
        triggerBlackout('Screenshot key (PrintScreen) detected. Image capture blocked and clipboard cleared.');

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText('⚠️ Screenshot Prohibited: This course video is protected under PASCONX Academy security policy.').catch(() => {});
        }

        setTimeout(resumePlayback, 3500);
      }
    };

    const handleCopy = (e) => {
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.setData('text/plain', '⚠️ Protected Educational Content - PASCONX ACADEMY. Screen capture and copying prohibited.');
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Register on both window and document with capture phase
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('copy', handleCopy, true);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      document.removeEventListener('keyup', handleKeyUp, true);
      document.removeEventListener('copy', handleCopy, true);
    };
  }, [triggerBlackout, resumePlayback]);

  return (
    <ScreenSecurityContext.Provider value={{ isBlackedOut, alertReason, resumePlayback }}>
      <div className="relative w-full h-full">
        {children}

        {/* Standard In-Place Veil (Windowed Mode) */}
        {isBlackedOut && (
          <BlackoutOverlay alertReason={alertReason} onResume={resumePlayback} />
        )}

        {/* Fullscreen Top-Layer Portal Veil (Mounts directly inside document.fullscreenElement) */}
        {isBlackedOut && fullscreenTarget && createPortal(
          <BlackoutOverlay alertReason={alertReason} onResume={resumePlayback} />,
          fullscreenTarget
        )}
      </div>
    </ScreenSecurityContext.Provider>
  );
}
