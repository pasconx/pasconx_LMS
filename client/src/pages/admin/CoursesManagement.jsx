import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client.js';
import Modal from '../../components/common/Modal.jsx';
import { StatusBadge } from '../../components/common/Badge.jsx';
import { 
  BookOpen, 
  PlusCircle, 
  Edit, 
  Trash2, 
  Video, 
  Users, 
  CheckCircle, 
  AlertCircle,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';

export function normalizeThumbnailUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();

  // Automatically convert Google Drive share links to direct Google User Content CDN URLs
  const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i)
    || trimmed.match(/drive\.google\.com\/(?:uc|open)\?(?:.*&)?id=([a-zA-Z0-9_-]+)/i);

  if (driveMatch && driveMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  }

  return trimmed;
}

export function CourseThumbnail({ url, title }) {
  const [currentSrc, setCurrentSrc] = useState(() => normalizeThumbnailUrl(url));
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setCurrentSrc(normalizeThumbnailUrl(url));
    setHasError(false);
  }, [url]);

  const handleError = () => {
    // If direct Google UserContent CDN fails (e.g. browser Referer 429), fall back to backend proxy
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
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 text-white font-bold text-lg">
      {title ? title.substring(0, 2).toUpperCase() : 'CO'}
    </div>
  );
}

export default function CoursesManagement() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState({ type: '', message: '' });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    thumbnail_url: '',
    status: 'ACTIVE'
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchCourses = async () => {
    try {
      const res = await api.get('/admin/courses');
      if (res.success) {
        setCourses(res.courses);
      }
    } catch (err) {
      notify('error', err.message || 'Failed to fetch courses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const notify = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification({ type: '', message: '' }), 4000);
  };

  const handleCreateCourse = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/admin/courses', {
        ...formData,
        title: formData.title.trim(),
        description: formData.description ? formData.description.trim() : '',
        thumbnail_url: normalizeThumbnailUrl(formData.thumbnail_url)
      });
      if (res.success) {
        notify('success', `Course "${res.course.title}" created successfully.`);
        setIsCreateOpen(false);
        setFormData({ title: '', description: '', thumbnail_url: '', status: 'ACTIVE' });
        fetchCourses();
      }
    } catch (err) {
      notify('error', err.message || 'Failed to create course.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditCourse = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.title.trim()) {
      notify('error', 'Course title is required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.put(`/admin/courses/${selectedCourse.id}`, {
        title: formData.title.trim(),
        description: formData.description ? formData.description.trim() : '',
        thumbnail_url: normalizeThumbnailUrl(formData.thumbnail_url)
      });
      if (res.success) {
        notify('success', `Course "${res.course.title}" updated successfully.`);
        setIsEditOpen(false);
        setSelectedCourse(null);
        fetchCourses();
      }
    } catch (err) {
      notify('error', err.message || 'Failed to update course.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCourse = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete course "${title}"? This will also remove its videos and enrollments.`)) {
      return;
    }
    try {
      const res = await api.delete(`/admin/courses/${id}`);
      if (res.success) {
        notify('success', 'Course deleted.');
        fetchCourses();
      }
    } catch (err) {
      notify('error', err.message || 'Failed to delete course.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5 transition-colors">
            <BookOpen className="w-6 h-6 text-indigo-600 dark:text-cyan-400" />
            Course Curriculum Management
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 transition-colors">
            Design institute course modules, configure thumbnails, and attach instructional video series.
          </p>
        </div>

        <button
          onClick={() => {
            setFormData({ title: '', description: '', thumbnail_url: '', status: 'ACTIVE' });
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-cyan-600 dark:hover:bg-cyan-700 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          Create Course
        </button>
      </div>

      {notification.message && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 ${
            notification.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60'
              : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60'
          }`}
        >
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{notification.message}</span>
        </div>
      )}

      {/* Courses Grid */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-xs">
          Loading course catalog...
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-500 dark:text-slate-400 space-y-3">
          <BookOpen className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
          <div className="text-sm font-bold text-slate-700 dark:text-slate-200">No courses created yet</div>
          <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
            Get started by creating your first course and organizing educational videos for your students.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <div
              key={course.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-lg hover:-translate-y-1 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300 flex flex-col justify-between group"
            >
              <div>
                {/* Thumbnail with hover zoom */}
                <Link
                  to={`/admin/videos?courseId=${course.id}`}
                  className="block h-44 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative cursor-pointer"
                  title={`Manage videos for ${course.title}`}
                >
                  <CourseThumbnail url={course.thumbnail_url} title={course.title} />
                  <div className="absolute top-3 right-3">
                    <StatusBadge status={course.status} />
                  </div>
                </Link>

                {/* Content */}
                <div className="p-5 space-y-3">
                  <Link
                    to={`/admin/videos?courseId=${course.id}`}
                    className="block cursor-pointer"
                    title={`Manage videos for ${course.title}`}
                  >
                    <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug group-hover:text-brand-600 dark:group-hover:text-cyan-400 transition-colors">
                      {course.title}
                    </h3>
                  </Link>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {course.description || 'No course description provided.'}
                  </p>

                  <div className="pt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <span className="flex items-center gap-1">
                      <Video className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                      {course.total_videos} Videos
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      {course.active_enrollments} Active Students
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedCourse(course);
                      setFormData({
                        title: course.title || '',
                        description: course.description || '',
                        thumbnail_url: course.thumbnail_url || ''
                      });
                      setIsEditOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-cyan-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800/50 transition-colors cursor-pointer"
                    title="Edit Course"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Edit
                  </button>

                  <Link
                    to={`/admin/videos?courseId=${course.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Manage Videos ({course.total_videos})
                  </Link>
                </div>

                <button
                  onClick={() => handleDeleteCourse(course.id, course.title)}
                  className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                  title="Delete Course"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Course Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Course"
        subtitle="Define course title, description, and preview visual"
      >
        <form onSubmit={handleCreateCourse} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Course Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Cybersecurity Fundamentals"
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Description</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Summary of course objectives and syllabus..."
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Thumbnail Image URL</label>
            <input
              type="url"
              value={formData.thumbnail_url}
              onChange={(e) => setFormData({ ...formData, thumbnail_url: e.target.value })}
              placeholder="https://images.unsplash.com/photo-... or Google Drive link"
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              Supports Google Drive sharing links (set to &quot;Anyone with the link can view&quot;) or direct image URLs.
            </p>
            {formData.thumbnail_url && (
              <div className="mt-2.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Live Image Preview:</div>
                <div className="h-28 w-48 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shadow-2xs">
                  <CourseThumbnail url={formData.thumbnail_url} title={formData.title || 'Course'} />
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Creating...' : 'Create Course'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Course Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setSelectedCourse(null);
        }}
        title="Edit Course"
        subtitle={`Updating course: ${selectedCourse?.title || ''}`}
      >
        <form onSubmit={handleEditCourse} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Course Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Cybersecurity Fundamentals"
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Description</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Summary of course objectives and syllabus..."
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Thumbnail Image URL</label>
            <input
              type="url"
              value={formData.thumbnail_url}
              onChange={(e) => setFormData({ ...formData, thumbnail_url: e.target.value })}
              placeholder="https://images.unsplash.com/photo-... or Google Drive link"
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              Supports Google Drive sharing links (set to &quot;Anyone with the link can view&quot;) or direct image URLs.
            </p>
            {formData.thumbnail_url && (
              <div className="mt-2.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Live Image Preview:</div>
                <div className="h-28 w-48 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shadow-2xs">
                  <CourseThumbnail url={formData.thumbnail_url} title={formData.title || 'Course'} />
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsEditOpen(false);
                setSelectedCourse(null);
              }}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
