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

type DistanceKey =
  | "1km"
  | "2km"
  | "5km"
  | "1mi"
  | "3mi"
  | "5mi";

const DISTANCE_OPTIONS: { key: DistanceKey; label: string; meters: number; unit: "km" | "mi" }[] =
  [
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
  { key: "custom", label: "— Custom (type below)", regex: "" }, // Changed from "sea" to "custom"
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user ?? null)
    );
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
    // Reset all state when opening modal
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

  const requestLocation = () => {
    setLocStage("asking");
    setNearbyError(null);
    if (!("geolocation" in navigator)) {
      setLocStage("error");
      setNearbyError("Geolocation is not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const c = { lat: Number(latitude), lon: Number(longitude) };
        setCoords(c);
        setLocStage("have");
        // Clear location query when using device location
        setLocationQuery("");
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
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
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
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error("Search timed out. Please try again.");
      }
      throw error;
    }
  };

  const geocodeToCoords = async (q: string): Promise<{ lat: number; lon: number } | null> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "us,ca"); // Limit to North America for better results
      
      const res = await fetch(url.toString(), { 
        headers: { 
          "Accept-Language": "en",
          "User-Agent": "SplikzApp/1.0"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
      const arr = await res.json() as Array<{ lat: string; lon: string; display_name: string }>;
      if (!arr.length) return null;
      
      console.log("Geocoded location:", arr[0].display_name);
      return { lat: Number(arr[0].lat), lon: Number(arr[0].lon) };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error("Location search timed out. Please try again.");
      }
      throw error;
    }
  };

  const buildCategoryRegex = () => {
    // If a preset (not "any" and not custom), use it
    const preset = CATEGORY_PRESETS.find((c) => c.key === categoryKey);
    if (preset && preset.key !== "any" && preset.key !== "custom") return preset.regex;

    // If custom entered, convert "steak house" -> "steak|house|steakhouse|steak_house"
    const raw = customCategory.trim();
    if (!raw) return "";
    const tokens = raw
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) return "";

    // Build a generous regex
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

    // No category: grab all nearby restaurants, cafes, fast food, bars
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

      // Determine center coords: prefer device coords if present; otherwise geocode locationQuery
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
        } catch (geoError) {
          setNearbyError("Error finding location: " + geoError.message);
          setFetchingNearby(false);
          return;
        }
      }

      const categoryRegex =
        categoryKey === "custom" ? buildCategoryRegex() : buildCategoryRegex() || CATEGORY_PRESETS.find((c) => c.key === categoryKey)?.regex || "";

      const query = buildOverpassAroundQuery(center!, metersForDistanceKey, categoryRegex || "");
      console.log("Running Overpass query for:", { center, radius: metersForDistanceKey, category: categoryRegex });
      
      const json = await overpassFetch(query);
      const elements: any[] = json.elements || [];

      console.log(`Found ${elements.length} raw elements from Overpass`);

      const mapped: NearbyRestaurant[] = elements
        .map((el) => {
          const name = el.tags?.name || el.tags?.brand || "Unnamed Restaurant";
          const rLat = el.lat ?? el.center?.lat;
          const rLon = el.lon ?? el.center?.lon;
          
          if (typeof rLat !== "number" || typeof rLon !== "number") return null;
          
          const distanceKm = haversineKm(center!, { lat: rLat, lon: rLon });
          
          // Skip if outside our distance (with small buffer for rounding)
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

      // Remove duplicates based on name and approximate location
      const uniqueRestaurants = mapped.reduce((acc, restaurant) => {
        const existing = acc.find(r => 
          r.name === restaurant.name && 
          Math.abs(r.lat - restaurant.lat) < 0.0001 && 
          Math.abs(r.lon - restaurant.lon) < 0.0001
        );
        if (!existing) {
          acc.push(restaurant);
        }
        return acc;
      }, [] as NearbyRestaurant[]);

      // Sort by distance and limit results
      const byDistance = uniqueRestaurants
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 100);
        
      console.log(`Processed to ${byDistance.length} unique restaurants`);
      setNearby(byDistance);
      
      if (byDistance.length === 0) {
        setNearbyError("No restaurants found in this area. Try increasing the distance or changing the category.");
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
        video.setAttribute("webkit-playsinline", "true");
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

  // UI helpers
  const coordsPretty = useMemo(() => {
    if (!coords) return "";
    return `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
  }, [coords]);

      {/* Page header */}
      <div className="bg-gradient-to-b from-secondary/10 to-background py-8 px-4">
        <div className="container">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Utensils className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">Food</h1>
                <p className="text-muted-foreground">
                  Delicious 3-second clips • New shuffle each refresh
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {/* Nearby restaurants CTA */}
              <Button
                variant="outline"
                size="sm"
                onClick={openNearby}
                className="gap-2"
                title="Find restaurants near a place or by your location"
              >
                <MapPin className="h-4 w-4" />
                Nearby restaurants
              </Button>

              <Button variant="outline" size="sm" onClick={() => fetchFood(true, false)} disabled={refreshing} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Update
              </Button>
              <Button size="sm" onClick={() => fetchFood(true, true)} disabled={refreshing} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Shuffle
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main feed */}
      <main className="w-full py-6 md:py-8">
        <div className="mx-auto max-w-7xl px-3 sm:px-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Loading delicious content...</p>
            </div>
          ) : spliks.length === 0 ? (
            <Card className="max-w-md mx-auto">
              <CardContent className="p-8 text-center">
                <Utensils className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No food videos yet</h3>
                <p className="text-muted-foreground mb-4">
                  Be the first to upload a delicious clip.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button onClick={() => fetchFood(true, false)} variant="outline" disabled={refreshing}>
                    {refreshing ? "Updating..." : "Get Latest"}
                  </Button>
                  <Button onClick={() => fetchFood(true, true)} disabled={refreshing}>
                    {refreshing ? "Shuffling..." : "Shuffle Food"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="text-center text-sm text-muted-foreground mb-4">
                Showing {spliks.length} food videos • New shuffle each refresh
              </div>
              <div className="w-full">
                <div
                  ref={foodFeedRef}
                  className="max-w-[400px] sm:max-w-[500px] mx-auto space-y-4 md:space-y-6"
                >
                  {spliks.map((splik) => (
                    <SplikCard
                      key={splik.id}
                      splik={splik as any}
                      onSplik={() => console.log("Splik:", splik.id)}
                      onReact={() => {}}
                      onShare={() => {}}
                    />
                  ))}
                </div>
              </div>
              <div className="text-center py-6 border-t border-border/40 mt-8">
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button onClick={() => fetchFood(true, false)} variant="outline" disabled={refreshing} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Updating..." : "Get Latest"}
                  </Button>
                  <Button onClick={() => fetchFood(true, true)} disabled={refreshing} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Shuffling..." : "Shuffle Food"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Nearby Restaurants Modal */}
      <Dialog open={nearbyOpen} onOpenChange={(open) => {
        setNearbyOpen(open);
        if (!open) {
          // Reset everything when modal is closed
          resetSearchState();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Search nearby restaurants
            </DialogTitle>
            <DialogDescription>
              Pick a place (city or ZIP) and distance, optionally choose a category (e.g. Steakhouse).
              Find a spot, try it, then post your 3-second food clip!
            </DialogDescription>
          </DialogHeader>

          {/* Controls */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              We will only use your location if you tap "Use my location".
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="City or ZIP (e.g., Austin, TX or 78701)"
                value={locationQuery}
                onChange={(e) => {
                  setLocationQuery(e.target.value);
                  // Clear device coords when typing a manual location
                  if (e.target.value.trim() && coords) {
                    setCoords(null);
                    setLocStage("idle");
                  }
                }}
                className="flex-1"
                disabled={fetchingNearby}
              />
              <Button 
                variant="outline" 
                onClick={requestLocation} 
                className="gap-2"
                disabled={fetchingNearby || locStage === "asking"}
              >
                <LocateFixed className="h-4 w-4" />
                {locStage === "asking" ? "Getting location..." : "Use my location"}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Distance</label>
                <Select value={distanceKey} onValueChange={(v) => setDistanceKey(v as DistanceKey)} disabled={fetchingNearby}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose distance" />
                  </SelectTrigger>
                  <SelectContent>
                    {DISTANCE_OPTIONS.map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Category (optional)</label>
                <div className="flex gap-2">
                  <Select value={categoryKey} onValueChange={setCategoryKey} disabled={fetchingNearby}>
                    <SelectTrigger className="w-[14rem]">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_PRESETS.map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Custom (e.g., ramen, steak house)"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    disabled={categoryKey !== "custom" || fetchingNearby}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            {locStage === "asking" && (
              <div className="flex items-center gap-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Requesting location permission...</p>
              </div>
            )}

            {coords && (
              <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                Using coordinates: <span className="font-mono">{coordsPretty}</span>
                {locationQuery && (
                  <span className="ml-2">• Clear the text field above to use a different location</span>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button 
                onClick={runNearbySearch} 
                className="gap-2" 
                disabled={fetchingNearby || (!coords && !locationQuery.trim())}
              >
                <SearchIcon className="h-4 w-4" />
                {fetchingNearby ? "Searching..." : "Search"}
              </Button>
            </div>

            {/* Results */}
            {nearbyError && (
              <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-3 rounded">
                {nearbyError}
              </div>
            )}

            {fetchingNearby ? (
              <div className="flex items-center gap-3 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Finding restaurants...</p>
              </div>
            ) : nearby.length > 0 ? (
              <div className="space-y-3">
                <div className="text-sm font-medium">
                  Found {nearby.length} restaurant{nearby.length !== 1 ? 's' : ''}
                </div>
                <div className="max-h-[40vh] overflow-y-auto rounded-md border">
                  {nearby.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between px-3 py-3 border-b last:border-b-0 hover:bg-accent/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.address}
                          {r.cuisine ? ` • ${r.cuisine}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {prettyDistance(r.distanceKm)} away
                        </div>
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(r.name + " " + r.address)}&ll=${r.lat},${r.lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent flex-shrink-0 ml-2"
                        title="Open in Google Maps"
                      >
                        Maps <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-2">
                {coords || locationQuery.trim()
                  ? "No results yet. Try a different distance or category."
                  : "Enter a city/ZIP or use your location to start searching."}
              </div>
            )}

            <p className="text-xs text-muted-foreground border-t pt-3">
              Tip: When you upload a food video, mention the restaurant name in your title or description 
              so others can find it too!
            </p>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
