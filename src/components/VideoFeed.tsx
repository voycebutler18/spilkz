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
  Shuffle as ShuffleIcon,
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

/** Normalize rows so UI never crashes on missing values */
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

/* ---------- seeded RNG + shuffle (stable API-wide randomness) ---------- */
// lightweight string hash -> 32-bit
function xfnv1a(str: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => h >>> 0;
}
// 32-bit PRNG
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const getDeviceId = () => {
  try {
    let id = localStorage.getItem("feed:device-id");
    if (!id) {
      id =
        (crypto as any)?.randomUUID?.() ||
        Math.random().toString(36).slice(2);
      localStorage.setItem("feed:device-id", id);
    }
    return id;
  } catch {
    return "anon-device";
  }
};
const makeRng = (seedStr: string) => {
  const h = xfnv1a(seedStr)();
  return mulberry32(h);
};
const shuffleWithRng = <T,>(arr: T[], rng: () => number) => {
  const list = [...arr];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
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
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState<Record<number, boolean>>({});
  const [isPlaying, setIsPlaying] = useState<Record<number, boolean>>({});
  const [showPauseButton, setShowPauseButton] = useState<Record<number, boolean>>({});
  const pauseTimeoutRefs = useRef<Record<number, NodeJS.Timeout>>({});

  // session seed (new every refresh)
  const deviceIdRef = useRef(getDeviceId());
  const sessionSeedRef = useRef<string>(
    `${Date.now()}|${(crypto as any)?.getRandomValues
      ? (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0)
      : Math.floor(Math.random() * 2 ** 32)}`
  );

  /* --------- load + SHUFFLE on every refresh --------- */
  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("spliks")
          .select(`
            id, user_id, title, description, video_url, thumbnail_url,
            trim_start, trim_end,
            created_at,
            profile:profiles(
              id, username, display_name, first_name, avatar_url
            )
          `); // order doesn't matter; we shuffle below

        if (error) throw error;

        const allVideos = normalizeSpliks((data as Splik[]) || []);

        // seed uses deviceId + userId + sessionSeed (new every reload)
        const seed = `${deviceIdRef.current}|${user?.id ?? "anon"}|${sessionSeedRef.current}`;
        const rng = makeRng(seed);

        const list = shuffleWithRng(allVideos, rng);

        setSpliks(list);

        // init mute/pause UI for the new list
        const mutedState: Record<number, boolean> = {};
        const pauseState: Record<number, boolean> = {};
        list.forEach((_, index) => {
          mutedState[index] = false;
          pauseState[index] = true;
        });
        setMuted(mutedState);
        setShowPauseButton(pauseState);

        // favorites preload (for this user)
        if (user?.id) {
          const { data: favs } = await supabase
            .from("favorites")
            .select("splik_id")
            .eq("user_id", user.id);
          if (favs) setSavedIds(new Set(favs.map((f: any) => f.splik_id)));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  /* ---------- Shuffle button handler ---------- */
  const reshuffle = () => {
    if (!spliks.length) return;
    // new seed (changes every click) – still personalized by device/user
    const clickSeed = `${deviceIdRef.current}|${user?.id ?? "anon"}|click|${Date.now()}`;
    const rng = makeRng(clickSeed);
    const list = shuffleWithRng(spliks, rng);
    setSpliks(list);

    // reset players + scroll to top
    videoRefs.current.forEach((v) => v?.pause());
    setIsPlaying({});
    setShowPauseButton({});
    setMuted({});
    const mutedState: Record<number, boolean> = {};
    const pauseState: Record<number, boolean> = {};
    list.forEach((_, i) => {
      mutedState[i] = false;
      pauseState[i] = true;
    });
    setMuted(mutedState);
    setShowPauseButton(pauseState);
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ---------- realtime sync for favorites (this user) ---------- */
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

  /* ========== Autoplay (intersection) ========== */
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
            setActiveIndex(index);
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
  }, [spliks, muted]);

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
      // revert on error
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
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
        <div className="text-xs text-muted-foreground">Loading feed…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100svh] bg-background">
      {/* top bar with Shuffle */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-3 py-2 flex items-center justify-between">
        <div className="text-sm font-semibold">For You</div>
        <Button size="sm" variant="secondary" onClick={reshuffle} className="gap-2">
          <ShuffleIcon className="h-4 w-4" />
          Shuffle
        </Button>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto snap-y snap-mandatory scroll-smooth"
      >
        {spliks.map((s, i) => {
          const videoIsPlaying = isPlaying[i] ?? false;
          const shouldShowPauseButton = showPauseButton[i] ?? true;
          const isSaved = savedIds.has(s.id);
          const saving = savingIds.has(s.id);

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
                    onEnded={() => scrollTo(Math.min(i + 1, spliks.length - 1))}
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

                    {/* Save / Saved with indicator */}
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
    </div>
  );
}
