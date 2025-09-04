-- Update all existing videos to have max 3 seconds duration
UPDATE public.spliks 
SET duration = 3 
WHERE duration > 3 OR duration IS NULL;

-- Add a check constraint to ensure duration is never more than 3 seconds
ALTER TABLE public.spliks 
ADD CONSTRAINT duration_max_3_seconds 
CHECK (duration <= 3);