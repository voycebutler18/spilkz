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
  MessageCircle,
  Share2,
  Trash2,
  Clock,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import FollowButton from "@/components/FollowButton";
import DeleteSplikButton from "@/components/dashboard/DeleteSplikButton";

interface Profile {
  username: string | null;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
}

interface Splik {
  id: string;
  video_url: string;
  thumbnail_url?: string;
  title?: string;
  description?: string;
  views: number;
  likes_count: number;
  comments_count: number;
  created_at: string;
  user_id: string;
  profiles?: Profile;
}

interface VideoGridProps {
  spliks: Splik[];
  showCreatorInfo?: boolean;
  onDeleteComment?: (commentId: string) => void;
  onDeletedSplik?: (splikId: string) => void;
}

export function VideoGrid({
  spliks,
  showCreatorInfo = true,
  onDeleteComment,
  onDeletedSplik,
}: VideoGridProps) {
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [mutedVideos, setMutedVideos] = useState<Set<string>>(new Set());
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set());

  // Central place for counts we render (removed views)
  const [videoStats, setVideoStats] = useState<{
    [id: string]: { likes: number; comments: number };
  }>({});

  // Comments modal state
  const [showComments, setShowComments] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});
  const sessionIdRef = useRef(
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );

  // keep reference to the live comments channel to clean it up
  const commentsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    // seed stats for each card (removed views)
    const stats: any = {};
    spliks.forEach((s) => {
      stats[s.id] = {
        likes: s.likes_count || 0,
        comments: s.comments_count || 0,
      };
    });
    setVideoStats(stats);
    checkLikedStatus();

    // keep in sync with spliks table updates (likes/comments only)
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
              likes: n.likes_count || 0,
              comments: n.comments_count || 0,
            },
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [spliks]);

  const checkLikedStatus = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("likes")
      .select("splik_id")
      .eq("user_id", user.id);
    if (data) setLikedVideos(new Set(data.map((l) => l.splik_id)));
  };

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

      // Still track views in backend but don't show them
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.rpc("increment_view_with_session", {
        p_splik_id: splikId,
        p_session_id: sessionIdRef.current,
        p_viewer_id: user?.id || null,
      });
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

  const handleLike = async (splikId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to like videos");
      return;
    }

    if (likedVideos.has(splikId)) {
      await supabase.from("likes").delete().eq("splik_id", splikId).eq("user_id", user.id);
      setLikedVideos((prev) => {
        const next = new Set(prev);
        next.delete(splikId);
        return next;
      });
    } else {
      await supabase.from("likes").insert({ splik_id: splikId, user_id: user.id });
      setLikedVideos((prev) => new Set(prev).add(splikId));
    }
  };

  const loadComments = async (splikId: string) => {
    setLoadingComments(true);
    try {
      const { data, error } = await supabase
        .from("comments")
        .select(
          `
          *,
          profiles!comments_user_id_fkey (
            username,
            display_name,
            first_name,
            last_name,
            avatar_url
          )
        `
        )
        .eq("splik_id", splikId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setComments(data || []);
    } catch (e) {
      console.error("Error loading comments:", e);
    } finally {
      setLoadingComments(false);
    }
  };

  // live comments while open
  useEffect(() => {
    if (commentsChannelRef.current) {
      try {
        supabase.removeChannel(commentsChannelRef.current);
      } catch {}
      commentsChannelRef.current = null;
    }
    if (!showComments) return;

    const ch = supabase
      .channel(`comments-${showComments}`)
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "comments",
          event: "INSERT",
          filter: `splik_id=eq.${showComments}`,
        },
        () => {
          loadComments(showComments);
          setVideoStats((prev) => ({
            ...prev,
            [showComments]: {
              ...prev[showComments],
              comments: (prev[showComments]?.comments || 0) + 1,
            },
          }));
        }
      )
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "comments",
          event: "DELETE",
          filter: `splik_id=eq.${showComments}`,
        },
        () => {
          loadComments(showComments);
          setVideoStats((prev) => ({
            ...prev,
            [showComments]: {
              ...prev[showComments],
              comments: Math.max(
                0,
                (prev[showComments]?.comments || 0) - 1
              ),
            },
          }));
        }
      )
      .subscribe();

    commentsChannelRef.current = ch;

    // initial load
    loadComments(showComments);

    return () => {
      if (commentsChannelRef.current) {
        try {
          supabase.removeChannel(commentsChannelRef.current);
        } catch {}
        commentsChannelRef.current = null;
      }
    };
  }, [showComments]);

  const handleComment = async (splikId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to add comments");
      return;
    }
    if (!newComment.trim()) return;

    try {
      const { error } = await supabase.from("comments").insert({
        splik_id: splikId,
        user_id: user.id,
        content: newComment.trim(),
      });
      if (error) throw error;

      setVideoStats((prev) => ({
        ...prev,
        [splikId]: {
          ...prev[splikId],
          comments: (prev[splikId]?.comments || 0) + 1,
        },
      }));

      setNewComment("");
      loadComments(splikId);
      toast.success("Comment added");
    } catch (e) {
      toast.error("Failed to add comment");
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

  // helper to build a reliable display name for any profile
  const nameOf = (p?: Profile) => {
    if (!p) return "User";
    const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    return p.display_name || full || p.username || "User";
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 p-4">
        {spliks.map((splik) => {
          const isOwner = currentUserId === splik.user_id;
          const creator = splik.profiles;
          const creatorName = nameOf(creator);
          const creatorHref = `/creator/${creator?.username || splik.user_id}`;

          return (
            <Card
              key={splik.id}
              className="group relative overflow-hidden bg-black/5 dark:bg-white/5 backdrop-blur-sm border border-black/10 dark:border-white/10 shadow-lg hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] hover:border-purple-500/20 rounded-2xl"
            >
              {/* Video Container */}
              <div className="relative aspect-[9/16] overflow-hidden rounded-t-2xl bg-gradient-to-br from-purple-900 via-black to-indigo-900">
                <video
                  ref={(el) => {
                    if (el) videoRefs.current[splik.id] = el;
                  }}
                  src={splik.video_url}
                  poster={splik.thumbnail_url || undefined}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  loop={false}
                  muted={mutedVideos.has(splik.id)}
                  playsInline
                  onTimeUpdate={() => handleTimeUpdate(splik.id)}
                />

                {/* Premium gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                
                {/* Sparkle effect on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-500">
                  <div className="absolute top-4 left-4 animate-pulse">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                  </div>
                  <div className="absolute top-8 right-8 animate-pulse delay-150">
                    <Sparkles className="h-3 w-3 text-pink-400" />
                  </div>
                  <div className="absolute bottom-12 right-6 animate-pulse delay-300">
                    <Sparkles className="h-2 w-2 text-blue-400" />
                  </div>
                </div>

                {/* Play/Pause Button */}
                <div
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer"
                  onClick={() => handlePlayToggle(splik.id)}
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full blur-lg opacity-60 animate-pulse" />
                    <div className="relative bg-white/20 backdrop-blur-xl rounded-full p-6 shadow-2xl hover:bg-white/30 transition-all duration-300 border border-white/30 hover:scale-110">
                      {playingVideo === splik.id ? (
                        <Pause className="h-10 w-10 text-white drop-shadow-2xl" />
                      ) : (
                        <Play className="h-10 w-10 text-white drop-shadow-2xl ml-1" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Duration Badge */}
                <div className="absolute top-4 left-4">
                  <div className="bg-black/60 backdrop-blur-xl rounded-full px-3 py-1.5 border border-white/20 shadow-lg">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-white" />
                      <span className="text-white text-xs font-semibold">3.0s</span>
                    </div>
                  </div>
                </div>

                {/* Sound Control */}
                {playingVideo === splik.id && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-4 right-4 text-white bg-black/60 backdrop-blur-xl hover:bg-black/80 border border-white/20 rounded-full h-12 w-12 shadow-xl transition-all duration-300 hover:scale-110"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMute(splik.id);
                    }}
                  >
                    {mutedVideos.has(splik.id) ? (
                      <VolumeX className="h-5 w-5" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )}
                  </Button>
                )}

                {/* Bottom gradient for text readability */}
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black via-black/50 to-transparent" />
                
                {/* Video title overlay */}
                {splik.title && (
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-white font-bold text-lg leading-tight line-clamp-2 drop-shadow-2xl">
                      {splik.title}
                    </h3>
                  </div>
                )}
              </div>

              {/* Creator Info Bar */}
              {showCreatorInfo && creator && (
                <div className="flex items-center justify-between p-4 bg-white/10 dark:bg-black/10 backdrop-blur-xl border-b border-white/10 dark:border-black/10">
                  <Link
                    to={creatorHref}
                    className="flex items-center gap-3 hover:bg-white/10 dark:hover:bg-black/10 transition-colors rounded-xl flex-1 p-2 -m-2"
                  >
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full blur-sm opacity-30" />
                      <Avatar className="relative h-12 w-12 ring-2 ring-white/30 shadow-xl">
                        <AvatarImage src={creator?.avatar_url || undefined} />
                        <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white font-bold">
                          {creatorName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-lg animate-pulse" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-black dark:text-white truncate">
                        {creatorName}
                      </p>
                      {creator?.username && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                          @{creator.username}
                        </p>
                      )}
                    </div>
                  </Link>
                </div>
              )}

              {/* Content Body */}
              <div className="p-5 space-y-4 bg-white/5 dark:bg-black/5 backdrop-blur-xl">
                {splik.description && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 leading-relaxed">
                    {splik.description}
                  </p>
                )}

                {/* Timestamp */}
                <div className="flex items-center justify-end">
                  <div className="bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-gray-200/50 dark:border-gray-700/50">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                      {formatTime(splik.created_at)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    size="sm"
                    variant={likedVideos.has(splik.id) ? "default" : "outline"}
                    onClick={() => handleLike(splik.id)}
                    className={`flex-1 transition-all duration-300 font-semibold ${
                      likedVideos.has(splik.id)
                        ? "bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white shadow-lg shadow-red-500/25 scale-105"
                        : "hover:bg-red-50 hover:text-red-600 hover:border-red-300 dark:hover:bg-red-950/50 dark:hover:text-red-400 hover:shadow-lg hover:scale-105"
                    }`}
                  >
                    <Heart
                      className={`h-4 w-4 mr-2 transition-transform duration-200 ${
                        likedVideos.has(splik.id) ? "fill-current animate-pulse" : ""
                      }`}
                    />
                    {(videoStats[splik.id]?.likes || 0).toLocaleString()}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowComments(splik.id)}
                    className="flex-1 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 dark:hover:bg-blue-950/50 dark:hover:text-blue-400 transition-all duration-300 hover:shadow-lg hover:scale-105 font-semibold"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    {(videoStats[splik.id]?.comments || 0).toLocaleString()}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleShare(splik)}
                    className="px-4 hover:bg-green-50 hover:text-green-600 hover:border-green-300 dark:hover:bg-green-950/50 dark:hover:text-green-400 transition-all duration-300 hover:shadow-lg hover:scale-105"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Owner Controls */}
                {isOwner && (
                  <div className="pt-3 border-t border-gray-200/50 dark:border-gray-700/50">
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

      {/* Enhanced Comments Dialog */}
      <Dialog open={!!showComments} onOpenChange={() => setShowComments(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] bg-white/95 dark:bg-black/95 backdrop-blur-2xl border border-white/20 dark:border-black/20 shadow-2xl rounded-3xl">
          <DialogHeader className="pb-6 border-b border-gray-200/50 dark:border-gray-700/50">
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent flex items-center gap-3">
              <MessageCircle className="h-6 w-6 text-purple-600" />
              Comments
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Enhanced Comment Input */}
            <div className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 rounded-2xl border border-purple-200/50 dark:border-purple-700/50">
              <Textarea
                placeholder="Share your thoughts..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="mb-4 resize-none border-0 bg-white/80 dark:bg-black/80 backdrop-blur-sm shadow-sm focus:shadow-xl transition-all duration-300 rounded-xl text-base"
                rows={3}
              />
              <Button
                onClick={() => showComments && handleComment(showComments)}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 py-3 text-lg font-semibold rounded-xl"
              >
                Post Comment
              </Button>
            </div>

            {/* Enhanced Comments List */}
            <ScrollArea className="h-[450px] px-2">
              {loadingComments ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                    Loading comments...
                  </p>
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
                    <MessageCircle className="h-12 w-12 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">
                    No comments yet
                  </h3>
                  <p className="text-gray-500 dark:text-gray-500">
                    Be the first to share your thoughts!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => {
                    const p: Profile | undefined = comment.profiles;
                    const commenter = nameOf(p);
                    return (
                      <div
                        key={comment.id}
                        className="group flex gap-4 p-5 bg-white/60 dark:bg-black/60 backdrop-blur-xl rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-200/50 dark:border-gray-700/50 hover:border-purple-300/50 dark:hover:border-purple-600/50"
                      >
                        <div className="relative flex-shrink-0">
                          <Avatar className="h-12 w-12 ring-2 ring-purple-200 dark:ring-purple-700 shadow-lg">
                            <AvatarImage src={p?.avatar_url || undefined} />
                            <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold">
                              {commenter.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-bold text-base text-gray-900 dark:text-white">
                                {commenter}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {formatTime(comment.created_at)}
                              </p>
                            </div>
                            {onDeleteComment && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onDeleteComment(comment.id)}
                                className="opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/50 transition-all duration-200 rounded-full"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
                            {comment.content}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
