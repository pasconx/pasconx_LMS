import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../api/client.js';
import SecureVideoPlayer from '../../components/video/SecureVideoPlayer.jsx';
import NotesPanel from '../../components/notes/NotesPanel.jsx';
import { 
  ArrowLeft, 
  ArrowRight, 
  ShieldAlert, 
  CheckCircle2, 
  BookOpen, 
  Lock, 
  Clock, 
  AlertCircle,
  FileText,
  Info
} from 'lucide-react';

export default function VideoWatchPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [activeTab, setActiveTab] = useState('notes'); // 'notes' | 'about' for mobile view

  const playerControlRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const fetchVideo = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get(`/student/videos/${videoId}`);
        if (isMounted && res.success) {
          setData(res);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Access denied or video unavailable.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchVideo();
    return () => {
      isMounted = false;
    };
  }, [videoId]);

  // Handle URL timestamp parameter (e.g., /student/watch/12?t=345)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tParam = params.get('t');
    if (tParam && !isNaN(tParam)) {
      const targetSec = Number(tParam);
      // Attempt seek once player is ready
      const checkAndSeek = (attempts = 0) => {
        if (attempts > 10) return;
        if (playerControlRef.current && typeof playerControlRef.current.seekTo === 'function') {
          playerControlRef.current.seekTo(targetSec);
        } else {
          setTimeout(() => checkAndSeek(attempts + 1), 400);
        }
      };
      const timer = setTimeout(() => checkAndSeek(0), 800);
      return () => clearTimeout(timer);
    }
  }, [location.search, videoId]);

  const handleProgressUpdate = async (seconds, completed) => {
    try {
      await api.post(`/student/videos/${videoId}/progress`, {
        progress_seconds: seconds,
        completed: completed ? 1 : 0
      });
      setSaveStatus('Progress saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      console.error('Failed to sync playback progress:', err);
    }
  };

  const handleSeek = (seconds) => {
    if (playerControlRef.current && typeof playerControlRef.current.seekTo === 'function') {
      playerControlRef.current.seekTo(seconds);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-3 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Verifying video authorization & loading player...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const isExpired = error.toLowerCase().includes('expired');
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-white rounded-3xl border border-rose-200 p-8 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center mx-auto text-rose-600">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900">Playback Authorization Denied</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">{error}</p>

          {isExpired && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 text-left space-y-1">
              <strong>PASCONX Expiration Notice:</strong>
              <p>Your access to this course has expired. Please contact PASCONX Academy for access renewal.</p>
            </div>
          )}

          <div className="pt-4">
            <Link
              to="/student/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Student Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { video, playback, progress, navigation } = data;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between">
        <Link
          to={`/student/courses/${video.course_id}`}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          ← Back to Course
        </Link>

        <div className="flex items-center gap-3">
          {saveStatus && (
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800 animate-pulse">
              {saveStatus}
            </span>
          )}

          <Link
            to="/student/notes"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-cyan-400 transition-colors px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs"
          >
            <FileText className="w-3.5 h-3.5 text-brand-500" />
            <span>All My Notes</span>
          </Link>
        </div>
      </div>

      {/* Course & Video Header */}
      <div className="space-y-1">
        <div className="text-xs font-bold text-brand-600 dark:text-cyan-400 uppercase tracking-wider">
          {video.course_title}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          {video.title}
        </h1>
      </div>

      {/* Responsive Workspace Grid: Video Player + Notes Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Player, Video Info, Navigation (8 cols on desktop) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {/* Unified Secure Video Player (Routes to YouTube or Widevine DRM) */}
          <SecureVideoPlayer
            video={video}
            playback={playback}
            progress={progress}
            onProgressUpdate={handleProgressUpdate}
            student={user}
            watermarkProfile={data?.watermarkProfile}
            playerControlRef={playerControlRef}
          />

          {/* Mobile Tabs Switcher (Visible only on screens below lg) */}
          <div className="flex lg:hidden items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('about')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'about'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>About Session</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('notes')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'notes'
                  ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-cyan-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>📝 My Notes</span>
            </button>
          </div>

          {/* Description & Course Navigation */}
          <div className={`space-y-6 ${activeTab === 'notes' ? 'hidden lg:block' : 'block'}`}>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6 transition-colors">
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  About This Session
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {video.description || 'No additional lesson notes provided for this video.'}
                </p>
              </div>

              {/* Previous & Next Navigation Controls */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                {navigation.prevVideo ? (
                  <Link
                    to={`/student/watch/${navigation.prevVideo.id}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Previous: {navigation.prevVideo.title}</span>
                  </Link>
                ) : (
                  <div />
                )}

                {navigation.nextVideo ? (
                  <Link
                    to={`/student/watch/${navigation.nextVideo.id}`}
                    className="btn-edtech-purple inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold transition-all shadow-sm"
                  >
                    <span>Next Video →</span>
                  </Link>
                ) : (
                  <div className="text-xs text-slate-400 dark:text-slate-500 font-medium italic">
                    End of course modules
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Student Notes Panel (4 cols on desktop, full width on mobile) */}
        <div className={`lg:col-span-5 xl:col-span-4 sticky top-20 ${activeTab === 'about' ? 'hidden lg:block' : 'block'}`}>
          <div className="h-[620px] lg:h-[680px]">
            <NotesPanel
              videoId={videoId}
              courseId={video.course_id}
              student={user}
              playerControlRef={playerControlRef}
              onSeek={handleSeek}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
