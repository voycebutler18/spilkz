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

  /* ======================= UI ======================= */
  return (
    // Simplified, solid background to avoid GPU overdraw flicker on scroll
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur border-b">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-r from-orange-500 to-red-500 p-2 shadow">
              <Utensils className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Food</h1>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                <span>Tasty shorts near you</span>
              </div>
            </div>
          </div>

          <Button
            onClick={openNearby}
            size="sm"
            className="gap-2"
          >
            <MapPin className="h-4 w-4" />
            Find restaurants
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto max-w-3xl px-2 sm:px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground">Loading your food feed…</p>
          </div>
        ) : spliks.length === 0 ? (
          <div className="px-4 py-12">
            <Card className="max-w-md mx-auto">
              <CardContent className="p-8 text-center">
                <Utensils className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No food videos yet</h3>
                <p className="text-muted-foreground">Be the first to post a tasty 3-second clip!</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="max-w-md sm:max-w-lg md:max-w-xl mx-auto space-y-4 md:space-y-6">
            {spliks.map((splik) => (
              <div key={splik.id}>
                {/* Let SplikCard manage autoplay by itself (no extra observers = no flicker) */}
                <SplikCard
                  splik={splik as any}
                  onSplik={() => {}}
                  onReact={() => {}}
                  onShare={() => {}}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Nearby Restaurants Modal */}
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-2">
              <div className="rounded-lg bg-gradient-to-r from-orange-500 to-red-500 p-2">
                <MapPin className="h-4 w-4 text-white" />
              </div>
              <span>Discover Amazing Restaurants</span>
            </DialogTitle>
            <DialogDescription>
              Find great spots nearby, then share your 3-second food masterpiece!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-2">
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <Info className="h-4 w-4" />
              <p className="text-sm">We only access your location when you tap “Use location”.</p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Where are you looking?</label>
              <div className="flex gap-2">
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
                />
                <Button
                  variant="outline"
                  onClick={requestLocation}
                  disabled={fetchingNearby || locStage === "asking"}
                  className="gap-2"
                >
                  <LocateFixed className="h-4 w-4" />
                  {locStage === "asking" ? "Locating…" : "Use location"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Search radius</label>
                <Select value={distanceKey} onValueChange={(v) => setDistanceKey(v as DistanceKey)} disabled={fetchingNearby}>
                  <SelectTrigger><SelectValue placeholder="Choose distance" /></SelectTrigger>
                  <SelectContent>
                    {DISTANCE_OPTIONS.map((d) => (
                      <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-medium">Food category (optional)</label>
                <div className="flex gap-2">
                  <Select value={categoryKey} onValueChange={setCategoryKey} disabled={fetchingNearby}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Any cuisine" /></SelectTrigger>
                    <SelectContent>
                      {CATEGORY_PRESETS.map((c) => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Custom cuisine (e.g., ramen, steakhouse)"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    disabled={categoryKey !== "custom" || fetchingNearby}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            {locStage === "asking" && (
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-sm">Requesting location permission…</p>
              </div>
            )}

            {coords && (
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm">
                  <span className="font-medium">Location confirmed:</span>{" "}
                  <span className="font-mono text-xs">{coordsPretty}</span>
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  await runNearbySearch();
                }}
                disabled={fetchingNearby || (!coords && !locationQuery.trim())}
                className="gap-2"
              >
                <SearchIcon className="h-4 w-4" />
                {fetchingNearby ? "Searching…" : "Discover Restaurants"}
              </Button>
            </div>

            {nearbyError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800/30">
                <p className="text-sm text-red-800 dark:text-red-200 font-medium">{nearbyError}</p>
              </div>
            )}

            {fetchingNearby && (
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-sm">Searching for restaurants…</p>
              </div>
            )}

            {!fetchingNearby && nearby.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Found {nearby.length} places</h3>
                <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
                  {nearby.map((restaurant) => (
                    <div
                      key={restaurant.id}
                      className="flex items-center justify-between p-3 border-b last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{restaurant.name}</div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {restaurant.address}
                          {restaurant.cuisine && <span> • {restaurant.cuisine}</span>}
                        </div>
                        <div className="text-xs mt-0.5">
                          {prettyDistance(restaurant.distanceKm)} away
                        </div>
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(
                          restaurant.name + " " + restaurant.address
                        )}&ll=${restaurant.lat},${restaurant.lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-md border hover:bg-accent"
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
              <div className="text-center p-4 bg-muted/20 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  No restaurants found. Try a bigger radius or another category.
                </p>
              </div>
            )}

            <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800/30">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 mt-0.5" />
                <p className="text-sm">
                  <span className="font-semibold">Pro tip:</span> Mention the restaurant name in your title
                  or description so others can discover great spots too!
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
