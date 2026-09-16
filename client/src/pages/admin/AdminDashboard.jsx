import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client.js';
import { StatusBadge } from '../../components/common/Badge.jsx';
import { 
  Users, 
  BookOpen, 
  Video, 
  KeyRound, 
  TrendingUp, 
  UserPlus, 
  PlusCircle, 
  ShieldAlert,
  ArrowRight,
  ExternalLink 
} from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    students: 0,
    courses: 0,
    videos: 0,
    activeEnrollments: 0
  });
  const [recentEnrollments, setRecentEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/admin/stats');
        if (res.success) {
          setStats(res.stats);
          setRecentEnrollments(res.recentEnrollments || []);
        }
      } catch (err) {
        setError(err.message || 'Failed to load administrative analytics.');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const formatDate = (iso) => {
    if (!iso) return 'N/A';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="py-16 flex justify-center items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Gathering portal telemetry...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Registered Students', count: stats.students, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', link: '/admin/students' },
    { label: 'Active Courses', count: stats.courses, icon: BookOpen, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200', link: '/admin/courses' },
    { label: 'Educational Videos', count: stats.videos, icon: Video, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', link: '/admin/videos' },
    { label: 'Active Enrollments', count: stats.activeEnrollments, icon: KeyRound, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200', link: '/admin/enrollments' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-200/60 text-slate-700 text-xs font-semibold mb-2">
            PASCON<span className="text-[#0c8ee7]">X</span> Academy Operations
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Administrative Control Center
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage student authorizations, course curricula, video deliveries, and access expiration schedules.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap gap-2.5">
          <Link
            to="/admin/students"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
          >
            <UserPlus className="w-4 h-4 text-blue-600" />
            + New Student
          </Link>
          <Link
            to="/admin/courses"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
          >
            <PlusCircle className="w-4 h-4 text-indigo-600" />
            + New Course
          </Link>
          <Link
            to="/admin/videos"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
          >
            <Video className="w-4 h-4 text-emerald-600" />
            + Add Video
          </Link>
          <Link
            to="/admin/enrollments"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm transition-colors"
          >
            <KeyRound className="w-4 h-4" />
            Assign Course
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Stats Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              to={card.link}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:shadow-md transition-all group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {card.label}
                </span>
                <div className={`p-2 rounded-xl border ${card.bg}`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>

              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {card.count}
                </span>
                <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-700 flex items-center gap-1 transition-colors">
                  Manage <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent Enrollments Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Recent Course Enrollments</h2>
            <p className="text-xs text-slate-500 mt-0.5">Latest student authorizations and access duration windows</p>
          </div>
          <Link
            to="/admin/enrollments"
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4 text-left">Student</th>
                <th className="py-3 px-4 text-left">Course</th>
                <th className="py-3 px-4 text-left">Start Date</th>
                <th className="py-3 px-4 text-left">Expiry Date</th>
                <th className="py-3 px-4 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {recentEnrollments.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-6 text-center text-slate-400">
                    No enrollments found yet.
                  </td>
                </tr>
              ) : (
                recentEnrollments.map((en) => (
                  <tr key={en.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{en.student_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{en.student_email}</div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{en.course_title}</td>
                    <td className="py-3 px-4 text-slate-500">{formatDate(en.access_start)}</td>
                    <td className="py-3 px-4 text-slate-500 font-medium">{formatDate(en.access_expiry)}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={en.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
