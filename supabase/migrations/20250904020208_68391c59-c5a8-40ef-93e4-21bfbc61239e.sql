-- Add foreign key constraints to link spliks with profiles
ALTER TABLE public.spliks 
ADD CONSTRAINT spliks_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;

-- Add foreign key constraints for comments
ALTER TABLE public.comments 
ADD CONSTRAINT comments_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;

ALTER TABLE public.comments 
ADD CONSTRAINT comments_splik_id_fkey 
FOREIGN KEY (splik_id) 
REFERENCES public.spliks(id) 
ON DELETE CASCADE;

-- Add foreign key constraints for likes
ALTER TABLE public.likes 
ADD CONSTRAINT likes_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;

ALTER TABLE public.likes 
ADD CONSTRAINT likes_splik_id_fkey 
FOREIGN KEY (splik_id) 
REFERENCES public.spliks(id) 
ON DELETE CASCADE;

-- Add foreign key constraints for video_views
ALTER TABLE public.video_views 
ADD CONSTRAINT video_views_splik_id_fkey 
FOREIGN KEY (splik_id) 
REFERENCES public.spliks(id) 
ON DELETE CASCADE;

ALTER TABLE public.video_views 
ADD CONSTRAINT video_views_viewer_id_fkey 
FOREIGN KEY (viewer_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;

-- Add foreign key constraints for followers
ALTER TABLE public.followers 
ADD CONSTRAINT followers_follower_id_fkey 
FOREIGN KEY (follower_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;

ALTER TABLE public.followers 
ADD CONSTRAINT followers_following_id_fkey 
FOREIGN KEY (following_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;