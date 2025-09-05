
// src/components/ui/VideoFeed.tsx
import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
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
  Play,
  Pause,
  Volume2,
  VolumeX,
  Send,
  Eye,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/** ---------- helpers ---------- */

const getSessionId = () => {
  let id = sessionStorage.getItem("splik_session_id");
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem("splik_session_id", id);
  }
  return id;
};

interface Splik {
  id: string;
  title: string;
  description?: string;
  video_url: string;
  thumbnail_url?: string;
  user_id: string;
  views?: number | null;
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
  profiles?: {
    first_name?: string | null;
    last_name?: string | null;
  } | null;
}

interface VideoFeedProps {
  user: any;
}

export default function VideoFeed({ user }: VideoFeedProps) {
  const { toast } = useToast();

  const [spliks, setSpliks] = useState<Splik[]>([]);
  const [loading, setLoading] = useState(true);

  // live view state (source of truth for the badge on Home feed)
  const [viewsById, setViewsById] = useState<Record<string, number>>({});

  // playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // social UI
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [showCommentsFor, setShowCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);

  /** ------------------- initial loads ------------------- */

  useEffect(() => {
    const load = async () => {
      try {
        // feed
        const { data, error } = await supabase
          .from("spliks")
          .select(
            "id,title,description,video_url,thumbnail_url,user_id,views,likes_count,comments_count,created_at,trim_start"
          )
          .order("created_at", { ascending: false });

        if (error) throw error;

        setSpliks(data || []);

        // seed live views map
        const seed: Record<string, number> = {};
        (data || []).forEach((s) => {
          seed[s.id] = typeof s.views === "number" ? s.views : 0;
        });
        setViewsById(seed);

        // liked
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

  /** ------------------- realtime views (Home feed) ------------------- */

  // Subscribe to UPDATEs on spliks and update the views for items present in the feed.
  useEffect(() => {
    if (spliks.length === 0) return;

    const channel = supabase
      .channel("home-live-views")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "spliks" },
        (payload) => {
          const row = payload.new as { id: string; views?: number; view_count?: number };
          // Only update if the splik is currently rendered in the Home feed
          if (!row?.id) return;
          const isInFeed = spliks.some((s) => s.id === row.id);
          if (!isInFeed) return;

          const next =
            typeof row.views === "number"
              ? row.views
              : typeof (row as any).view_count === "number"
              ? (row as any).view_count
              : undefined;

          if (typeof next === "number") {
            setViewsById((prev) => ({ ...prev, [row.id]: next }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [spliks]);

  /** ------------------- play / view tracking ------------------- */

  const sessionId = useMemo(() => getSessionId(), []);

  const startPlaying = async (id: string) => {
    // pause previous
    if (playingId && playingId !== id) {
      const prev = videoRefs.current[playingId];
      prev?.pause();
    }

    const el = videoRefs.current[id];
    if (!el) return;

    // loop 3s preview (with optional trim_start)
    const current = spliks.find((s) => s.id === id);
    const startAt = current?.trim_start ? Number(current.trim_start) : 0;

    const onTimeUpdate = () => {
      if (el.currentTime - startAt >= 3) {
        el.currentTime = startAt;
      }
    };
    el.removeEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("timeupdate", onTimeUpdate);

    try {
      if (startAt > 0) el.currentTime = startAt;
      await el.play();
      setPlayingId(id);

      // trigger view (session-gated)
      try {
        const { data, error } = await supabase.rpc(
          "increment_view_with_session",
          {
            p_splik_id: id,
            p_session_id: sessionId,
            p_viewer_id: user?.id ?? null,
          }
        );

        if (!error && data && data.new_view) {
          const newCount =
            typeof data.view_count === "number" ? data.view_count : undefined;
          if (typeof newCount === "number") {
            // optimistic update so the badge moves instantly
            setViewsById((prev) => ({ ...prev, [id]: newCount }));
          }
        }
      } catch (e) {
        console.warn("view rpc error (non-fatal):", e);
      }
    } catch {
      // try muted autoplay fallback
      el.muted = true;
      setMuted((m) => ({ ...m, [id]: true }));
      try {
        await el.play();
        setPlayingId(id);
      } catch (e) {
        console.warn("autoplay blocked", e);
      }
    }
  };

  const togglePlay = (id: string) => {
    const el = videoRefs.current[id];
    if (!el) return;
    if (playingId === id && !el.paused) {
      el.pause();
      setPlayingId(null);
      return;
    }
    startPlaying(id);
  };

  const toggleMute = (id: string) => {
    const el = videoRefs.current[id];
    if (!el) return;
    const next = !muted[id];
    el.muted = next;
    setMuted((m) => ({ ...m, [id]: next }));
  };

  /** ------------------- social (unchanged) ------------------- */

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
    } catch (e) {
      // revert on error
      setLikedIds((prev) => {
        const ns = new Set(prev);
        isLiked ? ns.add(splikId) : ns.delete(splikId);
        return ns;
      });
      toast({
        title: "Error",
        description: "Failed to update like",
        variant: "destructive",
      });
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
      openComments({} as any); // re-fetch via existing function
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to post comment",
        variant: "destructive",
      });
    }
  };

  /** ------------------- UI ------------------- */

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  const nameFor = (s: Splik) =>
    (s.profiles?.first_name || s.profiles?.username || "Anonymous User").toString();

  const initialsFor = (s: Splik) =>
    nameFor(s)
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="max-w-lg mx-auto space-y-6 py-4">
      {spliks.map((s) => {
        const liveViews = viewsById[s.id] ?? s.views ?? 0;
        const isPlaying = playingId === s.id;

        return (
          <Card key={s.id} className="overflow-hidden border-0 shadow-lg">
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
              {/* top black stripe that also covers any stray "0" */}
              <div className="absolute inset-x-0 top-0 h-10 bg-black z-10 pointer-events-none" />

              {/* live views badge (updates via realtime + optimistic) */}
              <div
                className="absolute top-2 left-2 z-20 flex items-center gap-2 bg-black/80 backdrop-blur px-3 py-1.5 rounded-full"
                aria-live="polite"
              >
                <Eye className="h-4 w-4 text-white" />
                <span className="text-white font-semibold text-sm">
                  {liveViews.toLocaleString()} views
                </span>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              </div>

              <video
                ref={(el) => (videoRefs.current[s.id] = el)}
                src={s.video_url}
                poster={s.thumbnail_url || undefined}
                className="w-full h-full object-cover"
                loop={false}
                playsInline
                muted={!!muted[s.id]}
                onClick={() => togglePlay(s.id)}
              />

              {/* play/pause overlay */}
              {!isPlaying && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer z-10"
                  onClick={() => togglePlay(s.id)}
                >
                  <div className="bg-white/90 rounded-full p-4">
                    <Play className="h-8 w-8 text-black" />
                  </div>
                </div>
              )}

              {/* mute toggle (only while playing) */}
              {isPlaying && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute(s.id);
                  }}
                  className="absolute bottom-3 right-3 bg-black/50 rounded-full p-2 z-20"
                >
                  {muted[s.id] ? (
                    <VolumeX className="h-4 w-4 text-white" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-white" />
                  )}
                </button>
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

            {/* comments dialog (simple inline version to keep rest unchanged) */}
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
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitComment();
                      }}
                    />
                    <Button size="icon" onClick={submitComment} disabled={!newComment.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
