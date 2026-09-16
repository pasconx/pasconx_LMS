import React from 'react';
import { 
  Settings, 
  ShieldCheck, 
  ShieldAlert, 
  Layers, 
  Server, 
  Key, 
  CheckCircle2, 
  AlertTriangle,
  Info 
} from 'lucide-react';

export default function AdminSettings() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-indigo-600" />
          Platform Configuration & Architecture
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Review active video delivery providers, security parameters, and future DRM integration readiness.
        </p>
      </div>

      {/* Video Provider Abstraction Status */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
              Active Video Delivery Layer
            </span>
            <h2 className="text-xl font-bold text-slate-900 mt-2">
              Current Provider: <span className="text-indigo-600">YouTube Unlisted (MVP)</span>
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
              The platform utilizes a modular video provider abstraction (<code className="text-indigo-600 font-mono">VideoProvider</code> interface). 
              Core authentication, student course enrollment, and expiration enforcement are completely decoupled from video streaming vendors.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Provider Active
          </span>
        </div>

        {/* Architecture Flow Diagram */}
        <div className="bg-slate-900 text-slate-200 rounded-2xl p-5 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
          <div className="text-slate-400 font-bold mb-2"># PASCON X Modular Video Flow Architecture</div>
          <div>PASCON X Portal (React + Vite)</div>
          <div>&nbsp;&nbsp;└── [1] Authentication Check (HTTP-only Session Cookie / JWT)</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── [2] Course & Video Authorization (Backend Enrollment Bounds & Expiry)</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── [3] VideoProvider Factory (VIDEO_PROVIDER environment variable)</div>
          <div className="text-emerald-400">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── YouTubeProvider (Active MVP Delivery)</div>
          <div className="text-cyan-400">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── VdoCipherProvider (Future Grade-A DRM Drop-in)</div>
        </div>
      </div>

      {/* Anti-Download & Security Reality Statement */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Anti-Download Reality & Video Protection</h2>
            <p className="text-xs text-slate-500">Industry-accurate assessment of YouTube Unlisted vs. Commercial DRM</p>
          </div>
        </div>

        <div className="prose prose-sm text-xs text-slate-600 space-y-3 leading-relaxed">
          <p>
            The PASCON X Video Portal enforces rigorous security on the application layer:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
            <li><strong>No MP4 files exposed:</strong> Raw video source files are never accessible via portal APIs.</li>
            <li><strong>No download buttons:</strong> The interface provides no mechanism to download streams.</li>
            <li><strong>Strict backend authorization:</strong> Direct URL sharing (<code className="bg-slate-100 px-1 py-0.5 rounded">/student/watch/123</code>) is completely rejected for unauthenticated or non-enrolled students.</li>
            <li><strong>Enforced access expiry:</strong> Courses and video playback immediately shut down (HTTP 403) upon expiration.</li>
          </ul>

          <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 space-y-1 mt-4">
            <strong className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Important Platform Disclosure:
            </strong>
            <p>
              It is technically not realistic to guarantee zero downloading on YouTube Unlisted without native DRM. 
              Anyone who inspects the browser DOM to extract the unlisted YouTube link could potentially open it directly on YouTube. 
              To achieve bank-grade content protection with encrypted Multi-DRM (Widevine & FairPlay) and dynamic viewer watermarking, switch to the VdoCipher provider.
            </p>
          </div>
        </div>
      </div>

      {/* Future VdoCipher Integration Guide */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Future VdoCipher Integration</h2>
            <p className="text-xs text-slate-500">Zero-code migration roadmap for enterprise DRM</p>
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          When PASCON X is ready to migrate to commercial DRM, add your VdoCipher credentials to the backend server environment:
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
