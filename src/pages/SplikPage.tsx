// src/pages/SplikPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Volume2, VolumeX, Heart, MessageCircle, Share2, ChevronLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fetchClipById } from "@/lib/feed";
import type { FeedItem } from "@/lib/feed";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

/**
 * Video detail page with:
 * - Optimistic like toggle + realtime count
 * - Neon/glass UI tuned for mobile
 * - Top loading bar that fills as the video buffers
 * - Better skeleton state
 */
export default function SplikPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [row, setRow] = useState<FeedItem | null>(null);
  const [loading, setLoading] = useState(true);

  // like state
  const [likesCount, setLikesCount] = useState<number>(0);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [liking, setLiking] = useState<boolean>(false);

  // video state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [bufferPct, setBufferPct] = useState(0);     // top progress bar
  const [isBuffering, setIsBuffering] = useState(true);

  // ---------- load row ----------
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setRow(null);

    (async () => {
      try {
        if (!id) throw new Error("missing id");
        const r = await fetchClipById(id);
        if (!alive) return;

        if (!r) {
          toast({
            title: "Not found",
            description: "This video doesn't exist.",
            variant: "destructive",
          });
        }

        setRow(r ?? null);

        // seed visible count (supports likes_count or hype_count)
        // @ts-ignore tolerate optional fields
        const seedLikes = (r?.likes_count as number) ?? (r?.hype_count as number) ?? 0;
        setLikesCount(seedLikes);
      } catch {
        if (!alive) return;
        toast({
          title: "Not found",
          description: "This video doesn't exist.",
          variant: "destructive",
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [id, toast]);

  // ---------- page metadata ----------
  useEffect(() => {
    if (!row) return;

    const title = row.title ? `${row.title} — Splikz` : "Splik — Splikz";
    const desc = row.description || "Watch this moment on Splikz";
    document.title = title;

    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", desc);

    const base = window.location.origin;
    const canonicalHref = `${base}/video/${row.id}`;
    let linkCanon = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!linkCanon) {
      linkCanon = document.createElement("link");
      linkCanon.setAttribute("rel", "canonical");
      document.head.appendChild(linkCanon);
    }
    linkCanon.setAttribute("href", canonicalHref);
  }, [row]);

  // ---------- liked-by-me + realtime like count ----------
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      if (!row?.id) return;

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;

      if (uid) {
        const { data: likeRow } = await supabase
          .from("likes")
          .select("id")
          .eq("user_id", uid)
          .eq("splik_id", row.id)
          .maybeSingle();
        setIsLiked(Boolean(likeRow));
      } else {
        setIsLiked(false);
      }

      // live updates for likes_count/hype_count
      const ch = supabase
        .channel(`splik-${row.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "spliks", filter: `id=eq.${row.id}` },
          (p) => {
            const next =
              // @ts-ignore
              (typeof p.new?.likes_count === "number" && p.new.likes_count) ||
              // @ts-ignore
              (typeof p.new?.hype_count === "number" && p.new.hype_count) ||
              0;
            setLikesCount(next);
          }
        )
        .subscribe();

      cleanup = () => supabase.removeChannel(ch);
    })();

    return () => { cleanup?.(); };
  }, [row?.id]);

  // ---------- handlers ----------
  const onToggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    setMuted(next);
  };

  const shareUrl = useMemo(() => {
    if (!row?.id) return window.location.href;
    const origin = window.location.origin.replace(/\/$/, "");
    return `${origin}/v/${row.id}`;
  }, [row?.id]);

  const onShare = async () => {
    if (!row) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: row.title || "Splik", url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: "Link copied!", description: shareUrl });
      }
    } catch {
      toast({ title: "Couldn’t share", description: shareUrl, variant: "destructive" });
    }
  };

  // Optimistic heart; realtime refreshes the count
  const onLike = async () => {
    if (liking || !row?.id) return;
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like videos",
        variant: "destructive",
      });
      return;
    }

    setLiking(true);
    const next = !isLiked;
    setIsLiked(next);

    try {
      if (next) {
        await supabase.from("likes").insert({ user_id: uid, splik_id: row.id });
      } else {
        await supabase.from("likes").delete().eq("user_id", uid).eq("splik_id", row.id);
      }

      // fallback refresh
      setTimeout(async () => {
        const { data } = await supabase
          .from("spliks")
          .select("likes_count, hype_count")
          .eq("id", row.id)
          .maybeSingle();
        const n = (data?.likes_count ?? data?.hype_count ?? 0) as number;
        if (Number.isFinite(n)) setLikesCount(n);
      }, 450);
    } catch {
      setIsLiked(!next);
      toast({ title: "Error", description: "Failed to update like", variant: "destructive" });
    } finally {
      setLiking(false);
    }
  };

  // video events: trim start + progress bar
  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !row) return;
    try {
      const start = Math.max(0.1, Number((row as any).trim_start ?? 0));
      if (Number.isFinite(start)) v.currentTime = start;
    } catch {}
    v.play().catch(() => {});
  };

  const handleProgress = () => {
    const v = videoRef.current;
    if (!v || !v.duration || !v.buffered?.length) return;
    const end = v.buffered.end(v.buffered.length - 1);
    const pct = Math.max(0, Math.min(1, end / v.duration));
    setBufferPct(pct * 100);
  };

  const handleWaiting = () => setIsBuffering(true);
  const handlePlaying = () => { setIsBuffering(false); setBufferPct(100); };

  // ---------- UI ----------
  if (loading) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center bg-gradient-to-b from-background to-black/60">
        <div className="w-full max-w-lg mx-auto px-3">
          <div className="h-2 w-40 bg-primary/20 rounded-full mb-4 animate-pulse" />
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/40 backdrop-blur-xl">
            <div className="h-12 border-b border-white/10 flex items-center px-4">
              <div className="h-6 w-6 rounded-full bg-white/10 mr-3 animate-pulse" />
              <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
            </div>
            <div className="aspect-[9/16] bg-white/5 animate-pulse" />
            <div className="h-16 px-4 py-3 border-t border-white/10">
              <div className="h-4 w-2/3 bg-white/10 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!row) return null;

  const poster =
    // @ts-ignore optional
    row.thumbnail_url || (row as any).poster_url || undefined;
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();

  return (
    <div className="min-h-[100svh] flex items-center justify-center bg-gradient-to-b from-background via-background/80 to-black/70 p-3">
      <Card className="relative overflow-hidden border border-white/10 bg-slate-900/50 backdrop-blur-xl shadow-[0_0_60px_-20px_rgba(124,58,237,0.6)] w-full max-w-lg mx-auto rounded-2xl">
        {/* Top neon loading bar (buffers) */}
        <div
          className="absolute top-0 left-0 h-1 bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-400 transition-[width] duration-300"
          style={{ width: `${isBuffering ? Math.max(bufferPct, 12) : bufferPct}%` }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <Link
            to="/home"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Link>

          <Link
            to={`/creator/${(row as any).username || row.user_id}`}
            className="flex items-center gap-3 hover:opacity-90"
          >
            <Avatar className="h-8 w-8 ring-2 ring-purple-500/40">
              <AvatarFallback>
                {((row as any).username || "A").toUpperCase().slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="text-right">
              <p className="text-sm font-semibold">
                {(row as any).username ? `@${(row as any).username}` : "Anonymous"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(createdAt, { addSuffix: true })}
              </p>
            </div>
          </Link>
        </div>

        {/* Video */}
        <div className="relative bg-black aspect-[9/16] max-h-[84vh]">
          <video
            key={String(row.id)}
            ref={videoRef}
            src={row.video_url}
            poster={poster}
            className="w-full h-full object-cover"
            playsInline
            muted={muted}
            // @ts-expect-error vendor attr
            webkit-playsinline="true"
            preload="metadata"
            autoPlay
            onLoadedMetadata={handleLoadedMetadata}
            onProgress={handleProgress}
            onWaiting={handleWaiting}
            onPlaying={handlePlaying}
          />
          {/* mute */}
          <button
            onClick={onToggleMute}
            className="absolute bottom-3 right-3 bg-black/60 rounded-full p-2 z-20 hover:bg-black/80 transition-colors"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
          </button>

          {/* floating gradient badge when buffering */}
          {isBuffering && (
            <div className="absolute top-3 right-3 px-2 py-1 text-[11px] rounded-full bg-gradient-to-r from-fuchsia-600/80 to-cyan-500/80 text-white shadow">
              Loading…
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-3 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Like"
                onClick={onLike}
                disabled={liking}
                className={`hover:text-red-500 ${isLiked ? "text-red-500" : ""}`}
              >
                <Heart className={`h-6 w-6 ${isLiked ? "fill-current" : ""}`} />
              </Button>
              <div className="text-sm font-medium tabular-nums">{likesCount.toLocaleString()}</div>

              <Button size="icon" variant="ghost" aria-label="Comments">
                <MessageCircle className="h-6 w-6" />
              </Button>

              <Button size="icon" variant="ghost" onClick={onShare} aria-label="Share">
                <Share2 className="h-6 w-6" />
              </Button>
            </div>

            <div className="text-[11px] text-muted-foreground">
              {((row as any).views_count ?? 0).toLocaleString()} views
            </div>
          </div>

          {row.description && (
            <p className="text-sm leading-snug">
              <span className="font-semibold mr-2">
                {(row as any).username ? `@${(row as any).username}` : "Anonymous"}
              </span>
              {row.description}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
