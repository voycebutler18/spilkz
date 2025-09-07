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

  // Global sound pref: we WANT sound, but many mobiles require a gesture first.
  const [soundPreferred, setSoundPreferred] = useState<boolean>(() => {
    const saved = localStorage.getItem("feedSoundOn");
    return saved ? saved === "true" : true;
  });

  // Tracks if the user has interacted (unlocks sound on iOS/Android)
  const userInteractedRef = useRef(false);

  // per-video mute cache (after interaction, we use this to persist per item)
  const [mutedByIndex, setMutedByIndex] = useState<Record<number, boolean>>({});

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
        if (containerRef.current) containerRef.current.scrollTop = 0;
      }
    };
    load();
  }, [user?.id]);

  // also ensure top when the list length changes (navigation between feeds)
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [spliks.length]);

  /* ========== AUTOPLAY MANAGER (muted-by-default so mobile will play; switch to sound after first tap) ========== */
  const thresholds = useMemo(() => Array.from({ length: 21 }, (_, i) => i / 20), []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const sectionVisibility: Record<number, number> = {};
    let currentPlayingIndex: number | null = null;
    let isProcessing = false;

    const setupVideoBase = (video: HTMLVideoElement, index: number) => {
      // Required for iOS/Safari inline autoplay
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");

      // Show first frame quickly
      video.preload = index <= 1 ? "auto" : "metadata";

      // Never show controls, disable PiP
      video.controls = false;
      (video as any).disablePictureInPicture = true;

      // CRUCIAL: keep muted attribute on the node at creation time so mobile will autoplay
      if (!video.hasAttribute("muted")) {
        video.muted = true;
        video.setAttribute("muted", "true");
      }
    };

    const applyLoop3s = (video: HTMLVideoElement, startAt: number) => {
      const onTimeUpdate = () => {
        if (video.currentTime - startAt >= 3) {
          video.currentTime = startAt;
        }
      };
      video.removeEventListener("timeupdate", onTimeUpdate as any);
      video.addEventListener("timeupdate", onTimeUpdate);
    };

    const chooseMuteFor = (index: number) => {
      // Before interaction: must be muted for autoplay on mobile
      if (!userInteractedRef.current) return true;

      // After interaction: use global preference unless overridden per index
      if (index in mutedByIndex) return mutedByIndex[index];
      return !soundPreferred ? true : false;
    };

    const setVideoMute = (video: HTMLVideoElement, index: number) => {
      const shouldMute = chooseMuteFor(index);
      video.muted = shouldMute;
      if (shouldMute) video.setAttribute("muted", "true");
      else video.removeAttribute("muted");
      return shouldMute;
    };

    const ensurePlayable = async (video: HTMLVideoElement) => {
      if (video.readyState < 2) {
        video.load();
        await new Promise((r) => setTimeout(r, 60));
      }
      if (video.currentTime === 0 && (video.duration || 0) > 0) {
        try {
          video.currentTime = 0.1;
        } catch {}
      }
    };

    const tryPlay = async (video: HTMLVideoElement, index: number) => {
      const wasMuted = setVideoMute(video, index);
      await ensurePlayable(video);
      try {
        await video.play();
        return true;
      } catch {
        // If blocked and not muted, retry muted once
        if (!wasMuted) {
          video.muted = true;
          video.setAttribute("muted", "true");
          setMutedByIndex((m) => ({ ...m, [index]: true }));
          try {
            await video.play();
            return true;
          } catch {
            return false;
          }
        }
        return false;
      }
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

        // If current falls below 45% visible, pause it
        if (currentPlayingIndex !== null && (sectionVisibility[currentPlayingIndex] || 0) < 0.45) {
          const cv = videoRefs.current[currentPlayingIndex];
          if (cv && !cv.paused) cv.pause();
          currentPlayingIndex = null;
        }

        if (targetIndex !== null && targetIndex !== currentPlayingIndex) {
          // Pause others
          videoRefs.current.forEach((v, i) => {
            if (v && i !== targetIndex && !v.paused) v.pause();
          });

          const v = videoRefs.current[targetIndex];
          if (v) {
            setupVideoBase(v, targetIndex);

            const startAt = Number(spliks[targetIndex]?.trim_start ?? 0);
            if (startAt > 0) {
              try {
                v.currentTime = startAt;
              } catch {}
            }
            applyLoop3s(v, startAt);

            const ok = await tryPlay(v, targetIndex);
            if (ok) {
              currentPlayingIndex = targetIndex;
              setActiveIndex(targetIndex);
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

    // Observer
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

    // Init nodes and observe
    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-index]"));
    sections.forEach((s) => intersectionObserver.observe(s));

    // Kick off once—some mobiles delay IO until scroll
    handleVideoPlayback();
    requestAnimationFrame(handleVideoPlayback);

    // Pause/resume on tab visibility
    const onVis = () => {
      if (document.hidden) {
        videoRefs.current.forEach((v) => v && !v.paused && v.pause());
      } else {
        handleVideoPlayback();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      videoRefs.current.forEach((v) => v && !v.paused && v.pause());
    };
  }, [spliks.length, thresholds, spliks, soundPreferred, mutedByIndex]);

  /* Unlock sound on first user gesture and immediately apply to current video */
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const unlock = async () => {
      if (!userInteractedRef.current) {
        userInteractedRef.current = true;
        // If user prefers sound, unmute current and play immediately inside the gesture
        if (soundPreferred) {
          const v = videoRefs.current[activeIndex];
          if (v) {
            v.muted = false;
            v.removeAttribute("muted");
            try {
              await v.play();
            } catch {
              // ignore – the IO loop will retry
            }
          }
        }
      }
    };

    // Any pointer/touch/click inside the feed counts as interaction
    const onPointerDown = () => void unlock();
    root.addEventListener("pointerdown", onPointerDown, { passive: true });

    return () => {
      root.removeEventListener("pointerdown", onPointerDown as any);
    };
  }, [activeIndex, soundPreferred]);

  /* Proactively start the very first video ASAP (muted so mobile allows it) */
  useEffect(() => {
    if (loading || !spliks.length) return;
    const v = videoRefs.current[0];
    if (!v) return;

    v.autoplay = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "true");
    v.setAttribute("webkit-playsinline", "true");
    v.controls = false;
    (v as any).disablePictureInPicture = true;

    // Must be muted at load to autoplay on mobile
    v.muted = true;
    v.setAttribute("muted", "true");
    v.preload = "auto";

    const startAt = Number(spliks[0]?.trim_start ?? 0);
    if (startAt > 0) {
      try {
        v.currentTime = startAt;
      } catch {}
    }

    requestAnimationFrame(() => {
      v.play().catch(() => {
        // Ignore; IO loop will also attempt
      });
    });
  }, [loading, spliks]);

  const scrollTo = (index: number) => {
    const root = containerRef.current;
    if (!root) return;
    const child = root.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (child) child.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const setGlobalSound = (on: boolean) => {
    setSoundPreferred(on);
    localStorage.setItem("feedSoundOn", on ? "true" : "false");
  };

  const toggleMute = (i: number) => {
    // Counts as interaction for mobile sound policies
    if (!userInteractedRef.current) userInteractedRef.current = true;

    const v = videoRefs.current[i];
    if (!v) return;

    const nextMuted = !(v.muted === true ? true : false);
    v.muted = nextMuted;
    if (nextMuted) v.setAttribute("muted", "true");
    else v.removeAttribute("muted");

    setMutedByIndex((m) => ({ ...m, [i]: nextMuted }));
    // Update global pref so next videos follow it
    setGlobalSound(!nextMuted);
  };

  /* ---------------- social actions ---------------- */
  const handleLike = async (splikId: string) => {
    if (!user?.id) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like videos",
        variant: "destructive",
      });
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
        await supabase.from("likes").insert({ user_id: user.id, splik_id: spllikId });
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
                {/* mask to hide any seam at the top */}
                <div className="absolute inset-x-0 top-0 h-10 bg-black z-10 pointer-events-none" />

                <video
                  ref={(el) => {
                    videoRefs.current[i] = el;
                    if (el) {
                      el.dataset.index = String(i);
                      // IMPORTANT: put autoplay & muted directly in markup for mobile policy
                      el.autoplay = true;
                      el.muted = true;
                      el.setAttribute("muted", "true");
                      el.playsInline = true;
                      el.setAttribute("playsinline", "true");
                      el.setAttribute("webkit-playsinline", "true");
                      (el as any).disablePictureInPicture = true;
                      el.controls = false;
                      el.preload = i <= 1 ? "auto" : "metadata";
                    }
                  }}
                  src={s.video_url}
                  poster={s.thumbnail_url ?? undefined}
                  className="w-full h-full object-cover"
                  onLoadedData={() => {
                    const v = videoRefs.current[i];
                    if (v && v.currentTime === 0) {
                      try {
                        v.currentTime = 0.1;
                      } catch {}
                    }
                    // set up the 3s loop per video
                    const startAt = Number(s.trim_start ?? 0);
                    const onTimeUpdate = () => {
                      if (v && v.currentTime - startAt >= 3) {
                        v.currentTime = startAt;
                      }
                    };
                    v?.removeEventListener("timeupdate", onTimeUpdate as any);
                    v?.addEventListener("timeupdate", onTimeUpdate);
                  }}
                  onEnded={() => scrollTo(Math.min(i + 1, spliks.length - 1))}
                />

                {/* clear mute/unmute button (mobile + desktop) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // counts as interaction; allows turning audio on for mobile
                    if (!userInteractedRef.current) userInteractedRef.current = true;

                    const v = videoRefs.current[i];
                    if (!v) return;
                    const next = !v.muted;
                    v.muted = next;
                    if (next) v.setAttribute("muted", "true");
                    else v.removeAttribute("muted");
                    setMutedByIndex((m) => ({ ...m, [i]: next }));
                    setSoundPreferred(!next);
                    localStorage.setItem("feedSoundOn", (!next).toString());
                    // ensure play resumes after toggle
                    v.play().catch(() => {});
                  }}
                  className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/70 rounded-full p-2 z-20"
                  aria-label="Toggle sound"
                >
                  {(mutedByIndex[i] ?? !soundPreferred || !userInteractedRef.current) ? (
                    <VolumeX className="h-4 w-4 text-white" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-white" />
                  )}
                </button>

                {/* invisible tap layer to assist snap/interaction */}
                <div className="absolute inset-0" onClick={() => scrollTo(i)} />
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
