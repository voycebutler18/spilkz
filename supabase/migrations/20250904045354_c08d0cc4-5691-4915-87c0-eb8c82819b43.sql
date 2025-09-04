-- Update profiles RLS policy to allow public viewing of usernames and basic info
DROP POLICY IF EXISTS "Others view limited profile info" ON public.profiles;

CREATE POLICY "Public can view basic profile info" 
ON public.profiles 
FOR SELECT 
USING (
  -- If not logged in or viewing another user's profile
  (auth.uid() IS NULL OR auth.uid() <> id) 
  AND (
    -- Public profiles are always visible
    is_private = false 
    OR 
    -- Private profiles visible to followers
    (is_private = true AND auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM followers 
      WHERE followers.follower_id = auth.uid() 
      AND followers.following_id = profiles.id
    ))
  )
);

-- Ensure spliks remain publicly viewable (already set correctly)
-- Comments remain viewable by anyone (already set correctly)
-- Likes remain viewable by anyone (already set correctly)
-- Followers remain viewable by anyone (already set correctly)

-- The existing policies for INSERT, UPDATE, DELETE operations remain unchanged
-- They still require authentication, which is what we want