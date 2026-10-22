import { Router } from 'express';
import {
  getAdminStats,
  getStudents,
  createStudent,
  updateStudent,
  updateStudentStatus,
  resetStudentPassword,
  resetStudentSession,
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  getVideos,
  createVideo,
  updateVideo,
  deleteVideo,
  getEnrollments,
  createEnrollment,
  updateEnrollment,
  deleteEnrollment,
  getAuditLogs,
  getAdminCourseDocuments,
  createAdminCourseDocument,
  deleteAdminCourseDocument
} from '../controllers/adminController.js';
import {
  getAdminMeetings,
  createMeeting,
  updateMeeting,
  updateMeetingStatus,
  deleteMeeting
} from '../controllers/meetingController.js';
import { authenticateUser, requireAdmin } from '../middleware/auth.js';

const router = Router();

// All admin routes require authentication and ADMIN role
router.use(authenticateUser);
router.use(requireAdmin);

// Dashboard Statistics
router.get('/stats', getAdminStats);

// Security Audit Logs
router.get('/audit-logs', getAuditLogs);

// Student Management
router.get('/students', getStudents);
router.post('/students', createStudent);
router.put('/students/:id', updateStudent);
router.patch('/students/:id/status', updateStudentStatus);
router.post('/students/:id/reset-password', resetStudentPassword);
router.post('/students/:id/reset-session', resetStudentSession);

// Course Management
router.get('/courses', getCourses);
router.post('/courses', createCourse);
router.put('/courses/:id', updateCourse);
router.delete('/courses/:id', deleteCourse);

// Course Documents Management
router.get('/courses/:courseId/documents', getAdminCourseDocuments);
router.post('/courses/:courseId/documents', createAdminCourseDocument);
router.delete('/courses/:courseId/documents/:docId', deleteAdminCourseDocument);

// Video Management
router.get('/videos', getVideos);
router.post('/videos', createVideo);
router.put('/videos/:id', updateVideo);
router.delete('/videos/:id', deleteVideo);

// Enrollment Management
router.get('/enrollments', getEnrollments);
router.post('/enrollments', createEnrollment);
router.put('/enrollments/:id', updateEnrollment);
router.delete('/enrollments/:id', deleteEnrollment);

// Course Meetings Management
router.get('/meetings', getAdminMeetings);
router.post('/meetings', createMeeting);
router.put('/meetings/:id', updateMeeting);
router.patch('/meetings/:id/status', updateMeetingStatus);
router.delete('/meetings/:id', deleteMeeting);

export default router;
