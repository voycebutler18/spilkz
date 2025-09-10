import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Add error checking
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  console.error('VITE_SUPABASE_URL:', supabaseUrl);
  console.error('VITE_SUPABASE_PUBLISHABLE_KEY:', supabaseKey ? 'Set' : 'Missing');
  throw new Error('Missing Supabase environment variables');
}

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

// Helper functions to safely access data
export const getSafeSplikData = (splik: Partial<Splik> | null | undefined) => {
  if (!splik) {
    return {
      likes_count: 0,
      comments_count: 0,
      view_count: 0,
      views: 0,
    };
  }

  return {
    ...splik,
    likes_count: splik.likes_count ?? 0,
    comments_count: splik.comments_count ?? 0,
    view_count: splik.view_count ?? splik.views ?? 0,
    views: splik.views ?? splik.view_count ?? 0,
  };
};

export const getSafeProfileData = (profile: Partial<Profile> | null | undefined) => {
  if (!profile) {
    return {
      followers_count: 0,
      following_count: 0,
      spliks_count: 0,
    };
  }

  return {
    ...profile,
    followers_count: profile.followers_count ?? 0,
    following_count: profile.following_count ?? 0,
    spliks_count: profile.spliks_count ?? 0,
  };
};
