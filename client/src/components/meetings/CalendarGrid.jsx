import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Video,
  Radio,
  BookOpen,
  List,
  Grid,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { formatMeetingTimeIST } from './MeetingDetailsModal.jsx';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarGrid({
  meetings = [],
  onSelectMeeting,
  isAdmin = false,
  onDateClick
}) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'agenda'

  // Month and Year
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Build calendar matrix for current month
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Monday-based indexing: Sunday=6, Monday=0, Tuesday=1 ...
    let startDay = firstDayOfMonth.getDay() - 1;
    if (startDay === -1) startDay = 6;

    const totalDays = lastDayOfMonth.getDate();
    const cells = [];

    // Previous month filler days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      cells.push({
        dayNumber: prevMonthLastDay - i,
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false
      });
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      cells.push({
        dayNumber: day,
        date: new Date(year, month, day),
        isCurrentMonth: true
      });
    }

    // Next month filler days (fill up to multiple of 7)
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      cells.push({
        dayNumber: day,
        date: new Date(year, month + 1, day),
        isCurrentMonth: false
      });
    }

    return cells;
  }, [year, month]);

  // Index meetings by Date string in IST (YYYY-MM-DD)
  const meetingsByDate = useMemo(() => {
    const map = new Map();

    for (const m of meetings) {
      if (!m.start_time) continue;
      const d = new Date(m.start_time);
      // Date in Asia/Kolkata
      const istDateString = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
      if (!map.has(istDateString)) {
        map.set(istDateString, []);
      }
      map.get(istDateString).push(m);
    }

    // Sort meetings inside each day by start_time
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    }

    return map;
  }, [meetings]);

  const todayISTString = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // Sorted list for agenda view
  const agendaMeetings = useMemo(() => {
    return [...meetings].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  }, [meetings]);

  return (
    <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-700/80 shadow-xl dark:shadow-2xl overflow-hidden flex flex-col transition-colors">
      {/* Calendar Navigation Header */}
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-[#131d33] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-50 dark:bg-cyan-950/70 text-brand-600 dark:text-cyan-400 border border-brand-200/60 dark:border-cyan-600/40 flex items-center justify-center font-bold shadow-2xs">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {monthName}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              India Standard Time (IST • Asia/Kolkata)
            </p>
          </div>
        </div>

        {/* View Switcher & Month Controls */}
        <div className="flex items-center gap-2">
          {/* View Switcher */}
          <div className="flex items-center rounded-xl bg-slate-200/80 dark:bg-[#0a0f1d] p-1 border border-transparent dark:border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-white dark:bg-[#1e293b] text-slate-900 dark:text-white shadow-xs border border-transparent dark:border-slate-700/50'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Month</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'agenda'
                  ? 'bg-white dark:bg-[#1e293b] text-slate-900 dark:text-white shadow-xs border border-transparent dark:border-slate-700/50'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Agenda</span>
            </button>
          </div>

          {/* Today button */}
          <button
            type="button"
            onClick={goToToday}
            className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e293b] text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors shadow-2xs cursor-pointer"
          >
            Today
          </button>

          {/* Prev / Next buttons */}
          <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e293b] overflow-hidden">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700" />
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Month View Grid */}
      {viewMode === 'month' ? (
        <div className="flex-1 flex flex-col">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-[#162138] text-center py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            {DAYS_OF_WEEK.map((day) => (
              <div key={day} className="py-0.5">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Day Cells with Crisp 1px Separation Grid */}
          <div className="grid grid-cols-7 flex-1 auto-rows-fr gap-[1px] bg-slate-200 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800">
            {calendarCells.map((cell, idx) => {
              const cellISTDate = cell.date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
              const isToday = cellISTDate === todayISTString;
              const dayMeetings = meetingsByDate.get(cellISTDate) || [];

              return (
                <div
                  key={idx}
                  onClick={() => onDateClick && onDateClick(cell.date)}
                  className={`min-h-[110px] sm:min-h-[130px] p-2 sm:p-2.5 flex flex-col justify-between transition-colors cursor-pointer ${
                    isToday
                      ? 'bg-cyan-50/50 dark:bg-[#13233f] hover:bg-cyan-50 dark:hover:bg-[#172b4d]'
                      : cell.isCurrentMonth
                      ? 'bg-white dark:bg-[#0f172a] hover:bg-slate-50 dark:hover:bg-[#152037]'
                      : 'bg-slate-50/80 dark:bg-[#0a0f1a] text-slate-400 dark:text-slate-600 hover:bg-slate-100/50 dark:hover:bg-[#0d1424]'
                  }`}
                >
                  {/* Day number & today marker */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        isToday
                          ? 'bg-brand-600 dark:bg-cyan-500 text-white shadow-md shadow-cyan-500/20 font-extrabold ring-2 ring-brand-300 dark:ring-cyan-400/40'
                          : cell.isCurrentMonth
                          ? 'text-slate-800 dark:text-slate-200 font-bold'
                          : 'text-slate-400 dark:text-slate-600'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    {dayMeetings.length > 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-50 dark:bg-cyan-950/80 text-brand-600 dark:text-cyan-300 border border-brand-200/70 dark:border-cyan-600/50 shadow-2xs">
                        {dayMeetings.length} {dayMeetings.length === 1 ? 'class' : 'classes'}
                      </span>
                    )}
                  </div>

                  {/* Day Events Badges */}
                  <div className="space-y-1.5 my-1 overflow-hidden">
                    {dayMeetings.slice(0, 3).map((m) => {
                      const isMeet = m.platform === 'google_meet';
                      const isLive = (m.runtime_status || m.status) === 'live';
                      const isCancelled = (m.runtime_status || m.status) === 'cancelled';
                      const { startTimeStr } = formatMeetingTimeIST(m.start_time);

                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectMeeting(m);
                          }}
                          className={`w-full text-left px-2 py-1 rounded-md text-[10px] font-bold truncate flex items-center gap-1.5 transition-all hover:scale-[1.02] shadow-2xs cursor-pointer ${
                            isLive
                              ? 'bg-rose-600 text-white font-extrabold animate-pulse shadow-rose-600/30 shadow-sm'
                              : isCancelled
                              ? 'bg-slate-100 dark:bg-slate-800/90 text-slate-400 dark:text-slate-500 line-through border border-slate-200 dark:border-slate-700/50'
                              : isMeet
                              ? 'bg-emerald-50 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-600/70 shadow-xs hover:border-emerald-400 dark:hover:border-emerald-500'
                              : 'bg-blue-50 dark:bg-blue-950/90 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-600/70 shadow-xs hover:border-blue-400 dark:hover:border-blue-500'
                          }`}
                          title={`${m.title} (${startTimeStr})`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isLive 
                              ? 'bg-white' 
                              : isCancelled 
                              ? 'bg-slate-400' 
                              : isMeet 
                              ? 'bg-emerald-500 dark:bg-emerald-400' 
                              : 'bg-blue-500 dark:bg-blue-400'
                          }`} />
                          <span className="shrink-0 font-extrabold">{startTimeStr}</span>
                          <span className="truncate">{m.title}</span>
                        </button>
                      );
                    })}

                    {dayMeetings.length > 3 && (
                      <div className="text-[9px] font-bold text-slate-400 pl-1">
                        +{dayMeetings.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Agenda / List View */
        <div className="p-4 sm:p-6 space-y-3">
          {agendaMeetings.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                No meetings scheduled for this period
              </p>
              <p className="text-[11px] text-slate-400">
                When an instructor schedules a class, it will appear right here.
              </p>
            </div>
          ) : (
            agendaMeetings.map((meeting) => {
              const { dateStr, timeRangeStr } = formatMeetingTimeIST(meeting.start_time, meeting.end_time);
              const isMeet = meeting.platform === 'google_meet';
              const status = meeting.runtime_status || meeting.status;
              const isLive = status === 'live';
              const isCancelled = status === 'cancelled';

              return (
                <div
                  key={meeting.id}
                  onClick={() => onSelectMeeting(meeting)}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#131d33] hover:border-brand-300 dark:hover:border-cyan-500/50 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-brand-50 dark:bg-cyan-950/60 text-brand-700 dark:text-cyan-300 border border-brand-200/80 dark:border-cyan-500/30">
                        <BookOpen className="w-3 h-3" />
                        <span>{meeting.course_title}</span>
                      </span>

                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        isMeet
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                      }`}>
                        <Video className="w-3 h-3" />
                        <span>{isMeet ? 'Google Meet' : 'Zoom'}</span>
                      </span>

                      {isLive && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-500 text-white animate-pulse">
                          <Radio className="w-3 h-3" />
                          <span>Live Now</span>
                        </span>
                      )}

                      {isCancelled && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-600 border border-rose-200 dark:border-rose-900">
                          Cancelled
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-cyan-400 transition-colors">
                      {meeting.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold">{dateStr}</span>
                      <span>•</span>
                      <span>{timeRangeStr}</span>
                      {meeting.instructor_name && (
                        <>
                          <span>•</span>
                          <span>Instructor: {meeting.instructor_name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {meeting.can_join && !isCancelled ? (
                      <a
                        href={meeting.meeting_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-all hover:scale-102 cursor-pointer ${
                          isMeet
                            ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                            : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                        }`}
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Join Meeting</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectMeeting(meeting)}
                        className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        Details
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
