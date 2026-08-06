CREATE POLICY "Anyone can view active announcements" ON public.announcements FOR SELECT TO anon USING (active = true);
GRANT SELECT ON public.announcements TO anon;