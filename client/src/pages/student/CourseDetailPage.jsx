import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client.js';
import { StatusBadge } from '../../components/common/Badge.jsx';
import { 
  ArrowLeft, 
  Play, 
  Clock, 
  CheckCircle2, 
  AlertOctagon, 
  ShieldAlert, 
  BookOpen, 
  Calendar,
  FileText,
  Lock
} from 'lucide-react';

export default function CourseDetailPage() {
  const { courseId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const res = await api.get(`/student/courses/${courseId}`);
        if (res.success) {
          setData(res);
        }
      } catch (err) {
        setError(err.message || 'Unable to access course.');
      } finally {
        setLoading(false);
      }
    };
    fetchCourse();
  }, [courseId]);

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="py-16 flex justify-center items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading course syllabus...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const isExpired = error.toLowerCase().includes('expired');
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="bg-white rounded-2xl border border-rose-200 p-8 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center mx-auto text-rose-600">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">{error}</p>
          
          {isExpired && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 max-w-md mx-auto text-left">
              <strong>PASCONX Expiration Notice:</strong>
              <p className="mt-1">
                Your access to this course has expired. Please contact PASCONX Academy for access renewal.
              </p>
            </div>
          )}

          <div className="pt-2">
            <Link
              to="/student/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { course, videos, documents = [] } = data;
  const completedCount = videos.filter(v => v.completed === 1).length;
  const progressPercent = videos.length > 0 ? Math.round((completedCount / videos.length) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Navigation Header */}
      <div>
        <Link
          to="/student/dashboard"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Courses
        </Link>
      </div>

      {/* Course Overview Banner */}
      <div className="bg-edtech-hero rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-white/20 relative overflow-hidden space-y-6">
        {/* Soft atmospheric ambient light glows */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-400/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-purple-400/25 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
          <div className="space-y-3 flex-1">
            <div className="inline-flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/30">
                Course Syllabus
              </span>
              <StatusBadge status={course.enrollment_status} />
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight drop-shadow-xs">
              {course.title}
            </h1>

            <p className="text-sm text-blue-100 leading-relaxed max-w-3xl font-medium">
              {course.description || 'Complete training modules and instructional videos.'}
            </p>
          </div>

          <div className="shrink-0 bg-black/20 backdrop-blur-md border border-white/20 p-4 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center gap-2 text-blue-100 font-medium">
              <Calendar className="w-4 h-4 text-cyan-300" />
              <span>Access Valid Until:</span>
            </div>
            <div className="font-bold text-white text-sm">
              {formatDate(course.access_expiry)}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="pt-4 border-t border-white/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-cyan-300 font-extrabold text-sm">
              {progressPercent}%
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                {completedCount} of {videos.length} Modules Completed
              </div>
              <div className="text-[11px] text-blue-100">Track your learning journey</div>
            </div>
          </div>

          <div className="w-full sm:w-64 bg-white/20 rounded-full h-2 overflow-hidden">
            <div
              className="bg-cyan-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Course Documents & Labs Section */}
      {documents && documents.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 transition-colors">
            <FileText className="w-5 h-5 text-brand-600 dark:text-cyan-400" />
            Protected Course Documents & Labs
          </h2>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs transition-colors">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 flex items-center justify-center shrink-0 text-brand-700 dark:text-cyan-400 font-bold text-xs">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {doc.title}
                      </h3>
                      <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                        {doc.file_type === 'application/pdf' ? 'PDF' : 'DOC'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                      {doc.description || 'Protected academic document'}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                      <span>Watermarked with student identity</span>
                    </div>
                  </div>
                </div>

                <div className="sm:shrink-0">
                  <a
                    href={`/api/student/courses/${courseId}/documents/${doc.id}/view?token=${encodeURIComponent(doc.viewToken || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-edtech-purple inline-flex items-center gap-2 px-4 py-2 text-xs font-bold transition-all shadow-2xs"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>View Protected Document</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Videos List Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 transition-colors">
          <BookOpen className="w-5 h-5 text-brand-600 dark:text-cyan-400" />
          Course Curriculum & Videos
        </h2>

        {videos.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
            No active video sessions have been added to this course yet.
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs transition-colors">
            {videos.map((video, idx) => {
              const isCompleted = video.completed === 1;

              return (
                <div
                  key={video.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors group"
                >
                  <div className="flex items-start gap-4">
                    {/* Number / Status Icon */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
                        isCompleted
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-brand-100 dark:group-hover:bg-brand-900/50 group-hover:text-brand-800 dark:group-hover:text-cyan-300'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-cyan-400 transition-colors">
                          {video.title}
                        </h3>
                        {isCompleted && (
                          <span className="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                            Completed
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                        {video.description || 'Instructional module'}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(video.duration_seconds)}
                        </span>
                        {video.progress_seconds > 0 && !isCompleted && (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            In Progress ({Math.round(video.progress_seconds / 60)} min watched)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="sm:shrink-0">
                    <Link
                      to={`/student/watch/${video.id}`}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs ${
                        isCompleted
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                          : 'btn-edtech-purple'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{isCompleted ? 'Rewatch' : video.progress_seconds > 0 ? 'Resume' : 'Watch'}</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
