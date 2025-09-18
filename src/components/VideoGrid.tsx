// src/components/VideoGrid.tsx
import { useState, useRef, useEffect } from "react";
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
  Eye,
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
  const [hoveredVideo, setHoveredVideo] = useState<string | null>(null);

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("likes")
      .select("splik_id")
      .eq("user_id", user.id);
    if (data) setLikedVideos(new Set(data.map((l) => l.splik_id)));
  };

  const handlePlayToggle = async (splikId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
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

      const { data: { user } } = await supabase.auth.getUser();
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

  const toggleMute = (splikId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
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

  const handleLike = async (splikId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to like videos");
      return;
    }

    const isLiked = likedVideos.has(splikId);

    try {
      if (isLiked) {
        await supabase.from("likes").delete().eq("splik_id", splikId).eq("user_id", user.id);
        setLikedVideos((prev) => {
          const next = new Set(prev);
          next.delete(splikId);
          return next;
        });
        setVideoStats((prev) => ({
          ...prev,
          [splikId]: {
            ...prev[splikId],
            likes: Math.max(0, (prev[splikId]?.likes || 0) - 1),
          },
        }));
      } else {
        await supabase.from("likes").insert({ splik_id: splikId, user_id: user.id });
        setLikedVideos((prev) => new Set(prev).add(splikId));
        setVideoStats((prev) => ({
          ...prev,
          [splikId]: {
            ...prev[splikId],
            likes: (prev[splikId]?.likes || 0) + 1,
          },
        }));
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      toast.error("Failed to update like");
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
              comments: Math.max(0, (prev[showComments]?.comments || 0) - 1),
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
    const { data: { user } } = await supabase.auth.getUser();
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

  const handleShare = (splik: Splik, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
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

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const nameOf = (p?: Profile) => {
    if (!p) return "User";
    const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    return p.display_name || full || p.username || "User";
  };

  if (!spliks.length) {
    return (
      <div className="text-center py-20">
        <div className="w-24 h-24 mx-auto bg-gray-800 rounded-full flex items-center justify-center mb-6">
          <Play className="h-12 w-12 text-gray-400" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">No videos yet</h3>
        <p className="text-gray-400">This creator hasn't posted any videos</p>
      </div>
    );
  }

  return (
    <>
      {/* 4-Column Grid with Larger Videos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {spliks.map((splik) => {
          const isOwner = currentUserId === splik.user_id;
          const creator = splik.profiles;
          const creatorName = nameOf(creator);
          const isHovered = hoveredVideo === splik.id;
          const isPlaying = playingVideo === splik.id;
          const isLiked = likedVideos.has(splik.id);

          return (
            <Link
              key={splik.id}
              to={`/video/${splik.id}`}
              className="group block"
              onMouseEnter={() => setHoveredVideo(splik.id)}
              onMouseLeave={() => setHoveredVideo(null)}
            >
              {/* Video Thumbnail Container - Larger Size */}
              <div 
                className="relative aspect-video bg-gray-900 rounded-xl overflow-hidden mb-3 shadow-lg group-hover:shadow-2xl transition-all duration-300 cursor-pointer"
                onMouseEnter={() => {
                  const video = videoRefs.current[splik.id];
                  if (video && !isPlaying) {
                    video.currentTime = 0;
                    video.play().catch(() => {
                      video.muted = true;
                      video.play().catch(() => {});
                    });
                    setPlayingVideo(splik.id);
                  }
                }}
                onMouseLeave={() => {
                  const video = videoRefs.current[splik.id];
                  if (video && playingVideo === splik.id) {
                    video.pause();
                    video.currentTime = 0;
                    setPlayingVideo(null);
                  }
                }}
                onClick={(e) => {
                  e.preventDefault();
                  // Navigate to video page on click
                }}
              >
                <video
                  ref={(el) => {
                    if (el) videoRefs.current[splik.id] = el;
                  }}
                  src={splik.video_url}
                  poster={splik.thumbnail_url || undefined}
                  className={`w-full h-full object-cover transition-all duration-500 ${
                    isHovered ? 'scale-105' : 'scale-100'
                  }`}
                  muted={mutedVideos.has(splik.id)}
                  playsInline
                  onTimeUpdate={() => handleTimeUpdate(splik.id)}
                />

                {/* Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                <div className={`absolute inset-0 bg-black/20 transition-opacity duration-300 ${
                  isHovered ? 'opacity-100' : 'opacity-0'
                }`} />

                {/* Duration Badge - Larger and More Visible */}
                <div className="absolute top-3 right-3">
                  <div className="bg-black/90 backdrop-blur-sm text-white text-sm font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg">
                    <Clock className="w-4 h-4" />
                    3.0s
                  </div>
                </div>

                {/* Volume Control - Only show when playing */}
                {isPlaying && (
                  <Button
                    size="icon"
                    className="absolute top-3 left-3 h-10 w-10 bg-black/80 hover:bg-black/90 text-white border-0 rounded-lg backdrop-blur-sm shadow-lg"
                    onClick={(e) => toggleMute(splik.id, e)}
                  >
                    {mutedVideos.has(splik.id) ? (
                      <VolumeX className="h-5 w-5" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )}
                  </Button>
                )}

                {/* Quick Actions Overlay */}
                <div className={`absolute bottom-2 left-2 right-2 flex items-end justify-between transition-all duration-300 ${
                  isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                }`}>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant={isLiked ? "default" : "secondary"}
                      className={`h-8 w-8 rounded-lg backdrop-blur-sm transition-all duration-200 ${
                        isLiked 
                          ? 'bg-red-500 hover:bg-red-600 text-white' 
                          : 'bg-black/60 hover:bg-black/80 text-white border-0'
                      }`}
                      onClick={(e) => handleLike(splik.id, e)}
                    >
                      <Heart className={`h-3 w-3 ${isLiked ? 'fill-current' : ''}`} />
                    </Button>
                    
                    <Button
                      size="icon"
                      className="h-8 w-8 bg-black/60 hover:bg-black/80 text-white border-0 rounded-lg backdrop-blur-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowComments(splik.id);
                      }}
                    >
                      <MessageCircle className="h-3 w-3" />
                    </Button>
                    
                    <Button
                      size="icon"
                      className="h-8 w-8 bg-black/60 hover:bg-black/80 text-white border-0 rounded-lg backdrop-blur-sm"
                      onClick={(e) => handleShare(splik, e)}
                    >
                      <Share2 className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  {/* Stats */}
                  <div className="flex items-center gap-2 text-white text-xs font-medium">
                    <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md">
                      <Heart className="w-3 h-3" />
                      <span>{formatCount(videoStats[splik.id]?.likes || 0)}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md">
                      <MessageCircle className="w-3 h-3" />
                      <span>{formatCount(videoStats[splik.id]?.comments || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Video Info */}
              <div className="px-1">
                {/* Title */}
                {splik.title && (
                  <h3 className="text-white font-semibold text-sm md:text-base line-clamp-2 leading-tight mb-2 group-hover:text-gray-300 transition-colors">
                    {splik.title}
                  </h3>
                )}

                {/* Creator Info */}
                {showCreatorInfo && creator && (
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar className="w-6 h-6 md:w-8 md:h-8">
                      <AvatarImage src={creator.avatar_url || ""} />
                      <AvatarFallback className="bg-purple-600 text-white text-xs font-bold">
                        {creatorName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-gray-400 text-xs md:text-sm font-medium truncate">
                      {creatorName}
                    </span>
                  </div>
                )}

                {/* Metadata */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatTime(splik.created_at)}</span>
                  {isOwner && onDeletedSplik && (
                    <DeleteSplikButton
                      splikId={splik.id}
                      videoUrl={splik.video_url}
                      thumbnailUrl={splik.thumbnail_url}
                      onDeleted={() => onDeletedSplik(splik.id)}
                    />
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Enhanced Comments Modal */}
      <Dialog open={!!showComments} onOpenChange={() => setShowComments(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] bg-gray-900 border-gray-700">
          <DialogHeader className="pb-6 border-b border-gray-700">
            <DialogTitle className="text-2xl font-bold text-white flex items-center gap-3">
              <MessageCircle className="h-6 w-6 text-blue-500" />
              Comments
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-4">
              <Textarea
                placeholder="Share your thoughts..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="mb-4 bg-gray-900 border-gray-600 text-white resize-none"
                rows={3}
              />
              <Button
                onClick={() => showComments && handleComment(showComments)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3"
              >
                Post Comment
              </Button>
            </div>

            <ScrollArea className="h-[450px]">
              {loadingComments ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-400">Loading comments...</p>
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-16">
                  <MessageCircle className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">No comments yet</h3>
                  <p className="text-gray-400">Be the first to share your thoughts!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => {
                    const p: Profile | undefined = comment.profiles;
                    const commenter = nameOf(p);
                    return (
                      <div
                        key={comment.id}
                        className="bg-gray-800 rounded-xl p-4 hover:bg-gray-750 transition-colors"
                      >
                        <div className="flex gap-3">
                          <Avatar className="w-10 h-10 flex-shrink-0">
                            <AvatarImage src={p?.avatar_url || ""} />
                            <AvatarFallback className="bg-purple-600 text-white font-bold">
                              {commenter.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="font-semibold text-white">{commenter}</p>
                                <p className="text-xs text-gray-500">
                                  {formatTime(comment.created_at)}
                                </p>
                              </div>
                              {onDeleteComment && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onDeleteComment(comment.id)}
                                  className="text-gray-400 hover:text-red-400 hover:bg-red-950"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <p className="text-gray-300 leading-relaxed">
                              {comment.content}
                            </p>
                          </div>
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
