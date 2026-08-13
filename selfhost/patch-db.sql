-- NeoCast — idempotent database patch for the self-hosted backend.
-- Brings an older self-hosted database up to the current app schema:
--   * card upload columns on products
--   * product_keys admin policies
--   * redeem code system (table + redeem_code function)
--   * crypto deposit columns + settle/expire functions
--   * superadmin role + helper
-- Safe to run any number of times.

BEGIN;

/* ---------- superadmin role + helper ---------- */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'app_role' AND e.enumlabel = 'superadmin'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'superadmin';
  END IF;
END $$;

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id AND role::text = 'superadmin'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated, service_role;

/* ---------- products: card metadata columns ---------- */
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compare_at_price numeric,
  ADD COLUMN IF NOT EXISTS bin text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS base text,
  ADD COLUMN IF NOT EXISTS exp_month text,
  ADD COLUMN IF NOT EXISTS exp_year text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip text,
  ADD COLUMN IF NOT EXISTS has_phone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refundable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS base_date date NOT NULL DEFAULT CURRENT_DATE;

GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

/* ---------- product_keys: admin write policies ---------- */
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_keys TO authenticated;
GRANT ALL ON public.product_keys TO service_role;

DROP POLICY IF EXISTS "Admins insert keys" ON public.product_keys;
CREATE POLICY "Admins insert keys" ON public.product_keys FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins update keys" ON public.product_keys;
CREATE POLICY "Admins update keys" ON public.product_keys FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_superadmin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins delete keys" ON public.product_keys;
CREATE POLICY "Admins delete keys" ON public.product_keys FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Buyers view own purchased keys" ON public.product_keys;
CREATE POLICY "Buyers view own purchased keys" ON public.product_keys FOR SELECT TO authenticated
  USING (sold_to = auth.uid());

DROP POLICY IF EXISTS "Superadmins read keys" ON public.product_keys;
CREATE POLICY "Superadmins read keys" ON public.product_keys FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

/* keep products.stock in sync with unsold keys */
CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pid uuid;
BEGIN
  _pid := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE public.products p SET stock = (
    SELECT count(*) FROM public.product_keys k WHERE k.product_id = _pid AND k.is_sold = false
  ) WHERE p.id = _pid;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_keys_stock ON public.product_keys;
CREATE TRIGGER trg_keys_stock AFTER INSERT OR UPDATE OR DELETE ON public.product_keys
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock();

/* ---------- redeem codes ---------- */
CREATE TABLE IF NOT EXISTS public.redeem_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  amount numeric NOT NULL,
  note text,
  created_by uuid,
  used_by uuid,
  used_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS redeem_codes_code_key ON public.redeem_codes (upper(code));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.redeem_codes TO authenticated;
GRANT ALL ON public.redeem_codes TO service_role;
ALTER TABLE public.redeem_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage redeem codes" ON public.redeem_codes;
CREATE POLICY "Admins manage redeem codes" ON public.redeem_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Users view own redeemed codes" ON public.redeem_codes;
CREATE POLICY "Users view own redeemed codes" ON public.redeem_codes FOR SELECT TO authenticated
  USING (used_by = auth.uid());

DROP TRIGGER IF EXISTS trg_redeem_codes_updated ON public.redeem_codes;
CREATE TRIGGER trg_redeem_codes_updated BEFORE UPDATE ON public.redeem_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.redeem_code(_code text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _r RECORD;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _code IS NULL OR length(btrim(_code)) = 0 THEN RAISE EXCEPTION 'invalid_code'; END IF;

  SELECT * INTO _r FROM public.redeem_codes
   WHERE upper(code) = upper(btrim(_code)) FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF _r.active = false THEN RAISE EXCEPTION 'code_disabled'; END IF;
  IF _r.used_by IS NOT NULL THEN RAISE EXCEPTION 'code_already_used'; END IF;

  UPDATE public.redeem_codes SET used_by = _uid, used_at = now(), active = false WHERE id = _r.id;
  UPDATE public.profiles SET balance = balance + _r.amount WHERE id = _uid;
  INSERT INTO public.balance_transactions (user_id, amount, kind, description)
  VALUES (_uid, _r.amount, 'redeem', 'Redeem code ' || _r.code);

  RETURN _r.amount;
END $$;
GRANT EXECUTE ON FUNCTION public.redeem_code(text) TO authenticated, service_role;

/* ---------- crypto deposits ---------- */
ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS invoice_id text,
  ADD COLUMN IF NOT EXISTS wallet_address text,
  ADD COLUMN IF NOT EXISTS crypto_amount text,
  ADD COLUMN IF NOT EXISTS crypto_currency text,
  ADD COLUMN IF NOT EXISTS confirmations integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS txid text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS fee_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charged_amount numeric,
  ADD COLUMN IF NOT EXISTS invoice_url text,
  ADD COLUMN IF NOT EXISTS tx_url text,
  ADD COLUMN IF NOT EXISTS received_amount text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS deposits_invoice_id_key ON public.deposits (invoice_id) WHERE invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.settle_crypto_deposit(
  _invoice_id text, _status text, _confirmations integer DEFAULT 0, _txid text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d RECORD;
BEGIN
  SELECT * INTO _d FROM public.deposits WHERE invoice_id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  UPDATE public.deposits
     SET confirmations = GREATEST(COALESCE(_confirmations,0), deposits.confirmations),
         txid = COALESCE(_txid, deposits.txid)
   WHERE id = _d.id;

  IF _d.status = 'approved' THEN RETURN 'already_approved'; END IF;

  IF _status = 'approved' THEN
    UPDATE public.profiles SET balance = balance + _d.amount WHERE id = _d.user_id;
    INSERT INTO public.balance_transactions (user_id, amount, kind, description)
    VALUES (_d.user_id, _d.amount, 'deposit', 'Crypto deposit confirmed');
    UPDATE public.deposits SET status = 'approved' WHERE id = _d.id;
    RETURN 'approved';
  ELSIF _status IN ('rejected','expired','cancelled') THEN
    UPDATE public.deposits SET status = 'rejected' WHERE id = _d.id;
    RETURN 'rejected';
  END IF;

  RETURN 'pending';
END $$;
REVOKE ALL ON FUNCTION public.settle_crypto_deposit(text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_crypto_deposit(text, text, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_stale_deposits()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.deposits
     SET status = 'rejected',
         admin_note = COALESCE(admin_note, 'Expired: not paid within window')
   WHERE status = 'pending' AND method = 'crypto'
     AND expires_at IS NOT NULL AND expires_at < now();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.expire_stale_deposits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_deposits() TO service_role;

/* ---------- support links ---------- */
INSERT INTO public.site_settings (key, value) VALUES
  ('support_telegram', '@neocastofficial'),
  ('support_telegram_channel', 'https://t.me/neocastcc')
ON CONFLICT (key) DO NOTHING;

COMMIT;
