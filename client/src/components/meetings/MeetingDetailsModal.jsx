import React from 'react';
import {
  Video,
  Calendar,
  Clock,
  User,
  ExternalLink,
  X,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  Radio
} from 'lucide-react';

/**
 * Format date & time in Asia/Kolkata (IST) timezone
 */
export function formatMeetingTimeIST(startTimeISO, endTimeISO) {
  if (!startTimeISO) return '';
  const start = new Date(startTimeISO);
  const end = endTimeISO ? new Date(endTimeISO) : null;

  // Format date in IST
  const dateStr = start.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Format start and end time in IST
  const startTimeStr = start.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (end) {
    const endTimeStr = end.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return {
      dateStr,
      timeRangeStr: `${startTimeStr} - ${endTimeStr} IST`,
      startTimeStr,
      endTimeStr,
      fullStr: `${dateStr} • ${startTimeStr} - ${endTimeStr} IST`
    };
  }

  return {
    dateStr,
    timeRangeStr: `${startTimeStr} IST`,
    startTimeStr,
    fullStr: `${dateStr} • ${startTimeStr} IST`
  };
}

export default function MeetingDetailsModal({ meeting, onClose, onAction, isAdmin = false }) {
  if (!meeting) return null;

  const { dateStr, timeRangeStr } = formatMeetingTimeIST(meeting.start_time, meeting.end_time);

  const isGoogleMeet = meeting.platform === 'google_meet';
  const platformLabel = isGoogleMeet ? 'Google Meet' : 'Zoom';

  const status = meeting.runtime_status || meeting.status;
  const isLive = status === 'live';
  const isCancelled = status === 'cancelled';
  const isCompleted = status === 'completed';
  const isUpcoming = status === 'upcoming';

  const joinWindowOpenTime = new Date(new Date(meeting.start_time).getTime() - (meeting.join_window_minutes || 15) * 60 * 1000);
  const joinOpenTimeStr = joinWindowOpenTime.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-6 shadow-2xl animate-scale-up relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Badges */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Course Badge */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-50 dark:bg-cyan-950/60 text-brand-700 dark:text-cyan-300 text-xs font-bold border border-brand-200/80 dark:border-cyan-500/30">
              <BookOpen className="w-3.5 h-3.5" />
              <span>{meeting.course_title}</span>
            </span>

            {/* Platform Badge */}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
              isGoogleMeet 
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
            }`}>
              <Video className="w-3.5 h-3.5" />
              <span>{platformLabel}</span>
            </span>

            {/* Status Indicator */}
            {isLive && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500 text-white text-xs font-bold animate-pulse shadow-xs">
                <Radio className="w-3 h-3" />
                <span>Live Now</span>
              </span>
            )}
            {isUpcoming && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
                Upcoming
              </span>
            )}
            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Completed
              </span>
            )}
            {isCancelled && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 border border-rose-200 dark:border-rose-900 text-xs font-bold">
                <AlertTriangle className="w-3.5 h-3.5" />
                Cancelled
              </span>
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {meeting.title}
          </h2>
        </div>

        {/* Meeting Details Grid */}
        <div className="space-y-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-3 text-xs text-slate-700 dark:text-slate-200">
            <Calendar className="w-4 h-4 text-brand-600 dark:text-cyan-400 shrink-0" />
            <div>
              <span className="font-bold">{dateStr}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-700 dark:text-slate-200">
            <Clock className="w-4 h-4 text-brand-600 dark:text-cyan-400 shrink-0" />
            <div>
              <span className="font-bold">{timeRangeStr}</span>
              <span className="text-[11px] text-slate-400 ml-1.5">(Asia/Kolkata)</span>
            </div>
          </div>

          {meeting.instructor_name && (
            <div className="flex items-center gap-3 text-xs text-slate-700 dark:text-slate-200">
              <User className="w-4 h-4 text-brand-600 dark:text-cyan-400 shrink-0" />
              <div>
                <span className="text-slate-400">Instructor: </span>
                <span className="font-bold">{meeting.instructor_name}</span>
              </div>
            </div>
          )}

          {isAdmin && meeting.enrolled_students_count !== undefined && (
            <div className="flex items-center gap-3 text-xs text-slate-700 dark:text-slate-200 pt-1 border-t border-slate-200 dark:border-slate-700">
              <span className="text-slate-400">Enrolled Students:</span>
              <span className="font-bold text-brand-600 dark:text-cyan-400">{meeting.enrolled_students_count} students</span>
            </div>
          )}
        </div>

        {/* Description */}
        {meeting.description && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Session Agenda & Notes
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {meeting.description}
            </p>
          </div>
        )}

        {/* Cancellation Banner */}
        {isCancelled && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>Meeting Cancelled by Administrator</span>
            </div>
            {meeting.cancellation_reason && (
              <p className="text-[11px] text-rose-700 dark:text-rose-300 pl-5">
                Reason: {meeting.cancellation_reason}
              </p>
            )}
          </div>
        )}

        {/* Action Button: Join Meeting or Status Notice */}
        <div className="pt-2">
          {isCancelled ? (
            <div className="text-center py-2 text-xs font-medium text-slate-400">
              This meeting was cancelled. No live session is active.
            </div>
          ) : isCompleted ? (
            <div className="text-center py-2 text-xs font-medium text-slate-400">
              This meeting has concluded.
            </div>
          ) : meeting.can_join ? (
            <a
              href={meeting.meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full py-3 px-4 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-2 shadow-lg transition-all hover:scale-101 ${
                isGoogleMeet
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Join {platformLabel} Now</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                disabled
                className="w-full py-3 px-4 rounded-xl text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Clock className="w-4 h-4" />
                <span>Join button activates 15 mins before start ({joinOpenTimeStr} IST)</span>
              </button>
              <p className="text-[10px] text-center text-slate-400 dark:text-slate-500">
                You can access the {platformLabel} room starting at {joinOpenTimeStr} IST.
              </p>
            </div>
          )}
        </div>

        {/* Admin Quick Controls if opened by admin */}
        {isAdmin && onAction && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onAction('edit', meeting)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Edit Meeting
              </button>
              {!isCancelled && !isCompleted && (
                <button
                  type="button"
                  onClick={() => onAction('cancel', meeting)}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 text-xs font-bold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                >
                  Cancel Meeting
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => onAction('delete', meeting)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
