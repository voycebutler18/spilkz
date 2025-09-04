-- Add privacy settings for followers and following
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS followers_private BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS following_private BOOLEAN DEFAULT false;

-- Update the filter_profile_fields function to handle privacy settings
CREATE OR REPLACE FUNCTION public.filter_profile_fields(profile_row profiles)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
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
    
    -- Hide follower count if private
    IF profile_row.followers_private = true THEN
      filtered_profile.followers_count := 0;
    END IF;
    
    -- Hide following count if private
    IF profile_row.following_private = true THEN
      filtered_profile.following_count := 0;
    END IF;
  END IF;
  
  RETURN filtered_profile;
END;
$function$;

-- Create a function to get followers list (respects privacy)
CREATE OR REPLACE FUNCTION public.get_user_followers(profile_id UUID)
RETURNS TABLE(
  id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  is_private BOOLEAN;
BEGIN
  -- Check if followers are private
  SELECT followers_private INTO is_private
  FROM public.profiles
  WHERE profiles.id = profile_id;
  
  -- If private and not the owner, return empty
  IF is_private = true AND auth.uid() != profile_id THEN
    RETURN;
  END IF;
  
  -- Return followers
  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio
  FROM public.followers f
  JOIN public.profiles p ON p.id = f.follower_id
  WHERE f.following_id = profile_id
  ORDER BY f.created_at DESC;
END;
$function$;

-- Create a function to get following list (respects privacy)
CREATE OR REPLACE FUNCTION public.get_user_following(profile_id UUID)
RETURNS TABLE(
  id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  is_private BOOLEAN;
BEGIN
  -- Check if following is private
  SELECT following_private INTO is_private
  FROM public.profiles
  WHERE profiles.id = profile_id;
  
  -- If private and not the owner, return empty
  IF is_private = true AND auth.uid() != profile_id THEN
    RETURN;
  END IF;
  
  -- Return following
  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio
  FROM public.followers f
  JOIN public.profiles p ON p.id = f.following_id
  WHERE f.follower_id = profile_id
  ORDER BY f.created_at DESC;
END;
$function$;