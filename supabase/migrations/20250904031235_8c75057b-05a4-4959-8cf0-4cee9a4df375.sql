-- Drop the redundant/conflicting policies
DROP POLICY IF EXISTS "Anyone can view non-private profiles" ON public.profiles;
DROP POLICY IF EXISTS "Followers can view private profiles they follow" ON public.profiles;
DROP POLICY IF EXISTS "View public or followed profiles" ON public.profiles;

-- Keep only the essential policies:
-- 1. "Users can view own profile" (already exists, keep it)
-- 2. Create a single comprehensive policy for viewing other profiles

-- Create the comprehensive policy for viewing other profiles with privacy controls
CREATE POLICY "View profiles based on privacy settings" 
ON public.profiles 
FOR SELECT 
USING (
  -- Can always view own profile (redundant with other policy but explicit)
  auth.uid() = id 
  OR 
  -- Can view if profile is not private
  is_private = false 
  OR 
  -- Can view private profiles if following them
  (is_private = true AND EXISTS (
    SELECT 1 FROM public.followers 
    WHERE followers.follower_id = auth.uid() 
    AND followers.following_id = profiles.id
  ))
);