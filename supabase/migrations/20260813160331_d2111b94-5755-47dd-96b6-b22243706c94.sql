CREATE INDEX IF NOT EXISTS products_active_brand_base_date_idx
  ON public.products (active, brand, base_date DESC);

INSERT INTO public.site_settings (key, value) VALUES
  ('deposit_fee_percent', '0'),
  ('deposit_fee_flat', '0'),
  ('deposit_fee_mode', 'add')
ON CONFLICT (key) DO NOTHING;