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

// Detect if device is mobile
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
};

/* =================================================================== */

export default function VideoFeed({ user }: VideoFeedProps) {
  const { toast } = useToast();
  const { pathname } = useLocation();

  const [spliks, setSpliks] = useState<Splik[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobileDevice] = useState(isMobile());

  // social UI
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [showCommentsFor, setShowCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);

  // autoplay state - mobile defaults to unmuted, desktop to muted
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState<Record<number, boolean>>({});
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  /* --------- ALWAYS start at top on route change + on load --------- */
  useLayoutEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {}
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [pathname]);

  // Add user interaction detection
  useEffect(() => {
    const handleFirstInteraction = () => {
      setHasUserInteracted(true);
      // Try to unmute current video if on mobile
      if (isMobileDevice) {
        const currentVideo = videoRefs.current[activeIndex];
        if (currentVideo) {
          currentVideo.muted = false;
          setMuted(prev => ({ ...prev, [activeIndex]: false }));
        }
      }
    };

    const events = ['touchstart', 'click', 'scroll', 'keydown'];
    events.forEach(event => {
      document.addEventListener(event, handleFirstInteraction, { once: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleFirstInteraction);
      });
    };
  }, [activeIndex, isMobileDevice]);

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
          const { data: likes } = await supabase.from("likes").select("splik_id").eq("user_id", user.id);
          if (likes) setLikedIds(new Set(likes.map((l) => l.splik_id)));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
        if (containerRef.current) containerRef.current.scrollTop = 0;
      }
    };
    load();
  }, [user?.id]);

  // also ensure top when the list length changes (navigation between feeds)
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [spliks.length]);

  /* ========== ENHANCED AUTOPLAY MANAGER WITH MOBILE SOUND ========== */
  const thresholds = useMemo(() => Array.from({ length: 21 }, (_, i) => i / 20), []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const sectionVisibility: Record<number, number> = {};
    let currentPlayingIndex: number | null = null;
    let isProcessing = false;

    const setupVideo = (video: HTMLVideoElement, index: number) => {
      video.playsInline = true;
      // For mobile: start unmuted after user interaction, for desktop: start muted
      const shouldBeMuted = isMobileDevice ? !hasUserInteracted : (muted[index] ?? true);
      video.muted = shouldBeMuted;
      video.preload = "metadata";
      video.setAttribute("webkit-playsinline", "true");
      
      if (shouldBeMuted) {
        video.setAttribute("muted", "true");
      } else {
        video.removeAttribute("muted");
      }
      
      video.load();
    };

    const findMostVisibleSection = (): number | null => {
      const entries = Object.entries(sectionVisibility);
      if (!entries.length) return null;
      const most = entries
        .map(([i, r]) => ({ i: Number(i), r }))
        .sort((a, b) => b.r - a.r)[0];
      return most && most.r >= 0.6 ? most.i : null;
    };

    const handleVideoPlayback = async () => {
      if (isProcessing) return;
      isProcessing = true;

      try {
        const targetIndex = findMostVisibleSection();

        if (currentPlayingIndex !== null && (sectionVisibility[currentPlayingIndex] || 0) < 0.45) {
          const cv = videoRefs.current[currentPlayingIndex];
          if (cv && !cv.paused) cv.pause();
          currentPlayingIndex = null;
        }

        if (targetIndex !== null && targetIndex !== currentPlayingIndex) {
          videoRefs.current.forEach((v, i) => {
            if (v && i !== targetIndex && !v.paused) v.pause();
          });

          const v = videoRefs.current[targetIndex];
          if (v) {
            setupVideo(v, targetIndex);
            
            // Set mute state based on device and user preference
            if (muted.hasOwnProperty(targetIndex)) {
              v.muted = muted[targetIndex];
            } else {
              // Default: mobile unmuted (after interaction), desktop muted
              const shouldBeMuted = isMobileDevice ? !hasUserInteracted : true;
              v.muted = shouldBeMuted;
              setMuted(prev => ({ ...prev, [targetIndex]: shouldBeMuted }));
            }

            if (v.readyState < 2) {
              v.load();
              await new Promise((r) => setTimeout(r, 80));
            }
            if (v.currentTime === 0 && (v.duration || 0) > 0) v.currentTime = 0.1;

            const startAt = Number(spliks[targetIndex]?.trim_start ?? 0);
            const onTimeUpdate = () => {
              if (v.currentTime - startAt >= 3) v.currentTime = startAt;
            };
            v.removeEventListener("timeupdate", onTimeUpdate);
            v.addEventListener("timeupdate", onTimeUpdate);

            if (startAt > 0) {
              try {
                v.currentTime = startAt;
              } catch {}
            }

            try {
              await v.play();
              currentPlayingIndex = targetIndex;
              setActiveIndex(targetIndex);
            } catch (error) {
              console.log('Autoplay failed, trying with muted:', error);
              if (!v.muted) {
                v.muted = true;
                setMuted((m) => ({ ...m, [targetIndex]: true }));
                try {
                  await v.play();
                  currentPlayingIndex = targetIndex;
                  setActiveIndex(targetIndex);
                } catch {
                  if (v.currentTime === 0) v.currentTime = 0.1;
                }
              } else {
                if (v.currentTime === 0) v.currentTime = 0.1;
              }
            }
          }
        } else if (targetIndex === null && currentPlayingIndex !== null) {
          const cv = videoRefs.current[currentPlayingIndex];
          if (cv && !cv.paused) cv.pause();
          currentPlayingIndex = null;
        }
      } finally {
        isProcessing = false;
      }
    };

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number((entry.target as HTMLElement).dataset.index);
          sectionVisibility[index] = entry.intersectionRatio;
        });
        handleVideoPlayback();
      },
      { root, threshold: thresholds, rootMargin: "10px" }
    );

    const initializeVideos = () => {
      videoRefs.current.forEach((v, index) => {
        if (v && !v.hasAttribute("data-mobile-initialized")) {
          setupVideo(v, index);
          v.setAttribute("data-mobile-initialized", "true");
        }
      });
    };

    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-index]"));
    sections.forEach((s) => intersectionObserver.observe(s));

    // kick off immediately
    initializeVideos();
    handleVideoPlayback();
    requestAnimationFrame(handleVideoPlayback);

    const mutationObserver = new MutationObserver(() => setTimeout(initializeVideos, 60));
    mutationObserver.observe(root, { childList: true, subtree: true });

    return () => {
      intersectionObserver.disconnect();
      mutationObserver.disconnect();
      videoRefs.current.forEach((v) => v && !v.paused && v.pause());
    };
  }, [spliks.length, thresholds, muted, spliks, hasUserInteracted, isMobileDevice]);

  /* Try to start the very first video as soon as data + DOM are ready */
  useEffect(() => {
    if (loading || !spliks.length) return;
    const v = videoRefs.current[0];
    if (!v) return;
    
    // prepare + start
    v.playsInline = true;
    const shouldBeMuted = isMobileDevice ? !hasUserInteracted : true;
    v.muted = shouldBeMuted;
    
    if (shouldBeMuted) {
      v.setAttribute("muted", "true");
    } else {
      v.removeAttribute("muted");
    }
    
    v.setAttribute("webkit-playsinline", "true");
    
    const startAt = Number(spliks[0]?.trim_start ?? 0);
    if (startAt > 0) {
      try {
        v.currentTime = startAt;
      } catch {}
    }
    
    // Set initial mute state
    setMuted(prev => ({ ...prev, 0: shouldBeMuted }));
    
    // small rAF ensures layout settled
    requestAnimationFrame(() => {
      v.play().catch(() => {
        // will be started by observer fallback if this fails
      });
    });
  }, [loading, spliks, hasUserInteracted, isMobileDevice]);

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
    if (next) {
      v.setAttribute("muted", "true");
    } else {
      v.removeAttribute("muted");
    }
    setMuted((m) => ({ ...m, [i]: next }));
  };

  /* ---------------- social actions ---------------- */
  const handleLike = async (splikId: string) => {
    if (!user?.id) {
      toast({ title: "Sign in required", description: "Please sign in to like videos", variant: "destructive" });
      return;
    }
    const liked = likedIds.has(splikId);
    setLikedIds((prev) => {
      const ns = new Set(prev);
      liked ? ns.delete(splikId) : ns.add(splikId);
      return ns;
    });
    try {
      if (liked) {
        await supabase.from("likes").delete().eq("user_id", user.id).eq("splik_id", splikId);
      } else {
        await supabase.from("likes").insert({ user_id: user.id, splik_id: splikId });
      }
    } catch {
      setLikedIds((prev) => {
        const ns = new Set(prev);
        liked ? ns.add(splikId) : ns.delete(splikId);
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
      const s = spliks.find((x) => x.id === showCommentsFor);
      if (s) openComments(s);
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
        const isVideoMuted = muted[i] ?? (isMobileDevice ? !hasUserInteracted : true);
        
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
                <div className="absolute inset-x-0 top-0 h-10 bg-black z-10 pointer-events-none" />

                <video
                  ref={(el) => (videoRefs.current[i] = el)}
                  src={s.video_url}
                  poster={s.thumbnail_url ?? undefined}
                  className="w-full h-full object-cover"
                  // autoplay on the first item to guarantee instant start on load
                  autoPlay={i === 0}
                  playsInline
                  muted={isVideoMuted}
                  preload={i === 0 ? "auto" : "metadata"}
                  disablePictureInPicture
                  controls={false}
                  onEnded={() => scrollTo(Math.min(i + 1, spliks.length - 1))}
                  onLoadedData={() => {
                    const v = videoRefs.current[i];
                    if (v && v.currentTime === 0) v.currentTime = 0.1;
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />

                {/* invisible tap layer (kept for snap assist) */}
                <div className="absolute inset-0" onClick={() => scrollTo(i)} />

                {/* Enhanced mute toggle - more prominent on mobile */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute(i);
                  }}
                  className={`absolute bottom-3 right-3 rounded-full p-3 z-20 transition-all duration-200 ${
                    isMobileDevice 
                      ? 'bg-black/70 border-2 border-white/30' 
                      : 'bg-black/50'
                  }`}
                >
                  {isVideoMuted ? (
                    <VolumeX className={`text-white ${isMobileDevice ? 'h-5 w-5' : 'h-4 w-4'}`} />
                  ) : (
                    <Volume2 className={`text-white ${isMobileDevice ? 'h-5 w-5' : 'h-4 w-4'}`} />
                  )}
                </button>

                {/* Mobile-specific sound indicator */}
                {isMobileDevice && !hasUserInteracted && (
                  <div className="absolute top-3 left-3 bg-black/70 px-3 py-1 rounded-full z-20">
                    <p className="text-white text-xs">Tap anywhere to enable sound</p>
                  </div>
                )}
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
