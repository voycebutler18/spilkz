-- Create boosted videos table to track which videos are boosted
CREATE TABLE public.boosted_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  splik_id UUID NOT NULL REFERENCES public.spliks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  amount INTEGER NOT NULL, -- Amount paid in cents
  boost_level TEXT NOT NULL DEFAULT 'standard', -- standard, premium, max
  impressions_gained INTEGER DEFAULT 0,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_date TIMESTAMP WITH TIME ZONE NOT NULL, -- When boost expires
  stripe_payment_intent_id TEXT,
  status TEXT DEFAULT 'active', -- active, expired, cancelled
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.boosted_videos ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own boosts" 
ON public.boosted_videos 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Anyone can view active boosts" 
ON public.boosted_videos 
FOR SELECT 
USING (status = 'active' AND end_date > now());

CREATE POLICY "System can insert boosts" 
ON public.boosted_videos 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "System can update boosts" 
ON public.boosted_videos 
FOR UPDATE 
USING (true);

-- Create index for performance
CREATE INDEX idx_boosted_videos_active ON public.boosted_videos(status, end_date) WHERE status = 'active';
CREATE INDEX idx_boosted_videos_splik ON public.boosted_videos(splik_id);

-- Add boost_score to spliks for sorting
ALTER TABLE public.spliks ADD COLUMN boost_score INTEGER DEFAULT 0;

-- Function to update boost scores
CREATE OR REPLACE FUNCTION update_boost_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Reset all boost scores
  UPDATE public.spliks SET boost_score = 0;
  
  -- Update boost scores for active boosts
  UPDATE public.spliks s
  SET boost_score = COALESCE((
    SELECT SUM(
      CASE 
        WHEN b.boost_level = 'max' THEN 1000
        WHEN b.boost_level = 'premium' THEN 500
        ELSE 250
      END
    )
    FROM public.boosted_videos b
    WHERE b.splik_id = s.id 
    AND b.status = 'active' 
    AND b.end_date > now()
  ), 0);
END;
$$;