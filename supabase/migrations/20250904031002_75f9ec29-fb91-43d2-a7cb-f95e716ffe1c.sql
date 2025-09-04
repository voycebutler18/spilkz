-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Anyone can view public profiles" ON public.profiles;

-- Create a more secure policy that respects privacy settings
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Allow viewing public profiles only
CREATE POLICY "Anyone can view non-private profiles" 
ON public.profiles 
FOR SELECT 
USING (is_private = false);

-- Allow followers to view private profiles
CREATE POLICY "Followers can view private profiles they follow" 
ON public.profiles 
FOR SELECT 
USING (
  is_private = true 
  AND EXISTS (
    SELECT 1 FROM public.followers 
    WHERE followers.follower_id = auth.uid() 
    AND followers.following_id = profiles.id
  )
);

-- Create a function to check if profiles should be visible
CREATE OR REPLACE FUNCTION public.can_view_profile(profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- User can always see their own profile
  IF auth.uid() = profile_id THEN
    RETURN true;
  END IF;
  
  -- Check if profile is public
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = profile_id AND is_private = false
  ) THEN
    RETURN true;
  END IF;
  
  -- Check if current user follows this private profile
  IF EXISTS (
    SELECT 1 FROM public.followers 
    WHERE follower_id = auth.uid() 
    AND following_id = profile_id
  ) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Also ensure sensitive columns have appropriate defaults
-- Update the profiles table to ensure is_private defaults to false for backwards compatibility
ALTER TABLE public.profiles 
ALTER COLUMN is_private SET DEFAULT false;