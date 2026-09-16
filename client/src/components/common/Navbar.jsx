import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import { 
  LogOut, 
  User, 
  Menu, 
  X, 
  Shield, 
  BookOpen, 
  GraduationCap, 
  Users, 
  Video, 
  KeyRound, 
  Settings,
  LayoutDashboard
} from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'ADMIN';

  const studentLinks = [
    { label: 'Dashboard', path: '/student/dashboard', icon: LayoutDashboard },
    { label: 'My Courses', path: '/student/courses', icon: BookOpen },
    { label: 'Profile', path: '/student/profile', icon: User }
  ];

  const adminLinks = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Students', path: '/admin/students', icon: Users },
    { label: 'Courses', path: '/admin/courses', icon: BookOpen },
    { label: 'Videos', path: '/admin/videos', icon: Video },
    { label: 'Enrollments', path: '/admin/enrollments', icon: KeyRound },
    { label: 'Settings', path: '/admin/settings', icon: Settings }
  ];

  const links = isAdmin ? adminLinks : studentLinks;

  return (
    <header className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 shadow-xs transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <Link to={isAdmin ? '/admin/dashboard' : '/student/dashboard'} className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-2xs bg-white dark:bg-slate-800 p-0.5 flex items-center justify-center transition-colors">
                <img 
                  src="/logo.jpg" 
                  alt="PASCONX Logo" 
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </div>
              <div>
                <span className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 transition-colors">
                  PASCON<span className="text-[#0c8ee7]">X</span>
                  <span className="text-xs px-2 py-0.5 rounded font-semibold bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-cyan-400 border border-brand-200 dark:border-brand-800 uppercase transition-colors">
                    {isAdmin ? 'Admin Portal' : 'Student Portal'}
                  </span>
                </span>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide -mt-0.5 transition-colors">Transforming Talent into IT Xperts</p>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-cyan-400 font-semibold border border-brand-200/60 dark:border-brand-800/60'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* User Profile, Theme Switcher & Logout */}
          <div className="hidden md:flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors">{user?.name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono transition-colors">{user?.email}</div>
            </div>

            {/* Theme Toggle Button */}
            <ThemeToggle />

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-red-600 dark:hover:text-red-400 transition-colors shadow-sm"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>

          {/* Mobile Menu & Theme Controls */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-md text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none transition-colors"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pt-2 pb-4 space-y-1 shadow-lg transition-colors">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-2">
            <div className="text-sm font-bold text-slate-900 dark:text-white">{user?.name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{user?.email}</div>
            <div className="flex items-center justify-between mt-2">
              <span className="inline-block text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-brand-100 dark:bg-brand-950 text-brand-800 dark:text-cyan-300">
                {user?.role}
              </span>
              <ThemeToggle showLabel={true} />
            </div>
          </div>

          {links.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-cyan-400 font-bold'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                {link.label}
              </Link>
            );
          })}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors shadow"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
