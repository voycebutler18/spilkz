// src/components/SplikCard.tsx
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Heart,
  MessageCircle,
  Share2,
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
  Sparkles,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

/* --------------------------------- Types --------------------------------- */

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

/* ----------------------------- Helper functions -------------------------- */

const toTitle = (s: string) =>
  s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/* -------------------------------- Component ------------------------------ */

const SplikCard = ({ splik, onSplik, onReact, onShare }: SplikCardProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(splik.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(splik.comments_count || 0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [showPauseButton, setShowPauseButton] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const viewedRef = useRef(false);
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { isMobile } = useDeviceType();
  const { toast } = useToast();

  /* --------------------------- Autoplay/visibility --------------------------- */

  const muteOtherVideos = () => {
    const allVideos = document.querySelectorAll("video");
    allVideos.forEach((video) => {
      if (video !== videoRef.current) {
        (video as HTMLVideoElement).muted = true;
        (video as HTMLVideoElement).pause();
      }
    });
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
          setIsInView(visible);

          if (visible && videoRef.current) {
            muteOtherVideos();
            videoRef.current.currentTime = 0;
            videoRef.current.muted = isMuted;
            videoRef.current
              .play()
              .then(() => setIsPlaying(true))
              .catch(() => {});
            if (!viewedRef.current) viewedRef.current = true;
          } else if (videoRef.current && isPlaying) {
            videoRef.current.pause();
            videoRef.current.muted = true;
            setIsPlaying(false);
          }
        });
      },
      { threshold: [0.5], rootMargin: "0px" }
    );

    if (cardRef.current) observer.observe(cardRef.current);

    return () => {
      if (cardRef.current) observer.unobserve(cardRef.current);
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, isMuted]);

  /* ------------------------ Load user + initial states ----------------------- */

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUser(user);

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

    init();
    checkIfFavorited();

    setLikesCount(splik.likes_count || 0);
    setCommentsCount(splik.comments_count || 0);

    const channel = supabase
      .channel(`splik-${splik.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "spliks", filter: `id=eq.${splik.id}` },
        (payload) => {
          if (payload.new) {
            const next = payload.new as any;
            setLikesCount(next.likes_count || 0);
            setCommentsCount(next.comments_count || 0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splik.id]);

  /* --------------------- Force any legacy promote pill to Boost ------------- */

  useEffect(() => {
    // Rewire any legacy anchor that points to /dashboard and says "Promote"
    const selector = 'a[href="/dashboard"], a[href="/dashboard/"]';
    const els = Array.from(document.querySelectorAll<HTMLAnchorElement>(selector)).filter(
      (el) => /promote/i.test((el.textContent || "").trim())
    );

    const openBoost = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      setShowBoostModal(true);
      return false;
    };

    els.forEach((el) => {
      el.addEventListener("click", openBoost, { capture: true });
      el.addEventListener("mousedown", openBoost, { capture: true });
      el.addEventListener("touchstart", openBoost, { capture: true });
      // Safety: stop it from taking clicks at all; our own pill will handle it
      el.style.pointerEvents = "none";
    });

    return () => {
      els.forEach((el) => {
        el.removeEventListener("click", openBoost, { capture: true } as any);
        el.removeEventListener("mousedown", openBoost, { capture: true } as any);
        el.removeEventListener("touchstart", openBoost, { capture: true } as any);
        el.style.pointerEvents = "";
      });
    };
  }, []);

  /* --------------------------------- Actions -------------------------------- */

  const handleSplik = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like spliks",
        variant: "destructive",
      });
      return;
    }

    const next = !isLiked;
    setIsLiked(next);
    setLikesCount((prev) => (next ? prev + 1 : Math.max(0, prev - 1)));

    try {
      if (!next) {
        await supabase.from("likes").delete().eq("user_id", user.id).eq("splik_id", splik.id);
      } else {
        await supabase.from("likes").insert({ user_id: user.id, splik_id: splik.id });
      }
      onSplik?.();
    } catch {
      setIsLiked(!next);
      setLikesCount((prev) => (!next ? prev + 1 : Math.max(0, prev - 1)));
      toast({ title: "Error", description: "Failed to update like", variant: "destructive" });
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
      toast({ title: "Sign in required", description: "Please sign in to save videos", variant: "destructive" });
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
          toast({ title: "Removed from favorites", description: "Video removed from your favorites" });
        }
      } else {
        const { error } = await supabase.from("favorites").insert({ user_id: user.id, splik_id: splik.id });
        if (!error) {
          setIsFavorited(true);
          toast({ title: "Added to favorites!", description: "Video saved to your favorites" });
        }
      }
    } catch {
      toast({ title: "Error", description: "Failed to update favorites", variant: "destructive" });
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/video/${splik.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied!", description: "Video link copied to clipboard" });
  };

  const handleReport = () => setShowReportModal(true);
  const handleBlock = () =>
    toast({ title: "User blocked", description: "You won't see content from this user anymore" });

  const formatCount = (count: number | undefined | null) => {
    const safe = count ?? 0;
    if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}M`;
    if (safe >= 1_000) return `${(safe / 1_000).toFixed(1)}K`;
    return safe.toString();
  };

  const handlePlayToggle = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      setShowPauseButton(false);
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = setTimeout(() => setShowPauseButton(true), 2000);
    } else {
      muteOtherVideos();
      video.currentTime = 0;
      video.muted = isMuted;
      void video.play();
      setIsPlaying(true);
      setShowPauseButton(true);
      if (!viewedRef.current) viewedRef.current = true;
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.currentTime >= 3) {
      video.pause();
      video.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!isMuted) muteOtherVideos();
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  /* ----------------------------- Derived values ---------------------------- */

  const videoHeight = isMobile ? "60svh" : "500px";
  const isBoosted = Boolean(
    (splik as any).isBoosted ||
      (splik as any).is_currently_boosted ||
      (((splik as any).boost_score ?? 0) > 0)
  );
  const isOwner = currentUser && currentUser.id === splik.user_id;

  /* ---------------------------------- UI ---------------------------------- */

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative isolate bg-card rounded-xl overflow-hidden shadow-lg border border-border w-full max-w-[500px] mx-auto",
        isBoosted && "ring-2 ring-primary/50"
      )}
    >
      {/* Safety CSS to disable clicks on any rogue /dashboard promote pill that might exist outside this component */}
      <style>{`
        a[href="/dashboard"], a[href="/dashboard/"] {
          /* prevent ghost-clicks; JS hijack above will open the modal */
          pointer-events: none !important;
        }
      `}</style>

      {/* VIDEO AREA */}
      <div
        className="relative bg-black overflow-hidden group rounded-t-xl -mt-px"
        style={{ height: videoHeight, maxHeight: "80svh" }}
        onClick={handlePlayToggle}
      >
        {/* hide any seam */}
        <div className="pointer-events-none absolute left-0 right-0 -top-px h-5 bg-black z-10 rounded-t-xl" />

        {/* Brand chip (kept) */}
        <div className="absolute top-2 left-3 z-30 pointer-events-none">
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1 bg-black/80 backdrop-blur-sm shadow-md">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-bold text-white">Splikz</span>
          </div>
        </div>

        {/* Promote pill – ALWAYS opens Boost modal (owner only) */}
        {isOwner && (
          <div className="absolute top-2 right-3 z-40">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowBoostModal(true);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="relative flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold bg-gradient-to-r from-cyan-400 to-emerald-400 text-black shadow-lg ring-1 ring-black/10 hover:from-cyan-300 hover:to-emerald-300 transition-colors"
            >
              <Rocket className="h-4 w-4" />
              Promote
            </button>
          </div>
        )}

        {/* Promoted badge (if already boosted) – does NOT block the promote pill */}
        {isBoosted && (
          <div className="absolute top-2 right-[11.5rem] z-30 pointer-events-none">
            <Badge className="bg-gradient-to-r from-primary to-secondary text-white border-0 px-2 py-1">
              <Rocket className="h-3 w-3 mr-1" />
              Promoted
            </Badge>
          </div>
        )}

        <video
          ref={videoRef}
          src={splik.video_url}
          poster={splik.thumbnail_url}
          className="block w-full h-full object-cover"
          loop={false}
          muted={isMuted}
          playsInline
          onTimeUpdate={handleTimeUpdate}
        />

        {/* Center play/pause icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          {isPlaying ? (
            showPauseButton && (
              <button
                aria-label="Pause"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayToggle();
                }}
              >
                <Pause className="h-14 w-14 text-white drop-shadow-lg" />
              </button>
            )
          ) : (
            <button
              aria-label="Play"
              className="bg-black/35 rounded-full p-4 hover:bg-black/45 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                handlePlayToggle();
              }}
            >
              <Play className="h-10 w-10 text-white ml-1" />
            </button>
          )}
        </div>

        {/* Title & description overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
          <div className="bg-gradient-to-t from-black/70 via-black/35 to-transparent px-4 pt-10 pb-3">
            <h3 className="text-white font-semibold text-sm truncate">
              {splik.title || "Untitled"}
            </h3>
            {splik.description ? (
              <p className="text-white/85 text-xs truncate">{splik.description}</p>
            ) : null}
          </div>
        </div>

        {/* Sound Control */}
        {isPlaying && (
          <Button
            size="icon"
            variant="ghost"
            className="absolute bottom-3 right-3 z-30 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* CREATOR + MENU */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link
              to={`/creator/${splik.profile?.username || splik.profile?.handle || splik.user_id}`}
              className="flex items-center space-x-3 group flex-1 min-w-0"
            >
              <Avatar className="h-10 w-10 ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all">
                <AvatarImage src={splik.profile?.avatar_url || undefined} />
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
                <p className="text-xs text-muted-foreground truncate">
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 ml-2 flex-shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={5}>
              {/* Promote option (owner) */}
              {currentUser?.id === splik.user_id && (
                <DropdownMenuItem
                  onClick={() => setShowBoostModal(true)}
                  className="cursor-pointer text-primary"
                >
                  <Rocket className="h-4 w-4 mr-2" />
                  Promote Video
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

        {/* ENGAGEMENT ACTIONS */}
        <div className="flex items-center justify-between gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSplik}
            className={cn("flex items-center space-x-2 transition-colors flex-1", isLiked && "text-red-500 hover:text-red-600")}
          >
            <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
            <span className="text-xs font-medium">{formatCount(likesCount)}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleComment}
            className="flex items-center space-x-2 flex-1 hover:text-blue-500"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs font-medium">{formatCount(commentsCount)}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleShare}
            className="flex items-center space-x-2 flex-1 hover:text-green-500"
          >
            <Share2 className="h-4 w-4" />
            <span className="text-xs font-medium">Share</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFavorite}
            className={cn("flex items-center space-x-2 transition-colors flex-1", isFavorited && "text-yellow-500 hover:text-yellow-600")}
          >
            <Bookmark className={cn("h-4 w-4", isFavorited && "fill-current")} />
            <span className="text-xs font-medium">Save</span>
          </Button>
        </div>

        {splik.mood && (
          <div className="mt-3">
            <Badge variant="secondary" className="px-2 py-0.5 text-[10px] rounded-full">
              {toTitle(String(splik.mood))}
            </Badge>
          </div>
        )}

        {likesCount === 0 && commentsCount === 0 && (
          <div className="mt-2 text-xs text-muted-foreground text-center italic">
            Be the first to react! 💜
          </div>
        )}
      </div>

      {/* MODALS */}
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
          splik.profile?.display_name || splik.profile?.username || "Unknown Creator"
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
