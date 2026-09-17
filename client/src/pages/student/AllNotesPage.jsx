import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  FileText,
  Search,
  BookOpen,
  Video,
  Clock,
  Download,
  Trash2,
  Edit3,
  ExternalLink,
  Filter,
  Check,
  AlertTriangle,
  Lock,
  ArrowRight,
  Sparkles
} from 'lucide-react';

function formatSeconds(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return null;
  const s = Math.max(0, Math.round(Number(seconds)));
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  if (h > 0) {
    return `${h}:${remMin.toString().padStart(2, '0')}:${remSec.toString().padStart(2, '0')}`;
  }
  return `${remMin.toString().padStart(2, '0')}:${remSec.toString().padStart(2, '0')}`;
}

export default function AllNotesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('ALL');
  
  // Deletion modal
  const [deletingNote, setDeletingNote] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Quick edit modal
  const [editingNote, setEditingNote] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const res = await api.get('/student/notes');
      if (res.success) {
        setNotes(res.notes || []);
      }
    } catch (err) {
      console.warn('Failed to load student notes:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  // Unique list of courses for filtering
  const coursesList = useMemo(() => {
    const map = new Map();
    for (const n of notes) {
      if (!map.has(n.course_id)) {
        map.set(n.course_id, n.course_title);
      }
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [notes]);

  // Filter notes by search and course
  const filteredNotes = useMemo(() => {
    let list = [...notes];

    if (selectedCourse !== 'ALL') {
      const cId = Number(selectedCourse);
      list = list.filter(n => n.course_id === cId);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(n =>
        n.title?.toLowerCase().includes(q) ||
        n.content?.toLowerCase().includes(q) ||
        n.course_title?.toLowerCase().includes(q) ||
        n.video_title?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [notes, selectedCourse, searchQuery]);

  // Group notes by Course Title
  const groupedNotes = useMemo(() => {
    const groups = {};
    for (const note of filteredNotes) {
      const courseKey = note.course_title || 'General';
      if (!groups[courseKey]) {
        groups[courseKey] = [];
      }
      groups[courseKey].push(note);
    }
    return groups;
  }, [filteredNotes]);

  // Handle Export
  const handleExport = (format) => {
    let url = `/api/student/notes/export?format=${format}`;
    if (selectedCourse !== 'ALL') {
      url += `&course_id=${selectedCourse}`;
    }
    window.open(url, '_blank');
  };

  // Delete note
  const confirmDeleteNote = async () => {
    if (!deletingNote) return;
    setIsDeleting(true);
    try {
      await api.delete(`/student/notes/${deletingNote.id}`);
      setNotes(prev => prev.filter(n => n.id !== deletingNote.id));
      setDeletingNote(null);
    } catch (err) {
      alert(err.message || 'Failed to delete note.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Save quick edit
  const handleSaveEdit = async () => {
    if (!editingNote || !editContent.trim()) return;
    setIsSavingEdit(true);
    try {
      const res = await api.put(`/student/notes/${editingNote.id}`, {
        title: editTitle.trim(),
        content: editContent.trim(),
        timestamp_seconds: editingNote.timestamp_seconds
      });
      if (res.success) {
        setNotes(prev => prev.map(n => n.id === editingNote.id ? res.note : n));
        setEditingNote(null);
      }
    } catch (err) {
      alert(err.message || 'Failed to update note.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const startEditNote = (note) => {
    setEditingNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-cyan-950/50 text-brand-600 dark:text-cyan-400 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              My Learning Notes
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            All your captured lecture notes, concepts, and video timestamps in one central place.
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleExport('md')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-bold transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400" />
            <span>Export Markdown</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport('txt')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-bold transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export TXT</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search notes, concepts, courses, or video titles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Course Filter Dropdown */}
        {coursesList.length > 0 && (
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="ALL">All Courses ({notes.length} notes)</option>
              {coursesList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Notes Content */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium">Loading your notes collection...</span>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-cyan-950/40 text-brand-600 dark:text-cyan-400 flex items-center justify-center mx-auto">
            <FileText className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {searchQuery || selectedCourse !== 'ALL' ? 'No matching notes found' : 'No notes written yet'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {searchQuery || selectedCourse !== 'ALL'
                ? 'Try clearing your search query or selecting a different course filter.'
                : 'As you watch video lessons, use the Notes panel on the right of the player to capture timestamps and key concepts.'}
            </p>
          </div>
          <div className="pt-2">
            <Link
              to="/student/courses"
              className="btn-edtech-purple inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold shadow-sm"
            >
              <BookOpen className="w-4 h-4" />
              <span>Browse My Courses</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedNotes).map(([courseTitle, courseNotes]) => (
            <div key={courseTitle} className="space-y-4">
              {/* Course Group Header */}
              <div className="flex items-center gap-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                <BookOpen className="w-4 h-4 text-brand-600 dark:text-cyan-400" />
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white tracking-wide uppercase">
                  {courseTitle}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {courseNotes.length} {courseNotes.length === 1 ? 'note' : 'notes'}
                </span>
              </div>

              {/* Course Notes Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {courseNotes.map((note) => {
                  const formattedTime = formatSeconds(note.timestamp_seconds);
                  const isExpired = note.can_access_video === 0;
                  const watchUrl = `/student/watch/${note.video_id}${note.timestamp_seconds ? `?t=${note.timestamp_seconds}` : ''}`;

                  return (
                    <div
                      key={note.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:shadow-md hover:border-brand-300 dark:hover:border-cyan-500/40 transition-all flex flex-col justify-between space-y-3 group"
                    >
                      <div className="space-y-2.5">
                        {/* Video Reference & Timestamp */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              <Video className="w-3 h-3 text-brand-500" />
                              <span className="line-clamp-1">{note.video_title}</span>
                            </div>

                            {formattedTime && (
                              <div>
                                {isExpired ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-mono font-bold">
                                    <Clock className="w-3 h-3" />
                                    <span>⏱ {formattedTime}</span>
                                  </span>
                                ) : (
                                  <Link
                                    to={watchUrl}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 dark:bg-cyan-950/60 text-brand-700 dark:text-cyan-300 hover:bg-brand-100 dark:hover:bg-cyan-900/80 border border-brand-200/80 dark:border-cyan-500/30 text-[11px] font-mono font-bold transition-all"
                                    title="Jump to video at this timestamp"
                                  >
                                    <Clock className="w-3 h-3 text-brand-600 dark:text-cyan-400" />
                                    <span>⏱ {formattedTime}</span>
                                  </Link>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Quick action buttons */}
                          <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => startEditNote(note)}
                              className="p-1 rounded text-slate-400 hover:text-brand-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Edit note"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingNote(note)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                              title="Delete note"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Note Title */}
                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white leading-snug">
                          {note.title}
                        </h3>

                        {/* Note Content */}
                        <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed line-clamp-6 font-sans">
                          {note.content}
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">
                          {new Date(note.created_at).toLocaleDateString()}
                        </span>

                        {isExpired ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[11px] font-semibold">
                            <Lock className="w-3 h-3" />
                            Access Expired
                          </span>
                        ) : (
                          <Link
                            to={watchUrl}
                            className="inline-flex items-center gap-1 text-brand-600 dark:text-cyan-400 font-bold hover:underline"
                          >
                            <span>Open Video</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Edit Modal */}
      {editingNote && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-brand-600 dark:text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Edit Note</h3>
              </div>
              {editingNote.timestamp_seconds !== null && (
                <span className="text-xs font-mono font-bold text-slate-500">
                  ⏱ {formatSeconds(editingNote.timestamp_seconds)}
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Title
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Content
              </label>
              <textarea
                rows={6}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingNote(null)}
                disabled={isSavingEdit}
                className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit || !editContent.trim()}
                className="btn-edtech-purple px-4 py-1.5 rounded-xl text-xs font-bold shadow-sm disabled:opacity-50"
              >
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingNote && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Delete this note?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 italic line-clamp-2">
              "{deletingNote.title}"
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingNote(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteNote}
                disabled={isDeleting}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
