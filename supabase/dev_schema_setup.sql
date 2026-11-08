-- ==============================================================================
-- PASCONX LMS & Video Portal — Complete Unified Production/Dev Schema
-- Brand: PASCONX ("Transforming Talent into IT Xperts")
-- Description: Consolidated, zero-error, end-to-end schema for Supabase.
--              Includes all tables, single-session lock, recurring meetings,
--              system maintenance mode, RLS policies, indexes, and tamper guards.
--
-- TARGET: Copy and paste this whole file into the Dev Supabase SQL Editor -> Run.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 2. UPDATED_AT TRIGGER FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. PROFILES TABLE (Maps 1:1 to auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'ADMIN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  avatar_url TEXT,
  active_session_id TEXT,
  session_last_seen TIMESTAMPTZ,
  session_device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.profiles IS 'PASCONX user profiles linked 1:1 with Supabase auth.users';
COMMENT ON COLUMN public.profiles.id IS 'References auth.users.id';
COMMENT ON COLUMN public.profiles.role IS 'Authorization role: STUDENT or ADMIN';
COMMENT ON COLUMN public.profiles.status IS 'Account status: ACTIVE or DISABLED';
COMMENT ON COLUMN public.profiles.active_session_id IS 'Random id of the ONE device currently logged in (NULL = nobody)';
COMMENT ON COLUMN public.profiles.session_last_seen IS 'Last heartbeat from the active session; lock expires if stale';
COMMENT ON COLUMN public.profiles.session_device IS 'User-agent of the active session (for admin reference)';

-- ------------------------------------------------------------------------------
-- 4. COURSES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.courses IS 'PASCONX course catalog';

-- ------------------------------------------------------------------------------
-- 5. VIDEOS TABLE
-- Supports YouTube unlisted/private, Widevine DRM, Link videos, Google Drive, VdoCipher
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.videos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_type TEXT NOT NULL DEFAULT 'youtube' CHECK (video_type IN ('youtube', 'widevine', 'link', 'google_drive', 'vdocipher')),
  provider TEXT NOT NULL DEFAULT 'youtube',
  privacy_type TEXT NOT NULL DEFAULT 'youtube_unlisted' CHECK (privacy_type IN ('youtube_unlisted', 'youtube_private', 'widevine_drm', 'link_url', 'google_drive', 'vdocipher_drm')),
  external_video_id TEXT NOT NULL,
  manifest_url TEXT,
  license_server_url TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  order_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.videos IS 'Video lessons for courses supporting YouTube, Widevine DRM, and Link streaming';

-- ------------------------------------------------------------------------------
-- 6. ENROLLMENTS TABLE (Course Access Windows)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrollments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  access_start TIMESTAMPTZ NOT NULL,
  access_expiry TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_enrollments_student_course UNIQUE (student_id, course_id),
  CONSTRAINT chk_enrollments_access_dates CHECK (access_expiry > access_start)
);

COMMENT ON TABLE public.enrollments IS 'Student course enrollments with time-bound access windows';

-- ------------------------------------------------------------------------------
-- 7. VIDEO PROGRESS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_progress (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id BIGINT NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  progress_seconds INTEGER NOT NULL DEFAULT 0 CHECK (progress_seconds >= 0),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  last_watched_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_video_progress_student_video UNIQUE (student_id, video_id)
);

COMMENT ON TABLE public.video_progress IS 'Tracks student playback progress and completion per video';

-- ------------------------------------------------------------------------------
-- 8. COURSE DOCUMENTS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (file_size_bytes >= 0),
  order_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.course_documents IS 'PDF materials and course documents metadata';

-- ------------------------------------------------------------------------------
-- 9. STUDENT NOTES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_notes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  video_id BIGINT NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp_seconds INTEGER DEFAULT NULL CHECK (timestamp_seconds IS NULL OR timestamp_seconds >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.student_notes IS 'Time-stamped notes written by students during video playback';

-- ------------------------------------------------------------------------------
-- 10. MEETINGS TABLE (Single & Recurring Live Meetings)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meetings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('google_meet', 'zoom')),
  meeting_url TEXT NOT NULL,
  instructor_name TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  cancellation_reason TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  recurrence_group_id TEXT,
  recurrence_type TEXT DEFAULT 'none' CHECK (recurrence_type IN ('none', 'daily', 'weekdays', 'weekly', 'custom')),
  recurrence_end_date TIMESTAMPTZ,
  scheduled_date DATE,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_meetings_duration CHECK (end_time > start_time)
);

