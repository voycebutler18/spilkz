// src/pages/Food.tsx
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import SplikCard from "@/components/splik/SplikCard";
import {
  Loader2,
  Utensils,
  MapPin,
  LocateFixed,
  Search as SearchIcon,
  ExternalLink,
  Info,
  Sparkles,
  Star,
  Crown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
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

/* ---------------- Types ---------------- */
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

/* -------------- Constants -------------- */
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

/* -------------- Shuffle helpers -------------- */
const cRandom = () => {
  if (typeof crypto !== "undefined" && (crypto as any).getRandomValues) {
    const u = new Uint32Array(1);
    (crypto as any).getRandomValues(u);
    return u[0] / 2 ** 32;
  }
  return Math.random();
};
const shuffle = <T,>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(cRandom() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ======================= Page ======================= */
export default function Food() {
  const [spliks, setSpliks] = useState<SplikRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();

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

  /* --------- auth --------- */
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  /* --------- initial load + realtime counters --------- */
  useEffect(() => {
    fetchFood(); // auto-shuffle on every visit

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
  }, [user?.id]);

  const fetchFood = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("spliks")
        .select("*")
        .eq("is_food", true)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      if (data?.length) {
        // ALWAYS shuffle entire list; no pinning, no session rotation
        const shuffled = shuffle(
          data.map((item) => ({
            ...item,
            likes_count: item.likes_count || 0,
            comments_count: item.comments_count || 0,
            boost_score: item.boost_score || 0,
          }))
        );

        // attach profiles
        const withProfiles = await Promise.all(
          shuffled.map(async (row: any) => {
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
    } catch (e) {
      console.error("Failed to load food videos:", e);
      toast({
        title: "Error",
        description: "Failed to load food videos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /* ===== Nearby Restaurants (unchanged core) ===== */
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
    unitForDistanceKey === "km" ? `${distanceKm.toFixed(1)} km` : `${(distanceKm * 0.621371).toFixed(1)} mi`;

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
        setNearbyError("No restaurants found in this area. Try increasing the distance or changing the category.");
      }
    } catch (err: any) {
      console.error("Restaurant search error:", err);
      setNearbyError(err.message || "Couldn't load restaurants. Please try again.");
    } finally {
      setFetchingNearby(false);
    }
  };

  const coordsPretty = useMemo(() => {
    if (!coords) return "";
    return `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
  }, [coords]);

  /* ======================= LUXURY UI ======================= */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
      {/* Luxury Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-72 h-72 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/5 to-black/20"></div>
      </div>

      {/* Animated Grid Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="w-full h-full bg-grid-pattern animate-pulse"></div>
      </div>

      {/* Header with Luxury Glass Morphism */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/5 border-b border-white/10 shadow-2xl">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Luxury Crown Icon */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 rounded-2xl blur-lg opacity-60"></div>
                <div className="relative rounded-2xl bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 p-3 shadow-2xl transform hover:scale-105 transition-all duration-300">
                  <Crown className="h-6 w-6 text-white" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-pink-400 to-red-400 rounded-full animate-ping"></div>
                </div>
              </div>
              
              <div className="text-white">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent tracking-wide">
                  Culinary Luxe
                </h1>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <Star className="h-3 w-3 text-yellow-400 fill-current" />
                  <span className="font-medium">Premium food experiences</span>
                  <div className="w-1 h-1 bg-yellow-400 rounded-full"></div>
                  <span className="text-xs opacity-80">Curated for you</span>
                </div>
              </div>
            </div>

            <Button
              onClick={openNearby}
              className="group relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 hover:from-purple-700 hover:via-pink-700 hover:to-red-700 border-0 text-white font-semibold px-6 py-3 rounded-xl shadow-2xl transform hover:scale-105 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>Discover Gems</span>
              </div>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content with Luxury Styling */}
      <main className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full blur-xl opacity-60"></div>
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-white" />
              </div>
            </div>
            <p className="text-white/80 mt-6 text-lg font-medium">Curating your luxury food experience…</p>
            <div className="flex gap-1 mt-3">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce animation-delay-100"></div>
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce animation-delay-200"></div>
            </div>
          </div>
        ) : spliks.length === 0 ? (
          <div className="px-4 py-16">
            <div className="max-w-lg mx-auto">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-3xl blur-xl"></div>
                <Card className="relative bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
                  <CardContent className="relative p-12 text-center">
                    <div className="relative mb-8">
                      <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full blur-lg opacity-60"></div>
                      <div className="relative w-16 h-16 mx-auto bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                        <Utensils className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4">No culinary stories yet</h3>
                    <p className="text-gray-300 leading-relaxed">
                      Be the first to share your gastronomic masterpiece in a 3-second luxury experience!
                    </p>
                    <div className="flex justify-center gap-1 mt-6">
                      <Star className="h-4 w-4 text-yellow-400 fill-current" />
                      <Star className="h-4 w-4 text-yellow-400 fill-current" />
                      <Star className="h-4 w-4 text-yellow-400 fill-current" />
                      <Star className="h-4 w-4 text-yellow-400 fill-current" />
                      <Star className="h-4 w-4 text-yellow-400 fill-current" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-8">
            {spliks.map((splik, index) => (
              <div 
                key={splik.id} 
                className="group relative"
                style={{
                  animation: `fadeInUp 0.6s ease-out ${index * 0.1}s both`
                }}
              >
                {/* Luxury glow effect around each video */}
                <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-yellow-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                
                {/* Premium card wrapper */}
                <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-1 shadow-2xl transform group-hover:scale-[1.02] transition-all duration-500">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-purple-500/10 rounded-3xl"></div>
                  <div className="relative rounded-3xl overflow-hidden">
                    <SplikCard
                      splik={splik as any}
                      onSplik={() => {}}
                      onReact={() => {}}
                      onShare={() => {}}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Luxury Restaurant Discovery Modal */}
      <Dialog
        open={nearbyOpen}
        onOpenChange={(open) => {
          setNearbyOpen(open);
          if (!open) {
            setLocStage("idle");
            setCoords(null);
            setLocationQuery("");
            setNearby([]);
            setNearbyError(null);
            setFetchingNearby(false);
            setDistanceKey("2km");
            setCategoryKey("any");
            setCustomCategory("");
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden bg-slate-900/95 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-3xl">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-pink-900/20"></div>
          
          <DialogHeader className="relative z-10 space-y-4 pb-6 border-b border-white/10">
            <DialogTitle className="flex items-center gap-3 text-2xl">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl blur-lg opacity-60"></div>
                <div className="relative rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 p-3">
                  <MapPin className="h-6 w-6 text-white" />
                </div>
              </div>
              <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent font-bold">
                Discover Culinary Excellence
              </span>
            </DialogTitle>
            <DialogDescription className="text-gray-300 text-lg">
              Find extraordinary dining experiences near you, then capture your 3-second culinary story to inspire others!
            </DialogDescription>
          </DialogHeader>

          <div className="relative z-10 overflow-y-auto max-h-[70vh] pr-2">
            <div className="space-y-8 py-6">
              {/* Premium Info Card */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-2xl blur-lg"></div>
                <div className="relative flex items-start gap-4 p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                  <div className="p-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl">
                    <Info className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-medium mb-1">Privacy First</p>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      Your location is only accessed when you explicitly tap "Use location" - we respect your privacy completely.
                    </p>
                  </div>
                </div>
              </div>

              {/* Location Search Section */}
              <div className="space-y-4">
                <label className="text-white font-semibold text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-yellow-400" />
                  Where shall we discover?
                </label>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
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
                      disabled={fetchingNearby}
                      className="bg-white/10 backdrop-blur-xl border border-white/20 text-white placeholder-gray-400 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={requestLocation}
                    disabled={fetchingNearby || locStage === "asking"}
                    className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 border-0 text-white font-semibold rounded-xl shadow-xl transform hover:scale-105 transition-all duration-300"
                  >
                    <LocateFixed className="h-4 w-4 mr-2" />
                    {locStage === "asking" ? "Locating…" : "Use location"}
                  </Button>
                </div>
              </div>

              {/* Search Controls Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <label className="text-white font-semibold flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    Search radius
                  </label>
                  <Select value={distanceKey} onValueChange={(v) => setDistanceKey(v as DistanceKey)} disabled={fetchingNearby}>
                    <SelectTrigger className="bg-white/10 backdrop-blur-xl border border-white/20 text-white rounded-xl py-3">
                      <SelectValue placeholder="Choose distance" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border border-white/20 rounded-xl">
                      {DISTANCE_OPTIONS.map((d) => (
                        <SelectItem key={d.key} value={d.key} className="text-white hover:bg-white/10">
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="lg:col-span-2 space-y-3">
                  <label className="text-white font-semibold flex items-center gap-2">
                    <div className="w-2 h-2 bg-pink-400 rounded-full"></div>
                    Culinary category
                  </label>
                  <div className="flex gap-3">
                    <Select value={categoryKey} onValueChange={setCategoryKey} disabled={fetchingNearby}>
                      <SelectTrigger className="w-64 bg-white/10 backdrop-blur-xl border border-white/20 text-white rounded-xl py-3">
                        <SelectValue placeholder="Any cuisine" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border border-white/20 rounded-xl max-h-60">
                        {CATEGORY_PRESETS.map((c) => (
                          <SelectItem key={c.key} value={c.key} className="text-white hover:bg-white/10">
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
                      className="flex-1 bg-white/10 backdrop-blur-xl border border-white/20 text-white placeholder-gray-400 rounded-xl px-4 py-3 focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                    />
                  </div>
                </div>
              </div>

              {/* Status Messages with Luxury Styling */}
              {locStage === "asking" && (
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl blur-lg"></div>
                  <div className="relative flex items-center gap-4 p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                    <div className="relative">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                      <div className="absolute inset-0 bg-blue-400/20 rounded-full blur-lg"></div>
                    </div>
                    <p className="text-white font-medium">Requesting location permission…</p>
                  </div>
                </div>
              )}

              {coords && (
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-2xl blur-lg"></div>
                  <div className="relative p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                    <p className="text-white">
                      <span className="font-semibold text-green-400">Location confirmed:</span>{" "}
                      <span className="font-mono text-sm text-gray-300">{coordsPretty}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Search Button */}
              <div className="flex justify-center pt-4">
                <Button
                  onClick={async () => {
                    await runNearbySearch();
                  }}
                  disabled={fetchingNearby || (!coords && !locationQuery.trim())}
                  className="group relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 hover:from-purple-700 hover:via-pink-700 hover:to-red-700 border-0 text-white font-semibold px-8 py-4 rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-300 text-lg"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative flex items-center gap-3">
                    <SearchIcon className="h-5 w-5" />
                    <span>{fetchingNearby ? "Searching…" : "Find Restaurants Near You"}</span>
                  </div>
                </Button>
              </div>

              {/* Error Messages */}
              {nearbyError && (
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-pink-500/20 rounded-2xl blur-lg"></div>
                  <div className="relative p-6 bg-red-900/20 backdrop-blur-xl border border-red-500/30 rounded-2xl">
                    <p className="text-red-200 font-medium">{nearbyError}</p>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {fetchingNearby && (
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl blur-lg"></div>
                  <div className="relative flex items-center gap-4 p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                    <div className="relative">
                      <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                      <div className="absolute inset-0 bg-purple-400/20 rounded-full blur-lg"></div>
                    </div>
                    <p className="text-white font-medium">Searching for extraordinary restaurants…</p>
                  </div>
                </div>
              )}

              {/* Results Section */}
              {!fetchingNearby && nearby.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold text-white">Found {nearby.length} exceptional places</h3>
                    <div className="flex gap-1">
                      <Star className="h-4 w-4 text-yellow-400 fill-current" />
                      <Star className="h-4 w-4 text-yellow-400 fill-current" />
                      <Star className="h-4 w-4 text-yellow-400 fill-current" />
                    </div>
                  </div>
                  
                  <div className="max-h-80 overflow-y-auto rounded-2xl border border-white/20 bg-white/5 backdrop-blur-xl">
                    {nearby.map((restaurant, index) => (
                      <div
                        key={restaurant.id}
                        className="flex items-center justify-between p-6 border-b border-white/10 last:border-b-0 hover:bg-white/5 transition-all duration-300 group"
                        style={{
                          animation: `fadeInUp 0.4s ease-out ${index * 0.05}s both`
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                            <div className="min-w-0">
                              <div className="text-white font-semibold text-lg truncate group-hover:text-yellow-300 transition-colors">
                                {restaurant.name}
                              </div>
                              <div className="text-gray-300 text-sm truncate mt-1">
                                {restaurant.address}
                                {restaurant.cuisine && (
                                  <span className="ml-2 px-2 py-1 bg-purple-500/20 rounded-lg text-xs text-purple-200">
                                    {restaurant.cuisine}
                                  </span>
                                )}
                              </div>
                              <div className="text-yellow-400 text-sm font-medium mt-2">
                                {prettyDistance(restaurant.distanceKm)} away
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <a
                          href={`https://www.google.com/maps?q=${encodeURIComponent(
                            restaurant.name + " " + restaurant.address
                          )}&ll=${restaurant.lat},${restaurant.lon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-4 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-medium rounded-xl shadow-lg transform hover:scale-105 transition-all duration-300"
                          title="Open in Google Maps"
                        >
                          <span>View</span>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!fetchingNearby && nearby.length === 0 && (coords || locationQuery.trim()) && !nearbyError && (
                <div className="text-center p-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-gray-600 to-gray-700 rounded-full flex items-center justify-center">
                    <SearchIcon className="h-8 w-8 text-gray-300" />
                  </div>
                  <p className="text-gray-300 font-medium">
                    No restaurants found. Try a bigger radius or another category.
                  </p>
                </div>
              )}

              {/* Pro Tip */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-2xl blur-lg"></div>
                <div className="relative p-6 bg-gradient-to-br from-yellow-900/20 to-orange-900/20 backdrop-blur-xl border border-yellow-500/30 rounded-2xl">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl flex-shrink-0">
                      <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-yellow-200 font-semibold mb-2">Pro Culinary Tip</p>
                      <p className="text-yellow-100 leading-relaxed">
                        Mention the restaurant name in your title or description so fellow food enthusiasts 
                        can discover these extraordinary culinary destinations too!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <style jsx>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-blob {
          animation: blob 7s infinite;
        }
        
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        
        .animation-delay-100 {
          animation-delay: 0.1s;
        }
        
        .animation-delay-200 {
          animation-delay: 0.2s;
        }
        
        .bg-grid-pattern {
          background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0);
          background-size: 50px 50px;
        }
      `}</style>
    </div>
  );
}
