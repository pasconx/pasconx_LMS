import bcrypt from 'bcryptjs';
import { db, initDatabase } from '../config/database.js';

export async function seed() {
  console.log('--- Initializing Database & Seeding Demo Data ---');
  initDatabase();

  // Clear existing records
  db.exec(`
    DELETE FROM security_audit_logs;
    DELETE FROM course_documents;
    DELETE FROM video_progress;
    DELETE FROM enrollments;
    DELETE FROM videos;
    DELETE FROM courses;
    DELETE FROM users;
  `);

  const adminPassword = await bcrypt.hash('Admin@12345', 10);
  const studentPassword = await bcrypt.hash('Student@12345', 10);
  const rahulPassword = await bcrypt.hash('Rahul@12345', 10);
  const disabledPassword = await bcrypt.hash('Disabled@12345', 10);

  // 1. Create Users
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  const adminResult = insertUser.run('PASCONX Admin', 'admin@pasconx.com', adminPassword, 'ADMIN', 'ACTIVE');
  const studentResult = insertUser.run('PASCONX Student', 'student@pasconx.com', studentPassword, 'STUDENT', 'ACTIVE');
  const rahulResult = insertUser.run('Rahul Sharma', 'rahul@example.com', rahulPassword, 'STUDENT', 'ACTIVE');
  const disabledResult = insertUser.run('Inactive User', 'disabled@pasconx.com', disabledPassword, 'STUDENT', 'DISABLED');

  const adminId = adminResult.lastInsertRowid;
  const studentId = studentResult.lastInsertRowid;
  const rahulId = rahulResult.lastInsertRowid;
  const disabledId = disabledResult.lastInsertRowid;

  console.log(`Created Users:
  - Admin: admin@pasconx.com / Admin@12345 (ID: ${adminId})
  - Student: student@pasconx.com / Student@12345 (ID: ${studentId})
  - Student: rahul@example.com / Rahul@12345 (ID: ${rahulId})
  - Disabled: disabled@pasconx.com / Disabled@12345 (ID: ${disabledId})`);

  // 2. Create Courses
  const insertCourse = db.prepare(`
    INSERT INTO courses (title, description, thumbnail_url, status)
    VALUES (?, ?, ?, ?)
  `);

  const courseDemo = insertCourse.run(
    'PASCONX Demo Course',
    'Essential foundation and overview of the PASCONX educational platform, study techniques, and core curriculum roadmap.',
    'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800&auto=format&fit=crop&q=80',
    'ACTIVE'
  ).lastInsertRowid;

  const courseCyber = insertCourse.run(
    'Cybersecurity Fundamentals',
    'In-depth exploration of network security, threat vectors, cryptography principles, and modern defense architecture.',
    'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&auto=format&fit=crop&q=80',
    'ACTIVE'
  ).lastInsertRowid;

  const coursePython = insertCourse.run(
    'Python Full Stack',
    'Master modern web applications, backend APIs, relational database design, and production deployment using Python.',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&auto=format&fit=crop&q=80',
    'ACTIVE'
  ).lastInsertRowid;

  const courseExpired = insertCourse.run(
    'Legacy System Security (Archived Course)',
    'Historical perspectives on enterprise IT architectures and retired security protocols.',
    'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&auto=format&fit=crop&q=80',
    'ACTIVE'
  ).lastInsertRowid;

  // 3. Create Videos for Courses
  const insertVideo = db.prepare(`
    INSERT INTO videos (course_id, title, description, provider, privacy_type, external_video_id, duration_seconds, order_index, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Videos for "PASCONX Demo Course"
  const v1 = insertVideo.run(
    courseDemo,
    '01 Introduction to PASCONX',
    'Welcome to the PASCONX learning portal. Learn how to navigate your courses and study materials.',
    'youtube',
    'youtube_unlisted',
    'dQw4w9WgXcQ',
    360,
    1,
    'ACTIVE'
  ).lastInsertRowid;

  const v2 = insertVideo.run(
    courseDemo,
    '02 Getting Started & Course Setup',
    'Step-by-step guidance on setting up your environment, required tools, and development workspace.',
    'youtube',
    'youtube_unlisted',
    'L_LUpnjgPso',
    720,
    2,
    'ACTIVE'
  ).lastInsertRowid;

  const v3 = insertVideo.run(
    courseDemo,
    '03 Final Lesson & Practical Assessment',
    'Review key learning outcomes, best practices, and next steps for advanced certification.',
    'youtube',
    'youtube_unlisted',
    'kXYiU_JCYtU',
    540,
    3,
    'ACTIVE'
  ).lastInsertRowid;

  // Videos for "Cybersecurity Fundamentals"
  const cV1 = insertVideo.run(
    courseCyber,
    '01 Introduction to Modern Cybersecurity',
    'Core principles of confidentiality, integrity, and availability (CIA triad).',
    'youtube',
    'youtube_unlisted',
    'inWWhr5tnEA',
    1500,
    1,
    'ACTIVE'
  ).lastInsertRowid;

  const cV2 = insertVideo.run(
    courseCyber,
    '02 Network Security & Defense In Depth',
    'Understanding firewalls, IDS/IPS, network segmentation, and zero trust models.',
    'youtube',
    'youtube_unlisted',
    '3Kq1MIfTWCE',
    2520,
    2,
    'ACTIVE'
  ).lastInsertRowid;

  const cV3 = insertVideo.run(
    courseCyber,
    '03 Web Application Security',
    'OWASP Top 10 vulnerabilities, injection attacks, cross-site scripting, and secure headers.',
    'youtube',
    'youtube_unlisted',
    '2_lswM1S264',
    2100,
    3,
    'ACTIVE'
  ).lastInsertRowid;

  // Video for Expired course
  const expV1 = insertVideo.run(
    courseExpired,
    'Archived Overview',
    'Course access has expired.',
    'youtube',
    'youtube_unlisted',
    'dQw4w9WgXcQ',
    600,
    1,
    'ACTIVE'
  ).lastInsertRowid;

  // 4. Enrollments
  const insertEnrollment = db.prepare(`
    INSERT INTO enrollments (student_id, course_id, access_start, access_expiry, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Active Enrollment for student@pasconx.com
  insertEnrollment.run(studentId, courseDemo, '2026-01-01T00:00:00.000Z', '2027-12-31T23:59:59.000Z', 'ACTIVE');
  insertEnrollment.run(studentId, courseCyber, '2026-01-01T00:00:00.000Z', '2026-09-30T23:59:59.000Z', 'ACTIVE');

  // Active Enrollment for rahul@example.com (Python Full Stack + Cybersecurity)
  insertEnrollment.run(rahulId, courseCyber, '2026-01-01T00:00:00.000Z', '2026-09-30T23:59:59.000Z', 'ACTIVE');
  insertEnrollment.run(rahulId, coursePython, '2026-01-01T00:00:00.000Z', '2026-10-30T23:59:59.000Z', 'ACTIVE');

  // Expired Enrollment for student@pasconx.com (expired in August 2026)
  insertEnrollment.run(studentId, courseExpired, '2026-01-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'ACTIVE');

  // 5. Initial video progress
  const insertProgress = db.prepare(`
    INSERT INTO video_progress (student_id, video_id, progress_seconds, completed)
    VALUES (?, ?, ?, ?)
  `);

  // Rahul watched 65% of v1 in Cybersecurity
  insertProgress.run(rahulId, cV1, 975, 0);
  // Student completed demo intro video
  insertProgress.run(studentId, v1, 360, 1);

  // 6. Sample Course Documents
  const insertDoc = db.prepare(`
    INSERT INTO course_documents (course_id, title, description, file_path, file_type, file_size_bytes, order_index, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
  `);
  insertDoc.run(
    courseDemo,
    'PASCONX Orientation Handbook & Guidelines',
    'Official academic conduct, training schedules, and curriculum roadmap.',
    'server/data/documents/orientation_handbook.pdf',
    'application/pdf',
    245000,
    1
  );
  insertDoc.run(
    courseCyber,
    'Lab 01 - Network Reconnaissance & Threat Modeling',
    'Hands-on lab manual, packet capture instructions, and practice exercises.',
    'server/data/documents/cyber_lab01.pdf',
    'application/pdf',
    512000,
    1
  );

  console.log('--- Seeding Completed Successfully ---');
}

// Allow direct execution: node src/seed/seed.js
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}
