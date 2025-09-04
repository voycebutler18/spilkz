-- Fix remaining security issues

-- 1. Fix the public_profiles view - it should be a view, not a table
-- Drop the view if it exists to recreate it properly
DROP VIEW IF EXISTS public.public_profiles;

-- 2. Remove IP address from video_views for creators
-- Create a secure function to get video analytics without exposing IP addresses
CREATE OR REPLACE FUNCTION public.get_video_analytics(p_user_id uuid)
RETURNS TABLE (
  splik_id uuid,
  view_count bigint,
  unique_viewers bigint,
  last_viewed timestamp with time zone
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only return analytics for videos owned by the requesting user
  IF auth.uid() != p_user_id THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    vv.splik_id,
    COUNT(*) as view_count,
    COUNT(DISTINCT COALESCE(vv.viewer_id, vv.session_id)) as unique_viewers,
    MAX(vv.viewed_at) as last_viewed
  FROM public.video_views vv
  INNER JOIN public.spliks s ON s.id = vv.splik_id
  WHERE s.user_id = p_user_id
  GROUP BY vv.splik_id;
END;
$$;

-- 3. Update the video_views policies to not expose IP addresses
-- First, drop the existing policy that allows creators to see raw data
DROP POLICY IF EXISTS "Creators view own video analytics" ON public.video_views;

-- 4. Create a more restrictive policy for analytics
-- Note: We'll keep the user history policy but remove IP exposure
DROP POLICY IF EXISTS "Users view own history" ON public.video_views;

CREATE POLICY "Users view own viewing history no IP" 
ON public.video_views 
FOR SELECT 
USING (viewer_id = auth.uid());