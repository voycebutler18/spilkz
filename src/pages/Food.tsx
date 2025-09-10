// src/pages/Food.tsx
import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import SplikCard from "@/components/splik/SplikCard";
import {
  Loader2,
  Utensils,
  RefreshCw,
  MapPin,
  LocateFixed,
  Search as SearchIcon,
  ExternalLink,
  Info,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { applySessionRotation, forceNewRotation, type SplikWithScore } from "@/lib/feed";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

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
  likes_count: number | null;
  comments_count: number | null;
  created_at: string;
  is_food: boolean;
  boost_score?: number | null;
  profile?: Profile;
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
  const [locationQuery, setLocationQuery] = useState(""); // city or ZIP
  const [distanceKey, setDistanceKey] = useState<DistanceKey>("2km");
  const [categoryKey, setCategoryKey] = useState<string>("any");
  const [customCategory, setCustomCategory] = useState("");

  // auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  // initial load + realtime updates
  useEffect(() => {
    fetchFood();

    const channel = supabase
      .channel("food-feed")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "spliks", filter: "is_food=eq.true" },
        (payload) => {
          setSpliks((prev) =>
            prev.map((s) =>
              s.id === (payload.new as any).id
                ? {
                    ...s,
                    likes_count: (payload.new as any).likes_count ?? 0,
                    comments_count: (payload.new as any).comments_count ?? 0,
                  }
                : s
            )
          );
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const fetchFood = async (showRefreshToast = false, forceNewShuffle = false) => {
    try {
      if (showRefreshToast) setRefreshing(true);
      else setLoading(true);

      if (forceNewShuffle) forceNewRotation();

      const { data, error } = await supabase
        .from("spliks")
        .select("*")
        .eq("is_food", true)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      if (data?.length) {
        const rotated = applySessionRotation(
          data.map((item) => ({
            ...item,
            likes_count: item.likes_count || 0,
            comments_count: item.comments_count || 0,
            boost_score: item.boost_score || 0,
            tag: "food",
          })) as SplikWithScore[],
          {
            userId: user?.id,
            category: "food",
            feedType: "discovery" as const,
            maxResults: 50,
          }
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
      toast({
        title: "Error",
        description: "Failed to load food videos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ===== Nearby Restaurants =====
  const openNearby = () => {
    setNearbyOpen(true);
    resetSearchState();
  };

  const resetSearchState = () => {
    setLocStage("idle");
    setCoords(null);
    setLocationQuery("");
    setNearby([]);
    setNearbyError(null);
    setFetchingNearby(false);
    setDistanceKey("2km");
    setCategoryKey("any");
    setCustomCategory("");
  };

  const reverseGeocode = async (lat: number, lon: number): Promise<string | null> => {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      const res = await fetch(url.toString(), {
        headers: { "Accept-Language": "en", "User-Agent": "SplikzApp/1.0" },
      });
      if (!res.ok) return null;
      const j = (await res.json()) as any;
      const city = j.address?.city || j.address?.town || j.address?.village || j.address?.hamlet;
      const state = j.address?.state || j.address?.region;
      const country = j.address?.country_code?.toUpperCase();
      if (!city && !state) return j.display_name || null;
      return [city, state, country].filter(Boolean).join(", ");
    } catch {
      return null;
    }
  };

  const requestLocation = () => {
    setLocStage("asking");
    setNearbyError(null);
    if (!("geolocation" in navigator)) {
      setLocStage("error");
      setNearbyError("Geolocation is not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const c = { lat: Number(latitude), lon: Number(longitude) };
        setCoords(c);
        setLocStage("have");

        // Update the input to the user's place (best effort)
        const place = await reverseGeocode(c.lat, c.lon);
        setLocationQuery(place ?? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`);
      },
      (err) => {
        console.error("Geolocation error:", err);
        setLocStage("error");
        setNearbyError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. You can search by city or ZIP instead."
            : "Unable to get your location. Try again or search by city/ZIP."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const unitForDistanceKey = useMemo(
    () => DISTANCE_OPTIONS.find((d) => d.key === distanceKey)?.unit || "km",
    [distanceKey]
  );

  const metersForDistanceKey = useMemo(
    () => DISTANCE_OPTIONS.find((d) => d.key === distanceKey)?.meters || 2000,
    [distanceKey]
  );

  const prettyDistance = (distanceKm: number) =>
    unitForDistanceKey === "km"
      ? `${distanceKm.toFixed(1)} km`
      : `${(distanceKm * 0.621371).toFixed(1)} mi`;

  const overpassFetch = async (query: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: query,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`Overpass API error ${res.status}: ${res.statusText}`);
      return await res.json();
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error("Search timed out. Please try again.");
      }
      throw error;
    }
  };

  const geocodeToCoords = async (q: string): Promise<{ lat: number; lon: number } | null> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "us,ca");
      const res = await fetch(url.toString(), {
        headers: { "Accept-Language": "en", "User-Agent": "SplikzApp/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
      const arr = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (!arr.length) return null;
      return { lat: Number(arr[0].lat), lon: Number(arr[0].lon) };
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") throw new Error("Location search timed out. Please try again.");
      throw error;
    }
  };

  const buildCategoryRegex = () => {
    const preset = CATEGORY_PRESETS.find((c) => c.key === categoryKey);
    if (preset && preset.key !== "any" && preset.key !== "custom") return preset.regex;

    const raw = customCategory.trim();
    if (!raw) return "";
    const tokens = raw
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) return "";

    const joined = tokens.join("|");
    const compound = tokens.join("");
    const underscored = tokens.join("_");
    return `(${joined}|${compound}|${underscored})`;
  };

  const buildOverpassAroundQuery = (
    center: { lat: number; lon: number },
    radiusMeters: number,
    categoryRegex: string
  ) => {
    const amenityFilter = `["amenity"~"restaurant|fast_food|cafe|bar|pub"]`;
    const around = `(around:${Math.round(radiusMeters)},${center.lat},${center.lon})`;

    if (categoryRegex) {
      const cat = categoryRegex.replace(/"/g, '\\"');
      return `
        [out:json][timeout:30];
        (
          node${amenityFilter}["cuisine"~"${cat}",i]${around};
          node${amenityFilter}["name"~"${cat}",i]${around};
          node${amenityFilter}["brand"~"${cat}",i]${around};
          way${amenityFilter}["cuisine"~"${cat}",i]${around};
          way${amenityFilter}["name"~"${cat}",i]${around};
          way${amenityFilter}["brand"~"${cat}",i]${around};
          relation${amenityFilter}["cuisine"~"${cat}",i]${around};
          relation${amenityFilter}["name"~"${cat}",i]${around};
          relation${amenityFilter}["brand"~"${cat}",i]${around};
        );
        out center tags;
      `;
    }

    return `
      [out:json][timeout:30];
      (
        node${amenityFilter}${around};
        way${amenityFilter}${around};
        relation${amenityFilter}${around};
      );
      out center tags;
    `;
  };

  const haversineKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(la1) * Math.cos(la2) * sinDLon * sinDLon;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const runNearbySearch = async () => {
    try {
      setNearbyError(null);
      setFetchingNearby(true);
      setNearby([]);

      let center = coords;
      if (!center) {
        if (!locationQuery.trim()) {
          setNearbyError("Enter a city or ZIP, or use your location.");
          setFetchingNearby(false);
          return;
        }
        try {
          const gc = await geocodeToCoords(locationQuery.trim());
          if (!gc) {
            setNearbyError("Couldn't find that place. Try a different city or ZIP code.");
            setFetchingNearby(false);
            return;
          }
          center = gc;
          setCoords(gc);
          setLocStage("have");
        } catch (geoError: any) {
          setNearbyError("Error finding location: " + geoError.message);
          setFetchingNearby(false);
          return;
        }
      }

      const categoryRegex =
        categoryKey === "custom"
          ? buildCategoryRegex()
          : buildCategoryRegex() || CATEGORY_PRESETS.find((c) => c.key === categoryKey)?.regex || "";

      const query = buildOverpassAroundQuery(center!, metersForDistanceKey, categoryRegex || "");
      const json = await overpassFetch(query);
      const elements: any[] = json.elements || [];

      const mapped: NearbyRestaurant[] = elements
        .map((el) => {
          const name = el.tags?.name || el.tags?.brand || "Unnamed Restaurant";
          const rLat = el.lat ?? el.center?.lat;
          const rLon = el.lon ?? el.center?.lon;
          if (typeof rLat !== "number" || typeof rLon !== "number") return null;
          const distanceKm = haversineKm(center!, { lat: rLat, lon: rLon });

          const maxDistanceKm = metersForDistanceKey / 1000 + 0.1;
          if (distanceKm > maxDistanceKm) return null;

          const addressParts = [
            el.tags?.["addr:housenumber"],
            el.tags?.["addr:street"],
            el.tags?.["addr:city"],
          ].filter(Boolean);

          return {
            id: `${el.type}/${el.id}`,
            name,
            lat: rLat,
            lon: rLon,
            distanceKm,
            address: addressParts.length > 0 ? addressParts.join(" ") : "Address not available",
            cuisine: el.tags?.cuisine || el.tags?.["cuisine:type"] || undefined,
          } as NearbyRestaurant;
        })
        .filter(Boolean) as NearbyRestaurant[];

      const uniqueRestaurants = mapped.reduce((acc, restaurant) => {
        const existing = acc.find(
          (r) =>
            r.name === restaurant.name &&
            Math.abs(r.lat - restaurant.lat) < 0.0001 &&
            Math.abs(r.lon - restaurant.lon) < 0.0001
        );
        if (!existing) acc.push(restaurant);
        return acc;
      }, [] as NearbyRestaurant[]);

      const byDistance = uniqueRestaurants.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 100);
      setNearby(byDistance);

      if (byDistance.length === 0) {
        setNearbyError(
          "No restaurants found in this area. Try increasing the distance or changing the category."
        );
      }
    } catch (err: any) {
      console.error("Restaurant search error:", err);
      setNearbyError(err.message || "Couldn't load restaurants. Please try again.");
    } finally {
      setFetchingNearby(false);
    }
  };

  // ===== Autoplay manager (unchanged) =====
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
        video.addEventListener(
          "loadeddata",
          () => {
            if (video.currentTime === 0) video.currentTime = 0.1;
          },
          { once: true }
        );
      };

      const getAllVideos = () => Array.from(host.querySelectorAll("video")) as HTMLVideoElement[];

      const pauseAllVideos = (exceptVideo?: HTMLVideoElement) => {
        getAllVideos().forEach((video) => {
          if (video !== exceptVideo && !video.paused) video.pause();
        });
      };

      const findMostVisibleVideo = (): HTMLVideoElement | null => {
        const entries = Array.from(videoVisibility.entries());
        if (!entries.length) return null;
        const [top] = entries.sort((a, b) => b[1] - a[1]);
        return top && top[1] >= 0.6 ? top[0] : null;
      };

      const handleVideoPlayback = async () => {
        if (isProcessing) return;
        isProcessing = true;

        try {
          const targetVideo = findMostVisibleVideo();

          if (currentPlayingVideo && (videoVisibility.get(currentPlayingVideo) || 0) < 0.45) {
            currentPlayingVideo.pause();
            currentPlayingVideo = null;
          }

          if (targetVideo && targetVideo !== currentPlayingVideo) {
            pauseAllVideos(targetVideo);
            setupVideoForMobile(targetVideo);

            if (targetVideo.readyState < 2) {
              targetVideo.load();
              await new Promise((r) => setTimeout(r, 100));
            }
            if (targetVideo.currentTime === 0 && targetVideo.duration > 0) {
              targetVideo.currentTime = 0.1;
            }

            try {
              await targetVideo.play();
              currentPlayingVideo = targetVideo;
            } catch (err) {
              if (!targetVideo.muted) {
                targetVideo.muted = true;
                try {
                  await targetVideo.play();
                  currentPlayingVideo = targetVideo;
                } catch {}
              } else if (targetVideo.currentTime === 0) {
                targetVideo.currentTime = 0.1;
              }
            }
          } else if (!targetVideo && currentPlayingVideo) {
            currentPlayingVideo.pause();
            currentPlayingVideo = null;
          }
        } finally {
          isProcessing = false;
        }
      };

      const intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const video = entry.target as HTMLVideoElement;
            videoVisibility.set(video, entry.intersectionRatio);
          }
          handleVideoPlayback();
        },
        { root: null, threshold: [0, 0.25, 0.45, 0.6, 0.75, 1.0], rootMargin: "10px" }
      );

      const initializeVideos = () => {
        const vids = getAllVideos();
        vids.forEach((video) => {
          if (!video.hasAttribute("data-mobile-initialized")) {
            setupVideoForMobile(video);
            video.setAttribute("data-mobile-initialized", "true");
          }
          if (!videoVisibility.has(video)) {
            videoVisibility.set(video, 0);
            intersectionObserver.observe(video);
          }
        });
      };

      const mutationObserver = new MutationObserver((mutations) => {
        let changed = false;
        mutations.forEach((m) =>
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1 && (n as Element).querySelectorAll?.("video").length) changed = true;
          })
        );
        if (changed) setTimeout(initializeVideos, 100);
      });

      setTimeout(initializeVideos, 100);
      mutationObserver.observe(host, { childList: true, subtree: true });

      return () => {
        intersectionObserver.disconnect();
        mutationObserver.disconnect();
        videoVisibility.clear();
        currentPlayingVideo = null;
      };
    }, deps);
  };

  useAutoplayIn(foodFeedRef, [spliks]);

  const coordsPretty = useMemo(() => {
    if (!coords) return "";
    return `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
  }, [coords]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/3 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-3/4 right-1/4 w-80 h-80 bg-orange-500/3 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-yellow-500/2 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>

      {/* Modern Mobile-First Header */}
      <div className="relative z-10">
        {/* Mobile Header */}
        <div className="lg:hidden">
          <div className="bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 p-1 rounded-b-3xl mx-4 mt-2 shadow-2xl">
            <div className="bg-background/95 backdrop-blur-xl rounded-b-2xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl blur opacity-75 animate-pulse" />
                    <div className="relative bg-gradient-to-r from-orange-500 to-red-500 p-3 rounded-2xl shadow-lg">
                      <Utensils className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div>
                    <h1 className="text-2xl font-black bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
                      Food
                    </h1>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Sparkles className="h-3 w-3" />
                      <span>Fresh • Viral • Tasty</span>
                    </div>
                  </div>
                </div>
                
                <Button
                  onClick={openNearby}
                  size="sm"
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 gap-1 px-3"
                >
                  <MapPin className="h-3 w-3" />
                  <span className="text-xs font-medium">Find local restaurants</span>
                </Button>
              </div>

              {/* Mobile Action Buttons */}
              <div className="flex gap-2 mt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchFood(true, false)}
                  disabled={refreshing}
                  className="flex-1 bg-background/50 backdrop-blur border border-border/50 hover:bg-accent/50 hover:scale-[1.02] transition-all duration-300"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                  Update
                </Button>
                <Button
                  size="sm"
                  onClick={() => fetchFood(true, true)}
                  disabled={refreshing}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300"
                >
                  <TrendingUp className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                  Shuffle
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:block">
          <div className="bg-gradient-to-r from-background via-background/80 to-background backdrop-blur-xl border-b border-border/20 shadow-lg">
            <div className="container mx-auto py-8 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 rounded-3xl blur-lg opacity-75 animate-pulse" />
                    <div className="relative bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 p-4 rounded-3xl shadow-2xl">
                      <Utensils className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <div>
                    <h1 className="text-4xl font-black bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 bg-clip-text text-transparent mb-2">
                      Food Paradise
                    </h1>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Sparkles className="h-4 w-4 text-yellow-500" />
                        <span>3-second viral clips</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span>Fresh shuffle every time</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={openNearby}
                    className="gap-2 bg-background/50 backdrop-blur border-2 border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all duration-300 hover:scale-105"
                  >
                    <MapPin className="h-4 w-4" />
                    Find Nearby Restaurants
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => fetchFood(true, false)}
                    disabled={refreshing}
                    className="gap-2 bg-background/50 backdrop-blur border-2 border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all duration-300 hover:scale-105"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    Update Feed
                  </Button>
                  
                  <Button
                    onClick={() => fetchFood(true, true)}
                    disabled={refreshing}
                    className="gap-2 bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 hover:from-purple-600 hover:via-pink-600 hover:to-red-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
                  >
                    <TrendingUp className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    Shuffle & Discover
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 pb-20 lg:pb-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-red-500 rounded-full blur-lg opacity-75 animate-pulse" />
              <div className="relative bg-gradient-to-r from-orange-500 to-red-500 p-6 rounded-full shadow-2xl">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
            </div>
            <div className="text-center mt-6">
              <h3 className="text-xl font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent mb-2">
                Loading deliciousness...
              </h3>
              <p className="text-sm text-muted-foreground">Preparing your personalized food feed</p>
            </div>
          </div>
        ) : spliks.length === 0 ? (
          <div className="px-4 py-12 lg:py-20">
            <Card className="max-w-md mx-auto bg-gradient-to-br from-background via-background/90 to-primary/5 backdrop-blur-xl border-2 border-primary/10 shadow-2xl">
              <CardContent className="p-8 text-center">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-red-500 rounded-full blur-lg opacity-50 animate-pulse" />
                  <div className="relative bg-gradient-to-r from-orange-500 to-red-500 p-4 rounded-full shadow-xl mx-auto w-fit">
                    <Utensils className="h-12 w-12 text-white" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent mb-3">
                  No food videos yet
                </h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Be the first to upload a mouth-watering 3-second clip and start the food revolution!
                </p>
                <div className="flex flex-col gap-3">
                  <Button 
                    onClick={() => fetchFood(true, false)} 
                    variant="outline" 
                    disabled={refreshing}
                    className="bg-background/50 backdrop-blur border-2 border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all duration-300 hover:scale-105"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Updating..." : "Get Latest"}
                  </Button>
                  <Button 
                    onClick={() => fetchFood(true, true)} 
                    disabled={refreshing}
                    className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                  >
                    <Sparkles className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Shuffling..." : "Shuffle & Discover"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="px-2 lg:px-6 py-6">
            {/* Mobile Feed Counter */}
            <div className="lg:hidden text-center mb-4">
              <div className="inline-flex items-center gap-2 bg-background/80 backdrop-blur-xl border border-border/50 rounded-full px-4 py-2 shadow-lg">
                <div className="w-2 h-2 bg-gradient-to-r from-green-400 to-green-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium">
                  {spliks.length} delicious videos
                </span>
                <Sparkles className="h-3 w-3 text-yellow-500" />
              </div>
            </div>

            {/* Desktop Feed Counter */}
            <div className="hidden lg:block text-center mb-8">
              <div className="inline-flex items-center gap-3 bg-gradient-to-r from-background/80 via-background/60 to-background/80 backdrop-blur-xl border border-border/30 rounded-2xl px-6 py-3 shadow-xl">
                <div className="w-3 h-3 bg-gradient-to-r from-green-400 to-green-500 rounded-full animate-pulse" />
                <span className="text-lg font-semibold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
                  {spliks.length} viral food videos loaded
                </span>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span>Fresh shuffle every refresh</span>
                </div>
              </div>
            </div>

            {/* Video Feed Container */}
            <div className="max-w-md lg:max-w-2xl mx-auto">
              <div
                ref={foodFeedRef}
                className="space-y-3 lg:space-y-6"
              >
                {spliks.map((splik, index) => (
                  <div
                    key={splik.id}
                    className="relative group"
                    style={{
                      animationDelay: `${index * 100}ms`
                    }}
                  >
                    {/* Mobile Card Enhancement */}
                    <div className="lg:hidden relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-red-500/10 to-pink-500/10 rounded-3xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="relative bg-background/95 backdrop-blur-xl border border-border/20 rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden">
                        <SplikCard
                          splik={splik as any}
                          onSplik={() => console.log("Splik:", splik.id)}
                          onReact={() => {}}
                          onShare={() => {}}
                        />
                      </div>
                    </div>

                    {/* Desktop Card Enhancement */}
                    <div className="hidden lg:block relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 via-red-500/20 to-pink-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500 scale-110" />
                      <div className="relative bg-gradient-to-br from-background/95 via-background/90 to-background/95 backdrop-blur-xl border-2 border-border/20 hover:border-primary/30 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] overflow-hidden">
                        <SplikCard
                          splik={splik as any}
                          onSplik={() => console.log("Splik:", splik.id)}
                          onReact={() => {}}
                          onShare={() => {}}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Action Section */}
            <div className="text-center mt-12 lg:mt-16">
              <div className="bg-gradient-to-r from-background/80 via-background/60 to-background/80 backdrop-blur-xl border-2 border-border/20 rounded-3xl p-6 lg:p-8 max-w-lg mx-auto shadow-2xl">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 text-yellow-500 animate-pulse" />
                  <h3 className="text-lg font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
                    Want more deliciousness?
                  </h3>
                  <Sparkles className="h-5 w-5 text-yellow-500 animate-pulse" />
                </div>
                
                <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
                  <Button
                    onClick={() => fetchFood(true, false)}
                    variant="outline"
                    disabled={refreshing}
                    className="flex-1 bg-background/50 backdrop-blur border-2 border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all duration-300 hover:scale-105"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Updating..." : "Get Latest"}
                  </Button>
                  <Button
                    onClick={() => fetchFood(true, true)}
                    disabled={refreshing}
                    className="flex-1 bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 hover:from-purple-600 hover:via-pink-600 hover:to-red-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
                  >
                    <TrendingUp className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Shuffling..." : "Shuffle & Discover"}
                  </Button>
                </div>
                
                <p className="text-xs text-muted-foreground mt-4 opacity-75">
                  Every shuffle brings you a completely new mix of viral food content
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Nearby Restaurants Modal - Enhanced */}
      <Dialog
        open={nearbyOpen}
        onOpenChange={(open) => {
          setNearbyOpen(open);
          if (!open) resetSearchState();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-gradient-to-br from-background via-background/95 to-primary/5 backdrop-blur-xl border-2 border-border/20 shadow-2xl">
          <DialogHeader className="space-y-4">
            <DialogTitle className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl blur opacity-75" />
                <div className="relative bg-gradient-to-r from-orange-500 to-red-500 p-2 rounded-2xl">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
                Discover Amazing Restaurants
              </span>
            </DialogTitle>
            <DialogDescription className="text-base leading-relaxed">
              Find incredible restaurants near you, try them out, and share your 3-second food masterpiece with the world! 
              Let's create the ultimate food community together.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-6">
            {/* Privacy Notice - Enhanced */}
            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-2xl border border-blue-200 dark:border-blue-800/30">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Privacy first:</strong> We only access your location when you explicitly tap "Use my location"
              </p>
            </div>

            {/* Location Input - Enhanced */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">Where are you looking?</label>
              <div className="flex gap-3">
                <Input
                  placeholder="City, neighborhood, or ZIP (e.g., Austin TX, 78701)"
                  value={locationQuery}
                  onChange={(e) => {
                    setLocationQuery(e.target.value);
                    if (e.target.value.trim() && coords) {
                      setCoords(null);
                      setLocStage("idle");
                    }
                  }}
                  className="flex-1 bg-background/80 backdrop-blur border-2 border-border/30 hover:border-primary/30 focus:border-primary/50 rounded-2xl transition-all duration-300"
                  disabled={fetchingNearby}
                />
                <Button
                  variant="outline"
                  onClick={requestLocation}
                  className="gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                  disabled={fetchingNearby || locStage === "asking"}
                >
                  <LocateFixed className="h-4 w-4" />
                  {locStage === "asking" ? "Locating..." : "Use location"}
                </Button>
              </div>
            </div>

            {/* Search Options - Enhanced */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Search radius</label>
                <Select
                  value={distanceKey}
                  onValueChange={(v) => setDistanceKey(v as DistanceKey)}
                  disabled={fetchingNearby}
                >
                  <SelectTrigger className="w-full bg-background/80 backdrop-blur border-2 border-border/30 hover:border-primary/30 rounded-2xl transition-all duration-300">
                    <SelectValue placeholder="Choose distance" />
                  </SelectTrigger>
                  <SelectContent className="bg-background/95 backdrop-blur-xl border-2 border-border/20 rounded-2xl shadow-2xl">
                    {DISTANCE_OPTIONS.map((d) => (
                      <SelectItem key={d.key} value={d.key} className="rounded-xl">
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="lg:col-span-2 space-y-2">
                <label className="text-sm font-medium text-foreground">Food category (optional)</label>
                <div className="flex gap-3">
                  <Select 
                    value={categoryKey} 
                    onValueChange={setCategoryKey} 
                    disabled={fetchingNearby}
                  >
                    <SelectTrigger className="w-48 bg-background/80 backdrop-blur border-2 border-border/30 hover:border-primary/30 rounded-2xl transition-all duration-300">
                      <SelectValue placeholder="Any cuisine" />
                    </SelectTrigger>
                    <SelectContent className="bg-background/95 backdrop-blur-xl border-2 border-border/20 rounded-2xl shadow-2xl">
                      {CATEGORY_PRESETS.map((c) => (
                        <SelectItem key={c.key} value={c.key} className="rounded-xl">
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Custom cuisine (e.g., ramen, steakhouse)"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    disabled={categoryKey !== "custom" || fetchingNearby}
                    className="flex-1 bg-background/80 backdrop-blur border-2 border-border/30 hover:border-primary/30 focus:border-primary/50 rounded-2xl transition-all duration-300"
                  />
                </div>
              </div>
            </div>

            {/* Location Status */}
            {locStage === "asking" && (
              <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-950/20 rounded-2xl border border-orange-200 dark:border-orange-800/30">
                <Loader2 className="h-5 w-5 animate-spin text-orange-600 dark:text-orange-400" />
                <p className="text-sm text-orange-800 dark:text-orange-200">
                  Requesting location permission... Please allow location access in your browser.
                </p>
              </div>
            )}

            {coords && (
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-2xl border border-green-200 dark:border-green-800/30">
                <p className="text-sm text-green-800 dark:text-green-200">
                  <span className="font-medium">📍 Location confirmed:</span>{" "}
                  <span className="font-mono text-xs">{coordsPretty}</span>
                  {locationQuery && (
                    <span className="block mt-1 opacity-75">
                      You can edit the location above to search a different area
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Search Button */}
            <div className="flex justify-end">
              <Button
                onClick={runNearbySearch}
                className="gap-2 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 hover:from-orange-600 hover:via-red-600 hover:to-pink-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 px-8"
                disabled={fetchingNearby || (!coords && !locationQuery.trim())}
              >
                <SearchIcon className="h-4 w-4" />
                {fetchingNearby ? "Searching..." : "Discover Restaurants"}
              </Button>
            </div>

            {/* Results Section */}
            {nearbyError && (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-200 dark:border-red-800/30">
                <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                  {nearbyError}
                </p>
              </div>
            )}

            {fetchingNearby && (
              <div className="flex items-center gap-4 p-6 bg-gradient-to-r from-primary/5 to-primary/10 rounded-2xl">
                <div className="relative">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
                <div>
                  <p className="font-medium">Searching for amazing restaurants...</p>
                  <p className="text-sm text-muted-foreground">This might take a moment</p>
                </div>
              </div>
            )}

            {!fetchingNearby && nearby.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-gradient-to-r from-green-400 to-green-500 rounded-full animate-pulse" />
                  <h3 className="text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    Found {nearby.length} amazing restaurant{nearby.length !== 1 ? "s" : ""}!
                  </h3>
                </div>
                <div className="max-h-[50vh] overflow-y-auto rounded-2xl border-2 border-border/20 bg-background/50 backdrop-blur">
                  {nearby.map((restaurant, index) => (
                    <div
                      key={restaurant.id}
                      className="flex items-center justify-between p-4 border-b border-border/20 last:border-b-0 hover:bg-accent/40 transition-all duration-300 group"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {restaurant.name}
                        </div>
                        <div className="text-sm text-muted-foreground truncate mt-1">
                          {restaurant.address}
                          {restaurant.cuisine && (
                            <span className="text-primary"> • {restaurant.cuisine}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3 text-green-500" />
                          <span className="text-xs text-green-600 font-medium">
                            {prettyDistance(restaurant.distanceKm)} away
                          </span>
                        </div>
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(
                          restaurant.name + " " + restaurant.address
                        )}&ll=${restaurant.lat},${restaurant.lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white text-xs px-3 py-2 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 ml-3 flex-shrink-0"
                        title="Open in Google Maps"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!fetchingNearby && nearby.length === 0 && (coords || locationQuery.trim()) && !nearbyError && (
              <div className="text-center p-6 bg-muted/20 rounded-2xl">
                <p className="text-muted-foreground">
                  No restaurants found in this area. Try expanding your search radius or exploring different categories.
                </p>
              </div>
            )}

            {/* Pro Tip */}
            <div className="p-4 bg-gradient-to-r from-yellow-50 via-orange-50 to-red-50 dark:from-yellow-950/20 dark:via-orange-950/20 dark:to-red-950/20 rounded-2xl border border-yellow-200 dark:border-yellow-800/30">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <span className="font-semibold">Pro tip:</span> When you upload your food video, mention the restaurant name 
                  in your title or description so others can discover these amazing spots too!
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