COMMENT ON TABLE public.meetings IS 'Live course sessions for Google Meet and Zoom with recurrence support';

-- ------------------------------------------------------------------------------
-- 11. SECURITY AUDIT LOGS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'DENIED', 'WARNING')),
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.security_audit_logs IS 'Immutable audit trail of access attempts, logins, and playback events';

-- ------------------------------------------------------------------------------
-- 12. SYSTEM SETTINGS TABLE (Maintenance Mode & Platform Toggles)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.system_settings IS 'Platform-wide configuration and feature toggles';

-- ------------------------------------------------------------------------------
-- 13. PERFORMANCE & FOREIGN KEY INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_role_status ON public.profiles(role, status);

CREATE INDEX IF NOT EXISTS idx_courses_status ON public.courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_created_by ON public.courses(created_by);

CREATE INDEX IF NOT EXISTS idx_videos_course_order ON public.videos(course_id, order_index);
CREATE INDEX IF NOT EXISTS idx_videos_course_status ON public.videos(course_id, status);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON public.videos(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrollments_student_status ON public.enrollments(student_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_status ON public.enrollments(course_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_access_dates ON public.enrollments(access_start, access_expiry);

CREATE INDEX IF NOT EXISTS idx_progress_student_video ON public.video_progress(student_id, video_id);
CREATE INDEX IF NOT EXISTS idx_progress_video_id ON public.video_progress(video_id);

CREATE INDEX IF NOT EXISTS idx_documents_course_order ON public.course_documents(course_id, order_index);
CREATE INDEX IF NOT EXISTS idx_documents_course_status ON public.course_documents(course_id, status);

CREATE INDEX IF NOT EXISTS idx_notes_student ON public.student_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_notes_student_video ON public.student_notes(student_id, video_id);
CREATE INDEX IF NOT EXISTS idx_notes_student_course ON public.student_notes(student_id, course_id);
CREATE INDEX IF NOT EXISTS idx_notes_video ON public.student_notes(video_id);

CREATE INDEX IF NOT EXISTS idx_meetings_course_start ON public.meetings(course_id, start_time);
CREATE INDEX IF NOT EXISTS idx_meetings_status_start ON public.meetings(status, start_time);
CREATE INDEX IF NOT EXISTS idx_meetings_time_range ON public.meetings(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_meetings_recurrence_group ON public.meetings(recurrence_group_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_date ON public.meetings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_meetings_course_scheduled ON public.meetings(course_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON public.security_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_date ON public.security_audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.security_audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 14. UPDATED_AT TRIGGERS ATTACHMENT
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profiles_updated_at') THEN
    CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_courses_updated_at') THEN
    CREATE TRIGGER trg_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_videos_updated_at') THEN
    CREATE TRIGGER trg_videos_updated_at BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enrollments_updated_at') THEN
    CREATE TRIGGER trg_enrollments_updated_at BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_documents_updated_at') THEN
    CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON public.course_documents FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notes_updated_at') THEN
    CREATE TRIGGER trg_notes_updated_at BEFORE UPDATE ON public.student_notes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_meetings_updated_at') THEN
    CREATE TRIGGER trg_meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_system_settings_updated_at') THEN
    CREATE TRIGGER trg_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 15. AUTH SYNCHRONIZATION TRIGGER (auth.users -> public.profiles)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  assigned_role TEXT := 'STUDENT';
BEGIN
  -- Service role, postgres admin or users created with explicit ADMIN role in metadata
  IF (current_user IN ('postgres', 'supabase_admin', 'service_role') OR coalesce((auth.jwt() ->> 'role'), '') = 'service_role')
     AND NEW.raw_user_meta_data->>'role' = 'ADMIN' THEN
    assigned_role := 'ADMIN';
  END IF;

  INSERT INTO public.profiles (id, email, name, role, status, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    assigned_role,
    'ACTIVE',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 16. RLS SECURITY DEFINER HELPER FUNCTIONS
-- ------------------------------------------------------------------------------

-- Check if current authenticated user has active ADMIN role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'ADMIN'
      AND status = 'ACTIVE'
  );
$$;

-- Check if current authenticated user has active student enrollment for a course
CREATE OR REPLACE FUNCTION public.has_active_course_enrollment(p_course_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.profiles p ON p.id = e.student_id
    JOIN public.courses c ON c.id = e.course_id
    WHERE e.student_id = (SELECT auth.uid())
      AND e.course_id = p_course_id
      AND e.status = 'ACTIVE'
      AND c.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND now() >= e.access_start
      AND now() <= e.access_expiry
  );
$$;

-- Check if current authenticated user has active enrollment for a video
CREATE OR REPLACE FUNCTION public.has_active_video_enrollment(p_video_id BIGINT, p_course_id BIGINT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.videos v
    WHERE v.id = p_video_id
      AND (p_course_id IS NULL OR v.course_id = p_course_id)
      AND v.status = 'ACTIVE'
      AND public.has_active_course_enrollment(v.course_id)
  );
$$;

-- ------------------------------------------------------------------------------
-- 17. TAMPER GUARDS & SINGLE-SESSION GUARDS
-- Allows bypass for server service_role, postgres superuser, and admin accounts
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;
  IF coalesce((auth.jwt() ->> 'role'), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can modify account roles.';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can modify account status.';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Access Denied: Account identifier cannot be changed.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_role ON public.profiles;
CREATE TRIGGER trg_guard_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_updates();

CREATE OR REPLACE FUNCTION public.guard_session_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;
  IF coalesce((auth.jwt() ->> 'role'), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.active_session_id IS DISTINCT FROM OLD.active_session_id
     OR NEW.session_last_seen IS DISTINCT FROM OLD.session_last_seen
     OR NEW.session_device IS DISTINCT FROM OLD.session_device THEN
    RAISE EXCEPTION 'Access Denied: session lock columns are managed by the server.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_session_columns ON public.profiles;
CREATE TRIGGER trg_guard_session_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_session_columns();

-- ------------------------------------------------------------------------------
-- 18. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 19. ROW LEVEL SECURITY POLICIES
-- ------------------------------------------------------------------------------

-- ===== PROFILES POLICIES =====
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT
  USING ((SELECT auth.uid()) = id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin" ON public.profiles
  FOR UPDATE
  USING ((SELECT auth.uid()) = id OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT auth.uid()) = id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "profiles_admin_manage" ON public.profiles;
CREATE POLICY "profiles_admin_manage" ON public.profiles
  FOR ALL
  USING ((SELECT public.is_admin()));

-- ===== COURSES POLICIES =====
DROP POLICY IF EXISTS "courses_select_active_or_admin" ON public.courses;
CREATE POLICY "courses_select_active_or_admin" ON public.courses
  FOR SELECT
  USING (status = 'ACTIVE' OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "courses_admin_all" ON public.courses;
CREATE POLICY "courses_admin_all" ON public.courses
  FOR ALL
  USING ((SELECT public.is_admin()));

-- ===== VIDEOS POLICIES =====
DROP POLICY IF EXISTS "videos_select_enrolled_or_admin" ON public.videos;
CREATE POLICY "videos_select_enrolled_or_admin" ON public.videos
  FOR SELECT
  USING (
    ((SELECT public.is_admin())) OR
    (status = 'ACTIVE' AND (SELECT public.has_active_course_enrollment(course_id)))
  );

DROP POLICY IF EXISTS "videos_admin_all" ON public.videos;
CREATE POLICY "videos_admin_all" ON public.videos
  FOR ALL
  USING ((SELECT public.is_admin()));

-- ===== ENROLLMENTS POLICIES =====
DROP POLICY IF EXISTS "enrollments_select_own_or_admin" ON public.enrollments;
CREATE POLICY "enrollments_select_own_or_admin" ON public.enrollments
  FOR SELECT
  USING ((SELECT auth.uid()) = student_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "enrollments_admin_all" ON public.enrollments;
CREATE POLICY "enrollments_admin_all" ON public.enrollments
  FOR ALL
  USING ((SELECT public.is_admin()));

-- ===== VIDEO PROGRESS POLICIES =====
DROP POLICY IF EXISTS "progress_select_own_or_admin" ON public.video_progress;
CREATE POLICY "progress_select_own_or_admin" ON public.video_progress
  FOR SELECT
  USING ((SELECT auth.uid()) = student_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "progress_insert_own" ON public.video_progress;
CREATE POLICY "progress_insert_own" ON public.video_progress
  FOR INSERT
  WITH CHECK (
    ((SELECT auth.uid()) = student_id AND (SELECT public.has_active_video_enrollment(video_id))) OR
    (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS "progress_update_own" ON public.video_progress;
CREATE POLICY "progress_update_own" ON public.video_progress
  FOR UPDATE
  USING (
    ((SELECT auth.uid()) = student_id AND (SELECT public.has_active_video_enrollment(video_id))) OR
    (SELECT public.is_admin())
  )
  WITH CHECK (
    ((SELECT auth.uid()) = student_id AND (SELECT public.has_active_video_enrollment(video_id))) OR
    (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS "progress_admin_delete" ON public.video_progress;
CREATE POLICY "progress_admin_delete" ON public.video_progress
  FOR DELETE
  USING ((SELECT public.is_admin()));

-- ===== COURSE DOCUMENTS POLICIES =====
DROP POLICY IF EXISTS "documents_select_enrolled_or_admin" ON public.course_documents;
CREATE POLICY "documents_select_enrolled_or_admin" ON public.course_documents
  FOR SELECT
  USING (
    ((SELECT public.is_admin())) OR
    (status = 'ACTIVE' AND (SELECT public.has_active_course_enrollment(course_id)))
  );

DROP POLICY IF EXISTS "documents_admin_all" ON public.course_documents;
CREATE POLICY "documents_admin_all" ON public.course_documents
  FOR ALL
  USING ((SELECT public.is_admin()));

-- ===== STUDENT NOTES POLICIES =====
DROP POLICY IF EXISTS "notes_select_own_or_admin" ON public.student_notes;
CREATE POLICY "notes_select_own_or_admin" ON public.student_notes
  FOR SELECT
  USING ((SELECT auth.uid()) = student_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "notes_insert_own" ON public.student_notes;
CREATE POLICY "notes_insert_own" ON public.student_notes
  FOR INSERT
  WITH CHECK (
    ((SELECT auth.uid()) = student_id AND (SELECT public.has_active_video_enrollment(video_id, course_id))) OR
    (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS "notes_update_own" ON public.student_notes;
CREATE POLICY "notes_update_own" ON public.student_notes
  FOR UPDATE
  USING ((SELECT auth.uid()) = student_id OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT auth.uid()) = student_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "notes_delete_own_or_admin" ON public.student_notes;
CREATE POLICY "notes_delete_own_or_admin" ON public.student_notes
  FOR DELETE
  USING ((SELECT auth.uid()) = student_id OR (SELECT public.is_admin()));

-- ===== MEETINGS POLICIES =====
DROP POLICY IF EXISTS "meetings_select_enrolled_or_admin" ON public.meetings;
CREATE POLICY "meetings_select_enrolled_or_admin" ON public.meetings
  FOR SELECT
  USING (
    ((SELECT public.is_admin())) OR
    ((SELECT public.has_active_course_enrollment(course_id)))
  );

DROP POLICY IF EXISTS "meetings_admin_all" ON public.meetings;
CREATE POLICY "meetings_admin_all" ON public.meetings
  FOR ALL
  USING ((SELECT public.is_admin()));

-- ===== SECURITY AUDIT LOGS POLICIES =====
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.security_audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.security_audit_logs
  FOR SELECT
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.security_audit_logs;
CREATE POLICY "audit_logs_insert_authenticated" ON public.security_audit_logs
  FOR INSERT
  WITH CHECK (
    ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid())) OR
    ((SELECT auth.uid()) IS NULL AND user_id IS NULL) OR
    (SELECT public.is_admin())
  );

-- ===== SYSTEM SETTINGS POLICIES =====
DROP POLICY IF EXISTS "Allow public read access to system_settings" ON public.system_settings;
CREATE POLICY "Allow public read access to system_settings"
  ON public.system_settings
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow admins to modify system_settings" ON public.system_settings;
CREATE POLICY "Allow admins to modify system_settings"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ------------------------------------------------------------------------------
-- 20. ROLES & POSTGREST PERMISSIONS (DATA API EXPOSURE)
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 21. SEED DEFAULT SYSTEM SETTINGS
-- ------------------------------------------------------------------------------
INSERT INTO public.system_settings (key, value, description)
VALUES (
  'maintenance_mode',
  '{
    "enabled": false,
    "title": "We''re Under Maintenance",
    "message": "Our platform is currently undergoing scheduled maintenance to improve performance, security and your learning experience."
  }'::jsonb,
  'Controls whether student access is suspended during system maintenance'
)
ON CONFLICT (key) DO NOTHING;
