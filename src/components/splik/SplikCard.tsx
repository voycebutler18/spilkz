// src/components/splik/SplikCard.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Heart,
  Share2,
  Bookmark,
  BookmarkCheck,
  Volume2,
  VolumeX,
  Pause,
  Play,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
};

type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  created_at: string;
  trim_start?: number | null;
  trim_end?: number | null;
  hype_count?: number | null;
  profile?: Profile | null;
};

interface Props {
  splik: Splik;
  className?: string;

  // optional hooks used by some pages — safe to ignore elsewhere
  index?: number;
  shouldLoad?: boolean;
  onPrimaryVisible?: (index: number) => void;

  onReact?: () => void;
  onShare?: () => void;
}

function profilePath(p?: Profile | null, fallbackUserId?: string) {
  if (!p) return `/profile/${fallbackUserId || ""}`;
  return p.username ? `/creator/${p.username}` : `/profile/${p.id || fallbackUserId}`;
}

function displayName(p?: Profile | null) {
  if (!p) return "Unknown";
  return (
    p.display_name ||
    [p.first_name, p.last_name].filter(Boolean).join(" ") ||
    p.username ||
    "Unknown"
  );
}

export default function SplikCard({
  splik,
  className,
  index,
  shouldLoad = true,
  onPrimaryVisible,
  onReact,
  onShare,
}: Props) {
  const [userId, setUserId] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [muted, setMuted] = React.useState(true);
  const [playing, setPlaying] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // who am I
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // check if favorited
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) return;
      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", userId)
        .eq("splik_id", splik.id)
        .maybeSingle();
      if (!cancelled) setSaved(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, splik.id]);

  // minimal mobile-first video setup (prevents black flicker)
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    v.playsInline = true;
    v.setAttribute("webkit-playsinline", "true");
    v.preload = "metadata";
    v.muted = muted;

    const onLoaded = () => {
      if (v.currentTime === 0) v.currentTime = 0.1;
    };
    v.addEventListener("loadeddata", onLoaded, { once: true });

    return () => {
      v.removeEventListener("loadeddata", onLoaded);
      try {
        v.pause();
      } catch {}
    };
  }, [muted]);

  // visible observer (optional)
  React.useEffect(() => {
    if (typeof index !== "number" || !onPrimaryVisible) return;
    const card = videoRef.current?.closest("[data-card]");
    if (!card) return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            onPrimaryVisible(index);
          }
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    obs.observe(card);
    return () => obs.disconnect();
  }, [index, onPrimaryVisible]);

  const togglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      try {
        await v.play();
        setPlaying(true);
      } catch {
        // try muted autoplay as a fallback
        v.muted = true;
        setMuted(true);
        try {
          await v.play();
          setPlaying(true);
        } catch {}
      }
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    setMuted(next);
  };

  const toggleSave = async () => {
    if (!userId) {
      // optional: toast prompt
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      if (saved) {
        await supabase
          .from("favorites")
          .delete()
          .eq("user_id", userId)
          .eq("splik_id", splik.id);
        setSaved(false);
      } else {
        await supabase.from("favorites").insert({ user_id: userId, splik_id: splik.id });
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const initials =
    displayName(splik.profile)
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  return (
    <Card
      data-card
      className={cn(
        "overflow-hidden border-0 shadow-lg w-full max-w-lg mx-auto bg-background",
        className
      )}
    >
      {/* header (avatar + name — clickable) */}
      <div className="flex items-center justify-between p-3 pb-0">
        <Link
          to={profilePath(splik.profile, splik.user_id)}
          className="flex items-center gap-3 hover:opacity-90 transition-opacity"
        >
          <Avatar className="h-9 w-9">
            <AvatarImage src={splik.profile?.avatar_url || undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{displayName(splik.profile)}</p>
            {splik.title ? (
              <p className="text-xs text-muted-foreground truncate">{splik.title}</p>
            ) : null}
          </div>
        </Link>
      </div>

      {/* video — NOTE: object-contain to avoid cutting */}
      <div className="relative bg-black aspect-[9/16] mt-2">
        {shouldLoad !== false ? (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain bg-black"
            src={splik.video_url}
            poster={splik.thumbnail_url || undefined}
            playsInline
            muted={muted}
            onEnded={() => setPlaying(false)}
          />
        ) : (
          <div className="absolute inset-0 bg-black" />
        )}

        {/* center play/pause tap area */}
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center focus:outline-none"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <span className="opacity-0 hover:opacity-100 transition-opacity bg-black/25 rounded-full p-3">
              <Pause className="h-10 w-10 text-white" />
            </span>
          ) : (
            <span className="bg-black/35 rounded-full p-3 hover:bg-black/45 transition-colors">
              <Play className="h-10 w-10 text-white ml-1" />
            </span>
          )}
        </button>

        {/* mute button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          className="absolute bottom-3 right-3 bg-black/60 rounded-full p-2 hover:bg-black/80"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
        </button>
      </div>

      {/* actions: Like / Share / Save */}
      <div className="p-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onReact} className="flex-1">
            <Heart className="h-4 w-4 mr-2" />
            {splik.hype_count ?? 0}
          </Button>

          <Button size="sm" variant="outline" onClick={onShare}>
            <Share2 className="h-4 w-4" />
          </Button>

          {/* Save / Saved (favorites) */}
          <Button
            size="sm"
            variant={saved ? "default" : "outline"}
            onClick={toggleSave}
            disabled={saving}
            title={saved ? "Saved" : "Save"}
          >
            {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          </Button>
        </div>

        {/* description (optional) */}
        {splik.description ? (
          <p className="text-sm mt-3 text-foreground/90">{splik.description}</p>
        ) : null}
      </div>
    </Card>
  );
}
