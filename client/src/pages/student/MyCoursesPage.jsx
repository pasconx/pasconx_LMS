import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCourses } from '../../context/CourseContext.jsx';
import { StatusBadge } from '../../components/common/Badge.jsx';
import { 
  BookOpen, 
  PlayCircle, 
  Clock, 
  Search, 
  ArrowRight, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  GraduationCap,
  RotateCcw,
  Sparkles
} from 'lucide-react';

function normalizeThumbnailUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();

  const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i)
    || trimmed.match(/drive\.google\.com\/(?:uc|open)\?(?:.*&)?id=([a-zA-Z0-9_-]+)/i);

  if (driveMatch && driveMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  }

  return trimmed;
}

function CourseThumbnail({ url, title }) {
  const [currentSrc, setCurrentSrc] = useState(() => normalizeThumbnailUrl(url));
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setCurrentSrc(normalizeThumbnailUrl(url));
    setHasError(false);
  }, [url]);

  const handleError = () => {
    const driveMatch = currentSrc?.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i);
    if (driveMatch && driveMatch[1]) {
      const proxyUrl = `/api/proxy/thumbnail?id=${driveMatch[1]}`;
      if (currentSrc !== proxyUrl) {
        setCurrentSrc(proxyUrl);
        return;
      }
    }
    setHasError(true);
  };

  if (currentSrc && !hasError) {
    return (
      <img
        src={currentSrc}
        alt={title}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
        onError={handleError}
      />
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 text-white font-bold text-xl">
      {title ? title.substring(0, 2).toUpperCase() : 'CO'}
    </div>
  );
}

export default function MyCoursesPage() {
  const { user } = useAuth();
  const { courses, loading, isRefreshing, error, fetchCourses } = useCourses();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'IN_PROGRESS' | 'NOT_STARTED' | 'COMPLETED' | 'EXPIRED'

  const activeCourses = courses.filter(c => c.is_active);
  const expiredCourses = courses.filter(c => c.is_expired);
  const inProgressCourses = activeCourses.filter(c => (c.progress_percentage || 0) > 0 && (c.progress_percentage || 0) < 100);
  const notStartedCourses = activeCourses.filter(c => (c.progress_percentage || 0) === 0);
  const completedCourses = activeCourses.filter(c => (c.progress_percentage || 0) === 100);

  // Filter based on active tab and search query
  const filteredCourses = courses.filter(course => {
    // 1. Filter by Tab
    if (activeFilter === 'IN_PROGRESS') {
      if (!course.is_active || (course.progress_percentage || 0) === 0 || (course.progress_percentage || 0) === 100) return false;
    } else if (activeFilter === 'NOT_STARTED') {
      if (!course.is_active || (course.progress_percentage || 0) > 0) return false;
    } else if (activeFilter === 'COMPLETED') {
      if (!course.is_active || (course.progress_percentage || 0) < 100) return false;
    } else if (activeFilter === 'EXPIRED') {
      if (!course.is_expired) return false;
    }

    // 2. Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = (course.title || '').toLowerCase().includes(q);
      const descMatch = (course.description || '').toLowerCase().includes(q);
      return titleMatch || descMatch;
    }

    return true;
  });

  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    return new Date(isoString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const filterTabs = [
    { id: 'ALL', label: 'All Courses', count: courses.length },
    { id: 'IN_PROGRESS', label: 'In Progress', count: inProgressCourses.length },
    { id: 'NOT_STARTED', label: 'Not Started', count: notStartedCourses.length },
    { id: 'COMPLETED', label: 'Completed', count: completedCourses.length },
    { id: 'EXPIRED', label: 'Expired', count: expiredCourses.length }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden transition-colors">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-cyan-950/60 border border-brand-200 dark:border-cyan-800 text-xs font-bold text-brand-700 dark:text-cyan-400">
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Enrolled Curriculum</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              My Courses
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl font-normal">
              Access and manage your registered learning tracks, video lectures, and study syllabi.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shrink-0">
            <div className="text-center px-4 border-r border-slate-200 dark:border-slate-700">
              <div className="text-2xl font-extrabold text-slate-900 dark:text-white">{activeCourses.length}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Active</div>
            </div>
            <div className="text-center px-4">
              <div className="text-2xl font-extrabold text-brand-600 dark:text-cyan-400">{completedCourses.length}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Completed</div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchCourses(true)}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shrink-0 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {filterTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeFilter === tab.id
                  ? 'bg-brand-600 text-white shadow-xs dark:bg-cyan-500 dark:text-slate-950'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeFilter === tab.id
                  ? 'bg-white/20 text-white dark:bg-slate-950/20 dark:text-slate-950 font-extrabold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Real-time Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search enrolled courses..."
            className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold px-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Courses Cards Grid */}
      {loading && courses.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-full h-44 bg-slate-200 dark:bg-slate-800" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-full" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-2/3" />
                  <div className="pt-2 space-y-1.5">
                    <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full w-full" />
                  </div>
                </div>
              </div>
              <div className="p-5 pt-0 border-t border-slate-100 dark:border-slate-800/60 mt-4 flex justify-between items-center">
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-24" />
                <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-xl w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-4 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <BookOpen className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {searchQuery ? 'No matching courses found' : 'No courses in this view'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {searchQuery 
                ? `No enrolled courses matched "${searchQuery}". Try a different keyword or clear the search filter.`
                : 'You do not have any courses matching this category.'}
            </p>
          </div>
          {(searchQuery || activeFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveFilter('ALL');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-brand-600 dark:text-cyan-400 bg-brand-50 dark:bg-cyan-950/60 hover:bg-brand-100 dark:hover:bg-cyan-900/60 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course) => {
            const isExpired = course.is_expired;
            return (
              <div
                key={course.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl border overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col group ${
                  isExpired 
                    ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/10' 
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Course Thumbnail Banner */}
                <div className="h-44 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                  <CourseThumbnail url={course.thumbnail_url} title={course.title} />
                  <div className="absolute top-3 right-3">
                    <StatusBadge status={course.enrollment_status} isExpired={isExpired} />
                  </div>
                </div>

                {/* Course Content */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-cyan-400 transition-colors leading-snug">
                      {course.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {course.description || 'Comprehensive institute course curriculum.'}
                    </p>
                  </div>

                  {/* Metadata & Progress */}
                  <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <PlayCircle className="w-4 h-4 text-brand-600 dark:text-cyan-400" />
                        {course.total_videos} Videos
                      </span>
                      <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        {isExpired ? `Expired ${formatDate(course.access_expiry)}` : `Until ${formatDate(course.access_expiry)}`}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    {!isExpired && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-semibold">
                          <span className="text-slate-600 dark:text-slate-400">Course Progress</span>
                          <span className="text-brand-700 dark:text-cyan-400 font-bold">{course.progress_percentage || 0}%</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-brand-600 dark:bg-cyan-400 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${course.progress_percentage || 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action CTA */}
                  {isExpired ? (
                    <div className="pt-2">
                      <a
                        href="mailto:support@pasconx.com?subject=Course%20Access%20Renewal"
                        className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl hover:bg-rose-100 transition-colors"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Request Access Renewal</span>
                      </a>
                    </div>
                  ) : (
                    <Link
                      to={`/student/courses/${course.id}`}
                      className="btn-edtech-purple w-full mt-2 inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold transition-all shadow-xs"
                    >
                      <span>{(course.progress_percentage || 0) > 0 ? 'Continue Learning' : 'Start Course'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
