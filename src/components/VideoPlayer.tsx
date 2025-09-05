// src/components/ui/VideoFeed.tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Heart, MessageCircle, Share2, Bookmark, MoreVertical, Volume2, VolumeX, Send, Play, Pause } from "lucide-react";
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
  const [isPlaying, setIsPlaying] = useState<Record<number, boolean>>({});
  const [showPauseButton, setShowPauseButton] = useState<Record<number, boolean>>({});
  const pauseTimeoutRefs = useRef<Record<number, NodeJS.Timeout>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("spliks")
          .select("id,title,description,video_url,thumbnail_url,user_id,likes_count,comments_count,created_at,trim_start")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setSpliks(data || []);

        // Initialize muted state to false (unmuted by default)
        const mutedState: Record<number, boolean> = {};
        const pauseState: Record<number, boolean> = {};
        (data || []).forEach((_, index) => {
          mutedState[index] = false; // Start unmuted
          pauseState[index] = true; // Show pause button by default
        });
        setMuted(mutedState);
        setShowPauseButton(pauseState);

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
      }
    };
    load();
  }, [user?.id]);

  // Function to mute all other videos
  const muteOtherVideos = (exceptIndex: number) => {
    videoRefs.current.forEach((video, index) => {
      if (video && index !== exceptIndex) {
        video.muted = true;
        video.pause();
        setIsPlaying(prev => ({ ...prev, [index]: false }));
      }
    });
  };

  /* ========== ENHANCED AUTOPLAY WITH SOUND MANAGEMENT ========== */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let currentPlayingVideo: HTMLVideoElement | null = null;
    let currentPlayingIndex: number = -1;

    const handleVideoPlayback = async (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset.index);
        const video = videoRefs.current[index];
        
        if (!video) continue;

        // If video is more than 50% visible, play it
        if (entry.intersectionRatio > 0.5) {
          // Pause current playing video if it's different
          if (currentPlayingVideo && currentPlayingVideo !== video) {
            currentPlayingVideo.pause();
            setIsPlaying(prev => ({ ...prev, [currentPlayingIndex]: false }));
          }

          // Mute all other videos
          muteOtherVideos(index);

          // Setup and play the new video
          video.muted = muted[index] ?? false; // Use current mute state, default to unmuted
          video.playsInline = true;
          
          // Handle trim_start for 3s loop
          const startAt = Number(spliks[index]?.trim_start ?? 0);
          if (startAt > 0) {
            video.currentTime = startAt;
          }

          // Add loop handler
          const onTimeUpdate = () => {
            if (video.currentTime - startAt >= 3) {
              video.currentTime = startAt;
            }
          };
          video.removeEventListener("timeupdate", onTimeUpdate);
          video.addEventListener("timeupdate", onTimeUpdate);

          try {
            await video.play();
            currentPlayingVideo = video;
            currentPlayingIndex = index;
            setActiveIndex(index);
            setIsPlaying(prev => ({ ...prev, [index]: true }));
            setShowPauseButton(prev => ({ ...prev, [index]: true }));
          } catch (error) {
            console.log("Autoplay prevented:", error);
            // Fallback: show first frame
            if (video.currentTime === 0) {
              video.currentTime = startAt || 0.1;
            }
          }
        }
        // If video is less than 50% visible and it's currently playing, pause it
        else if (entry.intersectionRatio < 0.5 && video === currentPlayingVideo) {
          video.pause();
          video.muted = true; // Mute when out of view
          setIsPlaying(prev => ({ ...prev, [index]: false }));
          if (currentPlayingVideo === video) {
            currentPlayingVideo = null;
            currentPlayingIndex = -1;
          }
        }
      }
    };

    // Create intersection observer
    const observer = new IntersectionObserver(handleVideoPlayback, {
      root: container,
      threshold: [0, 0.25, 0.5, 0.75, 1.0], // Multiple thresholds for smooth detection
      rootMargin: "0px"
    });

    // Observe all video sections
    const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-index]"));
    sections.forEach((section) => {
      observer.observe(section);
    });

    // Cleanup
    return () => {
      observer.disconnect();
      // Pause all videos and clear timeouts
      videoRefs.current.forEach((video) => {
        if (video && !video.paused) {
          video.pause();
        }
      });
      Object.values(pauseTimeoutRefs.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, [spliks.length, muted, spliks]);

  const scrollTo = (index: number) => {
    const root = containerRef.current;
    if (!root) return;
    const child = root.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (child) child.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleMute = (i: number) => {
    const v = videoRefs.current[i];
    if (!v) return;
    
    const newMutedState = !(muted[i] ?? false);
    
    if (!newMutedState) {
      // If unmuting this video, mute all others
      muteOtherVideos(i);
    }
    
    v.muted = newMutedState;
    setMuted((m) => ({ ...m, [i]: newMutedState }));
  };

  const handlePlayPause = (index: number) => {
    const video = videoRefs.current[index];
    if (!video) return;

    const currentlyPlaying = isPlaying[index] ?? false;

    if (currentlyPlaying) {
      // Pause the video
      video.pause();
      setIsPlaying(prev => ({ ...prev, [index]: false }));
      
      // Hide pause button immediately when clicked
      setShowPauseButton(prev => ({ ...prev, [index]: false }));
      
      // Clear any existing timeout
      if (pauseTimeoutRefs.current[index]) {
        clearTimeout(pauseTimeoutRefs.current[index]);
      }
      
      // Show pause button again after 2 seconds
      pauseTimeoutRefs.current[index] = setTimeout(() => {
        setShowPauseButton(prev => ({ ...prev, [index]: true }));
      }, 2000);
    } else {
      // Play the video
      muteOtherVideos(index);
      
      // Handle trim_start
      const startAt = Number(spliks[index]?.trim_start ?? 0);
      if (startAt > 0) {
        video.currentTime = startAt;
      }
      
      video.muted = muted[index] ?? false;
      video.play().catch(console.error);
      setIsPlaying(prev => ({ ...prev, [index]: true }));
      setShowPauseButton(prev => ({ ...prev, [index]: true }));
    }
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
      // revert on error
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
      // re-fetch
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
      ref={containerRef}
      className="h-[100svh] overflow-y-auto snap-y snap-mandatory scroll-smooth bg-background"
    >
      {spliks.map((s, i) => {
        const videoIsPlaying = isPlaying[i] ?? false;
        const shouldShowPauseButton = showPauseButton[i] ?? true;

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
              <div className="relative bg-black aspect-[9/16] max-h-[600px] group">
                {/* top mask */}
                <div className="absolute inset-x-0 top-0 h-10 bg-black z-10 pointer-events-none" />

                <video
                  ref={(el) => (videoRefs.current[i] = el)}
                  src={s.video_url}
                  poster={s.thumbnail_url ?? undefined}
                  className="w-full h-full object-cover"
                  playsInline
                  muted={muted[i] ?? false}
                  preload="metadata"
                  onEnded={() => scrollTo(Math.min(i + 1, spliks.length - 1))}
                  onLoadedData={() => {
                    // Ensure first frame is visible on load
                    const video = videoRefs.current[i];
                    if (video && video.currentTime === 0) {
                      video.currentTime = 0.1;
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />

                {/* Center play/pause controls */}
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  onClick={() => handlePlayPause(i)}
                >
                  {videoIsPlaying ? (
                    shouldShowPauseButton && (
                      <button
                        aria-label="Pause"
                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-full p-4"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayPause(i);
                        }}
                      >
                        <Pause className="h-10 w-10 text-white drop-shadow-lg" />
                      </button>
                    )
                  ) : (
                    <button
                      aria-label="Play"
                      className="bg-black/35 rounded-full p-4 hover:bg-black/45 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayPause(i);
                      }}
                    >
                      <Play className="h-8 w-8 text-white ml-1" />
                    </button>
                  )}
                </div>

                {/* mute toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute(i);
                  }}
                  className="absolute bottom-3 right-3 bg-black/50 rounded-full p-2 z-20 hover:bg-black/70 transition-colors"
                >
                  {muted[i] ? (
                    <VolumeX className="h-4 w-4 text-white" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-white" />
                  )}
                </button>

                {/* Video title overlay */}
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
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleLike(s.id)}
                      className={likedIds.has(s.id) ? "text-red-500 hover:text-red-600" : "hover:text-red-500"}
                    >
                      <Heart
                        className={`h-6 w-6 ${likedIds.has(s.id) ? "fill-current" : ""}`}
                      />
                    </Button>

                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={() => openComments(s)}
                      className="hover:text-blue-500"
                    >
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
                      className="hover:text-green-500"
                    >
                      <Share2 className="h-6 w-6" />
                    </Button>
                  </div>

                  <Button size="icon" variant="ghost" className="hover:text-yellow-500">
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
