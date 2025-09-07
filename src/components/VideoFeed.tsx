// src/components/ui/VideoFeed.tsx
import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreVertical,
  Volume2,
  VolumeX,
  Send,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* ---------------- types ---------------- */
interface Splik {
  id: string;
  title: string;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  user_id: string;
  likes_count?: number | null;
  comments_count?: number | null;
  created_at: string;
  trim_start?: number | null;
  profiles?:
    | {
        first_name?: string | null;
        last_name?: string | null;
        username?: string | null;
      }
    | null;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles?: { first_name?: string | null; last_name?: string | null } | null;
}

interface VideoFeedProps {
  user: any;
}

/* ---------- helpers ---------- */
const nameFor = (s: Splik) =>
  (s.profiles?.first_name || s.profiles?.username || "Anonymous User")!.toString();

const initialsFor = (s: Splik) =>
  nameFor(s)
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/* =================================================================== */

export default function VideoFeed({ user }: VideoFeedProps) {
  const { toast } = useToast();
  const { pathname } = useLocation();

  const [spliks, setSpliks] = useState<Splik[]>([]);
  const [loading, setLoading] = useState(true);

  // social UI
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [showCommentsFor, setShowCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);

  // feed / autoplay state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [muted, setMuted] = useState<Record<number, boolean>>({});
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // store per-video loop handlers so we can cleanly replace/remove them
  const timeupdateHandlers = useRef<Record<number, (e: Event) => void>>({});

  /* --------- ALWAYS start at top on route change + on load --------- */
  useLayoutEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {}
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [pathname]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("spliks")
          .select(
            "id,title,description,video_url,thumbnail_url,user_id,likes_count,comments_count,created_at,trim_start,profiles(first_name,username)"
          )
          .order("created_at", { ascending: false });

        if (error) throw error;
        setSpliks(data || []);

        if (user?.id) {
          const { data: likes } = await supabase
            .from("likes")
            .select("splik_id")
            .eq("user_id", user.id);
          if (likes) setLikedIds(new Set(likes.map((l) => l.splik_id)));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
        if (containerRef.current) {
          containerRef.current.scrollTop = 0;
        }
      }
    };
    load();
  }, [user?.id]);

  // also ensure top when the list length changes (navigating between feeds)
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [spliks.length]);

  /* ========== AUTOPLAY MANAGER (mobile-safe) ========== */
  const thresholds = useMemo(
    () => Array.from({ length: 21 }, (_, i) => i / 20), // 0, .05, .10 ... 1
    []
  );

  // helper to configure a video for mobile autoplay + first frame
  const setupVideoForMobile = (v: HTMLVideoElement, poster?: string | null) => {
    v.muted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "true");
    v.setAttribute("webkit-playsinline", "true");
    v.setAttribute("x5-playsinline", "true"); // some Android browsers
    v.setAttribute("x5-video-player-type", "h5");
    v.controls = false;
    (v as any).disablePictureInPicture = true;
    (v as any).disableRemotePlayback = true;
    v.setAttribute("controlsList", "nodownload noplaybackrate noremoteplayback");
    v.preload = "metadata";
    if (poster) v.poster = poster || "";
  };

  // safely attach a 3s loop timeupdate handler (one per index)
  const applyThreeSecondLoop = (index: number, startAt: number) => {
    const v = videoRefs.current[index];
    if (!v) return;

    const loopEnd = startAt + 3;

    // remove previous handler if any
    const prev = timeupdateHandlers.current[index];
    if (prev) {
      v.removeEventListener("timeupdate", prev);
      delete timeupdateHandlers.current[index];
    }

    const handler = () => {
      if (v.currentTime >= loopEnd) {
        try {
          v.currentTime = startAt;
        } catch {}
      }
    };

    v.addEventListener("timeupdate", handler);
    timeupdateHandlers.current[index] = handler;
  };

  // observe sections to pick the most-visible one
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const sectionVisibility: Record<number, number> = {};
    let currentPlayingIndex: number | null = null;
    let isProcessing = false;

    const findMostVisible = () => {
      const pairs = Object.entries(sectionVisibility).map(([i, r]) => ({
        i: Number(i),
        r,
      }));
      if (!pairs.length) return -1;
      pairs.sort((a, b) => b.r - a.r);
      return pairs[0].r >= 0.6 ? pairs[0].i : -1; // need ≥60% to take control
    };

    const pauseVideo = (i: number) => {
      const v = videoRefs.current[i];
      if (!v) return;
      try {
        v.pause();
      } catch {}
    };

    const playVideo = async (i: number) => {
      const v = videoRefs.current[i];
      if (!v) return false;

      // configure inline/mobile behavior
      setupVideoForMobile(v, spliks[i]?.thumbnail_url ?? undefined);
      v.muted = muted[i] ?? true;

      // enforce 3s loop from trim_start
      const startAt = Number(spliks[i]?.trim_start ?? 0);
      if (v.currentTime < startAt || v.currentTime > startAt + 3) {
        try {
          v.currentTime = startAt;
        } catch {}
      }
      applyThreeSecondLoop(i, startAt);

      // make sure we have some data so first frame shows
      if (v.readyState < 2) {
        v.load();
        await new Promise((r) => setTimeout(r, 80));
      }
      if (v.currentTime === 0 && (v.duration || 0) > 0) {
        try {
          v.currentTime = Math.max(0.1, startAt);
        } catch {}
      }

      // attempt autoplay; if blocked, force muted and retry
      try {
        await v.play();
        return true;
      } catch {
        if (!v.muted) v.muted = true;
        try {
          await v.play();
          return true;
        } catch {
          return false;
        }
      }
    };

    const handlePlayback = async () => {
      if (isProcessing) return;
      isProcessing = true;

      const target = findMostVisible();

      // current fell out of view? pause it
      if (
        currentPlayingIndex !== null &&
        (sectionVisibility[currentPlayingIndex] || 0) < 0.45
      ) {
        pauseVideo(currentPlayingIndex);
        currentPlayingIndex = null;
      }

      if (target !== -1 && target !== currentPlayingIndex) {
        // pause all others
        videoRefs.current.forEach((v, idx) => {
          if (v && idx !== target && !v.paused) pauseVideo(idx);
        });

        const ok = await playVideo(target);

        // if autoplay still blocked, show first frame but don't steal focus
        if (ok) {
          currentPlayingIndex = target;
          setActiveIndex(target);
        } else {
          const v = videoRefs.current[target];
          if (v && v.currentTime === 0) {
            try {
              v.currentTime = Math.max(0.1, Number(spliks[target]?.trim_start ?? 0));
            } catch {}
          }
        }
      } else if (target === -1 && currentPlayingIndex !== null) {
        pauseVideo(currentPlayingIndex);
        currentPlayingIndex = null;
      }

      isProcessing = false;
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const i = Number((entry.target as HTMLElement).dataset.index);
          sectionVisibility[i] = entry.intersectionRatio;
        });
        void handlePlayback();
      },
      { root, threshold: thresholds, rootMargin: "10px" }
    );

    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-index]"));
    sections.forEach((s) => io.observe(s));

    // pause on tab hidden; resume when visible if still the active one
    const onVis = () => {
      if (document.hidden && currentPlayingIndex !== null) {
        pauseVideo(currentPlayingIndex);
      } else {
        void handlePlayback();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      // clean up listeners and pause everything
      videoRefs.current.forEach((v, i) => {
        if (!v) return;
        const h = timeupdateHandlers.current[i];
        if (h) v.removeEventListener("timeupdate", h);
        try {
          v.pause();
        } catch {}
      });
      timeupdateHandlers.current = {};
    };
  }, [spliks, thresholds, muted]);

  const scrollTo = (index: number) => {
    const root = containerRef.current;
    if (!root) return;
    const child = root.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (child) child.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleMute = (i: number) => {
    const v = videoRefs.current[i];
    if (!v) return;
    const next = !(muted[i] ?? true);
    v.muted = next;
    setMuted((m) => ({ ...m, [i]: next }));
  };

  /* -------------------------- social actions -------------------------- */
  const handleLike = async (splikId: string) => {
    if (!user?.id) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like videos",
        variant: "destructive",
      });
      return;
    }
    const isLiked = likedIds.has(splikId);
    setLikedIds((prev) => {
      const ns = new Set(prev);
      isLiked ? ns.delete(splikId) : ns.add(splikId);
      return ns;
    });
    try {
      if (isLiked) {
        await supabase.from("likes").delete().eq("user_id", user.id).eq("splik_id", splikId);
      } else {
        await supabase.from("likes").insert({ user_id: user.id, splik_id: splikId });
      }
    } catch {
      setLikedIds((prev) => {
        const ns = new Set(prev);
        isLiked ? ns.add(splikId) : ns.delete(splikId);
        return ns;
      });
      toast({ title: "Error", description: "Failed to update like", variant: "destructive" });
    }
  };

  const openComments = async (s: Splik) => {
    setShowCommentsFor(s.id);
    setLoadingComments(true);
    try {
      const { data, error } = await supabase
        .from("comments")
        .select("*, profiles!comments_user_id_fkey(first_name,last_name)")
        .eq("splik_id", s.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setComments(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingComments(false);
    }
  };

  const submitComment = async () => {
    if (!showCommentsFor || !user?.id || !newComment.trim()) return;
    try {
      const { error } = await supabase.from("comments").insert({
        splik_id: showCommentsFor,
        user_id: user.id,
        content: newComment.trim(),
      });
      if (error) throw error;
      setNewComment("");
      const splik = spliks.find((s) => s.id === showCommentsFor);
      if (splik) openComments(splik);
    } catch {
      toast({ title: "Error", description: "Failed to post comment", variant: "destructive" });
    }
  };

  /* ------------------------------ UI ------------------------------ */
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div
      key={pathname} // remount on route, guarantees fresh scroll state
      ref={containerRef}
      className="h-[100svh] overflow-y-auto snap-y snap-mandatory scroll-smooth bg-background"
    >
      {spliks.map((s, i) => {
        const isMuted = muted[i] ?? true;

        return (
          <section
            key={s.id}
            data-index={i}
            className="snap-start min-h-[100svh] w-full flex items-center justify-center"
          >
            <Card className="overflow-hidden border-0 shadow-lg w-full max-w-lg mx-auto">
              {/* header */}
              <div className="flex items-center justify-between p-3 border-b">
                <Link
                  to={`/creator/${s.profiles?.username || s.user_id}`}
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
                <Button size="icon" variant="ghost">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </div>

              {/* video */}
              <div className="relative bg-black aspect-[9/16] max-h-[600px]">
                {/* top mask */}
                <div className="absolute inset-x-0 top-0 h-10 bg-black z-10 pointer-events-none" />

                <video
                  ref={(el) => (videoRefs.current[i] = el)}
                  src={s.video_url}
                  poster={s.thumbnail_url ?? undefined}
                  className="w-full h-full object-cover"
                  autoPlay={i === 0}            /* start first video immediately */
                  playsInline
                  muted={isMuted}
                  // @ts-expect-error vendor attribute
                  webkit-playsinline="true"
                  preload={i === 0 ? "auto" : "metadata"}
                  onEnded={() => scrollTo(Math.min(i + 1, spliks.length - 1))}
                  onLoadedData={() => {
                    const v = videoRefs.current[i];
                    if (v && v.currentTime === 0) {
                      try {
                        v.currentTime = Math.max(0.1, Number(s.trim_start ?? 0));
                      } catch {}
                    }
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />

                {/* tap layer — lower z-index so it NEVER hides the mute button */}
                <div
                  className="absolute inset-0 z-20"   /* <— lower than the button */
                  onClick={() => scrollTo(i)}
                />

                {/* mute toggle — high z-index + pointer-events enabled */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute(i);
                  }}
                  className="absolute bottom-3 right-3 z-50 pointer-events-auto bg-black/60 hover:bg-black/70 rounded-full p-2 ring-1 ring-white/40 shadow-md"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? (
                    <VolumeX className="h-5 w-5 text-white" />
                  ) : (
                    <Volume2 className="h-5 w-5 text-white" />
                  )}
                </button>
              </div>

              {/* actions */}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleLike(s.id)}
                      className={likedIds.has(s.id) ? "text-red-500" : ""}
                    >
                      <Heart
                        className={`h-6 w-6 ${likedIds.has(s.id) ? "fill-current" : ""}`}
                      />
                    </Button>

                    <Button size="icon" variant="ghost" onClick={() => openComments(s)}>
                      <MessageCircle className="h-6 w-6" />
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        const url = `${window.location.origin}/splik/${s.id}`;
                        navigator.clipboard.writeText(url);
                        toast({ title: "Link copied!" });
                      }}
                    >
                      <Share2 className="h-6 w-6" />
                    </Button>
                  </div>

                  <Button size="icon" variant="ghost">
                    <Bookmark className="h-6 w-6" />
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

              {/* comments inline */}
              {showCommentsFor === s.id && (
                <div className="px-3 pb-4">
                  <div className="border-t pt-3 space-y-3">
                    {loadingComments ? (
                      <div className="text-sm text-muted-foreground">Loading…</div>
                    ) : comments.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No comments yet</div>
                    ) : (
                      comments.map((c) => (
                        <div key={c.id} className="text-sm">
                          <span className="font-semibold mr-2">
                            {c.profiles?.first_name || "User"}
                          </span>
                          {c.content}
                        </div>
                      ))
                    )}

                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a comment…"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitComment()}
                      />
                      <Button size="icon" onClick={submitComment} disabled={!newComment.trim()}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </section>
        );
      })}
    </div>
  );
}
