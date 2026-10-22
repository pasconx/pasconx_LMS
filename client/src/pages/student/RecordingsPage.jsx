import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client.js';
import { Video, Search, PlayCircle, CheckCircle2, Clock, AlertCircle, Film } from 'lucide-react';

function formatDuration(sec) {
  const s = Number(sec) || 0;
  if (s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * "Recorded Videos" — every recording from every active course, in ONE place (newest first).
 */
export default function RecordingsPage() {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/student/recordings');
        if (mounted && res.success) setRecordings(res.recordings || []);
      } catch (err) {
        if (mounted) setError(err.message || 'Failed to load recorded videos.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const courses = useMemo(() => {
    const map = new Map();
    recordings.forEach((r) => map.set(String(r.course_id), r.course_title));
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [recordings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recordings.filter((r) => {
      if (courseFilter && String(r.course_id) !== courseFilter) return false;
      if (!q) return true;
      return (
        (r.title || '').toLowerCase().includes(q) ||
        (r.course_title || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      );
    });
  }, [recordings, query, courseFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Film className="w-6 h-6 text-brand-600" />
            Recorded Videos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            All your class recordings in one place — latest first.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recordings..."
              className="pl-9 pr-3 py-2.5 w-full sm:w-64 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="py-20 flex justify-center">
          <div className="w-9 h-9 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 text-sm text-rose-800">
          <AlertCircle className="w-5 h-5 shrink-0" /> {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center space-y-2">
          <Video className="w-10 h-10 text-slate-400 mx-auto" />
          <p className="font-bold text-slate-700 dark:text-slate-200">No recordings found</p>
          <p className="text-sm text-slate-500">
            {recordings.length === 0
              ? 'New class recordings will appear here as soon as they are uploaded.'
              : 'Try a different search or course filter.'}
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => {
            const dur = formatDuration(r.duration_seconds);
            const pct = r.duration_seconds > 0
              ? Math.min(100, Math.round((r.progress_seconds / r.duration_seconds) * 100))
              : 0;
            return (
              <Link
                key={r.id}
                to={`/student/watch/${r.id}`}
                className="group rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-lg hover:border-brand-400 transition-all flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 truncate">
                    {r.course_title}
                  </span>
                  {r.completed ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Watched
                    </span>
                  ) : null}
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-600 to-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <PlayCircle className="w-6 h-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">{r.title}</h3>
                    {r.description ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{r.description}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-auto space-y-2">
                  {pct > 0 && !r.completed && (
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-brand-600" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {dur || 'Recording'}
                    </span>
                    <span>{formatDate(r.created_at)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
