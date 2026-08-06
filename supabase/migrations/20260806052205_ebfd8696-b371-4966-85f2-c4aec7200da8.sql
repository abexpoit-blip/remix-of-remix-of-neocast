CREATE TABLE public.redeem_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  created_by uuid,
  used_by uuid,
  used_at timestamp with time zone,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.redeem_codes TO authenticated;
GRANT ALL ON public.redeem_codes TO service_role;

ALTER TABLE public.redeem_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage redeem codes" ON public.redeem_codes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users view own redeemed codes" ON public.redeem_codes
  FOR SELECT TO authenticated
  USING (used_by = auth.uid());

CREATE TRIGGER trg_redeem_codes_updated
  BEFORE UPDATE ON public.redeem_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.redeem_code(_code text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _r RECORD;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _code IS NULL OR length(btrim(_code)) = 0 THEN RAISE EXCEPTION 'invalid_code'; END IF;

  SELECT * INTO _r FROM redeem_codes
   WHERE upper(code) = upper(btrim(_code)) FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF _r.active = false THEN RAISE EXCEPTION 'code_disabled'; END IF;
  IF _r.used_by IS NOT NULL THEN RAISE EXCEPTION 'code_already_used'; END IF;

  UPDATE redeem_codes SET used_by = _uid, used_at = now(), active = false WHERE id = _r.id;
  UPDATE profiles SET balance = balance + _r.amount WHERE id = _uid;
  INSERT INTO balance_transactions (user_id, amount, kind, description)
  VALUES (_uid, _r.amount, 'redeem', 'Redeem code ' || _r.code);

  RETURN _r.amount;
END;
$$;