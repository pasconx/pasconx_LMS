import { Router } from 'express';
import {
  getStudentCourses,
  getStudentRecordings,
  getStudentCourseDetail,
  getStudentVideoPlayback,
  updateStudentVideoProgress,
  getStudentCourseDocuments,
  streamStudentDocument
} from '../controllers/studentController.js';
import {
  getVideoNotes,
  getAllStudentNotes,
  createNote,
  updateNote,
  deleteNote,
  exportStudentNotes
} from '../controllers/notesController.js';
import {
  getStudentMeetings,
  getStudentMeetingDetail
} from '../controllers/meetingController.js';
import { authenticateUser, requireStudent } from '../middleware/auth.js';
import { checkCourseAccess, checkVideoAccess, checkDocumentAccess } from '../middleware/accessControl.js';

const router = Router();

// All student routes require valid user session and STUDENT role
router.use(authenticateUser);
router.use(requireStudent);

// All recorded videos across the student's active courses (one place)
router.get('/recordings', getStudentRecordings);

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
router.get('/videos/:videoId/play', checkVideoAccess, getStudentVideoPlayback);

// Progress tracking update (authorized by checkVideoAccess)
router.post('/videos/:videoId/progress', checkVideoAccess, updateStudentVideoProgress);

// Student Notes routes
router.get('/notes/export', exportStudentNotes);
router.get('/notes', getAllStudentNotes);
router.put('/notes/:noteId', updateNote);
router.delete('/notes/:noteId', deleteNote);

// Video specific notes
router.get('/videos/:videoId/notes', checkVideoAccess, getVideoNotes);
router.post('/videos/:videoId/notes', checkVideoAccess, createNote);

// Course Meetings routes
router.get('/meetings', getStudentMeetings);
router.get('/meetings/:id', getStudentMeetingDetail);

export default router;

