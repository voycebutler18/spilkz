// src/components/VideoGrid.tsx
import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Heart,
  Share2,
  Eye,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FollowButton } from "@/components/FollowButton";
import DeleteSplikButton from "@/components/dashboard/DeleteSplikButton";

/* ---------- types ---------- */
interface Profile {
  username: string;
  display_name: string;
  avatar_url?: string;
}

interface Splik {
  id: string;
  video_url: string;
  thumbnail_url?: string;
  title?: string;
  description?: string;
  views: number;
  likes_count: number;
  created_at: string;
  user_id: string;
  profiles?: Profile;
}

interface VideoGridProps {
  spliks: Splik[];
  showCreatorInfo?: boolean;
  onDeletedSplik?: (splikId: string) => void;
}

export function VideoGrid({
  spliks,
  showCreatorInfo = true,
  onDeletedSplik,
}: VideoGridProps) {
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [mutedVideos, setMutedVideos] = useState<Set<string>>(new Set());

  // likes (hype)
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set());

  // favorites (save)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // counts we render (no comments)
  const [videoStats, setVideoStats] = useState<{
    [id: string]: { views: number; likes: number };
  }>({});

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});
  const sessionIdRef = useRef(`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
      if (user?.id) {
        preloadLiked(user.id);
        preloadSaved(user.id);
      }
    });
  }, []);

  useEffect(() => {
    // seed stats for each card
    const stats: any = {};
    spliks.forEach((s) => {
      stats[s.id] = {
        views: s.views || 0,
        likes: s.likes_count || 0,
      };
    });
    setVideoStats(stats);

    // live updates (views/likes only)
    const channel = supabase
      .channel("video-grid-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "spliks" },
        (payload) => {
          const n: any = payload.new;
          setVideoStats((prev) => ({
            ...prev,
            [n.id]: {
              views: n.views || 0,
              likes: n.likes_count || 0,
            },
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [spliks]);

  /* ---------- preload liked & saved ---------- */
  const preloadLiked = async (userId: string) => {
    const { data } = await supabase.from("likes").select("splik_id").eq("user_id", userId);
    if (data) setLikedVideos(new Set(data.map((l) => l.splik_id)));
  };

  const preloadSaved = async (userId: string) => {
    const { data } = await supabase.from("favorites").select("splik_id").eq("user_id", userId);
    if (data) setSavedIds(new Set(data.map((r) => r.splik_id)));
  };

  /* ---------- video controls ---------- */
  const handlePlayToggle = async (splikId: string) => {
    const video = videoRefs.current[splikId];
    if (!video) return;

    if (playingVideo === splikId) {
      video.pause();
      setPlayingVideo(null);
    } else {
      if (playingVideo && videoRefs.current[playingVideo]) {
        videoRefs.current[playingVideo].pause();
      }
      video.currentTime = 0;
      video.play();
      setPlayingVideo(splikId);

      // view RPC
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const result = await supabase.rpc("increment_view_with_session", {
        p_splik_id: splikId,
        p_session_id: sessionIdRef.current,
        p_viewer_id: user?.id || null,
      });

      if (result.data) {
        const viewData = result.data as any;
        if (viewData.new_view && viewData.view_count) {
          setVideoStats((prev) => ({
            ...prev,
            [splikId]: {
              ...prev[splikId],
              views: viewData.view_count,
            },
          }));
        }
      }
    }
  };

  const handleTimeUpdate = (splikId: string) => {
    const video = videoRefs.current[splikId];
    if (!video) return;
    if (video.currentTime >= 3) {
      video.pause();
      video.currentTime = 0;
      setPlayingVideo(null);
    }
  };

  const toggleMute = (splikId: string) => {
    const video = videoRefs.current[splikId];
    if (!video) return;

    const next = new Set(mutedVideos);
    if (next.has(splikId)) {
      next.delete(splikId);
      video.muted = false;
    } else {
      next.add(splikId);
      video.muted = true;
    }
    setMutedVideos(next);
  };

  /* ---------- hype (likes) ---------- */
  const handleLike = async (splikId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to hype videos");
      return;
    }

    // optimistic
    const liked = likedVideos.has(splikId);
    setLikedVideos((prev) => {
      const next = new Set(prev);
      liked ? next.delete(splikId) : next.add(splikId);
      return next;
    });
    setVideoStats((prev) => ({
      ...prev,
      [splikId]: {
        ...prev[splikId],
        likes: Math.max(0, (prev[splikId]?.likes || 0) + (liked ? -1 : 1)),
      },
    }));

    try {
      if (liked) {
        await supabase.from("likes").delete().eq("splik_id", splikId).eq("user_id", user.id);
      } else {
        await supabase.from("likes").insert({ splik_id: splikId, user_id: user.id });
      }
    } catch {
      // revert on error
      setLikedVideos((prev) => {
        const next = new Set(prev);
        liked ? next.add(splikId) : next.delete(splikId);
        return next;
      });
      setVideoStats((prev) => ({
        ...prev,
        [splikId]: {
          ...prev[splikId],
          likes: Math.max(0, (prev[splikId]?.likes || 0) + (liked ? 1 : -1)),
        },
      }));
      toast.error("Failed to update hype");
    }
  };

  /* ---------- save (favorites) ---------- */
  const toggleFavorite = async (splikId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to save videos");
      return;
    }
    if (savingIds.has(splikId)) return;

    setSavingIds((s) => new Set(s).add(splikId));
    const currentlySaved = savedIds.has(splikId);

    // optimistic
    setSavedIds((prev) => {
      const ns = new Set(prev);
      currentlySaved ? ns.delete(splikId) : ns.add(splikId);
      return ns;
    });

    try {
      if (currentlySaved) {
        await supabase.from("favorites").delete().eq("user_id", user.id).eq("splik_id", splikId);
        toast.success("Removed from favorites");
      } else {
        await supabase.from("favorites").insert({ user_id: user.id, splik_id: splikId });
        toast.success("Added to favorites");
      }
    } catch {
      // revert
      setSavedIds((prev) => {
        const ns = new Set(prev);
        currentlySaved ? ns.add(splikId) : ns.delete(splikId);
        return ns;
      });
      toast.error("Failed to update favorites");
    } finally {
      setSavingIds((s) => {
        const ns = new Set(s);
        ns.delete(splikId);
        return ns;
      });
    }
  };

  const handleShare = (splik: Splik) => {
    const url = `${window.location.origin}/video/${splik.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return "Just now";
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-4">
      {spliks.map((splik) => {
        const isOwner = currentUserId === splik.user_id;
        const saved = savedIds.has(splik.id);
        const saving = savingIds.has(splik.id);

        return (
          <Card
            key={splik.id}
            className="overflow-hidden bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-950 border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] group"
          >
            {/* Video */}
            <div className="relative aspect-[9/16] bg-gradient-to-br from-gray-900 via-black to-gray-800 overflow-hidden rounded-t-lg">
              <video
                ref={(el) => {
                  if (el) videoRefs.current[splik.id] = el;
                }}
                src={splik.video_url}
                poster={splik.thumbnail_url || undefined}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loop={false}
                muted={mutedVideos.has(splik.id)}
                playsInline
                onTimeUpdate={() => handleTimeUpdate(splik.id)}
              />

              {/* Views badge */}
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/80 backdrop-blur-md px-3 py-2 rounded-full border border-white/20 shadow-lg">
                <Eye className="h-3.5 w-3.5 text-white" />
                <span className="text-white font-bold text-xs tracking-wide">
                  {(videoStats[splik.id]?.views || splik.views || 0).toLocaleString()}
                </span>
                <div className="w-2 h-2 bg-gradient-to-r from-red-500 to-pink-500 rounded-full animate-pulse shadow-lg" />
              </div>

              {/* Play/Pause overlay */}
              <div
                className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/40 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer"
                onClick={() => handlePlayToggle(splik.id)}
              >
                <div className="bg-white/20 backdrop-blur-md rounded-full p-4 shadow-2xl hover:bg-white/30 transition-colors duration-200 border border-white/30">
                  {playingVideo === splik.id ? (
                    <Pause className="h-8 w-8 text-white drop-shadow-lg" />
                  ) : (
                    <Play className="h-8 w-8 text-white drop-shadow-lg ml-1" />
                  )}
                </div>
              </div>

              {/* Sound toggle */}
              {playingVideo === splik.id && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-3 right-3 text-white bg-black/60 backdrop-blur-md hover:bg-black/80 border border-white/20 rounded-full h-10 w-10 shadow-lg transition-all duration-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute(splik.id);
                  }}
                >
                  {mutedVideos.has(splik.id) ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              )}

              <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            </div>

            {/* Creator row */}
            {showCreatorInfo && splik.profiles && (
              <div className="flex items-center justify-between p-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50">
                <Link
                  to={`/creator/${splik.profiles.username}`}
                  className="flex items-center gap-3 hover:bg-gray-100/80 dark:hover:bg-gray-800/50 transition-colors rounded-xl flex-1 p-2 -m-2"
                >
                  <div className="relative">
                    <Avatar className="h-12 w-12 ring-2 ring-white dark:ring-gray-700 shadow-lg">
                      <AvatarImage src={splik.profiles.avatar_url} />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold">
                        {splik.profiles.display_name?.charAt(0) || splik.profiles.username?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-900 shadow-sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900 dark:text-white truncate">
                      {splik.profiles.display_name || splik.profiles.username}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      @{splik.profiles.username}
                    </p>
                  </div>
                </Link>
                <FollowButton profileId={splik.user_id} username={splik.profiles.username} size="sm" />
              </div>
            )}

            {/* Body */}
            <div className="p-4 space-y-3 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm">
              {splik.title && (
                <h3 className="font-bold text-base leading-tight text-gray-900 dark:text-white line-clamp-2">
                  {splik.title}
                </h3>
              )}
              {splik.description && (
                <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 leading-relaxed">
                  {splik.description}
                </p>
              )}

              {/* Counts row */}
              <div className="flex items-center justify-between text-xs font-medium">
                <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                  <Eye className="h-3 w-3" />
                  <span>{(videoStats[splik.id]?.views || 0).toLocaleString()} views</span>
                </div>
                <span className="text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                  {formatTime(splik.created_at)}
                </span>
              </div>

              {/* Action buttons: Hype · Share · Save */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  size="sm"
                  variant={likedVideos.has(splik.id) ? "default" : "outline"}
                  onClick={() => handleLike(splik.id)}
                  className={`flex-1 transition-all duration-200 ${
                    likedVideos.has(splik.id)
                      ? "bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white shadow-lg"
                      : "hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950 dark:hover:text-red-400"
                  }`}
                >
                  <Heart className={`h-4 w-4 mr-2 ${likedVideos.has(splik.id) ? "fill-current" : ""}`} />
                  <span className="font-semibold">
                    {(videoStats[splik.id]?.likes || 0).toLocaleString()}
                  </span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleShare(splik)}
                  className="px-3 flex-1 hover:bg-green-50 hover:text-green-600 hover:border-green-200 dark:hover:bg-green-950 dark:hover:text-green-400 transition-all duration-200"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => toggleFavorite(splik.id)}
                  className={`px-3 flex-1 transition-all duration-200 ${
                    saved ? "text-yellow-500 border-yellow-300" : "hover:bg-yellow-50 hover:text-yellow-600"
                  }`}
                  aria-pressed={saved}
                  title={saved ? "Saved" : "Save"}
                >
                  {saved ? <BookmarkCheck className="h-4 w-4 mr-2" /> : <Bookmark className="h-4 w-4 mr-2" />}
                  {saved ? "Saved" : "Save"}
                </Button>
              </div>

              {/* Owner-only: delete */}
              {isOwner && (
                <div className="pt-2">
                  <DeleteSplikButton
                    splikId={splik.id}
                    videoUrl={splik.video_url}
                    thumbnailUrl={splik.thumbnail_url}
                    onDeleted={() => onDeletedSplik?.(splik.id)}
                  />
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
