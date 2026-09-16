import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ArrowLeft, AlertCircle } from 'lucide-react';

export default function NotFoundPage() {
  const { user } = useAuth();
  const home = user ? (user.role === 'ADMIN' ? '/admin/dashboard' : '/student/dashboard') : '/login';

  return (
    <div className="min-h-screen bg-edtech-canvas flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xl text-center max-w-md space-y-4 transition-colors">
        <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-500 dark:text-slate-400">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Page Not Found</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          The requested page could not be located in the PASCONX directory.
        </p>
        <div className="pt-2">
          <Link
            to={home}
            className="btn-edtech-purple inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold transition-all shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
