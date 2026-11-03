import React, { useState, useEffect } from 'react';
import ChangePasswordCard from '../../components/common/ChangePasswordCard.jsx';
import api from '../../api/client.js';
import { 
  Settings, 
  ShieldCheck, 
  ShieldAlert, 
  Layers, 
  Server, 
  Key, 
  CheckCircle2, 
  AlertTriangle,
  Info,
  Wrench,
  Power,
  Image as ImageIcon,
  Save,
  Loader2,
  Check,
  Eye,
  EyeOff
} from 'lucide-react';

export default function AdminSettings() {
  const [maintenance, setMaintenance] = useState({
    enabled: false,
    title: "We're Under Maintenance",
    message: "Our platform is currently undergoing scheduled maintenance to improve performance, security and your learning experience."
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'ENABLE' | 'DISABLE'
  const [showImagePreview, setShowImagePreview] = useState(true);
  const [notification, setNotification] = useState(null);

  const [titleInput, setTitleInput] = useState('');
  const [messageInput, setMessageInput] = useState('');

  // Fetch current maintenance settings
  useEffect(() => {
    let mounted = true;
    const fetchMaintenance = async () => {
      try {
        const res = await api.get('/admin/maintenance');
        if (mounted && res.success && res.maintenance) {
          setMaintenance(res.maintenance);
          setTitleInput(res.maintenance.title || "We're Under Maintenance");
          setMessageInput(res.maintenance.message || "Our platform is currently undergoing scheduled maintenance to improve performance, security and your learning experience.");
        }
      } catch (err) {
        console.error('Failed to load maintenance settings:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchMaintenance();
    return () => { mounted = false; };
  }, []);

  const showToast = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleToggleClick = (targetState) => {
    setPendingAction(targetState ? 'ENABLE' : 'DISABLE');
    setShowConfirmModal(true);
  };

  const executeToggle = async () => {
    const willEnable = pendingAction === 'ENABLE';
    setShowConfirmModal(false);
    setSaving(true);
    try {
      const res = await api.post('/admin/maintenance', {
        enabled: willEnable,
        title: titleInput,
        message: messageInput
      });
      if (res.success && res.maintenance) {
        setMaintenance(res.maintenance);
        showToast('success', res.message || `Maintenance mode ${willEnable ? 'enabled' : 'disabled'}.`);
        window.dispatchEvent(new CustomEvent('pasconx:maintenance-changed', { detail: res.maintenance }));
      }
    } catch (err) {
      const errMsg = err?.message || 'Failed to update maintenance settings.';
      showToast('error', errMsg);
    } finally {
      setSaving(false);
      setPendingAction(null);
    }
  };

  const handleSaveTextOnly = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/admin/maintenance', {
        enabled: maintenance.enabled,
        title: titleInput,
        message: messageInput
      });
      if (res.success && res.maintenance) {
        setMaintenance(res.maintenance);
        showToast('success', 'Maintenance announcement message saved successfully.');
        window.dispatchEvent(new CustomEvent('pasconx:maintenance-changed', { detail: res.maintenance }));
      }
    } catch (err) {
      showToast('error', err?.message || 'Failed to save announcement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Notification Toast */}
      {notification && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 border shadow-lg transition-all animate-in fade-in slide-in-from-top-2 duration-300 ${
          notification.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
            : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span className="text-sm font-semibold">{notification.text}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5 transition-colors">
          <Settings className="w-6 h-6 text-indigo-600 dark:text-cyan-400" />
          Platform Configuration & Architecture
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 transition-colors">
          Manage platform maintenance state, admin credentials, video delivery providers, and security rules.
        </p>
      </div>

      {/* Platform Maintenance Mode Card (Admin Privileges) */}
      <div className={`rounded-3xl border p-6 sm:p-8 shadow-sm space-y-6 transition-all duration-300 ${
        maintenance.enabled
          ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/80 shadow-amber-500/5 ring-2 ring-amber-500/20'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border ${
                maintenance.enabled
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700/60'
                  : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-cyan-400 border-indigo-200 dark:border-indigo-900/60'
              }`}>
                Admin Privileges & Controls
              </span>
              <span className="text-xs text-slate-400">• System Toggle</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Wrench className={`w-5 h-5 ${maintenance.enabled ? 'text-amber-500 animate-spin-slow' : 'text-slate-500 dark:text-slate-400'}`} />
              Platform Maintenance Mode
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
              When maintenance mode is active, student access and video playback are temporarily suspended. 
              Non-admin visitors are presented with the branded PASCONX maintenance screen. 
              <strong> Administrators retain complete access to all panels and tools.</strong>
            </p>
          </div>

          {/* Status Indicator & Main Toggle */}
          <div className="flex flex-col sm:items-end gap-2 shrink-0">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading status...
              </div>
            ) : maintenance.enabled ? (
              <div className="space-y-2 text-left sm:text-right">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  MAINTENANCE ACTIVE
                </span>
                <div>
                  <button
                    onClick={() => handleToggleClick(false)}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-60"
                  >
                    <Power className="w-4 h-4" />
                    <span>Deactivate Maintenance</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-left sm:text-right">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  SYSTEM OPERATIONAL
                </span>
                <div>
                  <button
                    onClick={() => handleToggleClick(true)}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition-all cursor-pointer disabled:opacity-60"
                  >
                    <Power className="w-4 h-4" />
                    <span>Enable Maintenance Mode</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Maintenance Image Preview Section */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50 dark:bg-slate-950/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              <ImageIcon className="w-4 h-4 text-cyan-500" />
              <span>Branded Maintenance Display Image</span>
              <span className="font-mono text-[11px] text-slate-400">(/public/maintenance.png)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowImagePreview(!showImagePreview)}
              className="text-xs text-indigo-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              {showImagePreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showImagePreview ? 'Hide Preview' : 'Show Graphic'}</span>
            </button>
          </div>

          {showImagePreview && (
            <div className="relative group rounded-xl overflow-hidden border border-slate-300 dark:border-slate-800 bg-slate-900 max-w-2xl mx-auto shadow-md">
              <img 
                src="/maintenance.png" 
                alt="Maintenance Graphic" 
                className="w-full h-auto object-cover max-h-72" 
              />
              <div className="absolute bottom-2 right-2 px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-md text-[10px] text-slate-300 font-mono">
                Asset: PASCONX System Maintenance
              </div>
            </div>
          )}
        </div>

        {/* Announcement Message Editor */}
        <form onSubmit={handleSaveTextOnly} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Headline / Display Title
              </label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="We're Under Maintenance"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-cyan-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Announcement Details / Explanation
              </label>
              <textarea
                rows={3}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Our platform is currently undergoing scheduled maintenance..."
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-cyan-500 transition-colors resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">
              {maintenance.updated_at ? `Last updated: ${new Date(maintenance.updated_at).toLocaleString()}` : ''}
            </span>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-medium text-xs border border-slate-700 transition-all cursor-pointer disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-cyan-400" />}
              <span>Save Announcement</span>
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 sm:p-7 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                pendingAction === 'ENABLE'
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
              }`}>
                {pendingAction === 'ENABLE' ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {pendingAction === 'ENABLE' ? 'Enable Maintenance Mode?' : 'Restore Platform Access?'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pendingAction === 'ENABLE' ? 'System lockdown confirmation' : 'Resume normal student operations'}
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              {pendingAction === 'ENABLE' ? (
                <>
                  <p className="font-semibold text-amber-700 dark:text-amber-400">
                    ⚠️ When enabled:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
                    <li>Student access and active video sessions will be suspended immediately.</li>
                    <li>Students attempting to log in will be blocked with an informative notice.</li>
                    <li>All portal routes will display the branded PASCONX maintenance banner.</li>
                    <li><strong>You (Admin) will retain full access to this panel.</strong></li>
                  </ul>
                </>
              ) : (
                <p>
                  This will deactivate the maintenance screen and allow students to log in, access courses, and watch videos normally.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowConfirmModal(false); setPendingAction(null); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeToggle}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-lg transition-all cursor-pointer ${
                  pendingAction === 'ENABLE'
                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                }`}
              >
                {pendingAction === 'ENABLE' ? 'Yes, Activate Maintenance' : 'Yes, Restore Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Self-Service Change Password */}
      <ChangePasswordCard />

      {/* Video Provider Abstraction Status */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-6 transition-colors">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-cyan-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-900/60">
              Active Video Delivery Layer
            </span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-2">
              Current Provider: <span className="text-indigo-600 dark:text-cyan-400">YouTube + Widevine DRM Dual Engine</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
              The platform utilizes a modular video provider abstraction (<code className="text-indigo-600 dark:text-cyan-400 font-mono">VideoProvider</code> interface). 
              Core authentication, student course enrollment, and expiration enforcement are completely decoupled from video streaming vendors.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> Provider Active
          </span>
        </div>

        {/* Architecture Flow Diagram */}
        <div className="bg-slate-900 dark:bg-black text-slate-200 rounded-2xl p-5 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
          <div className="text-slate-400 font-bold mb-2"># PASCON X Modular Video Flow Architecture</div>
          <div>PASCON X Portal (React + Vite)</div>
          <div>&nbsp;&nbsp;└── [1] Authentication Check (HTTP-only Session Cookie / JWT)</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── [2] Course & Video Authorization (Backend Enrollment Bounds & Expiry)</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── [3] VideoProvider Factory (video_type: 'youtube' | 'widevine')</div>
          <div className="text-emerald-400">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── YouTubeProvider (Active YouTube Delivery)</div>
          <div className="text-purple-400">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── WidevineProvider (Shaka Player + EME License Proxy)</div>
        </div>
      </div>

      {/* Anti-Download & Security Reality Statement */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-6 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Anti-Download Reality & Video Protection</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Industry-accurate assessment of YouTube Unlisted vs. Commercial DRM</p>
          </div>
        </div>

        <div className="prose prose-sm text-xs text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
          <p>
            The PASCON X Video Portal enforces rigorous security on the application layer:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-700 dark:text-slate-300">
            <li><strong>No MP4 files exposed:</strong> Raw video source files are never accessible via portal APIs.</li>
            <li><strong>No download buttons:</strong> The interface provides no mechanism to download streams.</li>
            <li><strong>Strict backend authorization:</strong> Direct URL sharing (<code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">/student/watch/123</code>) is completely rejected for unauthenticated or non-enrolled students.</li>
            <li><strong>Enforced access expiry:</strong> Courses and video playback immediately shut down (HTTP 403) upon expiration.</li>
          </ul>

          <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 space-y-1 mt-4">
            <strong className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Important Platform Disclosure:
            </strong>
            <p>
              Standard YouTube embeds use public/unlisted streams without native DRM encryption. 
              For bank-grade protected video delivery, utilize the <strong>Widevine DRM</strong> engine configured in the Video Management panel.
            </p>
          </div>
        </div>
      </div>

      {/* Future VdoCipher Integration Guide */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-6 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-cyan-400">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Commercial DRM Expansion</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Cloud DRM scaling roadmap for enterprise encryption</p>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          When PASCON X is ready to connect custom production license servers, add your Widevine/VdoCipher credentials to the backend server environment:
        </p>

        <div className="bg-slate-900 text-slate-200 rounded-2xl p-4 font-mono text-xs space-y-1 border border-slate-800">
          <div className="text-slate-400"># Server .env configuration:</div>
          <div>VIDEO_PROVIDER=vdocipher</div>
          <div>VDOCIPHER_API_SECRET=your_secret_key_here</div>
          <div>VDOCIPHER_API_KEY=your_api_key_here</div>
        </div>

        <div className="text-xs text-slate-500 leading-relaxed">
          <strong>Key Security Rule:</strong> All VdoCipher secret credentials remain strictly server-side. 
          The backend securely generates short-lived OTP tokens for verified student sessions, completely preventing client credential leakage.
        </div>
      </div>
    </div>
  );
}
