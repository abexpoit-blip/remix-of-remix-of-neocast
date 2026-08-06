-- Adds the superadmin role to an existing self-hosted database.
-- Safe to run multiple times.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'superadmin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated, service_role;
