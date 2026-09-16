import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Navbar from './components/common/Navbar.jsx';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';

// Pages
import LoginPage from './pages/auth/LoginPage.jsx';
import StudentDashboard from './pages/student/StudentDashboard.jsx';
import CourseDetailPage from './pages/student/CourseDetailPage.jsx';
import VideoWatchPage from './pages/student/VideoWatchPage.jsx';
import StudentProfile from './pages/student/StudentProfile.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import StudentsManagement from './pages/admin/StudentsManagement.jsx';
import CoursesManagement from './pages/admin/CoursesManagement.jsx';
import VideosManagement from './pages/admin/VideosManagement.jsx';
import EnrollmentsManagement from './pages/admin/EnrollmentsManagement.jsx';
import AdminSettings from './pages/admin/AdminSettings.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-edtech-canvas dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 py-6 text-center text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; {new Date().getFullYear()} PASCON<span className="text-[#0c8ee7] font-bold">X</span> Academy • Transforming Talent into IT Xperts</span>
          <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">Protected Video & Course Portal</span>
        </div>
      </footer>
    </div>
  );
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'ADMIN') return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/student/dashboard" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
          <Routes>
            {/* Root redirect */}
            <Route path="/" element={<RootRedirect />} />

            {/* Public Auth Route */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected Student Routes */}
            <Route
              element={
                <ProtectedRoute allowedRoles={['STUDENT']}>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/student/dashboard" element={<StudentDashboard />} />
              <Route path="/student/courses" element={<StudentDashboard />} />
              <Route path="/student/courses/:courseId" element={<CourseDetailPage />} />
              <Route path="/student/watch/:videoId" element={<VideoWatchPage />} />
              <Route path="/student/profile" element={<StudentProfile />} />
            </Route>

            {/* Protected Admin Routes */}
            <Route
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/students" element={<StudentsManagement />} />
              <Route path="/admin/courses" element={<CoursesManagement />} />
              <Route path="/admin/videos" element={<VideosManagement />} />
              <Route path="/admin/enrollments" element={<EnrollmentsManagement />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
            </Route>

            {/* 404 Route */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </ErrorBoundary>
  );
}
