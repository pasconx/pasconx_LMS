-- ==============================================================================
-- PASCONX LMS — Migration 002
-- 1) Single active session per student (login lock)
-- 2) Allow "link" videos (any video URL: Drive / Vimeo / MP4 / HLS / other)
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Safe to run more than once.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SINGLE-SESSION COLUMNS ON PROFILES
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_session_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS session_last_seen TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS session_device TEXT;

COMMENT ON COLUMN public.profiles.active_session_id IS 'Random id of the ONE device currently logged in (NULL = nobody)';
COMMENT ON COLUMN public.profiles.session_last_seen IS 'Last heartbeat from the active session; lock expires if stale';
COMMENT ON COLUMN public.profiles.session_device IS 'User-agent of the active session (for admin reference)';

-- Students must never be able to read/modify their own lock columns from the browser.
-- The Node server uses the service_role key (bypasses RLS) so it is unaffected.
-- Block direct client updates of these columns:
CREATE OR REPLACE FUNCTION public.guard_session_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_user != 'service_role' AND NOT public.is_admin() THEN
    IF NEW.active_session_id IS DISTINCT FROM OLD.active_session_id
       OR NEW.session_last_seen IS DISTINCT FROM OLD.session_last_seen
       OR NEW.session_device IS DISTINCT FROM OLD.session_device THEN
      RAISE EXCEPTION 'Access Denied: session lock columns are managed by the server.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_session_columns ON public.profiles;
CREATE TRIGGER trg_guard_session_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_session_columns();

-- ------------------------------------------------------------------------------
-- 2. VIDEOS: allow video_type = 'link' and privacy_type = 'link_url'
--    (drops whatever old CHECK constraints exist on those two columns, then re-adds wider ones)
-- ------------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.videos'::regclass
      AND contype = 'c'
      AND (pg_get_constraintdef(oid) ILIKE '%video_type%'
           OR pg_get_constraintdef(oid) ILIKE '%privacy_type%')
  LOOP
    EXECUTE format('ALTER TABLE public.videos DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- NOT VALID => existing rows are not re-checked (safe if older rows use other values, e.g. google_drive)
ALTER TABLE public.videos
  ADD CONSTRAINT videos_video_type_check
  CHECK (video_type IN ('youtube', 'widevine', 'link', 'google_drive', 'vdocipher')) NOT VALID;

ALTER TABLE public.videos
  ADD CONSTRAINT videos_privacy_type_check
  CHECK (privacy_type IN ('youtube_unlisted', 'youtube_private', 'widevine_drm', 'link_url', 'google_drive', 'vdocipher_drm')) NOT VALID;

-- ------------------------------------------------------------------------------
-- 3. Index for the "Recorded Videos" page (newest first)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON public.videos (created_at DESC);
