import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://izeheflwfguwinizihmx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6ZWhlZmx3Zmd1d2luaXppaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5NDAyNzEsImV4cCI6MjA3MjUxNjI3MX0.s243LZphO7lOUqqsYQrBjZg62WjenonPZrgrzjzqjVM';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Database types
export interface Profile {
  id: string;
  user_id?: string;
  username?: string;
  handle?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  city?: string;
  theme_color?: string;
  birthdate?: string;
  first_name?: string;
  last_name?: string;
  age?: number;
  followers_count?: number;
  following_count?: number;
  spliks_count?: number;
  is_private?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Splik {
  id: string;
  user_id: string;
  video_url: string;
  thumbnail_url?: string;
  duration?: number;
  tag?: string;
  visibility?: 'public' | 'private' | 'followers';
  amplified_until?: string;
  view_count?: number;
  views?: number; // Alternative field name for view count
  likes_count?: number;
  comments_count?: number;
  title?: string;
  description?: string;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface Comment {
  id: string;
  splik_id: string;
  user_id: string;
  text: string;
  created_at: string;
  profile?: Profile;
}

export interface GestureReply {
  id: string;
  parent_splik_id: string;
  user_id: string;
  video_url: string;
  thumbnail_url?: string;
  created_at: string;
  profile?: Profile;
}
