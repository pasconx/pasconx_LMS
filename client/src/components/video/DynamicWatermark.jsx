import React, { useState, useEffect } from 'react';

/**
 * Controlled position cycle across the video frame that periodically shifts
 * every 20 seconds (top-right -> bottom-left -> top-left -> bottom-right -> center-right -> center-left)
 * to ensure watermark visibility without permanently obstructing any single area.
 */
const WATERMARK_POSITIONS = [
  { top: '10%', right: '6%', bottom: 'auto', left: 'auto' },
  { top: 'auto', right: 'auto', bottom: '14%', left: '6%' },
  { top: '10%', right: 'auto', bottom: 'auto', left: '6%' },
  { top: 'auto', right: '6%', bottom: '14%', left: 'auto' },
  { top: '38%', right: '10%', bottom: 'auto', left: 'auto' },
  { top: '38%', right: 'auto', bottom: 'auto', left: '10%' }
];

export default function DynamicWatermark({ student, watermarkProfile }) {
  const [posIdx, setPosIdx] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState('');

  // Update live timestamp every second
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
        hour12: false
      });
      setCurrentTimestamp(formatted);
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Shift watermark position periodically every 20 seconds
  useEffect(() => {
    const positionTimer = setInterval(() => {
      setPosIdx((prev) => (prev + 1) % WATERMARK_POSITIONS.length);
    }, 20000); // 20 seconds
    return () => clearInterval(positionTimer);
  }, []);

  const studentName = watermarkProfile?.studentName || student?.name || 'Student';
  const studentEmail = watermarkProfile?.email || student?.email || 'student@example.com';
  const studentId = watermarkProfile?.studentId || `PXC-${String(student?.id || 1).padStart(5, '0')}`;
  const sessionId = watermarkProfile?.sessionId || 'PXC-7F29A1';
  const currentPos = WATERMARK_POSITIONS[posIdx];

  return (
    <div 
      className="absolute pointer-events-none select-none z-20 transition-all duration-1000 ease-in-out font-mono"
      style={{
        ...currentPos,
        opacity: 0.58 // Semi-transparent readable appearance for screen captures
      }}
      aria-hidden="true"
    >
      <div 
        className="p-2.5 rounded-lg border border-white/20 bg-slate-950/70 backdrop-blur-[1px] text-[10px] sm:text-[11px] leading-tight text-white font-medium tracking-wide shadow-md"
        style={{
          textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)'
        }}
      >
        <div className="font-extrabold tracking-widest text-[#22d3ee] text-[9px] uppercase pb-0.5">
          PASCONIX
        </div>
        <div className="text-white font-semibold">Student: {studentName}</div>
        <div className="text-slate-200">Email: {studentEmail}</div>
        <div className="text-slate-300">Student ID: {studentId}</div>
        <div className="text-slate-300">Session: {sessionId}</div>
        <div className="text-cyan-300 text-[9px] pt-0.5">{currentTimestamp}</div>
      </div>
    </div>
  );
}
