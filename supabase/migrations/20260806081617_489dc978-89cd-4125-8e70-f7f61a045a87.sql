DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for users created without one
INSERT INTO public.profiles (id, username, email)
SELECT u.id,
       COALESCE(NULLIF(u.raw_user_meta_data ->> 'username', ''), split_part(u.email, '@', 1), 'user') || '_' || substr(u.id::text, 1, 4),
       u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Backfill buyer role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'buyer'::app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'buyer'::app_role
WHERE r.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;