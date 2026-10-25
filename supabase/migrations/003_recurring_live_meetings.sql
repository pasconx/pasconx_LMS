-- ==============================================================================
-- PASCONX LMS — Migration 003: Recurring Live Meetings
-- Adds recurrence columns and indexes to meetings table
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Safe to run more than once (idempotent).
-- ==============================================================================

-- 1. Recurrence columns on meetings table
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS recurrence_group_id TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS recurrence_type TEXT DEFAULT 'none';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS recurrence_end_date TIMESTAMPTZ;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Kolkata';

-- 2. Recurrence type check constraint (drop first if exists to ensure idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_meetings_recurrence_type'
  ) THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT chk_meetings_recurrence_type
      CHECK (recurrence_type IN ('none', 'daily', 'weekdays', 'weekly', 'custom'));
  END IF;
END $$;

-- 3. Comments
COMMENT ON COLUMN public.meetings.recurrence_group_id IS 'UUID/series ID grouping all meetings generated from the same recurring schedule';
COMMENT ON COLUMN public.meetings.recurrence_type IS 'none (one-time), daily, weekdays (Mon-Fri), weekly, or custom';
COMMENT ON COLUMN public.meetings.recurrence_end_date IS 'Inclusive end date of the recurring series';
COMMENT ON COLUMN public.meetings.scheduled_date IS 'Calendar date of this specific session in IST (YYYY-MM-DD)';
COMMENT ON COLUMN public.meetings.timezone IS 'Timezone for class scheduling (default Asia/Kolkata)';

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_meetings_recurrence_group ON public.meetings(recurrence_group_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_date ON public.meetings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_meetings_course_scheduled ON public.meetings(course_id, scheduled_date);
