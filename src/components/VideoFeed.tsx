// src/components/ui/VideoFeed.tsx
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Share2,
  Bookmark,
  BookmarkCheck,
  MoreVertical,
  Volume2,
  VolumeX,
  TrendingUp,
  Flame,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useFeedStore } from "@/store/feedStore";

/* ---------------- types ---------------- */
interface Splik {
  id: string;
  title: string;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  user_id: string;
  comments_count?: number | null;
  created_at: string;
  trim_start?: number | null;
  trim_end?: number | null;
  hype_count?: number | null;
  profile?: {
    id?: string;
    username?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

interface VideoFeedProps {
  user: any;
}

/* ---------- helpers ---------- */
const nameFor = (s: Splik) =>
  (s.profile?.display_name ||
    s.profile?.first_name ||
    s.profile?.username ||
    "Anonymous User")!.toString();

const initialsFor = (s: Splik) =>
  nameFor(s)
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const isTouchDevice = () =>
  typeof window !== "undefined" &&
  ("ontouchstart" in window || (navigator as any).maxTouchPoints > 0);

/* =================================================================== */

export default function VideoFeed({ user }: VideoFeedProps) {
  const { toast } = useToast();
  const navigate = useNavigate();

  const { feed, status, ensureFeed } = useFeedStore() as any;

  const [spliks, setSpliks] = useState<Splik[]>([]);
  const [loading, setLoading] = useState(true);

  // favorites & hypes UI (persist across refresh)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [hypedIds, setHypedIds] = useState<Set<string>>(new Set());
  const [hypingIds, setHypingIds] = useState<Set<string>>(new Set());

  // autoplay state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const activeRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState<Record<number, boolean>>({});
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number>(-1);

  // poster fade control
  const [isRendering, setIsRendering] = useState<Record<number, boolean>>({});

  // force-remount key to ensure DOM order changes on each shuffle
  const [orderEpoch, setOrderEpoch] = useState(0);

  // Cleanup function for preload <link> elements
  const preloadCleanupRef = useRef<(() => void)[]>([]);

  /* ----------------------- use store, not network ----------------------- */
  useEffect(() => {
    ensureFeed().catch(() => {});
  }, [ensureFeed]);

  useEffect(() => {
    const rows = Array.isArray(feed) ? (feed as Splik[]) : [];
    setSpliks(rows);

    // init per-item UI state once we have rows
    const mutedState: Record<number, boolean> = {};
    const renderingState: Record<number, boolean> = {};
    rows.forEach((_, i) => {
      mutedState[i] = true;
      renderingState[i] = false;
    });
    setMuted(mutedState);
    setIsRendering(renderingState);
    setCurrentPlayingIndex(-1);
    setOrderEpoch((e) => e + 1);
    setLoading(status !== "ready" && rows.length === 0);

    try {
      containerRef.current?.scrollTo({ top: 0, behavior: "auto" });
    } catch {
      containerRef.current?.scrollTo(0, 0);
    }
  }, [feed, status]);

  /* -------------------- networking preconnect (light) ------------------- */
  useEffect(() => {
    if (!spliks.length) return;

    preloadCleanupRef.current.forEach((fn) => fn());
    preloadCleanupRef.current = [];

    const preloadCount = isTouchDevice() ? 6 : 10;
    const domains = new Set<string>();

    spliks.slice(0, preloadCount).forEach((splik) => {
      try {
        const url = new URL(splik.video_url);
        domains.add(url.origin);
      } catch {}
    });

    domains.forEach((domain) => {
      if (!document.querySelector(`link[rel="preconnect"][href="${domain}"]`)) {
        const link = document.createElement("link");
        link.rel = "preconnect";
        link.href = domain;
        document.head.appendChild(link);
        preloadCleanupRef.current.push(() => link.remove());
      }
    });

    domains.forEach((domain) => {
      if (!document.querySelector(`link[rel="dns-prefetch"][href="${domain}"]`)) {
        const link = document.createElement("link");
        link.rel = "dns-prefetch";
        link.href = domain;
        document.head.appendChild(link);
        preloadCleanupRef.current.push(() => link.remove());
      }
    });

    return () => {
      preloadCleanupRef.current.forEach((fn) => fn());
      preloadCleanupRef.current = [];
    };
  }, [spliks]);

  /* ---------- favorites/hypes: initial fetch (fixes persistence) ---------- */
  useEffect(() => {
    if (!user?.id || spliks.length === 0) {
      setSavedIds(new Set());
      setHypedIds(new Set());
      return;
    }

    const ids = spliks.map((s) => s.id);

    (async () => {
      try {
        const [{ data: favs }, { data: hypes }] = await Promise.all([
          supabase
            .from("favorites")
            .select("video_id")
            .eq("user_id", user.id)
            .in("video_id", ids),
          supabase
            .from("hype_reactions")
            .select("splik_id")
            .eq("user_id", user.id)
            .in("splik_id", ids),
        ]);

        setSavedIds(new Set((favs || []).map((r: any) => String(r.video_id))));
        setHypedIds(new Set((hypes || []).map((r: any) => String(r.splik_id))));
      } catch {
        // non-blocking
      }
    })();
  }, [user?.id, spliks]);

  /* ---------- realtime sync for this user ---------- */
  useEffect(() => {
    if (!user?.id) return;

    const favCh = supabase
      .channel(`favorites-user-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "favorites", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const vid = (payload.new as any)?.video_id;
          if (vid) setSavedIds((prev) => new Set(prev).add(String(vid)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "favorites", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const vid = (payload.old as any)?.video_id;
          if (vid)
            setSavedIds((prev) => {
              const ns = new Set(prev);
              ns.delete(String(vid));
              return ns;
            });
        }
      )
      .subscribe();

    const hypeCh = supabase
      .channel(`hype-user-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "hype_reactions", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const sid = (payload.new as any)?.splik_id;
          if (sid) setHypedIds((prev) => new Set(prev).add(String(sid)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "hype_reactions", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const sid = (payload.old as any)?.splik_id;
          if (sid)
            setHypedIds((prev) => {
              const ns = new Set(prev);
              ns.delete(String(sid));
              return ns;
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(favCh);
      supabase.removeChannel(hypeCh);
    };
  }, [user?.id]);

  /** Prepare a video element for mobile-safe playback */
  const setupVideo = (video: HTMLVideoElement, index: number) => {
    if (!video || video.hasAttribute("data-setup")) return;

    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("x5-video-player-type", "h5");
    video.setAttribute("x5-video-player-fullscreen", "false");
    video.setAttribute("x5-video-player-orientation", "portrait");
    video.disablePictureInPicture = true;
    video.preload = "metadata";
    video.muted = true;
    video.controls = false;
    video.loop = true;
    video.removeAttribute("controls");
    video.oncontextmenu = (e) => e.preventDefault();

    video.addEventListener(
      "loadedmetadata",
      () => {
        const startAt = Number(spliks[index]?.trim_start ?? 0);
        const t = startAt ? Math.max(0.01, startAt) : 0.01;
        try {
          // @ts-ignore
          if (typeof (video as any).fastSeek === "function") (video as any).fastSeek(t);
          else video.currentTime = t;
        } catch {}
      },
      { once: true }
    );

    video.addEventListener(
      "playing",
      () => {
        setIsRendering((r) => ({ ...r, [index]: true }));
      },
      { once: true }
    );

    video.setAttribute("data-setup", "true");
  };

  /** Attach src if missing (for cards that were off-screen) */
  const ensureSrc = async (index: number) => {
    const v = videoRefs.current[index];
    const s = spliks[index];
    if (!v || !s) return v;
    if (!v.src) {
      v.src = s.video_url;
      v.preload = "metadata";
      try {
        v.load();
      } catch {}
    }
    return v;
  };

  /** Switch playback to index: start the next one first, then pause the old one */
  const switchTo = async (index: number) => {
    const next = await ensureSrc(index);
    if (!next) return;
    if (activeRef.current === next) return;

    setupVideo(next, index);

    // Prewarm the following element lightly
    const ahead = videoRefs.current[index + 1];
    if (ahead && !ahead.src) {
      const s = spliks[index + 1];
      if (s) {
        ahead.src = s.video_url;
        ahead.preload = "metadata";
      }
    }

    try {
      const startAt = Number(spliks[index]?.trim_start ?? 0);
      const t = startAt ? Math.max(0.01, startAt) : 0.01;
      try {
        // @ts-ignore
        if (typeof (next as any).fastSeek === "function") (next as any).fastSeek(t);
        else next.currentTime = t;
      } catch {}

      await next.play();

      if (activeRef.current && activeRef.current !== next && !activeRef.current.paused) {
        activeRef.current.pause();
      }

      activeRef.current = next;
      setCurrentPlayingIndex(index);
    } catch {
      // ignore rapid scroll races
    }
  };

  // Always play the most visible section (TikTok-style)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || spliks.length === 0) return;

    const visibility = new Map<number, number>();

    const handle = (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const idxAttr = (entry.target as HTMLElement).dataset.index;
        if (idxAttr == null) continue;
        const index = Number(idxAttr);
        if (!Number.isFinite(index)) continue;
        visibility.set(index, entry.intersectionRatio);
      }
      let best = -1;
      let bestRatio = 0;
      for (const [i, r] of visibility) {
        if (r > bestRatio) {
          best = i;
          bestRatio = r;
        }
      }
      if (best >= 0 && bestRatio > 0.55) {
        switchTo(best);
      }
    };

    const observer = new IntersectionObserver(handle, {
      root: container,
      threshold: [0.25, 0.5, 0.6, 0.75, 0.9],
      rootMargin: "-5% 0px -5% 0px",
    });

    const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-index]"));
    sections.forEach((section) => observer.observe(section));

    const onVisibility = () => {
      if (document.hidden && activeRef.current) {
        activeRef.current.pause();
        setCurrentPlayingIndex(-1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (activeRef.current) {
        activeRef.current.pause();
      }
      setCurrentPlayingIndex(-1);
    };
  }, [spliks, orderEpoch]);

  const toggleMute = (i: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const v = videoRefs.current[i];
    if (!v) return;

    const newMutedState = !muted[i];

    if (!newMutedState) {
      videoRefs.current.forEach((video, index) => {
        if (video && index !== i) {
          video.muted = true;
          setMuted((m) => ({ ...m, [index]: true }));
        }
      });
    }

    v.muted = newMutedState;
    setMuted((m) => ({ ...m, [i]: newMutedState }));
  };

  /* ---------------- Share handler (Web Share API w/ fallback) ---------------- */
  const handleShare = async (s: Splik) => {
    const url = `${window.location.origin.replace(/\/$/, "")}/splik/${s.id}`;
    const navAny = navigator as any;
    try {
      if (navAny.share) {
        await navAny.share({
          title: s.title || "Splikz",
          text: s.description || "Check this video on Splikz",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied!" });
      }
    } catch {
      // user canceled or not available — no toast needed
    }
  };

  /* ---------------- actions: Save + Hype ---------------- */
  const toggleFavorite = async (videoId: string) => {
    if (!user?.id) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save videos",
        variant: "destructive",
      });
      return;
    }
    if (savingIds.has(videoId)) return;

    setSavingIds((s) => new Set(s).add(videoId));

    const currentlySaved = savedIds.has(videoId);
    setSavedIds((prev) => {
      const ns = new Set(prev);
      currentlySaved ? ns.delete(videoId) : ns.add(videoId);
      return ns;
    });

    try {
      if (currentlySaved) {
        await supabase.from("favorites").delete().eq("user_id", user.id).eq("video_id", videoId);
        toast({ title: "Removed from favorites" });
      } else {
        await supabase.from("favorites").insert({ user_id: user.id, video_id: videoId });
        toast({ title: "Added to favorites" });
      }
    } catch {
      // revert
      setSavedIds((prev) => {
        const ns = new Set(prev);
        currentlySaved ? ns.add(videoId) : ns.delete(videoId);
        return ns;
      });
      toast({ title: "Error", description: "Failed to update favorites", variant: "destructive" });
    } finally {
      setSavingIds((s) => {
        const ns = new Set(s);
        ns.delete(videoId);
        return ns;
      });
    }
  };

  const toggleHype = async (splikId: string) => {
    if (!user?.id) {
      toast({
        title: "Sign in required",
        description: "Please sign in to hype videos",
        variant: "destructive",
      });
      return;
    }
    if (hypingIds.has(splikId)) return;

    setHypingIds((s) => new Set(s).add(splikId));
    const currentlyHyped = hypedIds.has(splikId);

    setHypedIds((prev) => {
      const ns = new Set(prev);
      currentlyHyped ? ns.delete(splikId) : ns.add(splikId);
      return ns;
    });

    try {
      if (currentlyHyped) {
        await supabase
          .from("hype_reactions")
          .delete()
          .eq("user_id", user.id)
          .eq("splik_id", splikId);
      } else {
        await supabase.from("hype_reactions").insert({ user_id: user.id, splik_id: splikId, amount: 1 });
      }
    } catch {
      // revert on error
      setHypedIds((prev) => {
        const ns = new Set(prev);
        currentlyHyped ? ns.add(splikId) : ns.delete(splikId);
        return ns;
      });
      toast({ title: "Error", description: "Failed to update hype", variant: "destructive" });
    } finally {
      setHypingIds((s) => {
        const ns = new Set(s);
        ns.delete(splikId);
        return ns;
      });
    }
  };

  /* ------------------------------ UI ------------------------------ */
  if (loading && spliks.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  // Attach src only for the active card and its neighbor.
  const shouldAttachSrc = (i: number) => {
    const p = currentPlayingIndex;
    return p < 0 ? i <= 1 : Math.abs(i - p) <= 1;
  };

  return (
    <>
      <style>{`
        /* Hide all native video controls */
        video::-webkit-media-controls,
        video::-webkit-media-controls-panel,
        video::-webkit-media-controls-play-button,
        video::-webkit-media-controls-start-playback-button,
        video::-webkit-media-controls-timeline,
        video::-webkit-media-controls-current-time-display,
        video::-webkit-media-controls-time-remaining-display,
        video::-webkit-media-controls-volume-slider,
        video::-webkit-media-controls-mute-button,
        video::-webkit-media-controls-fullscreen-button,
        video::-webkit-media-controls-toggle-closed-captions-button,
        video::-webkit-media-controls-loading-panel {
          display: none !important;
          -webkit-appearance: none;
        }
        video::-moz-media-controls { display: none !important; }
        video {
          outline: none !important;
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          -webkit-tap-highlight-color: transparent;
          background: transparent !important;
          backface-visibility: hidden;
          transform: translateZ(0);
          will-change: transform;
        }
      `}</style>

      <div
        ref={containerRef}
        className="h-[100svh] overflow-y-auto snap-y snap-mandatory scroll-smooth bg-background"
      >
        {spliks.map((s, i) => {
          const isSaved = savedIds.has(s.id);
          const saving = savingIds.has(s.id);
          const isHyped = hypedIds.has(s.id);
          const hyping = hypingIds.has(s.id);
          const isCreator = user?.id === s.user_id;

          const attach = shouldAttachSrc(i);
          const preloadValue = attach ? "metadata" : "none";

          return (
            <section
              key={`${orderEpoch}-${i}-${s.id}`}
              data-index={i}
              className="snap-start min-h-[100svh] w-full flex items-center justify-center"
            >
              <Card className="overflow-hidden border-0 shadow-lg w-full max-w-lg mx-auto">
                {/* header */}
                <div className="flex items-center justify-between p-3 border-b">
                  <Link
                    to={`/creator/${s.profile?.username || s.user_id}`}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{initialsFor(s)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold">{nameFor(s)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </Link>
                  <Button size="icon" variant="ghost" title="More">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </div>

                {/* video container */}
                <div className="relative bg-black aspect-[9/16] max-h-[600px]">
                  {s.thumbnail_url && (
                    <img
                      src={s.thumbnail_url}
                      alt=""
                      className={`absolute inset-0 w-full h-full object-cover z-20 transition-opacity duration-150 ease-linear pointer-events-none ${
                        isRendering[i] ? "opacity-0" : "opacity-100"
                      }`}
                      draggable={false}
                    />
                  )}

                  <video
                    ref={(el) => {
                      videoRefs.current[i] = el;
                      if (el) setupVideo(el, i);
                    }}
                    src={attach ? s.video_url : undefined}
                    poster={undefined}
                    className="w-full h-full object-cover"
                    playsInline
                    preload={preloadValue as any}
                    muted
                    disablePictureInPicture
                    controlsList="nodownload nofullscreen noremoteplayback"
                    onContextMenu={(e) => e.preventDefault()}
                  />

                  {/* Full-frame tap area for mute toggle */}
                  <button
                    className="absolute inset-0 w-full h-full bg-transparent z-30 outline-none"
                    onClick={(e) => toggleMute(i, e)}
                    aria-label={muted[i] ? "Unmute video" : "Mute video"}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  />

                  {/* MOBILE share chip in the top-right (replaces bottom share) */}
                  <button
                    onClick={() => handleShare(s)}
                    className="md:hidden absolute top-3 right-3 z-40 rounded-full px-3 py-1.5 bg-black/70 text-white text-sm font-medium
                               border border-white/20 shadow-lg active:scale-95"
                    aria-label="Share"
                  >
                    Share
                  </button>

                  {/* Mute indicator (bottom-right) */}
                  <div className="absolute bottom-3 right-3 bg-black/60 rounded-full p-2 z-40 pointer-events-none">
                    {muted[i] ? (
                      <VolumeX className="h-4 w-4 text-white" />
                    ) : (
                      <Volume2 className="h-4 w-4 text-white" />
                    )}
                  </div>

                  {/* Title overlay */}
                  {s.title && (
                    <div className="absolute bottom-3 left-3 z-40 pointer-events-none">
                      <div className="bg-black/60 rounded px-2 py-1 max-w-[200px]">
                        <p className="text-white text-sm font-medium truncate">{s.title}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* actions */}
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Promote — only creator sees it */}
                      {isCreator && (
                        <Button
                          size="sm"
                          className="gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                          onClick={() => navigate(`/promote/${s.id}`)}
                          title="Promote this video"
                        >
                          <TrendingUp className="h-4 w-4" />
                          Promote
                        </Button>
                      )}

                      {/* Hype */}
                      <Button
                        size="sm"
                        variant={isHyped ? "default" : "outline"}
                        onClick={() => toggleHype(s.id)}
                        disabled={hyping}
                        className={isHyped ? "bg-orange-500 hover:bg-orange-600 text-white gap-1" : "gap-1"}
                        aria-pressed={isHyped}
                        title="Hype"
                      >
                        <Flame className={isHyped ? "h-4 w-4 text-white" : "h-4 w-4"} />
                        <span>{s.hype_count ?? 0}</span>
                      </Button>

                      {/* Desktop/Tablet Share button (hidden on mobile) */}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleShare(s)}
                        className="hidden md:inline-flex hover:text-green-500"
                        title="Share"
                      >
                        <Share2 className="h-6 w-6" />
                      </Button>
                    </div>

                    {/* Save / Saved */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleFavorite(s.id)}
                        disabled={saving}
                        className={isSaved ? "text-yellow-400 hover:text-yellow-500" : "hover:text-yellow-500"}
                        aria-pressed={isSaved}
                        aria-label={isSaved ? "Saved" : "Save"}
                        title={isSaved ? "Saved" : "Save"}
                      >
                        {isSaved ? <BookmarkCheck className="h-6 w-6" /> : <Bookmark className="h-6 w-6" />}
                      </Button>
                    </div>
                  </div>

                  {/* Send a note */}
                  <div className="pt-1">
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <Link
                        to={`/notes?to=${s.user_id}&msg=${encodeURIComponent(
                          `About your video "${s.title || ""}": `
                        )}`}
                      >
                        Send a note
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>
            </section>
          );
        })}
      </div>
    </>
  );
}
