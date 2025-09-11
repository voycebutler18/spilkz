// src/components/splik/SplikCard.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { Flame, MessageCircle, Bookmark, BookmarkCheck, Share2, VolumeX, Volume2 } from "lucide-react";
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
  comments_count?: number | null;
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
  const [commentCount, setCommentCount] = React.useState<number>(splik.comments_count ?? 0);
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

  // ——————————— Autoplay / visibility control (very defensive) ———————————
  React.useEffect(() => {
    const el = cardRef.current;
    const vid = videoRef.current;
    if (!el || !vid) return;

    // ensure mobile-friendly defaults
    vid.playsInline = true;
    (vid as any).webkitPlaysInline = true;
    vid.muted = true;
    vid.preload = "auto";

    let lastVisible = 0;

    const tryPlay = async () => {
      if (!vid.src) return;
      try {
        if (vid.readyState < 2) vid.load();
        await vid.play();
        setIsPlaying(true);
      } catch (err) {
        // Second attempt muted (some browsers need a second promise chain)
        try {
          vid.muted = true;
          await vid.play();
          setIsPlaying(true);
        } catch {
          // As a last resort, show controls so user can start playback manually
          vid.controls = true;
          setIsPlaying(false);
        }
      }
    };

    const pause = () => {
      try {
        vid.pause();
      } catch {}
      setIsPlaying(false);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const ent of entries) {
          lastVisible = ent.intersectionRatio;
          if (ent.isIntersecting && ent.intersectionRatio >= VISIBILITY_THRESHOLD) {
            onPrimaryVisible?.(index);
            // start quickly without flashing black: poster is visible until first frame
            tryPlay();
          } else if (ent.intersectionRatio < 0.35) {
            pause();
          }
        }
      },
      { threshold: [0, 0.35, VISIBILITY_THRESHOLD, 0.9, 1] }
    );
    io.observe(el);

    // Touch/click always tries to play (covers rare cases)
    const onTap = () => tryPlay();
    el.addEventListener("click", onTap, { passive: true });
    el.addEventListener("touchstart", onTap, { passive: true });

    // iOS can stall at t=0; nudge a hair after loadeddata
    const onLoaded = () => {
      if (vid.currentTime === 0) {
        try { vid.currentTime = 0.05; } catch {}
      }
    };
    vid.addEventListener("loadeddata", onLoaded);

    return () => {
      io.disconnect();
      el.removeEventListener("click", onTap);
      el.removeEventListener("touchstart", onTap);
      vid.removeEventListener("loadeddata", onLoaded);
      pause();
    };
  }, [index, onPrimaryVisible]);

  // ——————————— Lazy load counts (only once per card) ———————————
  React.useEffect(() => {
    let cancelled = false;

    const go = async () => {
      if (!splik?.id) return;
      setLoadingCounts(true);
      try {
        // hype count
        const { data: hc } = await supabase
          .from("hype_reactions")
          .select("id", { count: "exact", head: true })
          .eq("splik_id", splik.id);
        if (!cancelled) setHypeCount(hc?.length ?? (hc as any) ?? 0); // head:true returns null rows; count is in response.count (not exposed via client types), so fallback below
      } catch {}
      try {
        const { count } = await supabase
          .from("hype_reactions")
          .select("*", { head: true, count: "exact" })
          .eq("splik_id", splik.id);
        if (!cancelled && typeof count === "number") setHypeCount(count);
      } catch {}

      try {
        const { count } = await supabase
          .from("comments")
          .select("*", { head: true, count: "exact" })
          .eq("video_id", splik.id);
        if (!cancelled && typeof count === "number") setCommentCount(count);
      } catch {}

      if (user?.id) {
        try {
          const { data } = await supabase
            .from("hype_reactions")
            .select("id")
            .eq("splik_id", splik.id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (!cancelled) setHasHyped(!!data);
        } catch {}

        try {
          const { data } = await supabase
            .from("favorites")
            .select("id")
            .eq("video_id", splik.id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (!cancelled) setIsSaved(!!data);
        } catch {}
      }

      if (!cancelled) setLoadingCounts(false);
    };

    go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const { data: row } = await supabase
        .from("hype_reactions")
        .select("id")
        .eq("splik_id", splik.id)
        .eq("user_id", u.id)
        .maybeSingle();

      if (row?.id) {
        // remove
        await supabase.from("hype_reactions").delete().eq("id", row.id);
        setHasHyped(false);
        setHypeCount((c) => Math.max(0, c - 1));
      } else {
        await supabase
          .from("hype_reactions")
          .insert({ splik_id: splik.id, user_id: u.id, amount: 1 });
        setHasHyped(true);
        setHypeCount((c) => c + 1);
      }
    } catch (e: any) {
      if (e?.message !== "auth_required") {
        toast({ title: "Couldn’t update hype", variant: "destructive" });
      }
    }
  };

  const toggleSave = async () => {
    try {
      const u = await ensureAuth();
      const { data: row } = await supabase
        .from("favorites")
        .select("id")
        .eq("video_id", splik.id)
        .eq("user_id", u.id)
        .maybeSingle();

      if (row?.id) {
        await supabase.from("favorites").delete().eq("id", row.id);
        setIsSaved(false);
        toast({ title: "Removed from favorites" });
      } else {
        await supabase.from("favorites").insert({ video_id: splik.id, user_id: u.id });
        setIsSaved(true);
        toast({ title: "Saved to favorites" });
      }
    } catch (e: any) {
      if (e?.message !== "auth_required") {
        toast({ title: "Couldn’t save", variant: "destructive" });
      }
    }
  };

  const onToggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !isMuted;
    v.muted = next;
    setIsMuted(next);
    if (!next && !isPlaying) {
      // unmute implies intent—try to play
      v.play().catch(() => {});
    }
  };

  // Build creator link
  const creatorHref = splik?.profile?.username
    ? `/profile/${splik.profile.id}`
    : `/profile/${splik.user_id}`;

  return (
    <div ref={cardRef} className="rounded-xl bg-card/60 ring-1 ring-border/60 overflow-hidden">
      {/* Video */}
      <div className="relative">
        <video
          ref={videoRef}
          // poster reduces initial black flash while buffering
          poster={splik.thumbnail_url || undefined}
          className="block w-full h-[560px] sm:h-[640px] object-contain bg-black"
          src={shouldLoad ? splik.video_url : ""}
          playsInline
          muted
          loop
          preload="auto"
          controls={false}
          onClick={(e) => {
            e.stopPropagation();
            const v = videoRef.current;
            if (!v) return;
            if (isPlaying) { v.pause(); setIsPlaying(false); }
            else { v.play().then(() => setIsPlaying(true)).catch(() => {}); }
          }}
          onError={() => {
            // Fallback: enable controls so user can still play
            const v = videoRef.current;
            if (v) v.controls = true;
          }}
        />
        {/* mute button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
          className="absolute right-3 bottom-3 rounded-full bg-black/60 p-2 ring-1 ring-white/30"
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <VolumeX className="h-5 w-5 text-white" /> : <Volume2 className="h-5 w-5 text-white" />}
        </button>
      </div>

      {/* Creator row */}
      <div className="flex items-center gap-3 px-4 pt-3">
        <Link to={creatorHref} className="shrink-0">
          <img
            src={
              splik.profile?.avatar_url ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${splik.user_id}`
            }
            alt={splik.profile?.display_name || splik.profile?.username || "creator"}
            className="h-9 w-9 rounded-full ring-2 ring-primary/20"
          />
        </Link>
        <div className="min-w-0">
          <Link to={creatorHref} className="block font-medium hover:text-primary truncate">
            {splik.profile?.display_name || splik.profile?.username || "Creator"}
          </Link>
          {splik.title ? (
            <p className="text-sm text-muted-foreground truncate">{splik.title}</p>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 pt-3">
        <div className="flex items-center gap-2">
          <Button
            variant={hasHyped ? "default" : "outline"}
            size="sm"
            className={cn("gap-2", hasHyped && "bg-orange-500 text-white")}
            onClick={toggleHype}
            disabled={loadingCounts}
          >
            <Flame className="h-4 w-4" />
            {hypeCount}
          </Button>

          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link to={`/video/${splik.id}#comments`}>
              <MessageCircle className="h-4 w-4" />
              {commentCount}
            </Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={toggleSave}
          >
            {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            {isSaved ? "Saved" : "Save"}
          </Button>

          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={onShare}
            >
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          </div>
        </div>

        {/* Caption / description (optional) */}
        {splik.description ? (
          <p className="mt-3 text-sm">
            {splik.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
