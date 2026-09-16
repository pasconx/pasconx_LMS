import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_URL 
  ? path.resolve(process.cwd(), process.env.DATABASE_URL)
  : path.resolve(__dirname, '../../data/pasconix.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better concurrency and integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
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
      provider TEXT NOT NULL DEFAULT 'google_drive',
      video_provider TEXT DEFAULT 'google_drive',
      privacy_type TEXT NOT NULL DEFAULT 'google_drive_preview',
      external_video_id TEXT,
      drive_file_id TEXT,
      duration_seconds INTEGER DEFAULT 0,
      duration TEXT,
      thumbnail TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON security_audit_logs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON security_audit_logs(event_type, created_at);
  `;

  db.exec(initStatements);

  // Safe schema migrations for existing databases
  try {
    const columns = db.pragma('table_info(videos)').map(c => c.name);
    if (!columns.includes('drive_file_id')) {
      db.exec(`ALTER TABLE videos ADD COLUMN drive_file_id TEXT;`);
    }
    if (!columns.includes('video_provider')) {
      db.exec(`ALTER TABLE videos ADD COLUMN video_provider TEXT DEFAULT 'google_drive';`);
    }
    if (!columns.includes('thumbnail')) {
      db.exec(`ALTER TABLE videos ADD COLUMN thumbnail TEXT;`);
    }
    if (!columns.includes('duration')) {
      db.exec(`ALTER TABLE videos ADD COLUMN duration TEXT;`);
    }
  } catch (err) {
    console.warn('Database schema migration note:', err.message);
  }

  return db;
}
