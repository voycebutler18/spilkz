// src/components/ui/VideoFeed.tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  MessageCircle,
  Share2,
  Bookmark,
  BookmarkCheck,
  MoreVertical,
  Volume2,
  VolumeX,
  Send,
  Play,
  Pause,
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
  comments_count?: number | null;
  created_at: string;
  trim_start?: number | null;
  trim_end?: number | null;
  profile?: {
    id?: string;
    username?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
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
      comments_count: Number.isFinite(r?.comments_count as any)
        ? (r!.comments_count as number)
        : 0,
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

/* Stable anon id for non-signed users */
const getAnonKey = () => {
  try {
    let k = localStorage.getItem("feed:anon");
    if (!k) {
      // @ts-ignore
      k = (crypto?.randomUUID?.() as string) || Math.random().toString(36).slice(2);
      localStorage.setItem("feed:anon", k);
    }
    return k;
  } catch {
    return "anon-" + Math.random().toString(36).slice(2);
  }
};

/* Crypto random */
const cRandom = () => {
  if (typeof crypto !== "undefined" && (crypto as any).getRandomValues) {
    const u = new Uint32Array(1);
    (crypto as any).getRandomValues(u);
    return u[0] / 2 ** 32;
  }
  return Math.random();
};

/* Shuffle utility */
const shuffle = <T,>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(cRandom() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* Soft “ranking” like big feeds: recency with a pinch of randomness */
const rankSort = (rows: Splik[]) => {
  const now = Date.now();
  const tau = 1000 * 60 * 60 * 24 * 2; // ~2 days decay
  return [...rows].sort((a, b) => {
    const sa = Math.exp(-(now - new Date(a.created_at).getTime()) / tau) + cRandom() * 0.05;
    const sb = Math.exp(-(now - new Date(b.created_at).getTime()) / tau) + cRandom() * 0.05;
    return sb - sa;
  });
};

/* =================================================================== */

export default function VideoFeed({ user }: VideoFeedProps) {
  const { toast } = useToast();

  const [spliks, setSpliks] = useState<Splik[]>([]);
  const [loading, setLoading] = useState(true);

  // favorites UI
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const [showCommentsFor, setShowCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);

  // autoplay state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [muted, setMuted] = useState<Record<number, boolean>>({});
  const [isPlaying, setIsPlaying] = useState<Record<number, boolean>>({});
  const [showPauseButton, setShowPauseButton] = useState<Record<number, boolean>>({});
  const pauseTimeoutRefs = useRef<Record<number, NodeJS.Timeout>>({});

  // force-remount key to ensure DOM order changes on each shuffle
  const [orderEpoch, setOrderEpoch] = useState(0);

  /* --------- load + ordering (FB/IG/TikTok-ish) --------- */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("spliks")
          .select(`
            id, user_id, title, description, video_url, thumbnail_url,
            trim_start, trim_end, created_at,
            profile:profiles(
              id, username, display_name, first_name, avatar_url
            )
          `);

        if (error) throw error;
        const all = normalizeSpliks((data as Splik[]) || []);
        if (all.length === 0) {
          setSpliks([]);
          setLoading(false);
          return;
        }

        // user-scoped keys so each person has a different feed memory
        const userKey = user?.id || getAnonKey();
        const SEEN_KEY = `feed:seen:${userKey}`;
        const LAST_FIRST_KEY = `feed:last-first:${userKey}`;
        const LAST_PINNED_KEY = `feed:last-pinned-newest:${userKey}`;

        // load “seen” set
        const seenRaw = localStorage.getItem(SEEN_KEY);
        const seen = new Set<string>(seenRaw ? JSON.parse(seenRaw) : []);

        // newest video
        const newest = [...all].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        // Have we already pinned this exact newest once for this user?
        const lastPinnedNewest = localStorage.getItem(LAST_PINNED_KEY);

        let ordered: Splik[];

        if (!lastPinnedNewest || lastPinnedNewest !== newest.id) {
          // First visit since a brand-new upload: show newest first exactly once
          ordered = [newest, ...rankSort(all.filter((x) => x.id !== newest.id))];
          localStorage.setItem(LAST_PINNED_KEY, newest.id);
        } else {
          // After that, shuffle/rank the entire feed
          ordered = rankSort(all);
        }

        // Avoid same first card as last time for this user
        const prevFirst = localStorage.getItem(LAST_FIRST_KEY);
        if (ordered.length > 1 && prevFirst && ordered[0].id === prevFirst) {
          const j = 1 + Math.floor(cRandom() * (ordered.length - 1));
          [ordered[0], ordered[j]] = [ordered[j], ordered[0]];
        }
        localStorage.setItem(LAST_FIRST_KEY, ordered[0].id);

        setSpliks(ordered);

        // init player UI
        const mutedState: Record<number, boolean> = {};
        const pauseState: Record<number, boolean> = {};
        ordered.forEach((_, index) => {
          mutedState[index] = false;
          pauseState[index] = true;
        });
        setMuted(mutedState);
        setShowPauseButton(pauseState);

        // preload favorites
        if (user?.id) {
          const { data: favs } = await supabase
            .from("favorites")
            .select("splik_id")
            .eq("user_id", user.id);
          if (favs) setSavedIds(new Set(favs.map((f: any) => f.splik_id)));
        }

        // force DOM reorder + scroll top
        setOrderEpoch((e) => e + 1);
        containerRef.current?.scrollTo({ top: 0, behavior: "instant" as any });

        // mark-first-as-seen-on-visibility (persist) — handled in IO below
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id]);

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
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // mark seen helper (persist per user/anon)
  const markSeen = (videoId: string) => {
    const key = `feed:seen:${user?.id || getAnonKey()}`;
    const raw = localStorage.getItem(key);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    if (!set.has(videoId)) {
      set.add(videoId);
      // cap to reasonable size
      const arr = Array.from(set).slice(-600);
      localStorage.setItem(key, JSON.stringify(arr));
    }
  };

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

  /* ========== Autoplay + mark-seen ========== */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let currentPlayingVideo: HTMLVideoElement | null = null;
    let currentPlayingIndex = -1;

    const handleVideoPlayback = async (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const idxAttr = (entry.target as HTMLElement).dataset.index;
        if (idxAttr == null) continue;

        const index = Number(idxAttr);
        if (!Number.isFinite(index) || index < 0 || index >= spliks.length) continue;

        const video = videoRefs.current[index];
        if (!video) continue;

        if (entry.intersectionRatio > 0.5) {
          // mark as seen when it becomes the primary card
          const s = spliks[index];
          if (s) markSeen(s.id);

          if (currentPlayingVideo && currentPlayingVideo !== video) {
            currentPlayingVideo.pause();
            setIsPlaying((prev) => ({ ...prev, [currentPlayingIndex]: false }));
          }

          muteOtherVideos(index);

          video.muted = muted[index] ?? false;
          video.playsInline = true;

          const startAt = Number(spliks[index]?.trim_start ?? 0);
          if (startAt > 0) video.currentTime = startAt;

          const onTimeUpdate = () => {
            if (video.currentTime - startAt >= 3) video.currentTime = startAt;
          };
          video.removeEventListener("timeupdate", onTimeUpdate);
          video.addEventListener("timeupdate", onTimeUpdate);

          try {
            await video.play();
            currentPlayingVideo = video;
            currentPlayingIndex = index;
            setIsPlaying((prev) => ({ ...prev, [index]: true }));
            setShowPauseButton((prev) => ({ ...prev, [index]: true }));
          } catch {
            if (video.currentTime === 0) video.currentTime = startAt || 0.1;
          }
        } else if (entry.intersectionRatio < 0.5 && video === currentPlayingVideo) {
          video.pause();
          video.muted = true;
          setIsPlaying((prev) => ({ ...prev, [index]: false }));
          if (currentPlayingVideo === video) {
            currentPlayingVideo = null;
            currentPlayingIndex = -1;
          }
        }
      }
    };

    const observer = new IntersectionObserver(handleVideoPlayback, {
      root: container,
      threshold: [0, 0.25, 0.5, 0.75, 1.0],
      rootMargin: "0px",
    });

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
    const newMutedState = !(muted[i] ?? false);
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
      setShowPauseButton((prev) => ({ ...prev, [index]: false }));
      if (pauseTimeoutRefs.current[index]) clearTimeout(pauseTimeoutRefs.current[index]);
      pauseTimeoutRefs.current[index] = setTimeout(() => {
        setShowPauseButton((prev) => ({ ...prev, [index]: true }));
      }, 2000);
    } else {
      muteOtherVideos(index);
      const startAt = Number(spliks[index]?.trim_start ?? 0);
      if (startAt > 0) video.currentTime = startAt;
      video.muted = muted[index] ?? false;
      video.play().catch(console.error);
      setIsPlaying((prev) => ({ ...prev, [index]: true }));
      setShowPauseButton((prev) => ({ ...prev, [index]: true }));
    }
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

    const { error } = await supabase.from("comments").insert({
      splik_id: showCommentsFor,
      user_id: user.id,
      content: newComment.trim(),
    });

    if (error) {
      toast({
        title: "Error",
        description:
          (error as any).code === "42501"
            ? "You don't have permission to post comments. (RLS policy)"
            : (error as any).message || "Failed to post comment",
        variant: "destructive",
      });
      return;
    }

    setNewComment("");
    const splik = spliks.find((s) => s.id === showCommentsFor);
    if (splik) openComments(splik);
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
        const isSaved = savedIds.has(s.id);
        const saving = savingIds.has(s.id);

        return (
          <section
            key={`${orderEpoch}-${s.id}`}
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
                <Button size="icon" variant="ghost">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </div>

              {/* video */}
              <div className="relative bg-black aspect-[9/16] max-h-[600px] group">
                <div className="absolute inset-x-0 top-0 h-10 bg-black z-10 pointer-events-none" />
                <video
                  ref={(el) => (videoRefs.current[i] = el)}
                  src={s.video_url}
                  poster={s.thumbnail_url ?? undefined}
                  className="w-full h-full object-cover"
                  playsInline
                  muted={muted[i] ?? false}
                  preload="metadata"
                  onEnded={() => {
                    const next = Math.min(i + 1, spliks.length - 1);
                    const root = containerRef.current;
                    const child = root?.querySelector<HTMLElement>(`[data-index="${next}"]`);
                    child?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  onLoadedData={() => {
                    const video = videoRefs.current[i];
                    if (video && video.currentTime === 0) video.currentTime = 0.1;
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />

                {/* Center play/pause controls */}
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  onClick={() => handlePlayPause(i)}
                >
                  {videoIsPlaying ? (
                    shouldShowPauseButton && (
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-full p-4">
                        <Pause className="h-10 w-10 text-white drop-shadow-lg" />
                      </span>
                    )
                  ) : (
                    <span className="bg-black/35 rounded-full p-4 hover:bg-black/45 transition-colors">
                      <Play className="h-8 w-8 text-white ml-1" />
                    </span>
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

                {/* title overlay */}
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
                      onClick={() => openComments(s)}
                      className="hover:text-blue-500"
                    >
                      <MessageCircle className="h-6 w-6" />
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        const url = `${window.location.origin.replace(/\/$/,"")}/splik/${s.id}`;
                        navigator.clipboard.writeText(url);
                        toast({ title: "Link copied!" });
                      }}
                      className="hover:text-green-500"
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
                          <span className="font-semibold mr-2">{c.profiles?.first_name || "User"}</span>
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
