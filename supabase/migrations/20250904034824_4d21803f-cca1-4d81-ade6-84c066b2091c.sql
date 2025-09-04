-- Create RPC function to get user favorites
CREATE OR REPLACE FUNCTION get_user_favorites(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  splik_id UUID,
  created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT f.id, f.splik_id, f.created_at
  FROM favorites f
  WHERE f.user_id = p_user_id
  ORDER BY f.created_at DESC;
END;
$$;