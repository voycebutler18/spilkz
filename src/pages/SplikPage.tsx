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

export default function SplikPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [row, setRow] = useState<FeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);

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
      } catch (e) {
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
  }, [id]);

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

    // canonical (helps normal browsers; server already injects for crawlers)
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
    const shareUrl = `${origin}/v/${row.id}`; // <-- short OG route that unfurls correctly
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied!", description: shareUrl });
    } catch {
      toast({ title: "Couldn’t copy link", description: shareUrl, variant: "destructive" });
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
      // some browsers require user gesture; keep muted true so a tap will play
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
            to={`/creator/${row.username || row.user_id}`}
            className="flex items-center gap-3 hover:opacity-80"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {(row.username || "A").toUpperCase().slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold">
                {row.username ? `@${row.username}` : "Anonymous"}
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
              <Button size="icon" variant="ghost" aria-label="Like">
                <Heart className="h-6 w-6" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Comments">
                <MessageCircle className="h-6 w-6" />
              </Button>
              <Button size="icon" variant="ghost" onClick={onShare} aria-label="Share">
                <Share2 className="h-6 w-6" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {(row as any).views_count ?? 0} views
            </div>
          </div>

          {row.description && (
            <p className="text-sm">
              <span className="font-semibold mr-2">
                {row.username ? `@${row.username}` : "Anonymous"}
              </span>
              {row.description}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
