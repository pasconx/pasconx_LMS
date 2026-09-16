import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../api/client.js';
import { StatusBadge } from '../../components/common/Badge.jsx';
import { User, Mail, Shield, BookOpen, Clock, Calendar } from 'lucide-react';

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
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700 font-extrabold text-2xl shadow-inner">
            {user?.name?.charAt(0) || 'S'}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{user?.name}</h1>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{user?.email}</p>
            <div className="mt-2">
              <StatusBadge status={user?.status} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-slate-100 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-slate-500 font-medium">Account Role</div>
            <div className="text-sm font-bold text-slate-900">{user?.role}</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-slate-500 font-medium">Institution</div>
            <div className="text-sm font-bold text-slate-900">PASCONX Academy</div>
          </div>
        </div>
      </div>

      {/* Enrolled Courses Summary */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-brand-600" />
          Enrolled Course Access Details
        </h2>

        {loading ? (
          <div className="py-8 text-center text-slate-400 text-xs">Loading course permissions...</div>
        ) : courses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-xs text-slate-500">
            No active or expired courses found for your account.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-xs">
            {courses.map((c) => (
              <div key={c.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{c.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Valid: {formatDate(c.access_start)} to {formatDate(c.access_expiry)}
                    </span>
                  </div>
                </div>
                <div>
                  <StatusBadge status={c.enrollment_status} isExpired={c.is_expired} isFuture={c.is_future} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
