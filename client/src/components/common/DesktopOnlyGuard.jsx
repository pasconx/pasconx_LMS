import React, { useEffect, useState } from 'react';
import { MonitorSmartphone, Laptop } from 'lucide-react';
import { isMobileOrTablet } from '../../utils/device.js';

/**
 * Wraps the whole app. On phones / tablets nothing of the portal is rendered —
 * the visitor only sees a "use a laptop or desktop" screen.
 */
export default function DesktopOnlyGuard({ children }) {
  const [blocked, setBlocked] = useState(() => isMobileOrTablet());

  useEffect(() => {
    const recheck = () => setBlocked(isMobileOrTablet());
    window.addEventListener('resize', recheck);
    window.addEventListener('orientationchange', recheck);
    return () => {
      window.removeEventListener('resize', recheck);
      window.removeEventListener('orientationchange', recheck);
    };
  }, []);

  if (!blocked) return children;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6 text-center">
      <div className="max-w-sm space-y-5">
        <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-600 to-indigo-600 flex items-center justify-center shadow-2xl">
          <MonitorSmartphone className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-extrabold text-white">
          PASCON<span className="text-[#22d3ee]">X</span> Academy
        </h1>
        <h2 className="text-lg font-bold text-slate-100">Laptop / Desktop Only</h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          For security, class videos can be watched only on a laptop or desktop computer.
          Mobile phones and tablets are not supported.
        </p>
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300">
          <Laptop className="w-4 h-4" />
          Please open this site on your laptop
        </div>
      </div>
    </div>
  );
}
