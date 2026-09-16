import React, { useState } from 'react';
import DynamicWatermark from './DynamicWatermark.jsx';
import { 
  CheckCircle2, 
  Clock, 
  ShieldCheck,
  Lock,
  Info
} from 'lucide-react';

export default function VdoCipherPlayer({
  videoId,
  otp,
  playbackInfo,
  embedUrl,
  title,
  duration,
  initialCompleted = 0,
  initialProgressSeconds = 0,
  onProgressUpdate,
  disclaimer,
  student,
  watermarkProfile
}) {
  const [completed, setCompleted] = useState(initialCompleted === 1);
  const [isUpdating, setIsUpdating] = useState(false);

  const playerSrc = embedUrl || `https://player.vdocipher.com/v2/?otp=${otp}&playbackInfo=${playbackInfo}`;

  const handleToggleCompleted = async () => {
    setIsUpdating(true);
    const newStatus = !completed;
    setCompleted(newStatus);
    if (onProgressUpdate) {
      await onProgressUpdate(newStatus ? (duration || 300) : 0, newStatus);
    }
    setIsUpdating(false);
  };

  return (
    <div className="space-y-4">
      {/* Player Container */}
      <div 
        className="relative w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl no-select"
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      >
        {/* Dynamic Watermark Overlay */}
        <DynamicWatermark student={student} watermarkProfile={watermarkProfile} />

        {/* 16:9 Aspect Ratio VdoCipher Player Frame */}
        <div className="relative w-full pt-[56.25%]">
          <iframe
            src={playerSrc}
            title={title || 'PASCONIX VdoCipher DRM Video'}
            className="absolute top-0 left-0 w-full h-full border-0 rounded-2xl bg-black"
            allow="encrypted-media; fullscreen; autoplay"
            allowFullScreen
          />
        </div>
      </div>

      {/* Progress & Security Status Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
        {/* Left: Completion & Progress Control */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <button
            onClick={handleToggleCompleted}
            disabled={isUpdating}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all shadow-xs ${
              completed
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30'
                : 'bg-brand-600 text-white hover:bg-brand-500'
            }`}
          >
            <CheckCircle2 className={`w-4 h-4 ${completed ? 'text-emerald-400' : 'text-white'}`} />
            <span>{completed ? 'Lesson Completed' : 'Mark as Completed'}</span>
          </button>

          <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>{completed ? '100% Completed' : 'In Progress'}</span>
          </div>
        </div>

        {/* Right: Security & Provider Badges */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 text-[11px] font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            VdoCipher Multi-DRM
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-[11px] font-mono">
            Student-specific watermark enabled
          </span>
        </div>
      </div>

      {/* Security Information Notice */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 leading-relaxed flex items-center gap-2.5">
        <Info className="w-4 h-4 text-cyan-400 shrink-0" />
        <span>{disclaimer || 'Protected training content. Secured with studio-grade VdoCipher Multi-DRM & personalized student watermark.'}</span>
      </div>
    </div>
  );
}
