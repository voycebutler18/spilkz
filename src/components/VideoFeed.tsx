// src/components/ui/VideoFeed.tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Share2, Bookmark, BookmarkCheck, MoreVertical, Volume2, VolumeX } from "lucide-react";
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

  // force-remount key to ensure DOM order changes on each shuffle
  const [orderEpoch, setOrderEpoch] = useState(0);

  // prewarmed feed
  const { feed: storeFeed } = useFeedStore();

  // Cleanup function for preload elements
  const preloadCleanupRef = useRef<(() => void)[]>([]);

  // Simple preload for mobile - only preload 3 videos max
  useEffect(() => {
    if (spliks.length === 0) return;

    // Clean up previous preloads
    preloadCleanupRef.current.forEach(cleanup => cleanup());
    preloadCleanupRef.current = [];

    // Only preload first 3 videos on mobile, 5 on desktop
    const preloadCount = isTouchDevice() ? 3 : 5;
    
    spliks.slice(0, preloadCount).forEach((splik, index) => {
      // Simple preconnect only
      const url = new URL(splik.video_url);
      const domain = url.origin;
      
      if (!document.querySelector(`link[rel="preconnect"][href="${domain}"]`)) {
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = domain;
        document.head.appendChild(link);
        
        preloadCleanupRef.current.push(() => {
          if (link.parentNode) {
            link.parentNode.removeChild(link);
          }
        });
      }
    });

    // Cleanup function
    return () => {
      preloadCleanupRef.current.forEach(cleanup => cleanup());
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
      setOrderEpoch((e) => e + 1);
      
      // iOS Safari can throw on unknown behavior; use "auto"
      try {
        containerRef.current?.scrollTo({ top: 0, behavior: "auto" });
      } catch {
        containerRef.current?.scrollTo(0, 0);
      }
    };

    const readCache = (): Splik[] | null => {
      let data: Splik[] | null = null;
      
      if (Array.isArray(storeFeed) && storeFeed.length > 0) {
        data = normalizeSpliks(storeFeed as Splik[]);
      } else {
        try {
          const raw = sessionStorage.getItem("feed:cached");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length) {
              data = normalizeSpliks(parsed as Splik[]);
            }
          }
        } catch {}
      }
      
      // Always shuffle cached data on every page load
      return data ? shuffle(data) : null;
    };

    const writeCache = (rows: Splik[]) => {
      try {
        sessionStorage.setItem("feed:cached", JSON.stringify(rows.slice(0, 40))); // Reduced cache size
      } catch {}
    };

    const backgroundRefreshFavs = async () => {
      try {
        if (user?.id) {
          const { data: favs } = await supabase.from("favorites").select("splik_id").eq("user_id", user.id);
          if (favs) setSavedIds(new Set(favs.map((f: any) => f.splik_id)));
        }
      } catch {}
    };

    const ABORT_TIMEOUT_MS = 10000; // Reduced timeout

    const load = async () => {
      const cached = readCache();
      if (cached && !cancelled) {
        // Apply smart shuffle to cached data
        const { shuffled, newSeenPosts } = smartShuffle(cached.spliks, cached.seenPosts);
        setSpliks(shuffled);
        setLoading(false);
        primeUI(shuffled);
        backgroundRefreshFavs();
        
        // Update the seen posts in cache
        writeCache(shuffled, newSeenPosts);
        // Keep going and refresh in the background
      }

      setLoading(true);
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), ABORT_TIMEOUT_MS);

        // Reduced limits for better mobile performance
        const limit = isTouchDevice() ? 20 : 50;
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

        // 2) Fetch profiles in a second call (no JOINs = fewer edge issues on mobile)
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

        // Use existing seen posts or start fresh
        const seenPosts = cached?.seenPosts || new Set<string>();
        const { shuffled, newSeenPosts } = smartShuffle(normalized, seenPosts);

        if (!cancelled) {
          setSpliks(shuffled);
          primeUI(shuffled);
          writeCache(shuffled, newSeenPosts);
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

  /* ========== Simplified Autoplay - No flickering ========== */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let currentPlayingVideo: HTMLVideoElement | null = null;
    let currentPlayingIndex = -1;
    let timeUpdateHandlers = new Map<HTMLVideoElement, () => void>();

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
        const loopDuration = 3; // 3 second loop

        if (entry.intersectionRatio > 0.5) { // Simplified threshold
          if (currentPlayingVideo && currentPlayingVideo !== video) {
            currentPlayingVideo.pause();
            // Clean up old time update handler
            const oldHandler = timeUpdateHandlers.get(currentPlayingVideo);
            if (oldHandler) {
              currentPlayingVideo.removeEventListener("timeupdate", oldHandler);
              timeUpdateHandlers.delete(currentPlayingVideo);
            }
            setIsPlaying((prev) => ({ ...prev, [currentPlayingIndex]: false }));
          }

          muteOtherVideos(index);

          video.setAttribute("playsinline", "true");
          video.setAttribute("webkit-playsinline", "true");
          video.disablePictureInPicture = true;
          video.preload = "metadata"; // Changed from "auto" to reduce memory usage
          video.muted = muted[index] ?? true;
          video.controls = false;

          // Set initial time without waiting for seeked event
          try {
            if (video.readyState >= 1) {
              video.currentTime = resetAt;
            }
          } catch {}

          // 3-second loop behavior
          const onTimeUpdate = () => {
            const currentTime = video.currentTime;
            if (currentTime - startAt >= loopDuration) {
              try {
                video.currentTime = resetAt;
              } catch {}
            }
          };

          // Clean up existing handler
          const existingHandler = timeUpdateHandlers.get(video);
          if (existingHandler) {
            video.removeEventListener("timeupdate", existingHandler);
          }
          
          video.addEventListener("timeupdate", onTimeUpdate);
          timeUpdateHandlers.set(video, onTimeUpdate);

          try {
            const playPromise = video.play();
            if (playPromise) {
              await playPromise;
            }
            currentPlayingVideo = video;
            currentPlayingIndex = index;
            setIsPlaying((prev) => ({ ...prev, [index]: true }));
          } catch (error) {
            // Autoplay failed, that's ok
            console.log("Autoplay prevented for video", index);
          }
        } else if (video === currentPlayingVideo) {
          video.pause();
          setIsPlaying((prev) => ({ ...prev, [index]: false }));
          
          // Clean up time update handler
          const handler = timeUpdateHandlers.get(video);
          if (handler) {
            video.removeEventListener("timeupdate", handler);
            timeUpdateHandlers.delete(video);
          }
          
          if (currentPlayingVideo === video) {
            currentPlayingVideo = null;
            currentPlayingIndex = -1;
          }
        }
      }
    };

    // Simplified intersection observer
    const observer = new IntersectionObserver(handleVideoPlayback, {
      root: container,
      threshold: [0.5], // Single threshold to reduce complexity
      rootMargin: "0px",
    });

    const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-index]"));
    sections.forEach((section) => observer.observe(section));

    return () => {
      observer.disconnect();
      
      // Clean up all handlers
      timeUpdateHandlers.forEach((handler, video) => {
        video.removeEventListener("timeupdate", handler);
      });
      timeUpdateHandlers.clear();
      
      videoRefs.current.forEach((video) => {
        if (video && !video.paused) video.pause();
      });
    };
  }, [spliks, muted, orderEpoch]);

  const toggleMute = (i: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const v = videoRefs.current[i];
    if (!v) return;
    const newMutedState = !muted[i];
    if (!newMutedState) muteOtherVideos(i);
    v.muted = newMutedState;
    setMuted((m) => ({ ...m, [i]: newMutedState }));
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
          const isSaved = savedIds.has(s.id);
          const saving = savingIds.has(s.id);

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

                {/* video - simplified, no flickering */}
                <div className="relative bg-black aspect-[9/16] max-h-[600px]">
                  <div className="absolute inset-x-0 top-0 h-10 bg-black z-10 pointer-events-none" />

                  {/* Static poster image - only show if video fails to load */}
                  {s.thumbnail_url && (
                    <img
                      src={s.thumbnail_url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
                      style={{ 
                        zIndex: 1,
                        display: 'block'
                      }}
                      onLoad={(e) => {
                        // Hide poster once video starts playing
                        const video = videoRefs.current[i];
                        if (video && !video.paused) {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }
                      }}
                    />
                  )}

                  <video
                    ref={(el) => {
                      videoRefs.current[i] = el;
                      if (el) {
                        el.setAttribute("playsinline", "true");
                        el.setAttribute("webkit-playsinline", "true");
                        el.disablePictureInPicture = true;
                        el.preload = "metadata";
                        el.muted = true;
                        el.controls = false;
                      }
                    }}
                    src={s.video_url}
                    className="w-full h-full object-cover"
                    style={{
                      zIndex: 2,
                      position: 'relative',
                      backgroundColor: 'black'
                    }}
                    playsInline
                    preload="metadata"
                    muted
                    controls={false}
                    onPlay={() => {
                      // Hide poster when video starts playing
                      const poster = containerRef.current?.querySelector(`[data-index="${i}"] img`);
                      if (poster) {
                        (poster as HTMLElement).style.display = 'none';
                      }
                    }}
                    onLoadedMetadata={() => {
                      const v = videoRefs.current[i];
                      const startAt = Number(spliks[i]?.trim_start ?? 0);
                      const resetAt = startAt ? Math.max(0.05, startAt) : 0.1;
                      if (v) {
                        try {
                          v.currentTime = resetAt;
                        } catch {}
                      }
                    }}
                    onError={(e) => {
                      console.warn("video error", s.id, e);
                      // Show poster if video fails
                      const poster = containerRef.current?.querySelector(`[data-index="${i}"] img`);
                      if (poster) {
                        (poster as HTMLElement).style.display = 'block';
                      }
                    }}
                  />

                  {/* Full-frame transparent tap area for mute toggle */}
                  <button
                    className="absolute inset-0 w-full h-full bg-transparent z-10"
                    onClick={(e) => toggleMute(i, e)}
                    aria-label={muted[i] ? "Unmute video" : "Mute video"}
                  />

                  {/* Mute indicator in corner */}
                  <div className="absolute bottom-3 right-3 bg-black/50 rounded-full p-2 z-20 pointer-events-none">
                    {muted[i] ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
                  </div>

                  {/* title overlay */}
                  {s.title && (
                    <div className="absolute bottom-3 left-3 z-20 pointer-events-none">
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
                </div>
              </Card>
            </section>
          );
        })}
      </div>
    </>
  );
}
