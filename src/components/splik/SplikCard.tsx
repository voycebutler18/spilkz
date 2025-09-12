// src/components/splik/SplikCard.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { Flame, Bookmark, BookmarkCheck, Share2, VolumeX, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  created_at?: string;
  hype_count?: number | null;
  profile?: Profile | null;
};

type Props = {
  splik: Splik;
  index?: number;
  /** Parent can gate which ones attach a real src */
  shouldLoad?: boolean;
  /** Parent can track which is "active" in viewport */
  onPrimaryVisible?: (index: number) => void;
  onSplik?: () => void;
  onReact?: () => void;
  onShare?: () => void;
};

const VISIBILITY_THRESHOLD = 0.6;

export default function SplikCard({
  splik,
  index = 0,
  shouldLoad = true,
  onPrimaryVisible,
  onShare,
}: Props) {
  const { toast } = useToast();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);

  const [user, setUser] = React.useState<any>(null);

  const [isMuted, setIsMuted] = React.useState(true);
  const [isPlaying, setIsPlaying] = React.useState(false);

  const [hypeCount, setHypeCount] = React.useState<number>(splik.hype_count ?? 0);
  const [hasHyped, setHasHyped] = React.useState<boolean>(false);

  const [isSaved, setIsSaved] = React.useState<boolean>(false);
  const [loadingCounts, setLoadingCounts] = React.useState(false);

  // keep user in sync
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // ——— Autoplay / visibility control (fixed & mobile-safe) ———
  React.useEffect(() => {
    const el = cardRef.current;
    const vid = videoRef.current;
    if (!el || !vid) return;

    let destroyed = false;
    let visible = false;
    let trying = false;

    // Mobile-safe defaults
    vid.playsInline = true;
    (vid as any).webkitPlaysInline = true;
    vid.setAttribute("playsinline", "true");
    vid.setAttribute("webkit-playsinline", "true");
    vid.preload = "auto";
    vid.muted = true; // start muted for autoplay compliance
    setIsMuted(true);

    const pause = () => {
      try { vid.pause(); } catch {}
      setIsPlaying(false);
    };

    const attemptPlay = async (force = false) => {
      if (destroyed || !visible || !shouldLoad) return;
      if (trying && !force) return;
      trying = true;

      try {
        // Nudge iOS to paint the first frame (prevents black flicker)
        if (vid.readyState < 2 && vid.currentTime === 0) {
          try { vid.currentTime = 0.01; } catch {}
          await new Promise(r => setTimeout(r, 50));
        }
        await vid.play();
        setIsPlaying(true);
      } catch {
        // Fall back to manual controls if blocked
        vid.controls = true;
        setIsPlaying(false);
      } finally {
        trying = false;
      }
    };

    // Stable handler refs (so cleanup actually removes them)
    const handleLoadedData = () => {
      if (vid.currentTime === 0) {
        try { vid.currentTime = 0.01; } catch {}
      }
      if (visible) attemptPlay(true);
    };
    const handleCanPlay = () => { if (visible) attemptPlay(); };
    const handleStalled = () => { if (visible) attemptPlay(true); };
    const handleWaiting = () => { if (visible) attemptPlay(); };
    const onTap = () => attemptPlay(true);
    const onVisibility = () => {
      if (document.hidden) pause();
      else if (visible) attemptPlay(true);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD;
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
    vid.addEventListener("stalled", handleStalled);
    vid.addEventListener("waiting", handleWaiting);
    el.addEventListener("click", onTap, { passive: true });
    el.addEventListener("touchstart", onTap, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      destroyed = true;
      io.disconnect();
      vid.removeEventListener("loadeddata", handleLoadedData);
      vid.removeEventListener("canplay", handleCanPlay);
      vid.removeEventListener("stalled", handleStalled);
      vid.removeEventListener("waiting", handleWaiting);
      el.removeEventListener("click", onTap as any);
      el.removeEventListener("touchstart", onTap as any);
      document.removeEventListener("visibilitychange", onVisibility);
      pause();
    };
  }, [index, onPrimaryVisible, shouldLoad]);

  // ——————————— Load hype count and user interaction state ———————————
  React.useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!splik?.id) return;
      setLoadingCounts(true);

      try {
        // Get hype count
        const { count: hypeCountResult } = await supabase
          .from("hype_reactions")
          .select("*", { head: true, count: "exact" })
          .eq("splik_id", splik.id);

        if (!cancelled && typeof hypeCountResult === "number") {
          setHypeCount(hypeCountResult);
        }

        // Check user's interactions if logged in
        if (user?.id) {
          // Hype
          const { data: hypeData } = await supabase
            .from("hype_reactions")
            .select("id")
            .eq("splik_id", splik.id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (!cancelled) setHasHyped(!!hypeData);

          // Save
          const { data: saveData } = await supabase
            .from("favorites")
            .select("id")
            .eq("video_id", splik.id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (!cancelled) setIsSaved(!!saveData);
        }
      } catch (error) {
        console.error("Error loading splik data:", error);
      } finally {
        if (!cancelled) setLoadingCounts(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [splik?.id, user?.id]);

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
      variant: "default",
    });
    throw new Error("auth_required");
  };

  const toggleHype = async () => {
    try {
      const u = await ensureAuth();
      const { data: existingHype } = await supabase
        .from("hype_reactions")
        .select("id")
        .eq("splik_id", splik.id)
        .eq("user_id", u.id)
        .maybeSingle();

      if (existingHype?.id) {
        await supabase.from("hype_reactions").delete().eq("id", existingHype.id);
        setHasHyped(false);
        setHypeCount((prev) => Math.max(0, prev - 1));
      } else {
        await supabase
          .from("hype_reactions")
          .insert({ splik_id: splik.id, user_id: u.id, amount: 1 });
        setHasHyped(true);
        setHypeCount((prev) => prev + 1);
      }
    } catch (error: any) {
      if (error?.message !== "auth_required") {
        toast({
          title: "Couldn't update hype",
          description: "Please try again",
          variant: "destructive",
        });
      }
    }
  };

  const toggleSave = async () => {
    try {
      const u = await ensureAuth();
      const { data: existingSave } = await supabase
        .from("favorites")
        .select("id")
        .eq("video_id", splik.id)
        .eq("user_id", u.id)
        .maybeSingle();

      if (existingSave?.id) {
        await supabase.from("favorites").delete().eq("id", existingSave.id);
        setIsSaved(false);
        toast({ title: "Removed from favorites" });
      } else {
        await supabase.from("favorites").insert({
          video_id: splik.id,
          user_id: u.id,
        });
        setIsSaved(true);
        toast({ title: "Saved to favorites" });
      }
    } catch (error: any) {
      if (error?.message !== "auth_required") {
        toast({
          title: "Couldn't save",
          description: "Please try again",
          variant: "destructive",
        });
      }
    }
  };

  const onToggleMute = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const v = videoRef.current;
    if (!v) return;

    const nextMuted = !v.muted; // use the video's current state
    v.muted = nextMuted;
    setIsMuted(nextMuted);

    // If unmuting, try to play if not already
    if (!nextMuted && !isPlaying) {
      v.play().catch(() => {
        v.muted = true;
        setIsMuted(true);
      });
    }
  };

  // Build creator profile link
  const creatorHref = splik?.profile?.username
    ? `/profile/${splik.profile.id}`
    : `/profile/${splik.user_id}`;

  return (
    <div ref={cardRef} className="rounded-xl bg-card/60 ring-1 ring-border/60 overflow-hidden">
      {/* Video */}
      <div className="relative bg-black">
        <video
          ref={videoRef}
          poster={splik.thumbnail_url || undefined}
          className="block w-full h-[560px] sm:h-[640px] object-cover bg-black"
          style={{ objectPosition: "center center" }}
          src={shouldLoad ? splik.video_url : ""}
          playsInline
          muted
          loop
          preload="auto"
          controls={false}
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
                .catch(() => {
                  // Enable controls as fallback
                  v.controls = true;
                });
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onVolumeChange={() => setIsMuted(videoRef.current?.muted ?? true)}
          onError={() => {
            const v = videoRef.current;
            if (v) {
              v.controls = true; // user can still try
              console.error("Video failed to load:", splik.video_url);
            }
          }}
        />

        {/* Mute/Unmute button */}
        <button
          onClick={onToggleMute}
          className="absolute right-3 bottom-3 rounded-full bg-black/70 hover:bg-black/80 p-2 ring-1 ring-white/30 transition-colors"
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <VolumeX className="h-5 w-5 text-white" /> : <Volume2 className="h-5 w-5 text-white" />}
        </button>
      </div>

      {/* Creator info */}
      <div className="flex items-center gap-3 px-4 pt-3">
        <Link to={creatorHref} className="shrink-0 hover:opacity-80 transition-opacity">
          <img
            src={
              splik.profile?.avatar_url ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${splik.user_id}`
            }
            alt={splik.profile?.display_name || splik.profile?.username || "Creator"}
            className="h-9 w-9 rounded-full ring-2 ring-primary/20 object-cover"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to={creatorHref}
            className="block font-medium hover:text-primary transition-colors truncate"
          >
            {splik.profile?.display_name || splik.profile?.username || "Creator"}
          </Link>
          {splik.title && (
            <p className="text-sm text-muted-foreground truncate">{splik.title}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 pt-3">
        <div className="flex items-center gap-2">
          {/* Hype */}
          <Button
            variant={hasHyped ? "default" : "outline"}
            size="sm"
            className={cn(
              "gap-2 transition-colors",
              hasHyped && "bg-orange-500 hover:bg-orange-600 text-white"
            )}
            onClick={toggleHype}
            disabled={loadingCounts}
          >
            <Flame className={cn("h-4 w-4", hasHyped && "text-white")} />
            {hypeCount}
          </Button>

          {/* Save */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={toggleSave}
            disabled={loadingCounts}
          >
            {isSaved ? (
              <>
                <BookmarkCheck className="h-4 w-4" />
                Saved
              </>
            ) : (
              <>
                <Bookmark className="h-4 w-4" />
                Save
              </>
            )}
          </Button>

          {/* Share */}
          <div className="ml-auto">
            <Button variant="outline" size="sm" className="gap-2" onClick={onShare}>
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          </div>
        </div>

        {/* Description */}
        {splik.description && (
          <p className="mt-3 text-sm text-muted-foreground">{splik.description}</p>
        )}
      </div>
    </div>
  );
}
