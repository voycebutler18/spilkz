// src/components/splik/SplikCard.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  Bookmark,
  BookmarkCheck,
  Share2,
  VolumeX,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import FollowButton from "@/components/FollowButton";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
};

type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string | null;
  thumbnail_url?: string | null;
  created_at?: string;
  hype_count?: number | null; // optional precomputed count
  mime_type?: string | null;
  profile?: Profile | null;
};

type Props = {
  splik: Splik;
  index?: number;
  shouldLoad?: boolean;
  onPrimaryVisible?: (index: number) => void;
  onSplik?: () => void;
  onReact?: () => void;
  onShare?: () => void;

  /** Optional pre-batched state from the parent */
  initialIsSaved?: boolean;
  initialHasHyped?: boolean;
  initialHypeCount?: number;
};

const VISIBILITY_THRESHOLD = 0.6;

export default function SplikCard({
  splik,
  index = 0,
  shouldLoad = true,
  onPrimaryVisible,
  onShare,
  initialIsSaved,
  initialHasHyped,
  initialHypeCount,
}: Props) {
  const { toast } = useToast();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);

  const [user, setUser] = React.useState<any>(null);

  const [isFollowing, setIsFollowing] = React.useState(false);
  const [followLoading, setFollowLoading] = React.useState(false);

  // Seed UI from props/db row
  const [hypeCount, setHypeCount] = React.useState<number>(
    initialHypeCount ?? splik.hype_count ?? 0
  );
  const [hasHyped, setHasHyped] = React.useState<boolean>(
    initialHasHyped ?? false
  );
  const [isSaved, setIsSaved] = React.useState<boolean>(
    initialIsSaved ?? false
  );

  // Keep in sync if parent updates
  React.useEffect(() => {
    setHypeCount(initialHypeCount ?? splik.hype_count ?? 0);
  }, [initialHypeCount, splik.hype_count]);
  React.useEffect(() => setHasHyped(initialHasHyped ?? false), [initialHasHyped]);
  React.useEffect(() => setIsSaved(initialIsSaved ?? false), [initialIsSaved]);

  // Local profile fallback (fetch only if missing)
  const [loadedProfile, setLoadedProfile] = React.useState<Profile | null>(null);

  const hasVideo =
    Boolean(splik.video_url) || (splik.mime_type?.startsWith("video/") ?? false);

  const isCreator = user?.id === splik.user_id;

  /* ---------- auth ---------- */
  React.useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setUser(data.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  /* ---------- hydrate profile if missing ---------- */
  React.useEffect(() => {
    if (splik.profile?.username || splik.profile?.display_name) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, first_name, last_name, avatar_url")
        .eq("id", splik.user_id)
        .maybeSingle<Profile>();
      if (!cancelled && data) setLoadedProfile(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [splik.user_id, splik.profile?.username, splik.profile?.display_name]);

  /* ---------- ensure saved/hype state (if parent didn't pass it) ---------- */
  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id) return;

      try {
        if (initialIsSaved === undefined) {
          // ✅ Updated to use new bookmarks table instead of favorites
          const { count } = await supabase
            .from("bookmarks")
            .select("id", { head: true, count: "exact" })
            .eq("user_id", user.id)
            .eq("splik_id", splik.id);
          if (!cancelled) setIsSaved((count ?? 0) > 0);
        }

        if (initialHasHyped === undefined) {
          // ✅ Updated to use new boosts table instead of hype_reactions
          const { data: boostRow } = await supabase
            .from("boosts")
            .select("id")
            .eq("user_id", user.id)
            .eq("splik_id", splik.id)
            .maybeSingle();
          if (!cancelled) setHasHyped(!!boostRow);
        }

        if (initialHypeCount === undefined && splik.hype_count == null) {
          // ✅ Updated to count from boosts table
          const { count } = await supabase
            .from("boosts")
            .select("*", { head: true, count: "exact" })
            .eq("splik_id", splik.id);
          if (!cancelled) setHypeCount(count ?? 0);
        }

        // Check follow status if not creator
        if (!isCreator) {
          const { data: followRow } = await supabase
            .from("followers")
            .select("id")
            .eq("follower_id", user.id)
            .eq("following_id", splik.user_id)
            .maybeSingle();
          if (!cancelled) setIsFollowing(!!followRow);
        }
      } catch {
        /* ignore */
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    splik.id,
    initialIsSaved,
    initialHasHyped,
    initialHypeCount,
    splik.hype_count,
  ]);

  /* ---------- autoplay / visibility for video posts ---------- */
  React.useEffect(() => {
    if (!hasVideo) return;
    const el = cardRef.current;
    const vid = videoRef.current;
    if (!el || !vid) return;

    let destroyed = false;
    let visible = false;
    let trying = false;

    vid.playsInline = true;
    // @ts-ignore
    vid.webkitPlaysInline = true;
    vid.preload = "auto";
    vid.muted = true;
    setIsMuted(true);

    const pause = () => {
      try {
        vid.pause();
      } catch {}
      setIsPlaying(false);
    };

    const attemptPlay = async (force = false) => {
      if (destroyed || !visible || !shouldLoad) return;
      if (trying && !force) return;
      trying = true;
      try {
        if (vid.readyState < 2 && vid.currentTime === 0) {
          try {
            vid.currentTime = 0.01;
          } catch {}
          await new Promise((r) => setTimeout(r, 50));
        }
        await vid.play();
        setIsPlaying(true);
      } catch {
        vid.controls = true;
        setIsPlaying(false);
      } finally {
        trying = false;
      }
    };

    const handleLoadedData = () => {
      if (visible) attemptPlay(true);
    };
    const handleCanPlay = () => {
      if (visible) attemptPlay();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible =
          entry.isIntersecting &&
          entry.intersectionRatio >= VISIBILITY_THRESHOLD;
        if (visible) {
          onPrimaryVisible?.(index);
          attemptPlay();
        } else {
          pause();
        }
      },
      { threshold: [0, 0.35, VISIBILITY_THRESHOLD, 1] }
    );
    io.observe(el);

    vid.addEventListener("loadeddata", handleLoadedData);
    vid.addEventListener("canplay", handleCanPlay);

    return () => {
      destroyed = true;
      io.disconnect();
      vid.removeEventListener("loadeddata", handleLoadedData);
      vid.removeEventListener("canplay", handleCanPlay);
      pause();
    };
  }, [index, onPrimaryVisible, shouldLoad, hasVideo]);

  const ensureAuth = async () => {
    if (user) return user;
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      setUser(data.user);
      return data.user;
    }
    toast({
      title: "Sign in required",
      description: "Please log in to react or save.",
    });
    throw new Error("auth_required");
  };

  /* ---------- actions (optimistic) ---------- */
  const toggleHype = async () => {
    try {
      const u = await ensureAuth();
      console.log("Toggling boost for splik:", splik.id, "user:", u.id, "current state:", hasHyped);

      if (hasHyped) {
        // Remove boost
        const result = await supabase
          .from("boosts")
          .delete()
          .eq("splik_id", splik.id)
          .eq("user_id", u.id);
        console.log("Remove boost result:", result);
        
        if (!result.error) {
          setHasHyped(false);
          setHypeCount((n) => Math.max(0, n - 1));
        }
      } else {
        // Add boost
        const result = await supabase
          .from("boosts")
          .insert({ 
            splik_id: splik.id, 
            user_id: u.id
          });
        console.log("Add boost result:", result);
        
        if (!result.error) {
          setHasHyped(true);
          setHypeCount((n) => n + 1);
        }
      }

      // Refresh the actual count from database
      const { count } = await supabase
        .from("boosts")
        .select("*", { head: true, count: "exact" })
        .eq("splik_id", splik.id);
      setHypeCount(count || 0);
      
    } catch (error) {
      console.error("Boost error:", error);
    }
  };

  const toggleFollow = async () => {
    if (followLoading) return;
    
    try {
      const u = await ensureAuth();
      setFollowLoading(true);
      console.log("Toggling follow for user:", splik.user_id, "current state:", isFollowing);
      
      if (isFollowing) {
        // Unfollow
        const result = await supabase
          .from("followers")
          .delete()
          .eq("follower_id", u.id)
          .eq("following_id", splik.user_id);
        
        console.log("Unfollow result:", result);
        
        if (!result.error) {
          setIsFollowing(false);
          toast({
            title: "Unfollowed",
            description: `You unfollowed ${name}`,
          });
        } else {
          throw result.error;
        }
      } else {
        // Follow
        const result = await supabase
          .from("followers")
          .insert([{ 
            follower_id: u.id, 
            following_id: splik.user_id 
          }]);
        
        console.log("Follow result:", result);
        
        if (!result.error) {
          setIsFollowing(true);
          toast({
            title: "Following",
            description: `You are now following ${name}`,
          });
        } else {
          throw result.error;
        }
      }
    } catch (error) {
      console.error("Follow error:", error);
      toast({
        title: "Error",
        description: "Could not update follow status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setFollowLoading(false);
    }
  };
    try {
      const u = await ensureAuth();
      console.log("Toggling bookmark for splik:", splik.id, "user:", u.id, "current state:", isSaved);
      
      if (isSaved) {
        // Remove bookmark
        const result = await supabase
          .from("bookmarks")
          .delete()
          .eq("splik_id", splik.id)
          .eq("user_id", u.id);
        console.log("Remove bookmark result:", result);
        
        if (!result.error) {
          setIsSaved(false);
        }
      } else {
        // Add bookmark
        const result = await supabase
          .from("bookmarks")
          .insert([{ splik_id: splik.id, user_id: u.id }]);
        console.log("Add bookmark result:", result);
        
        if (!result.error) {
          setIsSaved(true);
        }
      }
    } catch (error) {
      console.error("Bookmark error:", error);
    }
  };

  const onToggleMute = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasVideo) return;
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setIsMuted(next);
    if (!next && !isPlaying) {
      v.play().catch(() => {
        v.muted = true;
        setIsMuted(true);
      });
    }
  };

  // Reliable creator name + link
  const profile = splik.profile || loadedProfile || null;
  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const name = profile?.display_name || fullName || profile?.username || "User";
  const avatarUrl =
    profile?.avatar_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${splik.user_id}`;
  const creatorHref = `/creator/${profile?.username || splik.user_id}`;

  return (
    <div
      ref={cardRef}
      className="relative w-full h-screen bg-black overflow-hidden md:h-auto md:rounded-xl md:bg-card/60 md:ring-1 md:ring-border/60"
    >
      {/* Media - Full Screen on Mobile, Card on Desktop */}
      <div className="relative bg-black md:rounded-t-xl overflow-hidden">
        {hasVideo ? (
          <>
            <video
              ref={videoRef}
              poster={splik.thumbnail_url || undefined}
              className="block w-full h-screen object-cover bg-black md:h-[560px] lg:h-[640px]"
              src={shouldLoad && splik.video_url ? splik.video_url : ""}
              playsInline
              muted
              loop
              preload="auto"
              controls={false}
              // @ts-ignore
              webkit-playsinline="true"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const v = videoRef.current;
                if (!v) return;
                if (isPlaying) {
                  v.pause();
                  setIsPlaying(false);
                } else {
                  v.play()
                    .then(() => setIsPlaying(true))
                    .catch(() => (v.controls = true));
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onVolumeChange={() =>
                setIsMuted(videoRef.current?.muted ?? true)
              }
            />

            {/* Mobile Overlay UI - Right Side (TikTok Style) */}
            <div className="absolute right-3 bottom-20 flex flex-col items-center space-y-4 z-10 md:hidden">
              {/* Creator Avatar + Follow */}
              <div className="relative">
                <Link to={creatorHref}>
                  <img
                    src={avatarUrl}
                    alt={name}
                    className="w-12 h-12 rounded-full border-2 border-white object-cover"
                  />
                </Link>
                {!isCreator && (
                  <button
                    onClick={toggleFollow}
                    disabled={followLoading}
                    className={cn(
                      "absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold transition-all duration-200",
                      isFollowing 
                        ? "bg-gray-600 text-white" 
                        : "bg-red-500 text-white hover:bg-red-600",
                      followLoading && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {followLoading ? "..." : (isFollowing ? "✓" : "+")}
                  </button>
                )}
              </div>

              {/* Boost */}
              <button
                onClick={toggleHype}
                className="flex flex-col items-center space-y-1"
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  hasHyped ? "bg-orange-500" : "bg-white/20 backdrop-blur-sm"
                )}>
                  <TrendingUp className={cn(
                    "w-6 h-6",
                    hasHyped ? "text-white" : "text-white"
                  )} />
                </div>
                <span className="text-white text-xs font-semibold">
                  {hypeCount > 0 ? (hypeCount > 999 ? `${Math.floor(hypeCount/1000)}K` : hypeCount) : ""}
                </span>
              </button>

              {/* Bookmark */}
              <button
                onClick={toggleSave}
                className="flex flex-col items-center space-y-1"
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  isSaved ? "bg-yellow-500" : "bg-white/20 backdrop-blur-sm"
                )}>
                  {isSaved ? (
                    <BookmarkCheck className="w-6 h-6 text-white" />
                  ) : (
                    <Bookmark className="w-6 h-6 text-white" />
                  )}
                </div>
              </button>

              {/* Share */}
              <button
                onClick={onShare}
                className="flex flex-col items-center space-y-1"
              >
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Share2 className="w-6 h-6 text-white" />
                </div>
              </button>
            </div>

            {/* Mobile Bottom Content Info */}
            <div className="absolute bottom-6 left-4 right-20 z-10 md:hidden">
              <div className="space-y-2">
                <Link 
                  to={creatorHref}
                  className="text-white font-semibold text-sm"
                >
                  @{profile?.username || "user"}
                </Link>
                {splik.title && (
                  <p className="text-white text-sm line-clamp-2">
                    {splik.title}
                  </p>
                )}
                {splik.description && (
                  <p className="text-white/80 text-sm line-clamp-3">
                    {splik.description}
                  </p>
                )}
              </div>
            </div>

            {/* Mute toggle - Mobile: bottom right, Desktop: bottom right of video */}
            <button
              onClick={onToggleMute}
              className="absolute bottom-6 right-4 md:right-3 md:bottom-3 w-10 h-10 md:w-8 md:h-8 rounded-full bg-black/70 hover:bg-black/80 flex items-center justify-center ring-1 ring-white/30 z-10"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <VolumeX className="h-5 w-5 md:h-4 md:w-4 text-white" />
              ) : (
                <Volume2 className="h-5 w-5 md:h-4 md:w-4 text-white" />
              )}
            </button>

            {/* Play/Pause Indicator for Mobile */}
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none md:hidden">
                <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                  <div className="w-6 h-6 border-l-8 border-white border-transparent ml-1" />
                </div>
              </div>
            )}
          </>
        ) : (
          // Photo-only
          <img
            src={splik.thumbnail_url || ""}
            alt={splik.title || "Photo"}
            className="block w-full h-screen object-cover bg-black md:h-[560px] lg:h-[640px]"
            loading="lazy"
          />
        )}
      </div>

      {/* Desktop Layout - Creator info and actions below video */}
      <div className="hidden md:block">
        {/* Creator info */}
        <div className="flex items-center gap-3 px-4 pt-3">
          <Link
            to={creatorHref}
            className="shrink-0 hover:opacity-80 transition-opacity"
          >
            <img
              src={avatarUrl}
              alt={name}
              className="h-9 w-9 rounded-full ring-2 ring-primary/20 object-cover"
            />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              to={creatorHref}
              className="block font-medium hover:text-primary transition-colors truncate"
            >
              {name}
            </Link>
            {splik.title && (
              <p className="text-sm text-muted-foreground truncate">
                {splik.title}
              </p>
            )}
          </div>
        </div>

        {/* Desktop Actions */}
        <div className="px-4 pb-4 pt-3">
          <div className="flex items-center gap-2">
            {/* Follow only if NOT creator */}
            {!isCreator && (
              <FollowButton
                profileId={splik.user_id}
                username={profile?.username || undefined}
                size="sm"
                variant="outline"
              />
            )}

            {/* Boost */}
            <Button
              variant={hasHyped ? "default" : "outline"}
              size="sm"
              className={cn(
                "gap-2",
                hasHyped && "bg-orange-500 hover:bg-orange-600 text-white"
              )}
              onClick={toggleHype}
              aria-pressed={hasHyped}
              title="Boost this content"
            >
              <TrendingUp className={cn("h-4 w-4", hasHyped && "text-white")} />
              {hasHyped ? "Boosted" : "Boost"} ({hypeCount})
            </Button>

            {/* Bookmark */}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={toggleSave}
              aria-pressed={isSaved}
              title="Bookmark this content"
            >
              {isSaved ? (
                <>
                  <BookmarkCheck className="h-4 w-4" />
                  Bookmarked
                </>
              ) : (
                <>
                  <Bookmark className="h-4 w-4" />
                  Bookmark
                </>
              )}
            </Button>

            {/* Send a note */}
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-2"
              title="Send a note to the creator"
            >
              <Link
                to={`/notes?to=${splik.user_id}&msg=${encodeURIComponent(
                  `About your video "${splik.title || ""}": `
                )}`}
              >
                Send a note
              </Link>
            </Button>

            <div className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onShare}
              >
                <Share2 className="h-4 w-4" /> Share
              </Button>
            </div>
          </div>

          {splik.description && (
            <p className="mt-3 text-sm text-muted-foreground">
              {splik.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
