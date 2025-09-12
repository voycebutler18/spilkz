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

  // ✅ FIX: State to track when a video's first frame is painted and ready
  const [frameReady, setFrameReady] = useState<Record<number, boolean>>({});

  // force-remount key to ensure DOM order changes on each shuffle
  const [orderEpoch, setOrderEpoch] = useState(0);

  // prewarmed feed
  const { feed: storeFeed } = useFeedStore();

  // Batch preloading state
  const BATCH_SIZE = 20;
  const [loadedBatches, setLoadedBatches] = useState<Set<number>>(new Set([0])); // load first batch
  const [preloadingVideos, setPreloadingVideos] = useState<Set<number>>(new Set());

  // Try store → sessionStorage → network (only if needed)
  useEffect(() => {
    let cancelled = false;

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
      setFrameReady({}); // Reset ready map on new data

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
            profile:profiles(id, username, display_name, first_name, avatar_url)
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

    setLoadedBatches((prev) => new Set(prev).add(batchIndex));

    for (let i = startIdx; i < endIdx; i++) {
      if (!preloadingVideos.has(i)) {
        setPreloadingVideos((prev) => new Set(prev).add(i));

        const preloadVideo = document.createElement("video");
        preloadVideo.preload = "auto";
        preloadVideo.muted = true;
        preloadVideo.playsInline = true;
        preloadVideo.src = spliks[i]?.video_url;

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

    let currentPlayingIndex = -1;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(async (entry) => {
          const idxAttr = (entry.target as HTMLElement).dataset.index;
          if (!idxAttr) return;

          const index = parseInt(idxAttr, 10);
          const video = videoRefs.current[index];

          if (!video) return;

          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            // This video is now active
            if (currentPlayingIndex === index) return; // Already playing

            // Pause previously playing video
            if (currentPlayingIndex !== -1 && videoRefs.current[currentPlayingIndex]) {
              videoRefs.current[currentPlayingIndex]?.pause();
              setIsPlaying((p) => ({ ...p, [currentPlayingIndex]: false }));
            }

            currentPlayingIndex = index;
            muteOtherVideos(index); // Mute all others

            // Prime the video frame to prevent flicker
            const startAt = Number(spliks[index]?.trim_start ?? 0);
            const resetAt = startAt > 0.01 ? startAt : 0.01;

            if (video.readyState < 2 || video.currentTime === 0) {
              setFrameReady((p) => ({ ...p, [index]: false })); // Show poster
              const onSeeked = () => setFrameReady((p) => ({ ...p, [index]: true }));
              video.addEventListener("seeked", onSeeked, { once: true });
              try {
                video.currentTime = resetAt;
              } catch {}
            }

            try {
              await video.play();
              setIsPlaying((p) => ({ ...p, [index]: true }));
            } catch (err) {
              if (!video.muted) {
                video.muted = true; // Try again muted
                setMuted((m) => ({ ...m, [index]: true }));
                await video.play().catch(() => {});
                setIsPlaying((p) => ({ ...p, [index]: !video.paused }));
              }
            }
          } else {
            // This video is not active
            if (currentPlayingIndex === index) {
              video.pause();
              setIsPlaying((p) => ({ ...p, [index]: false }));
              currentPlayingIndex = -1;
            }
          }
        });
      },
      {
        root: container,
        threshold: 0.5,
      }
    );

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

    if (currentlyPlaying) {
      video.pause();
      setIsPlaying((prev) => ({ ...prev, [index]: false }));
    } else {
      muteOtherVideos(index);
      video
        .play()
        .then(() => setIsPlaying((prev) => ({ ...prev, [index]: true })))
        .catch(console.error);
    }
  };

  const toggleFavorite = async (splikId: string) => {
    if (!user?.id) {
      toast({ title: "Sign in required", variant: "destructive" });
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
      } else {
        await supabase.from("favorites").insert({ user_id: user.id, splik_id: splikId });
      }
    } catch {
      setSavedIds((prev) => {
        const ns = new Set(prev);
        currentlySaved ? ns.add(splikId) : ns.delete(splikId);
        return ns;
      });
      toast({ title: "Error updating favorites", variant: "destructive" });
    } finally {
      setSavingIds((s) => {
        const ns = new Set(s);
        ns.delete(splikId);
        return ns;
      });
    }
  };

  if (loading && spliks.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen">
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
          const ready = frameReady[i] ?? false;
          const isSaved = savedIds.has(s.id);
          const saving = savingIds.has(s.id);

          return (
            <section
              key={`${orderEpoch}-${s.id}`}
              data-index={i}
              className="snap-start min-h-[100svh] w-full flex items-center justify-center"
            >
              <Card className="overflow-hidden border-0 shadow-lg w-full max-w-lg mx-auto">
                <div className="flex items-center justify-between p-3 border-b">
                  <Link to={`/creator/${s.profile?.username || s.user_id}`} className="flex items-center gap-3">
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
                  <Button size="icon" variant="ghost"><MoreVertical className="h-5 w-5" /></Button>
                </div>

                <div className="relative bg-black aspect-[9/16] max-h-[600px] group">
                  {/* ✅ FIX: Poster stays visible until the video frame is ready */}
                  {s.thumbnail_url && (
                    <img
                      src={s.thumbnail_url}
                      alt={s.title}
                      className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
                      style={{
                        opacity: ready ? 0 : 1,
                        transition: "opacity 150ms linear",
                      }}
                    />
                  )}

                  <video
                    ref={(el) => { videoRefs.current[i] = el; }}
                    src={s.video_url}
                    className="w-full h-full object-cover"
                    playsInline
                    webkit-playsinline="true"
                    preload="auto"
                    muted={muted[i] ?? isTouchDevice()}
                    loop
                    onClick={() => handlePlayPause(i)}
                    onPlay={() => setFrameReady((p) => ({ ...p, [i]: true }))}
                    // ✅ FIX: Video is transparent until its frame is ready, then fades in
                    style={{
                      opacity: ready ? 1 : 0,
                      transition: "opacity 150ms linear",
                    }}
                  />
                                {/* ... Rest of your UI ... */}
                </div>
              </Card>
            </section>
          );
        })}
      </div>
    </>
  );
}
