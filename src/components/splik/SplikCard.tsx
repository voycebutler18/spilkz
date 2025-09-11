// src/components/splik/SplikCard.tsx
import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Share2, Heart, Volume2, VolumeX } from "lucide-react";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  created_at?: string;
  trim_start?: number | null;
  trim_end?: number | null;
  likes_count?: number;
  profile?: Profile;
};

type Props = {
  splik: Splik;
  index?: number;
  // optional hooks used in some places
  shouldLoad?: boolean;
  onPrimaryVisible?: (index: number) => void;
  onSplik?: () => void;
  onReact?: () => void;
  onShare?: () => void;
};

const isTouch =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || (navigator as any).maxTouchPoints > 0);

export default function SplikCard({
  splik,
  index = 0,
  onReact,
  onShare,
}: Props) {
  const vRef = React.useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = React.useState<boolean>(isTouch ? true : false);

  // Seek slightly off 0 to avoid black first frame
  const seekNonZero = React.useCallback((v: HTMLVideoElement) => {
    const start = Number(splik.trim_start ?? 0);
    const t = start ? Math.max(0.05, start) : 0.1;
    try {
      if (v.currentTime === 0) v.currentTime = t;
    } catch {}
  }, [splik.trim_start]);

  React.useEffect(() => {
    const v = vRef.current;
    if (!v) return;

    // harden video for mobile autoplay
    v.setAttribute("playsinline", "true");
    // @ts-ignore
    v.setAttribute("webkit-playsinline", "true");
    v.disablePictureInPicture = true;
    v.preload = "metadata";
    v.crossOrigin = "anonymous";
    v.muted = muted;

    const onLoadedMeta = () => seekNonZero(v);

    const onPlayRecovery = () => {
      // If we somehow got audio-only (width/height 0), try to jog the decoder.
      if ((v.videoWidth === 0 || v.videoHeight === 0) && !v.paused) {
        try {
          const cur = v.currentTime;
          v.pause();
          v.currentTime = Math.max(0.12, cur + 0.12);
          // small async wait before resuming
          setTimeout(() => {
            v.play().catch(() => {});
          }, 80);
        } catch {}
      }
    };

    v.addEventListener("loadedmetadata", onLoadedMeta);
    v.addEventListener("play", onPlayRecovery);

    // initial nudge
    if (v.readyState >= 1) seekNonZero(v);

    return () => {
      v.removeEventListener("loadedmetadata", onLoadedMeta);
      v.removeEventListener("play", onPlayRecovery);
    };
  }, [muted, seekNonZero]);

  const toggleMute = () => {
    const v = vRef.current;
    if (!v) return;
    v.muted = !muted;
    setMuted(v.muted);
  };

  return (
    <Card className="overflow-hidden border-0 shadow-lg w-full max-w-lg mx-auto">
      {/* video */}
      <div className="relative bg-black aspect-[9/16] max-h-[600px]">
        <video
          key={splik.id}
          ref={vRef}
          src={splik.video_url}
          poster={splik.thumbnail_url ?? undefined}
          className="w-full h-full object-cover"
          playsInline
          // important: do not auto preload data—metadata only
          preload="metadata"
          muted={muted}
          // keep the background black during decode
          style={{
            backgroundColor: "#000",
            WebkitBackfaceVisibility: "hidden",
            backfaceVisibility: "hidden",
            transform: "translateZ(0)", // force GPU layer on iOS
          }}
        />

        {/* mute toggle */}
        <button
          onClick={toggleMute}
          className="absolute bottom-3 right-3 bg-black/55 rounded-full p-2 z-20 hover:bg-black/70 transition-colors"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <VolumeX className="h-4 w-4 text-white" />
          ) : (
            <Volume2 className="h-4 w-4 text-white" />
          )}
        </button>
      </div>

      {/* actions (no comments) */}
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            className="hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950 dark:hover:text-red-400"
            onClick={onReact}
          >
            <Heart className="h-4 w-4 mr-2" />
            {(splik.likes_count ?? 0).toLocaleString()}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={onShare}
            className="px-3 hover:bg-green-50 hover:text-green-600 hover:border-green-200 dark:hover:bg-green-950 dark:hover:text-green-400"
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            {splik.profile?.avatar_url ? (
              <AvatarImage src={splik.profile?.avatar_url} />
            ) : (
              <AvatarFallback>
                {(splik.profile?.display_name || splik.profile?.username || "U")
                  .slice(0, 1)
                  .toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="text-sm font-semibold">
            {splik.profile?.display_name || splik.profile?.username || "User"}
          </div>
        </div>
      </div>
    </Card>
  );
}
