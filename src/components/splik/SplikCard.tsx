// src/components/splik/SplikCard.tsx
import { useState, useEffect, useRef, useCallback } from "react";
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
import FollowButton from "@/components/FollowButton";
import ShareModal from "@/components/ShareModal";
import CommentsModal from "@/components/CommentsModal";
import ReportModal from "@/components/ReportModal";
import BoostModal from "@/components/BoostModal";
import { useDeviceType } from "@/hooks/use-device-type";
import { useToast } from "@/components/ui/use-toast";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

/* ------------------------- Types ------------------------- */
type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;

  // these may be present on the row; we’ll use them for instant display
  likes_count?: number | null;
  comments_count?: number | null;

  profile?: any;
  mood?: string | null;
  status?: string | null;
  trim_start?: number | null;
  trim_end?: number | null;
};

interface SplikCardProps {
  splik: Splik & { isBoosted?: boolean; is_currently_boosted?: boolean; boost_score?: number };
  onSplik?: () => void;
  onReact?: () => void;
  onShare?: () => void;
  index?: number;
  shouldLoad?: boolean;
  onPrimaryVisible?: (index: number) => void;
}

/* ---- global play/pause coordination ---- */
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

/* ---------------- Likes list modal (read-only) ---------------- */
type LikeRow = {
  user_id: string;
  created_at: string;
  profiles?: {
    id: string;
    username?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    avatar_url?: string | null;
  } | null;
};
const LikesModal: React.FC<{ isOpen: boolean; onClose: () => void; splikId: string }> = ({
  isOpen, onClose, splikId
}) => {
  const [rows, setRows] = useState<LikeRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("likes")
          .select(`
            user_id, created_at,
            profiles:profiles!likes_user_id_fkey(
              id, username, display_name, first_name, avatar_url
            )
          `)
          .eq("splik_id", splikId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setRows(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, splikId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Likes</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No likes yet</div>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => {
                const p = r.profiles;
                const name = p?.display_name || p?.first_name || p?.username || "Unknown";
                const initials = (name.substring(0, 2) || "UU").toUpperCase();
                const href = p?.username ? `/creator/${p.username}` : `/profile/${p?.id || r.user_id}`;
                return (
                  <Link key={`${r.user_id}-${r.created_at}`} to={href} className="flex items-center gap-3 hover:opacity-80">
                    <Avatar className="h-8 w-8">
                      {p?.avatar_url ? <AvatarImage src={p.avatar_url} /> : null}
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="text-sm">{name}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

/* ============================ Card ============================ */
export default function SplikCard(props: SplikCardProps) {
  const { splik, onSplik, onReact, onShare } = props;
  const idx = props.index ?? 0;
  const load = props.shouldLoad ?? true;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const [isLiked, setIsLiked] = useState(false);
  // seed counters from row to avoid “0 flash”, then hydrate from exact counts
  const [likesCount, setLikesCount] = useState<number>(splik.likes_count ?? 0);
  const [commentsCount, setCommentsCount] = useState<number>(splik.comments_count ?? 0);

  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [likePending, setLikePending] = useState(false);

  const [showShareModal, setShowShareModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [showLikesModal, setShowLikesModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const primedRef = useRef(false);

  const { isMobile } = useDeviceType();
  const { toast } = useToast();

  const creatorSlug = splik.profile?.username || splik.profile?.handle || splik.user_id;

  // 3s loop window
  const START = Math.max(0, Number(splik.trim_start ?? 0));
  const RAW_END = Number.isFinite(Number(splik.trim_end)) ? Number(splik.trim_end) : START + 3;
  const END = Math.max(START, Math.min(START + 3, RAW_END));
  const SEEK_SAFE = Math.max(0.05, START + 0.05);

  /* ---------- helpers ---------- */
  const fetchExactCounts = useCallback(async () => {
    try {
      const [{ count: likes0 }, { count: comments0 }] = await Promise.all([
        supabase.from("likes").select("*", { count: "exact", head: true }).eq("splik_id", splik.id),
        supabase.from("comments").select("*", { count: "exact", head: true }).eq("splik_id", splik.id),
      ]);
      setLikesCount(likes0 ?? 0);
      setCommentsCount(comments0 ?? 0);
    } catch {
      // keep previous values if count fails
    }
  }, [splik.id]);

  /* ---- autoplay / visibility ---- */
  useEffect(() => {
    const video = videoRef.current;
    const el = cardRef.current;
    if (!video || !el) return;

    if (!load) {
      pauseIfCurrent(video);
      video.muted = true;
      setIsPlaying(false);
    }

    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    // @ts-expect-error
    video.setAttribute("webkit-playsinline", "true");
    video.muted = isMuted;
    if (isMuted) video.setAttribute("muted", "true");
    video.controls = false;

    const onVisibilityChange = () => {
      if (document.hidden) {
        pauseIfCurrent(video);
        setIsPlaying(false);
      }
    };

    const primeToStart = () => {
      if (!video.duration || video.duration <= 0) return;
      try { video.currentTime = SEEK_SAFE; primedRef.current = true; } catch {}
    };

    const onLoadedMetadata = () => {
      if (load) primeToStart();
    };

    const io = new IntersectionObserver(
      async (entries) => {
        entries.forEach(async (entry) => {
          const mostlyVisible = entry.isIntersecting && entry.intersectionRatio >= 0.7;
          if (mostlyVisible && props.onPrimaryVisible) props.onPrimaryVisible(idx);
          if (!load) return;

          if (mostlyVisible) {
            try { if (!primedRef.current) primeToStart(); else video.currentTime = SEEK_SAFE; } catch {}
            video.muted = isMuted;
            if (isMuted) video.setAttribute("muted", "true"); else video.removeAttribute("muted");
            try { await playExclusive(video); setIsPlaying(true); } catch { setIsPlaying(false); }
          } else {
            pauseIfCurrent(video);
            video.muted = true; video.setAttribute("muted", "true");
            setIsPlaying(false);
          }
        });
      },
      { threshold: [0, 0.25, 0.5, 0.7, 1], rootMargin: "0px 0px -10% 0px" }
    );

    io.observe(el);
    document.addEventListener("visibilitychange", onVisibilityChange);
    video.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      pauseIfCurrent(video);
      primedRef.current = false;
    };
  }, [isMuted, START, END, SEEK_SAFE, load, idx, props.onPrimaryVisible]);

  // enforce 3s loop
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

  useEffect(() => {
    if (load) {
      primedRef.current = false;
      try { videoRef.current?.load(); } catch {}
    } else {
      pauseIfCurrent(videoRef.current);
      setIsPlaying(false);
    }
  }, [load]);

  /* ---- state: user + exact counts + realtime (recount, not +/-1) ---- */
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      setCurrentUser(user);

      // user-specific flags
      if (user) {
        const { data: likeRow } = await supabase
          .from("likes").select("id").eq("user_id", user.id).eq("splik_id", splik.id).maybeSingle();
        if (!mounted) return;
        setIsLiked(!!likeRow);

        const { data: favRow } = await supabase
          .from("favorites").select("id").eq("user_id", user.id).eq("splik_id", splik.id).maybeSingle();
        if (!mounted) return;
        setIsSaved(!!favRow);
      } else {
        setIsLiked(false);
        setIsSaved(false);
      }

      // hydrate exact counts right away (after showing row's values)
      await fetchExactCounts();

      // realtime listeners that re-count (no drift / no double add)
      const likesChannel = supabase
        .channel(`likes-${splik.id}`)
        .on(
          "postgres_changes",
          { schema: "public", table: "likes", event: "*", filter: `splik_id=eq.${splik.id}` },
          fetchExactCounts
        )
        .subscribe();

      const commentsChannel = supabase
        .channel(`comments-${splik.id}`)
        .on(
          "postgres_changes",
          { schema: "public", table: "comments", event: "*", filter: `splik_id=eq.${splik.id}` },
          fetchExactCounts
        )
        .subscribe();

      return () => {
        supabase.removeChannel(likesChannel);
        supabase.removeChannel(commentsChannel);
      };
    })();

    return () => { mounted = false; };
  }, [splik.id, fetchExactCounts]);

  /* ---- like / unlike ---- */
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

    // optimistic
    setIsLiked(wantLike);
    setLikesCount((p) => Math.max(0, (p ?? 0) + (wantLike ? 1 : -1)));

    try {
      if (wantLike) {
        await supabase.from("likes").upsert(
          { user_id: user.id, splik_id: splik.id },
          { onConflict: "user_id,splik_id", ignoreDuplicates: true }
        );
      } else {
        await supabase.from("likes").delete().eq("user_id", user.id).eq("splik_id", splik.id);
      }
      await fetchExactCounts(); // snap to truth
      onSplik?.();
    } catch {
      setIsLiked((prev) => !prev);
      setLikesCount((p) => Math.max(0, (p ?? 0) + (wantLike ? -1 : 1)));
      toast({ title: "Error", description: "Failed to update like", variant: "destructive" });
    } finally {
      setLikePending(false);
    }
  };

  const handlePlayToggle = async () => {
    const video = videoRef.current;
    if (!video || !load) return;
    if (isPlaying) {
      if (isMuted) { video.muted = false; video.removeAttribute("muted"); setIsMuted(false); return; }
      pauseIfCurrent(video); setIsPlaying(false);
    } else {
      try { video.currentTime = SEEK_SAFE; } catch {}
      if (isMuted) { video.muted = false; video.removeAttribute("muted"); setIsMuted(false); }
      await playExclusive(video); setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current; if (!video) return;
    const next = !isMuted; video.muted = next;
    if (next) video.setAttribute("muted", "true"); else video.removeAttribute("muted");
    setIsMuted(next);
  };

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
        toast({ title: "Added to favorites", description: "Video saved to your favorites" });
      } else {
        await supabase.from("favorites").delete().eq("user_id", user.id).eq("splik_id", splik.id);
        toast({ title: "Removed from favorites", description: "Video removed from your favorites" });
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
    toast({ title: "Link copied", description: "Share link copied to clipboard" });
  };

  const videoHeight = isMobile ? "60svh" : "500px";
  const isBoosted = Boolean((splik as any).isBoosted || (splik as any).is_currently_boosted || (((splik as any).boost_score ?? 0) > 0));
  const isOwner = currentUser && currentUser.id === splik.user_id;

  return (
    <div
      ref={cardRef}
      data-splik-id={splik.id}
      id={`splik-${splik.id}`}
      className={cn(
        "relative isolate bg-card rounded-xl overflow-hidden shadow-lg border border-border w-full max-w-[500px] mx-auto",
        isBoosted && "ring-2 ring-primary/50"
      )}
    >
      {/* VIDEO */}
      <div
        className="relative bg-black overflow-hidden group rounded-t-xl -mt-px"
        style={{ height: videoHeight, maxHeight: "80svh" }}
        onClick={handlePlayToggle}
      >
        <div className="pointer-events-none absolute left-0 right-0 -top-px h-5 bg-black z-10 rounded-t-xl" />
        <div className="absolute top-2 left-3 z-30 pointer-events-none">
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1 bg-black/80 backdrop-blur-sm shadow-md">
            <Sparkles className="h-4 w-4 text-white/80" />
            <span className="text-sm font-bold text-white">Feed</span>
          </div>
        </div>

        {isOwner && (
          <div className="absolute top-2 right-3 z-40">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowBoostModal(true); }}
              className="relative flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold bg-white text-black shadow-lg ring-1 ring-black/10 hover:bg-white/90 transition-colors"
            >
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
          src={load ? splik.video_url : undefined}
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
          preload={load ? "metadata" : "none"}
          data-splik-id={splik.id}
          data-video-id={splik.id}
        />

        {/* Mute/Unmute */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleMute(); }}
          className="absolute bottom-3 right-3 z-50 pointer-events-auto bg-black/60 hover:bg-black/70 rounded-full p-2 ring-1 ring-white/40 shadow-md"
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
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
              username={splik.profile?.username || splik.profile?.handle || splik.profile?.first_name}
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
              <DropdownMenuItem
                onClick={() => toast({ title: "User blocked", description: "You won't see content from this user anymore" })}
                className="cursor-pointer"
              >
                <UserX className="h-4 w-4 mr-2" />
                Block User
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center justify-between gap-1">
          {/* Like toggle (heart) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSplik}
            disabled={likePending}
            className={cn("flex items-center gap-2 transition-colors",
              isLiked && "text-red-500 hover:text-red-600")}
            aria-pressed={isLiked}
          >
            <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
            {/* open likes list when clicking the number */}
            <span
              className="text-xs font-medium hover:underline"
              onClick={(e) => { e.stopPropagation(); setShowLikesModal(true); }}
              title="View who liked"
            >
              {(likesCount ?? 0).toLocaleString()}
            </span>
          </Button>

          {/* Comments */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowCommentsModal(true); onReact?.(); }}
            className="flex items-center gap-2 hover:text-blue-500"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs font-medium">{(commentsCount ?? 0).toLocaleString()}</span>
          </Button>

          {/* Share */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowShareModal(true); onShare?.(); }}
            className="flex items-center gap-2 hover:text-green-500"
          >
            <Share2 className="h-4 w-4" />
            <span className="text-xs font-medium">Share</span>
          </Button>

          {/* Save */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFavorite}
            disabled={saving}
            className={cn("flex items-center gap-2 transition-colors",
              isSaved ? "text-yellow-400 hover:text-yellow-500" : "")}
            aria-pressed={isSaved}
          >
            {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            <span className="text-xs font-medium">{isSaved ? "Saved" : "Save"}</span>
          </Button>
        </div>

        {splik.description && <p className="mt-2 text-sm">{splik.description}</p>}

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
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        videoId={splik.id}
        videoTitle={splik.title || "Check out this video"}
      />

      <CommentsModal
        isOpen={showCommentsModal}
        onClose={async () => {
          setShowCommentsModal(false);
          await fetchExactCounts(); // keep the number in sync with what the modal actually shows
        }}
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

      {/* Likes list (works logged out) */}
      <LikesModal
        isOpen={showLikesModal}
        onClose={() => setShowLikesModal(false)}
        splikId={splik.id}
      />
    </div>
  );
}
