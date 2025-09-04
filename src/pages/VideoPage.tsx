import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Play,
  Pause,
  Volume2,
  VolumeX,
  Eye,
  Home,
  Loader2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
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

// Generate or get session ID for view tracking
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('splik_session_id');
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('splik_session_id', sessionId);
  }
  return sessionId;
};

const VideoPage = () => {
  const { id } = useParams();
  const [splik, setSplik] = useState<Splik | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [user, setUser] = useState<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      
      if (session?.user && id) {
        // Check if user has liked this video
        const { data } = await supabase
          .from('likes')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('splik_id', id)
          .maybeSingle();
        
        setLiked(!!data);
      }
    };
    
    checkUser();
  }, [id]);

  // Setup realtime subscription for view updates
  useEffect(() => {
    if (!id) return;
    
    const channel = supabase
      .channel(`splik-${id}-updates`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'spliks',
          filter: `id=eq.${id}`
        },
        (payload) => {
          // Update view count in real-time
          setSplik(prev => prev ? {
            ...prev,
            views: payload.new.views,
            likes_count: payload.new.likes_count
          } : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    fetchVideo();
    if (id) {
      // Track view multiple times (up to 5)
      trackView(id);
      
      // Track again after watching for a bit
      const trackAgain = setInterval(() => {
        trackView(id);
      }, 10000); // Track every 10 seconds
      
      return () => clearInterval(trackAgain);
    }
  }, [id]);

  useEffect(() => {
    // Setup video time limit (3 seconds max)
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const trimStart = splik?.trim_start || 0;
      const maxDuration = 3; // Always cap at 3 seconds
      
      if (video.currentTime - trimStart >= maxDuration) {
        video.currentTime = trimStart; // Loop back to start
      }
      setCurrentTime(video.currentTime - trimStart);
    };

    const handleLoadedMetadata = () => {
      if (splik?.trim_start) {
        video.currentTime = splik.trim_start;
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [splik]);

  const fetchVideo = async () => {
    if (!id) return;

    try {
      // First fetch the splik data
      const { data: splikData, error: splikError } = await supabase
        .from('spliks')
        .select('*')
        .eq('id', id)
        .single();

      if (splikError) throw splikError;

      // Then fetch the profile data separately
      if (splikData) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name, username')
          .eq('id', splikData.user_id)
          .single();

        setSplik({
          ...splikData,
          profiles: profileData || undefined
        });
      }
    } catch (error: any) {
      console.error('Error fetching video:', error);
      toast({
        title: "Error",
        description: "Failed to load video",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const trackView = async (splikId: string) => {
    try {
      const sessionId = getSessionId();
      const { data, error } = await supabase.rpc('increment_view_with_session', {
        p_splik_id: splikId,
        p_session_id: sessionId,
        p_viewer_id: user?.id || null
      });
      
      if (!error && data && typeof data === 'object' && 'new_view' in data) {
        // Update local view count if new view was added
        const viewData = data as { new_view: boolean; view_count: number };
        if (viewData.new_view) {
          setSplik(prev => prev ? {
            ...prev,
            views: viewData.view_count
          } : null);
        }
      }
    } catch (error) {
      console.error('Error tracking view:', error);
    }
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      video.play().catch(() => {
        // If autoplay fails, try muted
        video.muted = true;
        setMuted(true);
        video.play();
      });
      setPlaying(true);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !muted;
    setMuted(!muted);
  };

  const handleLike = async () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like videos",
      });
      return;
    }

    if (!id) return;

    try {
      if (liked) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('user_id', user.id)
          .eq('splik_id', id);

        if (error) throw error;
        setLiked(false);
        setSplik(prev => prev ? {
          ...prev,
          likes_count: Math.max(0, (prev.likes_count || 0) - 1)
        } : null);
      } else {
        const { error } = await supabase
          .from('likes')
          .insert({ user_id: user.id, splik_id: id });

        if (error) throw error;
        setLiked(true);
        setSplik(prev => prev ? {
          ...prev,
          likes_count: (prev.likes_count || 0) + 1
        } : null);
      }
    } catch (error: any) {
      console.error('Error handling like:', error);
      toast({
        title: "Error",
        description: "Failed to update like",
        variant: "destructive",
      });
    }
  };

  const getUserName = () => {
    if (!splik?.profiles) return 'Anonymous';
    const { first_name, last_name } = splik.profiles;
    return `${first_name || ''} ${last_name || ''}`.trim() || 'Anonymous';
  };

  const getUserInitials = () => {
    if (!splik?.profiles) return 'AN';
    const { first_name, last_name } = splik.profiles;
    return `${first_name?.[0] || ''}${last_name?.[0] || ''}`.toUpperCase() || 'AN';
  };

  const formatDuration = () => {
    return "0:03"; // Always show 3 seconds
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!splik) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <h2 className="text-2xl font-bold mb-4">Video not found</h2>
          <Link to="/">
            <Button variant="outline">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="overflow-hidden">
          {/* User info */}
          <div className="p-4 flex items-center justify-between border-b">
            <Link to={`/creator/${splik.profiles?.username || splik.user_id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <Avatar className="h-10 w-10">
                <AvatarFallback>{getUserInitials()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{getUserName()}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(splik.created_at), { addSuffix: true })}
                </p>
              </div>
            </Link>
          </div>

          {/* Video */}
          <div className="relative bg-black aspect-video">
            <video
              ref={videoRef}
              src={splik.video_url}
              className="w-full h-full object-contain"
              loop
              playsInline
              muted={muted}
              onClick={togglePlayPause}
            />
            
            {/* Play/Pause overlay */}
            {!playing && (
              <div 
                className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
                onClick={togglePlayPause}
              >
                <div className="bg-white/90 rounded-full p-4">
                  <Play className="h-8 w-8 text-black" />
                </div>
              </div>
            )}

            {/* Video controls */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={togglePlayPause}
                    className="text-white hover:bg-white/20"
                  >
                    {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </Button>
                  <span className="text-sm">{formatDuration()}</span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleMute}
                  className="text-white hover:bg-white/20"
                >
                  {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Actions and info */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button 
                  size="icon" 
                  variant="ghost"
                  onClick={handleLike}
                  className={liked ? "text-red-500" : ""}
                >
                  <Heart 
                    className={`h-6 w-6 ${liked ? "fill-current" : ""}`} 
                  />
                </Button>
                <Button 
                  size="icon" 
                  variant="ghost"
                  onClick={() => setShowShareModal(true)}
                >
                  <Share2 className="h-6 w-6" />
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm">
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

            {/* Title and description */}
            {splik.title && (
              <h1 className="text-xl font-bold">{splik.title}</h1>
            )}
            {splik.description && (
              <p className="text-sm text-muted-foreground">{splik.description}</p>
            )}
          </div>
        </Card>
      </main>

      <Footer />

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        videoId={splik.id}
        videoTitle={splik.title || "Check out this Splik!"}
      />
    </div>
  );
};

export default VideoPage;