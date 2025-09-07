// src/components/ui/VideoFeed.tsx
import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Heart, MessageCircle, Share2, Bookmark, MoreVertical, Volume2, VolumeX, Send } from "lucide-react";
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
  profiles?: {
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
  } | null;
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

  // autoplay state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState<Record<number, boolean>>({});

  /* --------- ALWAYS start at top on route change + on load --------- */
  useLayoutEffect(() => {
    // reset window scroll (in case the page itself can scroll)
    try { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); } catch {}
    // reset the feed container scroll
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [pathname]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("spliks")
          .select("id,title,description,video_url,thumbnail_url,user_id,likes_count,comments_count,created_at,trim_start,profiles(first_name,username)")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setSpliks(data || []);

        // preload likes for this user
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
        // after data is ready, force container to top
        if (containerRef.current) {
          containerRef.current.scrollTop = 0;
        }
      }
    };
    load();
  }, [user?.id]);

  // also ensure top when the list length changes (navigation between feeds)
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [spliks.length]);

  /* ========== ENHANCED AUTOPLAY MANAGER WITH MOBILE FIXES ========== */
  const thresholds = useMemo(
    () => Array.from({ length: 21 }, (_, i) => i / 20), // 0, .05, .10 ... 1
    []
  );

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // Track visibility ratios and current playing video
    const sectionVisibility: Record<number, number> = {};
    let currentPlayingIndex: number | null = null;
    let isProcessing = false;

    // Mobile video setup helper
    const setupVideoForMobile = (video: HTMLVideoElement) => {
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("webkit-playsinline", "true");
      video.preload = "metadata";
      video.load(); // Force load to show first frame
    };

    const findMostVisibleSection = (): number | null => {
      const visibilityEntries = Object.entries(sectionVisibility);
      if (visibilityEntries.length === 0) return null;

      const sortedSections = visibilityEntries
        .map(([index, ratio]) => ({ index: Number(index), ratio }))
        .sort((a, b) => b.ratio - a.ratio);

      const mostVisible = sortedSections[0];
      return mostVisible && mostVisible.ratio >= 0.6 ? mostVisible.index : null;
    };

    const handleVideoPlayback = async () => {
      if (isProcessing) return;
      isProcessing = true;

      try {
        const targetIndex = findMostVisibleSection();

        // If current video falls below 45% visibility, pause it
        if (currentPlayingIndex !== null && (sectionVisibility[currentPlayingIndex] || 0) < 0.45) {
          const currentVideo = videoRefs.current[currentPlayingIndex];
          if (currentVideo && !currentVideo.paused) {
            currentVideo.pause();
          }
          currentPlayingIndex = null;
        }

        // Switch to new target video if different from current
        if (targetIndex !== null && targetIndex !== currentPlayingIndex) {
          // Pause all others
          videoRefs.current.forEach((video, i) => {
            if (video && i !== targetIndex && !video.paused) {
              video.pause();
            }
          });

          const targetVideo = videoRefs.current[targetIndex];
          if (targetVideo) {
            setupVideoForMobile(targetVideo);
            targetVideo.muted = muted[targetIndex] ?? true;

            if (targetVideo.readyState < 2) {
              targetVideo.load();
              await new Promise((r) => setTimeout(r, 100));
            }

            if (targetVideo.currentTime === 0 && (targetVideo.duration || 0) > 0) {
              targetVideo.currentTime = 0.1;
            }

            // Enforce 3s loop (with optional trim_start)
            const startAt = Number(spliks[targetIndex]?.trim_start ?? 0);
            const onTimeUpdate = () => {
              if (targetVideo.currentTime - startAt >= 3) {
                targetVideo.currentTime = startAt;
              }
            };
            targetVideo.removeEventListener("timeupdate", onTimeUpdate);
            targetVideo.addEventListener("timeupdate", onTimeUpdate);

            if (startAt > 0) {
              try { targetVideo.currentTime = startAt; } catch {}
            }

            try {
              await targetVideo.play();
              currentPlayingIndex = targetIndex;
              setActiveIndex(targetIndex);
            } catch (playError) {
              // Retry muted
              if (!targetVideo.muted) {
                targetVideo.muted = true;
                setMuted((prev) => ({ ...prev, [targetIndex]: true }));
                try {
                  await targetVideo.play();
                  currentPlayingIndex = targetIndex;
                  setActiveIndex(targetIndex);
                } catch {
                  if (targetVideo.currentTime === 0) targetVideo.currentTime = 0.1;
                }
              } else {
                if (targetVideo.currentTime === 0) targetVideo.currentTime = 0.1;
              }
            }
          }
        } else if (targetIndex === null && currentPlayingIndex !== null) {
          // No sufficiently visible video - pause current
          const currentVideo = videoRefs.current[currentPlayingIndex];
          if (currentVideo && !currentVideo.paused) {
            currentVideo.pause();
          }
          currentPlayingIndex = null;
        }
      } catch (error) {
        console.error("Error handling video playback:", error);
      } finally {
        isProcessing = false;
      }
    };

    // Create intersection observer
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number((entry.target as HTMLElement).dataset.index);
          sectionVisibility[index] = entry.intersectionRatio;
        });
        handleVideoPlayback();
      },
      {
        root,
        threshold: thresholds,
        rootMargin: "10px",
      }
    );

    // Initialize videos and observe sections
    const initializeVideos = () => {
      videoRefs.current.forEach((video) => {
        if (video && !video.hasAttribute("data-mobile-initialized")) {
          setupVideoForMobile(video);
          video.setAttribute("data-mobile-initialized", "true");
        }
      });
    };

    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-index]"));
    sections.forEach((section) => {
      intersectionObserver.observe(section);
    });

    setTimeout(initializeVideos, 100);

    const mutationObserver = new MutationObserver(() => {
      setTimeout(initializeVideos, 100);
    });

    mutationObserver.observe(root, {
      childList: true,
      subtree: true,
    });

    return () => {
      intersectionObserver.disconnect();
      mutationObserver.disconnect();
      videoRefs.current.forEach((video) => {
        if (video && !video.paused) video.pause();
      });
    };
  }, [spliks.length, thresholds, muted, spliks]);

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
      key={pathname} /* remount on route, guarantees fresh scroll state */
      ref={containerRef}
      className="h-[100svh] overflow-y-auto snap-y snap-mandatory scroll-smooth bg-background"
    >
      {spliks.map((s, i) => {
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
                  playsInline
                  muted={muted[i] ?? true}
                  webkit-playsinline="true"
                  preload="metadata"
                  onEnded={() => scrollTo(Math.min(i + 1, spliks.length - 1))}
                  onLoadedData={() => {
                    const video = videoRefs.current[i];
                    if (video && video.currentTime === 0) {
                      video.currentTime = 0.1;
                    }
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />

                {/* invisible tap layer (kept for snap assist) */}
                <div
                  className="absolute inset-0"
                  onClick={() => scrollTo(i)}
                />

                {/* mute toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute(i);
                  }}
                  className="absolute bottom-3 right-3 bg-black/50 rounded-full p-2 z-20"
                >
                  {muted[i] ? (
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
