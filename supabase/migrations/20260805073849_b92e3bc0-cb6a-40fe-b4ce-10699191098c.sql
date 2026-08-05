-- 1) new role value
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';

-- 2) base date on products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_date date NOT NULL DEFAULT CURRENT_DATE;
UPDATE public.products SET base_date = created_at::date WHERE base_date IS NULL OR base_date = CURRENT_DATE;
CREATE INDEX IF NOT EXISTS products_base_date_idx ON public.products (base_date DESC);
CREATE INDEX IF NOT EXISTS products_base_idx ON public.products (base);

-- 3) superadmin helper (text compare so it works in the same transaction as the enum add)
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'superadmin'
  );
$$;

-- 4) only superadmins may manage the superadmin role; granting it also grants admin
CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role app_role, _grant boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') AND NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _role::text = 'superadmin' AND NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _grant THEN
    INSERT INTO user_roles (user_id, role) VALUES (_user_id, _role) ON CONFLICT (user_id, role) DO NOTHING;
    IF _role::text = 'superadmin' THEN
      INSERT INTO user_roles (user_id, role)
      VALUES (_user_id, 'admin'::app_role) ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  ELSE
    DELETE FROM user_roles WHERE user_id = _user_id AND role = _role;
  END IF;
END;
$$;

-- 5) raw card data readable by superadmins only
DROP POLICY IF EXISTS "Admins manage keys" ON public.product_keys;

CREATE POLICY "Superadmins read keys"
  ON public.product_keys FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

CREATE POLICY "Admins insert keys"
  ON public.product_keys FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR public.is_superadmin(auth.uid()));

CREATE POLICY "Admins update keys"
  ON public.product_keys FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR public.is_superadmin(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR public.is_superadmin(auth.uid()));

CREATE POLICY "Admins delete keys"
  ON public.product_keys FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR public.is_superadmin(auth.uid()));