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
  trim_start?: number | null; // seconds
  trim_end?: number | null;   // seconds
  hype_count?: number;
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

const normalizeSpliks = (rows: Splik[]): Splik[] =>
  (rows ?? [])
    .filter(Boolean)
    .map((r) => ({
      ...r,
      comments_count: Number.isFinite(r?.comments_count as any) ? (r!.comments_count as number) : 0,
      profile:
        r.profile ?? {
          id: r.user_id,
          username: null,
          display_name: null,
          first_name: null,
          last_name: null,
          avatar_url: null,
        },
    }));

const cRandom = () => {
  if (typeof crypto !== "undefined" && (crypto as any).getRandomValues) {
    const u = new Uint32Array(1);
    (crypto as any).getRandomValues(u);
    return u[0] / 2 ** 32;
  }
  return Math.random();
};

const shuffle = <T,>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(cRandom() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const isTouchDevice = () =>
  typeof window !== "undefined" &&
  ("ontouchstart" in window || (navigator as any).maxTouchPoints > 0);

/* =================================================================== */

export default function VideoFeed({ user }: VideoFeedProps) {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [spliks, setSpliks] = useState<Splik[]>([]);
  const [loading, setLoading] = useState(true);

  // favorites UI
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // playback
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const activeRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState<Record<number, boolean>>({});
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number>(-1);

  // poster overlays: true = poster visible
  const [showPoster, setShowPoster] = useState<Record<number, boolean>>({});
  // primed once (decoder warmed)
  const primedRef = useRef<Record<number, boolean>>({});
  // started at least once (avoid “replay” seeks)
  const hasStartedRef = useRef<Record<number, boolean>>({});
  // cancel functions for soft loops
  const cancelLoopRef = useRef<Record<number, (() => void) | undefined>>({});

  // remount key
  const [orderEpoch, setOrderEpoch] = useState(0);

  const { feed: storeFeed } = useFeedStore() as { feed?: Splik[] };

  /* -------------------- networking preconnect -------------------- */
  const preloadCleanupRef = useRef<(() => void)[]>([]);
  useEffect(() => {
    if (!spliks.length) return;
    preloadCleanupRef.current.forEach((fn) => fn());
    preloadCleanupRef.current = [];
    const count = isTouchDevice() ? 6 : 10;
    const domains = new Set<string>();
    spliks.slice(0, count).forEach((s) => {
      try {
        const u = new URL(s.video_url);
        domains.add(u.origin);
      } catch {}
    });
    domains.forEach((d) => {
      if (!document.querySelector(`link[rel="preconnect"][href="${d}"]`)) {
        const l = document.createElement("link");
        l.rel = "preconnect";
        l.href = d;
        document.head.appendChild(l);
        preloadCleanupRef.current.push(() => l.remove());
      }
    });
    domains.forEach((d) => {
      if (!document.querySelector(`link[rel="dns-prefetch"][href="${d}"]`)) {
        const l = document.createElement("link");
        l.rel = "dns-prefetch";
        l.href = d;
        document.head.appendChild(l);
        preloadCleanupRef.current.push(() => l.remove());
      }
    });
    return () => {
      preloadCleanupRef.current.forEach((fn) => fn());
      preloadCleanupRef.current = [];
    };
  }, [spliks]);

  /* --------------------------- load feed -------------------------- */
  useEffect(() => {
    let cancelled = false;

    const primeUI = (rows: Splik[]) => {
      const m: Record<number, boolean> = {};
      const posters: Record<number, boolean> = {};
      rows.forEach((_, i) => {
        m[i] = true;         // start muted so autoplay works
        posters[i] = true;   // poster visible until first painted frame
      });
      setMuted(m);
      setShowPoster(posters);
      primedRef.current = {};
      hasStartedRef.current = {};
      cancelLoopRef.current = {};
      setCurrentPlayingIndex(-1);
      setOrderEpoch((e) => e + 1);
      containerRef.current?.scrollTo({ top: 0, behavior: "auto" });
    };

    const readCache = (): Splik[] | null => {
      if (Array.isArray(storeFeed) && storeFeed.length > 0) {
        return shuffle(normalizeSpliks(storeFeed));
      }
      try {
        const raw = sessionStorage.getItem("feed:cached");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          return shuffle(normalizeSpliks(parsed as Splik[]));
        }
      } catch {}
      return null;
    };

    const writeCache = (rows: Splik[]) => {
      try {
        sessionStorage.setItem("feed:cached", JSON.stringify(rows.slice(0, 40)));
      } catch {}
    };

    const backgroundRefreshFavs = async () => {
      try {
        if (user?.id) {
          const { data: favs } = await supabase
            .from("favorites")
            .select("video_id")
            .eq("user_id", user.id);
          if (favs) setSavedIds(new Set(favs.map((f: any) => String(f.video_id))));
        }
      } catch {}
    };

    const ABORT_MS = 10000;

    const load = async () => {
      const cached = readCache();
      if (cached && !cancelled) {
        setSpliks(cached);
        setLoading(false);
        primeUI(cached);
        backgroundRefreshFavs();
        return;
      }

      setLoading(true);
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), ABORT_MS);

        const limit = isTouchDevice() ? 20 : 40;
        const { data: base, error: baseErr } = await supabase
          .from("spliks")
          .select(
            "id,user_id,title,description,video_url,thumbnail_url,trim_start,trim_end,created_at"
          )
          .order("created_at", { ascending: false })
          .limit(limit)
          .abortSignal(controller.signal);

        clearTimeout(t);
        if (baseErr) throw baseErr;

        const rows = (base || []) as Splik[];

        const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
        let byId: Record<string, any> = {};
        if (userIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id,username,display_name,first_name,last_name,avatar_url")
            .in("id", userIds);
          (profs || []).forEach((p: any) => (byId[p.id] = p));
        }

        const stitched = rows.map((r) => ({ ...r, profile: byId[r.user_id] || null }));
        const normalized = normalizeSpliks(stitched);
        const shuffled = shuffle(normalized);

        if (!cancelled) {
          setSpliks(shuffled);
          primeUI(shuffled);
          writeCache(normalized);
        }

        backgroundRefreshFavs();
      } catch (e) {
        console.error("Feed fetch error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, storeFeed]);

  /* --------------------------- realtime favs --------------------------- */
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
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
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  /* ---------------------- video helpers (mobile safe) ---------------------- */
  const softLoop = (video: HTMLVideoElement, start: number, end: number) => {
    // cancel previous loop if any
    const idx = videoRefs.current.indexOf(video);
    if (idx >= 0 && cancelLoopRef.current[idx]) cancelLoopRef.current[idx]!();

    let cancelled = false;
    const margin = 0.045; // ~45ms before boundary
    const tick = () => {
      if (cancelled || video.paused) return;
      const t = video.currentTime;
      if (t >= end - margin) {
        try {
          const target = start + 0.01;
          // @ts-ignore
          if (typeof video.fastSeek === "function") video.fastSeek(target);
          else video.currentTime = target;
        } catch {}
      }
      // @ts-ignore
      if (typeof video.requestVideoFrameCallback === "function") {
        // @ts-ignore
        video.requestVideoFrameCallback(tick);
      } else {
        setTimeout(tick, 30);
      }
    };
    // @ts-ignore
    if (typeof video.requestVideoFrameCallback === "function") {
      // @ts-ignore
      video.requestVideoFrameCallback(tick);
    } else {
      setTimeout(tick, 30);
    }
    cancelLoopRef.current[idx] = () => {
      cancelled = true;
    };
  };

  const setupVideo = (video: HTMLVideoElement, index: number) => {
    if (!video || video.hasAttribute("data-setup")) return;

    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("x5-video-player-type", "h5");
    video.setAttribute("x5-video-player-fullscreen", "false");
    video.setAttribute("x5-video-orientation", "portrait");
    video.disablePictureInPicture = true;
    video.preload = "auto";
    video.muted = true;
    video.controls = false;
    video.removeAttribute("controls");
    video.oncontextmenu = (e) => e.preventDefault();

    const startAt = Number(spliks[index]?.trim_start ?? 0) || 0;
    const endAt =
      typeof spliks[index]?.trim_end === "number" && (spliks[index]!.trim_end as number) > startAt
        ? (spliks[index]!.trim_end as number)
        : null;

    // Seek to start once metadata is ready (only before first play)
    video.addEventListener(
      "loadedmetadata",
      () => {
        if (!hasStartedRef.current[index]) {
          try {
            const t = Math.max(0.01, startAt);
            // @ts-ignore
            if (typeof video.fastSeek === "function") video.fastSeek(t);
            else video.currentTime = t;
          } catch {}
        }
      },
      { once: true }
    );

    // Only drop poster after the first frame is *painted*
    const revealWhenPainted = () => {
      // @ts-ignore
      if (typeof video.requestVideoFrameCallback === "function") {
        // @ts-ignore
        video.requestVideoFrameCallback(() => {
          setShowPoster((m) => ({ ...m, [index]: false }));
        });
      } else {
        const onTU = () => {
          if (video.currentTime > 0) {
            setShowPoster((m) => ({ ...m, [index]: false }));
            video.removeEventListener("timeupdate", onTU);
          }
        };
        video.addEventListener("timeupdate", onTU);
      }
    };
    video.addEventListener("playing", revealWhenPainted, { once: true });

    // Looping behavior
    if (endAt == null) {
      video.loop = true; // full-asset loop without seek
    } else {
      video.loop = false;
      video.addEventListener(
        "playing",
        () => softLoop(video, Math.max(0.01, startAt), Math.max(startAt + 0.05, endAt)),
        { once: true }
      );
    }

    video.setAttribute("data-setup", "true");
  };

  /** Prime video: play exactly 1 frame, then pause (decoder warm). */
  const primeVideo = async (index: number) => {
    if (primedRef.current[index]) return;
    const v = videoRefs.current[index];
    if (!v) return;
    setupVideo(v, index);

    try {
      // start muted 1-frame play
      await v.play();
      // @ts-ignore
      if (typeof v.requestVideoFrameCallback === "function") {
        // @ts-ignore
        await new Promise<void>((resolve) => v.requestVideoFrameCallback(() => resolve()));
      } else {
        await new Promise((r) => setTimeout(r, 50));
      }
      v.pause();
      primedRef.current[index] = true;
    } catch {
      // ignore (browser may refuse when off-screen; we'll try again)
    }
  };

  /** Start next video FIRST, then pause old one (no black gap). */
  const switchTo = async (index: number) => {
    const next = videoRefs.current[index];
    if (!next) return;
    if (activeRef.current === next) return;

    setupVideo(next, index);

    // only seek if not started before
    if (!hasStartedRef.current[index]) {
      const startAt = Number(spliks[index]?.trim_start ?? 0) || 0;
      try {
        const t = Math.max(0.01, startAt);
        // @ts-ignore
        if (typeof next.fastSeek === "function") next.fastSeek(t);
        else next.currentTime = t;
      } catch {}
    }

    try {
      await next.play();
      hasStartedRef.current[index] = true;

      // pause previous after next is playing
      if (activeRef.current && activeRef.current !== next && !activeRef.current.paused) {
        activeRef.current.pause();
      }
      activeRef.current = next;
      setCurrentPlayingIndex(index);

      // Predictively prime neighbors
      primeVideo(index + 1);
      primeVideo(index - 1);
    } catch {
      // ignore quick scroll races
    }
  };

  /* ------------------ center-based selection like TikTok ------------------ */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || spliks.length === 0) return;

    let ticking = false;

    const calcAndPlay = () => {
      ticking = false;
      const view = container.getBoundingClientRect();
      const viewportCenter = view.top + view.height / 2;

      // find section whose center is closest to viewport center
      let bestIdx = -1;
      let bestDist = Number.POSITIVE_INFINITY;

      sectionRefs.current.forEach((sec, i) => {
        if (!sec) return;
        const r = sec.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const dist = Math.abs(center - viewportCenter);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      });

      if (bestIdx >= 0) {
        switchTo(bestIdx);
        // Aggressive lookahead: prime the next 2
        primeVideo(bestIdx + 1);
        primeVideo(bestIdx + 2);
      }
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(calcAndPlay);
      }
    };

    // initial
    calcAndPlay();
    container.addEventListener("scroll", onScroll, { passive: true });

    const onVisibility = () => {
      if (document.hidden && activeRef.current) {
        activeRef.current.pause();
        setCurrentPlayingIndex(-1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      container.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      if (activeRef.current) activeRef.current.pause();
      setCurrentPlayingIndex(-1);
    };
  }, [spliks, orderEpoch]);

  const toggleMute = (i: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const v = videoRefs.current[i];
    if (!v) return;
    const newMuted = !muted[i];

    if (!newMuted) {
      videoRefs.current.forEach((vid, idx) => {
        if (vid && idx !== i) vid.muted = true;
      });
      setMuted((m) => {
        const ns = { ...m };
        Object.keys(ns).forEach((k) => (ns[Number(k)] = true));
        ns[i] = false;
        return ns;
      });
    } else {
      v.muted = true;
      setMuted((m) => ({ ...m, [i]: true }));
    }
  };

  // favorites
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

  /* ------------------------------ UI ------------------------------ */
  if (loading && spliks.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      <style>{`
        /* Hide native controls everywhere */
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
          -webkit-user-select: none; user-select: none;
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
          const isCreator = user?.id === s.user_id;

          return (
            <section
              key={`${orderEpoch}-${i}-${s.id}`}
              data-index={i}
              ref={(el) => (sectionRefs.current[i] = el)}
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
                <div className="relative bg-black aspect-[9/16] max-h=[600px]">
                  {/* Poster overlay on top until first frame is painted */}
                  {s.thumbnail_url && (
                    <img
                      src={s.thumbnail_url}
                      alt=""
                      className={`absolute inset-0 w-full h-full object-cover z-20 transition-opacity duration-150 ease-linear pointer-events-none ${
                        showPoster[i] ? "opacity-100" : "opacity-0"
                      }`}
                      draggable={false}
                    />
                  )}

                  <video
                    ref={(el) => {
                      videoRefs.current[i] = el;
                      if (el) setupVideo(el, i);
                    }}
                    src={s.video_url}
                    poster={undefined}
                    className="w-full h-full object-cover"
                    playsInline
                    preload="auto"
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

                  {/* Mute indicator */}
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
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
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

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          const url = `${window.location.origin.replace(/\/$/, "")}/splik/${s.id}`;
                          navigator.clipboard.writeText(url);
                          toast({ title: "Link copied!" });
                        }}
                        className="hover:text-green-500"
                        title="Share"
                      >
                        <Share2 className="h-6 w-6" />
                      </Button>
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => toggleFavorite(s.id)}
                      disabled={saving}
                      className={
                        isSaved ? "text-yellow-400 hover:text-yellow-500" : "hover:text-yellow-500"
                      }
                      aria-pressed={isSaved}
                      aria-label={isSaved ? "Saved" : "Save"}
                      title={isSaved ? "Saved" : "Save"}
                    >
                      {isSaved ? <BookmarkCheck className="h-6 w-6" /> : <Bookmark className="h-6 w-6" />}
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
