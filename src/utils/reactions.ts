// src/utils/reactions.ts
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { supabase } from "@/integrations/supabase/client";

type Supabase = Database;

export class ReactionsManager {
  constructor(private supabase: SupabaseClient<Supabase>) {}

  /**
   * Toggle a boost (like/hype) for a splik
   */
  async toggleBoost(splikId: string, userId: string): Promise<{ success: boolean; isBoosted: boolean; error?: string }> {
    try {
      // Check if already boosted
      const { data: existing } = await this.supabase
        .from("boosts")
        .select("id")
        .eq("user_id", userId)
        .eq("splik_id", splikId)
        .maybeSingle();

      if (existing) {
        // Remove boost
        const { error } = await this.supabase
          .from("boosts")
          .delete()
          .eq("user_id", userId)
          .eq("splik_id", splikId);

        if (error) throw error;
        return { success: true, isBoosted: false };
      } else {
        // Add boost
        const { error } = await this.supabase
          .from("boosts")
          .insert({
            user_id: userId,
            splik_id: splikId
          });

        if (error) throw error;
        return { success: true, isBoosted: true };
      }
    } catch (error) {
      console.error("Error toggling boost:", error);
      return { 
        success: false, 
        isBoosted: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }

  /**
   * Toggle a bookmark for a splik
   */
  async toggleBookmark(splikId: string, userId: string): Promise<{ success: boolean; isBookmarked: boolean; error?: string }> {
    try {
      // Check if already bookmarked
      const { data: existing } = await this.supabase
        .from("bookmarks")
        .select("id")
        .eq("user_id", userId)
        .eq("splik_id", splikId)
        .maybeSingle();

      if (existing) {
        // Remove bookmark
        const { error } = await this.supabase
          .from("bookmarks")
          .delete()
          .eq("user_id", userId)
          .eq("splik_id", splikId);

        if (error) throw error;
        return { success: true, isBookmarked: false };
      } else {
        // Add bookmark
        const { error } = await this.supabase
          .from("bookmarks")
          .insert({
            user_id: userId,
            splik_id: splikId
          });

        if (error) throw error;
        return { success: true, isBookmarked: true };
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      return { 
        success: false, 
        isBookmarked: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }

  /**
   * Get boost status for multiple spliks
   */
  async getBoostStatus(splikIds: string[], userId: string): Promise<Record<string, boolean>> {
    try {
      const { data } = await this.supabase
        .from("boosts")
        .select("splik_id")
        .eq("user_id", userId)
        .in("splik_id", splikIds);

      const statusMap: Record<string, boolean> = {};
      splikIds.forEach(id => statusMap[id] = false);
      
      data?.forEach(boost => {
        statusMap[boost.splik_id] = true;
      });

      return statusMap;
    } catch (error) {
      console.error("Error getting boost status:", error);
      // Return all false on error
      const statusMap: Record<string, boolean> = {};
      splikIds.forEach(id => statusMap[id] = false);
      return statusMap;
    }
  }

  /**
   * Get bookmark status for multiple spliks
   */
  async getBookmarkStatus(splikIds: string[], userId: string): Promise<Record<string, boolean>> {
    try {
      const { data } = await this.supabase
        .from("bookmarks")
        .select("splik_id")
        .eq("user_id", userId)
        .in("splik_id", splikIds);

      const statusMap: Record<string, boolean> = {};
      splikIds.forEach(id => statusMap[id] = false);
      
      data?.forEach(bookmark => {
        statusMap[bookmark.splik_id] = true;
      });

      return statusMap;
    } catch (error) {
      console.error("Error getting bookmark status:", error);
      // Return all false on error
      const statusMap: Record<string, boolean> = {};
      splikIds.forEach(id => statusMap[id] = false);
      return statusMap;
    }
  }

  /**
   * Get user's boost count (total spliks boosted)
   */
  async getUserBoostCount(userId: string): Promise<number> {
    try {
      const { count } = await this.supabase
        .from("boosts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

      return count || 0;
    } catch (error) {
      console.error("Error getting user boost count:", error);
      return 0;
    }
  }

  /**
   * Get user's bookmark count
   */
  async getUserBookmarkCount(userId: string): Promise<number> {
    try {
      const { count } = await this.supabase
        .from("bookmarks")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

      return count || 0;
    } catch (error) {
      console.error("Error getting user bookmark count:", error);
      return 0;
    }
  }

  /**
   * Get splik's total boost count (should match spliks.hype_count if triggers work properly)
   */
  async getSplikBoostCount(splikId: string): Promise<number> {
    try {
      const { count } = await this.supabase
        .from("boosts")
        .select("*", { count: "exact", head: true })
        .eq("splik_id", splikId);

      return count || 0;
    } catch (error) {
      console.error("Error getting splik boost count:", error);
      return 0;
    }
  }

  /**
   * Batch check if user has boosted/bookmarked a single splik
   */
  async getReactionStatus(splikId: string, userId: string): Promise<{
    isBoosted: boolean;
    isBookmarked: boolean;
  }> {
    try {
      const [boostStatus, bookmarkStatus] = await Promise.all([
        this.getBoostStatus([splikId], userId),
        this.getBookmarkStatus([splikId], userId)
      ]);

      return {
        isBoosted: boostStatus[splikId] || false,
        isBookmarked: bookmarkStatus[splikId] || false
      };
    } catch (error) {
      console.error("Error getting reaction status:", error);
      return { isBoosted: false, isBookmarked: false };
    }
  }
}

// React hook for using the reactions manager
export function useReactions() {
  return new ReactionsManager(supabase);
}
