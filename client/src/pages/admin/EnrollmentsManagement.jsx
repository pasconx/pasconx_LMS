import React, { useEffect, useState } from 'react';
import api from '../../api/client.js';
import Modal from '../../components/common/Modal.jsx';
import { StatusBadge } from '../../components/common/Badge.jsx';
import { 
  KeyRound, 
  PlusCircle, 
  Calendar, 
  Clock, 
  Trash2, 
  Edit3, 
  CheckCircle, 
  AlertCircle,
  AlertTriangle 
} from 'lucide-react';

export default function EnrollmentsManagement() {
  const [enrollments, setEnrollments] = useState([]);
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState({ type: '', message: '' });

  // Modal states
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isExtendOpen, setIsExtendOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);

  // Form states
  const [assignData, setAssignData] = useState({
    student_id: '',
    course_id: '',
    access_start: new Date().toISOString().split('T')[0],
    access_expiry: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'ACTIVE'
  });

  const [extendExpiryDate, setExtendExpiryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [eRes, sRes, cRes] = await Promise.all([
        api.get('/admin/enrollments'),
        api.get('/admin/students'),
        api.get('/admin/courses')
      ]);
      if (eRes.success) setEnrollments(eRes.enrollments);
      if (sRes.success) setStudents(sRes.students);
      if (cRes.success) setCourses(cRes.courses);
    } catch (err) {
      notify('error', err.message || 'Failed to load enrollment records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const notify = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification({ type: '', message: '' }), 5000);
  };

  const handleAssignCourse = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...assignData,
        access_start: new Date(assignData.access_start).toISOString(),
        access_expiry: new Date(`${assignData.access_expiry}T23:59:59.000Z`).toISOString()
      };
      const res = await api.post('/admin/enrollments', payload);
      if (res.success) {
        notify('success', `Assigned ${res.enrollment.course_title} to ${res.enrollment.student_name}.`);
        setIsAssignOpen(false);
        fetchData();
      }
    } catch (err) {
      notify('error', err.message || 'Failed to assign course.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExtendExpiry = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        access_expiry: new Date(`${extendExpiryDate}T23:59:59.000Z`).toISOString()
      };
      const res = await api.put(`/admin/enrollments/${selectedEnrollment.id}`, payload);
      if (res.success) {
        notify('success', 'Access expiry date extended successfully.');
        setIsExtendOpen(false);
        fetchData();
      }
    } catch (err) {
      notify('error', err.message || 'Failed to update expiry date.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEnrollment = async (id, studentName, courseTitle) => {
    if (!window.confirm(`Revoke ${studentName}'s access to ${courseTitle}?`)) return;
    try {
      const res = await api.delete(`/admin/enrollments/${id}`);
      if (res.success) {
        notify('success', 'Course access revoked.');
        fetchData();
      }
    } catch (err) {
      notify('error', err.message || 'Failed to revoke enrollment.');
    }
  };

  const quickAddDays = (days) => {
    const base = selectedEnrollment 
      ? new Date(selectedEnrollment.access_expiry)
      : new Date();
    const newDate = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    setExtendExpiryDate(newDate.toISOString().split('T')[0]);
  };

  const formatDate = (iso) => {
    if (!iso) return 'N/A';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
            <KeyRound className="w-6 h-6 text-indigo-600" />
            Course Enrollment & Access Control
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Assign courses to registered students, define access validities, and extend expiration deadlines.
          </p>
        </div>

        <button
          onClick={() => {
            setAssignData({
              student_id: students[0]?.id || '',
              course_id: courses[0]?.id || '',
              access_start: new Date().toISOString().split('T')[0],
              access_expiry: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              status: 'ACTIVE'
            });
            setIsAssignOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          Assign Course Access
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

      {/* Enrollments Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4 text-left">Student</th>
                <th className="py-3.5 px-4 text-left">Course</th>
                <th className="py-3.5 px-4 text-left">Access Window</th>
                <th className="py-3.5 px-4 text-left">Access Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="5" className="py-10 text-center text-slate-400">
                    Loading enrollments...
                  </td>
                </tr>
              ) : enrollments.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-10 text-center text-slate-400">
                    No active student enrollments found.
                  </td>
                </tr>
              ) : (
                enrollments.map((en) => (
                  <tr key={en.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{en.student_name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{en.student_email}</div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {en.course_title}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span>{formatDate(en.access_start)}</span>
                        <span className="text-slate-400">→</span>
                        <strong className="text-slate-900">{formatDate(en.access_expiry)}</strong>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={en.status} isExpired={en.is_expired} isFuture={en.is_future} />
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setSelectedEnrollment(en);
                          setExtendExpiryDate(en.access_expiry.split('T')[0]);
                          setIsExtendOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold transition-colors"
                        title="Extend Course Expiry"
                      >
                        <Clock className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Extend</span>
                      </button>

                      <button
                        onClick={() => handleDeleteEnrollment(en.id, en.student_name, en.course_title)}
                        className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Revoke Access"
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

      {/* Assign Course Access Modal */}
      <Modal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        title="Assign Course to Student"
        subtitle="Grant verified course access with custom start and expiration dates"
      >
        <form onSubmit={handleAssignCourse} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Student</label>
            <select
              required
              value={assignData.student_id}
              onChange={(e) => setAssignData({ ...assignData, student_id: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Select Student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Course</label>
            <select
              required
              value={assignData.course_id}
              onChange={(e) => setAssignData({ ...assignData, course_id: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Select Course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Access Start Date</label>
              <input
                type="date"
                required
                value={assignData.access_start}
                onChange={(e) => setAssignData({ ...assignData, access_start: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Access Expiry Date</label>
              <input
                type="date"
                required
                value={assignData.access_expiry}
                onChange={(e) => setAssignData({ ...assignData, access_expiry: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Status</label>
            <select
              value={assignData.status}
              onChange={(e) => setAssignData({ ...assignData, status: e.target.value })}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAssignOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
            >
              {submitting ? 'Assigning...' : 'Assign Access'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Extend Expiry Modal */}
      <Modal
        isOpen={isExtendOpen}
        onClose={() => setIsExtendOpen(false)}
        title="Extend Course Access Expiry"
        subtitle={`Adjust expiration for ${selectedEnrollment?.student_name} in ${selectedEnrollment?.course_title}`}
      >
        <form onSubmit={handleExtendExpiry} className="space-y-4">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
            <div className="text-slate-500">Current Expiration:</div>
            <div className="font-bold text-slate-900">{formatDate(selectedEnrollment?.access_expiry)}</div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1">New Expiration Date</label>
            <input
              type="date"
              required
              value={extendExpiryDate}
              onChange={(e) => setExtendExpiryDate(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Quick extension shortcuts */}
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Quick Add:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => quickAddDays(30)}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                +30 Days
              </button>
              <button
                type="button"
                onClick={() => quickAddDays(60)}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                +60 Days
              </button>
              <button
                type="button"
                onClick={() => quickAddDays(180)}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                +6 Months
              </button>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsExtendOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
            >
              {submitting ? 'Updating...' : 'Save Expiry Extension'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
