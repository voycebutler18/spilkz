import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  MessageCircle,
  Share2,
  Eye,
  MoreVertical,
  Flag,
  UserX,
  Copy,
  Bookmark,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Rocket,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { FollowButton } from "@/components/FollowButton";
import ShareModal from "@/components/ShareModal";
import CommentsModal from "@/components/CommentsModal";
import ReportModal from "@/components/ReportModal";
import BoostModal from "@/components/BoostModal";
import { useDeviceType } from "@/hooks/use-device-type";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Splik } from "@/lib/supabase";

interface ExtendedSplik extends Splik {
  isBoosted?: boolean;
  is_currently_boosted?: boolean;
  boost_score?: number;
}

interface SplikCardProps {
  splik: ExtendedSplik;
  onSplik?: () => void;
  onReact?: () => void;
  onShare?: () => void;
}

const SplikCard = ({ splik, onSplik, onReact, onShare }: SplikCardProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(splik.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(splik.comments_count || 0);
  const [viewCount, setViewCount] = useState(splik.view_count || splik.views || 0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { isMobile } = useDeviceType();
  const { toast } = useToast();

  useEffect(() => {
    // Get current user
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUser(user);

      // Check if user has liked this splik
      if (user) {
        const { data } = await supabase
          .from("likes")
          .select("*")
          .eq("user_id", user.id)
          .eq("splik_id", splik.id)
          .maybeSingle();

        setIsLiked(!!data);
      }
    };
    getUser();
    checkIfFavorited();

    // Set initial counts
    setViewCount(splik.view_count || splik.views || 0);
    setLikesCount(splik.likes_count || 0);
    setCommentsCount(splik.comments_count || 0);

    // Subscribe to real-time updates for this splik
    const channel = supabase
      .channel(`splik-${splik.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "spliks",
          filter: `id=eq.${splik.id}`,
        },
        (payload) => {
          if (payload.new) {
            const newData = payload.new as any;
            setViewCount(newData.views || newData.view_count || 0);
            setLikesCount(newData.likes_count || 0);
            setCommentsCount(newData.comments_count || 0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [splik.id]);

  const handleSplik = async () => {
    if (!currentUser) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like spliks",
        variant: "destructive",
      });
      return;
    }

    // Optimistic UI
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikesCount((prev) => (newLikedState ? prev + 1 : Math.max(0, prev - 1)));

    try {
      if (!newLikedState) {
        await supabase
          .from("likes")
          .delete()
          .eq("user_id", currentUser.id)
          .eq("splik_id", splik.id);
      } else {
        await supabase.from("likes").insert({
          user_id: currentUser.id,
          splik_id: splik.id,
        });
      }
      onSplik?.();
    } catch (error) {
      // Revert on error
      setIsLiked(!newLikedState);
      setLikesCount((prev) => (!newLikedState ? prev + 1 : Math.max(0, prev - 1)));

      console.error("Error toggling like:", error);
      toast({
        title: "Error",
        description: "Failed to update like",
        variant: "destructive",
      });
    }
  };

  const handleComment = () => {
    setShowCommentsModal(true);
    onReact?.();
  };

  const handleShare = () => {
    setShowShareModal(true);
    onShare?.();
  };

  const checkIfFavorited = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("splik_id", splik.id)
      .maybeSingle();

    setIsFavorited(!!data);
  };

  const toggleFavorite = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save videos",
        variant: "destructive",
      });
      return;
    }

    try {
      if (isFavorited) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("splik_id", splik.id);

        if (!error) {
          setIsFavorited(false);
          toast({
            title: "Removed from favorites",
            description: "Video removed from your favorites",
          });
        }
      } else {
        const { error } = await supabase.from("favorites").insert({
          user_id: user.id,
          splik_id: splik.id,
        });

        if (!error) {
          setIsFavorited(true);
          toast({
            title: "Added to favorites!",
            description: "Video saved to your favorites",
          });
        }
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      toast({
        title: "Error",
        description: "Failed to update favorites",
        variant: "destructive",
      });
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/splik/${splik.id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "Video link copied to clipboard",
    });
  };

  const handleReport = () => setShowReportModal(true);

  const handleBlock = () => {
    toast({
      title: "User blocked",
      description: "You won't see content from this user anymore",
    });
  };

  const formatCount = (count: number | undefined | null) => {
    const safeCount = count ?? 0;
    if (safeCount >= 1_000_000) return `${(safeCount / 1_000_000).toFixed(1)}M`;
    if (safeCount >= 1_000) return `${(safeCount / 1_000).toFixed(1)}K`;
    return safeCount.toString();
  };

  const handlePlayToggle = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.currentTime = 0;
      video.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    // Stop after 3 seconds
    if (video.currentTime >= 3) {
      video.pause();
      video.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // Responsive height based on device type
  const videoHeight = isMobile ? "60vh" : "500px";
  const isBoosted =
    (splik as any).isBoosted ||
    (splik as any).is_currently_boosted ||
    ((splik as any).boost_score && (splik as any).boost_score > 0);

  return (
    <div
      className={cn(
        "relative bg-card rounded-xl overflow-hidden shadow-lg border border-border w-full max-w-[500px] mx-auto",
        isBoosted && "ring-2 ring-primary/50"
      )}
    >
      {/* Boosted Badge */}
      {isBoosted && (
        <div className="absolute top-3 left-3 z-20">
          <Badge className="bg-gradient-to-r from-primary to-secondary text-white border-0 px-2 py-1">
            <Rocket className="h-3 w-3 mr-1" />
            Promoted
          </Badge>
        </div>
      )}

      {/* Video Container (now covers any stray content above via top mask) */}
      <div
        className="relative bg-black group z-10 overflow-visible"
        style={{ height: videoHeight, maxHeight: "80vh" }}
      >
        {/* TOP MASK: covers a few px above the video area */}
        <div className="pointer-events-none absolute -top-4 left-0 right-0 h-6 bg-black z-20" />

        <video
          ref={videoRef}
          src={splik.video_url}
          poster={splik.thumbnail_url}
          className="w-full h-full object-cover"
          loop={false}
          muted={isMuted}
          playsInline
          onTimeUpdate={handleTimeUpdate}
        />

        {/* Play/Pause Overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-30"
          onClick={handlePlayToggle}
        >
          {isPlaying ? (
            <Pause className="h-16 w-16 text-white drop-shadow-lg" />
          ) : (
            <Play className="h-16 w-16 text-white drop-shadow-lg" />
          )}
        </div>

        {/* Sound Control */}
        {isPlaying && (
          <Button
            size="icon"
            variant="ghost"
            className="absolute bottom-3 right-3 text-white hover:bg-white/20 z-30"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        )}

        {/* Live View Count Badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full z-30">
          <Eye className="h-4 w-4 text-white" />
          <span className="text-white font-semibold text-sm">
            {viewCount.toLocaleString()} views
          </span>
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        </div>

        {/* Amplified Badge */}
        {splik.amplified_until && new Date(splik.amplified_until) > new Date() && (
          <Badge className="absolute top-3 right-3 bg-gradient-to-r from-neon to-violet-glow text-white border-0 z-30">
            Amplified
          </Badge>
        )}

        {/* Tag */}
        {splik.tag && (
          <div className="absolute bottom-3 left-3 z-30">
            <Badge variant="secondary" className="bg-background/80 backdrop-blur">
              {splik.tag}
            </Badge>
          </div>
        )}
      </div>

      {/* Creator Info + Menu */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          {/* Creator */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link
              to={`/creator/${splik.profile?.username || splik.profile?.handle || splik.user_id}`}
              className="flex items-center space-x-3 group flex-1 min-w-0"
            >
              <Avatar className="h-10 w-10 ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all">
                <AvatarImage src={splik.profile?.avatar_url} />
                <AvatarFallback>
                  {splik.profile?.display_name?.[0] ||
                    splik.profile?.first_name?.[0] ||
                    splik.profile?.username?.[0] ||
                    "U"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm group-hover:text-primary transition-colors truncate">
                  {splik.profile?.display_name ||
                    splik.profile?.first_name ||
                    splik.profile?.username ||
                    "Unknown User"}
                </p>
                <p className="text-xs text-muted-foreground">
                  @{splik.profile?.username || splik.profile?.handle || "unknown"}
                </p>
              </div>
            </Link>

            <FollowButton
              profileId={splik.user_id}
              username={
                splik.profile?.username ||
                splik.profile?.handle ||
                splik.profile?.first_name
              }
              size="sm"
              variant="default"
            />
          </div>

          {/* Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 ml-2 flex-shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={5}>
              {currentUser && currentUser.id === splik.user_id && (
                <DropdownMenuItem
                  onClick={() => setShowBoostModal(true)}
                  className="cursor-pointer text-primary"
                >
                  <Rocket className="h-4 w-4 mr-2" />
                  Boost Video
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
                <Copy className="h-4 w-4 mr-2" />
                Copy Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleReport} className="cursor-pointer">
                <Flag className="h-4 w-4 mr-2" />
                Report
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleBlock} className="cursor-pointer">
                <UserX className="h-4 w-4 mr-2" />
                Block User
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSplik}
            className={cn(
              "flex items-center space-x-2 transition-colors",
              isLiked && "text-purple-600 hover:text-purple-700"
            )}
          >
            <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
            <span className="text-xs">{formatCount(likesCount)}</span>
          </Button>

        <Button
            variant="ghost"
            size="sm"
            onClick={handleComment}
            className="flex items-center space-x-2"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs">{formatCount(commentsCount)}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleShare}
            className="flex items-center space-x-2"
          >
            <Share2 className="h-4 w-4" />
            <span className="text-xs">Share</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFavorite}
            className={cn(
              "flex items-center space-x-2 transition-colors",
              isFavorited && "text-yellow-500 hover:text-yellow-600"
            )}
          >
            <Bookmark className={cn("h-4 w-4", isFavorited && "fill-current")} />
          </Button>
        </div>
      </div>

      {/* Modals */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        videoId={splik.id}
        videoTitle={splik.title || "Check out this splik!"}
      />

      <CommentsModal
        isOpen={showCommentsModal}
        onClose={() => setShowCommentsModal(false)}
        splikId={splik.id}
        splikTitle={splik.title}
      />

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        videoId={splik.id}
        videoTitle={splik.title || splik.description || "Untitled Video"}
        creatorName={splik.profile?.display_name || splik.profile?.username || "Unknown Creator"}
      />

      {showBoostModal && (
        <BoostModal
          isOpen={showBoostModal}
          onClose={() => setShowBoostModal(false)}
          splikId={splik.id}
          videoTitle={splik.title || splik.description}
        />
      )}
    </div>
  );
};

export default SplikCard;
