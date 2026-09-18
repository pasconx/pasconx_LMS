import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;

try {
  const Database = require('better-sqlite3');
  const dbPath = process.env.DATABASE_URL 
    ? path.resolve(process.cwd(), process.env.DATABASE_URL)
    : (process.env.VERCEL ? path.join('/tmp', 'pasconix.db') : path.resolve(__dirname, '../../data/pasconix.db'));

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
} catch (err) {
  // Graceful fallback stub for serverless environments (e.g. Vercel) where Supabase is the primary DB
  dbInstance = {
    prepare: () => ({
      run: () => ({ lastInsertRowid: 1, changes: 0 }),
      get: () => null,
      all: () => []
    }),
    pragma: () => {},
    exec: () => {}
  };
}

export const db = dbInstance;

export function initDatabase() {
  if (process.env.DATA_BACKEND === 'supabase' && process.env.VERCEL) {
    return db;
  }
  try {
    if (!db || typeof db.exec !== 'function') return db;
  const initStatements = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('STUDENT', 'ADMIN')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'DISABLED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      thumbnail_url TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'ARCHIVED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      video_type TEXT NOT NULL DEFAULT 'youtube' CHECK(video_type IN ('youtube', 'widevine')),
      provider TEXT NOT NULL DEFAULT 'youtube',
      privacy_type TEXT NOT NULL DEFAULT 'youtube_unlisted' CHECK(privacy_type IN ('youtube_unlisted', 'youtube_private', 'widevine_drm')),
      external_video_id TEXT NOT NULL,
      manifest_url TEXT,
      license_server_url TEXT,
      duration_seconds INTEGER DEFAULT 0,
      order_index INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      access_start TEXT NOT NULL,
      access_expiry TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS video_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      progress_seconds INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0 CHECK(completed IN (0, 1)),
      last_watched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, video_id)
    );

    CREATE TABLE IF NOT EXISTS course_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'application/pdf',
      file_size_bytes INTEGER DEFAULT 0,
      order_index INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp_seconds INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      platform TEXT NOT NULL CHECK(platform IN ('google_meet', 'zoom')),
      meeting_url TEXT NOT NULL,
      instructor_name TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'cancelled', 'completed')),
      cancellation_reason TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS security_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK(status IN ('SUCCESS', 'DENIED', 'WARNING')),
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_enrollments_student_course ON enrollments(student_id, course_id);
    CREATE INDEX IF NOT EXISTS idx_videos_course ON videos(course_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_progress_student_video ON video_progress(student_id, video_id);
    CREATE INDEX IF NOT EXISTS idx_documents_course ON course_documents(course_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_notes_student ON student_notes(student_id);
    CREATE INDEX IF NOT EXISTS idx_notes_video ON student_notes(student_id, video_id);
    CREATE INDEX IF NOT EXISTS idx_notes_course ON student_notes(student_id, course_id);
    CREATE INDEX IF NOT EXISTS idx_meetings_course ON meetings(course_id, start_time);
    CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status, start_time);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON security_audit_logs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON security_audit_logs(event_type, created_at);
  `;

  db.exec(initStatements);

  // Safe migration: Add missing columns if videos table already existed
  try {
    const tableInfo = db.prepare("PRAGMA table_info(videos)").all();
    const columns = new Set(tableInfo.map(c => c.name));

    if (!columns.has('video_type')) {
      db.exec("ALTER TABLE videos ADD COLUMN video_type TEXT NOT NULL DEFAULT 'youtube' CHECK(video_type IN ('youtube', 'widevine'))");
    }
    if (!columns.has('manifest_url')) {
      db.exec("ALTER TABLE videos ADD COLUMN manifest_url TEXT");
    }
    if (!columns.has('license_server_url')) {
      db.exec("ALTER TABLE videos ADD COLUMN license_server_url TEXT");
    }
  } catch (migrationErr) {
    console.warn('Database migration notice for videos table:', migrationErr.message);
  }
  } catch (err) {
    console.warn('Database init notice:', err.message);
  }

  return db;
}
