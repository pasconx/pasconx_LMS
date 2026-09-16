import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ArrowLeft, AlertCircle } from 'lucide-react';

export default function NotFoundPage() {
  const { user } = useAuth();
  const home = user ? (user.role === 'ADMIN' ? '/admin/dashboard' : '/student/dashboard') : '/login';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center max-w-md space-y-4">
        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-500">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900">Page Not Found</h1>
        <p className="text-xs text-slate-500">
          The requested page could not be located in the PASCONX directory.
        </p>
        <div className="pt-2">
          <Link
            to={home}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
