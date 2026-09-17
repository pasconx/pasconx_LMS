import React, { useState, useRef, useEffect } from 'react';
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
  LayoutDashboard,
  FileText,
  Calendar,
  Radio,
  ChevronDown,
  Layers
} from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isManageDropdownOpen, setIsManageDropdownOpen] = useState(false);
  const manageDropdownRef = useRef(null);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'ADMIN';

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (manageDropdownRef.current && !manageDropdownRef.current.contains(event.target)) {
        setIsManageDropdownOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsManageDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Close menus on route change
  useEffect(() => {
    setIsManageDropdownOpen(false);
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const studentLinks = [
    { label: 'Dashboard', path: '/student/dashboard', icon: LayoutDashboard },
    { label: 'My Courses', path: '/student/courses', icon: BookOpen },
    { label: 'Calendar', path: '/student/calendar', icon: Calendar },
    { label: 'My Notes', path: '/student/notes', icon: FileText },
    { label: 'Profile', path: '/student/profile', icon: User }
  ];

  const adminManageLinks = [
    { label: 'Students', path: '/admin/students', icon: Users, desc: 'Student accounts & status' },
    { label: 'Courses', path: '/admin/courses', icon: BookOpen, desc: 'Curriculum & modules' },
    { label: 'Videos', path: '/admin/videos', icon: Video, desc: 'Video delivery & lectures' },
    { label: 'Enrollments', path: '/admin/enrollments', icon: KeyRound, desc: 'Student access & permissions' }
  ];

  const isManageActive = adminManageLinks.some(item => location.pathname === item.path);

  // Complete list for mobile menu
  const mobileAdminLinks = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    ...adminManageLinks,
    { label: 'Meetings', path: '/admin/meetings', icon: Radio },
    { label: 'Calendar', path: '/admin/calendar', icon: Calendar },
    { label: 'Settings', path: '/admin/settings', icon: Settings }
  ];

  return (
    <header className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 shadow-xs transition-colors duration-200">
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3 shrink-0">
            <Link to={isAdmin ? '/admin/dashboard' : '/student/dashboard'} className="flex items-center gap-2.5 group">
              <div className="h-9 w-9 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-2xs bg-white dark:bg-slate-800 p-0.5 flex items-center justify-center transition-colors">
                <img 
                  src="/logo.jpg" 
                  alt="PASCONX Logo" 
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white transition-colors">
                    PASCON<span className="text-[#0c8ee7]">X</span>
                  </span>
                  <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-brand-500/10 text-brand-600 dark:text-cyan-400 border border-brand-500/20 dark:border-cyan-500/30">
                    {isAdmin ? 'ADMIN' : 'STUDENT'}
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium tracking-wide hidden 2xl:block -mt-0.5">
                  Transforming Talent into IT Xperts
                </p>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          {isAdmin ? (
            <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 mx-2 shrink-0">
              {/* Dashboard */}
              <Link
                to="/admin/dashboard"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-all ${
                  location.pathname === '/admin/dashboard'
                    ? 'bg-brand-50 dark:bg-cyan-950/40 text-brand-700 dark:text-cyan-400 font-bold border border-brand-200/80 dark:border-cyan-500/30 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </Link>

              {/* Manage Dropdown */}
              <div className="relative" ref={manageDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsManageDropdownOpen(prev => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-all cursor-pointer ${
                    isManageActive || isManageDropdownOpen
                      ? 'bg-brand-50 dark:bg-cyan-950/40 text-brand-700 dark:text-cyan-400 font-bold border border-brand-200/80 dark:border-cyan-500/30 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                  aria-expanded={isManageDropdownOpen}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Manage</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isManageDropdownOpen ? 'rotate-180 text-brand-600 dark:text-cyan-400' : 'text-slate-400'}`} />
                </button>

                {isManageDropdownOpen && (
                  <div className="absolute left-0 mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/80 mb-1">
                      Academic Management
                    </div>
                    {adminManageLinks.map((item) => {
                      const ItemIcon = item.icon;
                      const isItemActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setIsManageDropdownOpen(false)}
                          className={`flex items-start gap-3 p-2.5 rounded-xl transition-all ${
                            isItemActive
                              ? 'bg-brand-50 dark:bg-cyan-950/50 text-brand-700 dark:text-cyan-300 font-semibold'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                          }`}
                        >
                          <div className={`p-1.5 rounded-lg shrink-0 ${
                            isItemActive 
                              ? 'bg-brand-100 dark:bg-cyan-900/60 text-brand-700 dark:text-cyan-400' 
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}>
                            <ItemIcon className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold leading-tight">{item.label}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">{item.desc}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Meetings */}
              <Link
                to="/admin/meetings"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-all ${
                  location.pathname === '/admin/meetings'
                    ? 'bg-brand-50 dark:bg-cyan-950/40 text-brand-700 dark:text-cyan-400 font-bold border border-brand-200/80 dark:border-cyan-500/30 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Meetings</span>
              </Link>

              {/* Calendar */}
              <Link
                to="/admin/calendar"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-all ${
                  location.pathname === '/admin/calendar'
                    ? 'bg-brand-50 dark:bg-cyan-950/40 text-brand-700 dark:text-cyan-400 font-bold border border-brand-200/80 dark:border-cyan-500/30 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Calendar</span>
              </Link>

              {/* Settings */}
              <Link
                to="/admin/settings"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-all ${
                  location.pathname === '/admin/settings'
                    ? 'bg-brand-50 dark:bg-cyan-950/40 text-brand-700 dark:text-cyan-400 font-bold border border-brand-200/80 dark:border-cyan-500/30 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Settings</span>
              </Link>
            </nav>
          ) : (
            <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 mx-2 shrink-0">
              {studentLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.path;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-brand-50 dark:bg-cyan-950/40 text-brand-700 dark:text-cyan-400 font-bold border border-brand-200/80 dark:border-cyan-500/30 shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}

          {/* User Profile, Theme Switcher & Logout */}
          <div className="hidden lg:flex items-center gap-2 xl:gap-2.5 shrink-0">
            {/* Sleek User Profile Badge */}
            <div 
              className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 shadow-2xs"
              title={`${user?.name} (${isAdmin ? 'Administrator' : 'Student'})`}
            >
              <div className="w-6 h-6 rounded-lg bg-brand-600 dark:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="text-left hidden xl:block pr-1">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight truncate max-w-[110px]">
                  {user?.name}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium leading-none">
                  {isAdmin ? 'Administrator' : 'Student'}
                </div>
              </div>
            </div>

            {/* Theme Toggle Button */}
            <ThemeToggle />

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800/60 transition-all cursor-pointer shadow-xs whitespace-nowrap"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>

          {/* Mobile Menu & Theme Controls */}
          <div className="flex items-center gap-2 lg:hidden">
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
        <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pt-2 pb-4 space-y-1 shadow-lg transition-colors">
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

          {(isAdmin ? mobileAdminLinks : studentLinks).map((link) => {
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
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors shadow cursor-pointer"
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
