import { useState, useEffect, useRef } from "react";
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
  User
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import ShareModal from "@/components/ShareModal";

interface Splik {
  id: string;
  title: string;
  description?: string;
  video_url: string;
  user_id: string;
  duration?: number;
  views?: number;
  likes_count?: number;
  comments_count?: number;
  created_at: string;
  trim_start?: number;
  trim_end?: number;
  profiles?: {
    first_name?: string;
    last_name?: string;
    username?: string;
  };
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles?: {
    first_name?: string;
    last_name?: string;
  };
}

interface VideoFeedProps {
  user: any;
}

// Generate or get session ID for view tracking
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('splik_session_id');
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('splik_session_id', sessionId);
  }
  return sessionId;
};

const VideoFeed = ({ user }: VideoFeedProps) => {
  const [spliks, setSpliks] = useState<Splik[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [mutedVideos, setMutedVideos] = useState<Set<string>>(new Set());
  const [likedSpliks, setLikedSpliks] = useState<Set<string>>(new Set());
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showCommentsDialog, setShowCommentsDialog] = useState(false);
  const [selectedSplik, setSelectedSplik] = useState<Splik | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [viewedSpliks, setViewedSpliks] = useState<Map<string, number>>(new Map());
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareSplik, setShareSplik] = useState<Splik | null>(null);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});
  const videoTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const { toast } = useToast();

  // Setup realtime subscription for view updates
  useEffect(() => {
    const channel = supabase
      .channel('spliks-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'spliks'
        },
        (payload) => {
          // Update the specific splik with new data
          setSpliks(prev => prev.map(s => 
            s.id === payload.new.id 
              ? { ...s, ...payload.new }
              : s
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch all public spliks
  useEffect(() => {
    fetchSpliks();
    if (user) {
      fetchUserLikes();
    }
  }, [user]);

  const fetchSpliks = async () => {
    try {
      const { data: spliksData, error: spliksError } = await supabase
        .from('spliks')
        .select('*')
        .order('created_at', { ascending: false });

      if (spliksError) throw spliksError;

      // Fetch profiles separately
      const spliksWithProfiles = await Promise.all(
        (spliksData || []).map(async (splik) => {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('first_name, last_name, username')
            .eq('id', splik.user_id)
            .maybeSingle();
          
          return {
            ...splik,
            profiles: profileData || undefined
          };
        })
      );

      setSpliks(spliksWithProfiles);
    } catch (error: any) {
      console.error('Error fetching spliks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserLikes = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('likes')
        .select('splik_id')
        .eq('user_id', user.id);

      if (error) throw error;
      
      const likedIds = new Set(data?.map(like => like.splik_id) || []);
      setLikedSpliks(likedIds);
    } catch (error) {
      console.error('Error fetching likes:', error);
    }
  };

  const fetchComments = async (splikId: string) => {
    setLoadingComments(true);
    try {
      const { data: commentsData, error: commentsError } = await supabase
        .from('comments')
        .select('*')
        .eq('splik_id', splikId)
        .order('created_at', { ascending: false });

      if (commentsError) throw commentsError;

      // Fetch profiles separately
      const commentsWithProfiles = await Promise.all(
        (commentsData || []).map(async (comment) => {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', comment.user_id)
            .maybeSingle();
          
          return {
            ...comment,
            profiles: profileData || undefined
          };
        })
      );

      setComments(commentsWithProfiles);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleLike = async (splikId: string) => {
    if (!user) {
      setShowAuthDialog(true);
      return;
    }

    const isLiked = likedSpliks.has(splikId);
    
    try {
      if (isLiked) {
        // Unlike
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('splik_id', splikId)
          .eq('user_id', user.id);

        if (error) throw error;
        
        setLikedSpliks(prev => {
          const newSet = new Set(prev);
          newSet.delete(splikId);
          return newSet;
        });
        
        // Update local count
        setSpliks(prev => prev.map(s => 
          s.id === splikId 
            ? { ...s, likes_count: Math.max(0, (s.likes_count || 0) - 1) }
            : s
        ));
      } else {
        // Like
        const { error } = await supabase
          .from('likes')
          .insert({ splik_id: splikId, user_id: user.id });

        if (error) throw error;
        
        setLikedSpliks(prev => new Set([...prev, splikId]));
        
        // Update local count
        setSpliks(prev => prev.map(s => 
          s.id === splikId 
            ? { ...s, likes_count: (s.likes_count || 0) + 1 }
            : s
        ));
      }
    } catch (error: any) {
      console.error('Error toggling like:', error);
      toast({
        title: "Error",
        description: "Failed to update like",
        variant: "destructive",
      });
    }
  };

  const handleComment = (splik: Splik) => {
    if (!user) {
      setShowAuthDialog(true);
      return;
    }
    
    setSelectedSplik(splik);
    setShowCommentsDialog(true);
    fetchComments(splik.id);
  };

  const submitComment = async () => {
    if (!user || !selectedSplik || !newComment.trim()) return;

    try {
      const { error } = await supabase
        .from('comments')
        .insert({
          splik_id: selectedSplik.id,
          user_id: user.id,
          content: newComment.trim()
        });

      if (error) throw error;

      // Update local count
      setSpliks(prev => prev.map(s => 
        s.id === selectedSplik.id 
          ? { ...s, comments_count: (s.comments_count || 0) + 1 }
          : s
      ));

      // Refresh comments
      fetchComments(selectedSplik.id);
      setNewComment("");
      
      toast({
        title: "Comment posted",
        description: "Your comment has been added",
      });
    } catch (error: any) {
      console.error('Error posting comment:', error);
      toast({
        title: "Error",
        description: "Failed to post comment",
        variant: "destructive",
      });
    }
  };

  const handleShare = (splik: Splik) => {
    setShareSplik(splik);
    setShowShareModal(true);
  };

  // Track video views when played
  const trackView = async (splikId: string) => {
    // Get current session view count
    const currentCount = viewedSpliks.get(splikId) || 0;
    
    // Skip if already viewed 5 times in this session
    if (currentCount >= 5) return;
    
    try {
      const sessionId = getSessionId();
      const { data, error } = await supabase.rpc('increment_view_with_session', {
        p_splik_id: splikId,
        p_session_id: sessionId,
        p_viewer_id: user?.id || null
      });
      
      if (!error && data && typeof data === 'object' && 'new_view' in data && data.new_view) {
        // Update local tracking
        setViewedSpliks(prev => {
          const newMap = new Map(prev);
          newMap.set(splikId, currentCount + 1);
          return newMap;
        });
        
        // The view count will update via realtime subscription
      }
    } catch (error) {
      console.error('Error tracking view:', error);
    }
  };

  const togglePlayPause = (splikId: string) => {
    const video = videoRefs.current[splikId];
    if (!video) return;

    if (playingVideo === splikId) {
      video.pause();
      setPlayingVideo(null);
    } else {
      // Pause any other playing video
      if (playingVideo && videoRefs.current[playingVideo]) {
        videoRefs.current[playingVideo].pause();
      }
      
      
      // Find the current splik
      const currentSplik = spliks.find(s => s.id === splikId);
      
      // Set up video timeupdate handler for 3-second limit
      const handleTimeUpdate = () => {
        const trimStart = currentSplik?.trim_start || 0;
        const maxDuration = 3; // Always cap at 3 seconds
        
        if (video.currentTime - trimStart >= maxDuration) {
          video.currentTime = trimStart; // Loop back to start
        }
      };
      
      video.addEventListener('timeupdate', handleTimeUpdate);
      
      video.play().then(() => {
        // Track view when video starts playing
        trackView(splikId);
        
        // Set initial time if trim_start is specified
        if (currentSplik?.trim_start) {
          video.currentTime = currentSplik.trim_start;
        }
      }).catch(() => {
        // If autoplay fails, try muted
        video.muted = true;
        video.play().then(() => {
          trackView(splikId);
          if (currentSplik?.trim_start) {
            video.currentTime = currentSplik.trim_start;
          }
        });
        setMutedVideos(prev => new Set([...prev, splikId]));
      });
      
      setPlayingVideo(splikId);
    }
  };

  const toggleMute = (splikId: string) => {
    const video = videoRefs.current[splikId];
    if (!video) return;

    const isMuted = mutedVideos.has(splikId);
    video.muted = !isMuted;
    
    if (isMuted) {
      setMutedVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(splikId);
        return newSet;
      });
    } else {
      setMutedVideos(prev => new Set([...prev, splikId]));
    }
  };

  const getUserName = (splik: Splik) => {
    if (splik.profiles?.first_name || splik.profiles?.last_name) {
      return `${splik.profiles.first_name || ''} ${splik.profiles.last_name || ''}`.trim();
    }
    return "Anonymous User";
  };

  const getUserInitials = (splik: Splik) => {
    const name = getUserName(splik);
    return name.split(' ').map(n => n[0]).join('').toUpperCase() || 'A';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-lg mx-auto space-y-4 py-4">
        {spliks.map((splik) => (
          <Card key={splik.id} className="overflow-hidden border-0 shadow-lg">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b">
              <Link to={`/creator/${splik.profiles?.username || splik.user_id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{getUserInitials(splik)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold">{getUserName(splik)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(splik.created_at), { addSuffix: true })}
                  </p>
                </div>
              </Link>
              <Button size="icon" variant="ghost">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </div>

            {/* Video */}
            <div className="relative bg-black aspect-[9/16] max-h-[600px]">
              <video
                ref={(el) => {
                  if (el) videoRefs.current[splik.id] = el;
                }}
                src={splik.video_url}
                className="w-full h-full object-cover"
                loop
                playsInline
                muted={mutedVideos.has(splik.id)}
                onClick={() => togglePlayPause(splik.id)}
              />
              
              {/* Play/Pause overlay */}
              {playingVideo !== splik.id && (
                <div 
                  className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
                  onClick={() => togglePlayPause(splik.id)}
                >
                  <div className="bg-white/90 rounded-full p-4">
                    <Play className="h-8 w-8 text-black" />
                  </div>
                </div>
              )}

              {/* Mute button */}
              {playingVideo === splik.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute(splik.id);
                  }}
                  className="absolute bottom-4 right-4 bg-black/50 rounded-full p-2"
                >
                  {mutedVideos.has(splik.id) ? (
                    <VolumeX className="h-4 w-4 text-white" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-white" />
                  )}
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button 
                    size="icon" 
                    variant="ghost"
                    onClick={() => handleLike(splik.id)}
                    className={likedSpliks.has(splik.id) ? "text-red-500" : ""}
                  >
                    <Heart 
                      className={`h-6 w-6 ${likedSpliks.has(splik.id) ? "fill-current" : ""}`} 
                    />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost"
                    onClick={() => handleComment(splik)}
                  >
                    <MessageCircle className="h-6 w-6" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost"
                    onClick={() => handleShare(splik)}
                  >
                    <Share2 className="h-6 w-6" />
                  </Button>
                </div>
                <Button size="icon" variant="ghost">
                  <Bookmark className="h-6 w-6" />
                </Button>
              </div>

              {/* Views and Likes count */}
              <div className="flex items-center gap-3 text-sm">
                {(splik.views || 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <Eye className="h-4 w-4" />
                    <span className="font-semibold">{splik.views} views</span>
                  </span>
                )}
                {(splik.likes_count || 0) > 0 && (
                  <span className="font-semibold">
                    {splik.likes_count} {splik.likes_count === 1 ? 'like' : 'likes'}
                  </span>
                )}
              </div>

              {/* Caption */}
              {splik.description && (
                <p className="text-sm">
                  <span className="font-semibold mr-2">{getUserName(splik)}</span>
                  {splik.description}
                </p>
              )}

              {/* Comments count */}
              {(splik.comments_count || 0) > 0 && (
                <button
                  onClick={() => handleComment(splik)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  View all {splik.comments_count} comments
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Auth Dialog */}
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in required</DialogTitle>
            <DialogDescription>
              You need to sign in to interact with videos
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowAuthDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => window.location.href = '/login'}>
              Sign In
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Comments Dialog */}
      <Dialog open={showCommentsDialog} onOpenChange={setShowCommentsDialog}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Comments</DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="h-[400px] pr-4">
            {loadingComments ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : comments.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No comments yet. Be the first to comment!
              </p>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {comment.profiles?.first_name?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm">
                        <span className="font-semibold mr-2">
                          {comment.profiles?.first_name || 'User'}
                        </span>
                        {comment.content}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {user && (
            <div className="flex gap-2 pt-4 border-t">
              <Input
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && submitComment()}
              />
              <Button 
                size="icon" 
                onClick={submitComment}
                disabled={!newComment.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Share Modal */}
      {shareSplik && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          videoId={shareSplik.id}
          videoTitle={shareSplik.title || "Check out this Splik!"}
        />
      )}
    </>
  );
};

export default VideoFeed;