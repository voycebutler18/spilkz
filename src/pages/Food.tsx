import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  MapPin,
  LocateFixed,
  Search as SearchIcon,
  ExternalLink,
  Loader2,
  Info,
  Sparkles,
  X,
  Star,
} from "lucide-react";

/* ---------------- Types & constants ---------------- */
type DistanceKey = "1km" | "2km" | "5km" | "1mi" | "3mi" | "5mi";
const DISTANCE_OPTIONS: { key: DistanceKey; label: string; meters: number; unit: "mi" | "km" }[] = [
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

type NearbyRestaurant = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  address?: string;
  cuisine?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/* ---------------- Component ---------------- */
export default function NearbyRestaurantsModal({ open, onOpenChange }: Props) {
  const [locStage, setLocStage] = React.useState<"idle" | "asking" | "have" | "error">("idle");
  const [coords, setCoords] = React.useState<{ lat: number; lon: number } | null>(null);
  const [fetchingNearby, setFetchingNearby] = React.useState(false);
  const [nearby, setNearby] = React.useState<NearbyRestaurant[]>([]);
  const [nearbyError, setNearbyError] = React.useState<string | null>(null);

  const [locationQuery, setLocationQuery] = React.useState("");
  const [distanceKey, setDistanceKey] = React.useState<DistanceKey>("2km");
  const [categoryKey, setCategoryKey] = React.useState<string>("any");
  const [customCategory, setCustomCategory] = React.useState("");

  const unitForDistanceKey = React.useMemo(
    () => DISTANCE_OPTIONS.find((d) => d.key === distanceKey)?.unit || "km",
    [distanceKey]
  );
  const metersForDistanceKey = React.useMemo(
    () => DISTANCE_OPTIONS.find((d) => d.key === distanceKey)?.meters || 2000,
    [distanceKey]
  );
  const prettyDistance = (distanceKm: number) =>
    unitForDistanceKey === "km" ? `${distanceKm.toFixed(1)} km` : `${(distanceKm * 0.621371).toFixed(1)} mi`;

  const coordsPretty = React.useMemo(
    () => (coords ? `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}` : ""),
    [coords]
  );

  /* ---------- helpers (from the working v4 modal) ---------- */
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
      const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (!arr.length) return null;
      return { lat: Number(arr[0].lat), lon: Number(arr[0].lon) };
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") throw new Error("Location search timed out. Please try again.");
      throw error;
    }
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
      if (error.name === "AbortError") throw new Error("Search timed out. Please try again.");
      throw error;
    }
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

      const unique = mapped.reduce((acc, r) => {
        const existing = acc.find(
          (u) =>
            u.name === r.name &&
            Math.abs(u.lat - r.lat) < 0.0001 &&
            Math.abs(u.lon - r.lon) < 0.0001
        );
        if (!existing) acc.push(r);
        return acc;
      }, [] as NearbyRestaurant[]);

      const byDistance = unique.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 100);
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

  const resetAndClose = () => {
    setLocStage("idle");
    setCoords(null);
    setLocationQuery("");
    setNearby([]);
    setNearbyError(null);
    setFetchingNearby(false);
    setDistanceKey("2km");
    setCategoryKey("any");
    setCustomCategory("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : resetAndClose())}>
      <DialogContent
        className="
          max-w-4xl max-h-[90vh] overflow-y-auto
          bg-slate-900/95 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-3xl p-0
        "
      >
        {/* decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-pink-900/20 pointer-events-none" />

        {/* top-right working close */}
        <DialogClose asChild>
          <button
            aria-label="Close"
            className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-slate-800/60 hover:bg-slate-800/90 text-white/90 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </DialogClose>

        <DialogHeader className="relative z-10 space-y-4 pb-4 px-6 pt-6 border-b border-white/10">
          <DialogTitle className="flex items-center gap-3 text-2xl">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl blur-lg opacity-60" />
              <div className="relative rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 p-3">
                <MapPin className="h-6 w-6 text-white" />
              </div>
            </div>
            <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent font-bold">
              Discover Culinary Excellence
            </span>
          </DialogTitle>
          <DialogDescription className="text-gray-300 text-lg">
            Find extraordinary dining experiences near you.
          </DialogDescription>
        </DialogHeader>

        {/* body scroller */}
        <div className="relative z-10 overflow-y-auto overscroll-contain max-h-[calc(90vh-140px)] px-6 pr-8">
          <div className="space-y-8 py-6">
            {/* info card */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-2xl blur-lg"></div>
              <div className="relative flex items-start gap-4 p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                <div className="p-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl">
                  <Info className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium mb-1">Privacy First</p>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    Location is only accessed when you tap “Use location”.
                  </p>
                </div>
              </div>
            </div>

            {/* location */}
            <div className="space-y-4">
              <label className="text-white font-semibold text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-400" />
                Where shall we discover?
              </label>
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
                  disabled={fetchingNearby}
                  className="bg-white/10 backdrop-blur-xl border border-white/20 text-white placeholder-gray-400 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                />
                <Button
                  variant="outline"
                  onClick={requestLocation}
                  disabled={fetchingNearby || locStage === "asking"}
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 border-0 text-white font-semibold rounded-xl shadow-xl"
                >
                  <LocateFixed className="h-4 w-4 mr-2" />
                  {locStage === "asking" ? "Locating…" : "Use location"}
                </Button>
              </div>
            </div>

            {/* controls */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-3">
                <label className="text-white font-semibold">Search radius</label>
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
                <label className="text-white font-semibold">Culinary category</label>
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

            {/* statuses */}
            {locStage === "asking" && (
              <div className="flex items-center gap-3 text-blue-200">
                <Loader2 className="h-5 w-5 animate-spin" /> Requesting location permission…
              </div>
            )}
            {coords && (
              <div className="text-green-300">
                <span className="font-semibold">Location confirmed:</span>{" "}
                <span className="font-mono text-sm text-gray-300">{coordsPretty}</span>
              </div>
            )}

            {/* search */}
            <div className="flex justify-center pt-2">
              <Button
                onClick={runNearbySearch}
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

            {/* error */}
            {nearbyError && (
              <div className="p-4 rounded-xl bg-red-900/20 border border-red-500/30 text-red-200">
                {nearbyError}
              </div>
            )}

            {/* loading */}
            {fetchingNearby && (
              <div className="flex items-center gap-3 text-purple-200">
                <Loader2 className="h-5 w-5 animate-spin" /> Searching for restaurants…
              </div>
            )}

            {/* results */}
            {!fetchingNearby && nearby.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold text-white">Found {nearby.length} places</h3>
                  <div className="flex gap-1">
                    <Star className="h-4 w-4 text-yellow-400 fill-current" />
                    <Star className="h-4 w-4 text-yellow-400 fill-current" />
                    <Star className="h-4 w-4 text-yellow-400 fill-current" />
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto rounded-2xl border border-white/20 bg-white/5 backdrop-blur-xl">
                  {nearby.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-6 border-b border-white/10 last:border-b-0 hover:bg-white/5 transition-all duration-300"
                    >
                      <div className="min-w-0">
                        <div className="text-white font-semibold text-lg truncate">{r.name}</div>
                        <div className="text-gray-300 text-sm truncate mt-1">{r.address}</div>
                        <div className="text-yellow-400 text-sm font-medium mt-2">
                          {prettyDistance(r.distanceKm)} away
                        </div>
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(
                          r.name + " " + (r.address || "")
                        )}&ll=${r.lat},${r.lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-4 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-medium rounded-xl shadow-lg"
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

            {/* empty */}
            {!fetchingNearby && nearby.length === 0 && (coords || locationQuery.trim()) && !nearbyError && (
              <div className="text-center p-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl text-gray-300">
                No restaurants found. Try a bigger radius or another category.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
