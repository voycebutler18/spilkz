export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      boosted_videos: {
        Row: {
          amount: number
          boost_level: string
          created_at: string
          end_date: string
          id: string
          impressions_gained: number | null
          splik_id: string
          start_date: string
          status: string | null
          stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          boost_level?: string
          created_at?: string
          end_date: string
          id?: string
          impressions_gained?: number | null
          splik_id: string
          start_date?: string
          status?: string | null
          stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          boost_level?: string
          created_at?: string
          end_date?: string
          id?: string
          impressions_gained?: number | null
          splik_id?: string
          start_date?: string
          status?: string | null
          stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boosted_videos_splik_id_fkey"
            columns: ["splik_id"]
            isOneToOne: false
            referencedRelation: "spliks"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          splik_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          splik_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          splik_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_splik_id_fkey"
            columns: ["splik_id"]
            isOneToOne: false
            referencedRelation: "spliks"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          splik_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          splik_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          splik_id?: string
          user_id?: string
        }
        Relationships: []
      }
      followers: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          created_at: string
          id: string
          splik_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          splik_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          splik_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_splik_id_fkey"
            columns: ["splik_id"]
            isOneToOne: false
            referencedRelation: "spliks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          display_name: string | null
          first_name: string | null
          followers_count: number | null
          followers_private: boolean | null
          following_count: number | null
          following_private: boolean | null
          id: string
          is_private: boolean | null
          last_email_changed: string | null
          last_name: string | null
          spliks_count: number | null
          updated_at: string
          username: string | null
        }
        Insert: {
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          followers_count?: number | null
          followers_private?: boolean | null
          following_count?: number | null
          following_private?: boolean | null
          id: string
          is_private?: boolean | null
          last_email_changed?: string | null
          last_name?: string | null
          spliks_count?: number | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          followers_count?: number | null
          followers_private?: boolean | null
          following_count?: number | null
          following_private?: boolean | null
          id?: string
          is_private?: boolean | null
          last_email_changed?: string | null
          last_name?: string | null
          spliks_count?: number | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      spliks: {
        Row: {
          boost_score: number | null
          comments_count: number | null
          created_at: string
          description: string | null
          duration: number | null
          file_size: number | null
          id: string
          is_currently_boosted: boolean | null
          likes_count: number | null
          mime_type: string | null
          status: string | null
          thumbnail_url: string | null
          title: string | null
          trim_end: number | null
          trim_start: number | null
          updated_at: string
          user_id: string
          video_url: string
          views: number | null
        }
        Insert: {
          boost_score?: number | null
          comments_count?: number | null
          created_at?: string
          description?: string | null
          duration?: number | null
          file_size?: number | null
          id?: string
          is_currently_boosted?: boolean | null
          likes_count?: number | null
          mime_type?: string | null
          status?: string | null
          thumbnail_url?: string | null
          title?: string | null
          trim_end?: number | null
          trim_start?: number | null
          updated_at?: string
          user_id: string
          video_url: string
          views?: number | null
        }
        Update: {
          boost_score?: number | null
          comments_count?: number | null
          created_at?: string
          description?: string | null
          duration?: number | null
          file_size?: number | null
          id?: string
          is_currently_boosted?: boolean | null
          likes_count?: number | null
          mime_type?: string | null
          status?: string | null
          thumbnail_url?: string | null
          title?: string | null
          trim_end?: number | null
          trim_start?: number | null
          updated_at?: string
          user_id?: string
          video_url?: string
          views?: number | null
        }
        Relationships: []
      }
      video_views: {
        Row: {
          id: string
          ip_address: string | null
          session_id: string
          splik_id: string
          viewed_at: string
          viewer_id: string | null
        }
        Insert: {
          id?: string
          ip_address?: string | null
          session_id: string
          splik_id: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Update: {
          id?: string
          ip_address?: string | null
          session_id?: string
          splik_id?: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_views_splik_id_fkey"
            columns: ["splik_id"]
            isOneToOne: false
            referencedRelation: "spliks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_profile: {
        Args: { profile_id: string }
        Returns: boolean
      }
      expire_old_boosts: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      filter_profile_fields: {
        Args: { profile_row: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: {
          age: number | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          display_name: string | null
          first_name: string | null
          followers_count: number | null
          followers_private: boolean | null
          following_count: number | null
          following_private: boolean | null
          id: string
          is_private: boolean | null
          last_email_changed: string | null
          last_name: string | null
          spliks_count: number | null
          updated_at: string
          username: string | null
        }
      }
      get_user_favorites: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          id: string
          splik_id: string
        }[]
      }
      get_user_followers: {
        Args: { profile_id: string }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          id: string
          username: string
        }[]
      }
      get_user_following: {
        Args: { profile_id: string }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          id: string
          username: string
        }[]
      }
      get_video_analytics: {
        Args: { p_user_id: string }
        Returns: {
          last_viewed: string
          splik_id: string
          unique_viewers: number
          view_count: number
        }[]
      }
      increment_boost_impression: {
        Args: { p_splik_id: string }
        Returns: undefined
      }
      increment_view_count: {
        Args: { splik_id_param: string }
        Returns: undefined
      }
      increment_view_with_session: {
        Args: {
          p_ip_address?: string
          p_session_id: string
          p_splik_id: string
          p_viewer_id?: string
        }
        Returns: Json
      }
      update_boost_flags: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      update_boost_scores: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
