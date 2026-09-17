import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../../api/client.js';
import {
  FileText,
  Plus,
  Clock,
  Trash2,
  Edit3,
  Search,
  Download,
  Check,
  AlertTriangle,
  RotateCcw,
  RotateCw,
  Bold,
  Italic,
  Heading,
  List,
  ListOrdered,
  Code,
  X,
  Sparkles,
  Save
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

function parseSecondsInput(str) {
  if (!str) return null;
  const trimmed = str.trim();
  if (!trimmed) return null;
  if (!isNaN(trimmed)) {
    return Math.max(0, Math.round(Number(trimmed)));
  }
  const parts = trimmed.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

export default function NotesPanel({
  videoId,
  courseId,
  student,
  playerControlRef,
  onSeek
}) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Active editor state
  const [isCreating, setIsCreating] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);

  // Form inputs
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [timestampSeconds, setTimestampSeconds] = useState(null);
  const [manualTimeStr, setManualTimeStr] = useState('');
  
  // Status indicator: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  // History stack for undo/redo
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Delete modal state
  const [deletingNote, setDeletingNote] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Draft banner
  const [hasDraft, setHasDraft] = useState(false);
  const [draftData, setDraftData] = useState(null);

  const textareaRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const draftKey = `pasconx_draft_${videoId}_${student?.id || 'default'}`;

  // Fetch notes for this video
  const fetchNotes = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/student/videos/${videoId}/notes`);
      if (res.success) {
        setNotes(res.notes || []);
      }
    } catch (err) {
      console.warn('Failed to load notes:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [videoId]);

  // Check for saved local draft
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.content || parsed.title) {
          setHasDraft(true);
          setDraftData(parsed);
        }
      }
    } catch (e) {}
  }, [videoId, draftKey]);

  // Save current form state to local draft
  const saveToLocalDraft = (t, c, s) => {
    try {
      if (c || t) {
        localStorage.setItem(draftKey, JSON.stringify({
          title: t,
          content: c,
          timestampSeconds: s,
          updatedAt: new Date().toISOString()
        }));
      }
    } catch (e) {}
  };

  const clearLocalDraft = () => {
    try {
      localStorage.removeItem(draftKey);
      setHasDraft(false);
      setDraftData(null);
    } catch (e) {}
  };

  const restoreDraft = () => {
    if (!draftData) return;
    setTitle(draftData.title || '');
    setContent(draftData.content || '');
    setTimestampSeconds(draftData.timestampSeconds || null);
    setManualTimeStr(draftData.timestampSeconds !== null ? formatSeconds(draftData.timestampSeconds) : '');
    setIsCreating(true);
    setEditingNoteId(null);
    setHasDraft(false);
  };

  const discardDraft = () => {
    clearLocalDraft();
  };

  // Capture current playback time from player
  const handleAddCurrentTimestamp = () => {
    let currentSec = null;
    if (playerControlRef?.current && typeof playerControlRef.current.getCurrentTime === 'function') {
      currentSec = playerControlRef.current.getCurrentTime();
    }
    if (currentSec !== null && !isNaN(currentSec)) {
      setTimestampSeconds(currentSec);
      setManualTimeStr(formatSeconds(currentSec));
      saveToLocalDraft(title, content, currentSec);
    } else {
      // Fallback: prompt manual entry
      setManualTimeStr('00:00');
      setTimestampSeconds(0);
    }
  };

  const handleManualTimeChange = (val) => {
    setManualTimeStr(val);
    const parsed = parseSecondsInput(val);
    setTimestampSeconds(parsed);
    saveToLocalDraft(title, content, parsed);
  };

  // Content formatting helpers
  const applyFormatting = (prefix, suffix = '', defaultText = 'text') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = content;
    const selected = current.substring(start, end) || defaultText;

    const updated = current.substring(0, start) + prefix + selected + suffix + current.substring(end);
    
    // Push to history
    pushHistory(updated);
    setContent(updated);
    saveToLocalDraft(title, updated, timestampSeconds);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  };

  const pushHistory = (newVal) => {
    const updated = history.slice(0, historyIndex + 1);
    updated.push(newVal);
    setHistory(updated);
    setHistoryIndex(updated.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setContent(prev);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setContent(next);
    }
  };

  // Auto-save logic (debounced 750ms for existing notes)
  const triggerAutoSave = (newTitle, newContent, newTimestamp) => {
    if (!editingNoteId) return; // Only auto-save existing notes; new notes save on explicit Save or Ctrl+S
    if (!newContent.trim()) return;

    setSaveStatus('saving');
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.put(`/student/notes/${editingNoteId}`, {
          title: newTitle.trim(),
          content: newContent.trim(),
          timestamp_seconds: newTimestamp
        });
        if (res.success) {
          setSaveStatus('saved');
          // Update in local list without full reload
          setNotes(prev => prev.map(n => n.id === editingNoteId ? res.note : n));
          setTimeout(() => setSaveStatus('idle'), 2500);
        }
      } catch (err) {
        setSaveStatus('error');
        setErrorMessage(err.message || 'Auto-save failed.');
      }
    }, 750);
  };

  const handleContentChange = (e) => {
    const val = e.target.value;
    setContent(val);
    pushHistory(val);
    saveToLocalDraft(title, val, timestampSeconds);
    if (editingNoteId) {
      triggerAutoSave(title, val, timestampSeconds);
    }
  };

  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    saveToLocalDraft(val, content, timestampSeconds);
    if (editingNoteId) {
      triggerAutoSave(val, content, timestampSeconds);
    }
  };

  // Explicit Save / Finish
  const handleSaveNote = async () => {
    if (!content.trim()) {
      setErrorMessage('Note content cannot be empty.');
      setSaveStatus('error');
      return;
    }

    setSaveStatus('saving');
    setErrorMessage('');

    try {
      if (editingNoteId) {
        // Update existing note
        const res = await api.put(`/student/notes/${editingNoteId}`, {
          title: title.trim(),
          content: content.trim(),
          timestamp_seconds: timestampSeconds
        });
        if (res.success) {
          setNotes(prev => prev.map(n => n.id === editingNoteId ? res.note : n));
          setSaveStatus('saved');
          clearLocalDraft();
          setTimeout(() => {
            setEditingNoteId(null);
            setIsCreating(false);
            resetForm();
          }, 600);
        }
      } else {
        // Create new note
        const res = await api.post(`/student/videos/${videoId}/notes`, {
          title: title.trim(),
          content: content.trim(),
          timestamp_seconds: timestampSeconds
        });
        if (res.success) {
          setNotes(prev => [res.note, ...prev]);
          setSaveStatus('saved');
          clearLocalDraft();
          setTimeout(() => {
            setIsCreating(false);
            resetForm();
          }, 600);
        }
      }
    } catch (err) {
      setSaveStatus('error');
      setErrorMessage(err.message || 'Unable to save note.');
    }
  };

  const startEditNote = (note) => {
    setIsCreating(false);
    setEditingNoteId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setTimestampSeconds(note.timestamp_seconds);
    setManualTimeStr(note.timestamp_seconds !== null ? formatSeconds(note.timestamp_seconds) : '');
    setHistory([note.content]);
    setHistoryIndex(0);
    setSaveStatus('idle');
    setErrorMessage('');
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const cancelEdit = () => {
    setIsCreating(false);
    setEditingNoteId(null);
    resetForm();
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setTimestampSeconds(null);
    setManualTimeStr('');
    setSaveStatus('idle');
    setErrorMessage('');
    setHistory([]);
    setHistoryIndex(-1);
  };

  const startCreateNote = () => {
    setEditingNoteId(null);
    resetForm();
    setIsCreating(true);

    // Auto-capture current time if playing
    let currentSec = null;
    if (playerControlRef?.current && typeof playerControlRef.current.getCurrentTime === 'function') {
      currentSec = playerControlRef.current.getCurrentTime();
    }
    if (currentSec !== null && !isNaN(currentSec) && currentSec > 0) {
      setTimestampSeconds(currentSec);
      setManualTimeStr(formatSeconds(currentSec));
    }

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  // Keyboard Shortcuts: Ctrl+S to save, Ctrl+Enter to save & finish
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSaveNote();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSaveNote();
    }
  };

  // Delete note
  const confirmDeleteNote = async () => {
    if (!deletingNote) return;
    setIsDeleting(true);
    try {
      await api.delete(`/student/notes/${deletingNote.id}`);
      setNotes(prev => prev.filter(n => n.id !== deletingNote.id));
      if (editingNoteId === deletingNote.id) {
        cancelEdit();
      }
      setDeletingNote(null);
    } catch (err) {
      alert(err.message || 'Failed to delete note.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Export notes
  const handleExport = (format) => {
    window.open(`/api/student/notes/export?format=${format}&video_id=${videoId}`, '_blank');
  };

  // Filtered & Sorted Notes
  const filteredNotes = useMemo(() => {
    let list = [...notes];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(n => 
        n.title?.toLowerCase().includes(q) || 
        n.content?.toLowerCase().includes(q)
      );
    }

    // Sort: Notes with timestamp chronologically, then untimestamped notes
    return list.sort((a, b) => {
      const hasA = a.timestamp_seconds !== null && a.timestamp_seconds !== undefined;
      const hasB = b.timestamp_seconds !== null && b.timestamp_seconds !== undefined;
      if (hasA && hasB) {
        return a.timestamp_seconds - b.timestamp_seconds;
      }
      if (hasA) return -1;
      if (hasB) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [notes, searchQuery]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full overflow-hidden transition-colors">
      {/* Panel Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-cyan-950/50 text-brand-600 dark:text-cyan-400 flex items-center justify-center font-bold">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                My Notes
              </h2>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {notes.length}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Synchronized with video timeline
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Export button */}
          <div className="relative group">
            <button
              type="button"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs transition-colors"
              title="Export Notes"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-1 hidden group-hover:block z-20">
              <button
                type="button"
                onClick={() => handleExport('md')}
                className="w-full text-left px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md font-medium"
              >
                Markdown (.md)
              </button>
              <button
                type="button"
                onClick={() => handleExport('txt')}
                className="w-full text-left px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md font-medium"
              >
                Plain Text (.txt)
              </button>
            </div>
          </div>

          {/* New Note Button */}
          {!isCreating && !editingNoteId && (
            <button
              type="button"
              onClick={startCreateNote}
              className="btn-edtech-purple inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Note</span>
            </button>
          )}
        </div>
      </div>

      {/* Unsaved Draft Alert */}
      {hasDraft && !isCreating && !editingNoteId && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>Unsaved draft found for this video.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={restoreDraft}
              className="font-bold underline hover:text-amber-900 dark:hover:text-white"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="text-amber-600 dark:text-amber-400 hover:text-amber-800"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Search Bar for Notes */}
      {notes.length > 2 && !isCreating && !editingNoteId && (
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search notes in this video..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Editor Form for New / Edit Note */}
        {(isCreating || editingNoteId) && (
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-brand-200 dark:border-cyan-500/40 p-4 space-y-3 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                <Edit3 className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400" />
                <span>{editingNoteId ? 'Edit Note' : 'Create New Note'}</span>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                {saveStatus === 'saving' && (
                  <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    Saving...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Saved
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Unable to save
                  </span>
                )}
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Note Title Input */}
            <div>
              <input
                type="text"
                placeholder="Note Title (e.g. Authentication Architecture)"
                value={title}
                onChange={handleTitleChange}
                onKeyDown={handleKeyDown}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-cyan-500"
              />
            </div>

            {/* Timestamp Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-white/70 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={handleAddCurrentTimestamp}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-brand-50 dark:bg-cyan-950/60 text-brand-700 dark:text-cyan-300 hover:bg-brand-100 dark:hover:bg-cyan-900/60 text-[11px] font-bold border border-brand-200/60 dark:border-cyan-500/30 transition-colors"
                title="Capture current player position"
              >
                <Clock className="w-3 h-3 text-brand-600 dark:text-cyan-400" />
                <span>+ Add Current Timestamp</span>
              </button>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Timestamp:</span>
                <input
                  type="text"
                  placeholder="mm:ss"
                  value={manualTimeStr}
                  onChange={(e) => handleManualTimeChange(e.target.value)}
                  className="w-16 px-2 py-1 text-center font-mono text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800 dark:text-slate-100"
                />
                {timestampSeconds !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setTimestampSeconds(null);
                      setManualTimeStr('');
                      saveToLocalDraft(title, content, null);
                    }}
                    className="text-[10px] text-slate-400 hover:text-rose-500"
                    title="Remove timestamp"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Lightweight Formatting Toolbar */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5 pt-0.5">
              <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                <button
                  type="button"
                  onClick={() => applyFormatting('**', '**', 'bold text')}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="Bold (**text**)"
                >
                  <Bold className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatting('*', '*', 'italic text')}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="Italic (*text*)"
                >
                  <Italic className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatting('### ', '', 'Heading')}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="Heading (### Title)"
                >
                  <Heading className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatting('- ', '', 'List item')}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="Bullet List (- item)"
                >
                  <List className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatting('1. ', '', 'Step item')}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="Numbered List (1. item)"
                >
                  <ListOrdered className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatting('`', '`', 'code')}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="Code (`code`)"
                >
                  <Code className="w-3 h-3" />
                </button>
              </div>

              <div className="flex items-center gap-1 text-slate-500">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
                  title="Undo"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
                  title="Redo"
                >
                  <RotateCw className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Note Content Textarea */}
            <div>
              <textarea
                ref={textareaRef}
                rows={5}
                placeholder="Write your notes here... (supports Markdown, lists, and code snippets)"
                value={content}
                onChange={handleContentChange}
                onKeyDown={handleKeyDown}
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs leading-relaxed text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-cyan-500 resize-y font-sans"
              />
            </div>

            {/* Keyboard shortcut tip */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
              <span>Press <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono">Ctrl+S</kbd> to save</span>
              {errorMessage && (
                <span className="text-rose-500 font-medium">{errorMessage}</span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cancelEdit}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNote}
                className="btn-edtech-purple inline-flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm"
              >
                <Save className="w-3 h-3" />
                <span>{editingNoteId ? 'Update Note' : 'Save Note'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Notes List */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Loading notes...</span>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <FileText className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {searchQuery ? 'No matching notes found' : 'No notes yet for this session'}
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                {searchQuery
                  ? 'Try adjusting your search terms.'
                  : 'Capture key concepts, code snippets, and timestamps while you watch.'}
              </p>
            </div>
            {!isCreating && !editingNoteId && (
              <button
                type="button"
                onClick={startCreateNote}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand-600 dark:text-cyan-400 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                Create your first note
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotes.map((note) => {
              const formattedTime = formatSeconds(note.timestamp_seconds);
              const isSelectedForEdit = editingNoteId === note.id;

              if (isSelectedForEdit) return null; // Hidden while editing above

              return (
                <div
                  key={note.id}
                  className="group relative bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80 p-3.5 hover:border-brand-300 dark:hover:border-cyan-500/50 hover:shadow-xs transition-all space-y-2"
                >
                  {/* Note Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      {formattedTime && (
                        <button
                          type="button"
                          onClick={() => onSeek && onSeek(note.timestamp_seconds)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 dark:bg-cyan-950/60 text-brand-700 dark:text-cyan-300 hover:bg-brand-100 dark:hover:bg-cyan-900/80 border border-brand-200/80 dark:border-cyan-500/30 text-[11px] font-mono font-bold transition-all group-hover:scale-102"
                          title={`Click to jump to ${formattedTime}`}
                        >
                          <Clock className="w-3 h-3 text-brand-600 dark:text-cyan-400" />
                          <span>⏱ {formattedTime}</span>
                        </button>
                      )}
                      <h4 className="text-xs font-extrabold text-slate-900 dark:text-white leading-tight">
                        {note.title}
                      </h4>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => startEditNote(note)}
                        className="p-1 rounded text-slate-400 hover:text-brand-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
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

                  {/* Note Body */}
                  <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">
                    {note.content}
                  </div>

                  {/* Note Footer */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-750 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                    <span>{new Date(note.created_at).toLocaleDateString()}</span>
                    {note.updated_at !== note.created_at && (
                      <span className="italic">edited</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingNote && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl animate-scale-up">
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
