-- Drop all existing profile policies to start fresh
DROP POLICY IF EXISTS "Anyone can view public profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create new secure policies with proper privacy controls

-- Policy 1: Users can always view their own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Policy 2: View only non-private profiles or profiles the user follows
CREATE POLICY "View public or followed profiles" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() != id AND (
    is_private = false OR
    EXISTS (
      SELECT 1 FROM public.followers 
      WHERE followers.follower_id = auth.uid() 
      AND followers.following_id = profiles.id
    )
  )
);

-- Re-create the insert policy 
CREATE POLICY "Users can insert own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Re-create the update policy
CREATE POLICY "Users can update own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = id);

-- Create a helper function for checking profile visibility
CREATE OR REPLACE FUNCTION public.can_view_profile(profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_private boolean;
BEGIN
  -- User can always see their own profile
  IF auth.uid() = profile_id THEN
    RETURN true;
  END IF;
  
  -- Get profile privacy setting
  SELECT is_private INTO profile_private
  FROM public.profiles 
  WHERE id = profile_id;
  
  -- If profile doesn't exist or is public, allow viewing
  IF profile_private IS NULL OR profile_private = false THEN
    RETURN true;
  END IF;
  
  -- For private profiles, check if current user follows them
  RETURN EXISTS (
    SELECT 1 FROM public.followers 
    WHERE follower_id = auth.uid() 
    AND following_id = profile_id
  );
END;
$$;

-- Ensure is_private has a sensible default
ALTER TABLE public.profiles 
ALTER COLUMN is_private SET DEFAULT false;