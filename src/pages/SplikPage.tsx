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
import { useToast } from "@/hooks/use-toast";

export default function SplikPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [s, setS] = useState<FeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const row = await fetchClipById(id!);
        if (alive) setS(row);
      } catch {
        toast({ title: "Not found", description: "This video doesn't exist.", variant: "destructive" });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  // Set title and description without Helmet
  useEffect(() => {
    if (!s) return;
    const title = s.title ? `${s.title} — Splikz` : "Splik — Splikz";
    const desc = s.description || "Watch this moment on Splikz";

    document.title = title;

    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
  }, [s]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }
  if (!s) return null;

  return (
    <div className="min-h-[100svh] flex items-center justify-center bg-background p-3">
      <Card className="overflow-hidden border-0 shadow-lg w-full max-w-lg mx-auto">
        {/* header */}
        <div className="flex items-center justify-between p-3 border-b">
          <Link to={`/creator/${s.username || s.user_id}`} className="flex items-center gap-3 hover:opacity-80">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{(s.username || "A").toUpperCase().slice(0,2)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold">{s.username ? `@${s.username}` : "Anonymous"}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
              </p>
            </div>
          </Link>
        </div>

        {/* video */}
        <div className="relative bg-black aspect-[9/16] max-h-[700px]">
          <video
            ref={videoRef}
            src={s.video_url}
            poster={s.thumb_url ?? undefined}
            className="w-full h-full object-cover"
            playsInline
            muted={muted}
            // @ts-expect-error vendor attr
            webkit-playsinline="true"
            preload="metadata"
            autoPlay
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (v) {
                try { v.currentTime = Math.max(0.1, Number(s.trim_start ?? 0)); } catch {}
                v.play().catch(() => {});
              }
            }}
          />
          <button
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.muted = !muted;
              setMuted(!muted);
            }}
            className="absolute bottom-3 right-3 bg-black/50 rounded-full p-2 z-20"
          >
            {muted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
          </button>
        </div>

        {/* actions + caption */}
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button size="icon" variant="ghost"><Heart className="h-6 w-6" /></Button>
              <Button size="icon" variant="ghost"><MessageCircle className="h-6 w-6" /></Button>
              <Button
                size="icon" variant="ghost"
                onClick={() => {
                  const url = window.location.href;
                  navigator.clipboard.writeText(url);
                  toast({ title: "Link copied!" });
                }}
              >
                <Share2 className="h-6 w-6" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {s.views_count ?? 0} views
            </div>
          </div>

          {s.description && (
            <p className="text-sm">
              <span className="font-semibold mr-2">{s.username ? `@${s.username}` : "Anonymous"}</span>
              {s.description}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
