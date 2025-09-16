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

  const [isMuted, setIsMuted] = React.useState(true);
  const [isPlaying, setIsPlaying] = React.useState(false);

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
            .select("id", { head: true, count: "exact" })
            .eq("splik_id", splik.id);
          if (!cancelled) setHypeCount(count ?? 0);
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

      if (hasHyped) {
        // optimistic
        setHasHyped(false);
        setHypeCount((n) => Math.max(0, n - 1));
        // ✅ Updated to use new boosts table
        await supabase
          .from("boosts")
          .delete()
          .eq("splik_id", splik.id)
          .eq("user_id", u.id);
      } else {
        setHasHyped(true);
        setHypeCount((n) => n + 1);
        // ✅ Updated to use new boosts table
        await supabase
          .from("boosts")
          .insert({ splik_id: splik.id, user_id: u.id });
      }
    } catch {
      /* ignore; UI already rolled */
    }
  };

  const toggleSave = async () => {
    try {
      const u = await ensureAuth();
      if (isSaved) {
        setIsSaved(false);
        // ✅ Updated to use new bookmarks table
        await supabase
          .from("bookmarks")
          .delete()
          .eq("splik_id", splik.id)
          .eq("user_id", u.id);
      } else {
        setIsSaved(true);
        // ✅ Updated to use new bookmarks table
        await supabase
          .from("bookmarks")
          .insert([{ splik_id: splik.id, user_id: u.id }], {
            onConflict: "user_id,splik_id",
            ignoreDuplicates: true,
          });
      }
    } catch {
      /* ignore */
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
      className="rounded-xl bg-card/60 ring-1 ring-border/60 overflow-hidden"
    >
      {/* Media */}
      <div className="relative bg-black">
        {hasVideo ? (
          <>
            <video
              ref={videoRef}
              poster={splik.thumbnail_url || undefined}
              className="block w-full h-[560px] sm:h-[640px] object-cover bg-black"
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

            {/* Mute toggle */}
            <button
              onClick={onToggleMute}
              className="absolute right-3 bottom-3 rounded-full bg-black/70 hover:bg-black/80 p-2 ring-1 ring-white/30"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <VolumeX className="h-5 w-5 text-white" />
              ) : (
                <Volume2 className="h-5 w-5 text-white" />
              )}
            </button>
          </>
        ) : (
          // Photo-only
          <img
            src={splik.thumbnail_url || ""}
            alt={splik.title || "Photo"}
            className="block w-full h-[560px] sm:h-[640px] object-cover bg-black"
            loading="lazy"
          />
        )}
      </div>

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

      {/* Actions */}
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

          {/* ✅ Boost (renamed from Hype) */}
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

          {/* ✅ Bookmark (renamed from Save) */}
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
  );
}
