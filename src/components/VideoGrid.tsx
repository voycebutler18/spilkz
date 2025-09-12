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
import FollowButton from "@/components/FollowButton"; // ✅ add follow button
import DeleteSplikButton from "@/components/dashboard/DeleteSplikButton";

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

  const [videoStats, setVideoStats] = useState<{
    [id: string]: { views: number; likes: number; comments: number };
  }>({});

  const [showComments, setShowComments] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});
  const sessionIdRef = useRef(
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );

  const commentsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const stats: any = {};
    spliks.forEach((s) => {
      stats[s.id] = {
        views: s.views || 0,
        likes: s.likes_count || 0,
        comments: s.comments_count || 0,
      };
    });
    setVideoStats(stats);
    checkLikedStatus();

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

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-4">
        {spliks.map((splik) => {
          const isOwner = currentUserId === splik.user_id;
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
                    {mutedVideos.has(splik.id) ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
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
                          {splik.profiles.display_name?.charAt(0) ||
                            splik.profiles.username?.charAt(0)}
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
                  <FollowButton
                    profileId={splik.user_id}
                    username={splik.profiles.username}
                    size="sm"
                    variant="outline"
                  />
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

                {/* Counts row (no views) */}
                <div className="flex items-center justify-end text-xs font-medium">
                  <span className="text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                    {formatTime(splik.created_at)}
                  </span>
                </div>

                {/* Action buttons — now includes Follow */}
                <div className="flex items-center gap-2 pt-2">
                  {/* ✅ Follow on every video */}
                  <FollowButton
                    profileId={splik.user_id}
                    username={splik.profiles?.username}
                    size="sm"
                    variant="outline"
                    className="flex-1 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 dark:hover:bg-purple-950 dark:hover:text-purple-400 transition-all duration-200"
                  />

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
                    <Heart
                      className={`h-4 w-4 mr-2 ${
                        likedVideos.has(splik.id) ? "fill-current" : ""
                      }`}
                    />
                    <span className="font-semibold">
                      {(videoStats[splik.id]?.likes || 0).toLocaleString()}
                    </span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowComments(splik.id)}
                    className="flex-1 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 dark:hover:bg-blue-950 dark:hover:text-blue-400 transition-all duration-200"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    <span className="font-semibold">
                      {(videoStats[splik.id]?.comments || 0).toLocaleString()}
                    </span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleShare(splik)}
                    className="px-3 hover:bg-green-50 hover:text-green-600 hover:border-green-200 dark:hover:bg-green-950 dark:hover:text-green-400 transition-all duration-200"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>

                  {isOwner && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onDeletedSplik?.(splik.id)
                      }
                      className="hidden"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

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

      {/* Comments Dialog */}
      <Dialog open={!!showComments} onOpenChange={() => setShowComments(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-0 shadow-2xl">
          <DialogHeader className="pb-4 border-b border-gray-200 dark:border-gray-700">
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Comments
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="flex gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <Textarea
                placeholder="Share your thoughts..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1 resize-none border-0 bg-white dark:bg-gray-900 shadow-sm focus:shadow-md transition-shadow duration-200"
                rows={2}
              />
              <Button
                onClick={() => showComments && handleComment(showComments)}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 px-6"
              >
                Post
              </Button>
            </div>

            <ScrollArea className="h-[400px] px-2">
              {loadingComments ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Loading comments...
                  </p>
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-12">
                  <MessageCircle className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 font-medium">
                    No comments yet
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500">
                    Be the first to share your thoughts!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="flex gap-3 p-4 bg-white dark:bg-gray-800/30 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-100 dark:border-gray-700/50"
                    >
                      <Avatar className="h-10 w-10 ring-2 ring-gray-200 dark:ring-gray-700 flex-shrink-0">
                        <AvatarImage src={comment.profiles?.avatar_url} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white font-bold text-sm">
                          {comment.profiles?.display_name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-bold text-sm text-gray-900 dark:text-white">
                              {comment.profiles?.display_name ||
                                comment.profiles?.username}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {formatTime(comment.created_at)}
                            </p>
                          </div>
                          {onDeleteComment && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onDeleteComment(comment.id)}
                              className="opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all duration-200 h-8 w-8 p-0"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <p className="text-sm text-gray-800 dark:text-gray-200 mt-2 leading-relaxed">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
