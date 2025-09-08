// src/components/splik/SplikCard.tsx
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Heart, MessageCircle, Share2, MoreVertical, Flag, UserX, Copy,
  Bookmark, BookmarkCheck, Volume2, VolumeX, Rocket, Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { FollowButton } from "@/components/FollowButton";
import ShareModal from "@/components/ShareModal";
import CommentsModal from "@/components/CommentsModal";
import ReportModal from "@/components/ReportModal";
import BoostModal from "@/components/BoostModal";
import { useDeviceType } from "@/hooks/use-device-type";
import { useToast } from "@/components/ui/use-toast";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  likes_count?: number | null;
  comments_count?: number | null;
  mood?: string | null;
  status?: string | null;
  profile?: any;
  trim_start?: number | null;
  trim_end?: number | null;
};

interface SplikCardProps {
  splik: Splik & { isBoosted?: boolean; is_currently_boosted?: boolean; boost_score?: number };
  onSplik?: () => void;
  onReact?: () => void;
  onShare?: () => void;
}

/* ---------- single-player lock across cards ---------- */
let CURRENT_PLAYING: HTMLVideoElement | null = null;
const playExclusive = async (el: HTMLVideoElement) => {
  if (CURRENT_PLAYING && CURRENT_PLAYING !== el) { try { CURRENT_PLAYING.pause(); } catch {} }
  CURRENT_PLAYING = el;
  try { await el.play(); } catch {}
};
const pauseIfCurrent = (el: HTMLVideoElement | null) => {
  if (!el) return;
  if (CURRENT_PLAYING === el) CURRENT_PLAYING = null;
  try { el.pause(); } catch {}
};

