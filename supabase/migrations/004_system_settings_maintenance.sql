-- ==============================================================================
-- PASCONX LMS & Video Portal — Migration 004
-- Feature: Platform System Settings & Maintenance Mode
-- File: supabase/migrations/004_system_settings_maintenance.sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.system_settings IS 'Platform-wide configuration and feature toggles';

-- Enable Row Level Security
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read access to system_settings so students and visitors can check maintenance status
DROP POLICY IF EXISTS "Allow public read access to system_settings" ON public.system_settings;
CREATE POLICY "Allow public read access to system_settings"
  ON public.system_settings
  FOR SELECT
  USING (true);

-- Allow only administrators to update or insert system_settings
DROP POLICY IF EXISTS "Allow admins to modify system_settings" ON public.system_settings;
CREATE POLICY "Allow admins to modify system_settings"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- Seed initial maintenance_mode record (disabled by default)
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
