import React, { useState, useEffect } from 'react';

/**
 * Predefined safe coordinates across the video frame that do not obstruct
 * primary center slides while making cropping or watermarked-leaks impossible.
 */
const SAFE_POSITIONS = [
  { top: '18%', right: '8%', transform: 'translate(0, 0)' },
  { bottom: '26%', left: '8%', transform: 'translate(0, 0)' },
  { top: '44%', right: '12%', transform: 'translate(0, 0)' },
  { top: '35%', left: '14%', transform: 'translate(0, 0)' },
  { bottom: '28%', right: '22%', transform: 'translate(0, 0)' },
  { top: '22%', left: '26%', transform: 'translate(0, 0)' }
];

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || 'student@pasconx.com';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local}***@${domain}`;
  const visible = local.substring(0, Math.min(3, local.length));
  return `${visible}****@${domain}`;
}

export default function DynamicWatermark({ student, watermarkProfile }) {
  const [posIdx, setPosIdx] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState('');

  // Periodically update live timestamp
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) + ' ' + now.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      setCurrentTimestamp(formatted);
    };

    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  // Smooth drift between coordinates every 14 seconds
  useEffect(() => {
    const driftInterval = setInterval(() => {
      setPosIdx((prev) => (prev + 1) % SAFE_POSITIONS.length);
    }, 14000);
    return () => clearInterval(driftInterval);
  }, []);

  const studentName = watermarkProfile?.studentName || student?.name || 'Student';
  const studentEmail = watermarkProfile?.maskedEmail || maskEmail(student?.email);
  const studentId = watermarkProfile?.studentId || `PX2026-${String(student?.id || 1).padStart(3, '0')}`;
  const currentPos = SAFE_POSITIONS[posIdx];

  return (
    <div 
      className="absolute pointer-events-none select-none z-20 transition-all duration-[4000ms] ease-in-out font-mono"
      style={{
        ...currentPos,
        opacity: 0.32
      }}
      aria-hidden="true"
    >
      <div 
        className="p-2.5 rounded-lg border border-white/20 bg-black/25 backdrop-blur-[1px] text-[10px] sm:text-[11px] leading-tight text-white/90 font-medium tracking-wide shadow-sm"
        style={{
          textShadow: '0 1px 2px rgba(0,0,0,0.8), 0 0 1px rgba(0,0,0,0.9)'
        }}
      >
        <div className="font-extrabold tracking-widest text-[#0c8ee7] text-[9px] uppercase pb-0.5">
          PASCONX ACADEMY
        </div>
        <div className="text-white font-semibold">Student: {studentName}</div>
        <div className="text-slate-300">ID: {studentId}</div>
        <div className="text-slate-300">{studentEmail}</div>
        <div className="text-slate-400 text-[9px] pt-0.5">{currentTimestamp}</div>
      </div>
    </div>
  );
}
