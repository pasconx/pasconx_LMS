import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Wrench, 
  RefreshCw, 
  ShieldCheck, 
  Clock, 
  ExternalLink,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';

export default function MaintenancePage({ maintenanceData, onRefresh }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const title = maintenanceData?.title || "We're Under Maintenance";
  const message = maintenanceData?.message || 
    "Our platform is currently undergoing scheduled maintenance to improve performance, security and your learning experience.";

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        window.location.reload();
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between relative overflow-hidden font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Background ambient neon glows */}
      <div className="absolute top-[-15%] left-[-10%] w-[550px] h-[550px] bg-cyan-500/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[600px] h-[600px] bg-blue-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-[35%] left-[50%] -translate-x-1/2 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Header bar */}
      <header className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-900 border border-cyan-500/30 p-1.5 shadow-lg shadow-cyan-950/40 flex items-center justify-center">
            <img 
              src="/logo.jpg" 
              alt="PASCONX" 
              className="h-full w-full object-contain" 
            />
          </div>
          <div>
            <span className="font-extrabold tracking-wider text-base text-white">
              PASCON<span className="text-cyan-400">X</span>
            </span>
            <span className="text-[10px] text-slate-400 block -mt-1 font-mono tracking-widest uppercase">
              Academy
            </span>
          </div>
        </div>

        {/* Live Status Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          <span>Scheduled Maintenance</span>
        </div>
      </header>

      {/* Main Content Showcase */}
      <main className="relative z-10 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 flex flex-col items-center text-center space-y-8">
        
        {/* Maintenance Banner Graphic */}
        <div className="relative group w-full max-w-3xl rounded-3xl overflow-hidden border border-cyan-500/30 shadow-2xl shadow-cyan-950/60 bg-slate-900/80 backdrop-blur-md transition-all duration-300 hover:border-cyan-400/50">
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none z-1" />
          <img 
            src="/maintenance.png" 
            alt="PASCONX Platform Under Maintenance" 
            className="w-full h-auto object-cover max-h-[460px] sm:max-h-[520px] transition-transform duration-500 group-hover:scale-[1.01]" 
          />
        </div>

        {/* Announcement Box */}
        <div className="max-w-2xl w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-xl space-y-4">
          <div className="inline-flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider bg-cyan-950/60 border border-cyan-800/60 px-3 py-1 rounded-full">
            <Wrench className="w-3.5 h-3.5" /> Platform Upgrade in Progress
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {title}
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            {message}
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 transition-all transform active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Checking Status...' : 'Check If System Is Back'}</span>
            </button>

            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 font-medium text-sm transition-all"
            >
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Administrator Sign In</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </Link>
          </div>
        </div>

        {/* System notice footnote */}
        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
          <Clock className="w-3.5 h-3.5 text-cyan-500/70" />
          <span>Student video playback and lesson access will resume automatically upon maintenance completion.</span>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 border-t border-slate-900">
        <div>
          &copy; {new Date().getFullYear()} PASCON<span className="text-cyan-400 font-bold">X</span> Academy • Transforming Talent into IT Xperts
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[11px] text-slate-600">ID: SEC-MAINT-SYS-01</span>
        </div>
      </footer>
    </div>
  );
}
