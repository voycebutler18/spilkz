// src/components/ReactionButtons.tsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Heart, Bookmark, HeartOff, BookmarkX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/types/supabase";
import { useReactions } from "@/utils/reactions";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type Supabase = Database;

interface ReactionButtonsProps {
  splikId: string;
  initialHypeCount?: number;
  className?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "ghost" | "outline";
  showLabels?: boolean;
  vertical?: boolean;
}

export default function ReactionButtons({
  splikId,
  initialHypeCount = 0,
  className,
  size = "default",
  variant = "ghost",
  showLabels = false,
  vertical = false
}: ReactionButtonsProps) {
  const [user, setUser] = useState<any>(null);
  const reactions = useReactions();

  const [isBoosted, setIsBoosted] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [hypeCount, setHypeCount] = useState(initialHypeCount);
  const [loading, setLoading] = useState(false);

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getCurrentUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load initial reaction status
  useEffect(() => {
    if (user && splikId) {
      loadReactionStatus();
    }
  }, [user, splikId]);

  const loadReactionStatus = async () => {
    if (!user) return;

    try {
      const status = await reactions.getReactionStatus(splikId, user.id);
      setIsBoosted(status.isBoosted);
      setIsBookmarked(status.isBookmarked);
    } catch (error) {
      console.error("Error loading reaction status:", error);
    }
  };

  const handleBoost = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to boost this splik",
        variant: "destructive"
      });
      return;
    }

    if (loading) return;
    setLoading(true);

    try {
      const result = await reactions.toggleBoost(splikId, user.id);
      
      if (result.success) {
        setIsBoosted(result.isBoosted);
        // Update hype count optimistically
        setHypeCount(prev => result.isBoosted ? prev + 1 : prev - 1);
        
        toast({
          title: result.isBoosted ? "Splik boosted!" : "Boost removed",
          description: result.isBoosted 
            ? "Thanks for showing your support!" 
            : "Boost has been removed",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to update boost",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error toggling boost:", error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBookmark = async () => {
    if (!user) {
      toast({
        title: "Authentication required", 
        description: "Please log in to bookmark this splik",
        variant: "destructive"
      });
      return;
    }

    if (loading) return;
    setLoading(true);

    try {
      const result = await reactions.toggleBookmark(splikId, user.id);
      
      if (result.success) {
        setIsBookmarked(result.isBookmarked);
        
        toast({
          title: result.isBookmarked ? "Splik bookmarked!" : "Bookmark removed",
          description: result.isBookmarked 
            ? "Added to your bookmarks" 
            : "Removed from your bookmarks",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to update bookmark",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const containerClasses = cn(
    "flex gap-2",
    vertical ? "flex-col" : "flex-row items-center",
    className
  );

  const buttonClasses = cn(
    "transition-all duration-200",
    loading && "opacity-50 cursor-not-allowed"
  );

  return (
    <div className={containerClasses}>
      {/* Boost Button */}
      <Button
        variant={variant}
        size={size}
        onClick={handleBoost}
        disabled={loading}
        className={cn(
          buttonClasses,
          isBoosted && "text-red-500 hover:text-red-600",
          !isBoosted && "hover:text-red-500"
        )}
      >
        {isBoosted ? (
          <Heart className="h-4 w-4 fill-current" />
        ) : (
          <Heart className="h-4 w-4" />
        )}
        
        {showLabels && (
          <span className="ml-1">
            {isBoosted ? "Boosted" : "Boost"}
          </span>
        )}
        
        {hypeCount > 0 && (
          <span className={cn("ml-1 text-sm", showLabels ? "text-muted-foreground" : "")}>
            {hypeCount}
          </span>
        )}
      </Button>

      {/* Bookmark Button */}
      <Button
        variant={variant}
        size={size}
        onClick={handleBookmark}
        disabled={loading}
        className={cn(
          buttonClasses,
          isBookmarked && "text-blue-500 hover:text-blue-600",
          !isBookmarked && "hover:text-blue-500"
        )}
      >
        {isBookmarked ? (
          <Bookmark className="h-4 w-4 fill-current" />
        ) : (
          <Bookmark className="h-4 w-4" />
        )}
        
        {showLabels && (
          <span className="ml-1">
            {isBookmarked ? "Saved" : "Save"}
          </span>
        )}
      </Button>
    </div>
  );
}

// Simplified version for when you just want boost functionality
export function BoostButton({ 
  splikId, 
  initialHypeCount = 0, 
  size = "default",
  showCount = true 
}: {
  splikId: string;
  initialHypeCount?: number;
  size?: "sm" | "default" | "lg";
  showCount?: boolean;
}) {
  return (
    <ReactionButtons
      splikId={splikId}
      initialHypeCount={initialHypeCount}
      size={size}
      className="flex-row"
    />
  );
}

// Simplified version for when you just want bookmark functionality  
export function BookmarkButton({
  splikId,
  size = "default"
}: {
  splikId: string;
  size?: "sm" | "default" | "lg";
}) {
  const reactions = useReactions();
  const [user, setUser] = useState<any>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [loading, setLoading] = useState(false);

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getCurrentUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && splikId) {
      loadBookmarkStatus();
    }
  }, [user, splikId]);

  const loadBookmarkStatus = async () => {
    if (!user) return;
    try {
      const status = await reactions.getBookmarkStatus([splikId], user.id);
      setIsBookmarked(status[splikId] || false);
    } catch (error) {
      console.error("Error loading bookmark status:", error);
    }
  };

  const handleBookmark = async () => {
    if (!user || loading) return;
    setLoading(true);

    try {
      const result = await reactions.toggleBookmark(splikId, user.id);
      if (result.success) {
        setIsBookmarked(result.isBookmarked);
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleBookmark}
      disabled={loading}
      className={cn(
        "transition-all duration-200",
        isBookmarked && "text-blue-500 hover:text-blue-600",
        !isBookmarked && "hover:text-blue-500",
        loading && "opacity-50 cursor-not-allowed"
      )}
    >
      <Bookmark className={cn("h-4 w-4", isBookmarked && "fill-current")} />
    </Button>
  );
}
