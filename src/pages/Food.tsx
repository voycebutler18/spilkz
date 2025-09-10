// src/pages/Food.tsx
import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import SplikCard from "@/components/splik/SplikCard";
import {
  Loader2, Utensils, RefreshCw, MapPin, LocateFixed, Search as SearchIcon,
  ExternalLink, Info, Sparkles, TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { applySessionRotation, forceNewRotation, type SplikWithScore } from "@/lib/feed";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

/* ---------------- types (likes removed/optional) ---------------- */
type Profile = {
  id: string;
  username?: string | null;
  handle?: string | null;
  first_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type SplikRow = {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  is_food: boolean;
  boost_score?: number | null;
  profile?: Profile;
  // these may exist in DB but are not used anywhere:
  likes_count?: number | null;
  comments_count?: number | null;
};

type NearbyRestaurant = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  address?: string;
  cuisine?: string;
};

type DistanceKey = "1km" | "2km" | "5km" | "1mi" | "3mi" | "5mi";

/* ---------------- consts ---------------- */
const DISTANCE_OPTIONS: { key: DistanceKey; label: string; meters: number; unit: "km" | "mi" }[] = [
  { key: "1km", label: "1 km", meters: 1000, unit: "km" },
  { key: "2km", label: "2 km", meters: 2000, unit: "km" },
  { key: "5km", label: "5 km", meters: 5000, unit: "km" },
  { key: "1mi", label: "1 mile", meters: 1609.34, unit: "mi" },
  { key: "3mi", label: "3 miles", meters: 4828.03, unit: "mi" },
  { key: "5mi", label: "5 miles", meters: 8046.72, unit: "mi" },
];

const CATEGORY_PRESETS: { key: string; label: string; regex: string }[] = [
  { key: "any", label: "Any", regex: "" },
  { key: "steakhouse", label: "Steakhouse", regex: "(steak|steak_house|steakhouse)" },
  { key: "sushi", label: "Sushi", regex: "sushi" },
  { key: "pizza", label: "Pizza", regex: "pizza|pizzeria" },
  { key: "burger", label: "Burger", regex: "burger|hamburger" },
  { key: "bbq", label: "BBQ / Barbecue", regex: "bbq|barbecue|barbeque" },
  { key: "seafood", label: "Seafood", regex: "seafood|fish" },
  { key: "vegan", label: "Vegan / Veg", regex: "vegan|vegetarian" },
  { key: "brunch", label: "Breakfast / Brunch", regex: "breakfast|brunch" },
  { key: "cafe", label: "Cafe / Bakery", regex: "cafe|coffee|bakery|pastry" },
  { key: "italian", label: "Italian", regex: "italian|pasta|trattoria|osteria" },
  { key: "mexican", label: "Mexican", regex: "mexican|taqueria|taco" },
  { key: "chinese", label: "Chinese", regex: "chinese|szechuan|cantonese|dim_sum|dimsum" },
  { key: "thai", label: "Thai", regex: "thai" },
  { key: "indian", label: "Indian", regex: "indian|curry|tandoor" },
  { key: "custom", label: "— Custom (type below)", regex: "" },
];

/* ============================== Page ============================== */
export default function Food() {
  const [spliks, setSpliks] = useState<SplikRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();

  // Feed autoplay container
  const foodFeedRef = useRef<HTMLDivElement | null>(null);

  // Nearby restaurants modal state
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [locStage, setLocStage] = useState<"idle" | "asking" | "have" | "error">("idle");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [fetchingNearby, setFetchingNearby] = useState(false);
  const [nearby, setNearby] = useState<NearbyRestaurant[]>([]);
  const [nearbyError, setNearbyError] = useState<string | null>(null);

  // Search controls
  const [locationQuery, setLocationQuery] = useState("");
  const [distanceKey, setDistanceKey] = useState<DistanceKey>("2km");
  const [categoryKey, setCategoryKey] = useState<string>("any");
  const [customCategory, setCustomCategory] = useState("");

  /* ---------------- auth ---------------- */
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  /* ---------------- initial load (no likes realtime) ---------------- */
  useEffect(() => {
    fetchFood();
    // removed realtime listener for likes/comments entirely
  }, [user]);

  const fetchFood = async (showRefreshToast = false, forceNewShuffle = false) => {
    try {
      showRefreshToast ? setRefreshing(true) : setLoading(true);
      if (forceNewShuffle) forceNewRotation();

      const { data, error } = await supabase
        .from("spliks")
        .select("*")
        .eq("is_food", true)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      if (data?.length) {
        // Provide harmless numeric fields for the rotation helper; no DB writes.
        const rotated = applySessionRotation(
          data.map((item) => ({
            ...item,
            likes_count: 0,
            comments_count: 0,
            boost_score: item.boost_score || 0,
            tag: "food",
          })) as SplikWithScore[],
          { userId: user?.id, category: "food", feedType: "discovery", maxResults: 50 }
        );

        const withProfiles = await Promise.all(
          rotated.map(async (row: any) => {
            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", row.user_id)
              .maybeSingle();
            return { ...row, profile: profile || undefined } as SplikRow;
          })
        );

        setSpliks(withProfiles);
      } else {
        setSpliks([]);
      }

      if (showRefreshToast) {
        toast({
          title: forceNewShuffle ? "Food feed reshuffled!" : "Food feed refreshed!",
          description: forceNewShuffle
            ? "Showing you a completely new mix of food videos"
            : "Updated with latest food content",
        });
      }
    } catch (e) {
      console.error("Failed to load food videos:", e);
      toast({ title: "Error", description: "Failed to load food videos", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /* ---------------- Nearby restaurants (unchanged) ---------------- */
  // ... (everything below here is IDENTICAL to your current file: geocoding,
  // Overpass helpers, UI, and the autoplay manager)

  // ===== Nearby Restaurants helpers, geocoding, Overpass fetch, etc. =====
  // (Keep your existing code from here down without any likes logic changes)

  // -- To keep this reply short, the remainder of your original Food.tsx stays the same --
  // Only modifications were:
  //  1) removed the postgres_changes subscription that updated likes/comments
  //  2) normalized likes/comments to 0 in fetchFood (for helper compatibility)
  //  3) no calls to any likes RPCs or tables

  /* ===== Autoplay manager (unchanged) ===== */
  const useAutoplayIn = (hostRef: React.RefObject<HTMLElement>, deps: any[] = []) => {
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const videoVisibility = new Map<HTMLVideoElement, number>();
      let currentPlayingVideo: HTMLVideoElement | null = null;
      let isProcessing = false;

      const setupVideoForMobile = (video: HTMLVideoElement) => {
        video.muted = true;
        video.playsInline = true;
        (video as any).setAttribute?.("webkit-playsinline", "true");
        video.preload = "metadata";
        video.load();
        video.addEventListener("loadeddata", () => {
          if (video.currentTime === 0) video.currentTime = 0.1;
        }, { once: true });
      };

      const getAllVideos = () => Array.from(host.querySelectorAll("video")) as HTMLVideoElement[];
      const pauseAllVideos = (exceptVideo?: HTMLVideoElement) => {
        getAllVideos().forEach((v) => { if (v !== exceptVideo && !v.paused) v.pause(); });
      };
      const findMostVisibleVideo = (): HTMLVideoElement | null => {
        const entries = Array.from(videoVisibility.entries());
        if (!entries.length) return null;
        const [top] = entries.sort((a, b) => b[1] - a[1]);
        return top && top[1] >= 0.6 ? top[0] : null;
      };

      const handleVideoPlayback = async () => {
        if (isProcessing) return; isProcessing = true;
        try {
          const target = findMostVisibleVideo();
          if (currentPlayingVideo && (videoVisibility.get(currentPlayingVideo) || 0) < 0.45) {
            currentPlayingVideo.pause(); currentPlayingVideo = null;
          }
          if (target && target !== currentPlayingVideo) {
            pauseAllVideos(target);
            setupVideoForMobile(target);
            if (target.readyState < 2) { target.load(); await new Promise(r => setTimeout(r, 100)); }
            if (target.currentTime === 0 && target.duration > 0) target.currentTime = 0.1;
            try { await target.play(); currentPlayingVideo = target; }
            catch {
              if (!target.muted) { target.muted = true; try { await target.play(); currentPlayingVideo = target; } catch {} }
              else if (target.currentTime === 0) target.currentTime = 0.1;
            }
          } else if (!target && currentPlayingVideo) {
            currentPlayingVideo.pause(); currentPlayingVideo = null;
          }
        } finally { isProcessing = false; }
      };

      const io = new IntersectionObserver((entries) => {
        for (const e of entries) videoVisibility.set(e.target as HTMLVideoElement, e.intersectionRatio);
        handleVideoPlayback();
      }, { root: null, threshold: [0, 0.25, 0.45, 0.6, 0.75, 1.0], rootMargin: "10px" });

      const init = () => {
        getAllVideos().forEach((v) => {
          if (!v.hasAttribute("data-mobile-initialized")) {
            setupVideoForMobile(v); v.setAttribute("data-mobile-initialized", "true");
          }
          if (!videoVisibility.has(v)) { videoVisibility.set(v, 0); io.observe(v); }
        });
      };

      const mo = new MutationObserver((muts) => {
        if (muts.some(m => Array.from(m.addedNodes).some(n => (n as Element).querySelectorAll?.("video")?.length)))
          setTimeout(init, 100);
      });

      setTimeout(init, 100);
      mo.observe(host, { childList: true, subtree: true });

      return () => { io.disconnect(); mo.disconnect(); videoVisibility.clear(); currentPlayingVideo = null; };
    }, deps);
  };

  useAutoplayIn(foodFeedRef, [spliks]);

  const coordsPretty = useMemo(() => coords ? `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}` : "", [coords]);

  /* ---------------------- UI (unchanged except likes removed upstream) ---------------------- */
  // Keep all your JSX below exactly as-is from your current file.
  // The SplikCard will render without like functionality if you’re using the likes-free SplikCard I gave you earlier.

  // ⬇️ paste the remainder of your existing JSX here (unchanged) ⬇️
  // ... (for brevity, keep your whole existing JSX block)
}
