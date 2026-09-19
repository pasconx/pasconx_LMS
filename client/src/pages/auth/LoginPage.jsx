import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import ThemeToggle from '../../components/common/ThemeToggle.jsx';
import TurnstileWidget from '../../components/common/TurnstileWidget.jsx';
import { 
  Lock, 
  Mail, 
  ArrowRight, 
  ShieldCheck, 
  AlertCircle,
  GraduationCap
} from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const res = await login(email, password, turnstileToken);

      const destination = res.user.role === 'ADMIN' ? '/admin/dashboard' : '/student/dashboard';
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLogin = (quickEmail, quickPassword) => {
    setEmail(quickEmail);
    setPassword(quickPassword);
    setError('');
  };

  return (
    <div className="min-h-screen bg-edtech-gradient flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Theme Switcher in top corner */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Soft atmospheric ambient light glows */}
      <div className="absolute top-[-10%] left-[-5%] w-96 h-96 bg-cyan-400/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-96 h-96 bg-purple-400/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-[30%] right-[10%] w-64 h-64 bg-indigo-300/20 rounded-full blur-2xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center">
          <div className="h-16 w-16 rounded-2xl bg-white p-2 shadow-xl border border-white/60 flex items-center justify-center">
            <img 
              src="/logo.jpg" 
              alt="PASCONX" 
              className="h-full w-full object-contain" 
            />
          </div>
          <h2 className="mt-4 text-center text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-xs">
            PASCON<span className="text-[#22d3ee]">X</span> ACADEMY
          </h2>
          <p className="mt-1 text-center text-sm font-medium text-blue-100 drop-shadow-2xs">
            Transforming Talent into IT Xperts
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 relative z-10">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-3xl sm:px-10 border border-white/50 dark:border-slate-800/80 transition-colors">
          {error && (
            <div className="mb-5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-3.5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="text-sm font-medium text-rose-800 dark:text-rose-300">{error}</div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5 transition-colors">
                Email Address
              </label>
              <div className="relative rounded-lg shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@pasconx.com"
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800/90 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5 transition-colors">
                Password
              </label>
              <div className="relative rounded-lg shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800/90 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                />
              </div>
            </div>

            <TurnstileWidget 
              onVerify={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-edtech-purple w-full flex justify-center items-center gap-2 py-3.5 px-4 text-sm font-bold tracking-wide focus:outline-none disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Logins for Easy Verification */}
          <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 transition-colors">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center mb-3">
              Instant Demo Accounts
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('student@pasconx.com', 'Student@12345')}
                className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700/80 hover:border-brand-300 dark:hover:border-cyan-500/50 hover:bg-brand-50/50 dark:hover:bg-slate-800/70 transition-colors flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">Student Account</div>
                  <div className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">student@pasconx.com</div>
                </div>
                <span className="text-[10px] font-bold uppercase bg-brand-100 dark:bg-brand-950 text-brand-800 dark:text-cyan-300 px-2 py-0.5 rounded">
                  Fill
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('rahul@example.com', 'Rahul@12345')}
                className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700/80 hover:border-brand-300 dark:hover:border-cyan-500/50 hover:bg-brand-50/50 dark:hover:bg-slate-800/70 transition-colors flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">Student (Rahul Sharma)</div>
                  <div className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">rahul@example.com</div>
                </div>
                <span className="text-[10px] font-bold uppercase bg-brand-100 dark:bg-brand-950 text-brand-800 dark:text-cyan-300 px-2 py-0.5 rounded">
                  Fill
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('admin@pasconx.com', 'Admin@12345')}
                className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700/80 hover:border-indigo-300 dark:hover:border-purple-500/50 hover:bg-indigo-50/50 dark:hover:bg-slate-800/70 transition-colors flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">Administrator</div>
                  <div className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">admin@pasconx.com</div>
                </div>
                <span className="text-[10px] font-bold uppercase bg-indigo-100 dark:bg-purple-950 text-indigo-800 dark:text-purple-300 px-2 py-0.5 rounded">
                  Fill
                </span>
              </button>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Encrypted Session & Access Control</span>
          </div>
        </div>
      </div>
    </div>
  );
}
