// src/components/ui/VideoFeed.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Heart, MessageCircle, Share2, Bookmark, MoreVertical, Play, Volume2, VolumeX, Send } from "lucide-react";
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

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("spliks")
          .select("id,title,description,video_url,thumbnail_url,user_id,likes_count,comments_count,created_at,trim_start")
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
      }
    };
    load();
  }, [user?.id]);

  /* ------------------ IntersectionObserver for autoplay ------------------ */
  const thresholds = useMemo(
    () => Array.from({ length: 21 }, (_, i) => i / 20), // 0, .05, .10 ... 1
    []
  );

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const visibility: Record<number, number> = {};
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const idx = Number((e.target as HTMLElement).dataset.index);
          visibility[idx] = e.intersectionRatio;
        });

        // pick most visible; require >= 0.55 so we switch “halfway”
        let bestIdx = activeIndex;
        let bestRatio = visibility[bestIdx] ?? 0;
        for (const [k, v] of Object.entries(visibility)) {
          const i = Number(k);
          if (v > bestRatio) {
            bestRatio = v;
            bestIdx = i;
          }
        }
        if (bestRatio >= 0.55 && bestIdx !== activeIndex) {
          setActiveIndex(bestIdx);
        }
      },
      { root, threshold: thresholds }
    );

    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-index]"));
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [spliks.length, thresholds]); // run when feed size changes

  // play/pause only the active one
  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === activeIndex) {
        v.muted = muted[i] ?? true;
        v.playsInline = true;

        // enforce 3s loop from trim_start
        const startAt = Number(spliks[i]?.trim_start ?? 0);
        const onTime = () => {
          if (v.currentTime - startAt >= 3) v.currentTime = startAt;
        };
        v.removeEventListener("timeupdate", onTime);
        v.addEventListener("timeupdate", onTime);

        if (startAt > 0) v.currentTime = startAt;
        v.play().catch(() => {
          // if autoplay blocked, force mute and try again once
          if (!v.muted) {
            v.muted = true;
            setMuted((m) => ({ ...m, [i]: true }));
            v.play().catch(() => {});
          }
        });
      } else {
        if (!v.paused) v.pause();
      }
    });
  }, [activeIndex, spliks, muted]);

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
                  onEnded={() => scrollTo(Math.min(i + 1, spliks.length - 1))}
                />

                {/* play hint when paused (if ever) */}
                <div
                  className="absolute inset-0 flex items-center justify-center bg-black/0"
                  onClick={() => scrollTo(i)} // single tap recenters/ensures snap
                >
                  <div className="bg-white/80 rounded-full p-3 opacity-0 pointer-events-none" />
                </div>

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
