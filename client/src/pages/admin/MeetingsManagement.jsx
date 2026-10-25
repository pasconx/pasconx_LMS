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
  Users,
  Repeat,
  Check
} from 'lucide-react';

const WEEKDAYS = [
  { id: 1, label: 'Mon', full: 'Monday' },
  { id: 2, label: 'Tue', full: 'Tuesday' },
  { id: 3, label: 'Wed', full: 'Wednesday' },
  { id: 4, label: 'Thu', full: 'Thursday' },
  { id: 5, label: 'Fri', full: 'Friday' },
  { id: 6, label: 'Sat', full: 'Saturday' },
  { id: 0, label: 'Sun', full: 'Sunday' }
];

function format12HourTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDateLongIST(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return dateObj.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function calculateSessionCount(startDateStr, endDateStr, recurrenceType, selectedDays) {
  if (!startDateStr) return 0;
  if (!recurrenceType || recurrenceType === 'none') return 1;
  if (!endDateStr) return 0;

  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ey, em - 1, ed);

  if (endUtc < startUtc) return 0;

  let allowed = [];
  if (recurrenceType === 'daily') {
    allowed = [0, 1, 2, 3, 4, 5, 6];
  } else if (recurrenceType === 'weekdays') {
    allowed = [1, 2, 3, 4, 5];
  } else if (recurrenceType === 'weekly' || recurrenceType === 'custom') {
    allowed = selectedDays || [];
  }

  let count = 0;
  const oneDay = 24 * 60 * 60 * 1000;
  for (let ms = startUtc; ms <= endUtc; ms += oneDay) {
    const day = new Date(ms).getUTCDay();
    if (allowed.includes(day)) {
      count++;
      if (count > 150) break;
    }
  }
  return count;
}

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

  // Recurrence Series Scope Modals
  const [editScopeModalOpen, setEditScopeModalOpen] = useState(false);
  const [pendingEditPayload, setPendingEditPayload] = useState(null);
  const [editScope, setEditScope] = useState('single');

  const [cancellingMeeting, setCancellingMeeting] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelScope, setCancelScope] = useState('single');

  const [deletingMeeting, setDeletingMeeting] = useState(null);
  const [deleteScope, setDeleteScope] = useState('single');

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

  // Recurrence Inputs
  const [recurrenceType, setRecurrenceType] = useState('none');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [selectedDays, setSelectedDays] = useState([1, 2, 3, 4, 5]);

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

    // Default start date to tomorrow in IST
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    setFormDate(tomorrowStr);

    // Default end date to 1 month ahead
    const monthLater = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    setRecurrenceEndDate(monthLater.toISOString().split('T')[0]);

    setFormStartTime('19:00');
    setFormEndTime('20:00');
    setFormStatus('scheduled');

    setRecurrenceType('none');
    setSelectedDays([1, 2, 3, 4, 5]);
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
    const dateStr = m.scheduled_date || startObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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

    setRecurrenceType(m.recurrence_type || 'none');
    if (m.recurrence_end_date) {
      const eObj = new Date(m.recurrence_end_date);
      setRecurrenceEndDate(eObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    } else {
      setRecurrenceEndDate(dateStr);
    }

    setEditScope('single');
    setFormError('');
    setIsModalOpen(true);
  };

  const toggleWeekday = (dayId) => {
    setSelectedDays((prev) => {
      if (prev.includes(dayId)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter((d) => d !== dayId);
      }
      return [...prev, dayId].sort();
    });
  };

  // Recurrence summary text calculation
  const recurrenceSummary = useMemo(() => {
    if (recurrenceType === 'none') {
      const startFormatted = format12HourTime(formStartTime);
      const endFormatted = format12HourTime(formEndTime);
      return {
        headline: 'One-time meeting',
        dateRange: formatDateLongIST(formDate),
        sessions: 1,
        time: `${startFormatted} – ${endFormatted} IST`
      };
    }

    let headline = 'Repeats daily';
    if (recurrenceType === 'weekdays') {
      headline = 'Repeats every weekday (Monday–Friday)';
    } else if (recurrenceType === 'weekly' || recurrenceType === 'custom') {
      const dayLabels = selectedDays.map((d) => WEEKDAYS.find((w) => w.id === d)?.full).filter(Boolean);
      headline = dayLabels.length === 5 && [1, 2, 3, 4, 5].every((d) => selectedDays.includes(d))
        ? 'Repeats every weekday (Monday–Friday)'
        : `Repeats weekly on ${dayLabels.join(', ')}`;
    }

    const startText = formatDateLongIST(formDate);
    const endText = formatDateLongIST(recurrenceEndDate);
    const startFormatted = format12HourTime(formStartTime);
    const endFormatted = format12HourTime(formEndTime);
    const count = calculateSessionCount(formDate, recurrenceEndDate, recurrenceType, selectedDays);

    return {
      headline,
      dateRange: `${startText} – ${endText}`,
      sessions: count,
      time: `${startFormatted} – ${endFormatted} IST`
    };
  }, [formDate, recurrenceEndDate, recurrenceType, selectedDays, formStartTime, formEndTime]);

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
    const startISO = new Date(`${formDate}T${formStartTime}:00+05:30`).toISOString();
    const endISO = new Date(`${formDate}T${formEndTime}:00+05:30`).toISOString();

    if (new Date(endISO) <= new Date(startISO)) {
      setFormError('End time must be after start time.');
      return;
    }

    if (recurrenceType !== 'none') {
      if (!recurrenceEndDate) {
        setFormError('Recurrence end date is required.');
        return;
      }
      if (recurrenceEndDate < formDate) {
        setFormError('Recurrence end date cannot be earlier than start date.');
        return;
      }
      if ((recurrenceType === 'weekly' || recurrenceType === 'custom') && selectedDays.length === 0) {
        setFormError('Please select at least one weekday for recurrence.');
        return;
      }
      if (recurrenceSummary.sessions === 0) {
        setFormError('No meeting dates match the selected weekdays within this date range.');
        return;
      }
    }

    const payload = {
      course_id: Number(formCourseId),
      title: formTitle.trim(),
      description: formDescription.trim(),
      platform: formPlatform,
      meeting_url: formMeetingUrl.trim(),
      instructor_name: formInstructor.trim(),
      start_time: startISO,
      end_time: endISO,
      status: formStatus,
      recurrence_type: recurrenceType,
      recurrence_end_date: recurrenceType !== 'none' ? recurrenceEndDate : null,
      selected_days: (recurrenceType === 'weekly' || recurrenceType === 'custom') ? selectedDays : undefined
    };

    if (editingMeeting) {
      if (editingMeeting.recurrence_group_id) {
        // Prompt series edit scope modal
        setPendingEditPayload(payload);
        setEditScope('single');
        setEditScopeModalOpen(true);
        return;
      }
      // Single meeting edit direct save
      await executeMeetingUpdate(payload, 'single');
    } else {
      // Create new meeting (single or series)
      setIsSubmitting(true);
      setFormError('');
      try {
        const res = await api.post('/admin/meetings', payload);
        if (res.success) {
          if (res.meetings && res.meetings.length > 0) {
            setMeetings((prev) => [...res.meetings, ...prev]);
          } else if (res.meeting) {
            setMeetings((prev) => [res.meeting, ...prev]);
          }
          setIsModalOpen(false);
        }
      } catch (err) {
        setFormError(err.message || 'Failed to schedule meeting.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const executeMeetingUpdate = async (payload, scope) => {
    setIsSubmitting(true);
    setFormError('');
    try {
      const res = await api.put(`/admin/meetings/${editingMeeting.id}`, {
        ...payload,
        apply_scope: scope
      });
      if (res.success) {
        if (scope !== 'single') {
          await fetchData();
        } else {
          setMeetings((prev) => prev.map((m) => (m.id === editingMeeting.id ? res.meeting : m)));
        }
        setEditScopeModalOpen(false);
        setIsModalOpen(false);
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
        cancellation_reason: cancelReason.trim() || 'Instructor unavailable.',
        apply_scope: cancellingMeeting.recurrence_group_id ? cancelScope : 'single'
      });
      if (res.success) {
        if (cancelScope !== 'single') {
          await fetchData();
        } else {
          setMeetings((prev) => prev.map((m) => (m.id === cancellingMeeting.id ? res.meeting : m)));
        }
        setCancellingMeeting(null);
        setCancelReason('');
        setCancelScope('single');
      }
    } catch (err) {
      alert(err.message || 'Failed to cancel meeting.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingMeeting) return;
    try {
      const scope = deletingMeeting.recurrence_group_id ? deleteScope : 'single';
      const res = await api.delete(`/admin/meetings/${deletingMeeting.id}?apply_scope=${scope}`);
      if (res.success) {
        if (scope !== 'single') {
          await fetchData();
        } else {
          setMeetings((prev) => prev.filter((m) => m.id !== deletingMeeting.id));
        }
        setDeletingMeeting(null);
        setDeleteScope('single');
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
            Schedule Google Meet and Zoom live sessions with one-time and recurring options for course curriculum.
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
                  const isSeries = Boolean(m.recurrence_group_id);

                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Course & Title */}
                      <td className="py-4 px-4 sm:px-6 max-w-xs space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand-50 dark:bg-cyan-950/60 text-brand-700 dark:text-cyan-300 border border-brand-200/80 dark:border-cyan-500/30">
                            <BookOpen className="w-3 h-3" />
                            <span>{m.course_title}</span>
                          </span>

                          {isSeries && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800" title="Recurring Series">
                              <Repeat className="w-2.5 h-2.5 text-indigo-500" />
                              <span>
                                {m.recurrence_type === 'weekdays'
                                  ? 'Mon–Fri'
                                  : m.recurrence_type === 'daily'
                                  ? 'Daily'
                                  : m.recurrence_type === 'weekly'
                                  ? 'Weekly'
                                  : 'Series'}
                              </span>
                            </span>
                          )}
                        </div>

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
                                setCancelScope('single');
                              }}
                              className="px-2 py-1 rounded-lg border border-amber-300 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-[11px] font-bold"
                              title="Cancel Meeting"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingMeeting(m);
                              setDeleteScope('single');
                            }}
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-7 space-y-5 shadow-2xl animate-scale-up max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-cyan-950/60 text-brand-600 dark:text-cyan-400 flex items-center justify-center font-bold">
                  <Video className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    {editingMeeting ? 'Edit Scheduled Meeting' : 'Schedule New Live Meeting'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {editingMeeting
                      ? 'Update meeting details, platform, or scheduling parameters'
                      : 'Create one-time or recurring live class sessions in Indian Standard Time (IST)'}
                  </p>
                </div>
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
                  placeholder="e.g. Cybersecurity SOC Analyst – Daily Class"
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
                    {recurrenceType !== 'none' ? 'Start Date (IST) *' : 'Date (IST) *'}
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

              {/* ============================================================== */}
              {/* MEETING RECURRENCE SECTION (Below Date & Time fields)           */}
              {/* ============================================================== */}
              <div className="pt-2 pb-1 border-t border-b border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-brand-600 dark:text-cyan-400" />
                    <span className="font-extrabold text-slate-800 dark:text-slate-200">
                      Meeting Recurrence
                    </span>
                  </div>
                  {recurrenceType !== 'none' && (
                    <span className="text-[11px] font-bold text-brand-600 dark:text-cyan-400 bg-brand-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded-full border border-brand-200/60 dark:border-cyan-800/60">
                      Series Active
                    </span>
                  )}
                </div>

                {/* Recurrence Mode Selection Tabs */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                    Repeat Meeting
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 bg-slate-100 dark:bg-slate-800/70 p-1 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                    <button
                      type="button"
                      onClick={() => setRecurrenceType('none')}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all text-center ${
                        recurrenceType === 'none'
                          ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-cyan-400 shadow-xs border border-slate-200 dark:border-slate-700'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      One-time
                    </button>

                    <button
                      type="button"
                      onClick={() => setRecurrenceType('daily')}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all text-center ${
                        recurrenceType === 'daily'
                          ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-cyan-400 shadow-xs border border-slate-200 dark:border-slate-700'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Daily
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRecurrenceType('weekdays');
                        setSelectedDays([1, 2, 3, 4, 5]);
                      }}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all text-center ${
                        recurrenceType === 'weekdays'
                          ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-cyan-400 shadow-xs border border-slate-200 dark:border-slate-700'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Every Weekday
                    </button>

                    <button
                      type="button"
                      onClick={() => setRecurrenceType('weekly')}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all text-center ${
                        recurrenceType === 'weekly'
                          ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-cyan-400 shadow-xs border border-slate-200 dark:border-slate-700'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Weekly
                    </button>

                    <button
                      type="button"
                      onClick={() => setRecurrenceType('custom')}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all text-center col-span-2 sm:col-span-1 ${
                        recurrenceType === 'custom'
                          ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-cyan-400 shadow-xs border border-slate-200 dark:border-slate-700'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Custom Days
                    </button>
                  </div>
                </div>

                {/* Dynamic Configuration per Recurrence Option */}
                {recurrenceType !== 'none' && (
                  <div className="space-y-3 pt-1">
                    {/* Weekday Buttons for Weekly / Custom */}
                    {(recurrenceType === 'weekly' || recurrenceType === 'custom') && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            Select Days of the Week *
                          </label>
                          <span className="text-[10px] text-slate-400">
                            Click to toggle active class days
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {WEEKDAYS.map((w) => {
                            const isSelected = selectedDays.includes(w.id);
                            return (
                              <button
                                key={w.id}
                                type="button"
                                onClick={() => toggleWeekday(w.id)}
                                className={`flex-1 min-w-[50px] py-2 px-1 rounded-xl text-xs font-extrabold transition-all border text-center ${
                                  isSelected
                                    ? 'bg-brand-600 border-brand-600 text-white shadow-xs'
                                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                                }`}
                              >
                                {w.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Every Weekday Notice */}
                    {recurrenceType === 'weekdays' && (
                      <div className="p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/40 text-[11px] text-blue-800 dark:text-blue-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0" />
                        <span>
                          Automatically schedules every <strong>Monday, Tuesday, Wednesday, Thursday, and Friday</strong> in date range. Weekends are skipped.
                        </span>
                      </div>
                    )}

                    {/* Daily Notice */}
                    {recurrenceType === 'daily' && (
                      <div className="p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/40 text-[11px] text-blue-800 dark:text-blue-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0" />
                        <span>Repeats every calendar day from start date until end date.</span>
                      </div>
                    )}

                    {/* Recurrence End Date */}
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Recurrence End Date (Inclusive) *
                      </label>
                      <input
                        type="date"
                        min={formDate}
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>

                    {/* Human-readable Summary Card */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 space-y-1">
                      <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 dark:text-white">
                        <Repeat className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400" />
                        <span>{recurrenceSummary.headline}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        {recurrenceSummary.dateRange} • <strong className="text-brand-600 dark:text-cyan-400">{recurrenceSummary.sessions} {recurrenceSummary.sessions === 1 ? 'session' : 'sessions'}</strong>
                      </div>
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {recurrenceSummary.time}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Instructor Name */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Instructor Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Academic Team / Dr. Salman"
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
                  rows={2}
                  placeholder="SOC monitoring, SIEM fundamentals, and practical exercises..."
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
                  <span>
                    {isSubmitting
                      ? 'Saving...'
                      : editingMeeting
                      ? 'Update Meeting'
                      : recurrenceType !== 'none'
                      ? `Schedule ${recurrenceSummary.sessions} Meetings`
                      : 'Schedule Meeting'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Series Edit Scope Choice Modal */}
      {editScopeModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Repeat className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Edit Recurring Meeting
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This meeting is part of a recurring series. How would you like to apply your changes?
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1 text-xs">
              <label
                onClick={() => setEditScope('single')}
                className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                  editScope === 'single'
                    ? 'border-brand-500 bg-brand-50/40 dark:bg-brand-950/30 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="editScope"
                  value="single"
                  checked={editScope === 'single'}
                  onChange={() => setEditScope('single')}
                  className="mt-0.5 text-brand-600"
                />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">1. Edit this meeting only</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Changes apply only to this specific session on {formatMeetingTimeIST(editingMeeting?.start_time).dateStr}.
                  </div>
                </div>
              </label>

              <label
                onClick={() => setEditScope('future')}
                className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                  editScope === 'future'
                    ? 'border-brand-500 bg-brand-50/40 dark:bg-brand-950/30 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="editScope"
                  value="future"
                  checked={editScope === 'future'}
                  onChange={() => setEditScope('future')}
                  className="mt-0.5 text-brand-600"
                />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">2. Edit this and future meetings</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Updates this session and all upcoming sessions in this series. Past meetings remain unchanged.
                  </div>
                </div>
              </label>

              <label
                onClick={() => setEditScope('all')}
                className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                  editScope === 'all'
                    ? 'border-brand-500 bg-brand-50/40 dark:bg-brand-950/30 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="editScope"
                  value="all"
                  checked={editScope === 'all'}
                  onChange={() => setEditScope('all')}
                  className="mt-0.5 text-brand-600"
                />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">3. Edit the entire series</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Applies updates to all meetings belonging to this recurrence series.
                  </div>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditScopeModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Back to Form
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => executeMeetingUpdate(pendingEditPayload, editScope)}
                className="btn-edtech-purple px-4 py-1.5 rounded-xl text-xs font-bold shadow-sm"
              >
                {isSubmitting ? 'Updating...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Meeting Prompt Modal */}
      {cancellingMeeting && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Cancel Scheduled Meeting?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enrolled students will see the cancellation notice on their calendar.
                </p>
              </div>
            </div>

            {/* If part of a series, show series cancellation options */}
            {cancellingMeeting.recurrence_group_id && (
              <div className="space-y-2 pt-1 text-xs">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Cancellation Scope
                </label>
                <div className="space-y-1.5">
                  <label
                    onClick={() => setCancelScope('single')}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ${
                      cancelScope === 'single'
                        ? 'border-amber-500 bg-amber-50/30 dark:bg-amber-950/20'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="cancelScope"
                      value="single"
                      checked={cancelScope === 'single'}
                      onChange={() => setCancelScope('single')}
                      className="mt-0.5 text-amber-600"
                    />
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">1. Cancel this meeting only</div>
                      <div className="text-[10px] text-slate-400">Cancel session on {formatMeetingTimeIST(cancellingMeeting.start_time).dateStr}.</div>
                    </div>
                  </label>

                  <label
                    onClick={() => setCancelScope('future')}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ${
                      cancelScope === 'future'
                        ? 'border-amber-500 bg-amber-50/30 dark:bg-amber-950/20'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="cancelScope"
                      value="future"
                      checked={cancelScope === 'future'}
                      onChange={() => setCancelScope('future')}
                      className="mt-0.5 text-amber-600"
                    />
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">2. Cancel this and future meetings</div>
                      <div className="text-[10px] text-slate-400">Cancels this and all upcoming sessions in this series.</div>
                    </div>
                  </label>

                  <label
                    onClick={() => setCancelScope('all')}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ${
                      cancelScope === 'all'
                        ? 'border-amber-500 bg-amber-50/30 dark:bg-amber-950/20'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="cancelScope"
                      value="all"
                      checked={cancelScope === 'all'}
                      onChange={() => setCancelScope('all')}
                      className="mt-0.5 text-amber-600"
                    />
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">3. Cancel the entire series</div>
                      <div className="text-[10px] text-slate-400">Cancels all sessions belonging to this recurrence group.</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Cancellation Reason
              </label>
              <input
                type="text"
                placeholder="e.g. Instructor unavailable / Rescheduled"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancellingMeeting(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Delete scheduled meeting?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This will remove the meeting from student schedules and dashboard.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 italic">
              "{deletingMeeting.title}"
            </p>

            {/* If part of a series, show series deletion scope */}
            {deletingMeeting.recurrence_group_id && (
              <div className="space-y-2 pt-1 text-xs">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Deletion Scope
                </label>
                <div className="space-y-1.5">
                  <label
                    onClick={() => setDeleteScope('single')}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ${
                      deleteScope === 'single'
                        ? 'border-rose-500 bg-rose-50/30 dark:bg-rose-950/20'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deleteScope"
                      value="single"
                      checked={deleteScope === 'single'}
                      onChange={() => setDeleteScope('single')}
                      className="mt-0.5 text-rose-600"
                    />
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">1. Delete this meeting only</div>
                      <div className="text-[10px] text-slate-400">Deletes only this session.</div>
                    </div>
                  </label>

                  <label
                    onClick={() => setDeleteScope('future')}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ${
                      deleteScope === 'future'
                        ? 'border-rose-500 bg-rose-50/30 dark:bg-rose-950/20'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deleteScope"
                      value="future"
                      checked={deleteScope === 'future'}
                      onChange={() => setDeleteScope('future')}
                      className="mt-0.5 text-rose-600"
                    />
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">2. Delete this and future meetings</div>
                      <div className="text-[10px] text-slate-400">Deletes this and all upcoming sessions in this series.</div>
                    </div>
                  </label>

                  <label
                    onClick={() => setDeleteScope('all')}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ${
                      deleteScope === 'all'
                        ? 'border-rose-500 bg-rose-50/30 dark:bg-rose-950/20'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deleteScope"
                      value="all"
                      checked={deleteScope === 'all'}
                      onChange={() => setDeleteScope('all')}
                      className="mt-0.5 text-rose-600"
                    />
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">3. Delete the entire series</div>
                      <div className="text-[10px] text-slate-400">Permanently removes all sessions in this series.</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingMeeting(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-sm"
              >
                {deleteScope !== 'single' ? 'Delete Series Meetings' : 'Delete Meeting'}
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
              setCancelScope('single');
            }
            if (action === 'delete') {
              setDeletingMeeting(m);
              setDeleteScope('single');
            }
          }}
        />
      )}
    </div>
  );
}
