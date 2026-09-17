import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client.js';
import MeetingDetailsModal, { formatMeetingTimeIST } from '../../components/meetings/MeetingDetailsModal.jsx';
import {
  Calendar,
  Video,
  Plus,
  Search,
  Filter,
  Edit3,
  Trash2,
  AlertTriangle,
  Radio,
  Clock,
  ExternalLink,
  BookOpen,
  User,
  X,
  Save,
  CheckCircle2,
  Users
} from 'lucide-react';

export default function MeetingsManagement() {
  const [meetings, setMeetings] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState('ALL');
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [selectedDetailsMeeting, setSelectedDetailsMeeting] = useState(null);
  const [cancellingMeeting, setCancellingMeeting] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deletingMeeting, setDeletingMeeting] = useState(null);

  // Form inputs
  const [formCourseId, setFormCourseId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPlatform, setFormPlatform] = useState('google_meet');
  const [formMeetingUrl, setFormMeetingUrl] = useState('');
  const [formInstructor, setFormInstructor] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('19:00');
  const [formEndTime, setFormEndTime] = useState('20:00');
  const [formStatus, setFormStatus] = useState('scheduled');

  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      console.warn('Failed to load meetings data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered list
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (courseFilter !== 'ALL' && m.course_id !== Number(courseFilter)) return false;
      if (platformFilter !== 'ALL' && m.platform !== platformFilter) return false;
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = m.title?.toLowerCase().includes(q);
        const matchCourse = m.course_title?.toLowerCase().includes(q);
        const matchInstructor = m.instructor_name?.toLowerCase().includes(q);
        if (!matchTitle && !matchCourse && !matchInstructor) return false;
      }
      return true;
    });
  }, [meetings, courseFilter, platformFilter, statusFilter, searchQuery]);

  const openCreateModal = () => {
    setEditingMeeting(null);
    setFormCourseId(courses[0]?.id || '');
    setFormTitle('');
    setFormDescription('');
    setFormPlatform('google_meet');
    setFormMeetingUrl('');
    setFormInstructor('');
    // Default to tomorrow
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    setFormDate(tomorrow.toISOString().split('T')[0]);
    setFormStartTime('19:00');
    setFormEndTime('20:00');
    setFormStatus('scheduled');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (m) => {
    setEditingMeeting(m);
    setFormCourseId(m.course_id);
    setFormTitle(m.title);
    setFormDescription(m.description || '');
    setFormPlatform(m.platform);
    setFormMeetingUrl(m.meeting_url);
    setFormInstructor(m.instructor_name || '');

    // Parse start and end time to date and time inputs in Asia/Kolkata
    const startObj = new Date(m.start_time);
    const endObj = new Date(m.end_time);

    // Format YYYY-MM-DD
    const dateStr = startObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    // Format HH:mm
    const startHourMin = startObj.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const endHourMin = endObj.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    setFormDate(dateStr);
    setFormStartTime(startHourMin);
    setFormEndTime(endHourMin);
    setFormStatus(m.status);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setFormError('Meeting title is required.');
      return;
    }
    if (!formCourseId) {
      setFormError('Course selection is mandatory.');
      return;
    }
    if (!formMeetingUrl.trim()) {
      setFormError('Meeting link URL is required.');
      return;
    }
    try {
      const parsed = new URL(formMeetingUrl.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      setFormError('Please provide a valid web URL (e.g. https://meet.google.com/...)');
      return;
    }

    if (!formDate || !formStartTime || !formEndTime) {
      setFormError('Date, start time, and end time are required.');
      return;
    }

    // Compose ISO dates in Asia/Kolkata (+05:30)
    // Format: YYYY-MM-DDTHH:mm:00+05:30
    const startISO = new Date(`${formDate}T${formStartTime}:00+05:30`).toISOString();
    const endISO = new Date(`${formDate}T${formEndTime}:00+05:30`).toISOString();

    if (new Date(endISO) <= new Date(startISO)) {
      setFormError('End time must be after start time.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const payload = {
        course_id: Number(formCourseId),
        title: formTitle.trim(),
        description: formDescription.trim(),
        platform: formPlatform,
        meeting_url: formMeetingUrl.trim(),
        instructor_name: formInstructor.trim(),
        start_time: startISO,
        end_time: endISO,
        status: formStatus
      };

      if (editingMeeting) {
        const res = await api.put(`/admin/meetings/${editingMeeting.id}`, payload);
        if (res.success) {
          setMeetings((prev) => prev.map((m) => (m.id === editingMeeting.id ? res.meeting : m)));
          setIsModalOpen(false);
        }
      } else {
        const res = await api.post('/admin/meetings', payload);
        if (res.success) {
          setMeetings((prev) => [res.meeting, ...prev]);
          setIsModalOpen(false);
        }
      }
    } catch (err) {
      setFormError(err.message || 'Operation failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancellingMeeting) return;
    try {
      const res = await api.patch(`/admin/meetings/${cancellingMeeting.id}/status`, {
        status: 'cancelled',
        cancellation_reason: cancelReason.trim() || 'Instructor unavailable.'
      });
      if (res.success) {
        setMeetings((prev) => prev.map((m) => (m.id === cancellingMeeting.id ? res.meeting : m)));
        setCancellingMeeting(null);
        setCancelReason('');
      }
    } catch (err) {
      alert(err.message || 'Failed to cancel meeting.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingMeeting) return;
    try {
      const res = await api.delete(`/admin/meetings/${deletingMeeting.id}`);
      if (res.success) {
        setMeetings((prev) => prev.filter((m) => m.id !== deletingMeeting.id));
        setDeletingMeeting(null);
      }
    } catch (err) {
      alert(err.message || 'Failed to delete meeting.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-brand-50 dark:bg-cyan-950/50 text-brand-600 dark:text-cyan-400 flex items-center justify-center font-bold shadow-2xs">
              <Video className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Course Meetings & Live Classes
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Schedule Google Meet and Zoom live sessions linked to course curriculum.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/admin/calendar"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs"
          >
            <Calendar className="w-4 h-4 text-brand-600 dark:text-cyan-400" />
            <span>Admin Calendar</span>
          </Link>

          <button
            type="button"
            onClick={openCreateModal}
            className="btn-edtech-purple inline-flex items-center gap-2 px-4 py-2 text-xs font-bold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Schedule Meeting</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex flex-col lg:flex-row items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search meetings by title, instructor, or course..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Course filter */}
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">All Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          {/* Platform filter */}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">All Platforms</option>
            <option value="google_meet">Google Meet</option>
            <option value="zoom">Zoom</option>
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Meetings Table / List */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
            <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium">Loading meetings...</span>
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <Video className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">No meetings found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Schedule live classes with Google Meet or Zoom for any active course.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="btn-edtech-purple inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule First Meeting</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Course & Session</th>
                  <th className="py-3.5 px-4">Date & Time (IST)</th>
                  <th className="py-3.5 px-4">Platform</th>
                  <th className="py-3.5 px-4">Enrolled Students</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredMeetings.map((m) => {
                  const { dateStr, timeRangeStr } = formatMeetingTimeIST(m.start_time, m.end_time);
                  const isMeet = m.platform === 'google_meet';
                  const status = m.runtime_status || m.status;
                  const isLive = status === 'live';
                  const isCancelled = status === 'cancelled';
                  const isCompleted = status === 'completed';

                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Course & Title */}
                      <td className="py-4 px-4 sm:px-6 max-w-xs space-y-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand-50 dark:bg-cyan-950/60 text-brand-700 dark:text-cyan-300 border border-brand-200/80 dark:border-cyan-500/30">
                          <BookOpen className="w-3 h-3" />
                          <span>{m.course_title}</span>
                        </span>
                        <h4 className="font-extrabold text-slate-900 dark:text-white leading-snug line-clamp-1">
                          {m.title}
                        </h4>
                        {m.instructor_name && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-400">
                            <User className="w-3 h-3" />
                            <span>{m.instructor_name}</span>
                          </div>
                        )}
                      </td>

                      {/* Date & Time IST */}
                      <td className="py-4 px-4 whitespace-nowrap space-y-0.5">
                        <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-brand-500" />
                          <span>{dateStr}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {timeRangeStr}
                        </div>
                      </td>

                      {/* Platform */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            isMeet
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                          }`}
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>{isMeet ? 'Google Meet' : 'Zoom'}</span>
                        </span>
                      </td>

                      {/* Enrolled Students */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span>{m.enrolled_students_count || 0} students</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {isLive ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500 text-white text-[11px] font-bold animate-pulse">
                            <Radio className="w-3 h-3" />
                            <span>Live Now</span>
                          </span>
                        ) : isCancelled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-600 border border-rose-200 text-[11px] font-bold">
                            Cancelled
                          </span>
                        ) : isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-medium">
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                            Scheduled
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedDetailsMeeting(m)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="View Meeting Details"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(m)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Edit Meeting"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {!isCancelled && !isCompleted && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancellingMeeting(m);
                                setCancelReason('');
                              }}
                              className="px-2 py-1 rounded-lg border border-amber-300 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-[11px] font-bold"
                              title="Cancel Meeting"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeletingMeeting(m)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="Delete Meeting"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-7 space-y-5 shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-cyan-950/60 text-brand-600 dark:text-cyan-400 flex items-center justify-center font-bold">
                  <Video className="w-4 h-4" />
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {editingMeeting ? 'Edit Scheduled Meeting' : 'Schedule New Live Meeting'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-xs text-rose-700 dark:text-rose-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
              {/* Meeting Title */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Meeting Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Full Stack Architecture Live Q&A"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Course Selection (Mandatory) */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Select Course * <span className="text-slate-400 font-normal">(Enrolled students only)</span>
                </label>
                <select
                  value={formCourseId}
                  onChange={(e) => setFormCourseId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Platform Choice */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Meeting Platform *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                      formPlatform === 'google_meet'
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="platform"
                      value="google_meet"
                      checked={formPlatform === 'google_meet'}
                      onChange={() => setFormPlatform('google_meet')}
                      className="text-emerald-600"
                    />
                    <Video className="w-4 h-4 text-emerald-600" />
                    <span>Google Meet</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                      formPlatform === 'zoom'
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="platform"
                      value="zoom"
                      checked={formPlatform === 'zoom'}
                      onChange={() => setFormPlatform('zoom')}
                      className="text-blue-600"
                    />
                    <Video className="w-4 h-4 text-blue-600" />
                    <span>Zoom</span>
                  </label>
                </div>
              </div>

              {/* Meeting URL */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Meeting URL / Room Link *
                </label>
                <input
                  type="url"
                  placeholder={
                    formPlatform === 'google_meet'
                      ? 'https://meet.google.com/abc-defg-hij'
                      : 'https://zoom.us/j/123456789'
                  }
                  value={formMeetingUrl}
                  onChange={(e) => setFormMeetingUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Date & Time (IST) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Date (IST) *
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Start Time (IST) *
                  </label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    End Time (IST) *
                  </label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              {/* Instructor Name */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Instructor Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Salman / Academic Team"
                  value={formInstructor}
                  onChange={(e) => setFormInstructor(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Description / Agenda */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Agenda & Instructions
                </label>
                <textarea
                  rows={3}
                  placeholder="Topics covered, software needed, prerequisites for students..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                />
              </div>

              {/* Status if editing */}
              {editingMeeting && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-edtech-purple inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Saving...' : editingMeeting ? 'Update Meeting' : 'Schedule Meeting'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Meeting Prompt Modal */}
      {cancellingMeeting && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cancel this meeting?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enrolled students will see the cancellation notice on their calendar.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Cancellation Reason
              </label>
              <input
                type="text"
                placeholder="e.g. Instructor unavailable / Rescheduled"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancellingMeeting(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Keep Active
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors shadow-sm"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Meeting Confirmation Modal */}
      {deletingMeeting && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Delete this meeting?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This will remove the meeting from all enrolled students' calendars.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 italic">
              "{deletingMeeting.title}"
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingMeeting(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-sm"
              >
                Delete Meeting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Meeting Details Modal */}
      {selectedDetailsMeeting && (
        <MeetingDetailsModal
          meeting={selectedDetailsMeeting}
          onClose={() => setSelectedDetailsMeeting(null)}
          isAdmin={true}
          onAction={(action, m) => {
            setSelectedDetailsMeeting(null);
            if (action === 'edit') openEditModal(m);
            if (action === 'cancel') {
              setCancellingMeeting(m);
              setCancelReason('');
            }
            if (action === 'delete') setDeletingMeeting(m);
          }}
        />
      )}
    </div>
  );
}
