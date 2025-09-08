// src/pages/SplikPage.tsx
import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Volume2, VolumeX, Heart, MessageCircle, Share2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fetchClipById } from "@/lib/feed";
import type { FeedItem } from "@/lib/feed";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function SplikPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [row, setRow] = useState<FeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);

  // like state
  const [likesCount, setLikesCount] = useState<number>(0);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [liking, setLiking] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Fetch video row
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
        // seed count for UI; realtime will keep it fresh
        // @ts-ignore tolerate optional fields
        setLikesCount((r?.likes_count as number) ?? 0);
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

    return () => {
      alive = false;
    };
  }, [id, toast]);

  // Page <title> & description (client-side only; crawlers use server OG)
  useEffect(() => {
    if (!row) return;

    const title = row.title ? `${row.title} — Splikz` : "Splik — Splikz";
    const desc = row.description || "Watch this moment on Splikz";

    document.title = title;

    // description
    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", desc);

    // canonical
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

  // Determine if the current user has liked this splik + subscribe to count updates
  useEffect(() => {
    let unsubbed = false;

    (async () => {
      if (!row?.id) return;

      // fetch whether I liked it
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (uid) {
        const { data: likeRow } = await supabase
          .from("likes")
          .select("id")
          .eq("user_id", uid)
          .eq("splik_id", row.id)
          .maybeSingle();
        if (!unsubbed) setIsLiked(Boolean(likeRow));
      } else {
        setIsLiked(false);
      }

      // realtime for likes_count
      const ch = supabase
        .channel(`splik-${row.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "spliks", filter: `id=eq.${row.id}` },
          (p) => {
            // @ts-ignore
            const next = (p.new?.likes_count as number) ?? 0;
            setLikesCount(next);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(ch);
      };
    })();

    return () => {
      unsubbed = true;
    };
  }, [row?.id]);

  const onToggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    setMuted(next);
  };

  const onShare = async () => {
    if (!row) return;
    const origin = window.location.origin;
    const shareUrl = `${origin}/v/${row.id}`; // short OG route
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

  // Like handler: flip only the heart; let realtime update the count
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
    setIsLiked(next); // optimistic heart only

    try {
      if (next) {
        await supabase.from("likes").insert({ user_id: uid, splik_id: row.id });
      } else {
        await supabase.from("likes").delete().eq("user_id", uid).eq("splik_id", row.id);
      }

      // Fallback refresh in case realtime is delayed
      setTimeout(async () => {
        const { data } = await supabase
          .from("spliks")
          .select("likes_count")
          .eq("id", row.id)
          .maybeSingle();
        if (data?.likes_count != null) setLikesCount(data.likes_count);
      }, 400);
    } catch {
      setIsLiked(!next); // revert on error
      toast({ title: "Error", description: "Failed to update like", variant: "destructive" });
    } finally {
      setLiking(false);
    }
  };

  // Autoplay and start at trim_start when metadata is ready
  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !row) return;
    try {
      const start = Math.max(0.1, Number((row as any).trim_start ?? 0));
      if (Number.isFinite(start)) v.currentTime = start;
    } catch {}
    v.play().catch(() => {
      // some browsers require user gesture
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }
  if (!row) return null;

  // Robust poster choice (what we generated at upload time)
  const poster =
    // @ts-ignore tolerate optional fields
    row.thumbnail_url || (row as any).poster_url || undefined;

  const createdAt = row.created_at ? new Date(row.created_at) : new Date();

  return (
    <div className="min-h-[100svh] flex items-center justify-center bg-background p-3">
      <Card className="overflow-hidden border-0 shadow-lg w-full max-w-lg mx-auto">
        {/* header */}
        <div className="flex items-center justify-between p-3 border-b">
          <Link
            to={`/creator/${(row as any).username || row.user_id}`}
            className="flex items-center gap-3 hover:opacity-80"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {((row as any).username || "A").toUpperCase().slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold">
                {(row as any).username ? `@${(row as any).username}` : "Anonymous"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(createdAt, { addSuffix: true })}
              </p>
            </div>
          </Link>
        </div>

        {/* video */}
        <div className="relative bg-black aspect-[9/16] max-h-[700px]">
          <video
            key={String(row.id)} // force refresh when navigating between videos
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
          />
          <button
            onClick={onToggleMute}
            className="absolute bottom-3 right-3 bg-black/50 rounded-full p-2 z-20"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <VolumeX className="h-4 w-4 text-white" />
            ) : (
              <Volume2 className="h-4 w-4 text-white" />
            )}
          </button>
        </div>

        {/* actions + caption */}
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Like"
                onClick={onLike}
                disabled={liking}
                className={isLiked ? "text-red-500 hover:text-red-600" : ""}
              >
                <Heart className={`h-6 w-6 ${isLiked ? "fill-current" : ""}`} />
              </Button>

              <div className="text-sm">{likesCount.toLocaleString()}</div>

              <Button size="icon" variant="ghost" aria-label="Comments">
                <MessageCircle className="h-6 w-6" />
              </Button>
              <Button size="icon" variant="ghost" onClick={onShare} aria-label="Share">
                <Share2 className="h-6 w-6" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {/* tolerate optional field */}
              {((row as any).views_count ?? 0).toLocaleString()} views
            </div>
          </div>

          {row.description && (
            <p className="text-sm">
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
