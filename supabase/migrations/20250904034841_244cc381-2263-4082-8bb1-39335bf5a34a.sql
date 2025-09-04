-- Fix search path for the function
DROP FUNCTION IF EXISTS get_user_favorites(UUID);

CREATE OR REPLACE FUNCTION public.get_user_favorites(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  splik_id UUID,
  created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT f.id, f.splik_id, f.created_at
  FROM public.favorites f
  WHERE f.user_id = p_user_id
  ORDER BY f.created_at DESC;
END;
$$;