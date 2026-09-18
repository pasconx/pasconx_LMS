-- ==============================================================================
-- PASCONX LMS & Video Portal — Stage 1 Supabase Database Migration
-- Brand: PASCONX ("Transforming Talent into IT Xperts")
-- File: supabase/migrations/001_initial_pasconx_schema.sql
-- Description: Complete production PostgreSQL schema, indexes, RLS policies, 
--              tamper-proof security triggers, and security definer functions.
-- Mode: PREPARATION ONLY — NOT EXECUTED YET
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
-- Passwords and credentials live exclusively in auth.users.
-- Application profile, authorization roles, and account status live in public.profiles.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'ADMIN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.profiles IS 'PASCONX user profiles linked 1:1 with Supabase auth.users';
COMMENT ON COLUMN public.profiles.id IS 'References auth.users.id';
COMMENT ON COLUMN public.profiles.role IS 'Authorization role: STUDENT or ADMIN';
COMMENT ON COLUMN public.profiles.status IS 'Account status: ACTIVE or DISABLED';

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
-- ------------------------------------------------------------------------------
-- Preserves existing player architectures: YouTube unlisted/private and Widevine DRM streaming.
CREATE TABLE IF NOT EXISTS public.videos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_type TEXT NOT NULL DEFAULT 'youtube' CHECK (video_type IN ('youtube', 'widevine')),
  provider TEXT NOT NULL DEFAULT 'youtube',
  privacy_type TEXT NOT NULL DEFAULT 'youtube_unlisted' CHECK (privacy_type IN ('youtube_unlisted', 'youtube_private', 'widevine_drm')),
  external_video_id TEXT NOT NULL,
  manifest_url TEXT,
  license_server_url TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  order_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.videos IS 'Video lessons for courses supporting YouTube & Widevine DRM streaming';

-- ------------------------------------------------------------------------------
-- 6. ENROLLMENTS TABLE (Course Access Windows)
-- ------------------------------------------------------------------------------
-- Uses ON DELETE RESTRICT on course_id to prevent accidental deletion of courses with active students.
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
-- 10. MEETINGS TABLE (Google Meet & Zoom Sessions)
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_meetings_duration CHECK (end_time > start_time)
);

COMMENT ON TABLE public.meetings IS 'Live course sessions for Google Meet and Zoom';

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
-- 12. PERFORMANCE & FOREIGN KEY INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_role_status ON public.profiles(role, status);

CREATE INDEX IF NOT EXISTS idx_courses_status ON public.courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_created_by ON public.courses(created_by);

CREATE INDEX IF NOT EXISTS idx_videos_course_order ON public.videos(course_id, order_index);
CREATE INDEX IF NOT EXISTS idx_videos_course_status ON public.videos(course_id, status);

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

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON public.security_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_date ON public.security_audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.security_audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 13. UPDATED_AT TRIGGERS ATTACHMENT
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
END $$;

-- ------------------------------------------------------------------------------
-- 14. AUTH SYNCHRONIZATION TRIGGER (auth.users -> public.profiles)
-- ------------------------------------------------------------------------------
-- Prevents privilege escalation: client metadata can NEVER set role = 'ADMIN'.
-- Admin accounts must be created through admin tools or server-side service_role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  assigned_role TEXT := 'STUDENT';
BEGIN
  -- Only service_role or admin process can assign an initial role other than STUDENT
  IF current_user = 'service_role' AND NEW.raw_user_meta_data->>'role' = 'ADMIN' THEN
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
-- 15. RLS SECURITY DEFINER HELPER FUNCTIONS
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
-- Timestamps are compared directly in UTC (TIMESTAMPTZ >= TIMESTAMPTZ)
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
-- Optionally validates that the video belongs to the expected course
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
-- 16. TAMPER GUARDS (Prevents Privilege Escalation by Students)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- If not an admin and not service_role, prohibit tampering with role or status or id
  IF current_user != 'service_role' AND NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Access Denied: Only administrators can modify account roles.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Access Denied: Only administrators can modify account status.';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Access Denied: Account identifier cannot be changed.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_role ON public.profiles;
CREATE TRIGGER trg_guard_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_updates();

-- ------------------------------------------------------------------------------
-- 17. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
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

-- ------------------------------------------------------------------------------
-- 18. ROW LEVEL SECURITY POLICIES
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

-- No UPDATE or DELETE policies on security_audit_logs to guarantee complete immutability.
