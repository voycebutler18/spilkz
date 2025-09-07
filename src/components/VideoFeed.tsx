// src/components/ui/VideoFeed.tsx
import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getViewSessionId } from "@/lib/session";
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
  title: string | null;
  description?: string | null;
  video_url: string;
  thumb_url?: string | null;     // from view
  user_id: string;
  username?: string | null;      // from view
  likes_count?: number | null;
  comments_count?: number | null;
  created_at: string;
  trim_start?: number | null;
  trim_end?: number | null;
  mime_type?: string | null;     // from view when present
  file_size?: number | null;
  liked_by_me?: boolean;         // from view
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
const displayName = (s: Splik) => (s.username ? `@${s.username}` : "Anonymous");

const initialsFor = (s: Splik) =>
  (s.username || "A").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2) || "A";

const mimeFromUrl = (url: string): string => {
  const clean = url.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "flv":
      return "video/x-flv";
    case "avi":
      return "video/x-msvideo";
    default:
      return "video/mp4";
  }
};

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

  // per-video bookkeeping
  const timeupdateHandlers = useRef<Record<number, (e: Event) => void>>({});
  const errorRetried = useRef<Record<number, boolean>>({});

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
          .from("spliks_feed")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;

        const rows = (data as Splik[]) || [];
        setSpliks(rows);

        // seed liked set from view
        setLikedIds(new Set(rows.filter((r) => r.liked_by_me).map((r) => r.id)));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
        containerRef.current && (containerRef.current.scrollTop = 0);
      }
    };
    load();
  }, [user?.id]);

  // ensure top when list length changes (e.g., switching feeds)
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [spliks.length]);

  // --- record a (session-unique) view when the focused card changes
  useEffect(() => {
    if (activeIndex < 0 || !spliks[activeIndex]) return;
    const s = spliks[activeIndex];
    const sessionId = getViewSessionId(); // helper below
    // best-effort: don't block UI, ignore errors
    supabase.rpc("increment_view_with_session", {
      p_session_id: sessionId,
      p_splik_id: s.id,
      p_viewer_id: user?.id ?? null,
      p_ip_address: null, // optional: let server fill/ignore
    }).catch(() => {});
  }, [activeIndex, spliks, user?.id]);

  /* -------- Realtime: likes/comments/counter updates -------- */
  useEffect(() => {
    const channel = supabase.channel("feed-realtime", {
      config: { broadcast: { ack: true }, presence: { key: user?.id || "anon" } },
    });

    // Likes
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "likes" },
      (payload: any) => {
        const { splik_id, user_id } = payload.new || {};
        if (user?.id && user_id === user.id) {
          setLikedIds((prev) => new Set(prev).add(splik_id));
        }
        setSpliks((prev) =>
          prev.map((s) =>
            s.id === splik_id ? { ...s, likes_count: (Number(s.likes_count) || 0) + 1 } : s
          )
        );
      }
    );

    channel.on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "likes" },
      (payload: any) => {
        const { splik_id, user_id } = payload.old || {};
        if (user?.id && user_id === user.id) {
          setLikedIds((prev) => {
            const ns = new Set(prev);
            ns.delete(splik_id);
            return ns;
          });
        }
        setSpliks((prev) =>
          prev.map((s) =>
            s.id === splik_id
              ? { ...s, likes_count: Math.max(0, (Number(s.likes_count) || 0) - 1) }
              : s
          )
        );
      }
    );

    // Comments
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "comments" },
      (payload: any) => {
        const { splik_id } = payload.new || {};
        setSpliks((prev) =>
          prev.map((s) =>
            s.id === splik_id ? { ...s, comments_count: (Number(s.comments_count) || 0) + 1 } : s
          )
        );
        if (showCommentsFor === splik_id) {
          setComments((prev) => [payload.new, ...prev]);
        }
      }
    );

    channel.on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "comments" },
      (payload: any) => {
        const { splik_id, id } = payload.old || {};
        setSpliks((prev) =>
          prev.map((s) =>
            s.id === splik_id
              ? { ...s, comments_count: Math.max(0, (Number(s.comments_count) || 0) - 1) }
              : s
          )
        );
        if (showCommentsFor === splik_id) {
          setComments((prev) => prev.filter((c) => c.id !== id));
        }
      }
    );

    // If your backend updates counter columns directly on spliks, reflect them
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "spliks" },
      (payload: any) => {
        const row = payload.new;
        setSpliks((prev) =>
          prev.map((s) =>
            s.id === row.id
              ? {
                  ...s,
                  likes_count: row.likes_count ?? s.likes_count,
                  comments_count: row.comments_count ?? s.comments_count,
                }
              : s
          )
        );
      }
    );

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, showCommentsFor]);

  /* ========== AUTOPLAY MANAGER (mobile-safe) ========== */
  const thresholds = useMemo(
    () => Array.from({ length: 21 }, (_, i) => i / 20), // 0, .05, .10 ... 1
    []
  );

  const setupVideoForMobile = (v: HTMLVideoElement, poster?: string | null) => {
    v.muted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "true");
    // @ts-expect-error vendor attr
    v.setAttribute("webkit-playsinline", "true");
    v.setAttribute("x5-playsinline", "true");
    v.setAttribute("x5-video-player-type", "h5");
    v.controls = false;
    v.disablePictureInPicture = true;
    // @ts-expect-error vendor attr
    v.disableRemotePlayback = true;
    v.setAttribute("controlsList", "nodownload noplaybackrate noremoteplayback");
    if (poster) v.poster = poster || "";
  };

  const applyThreeSecondLoop = (index: number, startAt: number) => {
    const v = videoRefs.current[index];
    if (!v) return;
    const loopEnd = startAt + 3;
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
      return pairs[0].r >= 0.6 ? pairs[0].i : -1;
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

      setupVideoForMobile(v, spliks[i]?.thumb_url ?? undefined);
      v.muted = muted[i] ?? true;

      const startAt = Number(spliks[i]?.trim_start ?? 0);
      if (v.currentTime < startAt || v.currentTime > startAt + 3) {
        try {
          v.currentTime = startAt;
        } catch {}
      }
      applyThreeSecondLoop(i, startAt);

      if (v.readyState < 2) {
        v.load();
        await new Promise((r) => setTimeout(r, 80));
      }
      if (v.currentTime === 0 && (v.duration || 0) > 0) {
        try {
          v.currentTime = Math.max(0.1, startAt);
        } catch {}
      }

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

      if (
        currentPlayingIndex !== null &&
        (sectionVisibility[currentPlayingIndex] || 0) < 0.45
      ) {
        pauseVideo(currentPlayingIndex);
        currentPlayingIndex = null;
      }

      if (target !== -1 && target !== currentPlayingIndex) {
        videoRefs.current.forEach((v, idx) => {
          if (v && idx !== target && !v.paused) pauseVideo(idx);
        });

        const ok = await playVideo(target);
        if (ok) {
          currentPlayingIndex = target;
          setActiveIndex(target);
        } else {
          const v = videoRefs.current[target];
          if (v && v.currentTime === 0) {
            try {
              v.currentTime = Math.max(
                0.1,
                Number(spliks[target]?.trim_start ?? 0)
              );
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

    const sections = Array.from(
      root.querySelectorAll<HTMLElement>("[data-index]")
    );
    sections.forEach((s) => io.observe(s));

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
      key={pathname}
      ref={containerRef}
      className="h-[100svh] overflow-y-auto snap-y snap-mandatory scroll-smooth bg-background"
    >
      {spliks.map((s, i) => {
        const isMuted = muted[i] ?? true;
        const shouldPreload = Math.abs(i - activeIndex) <= 1;

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
                  to={`/creator/${s.username || s.user_id}`}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{initialsFor(s)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{displayName(s)}</p>
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
                <div className="absolute inset-x-0 top-0 h-10 bg-black z-10 pointer-events-none" />

                <video
                  ref={(el) => (videoRefs.current[i] = el)}
                  poster={s.thumb_url ?? undefined}
                  className="w-full h-full object-cover"
                  playsInline
                  muted={isMuted}
                  // @ts-expect-error vendor attribute
                  webkit-playsinline="true"
                  preload={shouldPreload ? "metadata" : "none"}
                  controls={false}
                  controlsList="nodownload noplaybackrate noremoteplayback"
                  disablePictureInPicture
                  // @ts-expect-error vendor attribute
                  disableRemotePlayback
                  onEnded={() => scrollTo(Math.min(i + 1, spliks.length - 1))}
                  onLoadedMetadata={() => {
                    const v = videoRefs.current[i];
                    if (!v) return;
                    const start = Number(s.trim_start ?? 0);
                    if (v.currentTime < start || v.currentTime > start + 3) {
                      try {
                        v.currentTime = Math.max(0.1, start);
                      } catch {}
                    }
                  }}
                  onError={() => {
                    const v = videoRefs.current[i];
                    if (!v) return;
                    if (!errorRetried.current[i]) {
                      errorRetried.current[i] = true;
                      const bust = s.video_url.includes("#") ? "" : "#t=0.001";
                      const source = v.querySelector("source");
                      if (source) {
                        source.setAttribute("src", s.video_url + bust);
                        try {
                          v.load();
                        } catch {}
                      } else {
                        // @ts-ignore
                        v.src = s.video_url + bust;
                        try {
                          v.load();
                        } catch {}
                      }
                    } else {
                      toast({
                        title: "Playback error",
                        description: "This video format isn't supported on your device.",
                        variant: "destructive",
                      });
                    }
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                >
                  <source src={s.video_url} type={s.mime_type || mimeFromUrl(s.video_url)} />
                </video>

                <div className="absolute inset-0" onClick={() => scrollTo(i)} />

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute(i);
                  }}
                  className="absolute bottom-3 right-3 bg-black/50 rounded-full p-2 z-20"
                >
                  {isMuted ? (
                    <VolumeX className="h-4 w-4 text-white" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-white" />
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
                      <Heart className={`h-6 w-6 ${likedIds.has(s.id) ? "fill-current" : ""}`} />
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

                {s.description && (
                  <p className="text-sm">
                    <span className="font-semibold mr-2">{displayName(s)}</span>
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
