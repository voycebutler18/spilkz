-- Create function to increment boost impressions
CREATE OR REPLACE FUNCTION increment_boost_impression(p_splik_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.boosted_videos
  SET impressions_gained = impressions_gained + 1
  WHERE splik_id = p_splik_id
  AND status = 'active'
  AND end_date > now();
END;
$$;

-- Create function to auto-expire boosts
CREATE OR REPLACE FUNCTION expire_old_boosts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Expire boosts that have ended
  UPDATE public.boosted_videos
  SET status = 'expired'
  WHERE status = 'active'
  AND end_date < now();
  
  -- Reset boost scores for expired boosts
  UPDATE public.spliks s
  SET boost_score = 0
  WHERE s.id IN (
    SELECT splik_id 
    FROM public.boosted_videos 
    WHERE status = 'expired'
  );
END;
$$;

-- Add a visual indicator column to track boosted status
ALTER TABLE public.spliks ADD COLUMN IF NOT EXISTS is_currently_boosted BOOLEAN DEFAULT false;

-- Update the boost scores function to also set the boosted flag
CREATE OR REPLACE FUNCTION update_boost_flags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Reset all flags
  UPDATE public.spliks SET is_currently_boosted = false;
  
  -- Set flags for currently boosted videos
  UPDATE public.spliks s
  SET is_currently_boosted = true
  WHERE EXISTS (
    SELECT 1 
    FROM public.boosted_videos b
    WHERE b.splik_id = s.id 
    AND b.status = 'active' 
    AND b.end_date > now()
  );
END;
$$;