import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client.js';
import CalendarGrid from '../../components/meetings/CalendarGrid.jsx';
import MeetingDetailsModal from '../../components/meetings/MeetingDetailsModal.jsx';
import {
  Calendar as CalendarIcon,
  Video,
  Plus,
  Filter,
  ArrowLeft
} from 'lucide-react';

export default function AdminCalendarPage() {
  const [meetings, setMeetings] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState('ALL');
  const [selectedPlatform, setSelectedPlatform] = useState('ALL');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [meetingsRes, coursesRes] = await Promise.all([
        api.get('/admin/meetings'),
        api.get('/admin/courses')
      ]);
      if (meetingsRes.success) setMeetings(meetingsRes.meetings || []);
      if (coursesRes.success) setCourses(coursesRes.courses || []);
    } catch (err) {
      console.warn('Failed to load admin calendar:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (selectedCourse !== 'ALL' && m.course_id !== Number(selectedCourse)) return false;
      if (selectedPlatform !== 'ALL' && m.platform !== selectedPlatform) return false;
      return true;
    });
  }, [meetings, selectedCourse, selectedPlatform]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-brand-50 dark:bg-cyan-950/50 text-brand-600 dark:text-cyan-400 flex items-center justify-center font-bold shadow-2xs">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Master Meeting Calendar
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Overview of all live sessions, Google Meet calls, and Zoom workshops across the institute.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/admin/meetings"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs"
          >
            <Video className="w-4 h-4 text-brand-600 dark:text-cyan-400" />
            <span>Manage Meetings</span>
          </Link>

          <Link
            to="/admin/meetings"
            className="btn-edtech-purple inline-flex items-center gap-2 px-4 py-2 text-xs font-bold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Schedule Meeting</span>
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-bold">
          <Filter className="w-4 h-4 text-slate-400" />
          <span>Filters:</span>
        </div>

        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="ALL">All Courses ({meetings.length} sessions)</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>

        <select
          value={selectedPlatform}
          onChange={(e) => setSelectedPlatform(e.target.value)}
          className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="ALL">All Platforms</option>
          <option value="google_meet">Google Meet</option>
          <option value="zoom">Zoom</option>
        </select>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-24 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium text-slate-400">Loading master calendar...</span>
        </div>
      ) : (
        <CalendarGrid
          meetings={filteredMeetings}
          onSelectMeeting={(m) => setSelectedMeeting(m)}
          isAdmin={true}
        />
      )}

      {/* Details Modal */}
      {selectedMeeting && (
        <MeetingDetailsModal
          meeting={selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          isAdmin={true}
        />
      )}
    </div>
  );
}
