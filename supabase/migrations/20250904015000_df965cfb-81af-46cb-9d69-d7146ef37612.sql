-- Add username and follower functionality to profiles
ALTER TABLE public.profiles 
ADD COLUMN username text UNIQUE,
ADD COLUMN display_name text,
ADD COLUMN bio text,
ADD COLUMN avatar_url text,
ADD COLUMN followers_count integer DEFAULT 0,
ADD COLUMN following_count integer DEFAULT 0,
ADD COLUMN spliks_count integer DEFAULT 0,
ADD COLUMN is_private boolean DEFAULT false;

-- Create followers table
CREATE TABLE public.followers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

-- Enable RLS on followers
ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;

-- RLS policies for followers
CREATE POLICY "Anyone can view followers" 
ON public.followers 
FOR SELECT 
USING (true);

CREATE POLICY "Users can follow others" 
ON public.followers 
FOR INSERT 
WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow" 
ON public.followers 
FOR DELETE 
USING (auth.uid() = follower_id);

-- Update profiles RLS to allow public viewing
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Anyone can view public profiles" 
ON public.profiles 
FOR SELECT 
USING (true);

-- Add policy for creators to delete comments on their videos
CREATE POLICY "Creators can delete comments on their videos" 
ON public.comments 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.spliks 
    WHERE spliks.id = comments.splik_id 
    AND spliks.user_id = auth.uid()
  )
);

-- Function to update follower counts
CREATE OR REPLACE FUNCTION public.update_follower_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

-- Trigger for follower counts
CREATE TRIGGER update_follower_counts_trigger
AFTER INSERT OR DELETE ON public.followers
FOR EACH ROW
EXECUTE FUNCTION public.update_follower_counts();

-- Function to update spliks count
CREATE OR REPLACE FUNCTION public.update_spliks_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

-- Trigger for spliks count
CREATE TRIGGER update_spliks_count_trigger
AFTER INSERT OR DELETE ON public.spliks
FOR EACH ROW
EXECUTE FUNCTION public.update_spliks_count();