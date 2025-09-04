-- Fix Critical Security Issues

-- 1. PROFILES TABLE: Protect sensitive personal information
-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "View profiles based on privacy settings" ON public.profiles;
DROP POLICY IF EXISTS "View own full profile" ON public.profiles;
DROP POLICY IF EXISTS "View public profile information" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Create new secure policies
-- Policy 1: Users can always see their own full profile
CREATE POLICY "Users can view own full profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Policy 2: Others can only see limited profile info based on privacy settings
CREATE POLICY "Others view limited profile info" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() != id AND (
    -- Public profiles are viewable
    is_private = false 
    OR 
    -- Private profiles only if following
    (is_private = true AND EXISTS (
      SELECT 1 FROM public.followers 
      WHERE followers.follower_id = auth.uid() 
      AND followers.following_id = profiles.id
    ))
  )
);

-- 2. VIDEO_VIEWS TABLE: Restrict analytics data access
-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Anyone can view views" ON public.video_views;
DROP POLICY IF EXISTS "Creators can view analytics for own videos" ON public.video_views;
DROP POLICY IF EXISTS "Users can view own viewing history" ON public.video_views;

-- Only video creators can see analytics for their videos
CREATE POLICY "Creators view own video analytics" 
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
CREATE POLICY "Users view own history" 
ON public.video_views 
FOR SELECT 
USING (viewer_id = auth.uid());

-- 3. Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_video_views_viewer_id ON public.video_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_video_views_splik_id ON public.video_views(splik_id);
CREATE INDEX IF NOT EXISTS idx_followers_follower_following ON public.followers(follower_id, following_id);

-- 4. Create a secure view that automatically filters sensitive data
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles AS
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
  updated_at,
  -- Sensitive fields only visible to profile owner
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
FROM public.profiles
WHERE 
  -- Apply the same visibility rules as the RLS policies
  auth.uid() = id 
  OR is_private = false 
  OR (is_private = true AND EXISTS (
    SELECT 1 FROM public.followers 
    WHERE followers.follower_id = auth.uid() 
    AND followers.following_id = profiles.id
  ));

-- Grant permissions
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;