-- Fix the search_path for all existing functions to prevent security issues
-- This prevents malicious users from creating objects that could hijack function behavior

-- Update the can_view_profile function
CREATE OR REPLACE FUNCTION public.can_view_profile(profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- Update the handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, age, city)
  VALUES (
    new.id, 
    new.raw_user_meta_data ->> 'first_name', 
    new.raw_user_meta_data ->> 'last_name',
    (new.raw_user_meta_data ->> 'age')::INTEGER,
    new.raw_user_meta_data ->> 'city'
  );
  RETURN new;
END;
$$;

-- Update the update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Update the increment_view_count function
CREATE OR REPLACE FUNCTION public.increment_view_count(splik_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.spliks 
  SET views = views + 1 
  WHERE id = splik_id_param;
END;
$$;

-- Update the increment_view_with_session function
CREATE OR REPLACE FUNCTION public.increment_view_with_session(p_splik_id uuid, p_session_id text, p_viewer_id uuid DEFAULT NULL::uuid, p_ip_address text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- Update the update_comments_count function
CREATE OR REPLACE FUNCTION public.update_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.spliks 
    SET comments_count = comments_count + 1 
    WHERE id = NEW.splik_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.spliks 
    SET comments_count = GREATEST(0, comments_count - 1) 
    WHERE id = OLD.splik_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Update the update_likes_count function
CREATE OR REPLACE FUNCTION public.update_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.spliks 
    SET likes_count = likes_count + 1 
    WHERE id = NEW.splik_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.spliks 
    SET likes_count = GREATEST(0, likes_count - 1) 
    WHERE id = OLD.splik_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Update the update_follower_counts function
CREATE OR REPLACE FUNCTION public.update_follower_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles 
    SET followers_count = followers_count + 1 
    WHERE id = NEW.following_id;
    
    UPDATE public.profiles 
    SET following_count = following_count + 1 
    WHERE id = NEW.follower_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles 
    SET followers_count = GREATEST(0, followers_count - 1) 
    WHERE id = OLD.following_id;
    
    UPDATE public.profiles 
    SET following_count = GREATEST(0, following_count - 1) 
    WHERE id = OLD.follower_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Update the update_spliks_count function
CREATE OR REPLACE FUNCTION public.update_spliks_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles 
    SET spliks_count = spliks_count + 1 
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles 
    SET spliks_count = GREATEST(0, spliks_count - 1) 
    WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$;