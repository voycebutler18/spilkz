-- First drop the existing policies for profiles
DROP POLICY IF EXISTS "Public can view basic profile info" ON public.profiles;
DROP POLICY IF EXISTS "Others view limited profile info" ON public.profiles;

-- Create a new policy that allows anyone (including non-authenticated users) to view profiles
CREATE POLICY "Anyone can view public profiles" 
ON public.profiles 
FOR SELECT 
USING (
  -- User can always see their own profile with all details
  (auth.uid() = id) 
  OR
  -- Anyone can see public profiles
  (is_private = false)
  OR
  -- Private profiles visible to followers
  (is_private = true AND auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM followers 
    WHERE followers.follower_id = auth.uid() 
    AND followers.following_id = profiles.id
  ))
);