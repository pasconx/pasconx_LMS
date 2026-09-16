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
    provider: 'vdocipher',
    privacy_type: 'vdocipher_drm',
    youtube_video_id: '',
    drive_file_id: '',
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

  const handleInputChange = (rawVal) => {
    const trimmed = rawVal.trim();
    let newProvider = formData.provider;
    let newPrivacy = formData.privacy_type;

    // Smart live auto-detection
    if (/^[a-fA-F0-9]{32}$/.test(trimmed)) {
      newProvider = 'vdocipher';
      newPrivacy = 'vdocipher_drm';
    } else if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com')) {
      newProvider = 'google_drive';
      newPrivacy = 'google_drive_preview';
    } else if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
      newProvider = 'youtube';
      newPrivacy = 'youtube_unlisted';
    }

    setFormData({
      ...formData,
      provider: newProvider,
      privacy_type: newPrivacy,
      youtube_video_id: rawVal,
      drive_file_id: rawVal,
      external_video_id: rawVal
    });
  };

  const handleProviderChange = (newProvider) => {
    let newPrivacy = 'google_drive_preview';
    if (newProvider === 'vdocipher') newPrivacy = 'vdocipher_drm';
    if (newProvider === 'youtube') newPrivacy = 'youtube_unlisted';

    setFormData({
      ...formData,
      provider: newProvider,
      privacy_type: newPrivacy
    });
  };

  const handleCreateVideo = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/admin/videos', formData);
      if (res.success) {
        notify('success', `Video "${res.video.title}" added to course.`);
        if (res.warning) {
          alert(`Security Advisory:\n${res.warning}`);
        }
        setIsCreateOpen(false);
        setFormData({
          title: '',
          description: '',
          course_id: selectedCourseFilter || (courses[0]?.id || ''),
          provider: 'vdocipher',
          privacy_type: 'vdocipher_drm',
          youtube_video_id: '',
          drive_file_id: '',
          external_video_id: '',
          duration_seconds: 300,
          order_index: 1,
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
          alert(`Security Advisory:\n${res.warning}`);
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
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Video className="w-6 h-6 text-indigo-600" />
            Video Management & Delivery
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Publish protected course videos with VdoCipher DRM or Google Drive MVP embeds.
          </p>
        </div>

        <button
          onClick={() => {
            setFormData({
              title: '',
              description: '',
              course_id: selectedCourseFilter || (courses[0]?.id || ''),
              provider: 'vdocipher',
              privacy_type: 'vdocipher_drm',
              youtube_video_id: '',
              drive_file_id: '',
              external_video_id: '',
              duration_seconds: 300,
              order_index: (videos.length + 1),
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
              ? 'bg-rose-50 text-rose-800 border border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          {notification.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 shrink-0">Filter by Course:</span>
          <select
            value={selectedCourseFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="text-xs p-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none w-full sm:w-72"
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
          Total: <strong className="text-slate-800 dark:text-slate-200">{videos.length}</strong> videos
        </span>
      </div>

      {/* Videos Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4 text-left">Order</th>
                <th className="py-3.5 px-4 text-left">Title</th>
                <th className="py-3.5 px-4 text-left">Course</th>
                <th className="py-3.5 px-4 text-left">Provider & Security</th>
                <th className="py-3.5 px-4 text-left">Video ID / Source</th>
                <th className="py-3.5 px-4 text-left">Duration</th>
                <th className="py-3.5 px-4 text-left">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-10 text-center text-slate-400">
                    Loading course videos...
                  </td>
                </tr>
              ) : videos.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-10 text-center text-slate-400">
                    No videos found for this filter.
                  </td>
                </tr>
              ) : (
                videos.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-500 dark:text-slate-400">
                      #{v.order_index}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 dark:text-white">{v.title}</div>
                      <div className="text-[11px] text-slate-400 line-clamp-1">{v.description}</div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">{v.course_title}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        <span className={`font-bold uppercase text-[10px] px-2 py-0.5 rounded w-fit border ${
                          v.provider === 'vdocipher' 
                            ? 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800' 
                            : v.provider === 'google_drive'
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                        }`}>
                          {v.provider === 'vdocipher' ? 'VdoCipher DRM' : v.provider === 'google_drive' ? 'Google Drive MVP' : 'YouTube'}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {v.provider === 'vdocipher' ? 'Multi-DRM OTP' : v.provider === 'google_drive' ? 'Preview Embed' : v.privacy_type}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200 max-w-[160px] truncate" title={v.external_video_id || v.drive_file_id}>
                      {v.external_video_id || v.drive_file_id}
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
                            provider: v.provider || 'vdocipher',
                            privacy_type: v.privacy_type || 'vdocipher_drm',
                            youtube_video_id: v.external_video_id || v.drive_file_id || '',
                            drive_file_id: v.drive_file_id || v.external_video_id || '',
                            external_video_id: v.external_video_id || v.drive_file_id || '',
                            duration_seconds: v.duration_seconds,
                            order_index: v.order_index,
                            status: v.status
                          });
                          setIsEditOpen(true);
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Edit Video"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteVideo(v.id, v.title)}
                        className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
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
        subtitle="Configure video title, provider (VdoCipher / Google Drive / YouTube), and sequencing"
      >
        <form onSubmit={handleCreateVideo} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Course Assignment</label>
            <select
              required
              value={formData.course_id}
              onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Video Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. 01 Introduction to Security Concepts"
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Description / Notes</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Summary of lecture concepts..."
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Video Provider</label>
              <select
                value={formData.provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold"
              >
                <option value="vdocipher">VdoCipher (Studio DRM)</option>
                <option value="google_drive">Google Drive (MVP Embed)</option>
                <option value="youtube">YouTube (Unlisted)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Privacy & Security Mode</label>
              <select
                value={formData.privacy_type}
                onChange={(e) => setFormData({ ...formData, privacy_type: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {formData.provider === 'vdocipher' ? (
                  <option value="vdocipher_drm">VdoCipher Multi-DRM (Widevine / FairPlay)</option>
                ) : formData.provider === 'google_drive' ? (
                  <option value="google_drive_preview">Google Drive Preview Embed</option>
                ) : (
                  <>
                    <option value="youtube_unlisted">YouTube Unlisted</option>
                    <option value="youtube_private">YouTube Private</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Security Advisory Banners */}
          {formData.provider === 'vdocipher' ? (
            <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-800/60 text-xs text-cyan-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-cyan-200">
                <ShieldAlert className="w-4 h-4 text-cyan-400" />
                VdoCipher Studio Multi-DRM Active
              </div>
              <p className="leading-relaxed">
                Videos are protected with studio-grade DRM (Widevine & FairPlay), dynamic OTP authentication, and personalized student watermarks preventing unauthorized downloading and recording.
              </p>
            </div>
          ) : formData.provider === 'google_drive' ? (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Google Drive MVP Security Warning
              </div>
              <p className="leading-relaxed">
                Google Drive is being used only as an MVP video source. Google Drive does not provide DRM or guaranteed protection against video downloading or sharing. For production-grade protected training videos, select VdoCipher.
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                YouTube Integration Advisory
              </div>
              <p className="leading-relaxed">
                Unlisted YouTube videos can be shared via direct link. For student-specific protection, use VdoCipher DRM.
              </p>
            </div>
          )}

          {/* Source ID / URL Input */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
              {formData.provider === 'vdocipher'
                ? 'VdoCipher Video ID'
                : formData.provider === 'google_drive' 
                ? 'Google Drive File ID or Full URL' 
                : 'YouTube Video ID or URL'}
            </label>
            <input
              type="text"
              required
              value={formData.external_video_id || formData.drive_file_id || formData.youtube_video_id || ''}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={
                formData.provider === 'vdocipher'
                  ? 'e.g. 44dea8bbc5324ee896da129c132e3a5c'
                  : formData.provider === 'google_drive' 
                  ? 'e.g. 1fkJOdRIonDNO4YYDSno_0hwcBvlcMbMy or paste https://drive.google.com/file/d/...' 
                  : 'e.g. dQw4w9WgXcQ or https://youtu.be/...'
              }
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
            />
            <span className="text-[11px] text-slate-400 block mt-1">
              {formData.provider === 'vdocipher'
                ? 'Provide the 32-character hexadecimal video ID from your VdoCipher dashboard.'
                : formData.provider === 'google_drive'
                ? 'Pasting full Google Drive link automatically extracts the clean File ID.'
                : 'Only the 11-character YouTube video ID is stored in the database.'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Duration (Seconds)</label>
              <input
                type="number"
                min="0"
                value={formData.duration_seconds}
                onChange={(e) => setFormData({ ...formData, duration_seconds: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Order Index</label>
              <input
                type="number"
                min="1"
                value={formData.order_index}
                onChange={(e) => setFormData({ ...formData, order_index: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
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
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Course Assignment</label>
            <select
              required
              value={formData.course_id}
              onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Video Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Description</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Video Provider</label>
              <select
                value={formData.provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold"
              >
                <option value="vdocipher">VdoCipher (Studio DRM)</option>
                <option value="google_drive">Google Drive (MVP Embed)</option>
                <option value="youtube">YouTube (Unlisted)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
              {formData.provider === 'vdocipher' 
                ? 'VdoCipher Video ID (32 Hex Chars)' 
                : formData.provider === 'google_drive' 
                ? 'Google Drive File ID or URL' 
                : 'YouTube Video ID or URL'}
            </label>
            <input
              type="text"
              required
              value={formData.external_video_id || formData.drive_file_id || formData.youtube_video_id || ''}
              onChange={(e) => handleInputChange(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Duration (Seconds)</label>
              <input
                type="number"
                min="0"
                value={formData.duration_seconds}
                onChange={(e) => setFormData({ ...formData, duration_seconds: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">Order Index</label>
              <input
                type="number"
                min="1"
                value={formData.order_index}
                onChange={(e) => setFormData({ ...formData, order_index: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
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
