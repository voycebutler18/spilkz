-- Add trim columns to spliks table
ALTER TABLE public.spliks 
ADD COLUMN IF NOT EXISTS trim_start numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS trim_end numeric DEFAULT 3;