import React, { useState, useEffect, useMemo } from 'react';
import api from '../../api/client.js';
import CalendarGrid from '../../components/meetings/CalendarGrid.jsx';
import MeetingDetailsModal from '../../components/meetings/MeetingDetailsModal.jsx';
import {
  Calendar as CalendarIcon,
  Video,
  BookOpen,
  Filter,
  Info,
  Clock,
  Sparkles
} from 'lucide-react';

export default function StudentCalendarPage() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState('ALL');

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/student/meetings');
      if (res.success) {
        setMeetings(res.meetings || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load course calendar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  // Filter options for enrolled courses
  const courseOptions = useMemo(() => {
    const map = new Map();
    for (const m of meetings) {
      if (m.course_id && !map.has(m.course_id)) {
        map.set(m.course_id, m.course_title);
      }
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [meetings]);

  const filteredMeetings = useMemo(() => {
    if (selectedCourse === 'ALL') return meetings;
    const cId = Number(selectedCourse);
    return meetings.filter(m => m.course_id === cId);
  }, [meetings, selectedCourse]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Course Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-brand-50 dark:bg-cyan-950/50 text-brand-600 dark:text-cyan-400 flex items-center justify-center font-bold shadow-2xs">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Class & Meeting Calendar
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Live instructor sessions, workshops, and lab reviews for your enrolled courses.
          </p>
        </div>

        {/* Filter by Course */}
        {courseOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-2xs"
            >
              <option value="ALL">All Enrolled Courses ({meetings.length} sessions)</option>
              {courseOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Info Banner */}
      <div className="p-4 rounded-2xl bg-brand-50/70 dark:bg-cyan-950/30 border border-brand-200/80 dark:border-cyan-500/30 flex items-start gap-3 text-xs text-brand-900 dark:text-cyan-200">
        <Info className="w-4 h-4 text-brand-600 dark:text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold">India Standard Time (IST) Guidelines:</p>
          <p className="text-brand-800/90 dark:text-cyan-300/80 leading-relaxed">
            All schedules are presented in IST (Asia/Kolkata). The "Join Meeting" button automatically activates 15 minutes before class start time. Click any meeting in the calendar to view agenda details or join the live room.
          </p>
        </div>
      </div>

      {/* Calendar View */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium text-slate-500">Loading course schedule...</span>
        </div>
      ) : error ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-rose-200 p-8 text-center text-xs text-rose-600">
          {error}
        </div>
      ) : (
        <CalendarGrid
          meetings={filteredMeetings}
          onSelectMeeting={(m) => setSelectedMeeting(m)}
          isAdmin={false}
        />
      )}

      {/* Meeting Details Modal */}
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
