-- Create a table to track individual views with IP/session tracking
CREATE TABLE IF NOT EXISTS public.video_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  splik_id UUID NOT NULL REFERENCES public.spliks(id) ON DELETE CASCADE,
  viewer_id UUID, -- Can be null for anonymous viewers
  ip_address TEXT,
  session_id TEXT NOT NULL, -- Browser session to prevent duplicate views on refresh
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(splik_id, session_id) -- Prevent duplicate views from same session
);

-- Enable RLS on video_views
ALTER TABLE public.video_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert views (for tracking)
CREATE POLICY "Anyone can insert views" 
ON public.video_views 
FOR INSERT 
WITH CHECK (true);

-- Anyone can view view records
CREATE POLICY "Anyone can view views" 
ON public.video_views 
FOR SELECT 
USING (true);

-- Create function to increment view count with session tracking
CREATE OR REPLACE FUNCTION public.increment_view_with_session(
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
  v_is_new_view BOOLEAN;
BEGIN
  -- Check if this session has already viewed this video
  SELECT NOT EXISTS (
    SELECT 1 FROM public.video_views 
    WHERE splik_id = p_splik_id 
    AND session_id = p_session_id
  ) INTO v_is_new_view;
  
  IF v_is_new_view THEN
    -- Insert new view record
    INSERT INTO public.video_views (splik_id, viewer_id, ip_address, session_id)
    VALUES (p_splik_id, p_viewer_id, p_ip_address, p_session_id)
    ON CONFLICT (splik_id, session_id) DO NOTHING;
    
    -- Increment the view count on spliks table
    UPDATE public.spliks 
    SET views = COALESCE(views, 0) + 1 
    WHERE id = p_splik_id
    RETURNING views INTO v_result;
    
    RETURN jsonb_build_object(
      'success', true,
      'new_view', true,
      'view_count', (SELECT views FROM public.spliks WHERE id = p_splik_id)
    );
  ELSE
    -- Return existing view count without incrementing
    RETURN jsonb_build_object(
      'success', true,
      'new_view', false,
      'view_count', (SELECT views FROM public.spliks WHERE id = p_splik_id)
    );
  END IF;
END;
$$;

-- Enable realtime for spliks table to track view updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.spliks;

-- Set up REPLICA IDENTITY FULL for real-time updates
ALTER TABLE public.spliks REPLICA IDENTITY FULL;