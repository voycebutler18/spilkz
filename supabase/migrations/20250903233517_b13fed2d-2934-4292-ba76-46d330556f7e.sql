-- Add last_email_changed column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN last_email_changed TIMESTAMP WITH TIME ZONE;

-- Update existing profiles to set last_email_changed to created_at
UPDATE public.profiles 
SET last_email_changed = created_at 
WHERE last_email_changed IS NULL;