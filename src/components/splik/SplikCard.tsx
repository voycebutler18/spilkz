// src/components/splik/SplikCard.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Flame, MessageCircle, Share2, MoreVertical, Flag, UserX, Copy,
  Bookmark, BookmarkCheck, Volume2, VolumeX, Rocket, Sparkles, Eye
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

/* ------------------------- Types ------------------------- */
type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;

  // counters on the row
  hype_score?: number | null;
  hype_givers?: number | null;
  comments_count?: number | null;
  views_count?: number | null;        // ← NEW (or view_count / views)

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

/* ---------- helpers ---------- */
const toNum = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export default function SplikCard(props: SplikCardProps) {
  const { splik: rawSplik, onSplik, onReact, onShare } = props;
  if (!rawSplik || !rawSplik.id) return null;

  // normalize
  const splik: Splik = {
    ...rawSplik,
    hype_score: toNum(rawSplik.hype_score, 0),
    hype_givers: toNum(rawSplik.hype_givers, 0),
    comments_count: toNum(rawSplik.comments_count, 0),
    views_count: toNum(
      (rawSplik as any).views_count ?? (rawSplik as any).view_count ?? (rawSplik as any).views,
      0
    ),
    trim_start: toNum(rawSplik.trim_start, 0),
    trim_end: rawSplik.trim_end == null ? null : toNum(rawSplik.trim_end),
  };

  const idx = props.index ?? 0;
  const load = props.shouldLoad ?? true;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // hype
  const [hasHyped, setHasHyped] = useState<boolean>(false);
  const [hypeCount, setHypeCount] = useState<number>(toNum(splik.hype_score, 0));
  const [hypeGivers, setHypeGivers] = useState<number>(toNum(splik.hype_givers, 0));
  const [hypePending, setHypePending] = useState(false);

  // comments
  const [commentsCount, setCommentsCount] = useState<number>(toNum(splik.comments_count, 0));

  // views
  const [viewCount, setViewCount] = useState<number>(toNum(splik.views_count, 0));
  const viewPingSent = useRef(false); // ← ensure we only ping once per mount

  // save
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // modals + user
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // video + device
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const primedRef = useRef(false);

  const { isMobile } = useDeviceType();
  const { toast } = useToast();

  const creatorSlug = splik.profile?.username || splik.profile?.handle || splik.user_id;

  // 3s loop window
  const START = Math.max(0, toNum(splik.trim_start, 0));
  const RAW_END = splik.trim_end == null ? START + 3 : toNum(splik.trim_end, START + 3);
  const END = Math.max(START, Math.min(START + 3, RAW_END));
  const SEEK_SAFE = Math.max(0.05, START + 0.05);

  const fetchCommentCount = useCallback(async () => {
    if (!splik.id) return;
    try {
      const { count } = await supabase
        .from("comments")
        .select("*", { count: "exact", head: true })
        .eq("splik_id", splik.id);
      setCommentsCount(count ?? 0);
    } catch {}
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
        for (const entry of entries) {
          const mostlyVisible = entry.isIntersecting && entry.intersectionRatio >= 0.7;

          if (mostlyVisible) props.onPrimaryVisible?.(idx);

          if (!load) continue;

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
        }
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

  /* ---- loop + view ping on ≥1s ---- */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const sendViewPing = async () => {
      if (viewPingSent.current) return;
      viewPingSent.current = true;
      setViewCount((c) => c + 1); // optimistic
      try {
        // 👇 rename to your actual SQL function if different
        await supabase.rpc("register_view", { p_splik_id: splik.id });
      } catch {
        // if it fails, no big deal; realtime will correct or next play may retry
      }
    };

    const onTimeUpdate = () => {
      // keep the 3s loop
      if (v.currentTime < START || v.currentTime >= END) {
        try { v.currentTime = SEEK_SAFE; } catch {}
      }
      // fire once when they cross 1s into the clip
      if (!viewPingSent.current) {
        // allow tiny epsilon around the 1s mark
        if (v.currentTime >= START + 1 - 0.02) {
          void sendViewPing();
        }
      }
    };

    v.addEventListener("timeupdate", onTimeUpdate);
    return () => v.removeEventListener("timeupdate", onTimeUpdate);
  }, [START, END, SEEK_SAFE, splik.id]);

  // reset "view already sent" whenever this card is re-mounted/refreshed
  useEffect(() => {
    viewPingSent.current = false;
  }, [splik.id]);

  /* ---- user + hype + realtime counters ---- */
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      setCurrentUser(user);

      if (user && splik.id) {
        const { data: row } = await supabase
          .from("hype_reactions")
          .select("splik_id")
          .eq("user_id", user.id)
          .eq("splik_id", splik.id)
          .maybeSingle();
        if (!mounted) return;
        setHasHyped(!!row);

        const { data: favRow } = await supabase
          .from("favorites").select("id").eq("user_id", user.id).eq("splik_id", splik.id).maybeSingle();
        if (!mounted) return;
        setIsSaved(!!favRow);
      } else {
        setHasHyped(false);
        setIsSaved(false);
      }

      await fetchCommentCount();

      // one channel for hype + views + anything else on spliks row
      const rowChannel = supabase
        .channel(`splik-${splik.id}-row`)
        .on(
          "postgres_changes",
          { schema: "public", table: "spliks", event: "UPDATE", filter: `id=eq.${splik.id}` },
          (payload) => {
            const s = payload.new as any;
            if (s.hype_score != null) setHypeCount(toNum(s.hype_score, 0));
            if (s.hype_givers != null) setHypeGivers(toNum(s.hype_givers, 0));
            const vc = s.views_count ?? s.view_count ?? s.views;
            if (vc != null) setViewCount(toNum(vc, 0));
          }
        )
        .subscribe();

      const commentsChannel = supabase
        .channel(`comments-${splik.id}`)
        .on(
          "postgres_changes",
          { schema: "public", table: "comments", event: "*", filter: `splik_id=eq.${splik.id}` },
          fetchCommentCount
        )
        .subscribe();

      return () => {
        supabase.removeChannel(rowChannel);
        supabase.removeChannel(commentsChannel);
      };
    })();

    return () => { mounted = false; };
  }, [splik.id, fetchCommentCount]);

  /* ---- Hype toggle ---- */
  const handleHypeToggle = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (hypePending) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to hype videos", variant: "destructive" });
      return;
    }

    setHypePending(true);
    const goingToHype = !hasHyped;

    // optimistic
    setHasHyped(goingToHype);
    setHypeCount((c) => Math.max(0, c + (goingToHype ? 1 : -1)));
    setHypeGivers((g) => Math.max(0, g + (goingToHype ? 1 : -1)));

    try {
      const { data, error } = await supabase.rpc("toggle_hype", { p_splik_id: splik.id });
      if (error) throw error;
      const row = data?.[0];
      if (row) {
        setHypeCount(Number(row.hype_count) || 0);
        setHasHyped(Boolean(row.user_hyped));
      }
      onSplik?.();
    } catch {
      // revert
      setHasHyped((prev) => !prev);
      setHypeCount((c) => Math.max(0, c + (hasHyped ? 1 : -1)));
      setHypeGivers((g) => Math.max(0, g + (hasHyped ? 1 : -1)));
      toast({ title: "Error", description: "Failed to update hype", variant: "destructive" });
    } finally {
      setHypePending(false);
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
    if (saving || !splik.id) return;
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
    if (!splik.id) return;
    const url = `${window.location.origin.replace(/\/$/,'')}/video/${splik.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: "Share link copied to clipboard" });
  };

  const { isMobile } = useDeviceType();
  const videoHeight = isMobile ? "60svh" : "500px";
  const isBoosted = Boolean((splik as any).isBoosted || (splik as any).is_currently_boosted || (((splik as any).boost_score ?? 0) > 0));
  const isOwner = currentUser && currentUser.id === splik.user_id;

  const avgHype = hypeGivers > 0 ? hypeCount / Math.max(1, hypeGivers) : 0;
  const showTopHypeBadge = hypeGivers >= 10 && avgHype >= 1.0;

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

        {(isBoosted || showTopHypeBadge) && (
          <div className="absolute top-2 right-[11.5rem] z-30 pointer-events-none flex gap-2">
            {isBoosted && (
              <Badge className="bg-primary text-white border-0 px-2 py-1">
                <Rocket className="h-3 w-3 mr-1" />
                Promoted
              </Badge>
            )}
            {showTopHypeBadge && (
              <Badge className="bg-orange-500 text-white border-0 px-2 py-1">
                <Flame className="h-3 w-3 mr-1" />
                Top Hype
              </Badge>
            )}
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
          {/* Hype (toggle) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleHypeToggle}
            disabled={hypePending}
            className={cn(
              "flex items-center gap-2 transition-colors",
              hasHyped && "text-orange-500 hover:text-orange-600"
            )}
            aria-pressed={hasHyped}
            title={hasHyped ? "Un-hype" : "Hype"}
          >
            <Flame className={cn("h-4 w-4", hasHyped && "fill-current")} />
            <span className="text-xs font-semibold">Hype</span>
            <span className="text-xs font-medium tabular-nums">
              {toNum(hypeCount, 0).toLocaleString()}
            </span>
            <span className="text-[10px] text-muted-foreground">
              ({toNum(hypeGivers, 0).toLocaleString()})
            </span>
          </Button>

          {/* Views (read-only display) */}
          <div className="inline-flex items-center gap-2 px-2 py-1 text-muted-foreground">
            <Eye className="h-4 w-4" />
            <span className="text-xs font-medium tabular-nums">{toNum(viewCount, 0).toLocaleString()}</span>
          </div>

          {/* Comments */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowCommentsModal(true); onReact?.(); }}
            className="flex items-center gap-2 hover:text-blue-500"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs font-medium">{toNum(commentsCount, 0).toLocaleString()}</span>
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

        {/* TITLE + DESCRIPTION */}
        {(splik.title || splik.description) && (
          <div className="mt-2 space-y-1">
            {splik.title && (
              <p className="text-sm font-semibold">
                {splik.title}
              </p>
            )}
            {splik.description && (
              <p className="text-sm text-muted-foreground">
                {splik.description}
              </p>
            )}
          </div>
        )}

        {splik.mood && (
          <div className="mt-3">
            <Badge variant="secondary" className="px-2 py-0.5 text-[10px] rounded-full">
              {toTitle(String(splik.mood))}
            </Badge>
          </div>
        )}

        {toNum(hypeGivers, 0) === 0 && toNum(commentsCount, 0) === 0 && (
          <div className="mt-2 text-xs text-muted-foreground text-center italic">
            Be the first to hype this! 🔥
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
          await fetchCommentCount(); // stay in sync
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
    </div>
  );
}
