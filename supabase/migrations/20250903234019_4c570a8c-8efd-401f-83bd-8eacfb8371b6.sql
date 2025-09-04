-- Create storage bucket for videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('spliks', 'spliks', true);

-- Create table for video metadata
CREATE TABLE public.spliks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration INTEGER,
  file_size INTEGER,
  mime_type TEXT,
  status TEXT DEFAULT 'processing',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.spliks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own spliks" 
ON public.spliks 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own spliks" 
ON public.spliks 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own spliks" 
ON public.spliks 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own spliks" 
ON public.spliks 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create storage policies
CREATE POLICY "Users can upload their own videos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'spliks' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view all videos" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'spliks');

CREATE POLICY "Users can update their own videos" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'spliks' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own videos" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'spliks' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Add trigger for timestamp updates
CREATE TRIGGER update_spliks_updated_at
BEFORE UPDATE ON public.spliks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();