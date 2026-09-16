import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../api/client.js';
import { StatusBadge } from '../../components/common/Badge.jsx';
import { BookOpen, PlayCircle, Clock, AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await api.get('/student/courses');
        if (res.success) {
          setCourses(res.courses);
        }
      } catch (err) {
        setError(err.message || 'Failed to load assigned courses.');
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, []);

  const activeCourses = courses.filter(c => c.is_active);
  const expiredCourses = courses.filter(c => c.is_expired);
  const scheduledCourses = courses.filter(c => c.is_future);

  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    return new Date(isoString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="py-12 flex justify-center items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-3 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading your enrolled courses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="bg-edtech-hero rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-white/20 relative overflow-hidden flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        {/* Soft atmospheric ambient light glows */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-400/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-purple-400/25 rounded-full blur-2xl pointer-events-none" />

        <div className="space-y-2 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-xs font-bold text-white tracking-wide">
            PASCON<span className="text-[#22d3ee]">X</span> Student Portal
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-xs">
            Welcome back, {user?.name?.split(' ')[0] || 'Student'}
          </h1>
          <p className="text-sm text-blue-100 max-w-xl font-medium leading-relaxed">
            Transforming Talent into IT Xperts. Access your verified private courses, video lectures, and hands-on lab materials below.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-black/20 backdrop-blur-md p-4 rounded-2xl border border-white/20 shrink-0 relative z-10">
          <div className="text-center px-3 border-r border-white/20">
            <div className="text-2xl font-extrabold text-white">{activeCourses.length}</div>
            <div className="text-[11px] text-blue-100 font-semibold uppercase tracking-wider">Active Courses</div>
          </div>
          <div className="text-center px-3">
            <div className="text-2xl font-extrabold text-cyan-300">
              {courses.reduce((acc, curr) => acc + (curr.completed_videos || 0), 0)}
            </div>
            <div className="text-[11px] text-blue-100 font-semibold uppercase tracking-wider">Videos Completed</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Active Enrolled Courses Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 transition-colors">
            <BookOpen className="w-5 h-5 text-brand-600 dark:text-cyan-400" />
            My Active Courses
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{activeCourses.length} Enrolled</span>
        </div>

        {activeCourses.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3 transition-colors">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-white">No Active Courses Assigned</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              You do not have any active course enrollments at this moment. If you recently registered, please contact your administrator.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeCourses.map((course) => (
              <div
                key={course.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col group"
              >
                {/* Course Thumbnail */}
                <div className="h-44 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                  {course.thumbnail_url ? (
                    <img
                      src={course.thumbnail_url}
                      alt={course.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 text-white font-bold text-xl">
                      {course.title.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute top-3 right-3">
                    <StatusBadge status={course.enrollment_status} isExpired={false} />
                  </div>
                </div>

                {/* Course Details */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-cyan-400 transition-colors leading-snug">
                      {course.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {course.description || 'Comprehensive institute course curriculum.'}
                    </p>
                  </div>

                  {/* Metadata */}
                  <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <PlayCircle className="w-4 h-4 text-brand-600 dark:text-cyan-400" />
                        {course.total_videos} Videos
                      </span>
                      <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        Until {formatDate(course.access_expiry)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-semibold">
                        <span className="text-slate-600 dark:text-slate-400">Course Progress</span>
                        <span className="text-brand-700 dark:text-cyan-400 font-bold">{course.progress_percentage}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-brand-600 dark:bg-cyan-400 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${course.progress_percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* CTA Action */}
                  <Link
                    to={`/student/courses/${course.id}`}
                    className="btn-edtech-purple w-full mt-2 inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold transition-all shadow-xs"
                  >
                    <span>{course.progress_percentage > 0 ? 'Continue Learning' : 'Start Course'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expired Enrollments Section */}
      {expiredCourses.length > 0 && (
        <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Expired Courses</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {expiredCourses.map((course) => (
              <div
                key={course.id}
                className="bg-rose-50/50 dark:bg-rose-950/20 rounded-2xl border border-rose-200 dark:border-rose-900/40 p-5 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">{course.title}</h3>
                    <p className="text-xs text-rose-700 dark:text-rose-300 mt-1 font-medium">
                      Your access to this course expired on {formatDate(course.access_expiry)}.
                    </p>
                  </div>
                  <StatusBadge status="EXPIRED" isExpired={true} />
                </div>

                <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-rose-100 dark:border-rose-900/30 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
                  <span>Please contact PASCONX Academy for access renewal.</span>
                  <a
                    href="mailto:support@pasconx.com?subject=Course%20Access%20Renewal"
                    className="font-bold text-brand-600 dark:text-cyan-400 hover:underline shrink-0 ml-2"
                  >
                    Request Renewal
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
