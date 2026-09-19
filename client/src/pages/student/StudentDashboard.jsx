import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCourses } from '../../context/CourseContext.jsx';
import api from '../../api/client.js';
import { StatusBadge } from '../../components/common/Badge.jsx';
import { 
  BookOpen, 
  PlayCircle, 
  Clock, 
  AlertTriangle, 
  ArrowRight, 
  CheckCircle2, 
  ShieldAlert,
  Calendar,
  Video,
  Radio,
  ExternalLink
} from 'lucide-react';
import MeetingDetailsModal, { formatMeetingTimeIST } from '../../components/meetings/MeetingDetailsModal.jsx';

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

export default function StudentDashboard() {
  const { user } = useAuth();
  const { courses, loading: coursesLoading, error: coursesError } = useCourses();
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [meetingError, setMeetingError] = useState('');

  useEffect(() => {
    let isMounted = true;
    api.get('/student/meetings?limit=4')
      .then(res => {
        if (isMounted && res.success) {
          setUpcomingMeetings(res.meetings || []);
        }
      })
      .catch(err => {
        if (isMounted) setMeetingError(err.message || 'Failed to load upcoming meetings.');
      })
      .finally(() => {
        if (isMounted) setMeetingsLoading(false);
      });
    return () => { isMounted = false; };
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

  const dashboardError = coursesError || meetingError;

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

      {dashboardError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{dashboardError}</span>
        </div>
      )}

      {/* Upcoming Live Classes & Meetings Section */}
      {upcomingMeetings.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 transition-colors">
              <Calendar className="w-5 h-5 text-brand-600 dark:text-cyan-400" />
              Upcoming Live Classes & Meetings
            </h2>
            <Link
              to="/student/calendar"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 dark:text-cyan-400 hover:underline"
            >
              <span>View Full Calendar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {upcomingMeetings.map((meeting) => {
              const { dateStr, timeRangeStr, startTimeStr } = formatMeetingTimeIST(meeting.start_time, meeting.end_time);
              const isMeet = meeting.platform === 'google_meet';
              const status = meeting.runtime_status || meeting.status;
              const isLive = status === 'live';
              const isCancelled = status === 'cancelled';

              return (
                <div
                  key={meeting.id}
                  onClick={() => setSelectedMeeting(meeting)}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs hover:shadow-md hover:border-brand-300 dark:hover:border-cyan-500/40 transition-all flex flex-col justify-between space-y-3 cursor-pointer group"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        isMeet
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      }`}>
                        <Video className="w-3 h-3" />
                        <span>{isMeet ? 'Google Meet' : 'Zoom'}</span>
                      </span>

                      {isLive ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500 text-white animate-pulse">
                          <Radio className="w-3 h-3" />
                          <span>Live Now</span>
                        </span>
                      ) : isCancelled ? (
                        <span className="text-[10px] font-bold text-rose-500">
                          Cancelled
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400">
                          {startTimeStr}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] font-bold text-brand-600 dark:text-cyan-400 line-clamp-1">
                      {meeting.course_title}
                    </div>

                    <h3 className="text-xs font-extrabold text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-brand-600 dark:group-hover:text-cyan-400 transition-colors">
                      {meeting.title}
                    </h3>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{dateStr}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-400">
                      {timeRangeStr ? timeRangeStr.split('-')[0] : ''} IST
                    </span>

                    {meeting.can_join && !isCancelled ? (
                      <a
                        href={meeting.meeting_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold text-white shadow-xs ${
                          isMeet
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        <span>Join</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs font-bold text-brand-600 dark:text-cyan-400 group-hover:underline">
                        Details →
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Enrolled Courses Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 transition-colors">
            <BookOpen className="w-5 h-5 text-brand-600 dark:text-cyan-400" />
            My Active Courses
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{activeCourses.length} Enrolled</span>
            <Link
              to="/student/courses"
              className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-cyan-400 hover:underline"
            >
              <span>View All Courses</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {coursesLoading && courses.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs flex flex-col justify-between">
                <div>
                  <div className="w-full h-44 bg-slate-200 dark:bg-slate-800" />
                  <div className="p-5 space-y-3">
                    <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-full" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-2/3" />
                  </div>
                </div>
                <div className="p-5 pt-0 border-t border-slate-100 dark:border-slate-800/60 mt-4 flex justify-between items-center">
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-24" />
                  <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-xl w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : activeCourses.length === 0 ? (
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
                  <CourseThumbnail url={course.thumbnail_url} title={course.title} />
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

      {selectedMeeting && (
        <MeetingDetailsModal
          meeting={selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          isAdmin={false}
        />
      )}
    </div>
  );
}
