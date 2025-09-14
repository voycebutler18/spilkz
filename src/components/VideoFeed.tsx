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
  trim_start?: number | null;
  trim_end?: number | null;
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

// Detect touch device (mobile browsers)
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

  // autoplay state - simplified for mobile
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [muted, setMuted] = useState<Record<number, boolean>>({});
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number>(-1);
  
  // Remove complex video ready state - let videos load naturally
  const [preloadedVideos, setPreloadedVideos] = useState<Set<number>>(new Set());

  // force-remount key to ensure DOM order changes on each shuffle
  const [orderEpoch, setOrderEpoch] = useState(0);

  // prewarmed feed (if your store provides it)
  const { feed: storeFeed } = useFeedStore() as { feed?: Splik[] };

  // Cleanup function for preload elements
  const preloadCleanupRef = useRef<(() => void)[]>([]);

  // Enhanced preload for better mobile performance
  useEffect(() => {
    if (spliks.length === 0) return;

    // Clean up previous preloads
    preloadCleanupRef.current.forEach((cleanup) => cleanup());
    preloadCleanupRef.current = [];

    // More aggressive preloading for mobile
    const preloadCount = isTouchDevice() ? 8 : 10;
    const domains = new Set<string>();

    spliks.slice(0, preloadCount).forEach((splik) => {
      try {
        const url = new URL(splik.video_url);
        domains.add(url.origin);
      } catch {
        // ignore bad URLs
      }
    });

    // Preconnect to all unique domains
    domains.forEach((domain) => {
      if (!document.querySelector(`link[rel="preconnect"][href="${domain}"]`)) {
        const link = document.createElement("link");
        link.rel = "preconnect";
        link.href = domain;
        document.head.appendChild(link);

        preloadCleanupRef.current.push(() => {
          if (link.parentNode) link.parentNode.removeChild(link);
        });
      }
    });

    // Also add DNS prefetch for faster resolution
    domains.forEach((domain) => {
      if (!document.querySelector(`link[rel="dns-prefetch"][href="${domain}"]`)) {
        const link = document.createElement("link");
        link.rel = "dns-prefetch";
        link.href = domain;
        document.head.appendChild(link);

        preloadCleanupRef.current.push(() => {
          if (link.parentNode) link.parentNode.removeChild(link);
        });
      }
    });

    return () => {
      preloadCleanupRef.current.forEach((cleanup) => cleanup());
      preloadCleanupRef.current = [];
    };
  }, [spliks]);

  // Try store → sessionStorage → network (only if needed)
  useEffect(() => {
    let cancelled = false;

    // helper to set UI state consistently
    const primeUI = (rows: Splik[]) => {
      const mutedState: Record<number, boolean> = {};
      rows.forEach((_, index) => {
        mutedState[index] = true; // All videos start muted for autoplay
      });
      setMuted(mutedState);
      setCurrentPlayingIndex(-1);
      setPreloadedVideos(new Set());
      setOrderEpoch((e) => e + 1);

      try {
        containerRef.current?.scrollTo({ top: 0, behavior: "auto" });
      } catch {
        containerRef.current?.scrollTo(0, 0);
      }
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

    const ABORT_TIMEOUT_MS = 10000;

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
        const t = setTimeout(() => controller.abort(), ABORT_TIMEOUT_MS);

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

        // Fetch profiles in a second call
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
      } catch (e: any) {
        if (e?.name === "AbortError") {
          console.warn("Feed request aborted (timeout).");
        } else {
          console.error("Feed fetch error:", e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, storeFeed]);

  /* ---------- favorites realtime for this user ---------- */
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

  // Simplified video setup - no complex ready state management
  const setupVideo = (video: HTMLVideoElement, index: number) => {
    // Prevent setup from running multiple times
    if (video.hasAttribute("data-setup")) return;
    
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("x5-video-player-type", "h5");
    video.setAttribute("x5-video-player-fullscreen", "false");
    video.setAttribute("x5-video-orientation", "portrait");
    video.disablePictureInPicture = true;
    video.preload = "auto"; // Changed to auto for smoother loading
    video.muted = true;
    video.controls = false;
    video.loop = false;
    
    video.removeAttribute("controls");
    video.oncontextmenu = (e) => e.preventDefault();
    
    // Mark as setup
    video.setAttribute("data-setup", "true");
    
    // Set initial time when metadata loads
    video.onloadedmetadata = () => {
      const startAt = Number(spliks[index]?.trim_start ?? 0);
      const resetAt = startAt ? Math.max(0.05, startAt) : 0.1;
      try {
        video.currentTime = resetAt;
      } catch {}
      
      // Mark as preloaded for smoother transitions
      setPreloadedVideos(prev => new Set(prev).add(index));
    };
  };

  // Simplified autoplay - focus on smooth transitions
  useEffect(() => {
    const container = containerRef.current;
    if (!container || spliks.length === 0) return;

    let activeVideo: HTMLVideoElement | null = null;
    let timeUpdateHandlers = new Map<HTMLVideoElement, () => void>();

    const pauseAllVideos = (except?: HTMLVideoElement) => {
      videoRefs.current.forEach((video) => {
        if (video && video !== except && !video.paused) {
          video.pause();
          const handler = timeUpdateHandlers.get(video);
          if (handler) {
            video.removeEventListener("timeupdate", handler);
            timeUpdateHandlers.delete(video);
          }
        }
      });
    };

    const playVideo = async (video: HTMLVideoElement, index: number) => {
      if (activeVideo === video) return;
      
      // Setup video if needed
      setupVideo(video, index);
      
      // Pause all other videos first
      pauseAllVideos(video);

      const startAt = Number(spliks[index]?.trim_start ?? 0);
      const resetAt = startAt ? Math.max(0.05, startAt) : 0.1;
      const loopDuration = 5; // 5 second loop

      // Set up time update handler for looping
      const onTimeUpdate = () => {
        const currentTime = video.currentTime;
        if (currentTime - startAt >= loopDuration) {
          try {
            video.currentTime = resetAt;
          } catch {}
        }
      };

      // Remove existing handler if any
      const existingHandler = timeUpdateHandlers.get(video);
      if (existingHandler) {
        video.removeEventListener("timeupdate", existingHandler);
      }

      video.addEventListener("timeupdate", onTimeUpdate);
      timeUpdateHandlers.set(video, onTimeUpdate);

      // Attempt to play immediately - let the browser handle loading
      try {
        video.currentTime = resetAt;
        const playPromise = video.play();
        if (playPromise) {
          await playPromise;
          activeVideo = video;
          setCurrentPlayingIndex(index);
        }
      } catch (e) {
        // If immediate play fails, wait for canplay event
        const onCanPlay = async () => {
          video.removeEventListener("canplay", onCanPlay);
          try {
            video.currentTime = resetAt;
            const playPromise = video.play();
            if (playPromise) {
              await playPromise;
              activeVideo = video;
              setCurrentPlayingIndex(index);
            }
          } catch (playErr) {
            console.warn("Video play failed:", playErr);
          }
        };
        video.addEventListener("canplay", onCanPlay);
      }
    };

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const idxAttr = (entry.target as HTMLElement).dataset.index;
        if (idxAttr == null) continue;

        const index = Number(idxAttr);
        if (!Number.isFinite(index) || index < 0 || index >= spliks.length) continue;

        const video = videoRefs.current[index];
        if (!video) continue;

        // Lower threshold for faster activation, higher for better UX
        if (entry.intersectionRatio > 0.6) {
          playVideo(video, index);
        } else if (video === activeVideo) {
          video.pause();
          setCurrentPlayingIndex(-1);
          
          const handler = timeUpdateHandlers.get(video);
          if (handler) {
            video.removeEventListener("timeupdate", handler);
            timeUpdateHandlers.delete(video);
          }
          
          if (activeVideo === video) {
            activeVideo = null;
          }
        }
      }
    };

    const observer = new IntersectionObserver(handleIntersection, {
      root: container,
      threshold: [0.5, 0.6, 0.7, 0.8],
      rootMargin: "-5% 0px -5% 0px", // Smaller margin for faster activation
    });

    // Observe all video sections
    const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-index]"));
    sections.forEach((section) => observer.observe(section));

    // Handle visibility changes
    const handleVisibilityChange = () => {
      if (document.hidden && activeVideo) {
        activeVideo.pause();
        setCurrentPlayingIndex(-1);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      timeUpdateHandlers.forEach((handler, video) => {
        video.removeEventListener("timeupdate", handler);
      });
      timeUpdateHandlers.clear();

      pauseAllVideos();
      activeVideo = null;
      setCurrentPlayingIndex(-1);
    };
  }, [spliks, orderEpoch]);

  const toggleMute = (i: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const v = videoRefs.current[i];
    if (!v) return;
    
    const newMutedState = !muted[i];
    
    // If unmuting, mute all other videos
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

  // favorites: optimistic + realtime-backed
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
        /* Hide all video controls globally */
        video::-webkit-media-controls {
          display: none !important;
        }
        video::-webkit-media-controls-panel {
          display: none !important;
        }
        video::-webkit-media-controls-play-button {
          display: none !important;
        }
        video::-webkit-media-controls-start-playback-button {
          display: none !important;
        }
        video::-webkit-media-controls-timeline {
          display: none !important;
        }
        video::-webkit-media-controls-current-time-display {
          display: none !important;
        }
        video::-webkit-media-controls-time-remaining-display {
          display: none !important;
        }
        video::-webkit-media-controls-volume-slider {
          display: none !important;
        }
        video::-webkit-media-controls-mute-button {
          display: none !important;
        }
        video::-webkit-media-controls-fullscreen-button {
          display: none !important;
        }
        video::-webkit-media-controls-toggle-closed-captions-button {
          display: none !important;
        }
        
        /* Hide Firefox controls */
        video::-moz-media-controls {
          display: none !important;
        }
        
        /* Ensure no controls show */
        video {
          outline: none !important;
        }
        video:focus {
          outline: none !important;
        }
        
        /* Prevent text selection on video tap */
        video {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          -webkit-tap-highlight-color: transparent;
        }
        
        /* Smooth video transitions - no black flicker */
        video {
          background: transparent !important;
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

                {/* video container - simplified, no thumbnail overlay */}
                <div className="relative bg-black aspect-[9/16] max-h-[600px]">
                  <video
                    ref={(el) => {
                      videoRefs.current[i] = el;
                      if (el) setupVideo(el, i);
                    }}
                    src={s.video_url}
                    poster={s.thumbnail_url || undefined} // Use native poster for smooth loading
                    className="w-full h-full object-cover"
                    style={{ 
                      zIndex: 1,
                      backgroundColor: "transparent" // Prevent black background
                    }}
                    playsInline
                    preload="auto" // Changed to auto for smoother experience
                    muted
                    disablePictureInPicture
                    controlsList="nodownload nofullscreen noremoteplayback"
                    onContextMenu={(e) => e.preventDefault()}
                  />

                  {/* Full-frame tap area for mute toggle */}
                  <button
                    className="absolute inset-0 w-full h-full bg-transparent z-10 outline-none"
                    onClick={(e) => toggleMute(i, e)}
                    aria-label={muted[i] ? "Unmute video" : "Mute video"}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  />

                  {/* Mute indicator */}
                  <div className="absolute bottom-3 right-3 bg-black/60 rounded-full p-2 z-20 pointer-events-none">
                    {muted[i] ? (
                      <VolumeX className="h-4 w-4 text-white" />
                    ) : (
                      <Volume2 className="h-4 w-4 text-white" />
                    )}
                  </div>

                  {/* Title overlay */}
                  {s.title && (
                    <div className="absolute bottom-3 left-3 z-20 pointer-events-none">
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

                      {/* Share */}
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

                    {/* Save / Saved */}
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
                      {isSaved ? (
                        <BookmarkCheck className="h-6 w-6" />
                      ) : (
                        <Bookmark className="h-6 w-6" />
                      )}
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
