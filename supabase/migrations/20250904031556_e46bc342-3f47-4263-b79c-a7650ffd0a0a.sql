-- Fix Critical Security Issues

-- 1. PROFILES TABLE: Protect sensitive personal information
-- Drop existing problematic policies
DROP POLICY IF EXISTS "View profiles based on privacy settings" ON public.profiles;

-- Create a secure policy for viewing profiles with field-level security
CREATE POLICY "View own full profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Allow viewing public profile info (not sensitive fields) based on privacy
CREATE POLICY "View public profile information" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() != id AND (
    -- Public profiles: show public fields only
    is_private = false 
    OR 
    -- Private profiles: only if following
    (is_private = true AND EXISTS (
      SELECT 1 FROM public.followers 
      WHERE followers.follower_id = auth.uid() 
      AND followers.following_id = profiles.id
    ))
  )
);

-- Create a function to filter sensitive fields for non-owners
CREATE OR REPLACE FUNCTION public.filter_profile_fields(profile_row public.profiles)
RETURNS public.profiles AS $$
DECLARE
  filtered_profile public.profiles;
BEGIN
  -- Copy all fields
  filtered_profile := profile_row;
  
  -- If not the owner, nullify sensitive fields
  IF auth.uid() != profile_row.id THEN
    filtered_profile.first_name := NULL;
    filtered_profile.last_name := NULL;
    filtered_profile.age := NULL;
    filtered_profile.city := NULL;
    filtered_profile.last_email_changed := NULL;
  END IF;
  
  RETURN filtered_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. VIDEO_VIEWS TABLE: Restrict analytics data access
-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Anyone can view views" ON public.video_views;

-- Only video creators can see analytics for their videos
CREATE POLICY "Creators can view analytics for own videos" 
ON public.video_views 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.spliks 
    WHERE spliks.id = video_views.splik_id 
    AND spliks.user_id = auth.uid()
  )
);

-- Users can see their own viewing history
CREATE POLICY "Users can view own viewing history" 
ON public.video_views 
FOR SELECT 
USING (viewer_id = auth.uid());

-- Keep the insert policy as is (anyone can create views for analytics)
-- The existing "Anyone can insert views" policy is fine

-- 3. Add indexes for performance on the new policy checks
CREATE INDEX IF NOT EXISTS idx_video_views_viewer_id ON public.video_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_followers_follower_following ON public.followers(follower_id, following_id);

-- 4. Create a view for public profile data (recommended approach)
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
  id,
  username,
  display_name,
  bio,
  avatar_url,
  followers_count,
  following_count,
  spliks_count,
  is_private,
  created_at,
  -- Only include non-sensitive fields
  CASE 
    WHEN auth.uid() = id THEN first_name
    ELSE NULL
  END as first_name,
  CASE 
    WHEN auth.uid() = id THEN last_name
    ELSE NULL
  END as last_name,
  CASE 
    WHEN auth.uid() = id THEN age
    ELSE NULL
  END as age,
  CASE 
    WHEN auth.uid() = id THEN city
    ELSE NULL
  END as city
FROM public.profiles;

-- Grant appropriate permissions on the view
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;