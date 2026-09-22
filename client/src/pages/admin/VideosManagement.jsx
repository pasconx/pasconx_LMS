import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client.js';
import Modal from '../../components/common/Modal.jsx';
import { StatusBadge } from '../../components/common/Badge.jsx';
import { 
  Video, 
  PlusCircle, 
  Edit, 
  Trash2, 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  ShieldAlert,
  ExternalLink 
} from 'lucide-react';

export default function VideosManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCourseFilter = searchParams.get('courseId') || '';

  const [videos, setVideos] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedCourseFilter, setSelectedCourseFilter] = useState(initialCourseFilter);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState({ type: '', message: '' });

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    course_id: '',
    video_type: 'youtube',
    provider: 'youtube',
    privacy_type: 'youtube_unlisted',
    youtube_video_id: '',
    manifest_url: '',
    license_server_url: '',
    external_video_id: '',
    duration_seconds: 300,
    order_index: 1,
    status: 'ACTIVE'
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [vRes, cRes] = await Promise.all([
        api.get(`/admin/videos${selectedCourseFilter ? `?courseId=${selectedCourseFilter}` : ''}`),
        api.get('/admin/courses')
      ]);
      if (vRes.success) setVideos(vRes.videos);
      if (cRes.success) setCourses(cRes.courses);
    } catch (err) {
      notify('error', err.message || 'Failed to load videos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCourseFilter]);

  const notify = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification({ type: '', message: '' }), 5000);
  };

  const handleFilterChange = (courseId) => {
    setSelectedCourseFilter(courseId);
    if (courseId) {
      setSearchParams({ courseId });
    } else {
      setSearchParams({});
    }
  };

  const handleCreateVideo = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/admin/videos', formData);
      if (res.success) {
        notify('success', `Video "${res.video.title}" added to course.`);
        if (res.warning) {
          alert(`Security Warning:\n${res.warning}`);
        }
        setIsCreateOpen(false);
        setFormData({
          title: '',
          description: '',
          course_id: selectedCourseFilter || '',
          video_type: 'youtube',
          provider: 'youtube',
          privacy_type: 'youtube_unlisted',
          youtube_video_id: '',
          manifest_url: '',
          license_server_url: '',
          external_video_id: '',
          duration_seconds: 300,
          order_index: '',
          status: 'ACTIVE'
        });
        fetchData();
      }
    } catch (err) {
      notify('error', err.message || 'Failed to add video.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditVideo = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.put(`/admin/videos/${selectedVideo.id}`, formData);
      if (res.success) {
        notify('success', 'Video details updated.');
        if (res.warning) {
          alert(`Security Warning:\n${res.warning}`);
        }
        setIsEditOpen(false);
        fetchData();
      }
    } catch (err) {
      notify('error', err.message || 'Failed to update video.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVideo = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete video "${title}"?`)) return;
    try {
      const res = await api.delete(`/admin/videos/${id}`);
      if (res.success) {
        notify('success', 'Video deleted.');
        fetchData();
      }
    } catch (err) {
      notify('error', err.message || 'Failed to delete video.');
    }
  };

  const formatDuration = (sec) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}m ${s > 0 ? `${s}s` : ''}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5 transition-colors">
            <Video className="w-6 h-6 text-indigo-600 dark:text-cyan-400" />
            Video Management & Delivery
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 transition-colors">
            Publish educational videos, configure YouTube Unlisted IDs, and sequence course lectures.
          </p>
        </div>

        <button
          onClick={() => {
            const initialCourseId = selectedCourseFilter || '';
            setFormData({
              title: '',
              description: '',
              course_id: initialCourseId,
              video_type: 'youtube',
              provider: 'youtube',
              privacy_type: 'youtube_unlisted',
              youtube_video_id: '',
              manifest_url: '',
              license_server_url: '',
              external_video_id: '',
              duration_seconds: 300,
              order_index: '',
              status: 'ACTIVE'
            });
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          Add Video
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

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 shrink-0">Filter by Course:</span>
          <select
            value={selectedCourseFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="text-xs p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none w-full sm:w-72"
          >
            <option value="">All Institute Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Total: <strong className="text-slate-800 dark:text-white">{videos.length}</strong> videos
        </span>
      </div>

      {/* Videos Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4 text-left">Order</th>
                <th className="py-3.5 px-4 text-left">Title</th>
                <th className="py-3.5 px-4 text-left">Course</th>
                <th className="py-3.5 px-4 text-left">Provider & Privacy</th>
                <th className="py-3.5 px-4 text-left">Playback Target</th>
                <th className="py-3.5 px-4 text-left">Duration</th>
                <th className="py-3.5 px-4 text-left">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-10 text-center text-slate-400 dark:text-slate-500">
                    Loading course videos...
                  </td>
                </tr>
              ) : videos.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-10 text-center text-slate-400 dark:text-slate-500">
                    No videos found for this filter.
                  </td>
                </tr>
              ) : (
                videos.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-500 dark:text-slate-400">
                      #{v.order_index}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 dark:text-white">{v.title}</div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 line-clamp-1">{v.description}</div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">{v.course_title}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        {v.video_type === 'widevine' ? (
                          <span className="font-bold uppercase text-[10px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded w-fit border border-purple-200 dark:border-purple-800/60">
                            Widevine DRM
                          </span>
                        ) : (
                          <span className="font-bold uppercase text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2 py-0.5 rounded w-fit border border-red-200 dark:border-red-800/60">
                            {v.provider || 'YouTube'}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {v.video_type === 'widevine' ? 'Encrypted DASH (.mpd)' : (v.privacy_type === 'youtube_private' ? 'Private' : 'Unlisted')}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200 text-xs">
                      {v.video_type === 'widevine' ? (
                        <div className="truncate max-w-[140px]" title={v.manifest_url || v.external_video_id}>
                          {v.external_video_id || 'DASH Stream'}
                        </div>
                      ) : (
                        v.external_video_id
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">
                      {formatDuration(v.duration_seconds)}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={v.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setSelectedVideo(v);
                          setFormData({
                            title: v.title,
                            description: v.description || '',
                            course_id: v.course_id,
                            video_type: v.video_type || 'youtube',
                            provider: v.provider,
                            privacy_type: v.privacy_type,
                            youtube_video_id: v.video_type === 'widevine' ? '' : v.external_video_id,
                            manifest_url: v.manifest_url || '',
                            license_server_url: v.license_server_url || '',
                            external_video_id: v.external_video_id || '',
                            duration_seconds: v.duration_seconds,
                            order_index: v.order_index,
                            status: v.status
                          });
                          setIsEditOpen(true);
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                        title="Edit Video"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteVideo(v.id, v.title)}
                        className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Delete Video"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Video Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Add Course Video"
        subtitle="Configure video title, provider, YouTube ID, and sequencing"
      >
        <form onSubmit={handleCreateVideo} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Course Assignment</label>
            <select
              required
              value={formData.course_id}
              onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Select Target Course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Video Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. 01 Introduction to Security Concepts"
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Description / Notes</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Summary of lecture concepts..."
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Video Type Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-2">Video Delivery & Protection Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, video_type: 'youtube', provider: 'youtube' })}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                  formData.video_type === 'youtube'
                    ? 'border-red-500 bg-red-50/50 ring-2 ring-red-500/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 ${
                  formData.video_type === 'youtube' ? 'border-red-600' : 'border-slate-300'
                }`}>
                  {formData.video_type === 'youtube' && <div className="w-2 h-2 rounded-full bg-red-600" />}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">YouTube Video</div>
                  <div className="text-[11px] text-slate-500">Unlisted delivery for general course modules</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, video_type: 'widevine', provider: 'widevine', privacy_type: 'widevine_drm' })}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                  formData.video_type === 'widevine'
                    ? 'border-purple-600 bg-purple-50/50 ring-2 ring-purple-600/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 ${
                  formData.video_type === 'widevine' ? 'border-purple-600' : 'border-slate-300'
                }`}>
                  {formData.video_type === 'widevine' && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Widevine DRM</div>
                  <div className="text-[11px] text-slate-500">Encrypted DASH stream + EME Shaka Player</div>
                </div>
              </button>
            </div>
          </div>

          {/* Conditional Fields: YouTube vs Widevine DRM */}
          {formData.video_type === 'youtube' ? (
            <>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Privacy Mode</label>
                <select
                  value={formData.privacy_type}
                  onChange={(e) => setFormData({ ...formData, privacy_type: e.target.value })}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="youtube_unlisted">YouTube Unlisted (Recommended)</option>
                  <option value="youtube_private">YouTube Private</option>
                </select>
              </div>

              {formData.privacy_type === 'youtube_private' && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Administrative Advisory on YouTube Private
                  </div>
                  <p className="leading-relaxed">
                    Private YouTube videos require YouTube viewer authorization. For reliable student-specific access control, use YouTube Unlisted or Widevine DRM.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  YouTube Video ID or URL
                </label>
                <input
                  type="text"
                  required={formData.video_type === 'youtube'}
                  value={formData.youtube_video_id}
                  onChange={(e) => setFormData({ ...formData, youtube_video_id: e.target.value })}
                  placeholder="e.g. dQw4w9WgXcQ or https://youtu.be/..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                />
                <span className="text-[11px] text-slate-400">
                  Only the 11-character video ID is stored in the database.
                </span>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  DASH Manifest URL (.mpd)
                </label>
                <input
                  type="url"
                  required={formData.video_type === 'widevine'}
                  value={formData.manifest_url}
                  onChange={(e) => setFormData({ ...formData, manifest_url: e.target.value })}
                  placeholder="https://storage.example.com/videos/module1/dash.mpd"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                />
                <span className="text-[11px] text-slate-400">
                  Must point to an encrypted DASH manifest (.mpd) hosted on private S3/GCS/R2 or CDN.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Asset / Content ID
                  </label>
                  <input
                    type="text"
                    value={formData.external_video_id}
                    onChange={(e) => setFormData({ ...formData, external_video_id: e.target.value })}
                    placeholder="e.g. px-asset-sec-01"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                  />
                  <span className="text-[11px] text-slate-400">Identifier for Widevine license issuance.</span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Custom License Server URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={formData.license_server_url}
                    onChange={(e) => setFormData({ ...formData, license_server_url: e.target.value })}
                    placeholder="Leave empty to use server default"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                  />
                  <span className="text-[11px] text-slate-400">Overrides WIDEVINE_LICENSE_URL env setting if specified.</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-purple-950">
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  DRM Credential Security Policy
                </div>
                <p className="leading-relaxed text-[11px]">
                  Raw encryption keys and DRM provider secrets are strictly managed server-side. Administrators never enter raw keys into frontend forms.
                </p>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Duration (Seconds)</label>
              <input
                type="number"
                min="0"
                value={formData.duration_seconds}
                onChange={(e) => setFormData({ ...formData, duration_seconds: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Order Index <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={formData.order_index}
                onChange={(e) => setFormData({ ...formData, order_index: e.target.value })}
                placeholder="e.g. 1, 2, 3..."
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
              />
              <span className="text-[11px] text-slate-400">
                Must be unique for this course.
              </span>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Video'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Video Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Video"
        subtitle={`Updating video: ${selectedVideo?.title}`}
      >
        <form onSubmit={handleEditVideo} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Course Assignment</label>
            <select
              required
              value={formData.course_id}
              onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Video Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Video Type Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-2">Video Delivery & Protection Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, video_type: 'youtube', provider: 'youtube' })}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                  formData.video_type === 'youtube'
                    ? 'border-red-500 bg-red-50/50 ring-2 ring-red-500/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 ${
                  formData.video_type === 'youtube' ? 'border-red-600' : 'border-slate-300'
                }`}>
                  {formData.video_type === 'youtube' && <div className="w-2 h-2 rounded-full bg-red-600" />}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">YouTube Video</div>
                  <div className="text-[11px] text-slate-500">Unlisted delivery for general course modules</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, video_type: 'widevine', provider: 'widevine', privacy_type: 'widevine_drm' })}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                  formData.video_type === 'widevine'
                    ? 'border-purple-600 bg-purple-50/50 ring-2 ring-purple-600/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 ${
                  formData.video_type === 'widevine' ? 'border-purple-600' : 'border-slate-300'
                }`}>
                  {formData.video_type === 'widevine' && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Widevine DRM</div>
                  <div className="text-[11px] text-slate-500">Encrypted DASH stream + EME Shaka Player</div>
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {formData.video_type === 'youtube' ? (
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Privacy Mode</label>
                <select
                  value={formData.privacy_type}
                  onChange={(e) => setFormData({ ...formData, privacy_type: e.target.value })}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="youtube_unlisted">YouTube Unlisted</option>
                  <option value="youtube_private">YouTube Private</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">DRM Protection Mode</label>
                <div className="p-2 bg-purple-50 border border-purple-200 rounded-lg text-xs font-semibold text-purple-800">
                  Google Widevine Modular (EME)
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>

          {formData.video_type === 'youtube' && formData.privacy_type === 'youtube_private' && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-800">
              <strong>Advisory:</strong> Private YouTube videos require YouTube viewer authorization. For reliable student-specific access control, use YouTube Unlisted or Widevine DRM.
            </div>
          )}

          {formData.video_type === 'youtube' ? (
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">YouTube Video ID</label>
              <input
                type="text"
                required={formData.video_type === 'youtube'}
                value={formData.youtube_video_id}
                onChange={(e) => setFormData({ ...formData, youtube_video_id: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">DASH Manifest URL (.mpd)</label>
                <input
                  type="url"
                  required={formData.video_type === 'widevine'}
                  value={formData.manifest_url}
                  onChange={(e) => setFormData({ ...formData, manifest_url: e.target.value })}
                  placeholder="https://storage.example.com/videos/module1/dash.mpd"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Asset / Content ID</label>
                  <input
                    type="text"
                    value={formData.external_video_id}
                    onChange={(e) => setFormData({ ...formData, external_video_id: e.target.value })}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Custom License Server URL</label>
                  <input
                    type="url"
                    value={formData.license_server_url}
                    onChange={(e) => setFormData({ ...formData, license_server_url: e.target.value })}
                    placeholder="Leave empty for system default"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Duration (Seconds)</label>
              <input
                type="number"
                min="0"
                value={formData.duration_seconds}
                onChange={(e) => setFormData({ ...formData, duration_seconds: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Order Index <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={formData.order_index}
                onChange={(e) => setFormData({ ...formData, order_index: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
              />
              <span className="text-[11px] text-slate-400">
                Must be unique for this course.
              </span>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