const toTitle = (s: string) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function SplikCard({ splik, onSplik, onReact, onShare }: SplikCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(splik.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(splik.comments_count || 0);

  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [likePending, setLikePending] = useState(false);

  const [showShareModal, setShowShareModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const primedRef = useRef(false);

  // LAZY SRC: only attach when near viewport
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  const { isMobile } = useDeviceType();
  const { toast } = useToast();

  const creatorSlug = splik.profile?.username || splik.profile?.handle || splik.user_id;

  // Trim window
  const START = Math.max(0, Number(splik.trim_start ?? 0));
  const RAW_END = Number.isFinite(Number(splik.trim_end)) ? Number(splik.trim_end) : START + 3;
  const END = Math.max(START, Math.min(START + 3, RAW_END));
  const SEEK_SAFE = Math.max(0.05, START + 0.05);

  /* ---------- LAZY LOAD & autoplay ---------- */
  useEffect(() => {
    const el = cardRef.current;
    const v = videoRef.current;
    if (!el || !v) return;

    v.playsInline = true;
    v.setAttribute("playsinline", "true");
    // @ts-expect-error
    v.setAttribute("webkit-playsinline", "true");
    v.muted = isMuted;
    if (isMuted) v.setAttribute("muted", "true");
    v.controls = false;

    const primeToStart = () => {
      if (!v.duration || v.duration <= 0) return;
      try { v.currentTime = SEEK_SAFE; primedRef.current = true; } catch {}
    };

    const onLoadedMetadata = () => primeToStart();

    // 1) PRELOAD WHEN NEAR (next/prev screens), UNLOAD WHEN FAR
    const preloader = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (!videoSrc) setVideoSrc(splik.video_url);            // attach src
          } else {
            // If FAR away, release memory
            if (entry.intersectionRatio === 0) {
              // keep current playing loaded; unload others
              if (v !== CURRENT_PLAYING) setVideoSrc(null);
            }
          }
        });
      },
      { root: null, threshold: 0, rootMargin: "200% 0px 200% 0px" } // near-viewport
    );

    // 2) PLAY/PAUSE WHEN MOSTLY VISIBLE
    const player = new IntersectionObserver(
      async (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
            if (!videoSrc) setVideoSrc(splik.video_url);
            // Wait one microtask so the src attaches before play
            queueMicrotask(async () => {
              try {
                if (!primedRef.current) primeToStart();
                v.muted = isMuted;
                if (isMuted) v.setAttribute("muted", "true"); else v.removeAttribute("muted");
                await playExclusive(v);
                setIsPlaying(true);
              } catch {
                setIsPlaying(false);
              }
            });
          } else {
            pauseIfCurrent(v);
            v.muted = true; v.setAttribute("muted", "true");
            setIsPlaying(false);
          }
        }
      },
      { root: null, threshold: [0, 0.7] }
    );

    preloader.observe(el);
    player.observe(el);
    v.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      preloader.disconnect();
      player.disconnect();
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      pauseIfCurrent(v);
      primedRef.current = false;
    };
  }, [isMuted, START, END, SEEK_SAFE, splik.video_url, videoSrc]);

  // keep 3-second loop
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTimeUpdate = () => {
      if (v.currentTime < START || v.currentTime >= END) {
        try { v.currentTime = SEEK_SAFE; } catch {}
      }
    };
    v.addEventListener("timeupdate", onTimeUpdate);
    return () => v.removeEventListener("timeupdate", onTimeUpdate);
  }, [START, END, SEEK_SAFE]);

  /* ---------- load user + like/saved states + realtime ---------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      setCurrentUser(user);

      if (user) {
        const { data: likeRow } = await supabase
          .from("likes").select("id").eq("user_id", user.id).eq("splik_id", splik.id).maybeSingle();
        if (!mounted) return;
        setIsLiked(!!likeRow);

        const { data: favRow } = await supabase
          .from("favorites").select("id").eq("user_id", user.id).eq("splik_id", splik.id).maybeSingle();
        if (!mounted) return;
        setIsSaved(!!favRow);

        const countersChannel = supabase
          .channel(`splik-${splik.id}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "spliks", filter: `id=eq.${splik.id}` },
            (p) => {
              const next = p.new as any;
              setLikesCount(next.likes_count || 0);
              setCommentsCount(next.comments_count || 0);
            }
          )
          .subscribe();

        return () => { supabase.removeChannel(countersChannel); };
      }
    })();

    setLikesCount(splik.likes_count || 0);
    setCommentsCount(splik.comments_count || 0);
    return () => { mounted = false; };
  }, [splik.id]);

  /* ---------- LIKE with upsert (no double counts) ---------- */
  const handleSplik = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (likePending) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to like videos", variant: "destructive" });
      return;
    }

    setLikePending(true);
    const wantLike = !isLiked;
    setIsLiked(wantLike);
    setLikesCount((p) => Math.max(0, p + (wantLike ? 1 : -1)));

    try {
      if (wantLike) {
        const { error } = await supabase
          .from("likes")
          .upsert({ user_id: user.id, splik_id: splik.id }, { onConflict: "user_id,splik_id", ignoreDuplicates: true });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("likes").delete().eq("user_id", user.id).eq("splik_id", splik.id);
        if (error) throw error;
      }

      const { count } = await supabase
        .from("likes").select("*", { count: "exact", head: true }).eq("splik_id", splik.id);
      if (typeof count === "number") setLikesCount(count);

      onSplik?.();
    } catch {
      setIsLiked((prev) => !prev);
      setLikesCount((p) => Math.max(0, p + (wantLike ? -1 : 1)));
      toast({ title: "Error", description: "Failed to update like", variant: "destructive" });
    } finally {
      setLikePending(false);
    }
  };

  const handleComment = () => { setShowCommentsModal(true); onReact?.(); };
  const handleShare = () => { setShowShareModal(true); onShare?.(); };

  const toggleFavorite = async () => {
    if (saving) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to save videos", variant: "destructive" });
      return;
    }
    setSaving(true);
    const next = !isSaved;
    setIsSaved(next);
    try {
      if (next) {
        await supabase.from("favorites").insert({ user_id: user.id, splik_id: splik.id });
        toast({ title: "Added to favorites" });
      } else {
        await supabase.from("favorites").delete().eq("user_id", user.id).eq("splik_id", splik.id);
        toast({ title: "Removed from favorites" });
      }
    } catch {
      setIsSaved(!next);
      toast({ title: "Error", description: "Failed to update favorites", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin.replace(/\/$/,'')}/v/${splik.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied" });
  };

  const handlePlayToggle = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (!videoSrc) setVideoSrc(splik.video_url);
    if (isPlaying) {
      if (isMuted) { v.muted = false; v.removeAttribute("muted"); setIsMuted(false); return; }
      pauseIfCurrent(v); setIsPlaying(false);
    } else {
      try { v.currentTime = SEEK_SAFE; } catch {}
      if (isMuted) { v.muted = false; v.removeAttribute("muted"); setIsMuted(false); }
      await playExclusive(v); setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current; if (!v) return;
    const next = !isMuted; v.muted = next;
    if (next) v.setAttribute("muted", "true"); else v.removeAttribute("muted");
    setIsMuted(next);
  };

  const videoHeight = isMobile ? "60svh" : "500px";
  const isBoosted = Boolean((splik as any).isBoosted || (splik as any).is_currently_boosted || (((splik as any).boost_score ?? 0) > 0));
  const isOwner = currentUser && currentUser.id === splik.user_id;

  return (
    <div ref={cardRef} data-splik-id={splik.id} id={`splik-${splik.id}`}
      className={cn("relative isolate bg-card rounded-xl overflow-hidden shadow-lg border border-border w-full max-w-[500px] mx-auto",
        isBoosted && "ring-2 ring-primary/50")}
    >
      {/* VIDEO */}
      <div className="relative bg-black overflow-hidden group rounded-t-xl -mt-px" style={{ height: videoHeight, maxHeight: "80svh" }} onClick={handlePlayToggle}>
        <div className="pointer-events-none absolute left-0 right-0 -top-px h-5 bg-black z-10 rounded-t-xl" />
        <div className="absolute top-2 left-3 z-30 pointer-events-none">
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1 bg-black/80 backdrop-blur-sm shadow-md">
            <Sparkles className="h-4 w-4 text-white/80" />
            <span className="text-sm font-bold text-white">Feed</span>
          </div>
        </div>

        {isOwner && (
          <div className="absolute top-2 right-3 z-40">
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowBoostModal(true); }}
              className="relative flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold bg-white text-black shadow-lg ring-1 ring-black/10 hover:bg-white/90 transition-colors">
              <Rocket className="h-4 w-4" />
              Promote
            </button>
          </div>
        )}

        {isBoosted && (
          <div className="absolute top-2 right-[11.5rem] z-30 pointer-events-none">
            <Badge className="bg-primary text-white border-0 px-2 py-1">
              <Rocket className="h-3 w-3 mr-1" />
              Promoted
            </Badge>
          </div>
        )}

        <video
          ref={videoRef}
          src={videoSrc ?? undefined}
          poster={splik.thumbnail_url || undefined}
          className="block w-full h-full object-cover"
          autoPlay={false}
          loop={false}
          muted={isMuted}
          playsInline
          controls={false}
          // @ts-expect-error
          webkit-playsinline="true"
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload noplaybackrate noremoteplayback"
          preload="none"   // <<< IMPORTANT: don’t start fetching until we attach src
          data-splik-id={splik.id}
        />

        {/* Mute/Unmute */}
        <button onClick={(e) => { e.stopPropagation(); toggleMute(); }}
          className="absolute bottom-3 right-3 z-50 pointer-events-auto bg-black/60 hover:bg-black/70 rounded-full p-2 ring-1 ring-white/40 shadow-md"
          aria-label={isMuted ? "Unmute" : "Mute"}>
          {isMuted ? <VolumeX className="h-5 w-5 text-white" /> : <Volume2 className="h-5 w-5 text-white" />}
        </button>
      </div>

      {/* CREATOR + MENU */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link to={`/creator/${creatorSlug}`} className="flex items-center space-x-3 group flex-1 min-w-0">
              <Avatar className="h-10 w-10 ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all">
                <AvatarImage src={splik.profile?.avatar_url || undefined} />
                <AvatarFallback>
                  {splik.profile?.display_name?.[0] || splik.profile?.first_name?.[0] || splik.profile?.username?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm group-hover:text-primary transition-colors truncate">
                  {splik.profile?.display_name || splik.profile?.first_name || splik.profile?.username || "Unknown User"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  @{splik.profile?.username || splik.profile?.handle || "unknown"}
                </p>
              </div>
            </Link>

            <FollowButton profileId={splik.user_id}
              username={splik.profile?.username || splik.profile?.handle || splik.profile?.first_name}
              size="sm" variant="default" />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 ml-2 flex-shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={5}>
              {currentUser?.id === splik.user_id && (
                <DropdownMenuItem onClick={() => setShowBoostModal(true)} className="cursor-pointer text-primary">
                  <Rocket className="h-4 w-4 mr-2" />
                  Promote Video
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
                <Copy className="h-4 w-4 mr-2" />
                Copy Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowReportModal(true)} className="cursor-pointer">
                <Flag className="h-4 w-4 mr-2" />
                Report
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() =>
                toast({ title: "User blocked", description: "You won't see content from this user anymore" })
              } className="cursor-pointer">
                <UserX className="h-4 w-4 mr-2" />
                Block User
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center justify-between gap-1">
          <Button variant="ghost" size="sm" onClick={handleSplik} disabled={likePending}
            className={cn("flex items-center space-x-2 transition-colors flex-1", isLiked && "text-red-500 hover:text-red-600")}
            aria-pressed={isLiked}>
            <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
            <span className="text-xs font-medium">{(likesCount ?? 0).toLocaleString()}</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={() => { setShowCommentsModal(true); onReact?.(); }}
            className="flex items-center space-x-2 flex-1 hover:text-blue-500">
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs font-medium">{(commentsCount ?? 0).toLocaleString()}</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={() => { setShowShareModal(true); onShare?.(); }}
            className="flex items-center space-x-2 flex-1 hover:text-green-500">
            <Share2 className="h-4 w-4" />
            <span className="text-xs font-medium">Share</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={async () => {
              if (saving) return;
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) { toast({ title: "Sign in required", description: "Please sign in to save videos", variant: "destructive" }); return; }
              setSaving(true);
              const next = !isSaved;
              setIsSaved(next);
              try {
                if (next) await supabase.from("favorites").insert({ user_id: user.id, splik_id: splik.id });
                else await supabase.from("favorites").delete().eq("user_id", user.id).eq("splik_id", splik.id);
              } finally { setSaving(false); }
            }}
            disabled={saving}
            className={cn("flex items-center space-x-2 transition-colors flex-1", isSaved ? "text-yellow-400 hover:text-yellow-500" : "")}
            aria-pressed={isSaved}>
            {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            <span className="text-xs font-medium">{isSaved ? "Saved" : "Save"}</span>
          </Button>
        </div>

        {/* DESCRIPTION (now visible everywhere) */}
        {splik.description && splik.description.trim() && (
          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words line-clamp-3">
            {splik.description}
          </p>
        )}

        {splik.mood && (
          <div className="mt-3">
            <Badge variant="secondary" className="px-2 py-0.5 text-[10px] rounded-full">
              {toTitle(String(splik.mood))}
            </Badge>
          </div>
        )}

        {(likesCount ?? 0) === 0 && (commentsCount ?? 0) === 0 && (
          <div className="mt-2 text-xs text-muted-foreground text-center italic">
            Be the first to react! 💜
          </div>
        )}
      </div>

      {/* MODALS */}
      <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} videoId={splik.id} videoTitle={splik.title || "Check out this video"} />
      <CommentsModal isOpen={showCommentsModal} onClose={() => setShowCommentsModal(false)} splikId={splik.id} splikTitle={splik.title} />
      <ReportModal isOpen={showReportModal} onClose={() => setShowReportModal(false)} videoId={splik.id} videoTitle={splik.title || splik.description || "Untitled Video"} creatorName={splik.profile?.display_name || splik.profile?.username || "Unknown Creator"} />
      {showBoostModal && <BoostModal isOpen={showBoostModal} onClose={() => setShowBoostModal(false)} splikId={splik.id} videoTitle={splik.title || splik.description} />}
    </div>
  );
}
