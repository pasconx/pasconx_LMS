import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../api/client.js';
import { StatusBadge } from '../../components/common/Badge.jsx';
import ChangePasswordCard from '../../components/common/ChangePasswordCard.jsx';
import { Mail, Shield, BookOpen, Calendar, GraduationCap, ArrowRight } from 'lucide-react';

export default function StudentProfile() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/student/courses');
        if (res.success) setCourses(res.courses);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const formatDate = (iso) => {
    if (!iso) return 'N/A';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Profile Overview Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 sm:p-8 shadow-md shadow-slate-200/50 dark:shadow-none space-y-6 transition-colors">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-md shadow-indigo-500/25 shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || 'S'}
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">{user?.name}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              {user?.email}
            </p>
            <div className="pt-1.5">
              <StatusBadge status={user?.status} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 flex items-center gap-3.5 shadow-2xs transition-colors">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/60 flex items-center justify-center shrink-0 text-indigo-600 dark:text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400 font-medium">Account Role</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white capitalize">{user?.role}</div>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 flex items-center gap-3.5 shadow-2xs transition-colors">
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-800/60 flex items-center justify-center shrink-0 text-purple-600 dark:text-purple-400">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400 font-medium">Institution</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">PASCONX Academy</div>
            </div>
          </div>
        </div>
      </div>

      {/* Self-Service Change Password */}
      <ChangePasswordCard />

      {/* Enrolled Courses Summary */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 transition-colors">
          <BookOpen className="w-5 h-5 text-brand-600 dark:text-cyan-400" />
          Enrolled Course Access Details
        </h2>

        {loading ? (
          <div className="py-8 text-center text-slate-400 text-xs">Loading course permissions...</div>
        ) : courses.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-8 text-center text-xs text-slate-500 dark:text-slate-400 shadow-md shadow-slate-200/40 dark:shadow-none transition-colors">
            No active or expired courses found for your account.
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-md shadow-slate-200/50 dark:shadow-none transition-colors">
            {courses.map((c) => (
              <div key={c.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{c.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                      Valid: {formatDate(c.access_start)} to {formatDate(c.access_expiry)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 self-start sm:self-auto">
                  <StatusBadge status={c.enrollment_status} isExpired={c.is_expired} isFuture={c.is_future} />
                  {c.is_active && (
                    <Link
                      to={`/student/courses/${c.id}`}
                      className="btn-edtech-purple inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold transition-all shadow-xs"
                    >
                      <span>Open Course</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
