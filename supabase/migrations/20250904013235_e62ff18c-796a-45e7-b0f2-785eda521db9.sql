-- Update video_views table to track view count per session
ALTER TABLE public.video_views ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 1;

-- Drop the existing unique constraint if it exists
ALTER TABLE public.video_views DROP CONSTRAINT IF EXISTS video_views_splik_id_session_id_key;

-- Create a new function for incrementing views with a 5-view limit per session
CREATE OR REPLACE FUNCTION public.increment_view_with_limit(
  p_splik_id UUID,
  p_session_id TEXT,
  p_viewer_id UUID DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_current_count INTEGER;
  v_new_view_added BOOLEAN := FALSE;
BEGIN
  -- Check current view count for this session
  SELECT view_count INTO v_current_count
  FROM public.video_views 
  WHERE splik_id = p_splik_id 
  AND session_id = p_session_id;
  
  IF v_current_count IS NULL THEN
    -- First view from this session
    INSERT INTO public.video_views (splik_id, viewer_id, ip_address, session_id, view_count)
    VALUES (p_splik_id, p_viewer_id, p_ip_address, p_session_id, 1);
    
    -- Increment the view count on spliks table
    UPDATE public.spliks 
    SET views = COALESCE(views, 0) + 1 
    WHERE id = p_splik_id;
    
    v_new_view_added := TRUE;
    
  ELSIF v_current_count < 5 THEN
    -- Under 5 views, increment both tables
    UPDATE public.video_views 
    SET view_count = view_count + 1,
        viewed_at = NOW()
    WHERE splik_id = p_splik_id 
    AND session_id = p_session_id;
    
    -- Increment the view count on spliks table
    UPDATE public.spliks 
    SET views = COALESCE(views, 0) + 1 
    WHERE id = p_splik_id;
    
    v_new_view_added := TRUE;
  END IF;
  
  -- Return current view count
  SELECT views INTO v_result FROM public.spliks WHERE id = p_splik_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'new_view', v_new_view_added,
    'view_count', COALESCE((SELECT views FROM public.spliks WHERE id = p_splik_id), 0),
    'session_views', COALESCE(v_current_count + 1, 1)
  );
END;
$$;

-- Enable realtime for spliks table
ALTER PUBLICATION supabase_realtime ADD TABLE public.spliks;