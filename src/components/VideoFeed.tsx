
// src/components/ui/VideoFeed.tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  Play,
  Pause,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
      comments_count:
        Number.isFinite(r?.comments_count as any) ? (r!.comments_count as number) : 0,
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

  const [spliks, setSpliks] = useState<Splik[]>([]);
  const [loading, setLoading] = useState(true);

  // favorites UI
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // autoplay state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [muted, setMuted] = useState<Record<number, boolean>>({});
  const [isPlaying, setIsPlaying] = useState<Record<number, boolean>>({});
  const [showPauseButton, setShowPauseButton] = useState<Record<number, boolean>>({});
  const pauseTimeoutRefs = useRef<Record<number, NodeJS.Timeout>>({});

  // NEW: fade-in control — true when first frame is painted
  const [frameReady, setFrameReady] = useState<Record<number, boolean>>({});

  // force-remount key to ensure DOM order changes on each shuffle
  const [orderEpoch, setOrderEpoch] = useState(0);

  // prewarmed feed
  const { feed: storeFeed } = useFeedStore();

  // 🔸 Batch preloading state
  const BATCH_SIZE = 20;
  const [loadedBatches, setLoadedBatches] = useState<Set<number>>(new Set([0])); // load first batch
  const [preloadingVideos, setPreloadingVideos] = useState<Set<number>>(new Set());

  // Try store → sessionStorage → network (only if needed)
  useEffect(() => {
    let cancelled = false;

    // helper to set UI state consistently
    const primeUI = (rows: Splik[]) => {
      const ordered = rows;
      const mutedState: Record<number, boolean> = {};
      const pauseState: Record<number, boolean> = {};
      const touch = isTouchDevice();
      ordered.forEach((_, index) => {
        mutedState[index] = touch ? true : false; // mobile default muted
        pauseState[index] = true;
      });
      setMuted(mutedState);
      setShowPauseButton(pauseState);
      setFrameReady({}); // reset ready map

      setOrderEpoch((e) => e + 1);
      containerRef.current?.scrollTo({ top: 0, behavior: "instant" as any });
    };

    const hydrateFromCacheIfPossible = (): Splik[] | null => {
      if (Array.isArray(storeFeed) && storeFeed.length > 0) {
        return normalizeSpliks(storeFeed as Splik[]);
      }
      try {
        const raw = sessionStorage.getItem("feed:cached");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            return normalizeSpliks(parsed as Splik[]);
          }
        }
      } catch {}
      return null;
    };

    const backgroundRefresh = async () => {
      try {
        if (user?.id) {
          const { data: favs } = await supabase
            .from("favorites")
            .select("splik_id")
            .eq("user_id", user.id);
          if (favs) setSavedIds(new Set(favs.map((f: any) => f.splik_id)));
        }
      } catch {}
    };

    const load = async () => {
      const cached = hydrateFromCacheIfPossible();
      if (cached && !cancelled) {
        setSpliks(cached);
        setLoading(false);
        primeUI(cached);
        backgroundRefresh();
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("spliks")
          .select(`
            id, user_id, title, description, video_url, thumbnail_url,
            trim_start, trim_end, created_at,
            profile:profiles(
              id, username, display_name, first_name, avatar_url
            )
          `);

        if (error) throw error;

        const all = normalizeSpliks((data as Splik[]) || []);
        const ordered = shuffle(all);

        if (!cancelled) {
          setSpliks(ordered);
          primeUI(ordered);
        }
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

  /* ---------- favorites realtime for this user ---------- */
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`favorites-user-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "favorites", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const sid = (payload.new as any)?.splik_id;
          if (sid) setSavedIds((prev) => new Set(prev).add(sid));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "favorites", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const sid = (payload.old as any)?.splik_id;
          if (sid)
            setSavedIds((prev) => {
              const ns = new Set(prev);
              ns.delete(sid);
              return ns;
            });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  // Mute all other videos
  const muteOtherVideos = (exceptIndex: number) => {
    videoRefs.current.forEach((video, index) => {
      if (video && index !== exceptIndex) {
        video.muted = true;
        video.pause();
        setIsPlaying((prev) => ({ ...prev, [index]: false }));
      }
    });
  };

  /* ===================== Batch preloading ===================== */
  const preloadVideoBatch = async (batchIndex: number) => {
    if (loadedBatches.has(batchIndex)) return;

    const startIdx = batchIndex * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, spliks.length);

    setLoadedBatches((prev) => {
      const ns = new Set(prev);
      ns.add(batchIndex);
      return ns;
    });

    for (let i = startIdx; i < endIdx; i++) {
      if (!preloadingVideos.has(i)) {
        setPreloadingVideos((prev) => {
          const ns = new Set(prev);
          ns.add(i);
          return ns;
        });

        const preloadVideo = document.createElement("video");
        preloadVideo.preload = "auto";
        preloadVideo.muted = true;
        preloadVideo.playsInline = true;
        // @ts-expect-error iOS attribute
        preloadVideo.setAttribute("webkit-playsinline", "true");
        preloadVideo.src = spliks[i]?.video_url;

        preloadVideo.addEventListener(
          "loadeddata",
          () => {
            const startAt = Number(spliks[i]?.trim_start ?? 0);
            const resetAt = startAt ? Math.max(0.05, startAt) : 0.1;
            try {
              preloadVideo.currentTime = resetAt;
            } catch {}
          },
          { once: true }
        );

        const finish = () => {
          setPreloadingVideos((prev) => {
            const ns = new Set(prev);
            ns.delete(i);
            return ns;
          });
          preloadVideo.remove();
        };

        preloadVideo.addEventListener("canplaythrough", finish, { once: true });
        preloadVideo.addEventListener("error", finish, { once: true });

        preloadVideo.style.display = "none";
        document.body.appendChild(preloadVideo);
      }
    }
  };

  // Scroll-based batch loading & initial batch
  useEffect(() => {
    const container = containerRef.current;
    if (!container || spliks.length === 0) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const currentVideoIndex = Math.floor(scrollTop / containerHeight);
      const currentBatch = Math.floor(currentVideoIndex / BATCH_SIZE);
      const batchProgress = (currentVideoIndex % BATCH_SIZE) / BATCH_SIZE;
      if (batchProgress > 0.75) {
        const nextBatch = currentBatch + 1;
        if (nextBatch * BATCH_SIZE < spliks.length) {
          preloadVideoBatch(nextBatch);
        }
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    preloadVideoBatch(0);

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [spliks.length, loadedBatches, preloadingVideos]);

  /* ========== Autoplay with flicker fixes + fade-in ========== */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let currentPlayingVideo: HTMLVideoElement | null = null;
    let currentPlayingIndex = -1;

    const handleVideoPlayback = async (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const idxAttr = (entry.target as HTMLElement).dataset.index;
        if (idxAttr == null) continue;

        const index = Number(idxAttr);
        if (!Number.isFinite(index) || index < 0 || index >= spliks.length) continue;

        const video = videoRefs.current[index];
        if (!video) continue;

        const startAt = Number(spliks[index]?.trim_start ?? 0);
        const resetAt = startAt ? Math.max(0.05, startAt) : 0.1;

        if (entry.intersectionRatio > 0.5) {
          if (currentPlayingVideo && currentPlayingVideo !== video) {
            currentPlayingVideo.pause();
            setIsPlaying((prev) => ({ ...prev, [currentPlayingIndex]: false }));
          }

          muteOtherVideos(index);

          video.setAttribute("playsinline", "true");
          // @ts-expect-error - iOS attr
          video.setAttribute("webkit-playsinline", "true");
          video.disablePictureInPicture = true;
          video.preload = isTouchDevice() ? "auto" : "metadata";
          video.crossOrigin = "anonymous";
          video.muted = isTouchDevice() ? true : (muted[index] ?? false);

          // Only show video after a frame is painted
          setFrameReady((prev) => ({ ...prev, [index]: false }));

          const armSeekedOnce = () => {
            const onSeeked = () => {
              setFrameReady((prev) => ({ ...prev, [index]: true }));
            };
            video.addEventListener("seeked", onSeeked, { once: true });
          };

          try {
            if (video.readyState >= 2 && video.currentTime === 0) {
              armSeekedOnce();
              video.currentTime = resetAt;
            }
          } catch {}

          const onTimeUpdate = () => {
            if (video.currentTime - startAt >= 3) {
              try {
                armSeekedOnce();
                video.currentTime = resetAt;
              } catch {}
            }
          };
          video.removeEventListener("timeupdate", onTimeUpdate);
          video.addEventListener("timeupdate", onTimeUpdate);

          try {
            await video.play();
            currentPlayingVideo = video;
            currentPlayingIndex = index;
            setIsPlaying((prev) => ({ ...prev, [index]: true }));
            setShowPauseButton((prev) => ({ ...prev, [index]: true }));
          } catch {
            if (!video.muted) {
              video.muted = true;
              try {
                await video.play();
                currentPlayingVideo = video;
                currentPlayingIndex = index;
                setIsPlaying((prev) => ({ ...prev, [index]: true }));
                setShowPauseButton((prev) => ({ ...prev, [index]: true }));
              } catch {
                try {
                  armSeekedOnce();
                  video.currentTime = resetAt;
                } catch {}
              }
            } else {
              try {
                armSeekedOnce();
                video.currentTime = resetAt;
              } catch {}
            }
          }
        } else if (entry.intersectionRatio < 0.5 && video === currentPlayingVideo) {
          video.pause();
          video.muted = true;
          setIsPlaying((prev) => ({ ...prev, [index]: false }));
          if (currentPlayingVideo === video) {
            currentPlayingVideo = null;
            currentPlayingIndex = -1;
          }
        }
      }
    };

    const observer = new IntersectionObserver(handleVideoPlayback, {
      root: container,
      threshold: [0, 0.25, 0.5, 0.75, 1.0],
      rootMargin: "0px",
    });

    const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-index]"));
    sections.forEach((section) => observer.observe(section));

    return () => {
      observer.disconnect();
      videoRefs.current.forEach((video) => {
        if (video && !video.paused) video.pause();
      });
      Object.values(pauseTimeoutRefs.current).forEach((t) => t && clearTimeout(t));
    };
  }, [spliks, muted, orderEpoch]);

  const toggleMute = (i: number) => {
    const v = videoRefs.current[i];
    if (!v) return;
    const newMutedState = !(muted[i] ?? isTouchDevice());
    if (!newMutedState) muteOtherVideos(i);
    v.muted = newMutedState;
    setMuted((m) => ({ ...m, [i]: newMutedState }));
  };

  const handlePlayPause = (index: number) => {
    const video = videoRefs.current[index];
    if (!video) return;
    const currentlyPlaying = isPlaying[index] ?? false;

    const startAt = Number(spliks[index]?.trim_start ?? 0);
    const resetAt = startAt ? Math.max(0.05, startAt) : 0.1;

    if (currentlyPlaying) {
      video.pause();
      setIsPlaying((prev) => ({ ...prev, [index]: false }));
      setShowPauseButton((prev) => ({ ...prev, [index]: false }));
      if (pauseTimeoutRefs.current[index]) clearTimeout(pauseTimeoutRefs.current[index]);
      pauseTimeoutRefs.current[index] = setTimeout(() => {
        setShowPauseButton((prev) => ({ ...prev, [index]: true }));
      }, 2000);
    } else {
      muteOtherVideos(index);
      try {
        if (video.readyState >= 2 && video.currentTime === 0) {
          setFrameReady((prev) => ({ ...prev, [index]: false }));
          video.currentTime = resetAt;
        }
      } catch {}
      video.muted = muted[index] ?? isTouchDevice();
      video
        .play()
        .then(() => setFrameReady((prev) => ({ ...prev, [index]: true })))
        .catch(console.error);
      setIsPlaying((prev) => ({ ...prev, [index]: true }));
      setShowPauseButton((prev) => ({ ...prev, [index]: true }));
    }
  };

  // favorites: optimistic + realtime-backed
  const toggleFavorite = async (splikId: string) => {
    if (!user?.id) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save videos",
        variant: "destructive",
      });
      return;
    }
    if (savingIds.has(splikId)) return;

    setSavingIds((s) => new Set(s).add(splikId));

    const currentlySaved = savedIds.has(splikId);
    setSavedIds((prev) => {
      const ns = new Set(prev);
      currentlySaved ? ns.delete(splikId) : ns.add(splikId);
      return ns;
    });

    try {
      if (currentlySaved) {
        await supabase.from("favorites").delete().eq("user_id", user.id).eq("splik_id", splikId);
        toast({ title: "Removed from favorites" });
      } else {
        await supabase.from("favorites").insert({ user_id: user.id, splik_id: splikId });
        toast({ title: "Added to favorites" });
      }
    } catch {
      // revert
      setSavedIds((prev) => {
        const ns = new Set(prev);
        currentlySaved ? ns.add(splikId) : ns.delete(splikId);
        return ns;
      });
      toast({ title: "Error", description: "Failed to update favorites", variant: "destructive" });
    } finally {
      setSavingIds((s) => {
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

  return (
    <>
      <div
        ref={containerRef}
        className="h-[100svh] overflow-y-auto snap-y snap-mandatory scroll-smooth bg-background"
      >
        {spliks.map((s, i) => {
          const videoIsPlaying = isPlaying[i] ?? false;
          const shouldShowPauseButton = showPauseButton[i] ?? true;
          const isSaved = savedIds.has(s.id);
          const saving = savingIds.has(s.id);
          const ready = frameReady[i] ?? false;

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

                {/* video */}
                <div className="relative bg-black aspect-[9/16] max-h-[600px] group">
                  <div className="absolute inset-x-0 top-0 h-10 bg-black z-10 pointer-events-none" />

                  {/* Poster overlay stays until the first real frame is painted */}
                  {s.thumbnail_url && (
                    <img
                      src={s.thumbnail_url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
                      style={{
                        opacity: ready ? 0 : 1,
                        transition: "opacity 120ms linear",
                        willChange: "opacity",
                      }}
                    />
                  )}

                  <video
                    ref={(el) => {
                      videoRefs.current[i] = el;
                      if (el) {
                        el.setAttribute("playsinline", "true");
                        // @ts-expect-error iOS attribute
                        el.setAttribute("webkit-playsinline", "true");
                        el.disablePictureInPicture = true;
                        el.preload = isTouchDevice() ? "auto" : "metadata";
                        el.crossOrigin = "anonymous";
                        el.muted = muted[i] ?? isTouchDevice();
                      }
                    }}
                    src={s.video_url}
                    poster={s.thumbnail_url ?? undefined}
                    className="w-full h-full object-cover"
                    playsInline
                    preload={isTouchDevice() ? "auto" : "metadata"}
                    muted={muted[i] ?? isTouchDevice()}
                    onLoadedData={() => {
                      const v = videoRefs.current[i];
                      const startAt = Number(spliks[i]?.trim_start ?? 0);
                      const resetAt = startAt ? Math.max(0.05, startAt) : 0.1;
                      if (v && v.readyState >= 2 && v.currentTime === 0) {
                        setFrameReady((p) => ({ ...p, [i]: false }));
                        const onSeeked = () => setFrameReady((p) => ({ ...p, [i]: true }));
                        v.addEventListener("seeked", onSeeked, { once: true });
                        try {
                          v.currentTime = resetAt;
                        } catch {}
                      }
                    }}
                    onLoadedMetadata={() => {
                      if (!isTouchDevice()) {
                        const v = videoRefs.current[i];
                        const startAt = Number(spliks[i]?.trim_start ?? 0);
                        const resetAt = startAt ? Math.max(0.05, startAt) : 0.1;
                        if (v && v.currentTime === 0) {
                          setFrameReady((p) => ({ ...p, [i]: false }));
                          const onSeeked = () => setFrameReady((p) => ({ ...p, [i]: true }));
                          v.addEventListener("seeked", onSeeked, { once: true });
                          try {
                            v.currentTime = resetAt;
                          } catch {}
                        }
                      }
                    }}
                    onCanPlayThrough={() => {
                      if (isTouchDevice()) {
                        const v = videoRefs.current[i];
                        const startAt = Number(spliks[i]?.trim_start ?? 0);
                        const resetAt = startAt ? Math.max(0.05, startAt) : 0.1;
                        if (v && v.currentTime === 0) {
                          setFrameReady((p) => ({ ...p, [i]: false }));
                          const onSeeked = () => setFrameReady((p) => ({ ...p, [i]: true }));
                          v.addEventListener("seeked", onSeeked, { once: true });
                          try {
                            v.currentTime = resetAt;
                          } catch {}
                        }
                      }
                    }}
                    onPlay={() => setFrameReady((p) => ({ ...p, [i]: true }))}
                    onError={(e) => console.warn("video error", s.id, e)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      backgroundColor: "transparent", // video itself transparent; container is black
                      opacity: ready ? 1 : 0,
                      transition: "opacity 120ms linear",
                      willChange: "opacity",
                    }}
                  />

                  {/* Center play/pause controls */}
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    onClick={() => handlePlayPause(i)}
                  >
                    {videoIsPlaying ? (
                      shouldShowPauseButton && (
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-full p-4">
                          <Pause className="h-10 w-10 text-white drop-shadow-lg" />
                        </span>
                      )
                    ) : (
                      <span className="bg-black/35 rounded-full p-4 hover:bg-black/45 transition-colors">
                        <Play className="h-8 w-8 text-white ml-1" />
                      </span>
                    )}
                  </div>

                  {/* mute toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMute(i);
                    }}
                    className="absolute bottom-3 right-3 bg-black/50 rounded-full p-2 z-20 hover:bg-black/70 transition-colors"
                    title={muted[i] ? "Unmute" : "Mute"}
                  >
                    {muted[i] ? (
                      <VolumeX className="h-4 w-4 text-white" />
                    ) : (
                      <Volume2 className="h-4 w-4 text-white" />
                    )}
                  </button>

                  {/* title overlay */}
                  {s.title && (
                    <div className="absolute bottom-3 left-3 z-20">
                      <div className="bg-black/50 rounded px-2 py-1 max-w-[200px]">
                        <p className="text-white text-sm font-medium truncate">{s.title}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* actions */}
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* Share */}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          const url = `${window.location.origin.replace(/\/$/,"")}/splik/${s.id}`;
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
                      className={isSaved ? "text-yellow-400 hover:text-yellow-500" : "hover:text-yellow-500"}
                      aria-pressed={isSaved}
                      aria-label={isSaved ? "Saved" : "Save"}
                      title={isSaved ? "Saved" : "Save"}
                    >
                      {isSaved ? <BookmarkCheck className="h-6 w-6" /> : <Bookmark className="h-6 w-6" />}
                    </Button>
                  </div>

                  {/* caption */}
                  {s.description && (
                    <p className="text-sm">
                      <span className="font-semibold mr-2">{nameFor(s)}</span>
                      {s.description}
                    </p>
                  )}
                </div>
              </Card>
            </section>
          );
        })}
      </div>

      {/* Optional: small indicator while background preloads */}
      {preloadingVideos.size > 0 && (
        <div className="fixed bottom-4 right-4 bg-black/80 text-white px-3 py-2 rounded-lg text-sm z-50">
          Loading videos… ({preloadingVideos.size})
        </div>
      )}
    </>
  );
}
