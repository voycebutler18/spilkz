// src/components/splik/SplikCard.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Flame,
  Share2,
  Bookmark,
  BookmarkCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  avatar_url?: string | null;
};

type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  trim_start?: number | null;
  trim_end?: number | null;
  created_at?: string;
  hype_count?: number; // optional incoming
  profile?: Profile | null;
};

type Props = {
  splik: Splik;
  /** Optional — used by Index.tsx for primary visible item tracking */
  index?: number;
  /** Optional — Index.tsx passes this to lazy-attach src */
  shouldLoad?: boolean;
  /** Optional — Index.tsx passes this so it can track active window */
  onPrimaryVisible?: (index: number) => void;
  /** Optional — Explore/Index may pass these callbacks */
  onSlik?: () => void;
  onReact?: () => void;
  onShare?: () => void;
};

const HYPE_TABLE = "hype_reactions";

const SplikCard: React.FC<Props> = ({
  splik,
  index,
  shouldLoad = true,
  onPrimaryVisible,
  onShare,
}) => {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const hostRef = React.useRef<HTMLDivElement | null>(null);

  const [userId, setUserId] = React.useState<string | null>(null);
  const [muted, setMuted] = React.useState(true);

  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [hyped, setHyped] = React.useState(false);
  const [hypeBusy, setHypeBusy] = React.useState(false);
  const [hypeCount, setHypeCount] = React.useState<number>(
    typeof splik.hype_count === "number" ? splik.hype_count : 0
  );

  // auth
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, session) =>
      setUserId(session?.user?.id ?? null)
    );
    return () => data.subscription?.unsubscribe();
  }, []);

  // Observe visibility for parent (Index.tsx's rolling window)
  React.useEffect(() => {
    if (!hostRef.current || typeof onPrimaryVisible !== "function" || index == null)
      return;

    const el = hostRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.intersectionRatio >= 0.6) {
          onPrimaryVisible(index);
        }
      },
      { root: null, threshold: [0.25, 0.6, 0.9] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onPrimaryVisible, index]);

  // Prepare video for mobile (prevent black frame)
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playsInline = true;
    (v as any).webkitPlaysInline = true;
    v.preload = "metadata";
    v.muted = muted;

    const onLoaded = () => {
      try {
        if (v.currentTime === 0) v.currentTime = 0.1;
      } catch {}
    };
    v.addEventListener("loadeddata", onLoaded, { once: true });
    return () => v.removeEventListener("loadeddata", onLoaded);
  }, [muted, shouldLoad, splik.video_url]);

  // Load saved/hyped state (+ backfill hype count if not provided)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) return;

      // Favorites
      try {
        const { data } = await supabase
          .from("favorites")
          .select("id")
          .eq("user_id", userId)
          .eq("splik_id", splik.id)
          .maybeSingle();
        if (!cancelled) setSaved(!!data);
      } catch {}

      // Hyped?
      try {
        const { data } = await supabase
          .from(HYPE_TABLE)
          .select("id")
          .eq("user_id", userId)
          .eq("splik_id", splik.id)
          .maybeSingle();
        if (!cancelled) setHyped(!!data);
      } catch {}

      // Backfill hype count if missing
      if (typeof splik.hype_count !== "number") {
        try {
          const { count } = await supabase
            .from(HYPE_TABLE)
            .select("id", { count: "exact", head: true })
            .eq("splik_id", splik.id);
          if (!cancelled && typeof count === "number") {
            setHypeCount(count);
          }
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, splik.id, splik.hype_count]);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    setMuted(next);
  };

  const toggleFavorite = async () => {
    if (!userId || saving) return;
    setSaving(true);

    const wasSaved = saved;
    setSaved(!wasSaved);

    try {
      if (wasSaved) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", userId)
          .eq("splik_id", splik.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: userId, splik_id: splik.id });
        if (error) throw error;
      }
    } catch {
      // revert
      setSaved(wasSaved);
    } finally {
      setSaving(false);
    }
  };

  const toggleHype = async () => {
    if (!userId || hypeBusy) return;
    setHypeBusy(true);

    const wasHyped = hyped;
    // optimistic
    setHyped(!wasHyped);
    setHypeCount((c) => (wasHyped ? Math.max(0, c - 1) : c + 1));

    try {
      if (wasHyped) {
        const { error } = await supabase
          .from(HYPE_TABLE)
          .delete()
          .eq("user_id", userId)
          .eq("splik_id", splik.id);
        if (error) throw error;
      } else {
        // idempotent add
        const { error } = await supabase
          .from(HYPE_TABLE)
          .upsert([{ user_id: userId, splik_id: splik.id, amount: 1 }], {
            onConflict: "splik_id,user_id",
            ignoreDuplicates: true,
          });
        if (error) throw error;
      }
    } catch {
      // revert on error
      setHyped(wasHyped);
      setHypeCount((c) => (wasHyped ? c + 1 : Math.max(0, c - 1)));
    } finally {
      setHypeBusy(false);
    }
  };

  const doShare = async () => {
    if (onShare) return onShare();
    const url = `${window.location.origin.replace(/\/$/, "")}/video/${splik.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: splik.title || "Splik", url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {}
  };

  const creator = splik.profile;
  const creatorName =
    creator?.display_name ||
    creator?.first_name ||
    creator?.username ||
    "Creator";

  return (
    <Card ref={hostRef} className="overflow-hidden border-0 bg-transparent shadow-none">
      <div className="relative mx-auto w-full max-w-[520px]">
        {/* Video box */}
        <div className="relative bg-black rounded-xl overflow-hidden aspect-[9/16]">
          <video
            ref={videoRef}
            src={shouldLoad ? splik.video_url : undefined}
            poster={splik.thumbnail_url || undefined}
            className="w-full h-full object-contain" /* keep full video visible; change to object-cover if you prefer crop */
            playsInline
            muted={muted}
            preload="metadata"
            loop
          />
          {/* Gradient bottom overlay */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 to-transparent" />

          {/* Mute toggle */}
          <button
            onClick={toggleMute}
            className="absolute bottom-3 right-3 z-10 rounded-full bg-black/60 p-2 hover:bg-black/80"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <VolumeX className="h-5 w-5 text-white" />
            ) : (
              <Volume2 className="h-5 w-5 text-white" />
            )}
          </button>

          {/* Creator chip — clickable */}
          <Link
            to={`/creator/${creator?.username || splik.user_id}`}
            className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full bg-black/60 px-2.5 py-1.5 hover:bg-black/75"
            aria-label={`Open ${creatorName}'s profile`}
            title={creatorName}
          >
            <Avatar className="h-7 w-7 ring-1 ring-white/20">
              <AvatarImage src={creator?.avatar_url || undefined} />
              <AvatarFallback className="text-[10px]">
                {(creatorName || "C").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-white text-xs font-medium max-w-[120px] truncate">
              {creatorName}
            </span>
          </Link>
        </div>

        {/* Action row */}
        <div className="mt-3 flex items-center gap-2">
          {/* Hype */}
          <Button
            size="sm"
            variant={hyped ? "default" : "outline"}
            onClick={toggleHype}
            disabled={!userId || hypeBusy}
            className={`flex-1 ${hyped ? "bg-gradient-to-r from-orange-500 to-pink-500 text-white" : ""}`}
            aria-pressed={hyped}
            aria-label="Hype"
            title="Hype"
          >
            <Flame className={`h-4 w-4 mr-2 ${hyped ? "fill-current" : ""}`} />
            <span className="font-semibold">{hypeCount}</span>
          </Button>

          {/* Save / Favorite */}
          <Button
            size="sm"
            variant={saved ? "default" : "outline"}
            onClick={toggleFavorite}
            disabled={!userId || saving}
            className={`flex-1 ${saved ? "bg-yellow-400 text-black hover:bg-yellow-500" : ""}`}
            aria-pressed={saved}
            aria-label={saved ? "Saved" : "Save"}
            title={saved ? "Saved" : "Save"}
          >
            {saved ? (
              <BookmarkCheck className="h-4 w-4 mr-2" />
            ) : (
              <Bookmark className="h-4 w-4 mr-2" />
            )}
            <span className="font-semibold">{saved ? "Saved" : "Save"}</span>
          </Button>

          {/* Share */}
          <Button
            size="sm"
            variant="outline"
            onClick={doShare}
            aria-label="Share"
            title="Share"
            className="px-3"
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Title / Caption (optional) */}
        {(splik.title || splik.description) && (
          <div className="mt-2 text-sm">
            {splik.title && (
              <p className="font-semibold mb-0.5">{splik.title}</p>
            )}
            {splik.description && (
              <p className="text-muted-foreground">{splik.description}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default SplikCard;
