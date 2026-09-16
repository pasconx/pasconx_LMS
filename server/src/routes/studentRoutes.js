import { Router } from 'express';
import {
  getStudentCourses,
  getStudentCourseDetail,
  getStudentVideoPlayback,
  updateStudentVideoProgress,
  getStudentCourseDocuments,
  streamStudentDocument
} from '../controllers/studentController.js';
import { authenticateUser, requireStudent } from '../middleware/auth.js';
import { checkCourseAccess, checkVideoAccess, checkDocumentAccess } from '../middleware/accessControl.js';

const router = Router();

// All student routes require valid user session and STUDENT role
router.use(authenticateUser);
router.use(requireStudent);

// Student courses list (only courses assigned to this student)
router.get('/courses', getStudentCourses);

// Specific course syllabus and details (authorized by checkCourseAccess)
router.get('/courses/:courseId', checkCourseAccess, getStudentCourseDetail);

// Course documents list
router.get('/courses/:courseId/documents', checkCourseAccess, getStudentCourseDocuments);

// Stream course document (authorized by checkDocumentAccess)
router.get('/courses/:courseId/documents/:docId/view', checkDocumentAccess, streamStudentDocument);

// Specific video playback payload (authorized by checkVideoAccess)
router.get('/videos/:videoId', checkVideoAccess, getStudentVideoPlayback);

// Progress tracking update (authorized by checkVideoAccess)
router.post('/videos/:videoId/progress', checkVideoAccess, updateStudentVideoProgress);

export default router;

