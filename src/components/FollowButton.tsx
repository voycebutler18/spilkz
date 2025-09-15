// FollowButton.tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Size = "sm" | "default" | "lg";
type Variant = "default" | "outline" | "ghost";

interface FollowButtonProps {
  /** May be a UUID or a slug/username */
  profileId: string;
  username?: string;
  size?: Size;
  variant?: Variant;
  className?: string;
}

const isUUID = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export function FollowButton({
  profileId,
  username,
  size = "default",
  variant,
  className,
}: FollowButtonProps) {
  const [targetId, setTargetId] = useState<string | null>(null); // resolved UUID
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Resolve UUID from slug/username if needed
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!profileId) return;
      if (isUUID(profileId)) {
        setTargetId(profileId);
        return;
      }
      // Treat as slug/username -> look up profiles.id
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .or(`username.eq.${profileId},slug.eq.${profileId}`)
        .maybeSingle();

      if (!cancelled) {
        if (error || !data?.id) {
          console.error("FollowButton: could not resolve UUID from", profileId, error);
          setTargetId(null);
        } else {
          setTargetId(data.id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  // Subscribe + initial status once we know the UUID
  useEffect(() => {
    if (!targetId) return;

    const check = async () => {
      const { data: { user } = { user: null } } = await supabase.auth.getUser();
      setCurrentUser(user);
      setIsInitialized(true);

      if (!user) {
        setIsFollowing(false);
        setIsOwnProfile(false);
        return;
      }

      setIsOwnProfile(user.id === targetId);
      if (user.id === targetId) {
        setIsFollowing(false);
        return;
      }

      const { data, error } = await supabase
        .from("followers")
        .select("id")
        .eq("follower_id", user.id)
        .eq("following_id", targetId)
        .maybeSingle();

      setIsFollowing(!!data && !error);
    };

    check();

    const channel = supabase
      .channel(`follow-${targetId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "followers", filter: `following_id=eq.${targetId}` },
        check
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetId]);

  const handleFollow = async () => {
    if (!currentUser) {
      toast.error("Please sign in to follow creators");
      return;
    }
    if (!targetId) return;
    if (currentUser.id === targetId) return;

    setLoading(true);
    try {
      if (isFollowing) {
        const { error } = await supabase
          .from("followers")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", targetId);

        if (error) throw error;
        setIsFollowing(false);
        toast.success(username ? `Unfollowed @${username}` : "Unfollowed");
      } else {
        // upsert avoids duplicate constraint errors
        const { error } = await supabase
          .from("followers")
          .upsert(
            { follower_id: currentUser.id, following_id: targetId },
            { onConflict: "follower_id,following_id" }
          );

        if (error) throw error;
        setIsFollowing(true);
        toast.success(username ? `Following @${username}` : "Following");
      }
    } catch (err) {
      console.error("Follow error:", err);
      toast.error("Could not update follow state");
    } finally {
      setLoading(false);
    }
  };

  // Wait until we’ve resolved the target id at least once
  if (!isInitialized || (!targetId && currentUser)) return null;

  // Hide on own profile
  if (isOwnProfile) return null;

  // Show for logged-out users (CTA)
  if (!currentUser) {
    return (
      <Button
        size={size}
        variant={variant || "default"}
        className={className}
        onClick={() => toast.error("Please sign in to follow creators")}
      >
        <UserPlus className={`${size === "sm" ? "h-3 w-3" : "h-4 w-4"} ${size !== "sm" ? "mr-1" : ""}`} />
        {size !== "sm" ? "Follow" : ""}
      </Button>
    );
  }

  return (
    <Button
      onClick={handleFollow}
      variant={isFollowing ? "outline" : "default"}
      size={size}
      className={className}
      disabled={loading}
    >
      {loading ? (
        <span className="animate-spin">⏳</span>
      ) : isFollowing ? (
        <>
          <UserMinus className={`${size === "sm" ? "h-3 w-3" : "h-4 w-4"} ${size !== "sm" ? "mr-1" : ""}`} />
          {size !== "sm" ? "Following" : ""}
        </>
      ) : (
        <>
          <UserPlus className={`${size === "sm" ? "h-3 w-3" : "h-4 w-4"} ${size !== "sm" ? "mr-1" : ""}`} />
          {size !== "sm" ? "Follow" : ""}
        </>
      )}
    </Button>
  );
}

export default FollowButton;
