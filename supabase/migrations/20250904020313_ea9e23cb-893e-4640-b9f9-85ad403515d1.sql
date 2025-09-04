-- Refresh the schema cache by running a simple query
SELECT 
  s.id,
  s.user_id,
  s.title,
  p.username,
  p.display_name
FROM public.spliks s
LEFT JOIN public.profiles p ON s.user_id = p.id
LIMIT 1;