-- 1. Temporarily disable trigger so the admin update succeeds instantly
ALTER TABLE public.profiles DISABLE TRIGGER trg_guard_profile_role;

-- 2. Promote admin account to ADMIN role
UPDATE public.profiles SET role = 'ADMIN' WHERE email = 'admin@pasconx.com';

-- 3. Update guard_profile_updates function with complete bypass for postgres, supabase_admin, and service_role
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

-- 4. Update guard_session_columns function with complete bypass for postgres, supabase_admin, and service_role
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

-- 5. Re-enable trigger
ALTER TABLE public.profiles ENABLE TRIGGER trg_guard_profile_role;
