import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../api/client.js';
import YouTubePlayer from '../../components/video/YouTubePlayer.jsx';
import { 
  ArrowLeft, 
  ArrowRight, 
  ShieldAlert, 
  CheckCircle2, 
  BookOpen, 
  Lock, 
  Clock, 
  AlertCircle 
} from 'lucide-react';

export default function VideoWatchPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to={`/student/courses/${video.course_id}`}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-brand-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          ← Back to Course
        </Link>

        {saveStatus && (
          <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 animate-pulse">
            {saveStatus}
          </span>
        )}
      </div>

      {/* Course & Video Header */}
      <div className="space-y-1">
        <div className="text-xs font-bold text-brand-600 uppercase tracking-wider">
          {video.course_title}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {video.title}
        </h1>
      </div>

      {/* Official YouTube Embedded Player */}
      <YouTubePlayer
        videoId={playback.videoId}
        duration={video.duration_seconds}
        initialProgressSeconds={progress.progress_seconds}
        onProgressUpdate={handleProgressUpdate}
        privacyType={playback.privacyType}
        disclaimer={playback.disclaimer}
        student={user}
        watermarkProfile={data?.watermarkProfile}
      />

      {/* Description & Navigation Footer */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">About This Session</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            {video.description || 'No additional lesson notes provided for this video.'}
          </p>
        </div>

        {/* Previous & Next Navigation Controls */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
          {navigation.prevVideo ? (
            <Link
              to={`/student/watch/${navigation.prevVideo.id}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
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
            <div className="text-xs text-slate-400 font-medium italic">
              End of course modules
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
