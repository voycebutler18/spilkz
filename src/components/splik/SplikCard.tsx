
// src/components/splik/SplikCard.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { Flame, Bookmark, BookmarkCheck, Share2, VolumeX, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

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
  hype_count?: number | null;
  profile?: Profile | null;
};

type Props = {
  splik: Splik;
  index?: number;
  /** Parent can gate which ones attach a real src */
  shouldLoad?: boolean;
  /** Parent can track which is "active" in viewport */
  onPrimaryVisible?: (index: number) => void;
  onSplik?: () => void;
  onReact?: () => void;
  onShare?: () => void;
};

const VISIBILITY_THRESHOLD = 0.6;

export default function SplikCard({
  splik,
  index = 0,
  shouldLoad = true,
  onPrimaryVisible,
  onShare,
}: Props) {
  const { toast } = useToast();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);

  const [user, setUser] = React.useState<any>(null);

  const [isMuted, setIsMuted] = React.useState(true);
  const [isPlaying, setIsPlaying] = React.useState(false);

  const [hypeCount, setHypeCount] = React.useState<number>(splik.hype_count ?? 0);
  const [hasHyped, setHasHyped] = React.useState<boolean>(false);

  const [isSaved, setIsSaved] = React.useState<boolean>(false);
  const [loadingCounts, setLoadingCounts] = React.useState(false);

  // keep user in sync
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // ——————————— Enhanced Autoplay / visibility control for mobile ———————————
  React.useEffect(() => {
    const el = cardRef.current;
    const vid = videoRef.current;
    if (!el || !vid) return;

    // Enhanced mobile-friendly defaults
    vid.playsInline = true;
    (vid as any).webkitPlaysInline = true;
    vid.muted = true;
    vid.preload = "auto";
    vid.setAttribute('playsinline', 'true');
    vid.setAttribute('webkit-playsinline', 'true');

    let lastVisible = 0;
    let playAttempts = 0;
    const maxPlayAttempts = 3;

    const tryPlay = async (forceAttempt = false) => {
      if (!vid.src || (!forceAttempt && playAttempts >= maxPlayAttempts)) return;
      
      playAttempts++;
      
      try {
        // Ensure video is loaded
        if (vid.readyState < 2) {
          vid.load();
          // Wait a bit for load
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Force muted for autoplay compliance
        vid.muted = true;
        setIsMuted(true);
        
        await vid.play();
        setIsPlaying(true);
        playAttempts = 0; // reset on success
      } catch (err) {
        // Enhanced fallback strategy
        try {
          // Second attempt with explicit muted and slight delay
          await new Promise(resolve => setTimeout(resolve, 50));
          vid.muted = true;
          vid.volume = 0;
          await vid.play();
          setIsPlaying(true);
          playAttempts = 0;
        } catch (secondErr) {
          // Third attempt: reset and retry
          try {
            vid.currentTime = 0;
            vid.muted = true;
            await vid.play();
            setIsPlaying(true);
            playAttempts = 0;
          } catch (finalErr) {
            // Last resort: enable controls for manual play
            if (playAttempts >= maxPlayAttempts) {
              vid.controls = true;
              setIsPlaying(false);
            }
          }
        }
      }
    };

    const pause = () => {
      try {
        vid.pause();
      } catch {}
      setIsPlaying(false);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const ent of entries) {
          lastVisible = ent.intersectionRatio;
          if (ent.isIntersecting && ent.intersectionRatio >= VISIBILITY_THRESHOLD) {
            onPrimaryVisible?.(index);
            // Start playback immediately when visible
            tryPlay();
          } else if (ent.intersectionRatio < 0.35) {
            pause();
          }
        }
      },
      { threshold: [0, 0.35, VISIBILITY_THRESHOLD, 0.9, 1] }
    );
    io.observe(el);

    // Enhanced touch/click handlers for mobile
    const onTap = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      tryPlay(true); // force attempt on user interaction
    };
    
    const onTouch = (e: TouchEvent) => {
      e.stopPropagation();
      tryPlay(true);
    };

    el.addEventListener("click", onTap, { passive: false });
    el.addEventListener("touchstart", onTouch, { passive: true });
    el.addEventListener("touchend", onTap, { passive: false });

    // Enhanced iOS compatibility
    const onLoaded = () => {
      if (vid.currentTime === 0) {
        try { 
          vid.currentTime = 0.01; // Tiny nudge to prevent stall
        } catch {}
      }
      // Try to play once loaded if visible
      if (lastVisible >= VISIBILITY_THRESHOLD) {
        tryPlay();
      }
    };
    
    const onCanPlay = () => {
      if (lastVisible >= VISIBILITY_THRESHOLD && !isPlaying) {
        tryPlay();
      }
    };

    vid.addEventListener("loadeddata", onLoaded);
    vid.addEventListener("canplay", onCanPlay);
    vid.addEventListener("stalled", () => tryPlay());
    vid.addEventListener("waiting", () => tryPlay());

    return () => {
      io.disconnect();
      el.removeEventListener("click", onTap);
      el.removeEventListener("touchstart", onTouch);
      el.removeEventListener("touchend", onTap);
      vid.removeEventListener("loadeddata", onLoaded);
      vid.removeEventListener("canplay", onCanPlay);
      vid.removeEventListener("stalled", () => tryPlay());
      vid.removeEventListener("waiting", () => tryPlay());
      pause();
    };
  }, [index, onPrimaryVisible, isPlaying]);

  // ——————————— Load hype count and user interaction state ———————————
  React.useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!splik?.id) return;
      setLoadingCounts(true);
      
      try {
        // Get hype count
        const { count: hypeCountResult } = await supabase
          .from("hype_reactions")
          .select("*", { head: true, count: "exact" })
          .eq("splik_id", splik.id);
        
        if (!cancelled && typeof hypeCountResult === "number") {
          setHypeCount(hypeCountResult);
        }

        // Check user's interactions if logged in
        if (user?.id) {
          // Check if user has hyped
          const { data: hypeData } = await supabase
            .from("hype_reactions")
            .select("id")
            .eq("splik_id", splik.id)
            .eq("user_id", user.id)
            .maybeSingle();
          
          if (!cancelled) setHasHyped(!!hypeData);

          // Check if user has saved
          const { data: saveData } = await supabase
            .from("favorites")
            .select("id")
            .eq("video_id", splik.id)
            .eq("user_id", user.id)
            .maybeSingle();
          
          if (!cancelled) setIsSaved(!!saveData);
        }

      } catch (error) {
        console.error("Error loading splik data:", error);
      } finally {
        if (!cancelled) setLoadingCounts(false);
      }
    };

    loadData();
    
    return () => {
      cancelled = true;
    };
  }, [splik?.id, user?.id]);

  const ensureAuth = async () => {
    if (user) return user;
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      setUser(data.user);
      return data.user;
    }
    toast({
      title: "Sign in required",
      description: "Please log in to react or save.",
      variant: "default",
    });
    throw new Error("auth_required");
  };

  const toggleHype = async () => {
    try {
      const u = await ensureAuth();
      const { data: existingHype } = await supabase
        .from("hype_reactions")
        .select("id")
        .eq("splik_id", splik.id)
        .eq("user_id", u.id)
        .maybeSingle();

      if (existingHype?.id) {
        // Remove hype
        await supabase.from("hype_reactions").delete().eq("id", existingHype.id);
        setHasHyped(false);
        setHypeCount((prev) => Math.max(0, prev - 1));
      } else {
        // Add hype
        await supabase
          .from("hype_reactions")
          .insert({ splik_id: splik.id, user_id: u.id, amount: 1 });
        setHasHyped(true);
        setHypeCount((prev) => prev + 1);
      }
    } catch (error: any) {
      if (error?.message !== "auth_required") {
        toast({ 
          title: "Couldn't update hype", 
          description: "Please try again",
          variant: "destructive" 
        });
      }
    }
  };

  const toggleSave = async () => {
    try {
      const u = await ensureAuth();
      const { data: existingSave } = await supabase
        .from("favorites")
        .select("id")
        .eq("video_id", splik.id)
        .eq("user_id", u.id)
        .maybeSingle();

      if (existingSave?.id) {
        // Remove from favorites
        await supabase.from("favorites").delete().eq("id", existingSave.id);
        setIsSaved(false);
        toast({ title: "Removed from favorites" });
      } else {
        // Add to favorites
        await supabase.from("favorites").insert({ 
          video_id: splik.id, 
          user_id: u.id 
        });
        setIsSaved(true);
        toast({ title: "Saved to favorites" });
      }
    } catch (error: any) {
      if (error?.message !== "auth_required") {
        toast({ 
          title: "Couldn't save", 
          description: "Please try again",
          variant: "destructive" 
        });
      }
    }
  };

  const onToggleMute = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const v = videoRef.current;
    if (!v) return;
    
    const nextMuted = !isMuted;
    v.muted = nextMuted;
    setIsMuted(nextMuted);
    
    // If unmuting, try to play if not already playing
    if (!nextMuted && !isPlaying) {
      v.play().catch(() => {
        // If play fails, re-mute
        v.muted = true;
        setIsMuted(true);
      });
    }
  };

  // Build creator profile link
  const creatorHref = splik?.profile?.username
    ? `/profile/${splik.profile.id}`
    : `/profile/${splik.user_id}`;

  return (
    <div ref={cardRef} className="rounded-xl bg-card/60 ring-1 ring-border/60 overflow-hidden">
      {/* Video */}
      <div className="relative">
        <video
          ref={videoRef}
          poster={splik.thumbnail_url || undefined}
          className="block w-full h-[560px] sm:h-[640px] object-contain bg-black"
          src={shouldLoad ? splik.video_url : ""}
          playsInline
          muted
          loop
          preload="auto"
          controls={false}
          webkit-playsinline="true"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const v = videoRef.current;
            if (!v) return;
            
            if (isPlaying) { 
              v.pause(); 
              setIsPlaying(false); 
            } else { 
              v.play()
                .then(() => setIsPlaying(true))
                .catch(() => {
                  // Enable controls as fallback
                  v.controls = true;
                }); 
            }
          }}
          onError={() => {
            // Fallback: enable controls so user can still play
            const v = videoRef.current;
            if (v) {
              v.controls = true;
              console.error("Video failed to load:", splik.video_url);
            }
          }}
        />
        
        {/* Mute/Unmute button */}
        <button
          onClick={onToggleMute}
          className="absolute right-3 bottom-3 rounded-full bg-black/70 hover:bg-black/80 p-2 ring-1 ring-white/30 transition-colors"
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <VolumeX className="h-5 w-5 text-white" />
          ) : (
            <Volume2 className="h-5 w-5 text-white" />
          )}
        </button>
      </div>

      {/* Creator info */}
      <div className="flex items-center gap-3 px-4 pt-3">
        <Link to={creatorHref} className="shrink-0 hover:opacity-80 transition-opacity">
          <img
            src={
              splik.profile?.avatar_url ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${splik.user_id}`
            }
            alt={splik.profile?.display_name || splik.profile?.username || "Creator"}
            className="h-9 w-9 rounded-full ring-2 ring-primary/20 object-cover"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link 
            to={creatorHref} 
            className="block font-medium hover:text-primary transition-colors truncate"
          >
            {splik.profile?.display_name || splik.profile?.username || "Creator"}
          </Link>
          {splik.title && (
            <p className="text-sm text-muted-foreground truncate">{splik.title}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 pt-3">
        <div className="flex items-center gap-2">
          {/* Hype button */}
          <Button
            variant={hasHyped ? "default" : "outline"}
            size="sm"
            className={cn(
              "gap-2 transition-colors",
              hasHyped && "bg-orange-500 hover:bg-orange-600 text-white"
            )}
            onClick={toggleHype}
            disabled={loadingCounts}
          >
            <Flame className={cn("h-4 w-4", hasHyped && "text-white")} />
            {hypeCount}
          </Button>

          {/* Save button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={toggleSave}
            disabled={loadingCounts}
          >
            {isSaved ? (
              <>
                <BookmarkCheck className="h-4 w-4" />
                Saved
              </>
            ) : (
              <>
                <Bookmark className="h-4 w-4" />
                Save
              </>
            )}
          </Button>

          {/* Share button */}
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={onShare}
            >
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          </div>
        </div>

        {/* Description */}
        {splik.description && (
          <p className="mt-3 text-sm text-muted-foreground">
            {splik.description}
          </p>
        )}
      </div>
    </div>
  );
}
