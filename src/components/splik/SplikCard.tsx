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

// one per-tab session id to throttle repeat views
const getSessionId = () => {
  let sid = sessionStorage.getItem("splik_session_id");
  if (!sid) {
    sid = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem("splik_session_id", sid);
  }
  return sid;
};

const SplikCard = ({ splik, onSplik, onReact, onShare }: SplikCardProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(splik.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(splik.comments_count || 0);
  const [viewCount, setViewCount] = useState(
    (splik as any).view_count ?? splik.views ?? 0
  );
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
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user ?? null);
      if (user) {
        const { data } = await supabase
          .from("likes")
          .select("*")
          .eq("user_id", user.id)
          .eq("splik_id", splik.id)
          .maybeSingle();
        setIsLiked(!!data);
      }
    })();
    checkIfFavorited();

    setViewCount((splik as any).view_count ?? splik.views ?? 0);
    setLikesCount(splik.likes_count || 0);
    setCommentsCount(splik.comments_count || 0);

    // realtime update keeps us in sync if enabled
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
            const n = payload.new as any;
            setViewCount(n.views ?? n.view_count ?? 0);
            setLikesCount(n.likes_count ?? 0);
            setCommentsCount(n.comments_count ?? 0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [splik.id]);

  const trackView = async () => {
    try {
      const sid = getSessionId();
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc("increment_view_with_session", {
        p_splik_id: splik.id,
        p_session_id: sid,
        p_viewer_id: user?.id ?? null,
      });
      if (!error && data && typeof data === "object" && "new_view" in data) {
        if (data.new_view && data.view_count) {
          setViewCount(data.view_count); // immediate local update
        }
      }
    } catch (e) {
      console.error("trackView error", e);
    }
  };

  const handleSplik = async () => {
    if (!currentUser) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like spliks",
        variant: "destructive",
      });
      return;
    }

    const next = !isLiked;
    setIsLiked(next);
    setLikesCount((p) => (next ? p + 1 : Math.max(0, p - 1)));

    try {
      if (!next) {
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
      setIsLiked(!next);
      setLikesCount((p) => (!next ? p + 1 : Math.max(0, p - 1)));
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
    const { data: { user } } = await supabase.auth.getUser();
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
    const { data: { user } } = await supabase.auth.getUser();
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
        if (!error) setIsFavorited(false);
      } else {
        const { error } = await supabase.from("favorites").insert({
          user_id: user.id,
          splik_id: splik.id,
        });
        if (!error) setIsFavorited(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/splik/${splik.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied!", description: "Video link copied to clipboard" });
  };

  const handleReport = () => setShowReportModal(true);

  const handleBlock = () =>
    toast({ title: "User blocked", description: "You won't see content from this user anymore" });

  const handlePlayToggle = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
      return;
    }
    v.currentTime = 0;
    try {
      await v.play();
      setIsPlaying(true);
      await trackView(); // <-- record & update views when playback starts
    } catch {
      v.muted = true;
      setIsMuted(true);
      try {
        await v.play();
        setIsPlaying(true);
        await trackView();
      } catch {}
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.currentTime >= 3) {
      v.pause();
      v.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !isMuted;
    setIsMuted(!isMuted);
  };

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
      {isBoosted && (
        <div className="absolute top-3 left-3 z-20">
          <Badge className="bg-gradient-to-r from-primary to-secondary text-white border-0 px-2 py-1">
            <Rocket className="h-3 w-3 mr-1" />
            Promoted
          </Badge>
        </div>
      )}

      <div
        className="relative bg-black overflow-hidden group"
        style={{ height: videoHeight, maxHeight: "80vh" }}
      >
        <video
          ref={videoRef}
          src={splik.video_url}
          poster={(splik as any).thumbnail_url}
          className="w-full h-full object-cover"
          loop={false}
          muted={isMuted}
          playsInline
          onTimeUpdate={handleTimeUpdate}
        />

        <div
          className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          onClick={handlePlayToggle}
        >
          {isPlaying ? (
            <Pause className="h-16 w-16 text-white drop-shadow-lg" />
          ) : (
            <Play className="h-16 w-16 text-white drop-shadow-lg" />
          )}
        </div>

        {isPlaying && (
          <Button
            size="icon"
            variant="ghost"
            className="absolute bottom-3 right-3 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        )}

        {/* Live count overlay uses local viewCount that we update via RPC */}
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full">
          <Eye className="h-4 w-4 text-white" />
          <span className="text-white font-semibold text-sm">
            {viewCount.toLocaleString()} views
          </span>
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        </div>
      </div>

      {/* …(rest of the component remains the same) */}
      {/* Creator row, actions, modals etc — unchanged from your version */}
      {/* For brevity not repeating unchanged UI below */}
      {/* --- Creator + menu / actions / modals code stays the same --- */}
      
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
        creatorName={
          (splik as any).profile?.display_name ||
          (splik as any).profile?.username ||
          "Unknown Creator"
        }
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
