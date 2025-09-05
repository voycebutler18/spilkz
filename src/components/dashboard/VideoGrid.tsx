// src/components/dashboard/VideoGrid.tsx
import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Play, Pause, Volume2, VolumeX, Heart, MessageCircle, Share2, Eye, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import DeleteSplikButton from "@/components/dashboard/DeleteSplikButton";

interface Profile {
  username: string;
  display_name: string;
  avatar_url?: string;
}

interface Splik {
  id: string;
  video_url: string;
  thumbnail_url?: string;
  title?: string;
  description?: string;
  views: number;
  likes_count: number;
  comments_count: number;
  created_at: string;
  user_id: string;
  profile?: Profile | null; // for dashboard usage
  profiles?: Profile;       // for explore/feeds usage
}

interface VideoGridProps {
  spliks: Splik[];
  showCreatorInfo?: boolean;
  showDelete?: boolean;                  // NEW: show delete button per card
  onDeleted?: (id: string) => void;      // NEW: callback after delete
}

export default function VideoGrid({
  spliks,
  showCreatorInfo = true,
  showDelete = false,
  onDeleted,
}: VideoGridProps) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<Record<string, { views: number; likes: number; comments: number }>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({});

  useEffect(() => {
    const s: typeof stats = {};
    spliks.forEach(v => {
      s[v.id] = {
        views: v.views || 0,
        likes: v.likes_count || 0,
        comments: v.comments_count || 0,
      };
    });
    setStats(s);
  }, [spliks]);

  const togglePlay = async (id: string) => {
    const el = videoRefs.current[id];
    if (!el) return;

    if (playing === id) {
      el.pause();
      setPlaying(null);
    } else {
      if (playing && videoRefs.current[playing]) {
        videoRefs.current[playing].pause();
      }
      el.currentTime = 0;
      el.muted = muted.has(id);
      try {
        await el.play();
        setPlaying(id);
      } catch {
        el.muted = true;
        setMuted(new Set(m => m.add(id)));
        await el.play().catch(() => {});
        setPlaying(id);
      }
    }
  };

  const toggleMute = (id: string) => {
    const el = videoRefs.current[id];
    if (!el) return;
    const m = new Set(muted);
    if (m.has(id)) {
      m.delete(id);
      el.muted = false;
    } else {
      m.add(id);
      el.muted = true;
    }
    setMuted(m);
  };

  const share = (v: Splik) => {
    const url = `${window.location.origin}/video/${v.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  const creator = (v: Splik) => v.profile || v.profiles || null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {spliks.map((v) => (
        <Card key={v.id} className="overflow-hidden shadow-sm hover:shadow-md transition">
          <div className="relative aspect-[9/16] bg-black">
            <video
              ref={(el) => { if (el) videoRefs.current[v.id] = el; }}
              src={v.video_url}
              poster={v.thumbnail_url || undefined}
              className="w-full h-full object-cover"
              playsInline
            />
            <button
              className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition"
              onClick={() => togglePlay(v.id)}
            >
              {playing === v.id ? (
                <Pause className="h-10 w-10 text-white" />
              ) : (
                <Play className="h-10 w-10 text-white ml-1" />
              )}
            </button>

            <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
              <Eye className="h-3.5 w-3.5" />
              {(stats[v.id]?.views || 0).toLocaleString()}
            </div>

            {playing === v.id && (
              <button
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-2"
                onClick={(e) => { e.stopPropagation(); toggleMute(v.id); }}
              >
                {muted.has(v.id) ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            )}
          </div>

          {/* Header (creator) */}
          {showCreatorInfo && creator(v) && (
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <Link to={`/creator/${creator(v)!.username}`} className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={creator(v)!.avatar_url} />
                  <AvatarFallback>{(creator(v)!.display_name || creator(v)!.username).charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="text-sm">
                  <div className="font-medium leading-4">{creator(v)!.display_name || creator(v)!.username}</div>
                  <div className="text-xs text-muted-foreground">@{creator(v)!.username}</div>
                </div>
              </Link>
            </div>
          )}

          {/* Body */}
          <div className="px-3 py-3 space-y-2">
            {v.title && <div className="font-semibold text-sm line-clamp-2">{v.title}</div>}
            {v.description && (
              <div className="text-sm text-muted-foreground line-clamp-2">{v.description}</div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" variant="outline" className="flex-1">
                <Heart className="h-4 w-4 mr-2" />
                {(stats[v.id]?.likes || 0).toLocaleString()}
              </Button>
              <Button size="sm" variant="outline" className="flex-1">
                <MessageCircle className="h-4 w-4 mr-2" />
                {(stats[v.id]?.comments || 0).toLocaleString()}
              </Button>
              <Button size="sm" variant="outline" onClick={() => share(v)}>
                <Share2 className="h-4 w-4" />
              </Button>
            </div>

            {/* NEW: per-card Delete (only when showDelete=true) */}
            {showDelete && (
              <div className="pt-2">
                <DeleteSplikButton
                  splikId={v.id}
                  videoUrl={v.video_url}
                  thumbnailUrl={v.thumbnail_url}
                  onDeleted={() => onDeleted?.(v.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DeleteSplikButton>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
