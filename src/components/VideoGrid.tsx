import { useState, useRef, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Eye
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
import { FollowButton } from "@/components/FollowButton";

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
}

export function VideoGrid({ spliks, showCreatorInfo = true, onDeleteComment }: VideoGridProps) {
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [mutedVideos, setMutedVideos] = useState<Set<string>>(new Set());
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set());
  const [videoStats, setVideoStats] = useState<{ [key: string]: { views: number; likes: number; comments: number } }>({});
  const [showComments, setShowComments] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});
  
  // Generate consistent session ID for this page load
  const sessionIdRef = useRef(`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    // Initialize stats
    const stats: any = {};
    spliks.forEach(splik => {
      stats[splik.id] = {
        views: splik.views || 0,
        likes: splik.likes_count || 0,
        comments: splik.comments_count || 0
      };
    });
    setVideoStats(stats);

    // Check liked status
    checkLikedStatus();

    // Subscribe to realtime updates with better filtering
    const channel = supabase
      .channel('video-grid-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'spliks'
        },
        (payload) => {
          if (payload.new) {
            const newData = payload.new as any;
            // Update stats for the specific video
            setVideoStats(prev => ({
              ...prev,
              [newData.id]: {
                views: newData.views || 0,
                likes: newData.likes_count || 0,
                comments: newData.comments_count || 0
              }
            }));
          }
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
      .from('likes')
      .select('splik_id')
      .eq('user_id', user.id);

    if (data) {
      setLikedVideos(new Set(data.map(like => like.splik_id)));
    }
  };

  const handlePlayToggle = async (splikId: string) => {
    const video = videoRefs.current[splikId];
    if (!video) return;

    if (playingVideo === splikId) {
      video.pause();
      setPlayingVideo(null);
    } else {
      // Pause any currently playing video
      if (playingVideo && videoRefs.current[playingVideo]) {
        videoRefs.current[playingVideo].pause();
      }
      
      // Reset video to start and play
      video.currentTime = 0;
      video.play();
      setPlayingVideo(splikId);
      
      // Track view with consistent session ID and get current user
      const { data: { user } } = await supabase.auth.getUser();
      const result = await supabase.rpc('increment_view_with_session', {
        p_splik_id: splikId,
        p_session_id: sessionIdRef.current,
        p_viewer_id: user?.id || null
      });
      
      // Update local view count if view was tracked
      if (result.data) {
        const viewData = result.data as any;
        if (viewData.new_view && viewData.view_count) {
          setVideoStats(prev => ({
            ...prev,
            [splikId]: {
              ...prev[splikId],
              views: viewData.view_count
            }
          }));
        }
      }
    }
  };

  const handleTimeUpdate = (splikId: string) => {
    const video = videoRefs.current[splikId];
    if (!video) return;

    // Stop video after 3 seconds
    if (video.currentTime >= 3) {
      video.pause();
      video.currentTime = 0; // Reset to beginning
      setPlayingVideo(null);
    }
  };

  const toggleMute = (splikId: string) => {
    const video = videoRefs.current[splikId];
    if (!video) return;

    const newMuted = new Set(mutedVideos);
    if (newMuted.has(splikId)) {
      newMuted.delete(splikId);
      video.muted = false;
    } else {
      newMuted.add(splikId);
      video.muted = true;
    }
    setMutedVideos(newMuted);
  };

  const handleLike = async (splikId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Please sign in to like videos');
      return;
    }

    if (likedVideos.has(splikId)) {
      await supabase
        .from('likes')
        .delete()
        .eq('splik_id', splikId)
        .eq('user_id', user.id);
      
      setLikedVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(splikId);
        return newSet;
      });
    } else {
      await supabase
        .from('likes')
        .insert({ splik_id: splikId, user_id: user.id });
      
      setLikedVideos(prev => new Set(prev).add(splikId));
    }
  };

  const loadComments = async (splikId: string) => {
    setLoadingComments(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          *,
          profiles!comments_user_id_fkey (
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('splik_id', splikId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleComment = async (splikId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Please sign in to add comments');
      return;
    }

    if (!newComment.trim()) return;

    try {
      const { error } = await supabase
        .from('comments')
        .insert({
          splik_id: splikId,
          user_id: user.id,
          content: newComment
        });

      if (error) throw error;

      setNewComment('');
      loadComments(splikId);
      toast.success('Comment added');
    } catch (error) {
      toast.error('Failed to add comment');
    }
  };

  const handleShare = (splik: Splik) => {
    const url = `${window.location.origin}/video/${splik.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  };

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {spliks.map((splik) => (
          <Card key={splik.id} className="overflow-hidden group hover:shadow-lg transition-shadow">
            <div className="relative aspect-[9/16] bg-black">
              <video
                ref={(el) => { if (el) videoRefs.current[splik.id] = el; }}
                src={splik.video_url}
                poster={splik.thumbnail_url}
                className="w-full h-full object-cover"
                loop={false}
                muted={mutedVideos.has(splik.id)}
                playsInline
                onTimeUpdate={() => handleTimeUpdate(splik.id)}
              />
              
              {/* Live View Count Badge */}
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full">
                <Eye className="h-4 w-4 text-white" />
                <span className="text-white font-semibold text-sm">
                  {(videoStats[splik.id]?.views || splik.views || 0).toLocaleString()} views
                </span>
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              </div>
              
              {/* Play/Pause Overlay */}
              <div 
                className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={() => handlePlayToggle(splik.id)}
              >
                {playingVideo === splik.id ? (
                  <Pause className="h-12 w-12 text-white drop-shadow-lg" />
                ) : (
                  <Play className="h-12 w-12 text-white drop-shadow-lg" />
                )}
              </div>

              {/* Sound Control */}
              {playingVideo === splik.id && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-4 right-4 text-white hover:bg-white/20"
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
            </div>

            {/* Creator Info */}
            {showCreatorInfo && splik.profiles && (
              <div className="flex items-center justify-between p-3 border-b border-border">
                <Link 
                  to={`/creator/${splik.profiles.username}`}
                  className="flex items-center gap-3 hover:bg-accent/50 transition-colors rounded-lg flex-1 p-1"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={splik.profiles.avatar_url} />
                    <AvatarFallback>
                      {splik.profiles.display_name?.charAt(0) || splik.profiles.username?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-sm">
                      {splik.profiles.display_name || splik.profiles.username}
                    </p>
                    <p className="text-xs text-muted-foreground">@{splik.profiles.username}</p>
                  </div>
                </Link>
                <FollowButton 
                  profileId={splik.user_id} 
                  username={splik.profiles.username}
                  size="sm"
                />
              </div>
            )}

            {/* Video Info */}
            <div className="p-3 space-y-2">
              {splik.title && (
                <h3 className="font-semibold text-sm line-clamp-2">{splik.title}</h3>
              )}
              {splik.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{splik.description}</p>
              )}
              
              {/* Stats */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {videoStats[splik.id]?.views || 0}
                </div>
                <span>{formatTime(splik.created_at)}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  size="sm"
                  variant={likedVideos.has(splik.id) ? "default" : "ghost"}
                  onClick={() => handleLike(splik.id)}
                  className="flex-1"
                >
                  <Heart className={`h-4 w-4 mr-1 ${likedVideos.has(splik.id) ? 'fill-current' : ''}`} />
                  {videoStats[splik.id]?.likes || 0}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowComments(splik.id);
                    loadComments(splik.id);
                  }}
                  className="flex-1"
                >
                  <MessageCircle className="h-4 w-4 mr-1" />
                  {videoStats[splik.id]?.comments || 0}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleShare(splik)}
                >
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Comments Dialog */}
      <Dialog open={!!showComments} onOpenChange={() => setShowComments(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Comments</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <Textarea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1"
              />
              <Button onClick={() => showComments && handleComment(showComments)}>
                Post
              </Button>
            </div>

            <ScrollArea className="h-[400px]">
              {loadingComments ? (
                <div className="text-center py-4">Loading comments...</div>
              ) : comments.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">No comments yet</div>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={comment.profiles?.avatar_url} />
                        <AvatarFallback>
                          {comment.profiles?.display_name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">
                            {comment.profiles?.display_name || comment.profiles?.username}
                          </p>
                          {onDeleteComment && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => onDeleteComment(comment.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <p className="text-sm">{comment.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTime(comment.created_at)}
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