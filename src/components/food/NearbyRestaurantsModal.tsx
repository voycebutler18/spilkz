// src/components/food/NearbyRestaurantsModal.tsx
import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2, MapPin, Info } from "lucide-react";

type Result = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address?: string;
  distanceMeters: number;
  tags?: Record<string, string>;
};

const DISTANCES = [
  { label: "1 mile", meters: 1609 },
  { label: "3 miles", meters: 4828 },
  { label: "5 miles", meters: 8047 },
  { label: "10 miles", meters: 16093 },
];

const PRESET_CATEGORIES: Record<string, string[]> = {
  // maps to OSM cuisine/name keywords (lowercase, pipe joined in query)
  "Any": [],
  "Breakfast / Brunch": ["breakfast", "brunch"],
  "Steakhouse": ["steak", "steakhouse"],
  "Pizza": ["pizza"],
  "BBQ": ["bbq", "barbecue", "bar-b-que"],
  "Seafood": ["seafood"],
  "Burgers": ["burger", "burgers"],
  "Tacos": ["taco", "taqueria"],
  "Sushi": ["sushi"],
  "Ramen": ["ramen"],
  "Vegan": ["vegan"],
  "Coffee": ["coffee", "cafe"],
};

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function geocodePlace(q: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
    q
  )}`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    display_name: data[0].display_name as string,
  };
}

async function reverseGeocode(lat: number, lon: number) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  const data = await res.json();
  const adr = data?.address ?? {};
  // Try to build a nice compact label: City, State (ZIP)
  const label =
    adr.city ||
    adr.town ||
    adr.village ||
    adr.suburb ||
    adr.neighbourhood ||
    data?.name ||
    "";
  const state = adr.state || adr.region || "";
  const zip = adr.postcode ? ` ${adr.postcode}` : "";
  const pretty = [label, state].filter(Boolean).join(", ") + zip;
  return pretty || data?.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

function cuisineFilterExpr(keywords: string[], custom?: string) {
  const parts: string[] = [];
  if (keywords.length) parts.push(keywords.join("|"));
  if (custom?.trim()) parts.push(custom.trim());
  if (!parts.length) return ""; // no filter
  const re = parts
    .map((s) => s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  // Check both cuisine=* and name=* for the term(s)
  return `["cuisine"~"${re}",i]["name"~".*",i];node(around:R, LAT, LON)["amenity"="restaurant"]["name"~"${re}",i];`;
}

/**
 * Query Overpass for restaurants within radius. Includes node + way (with center)
 */
async function overpassRestaurants(
  lat: number,
  lon: number,
  radiusMeters: number,
  presetKeywords: string[],
  customKeyword?: string
): Promise<Result[]> {
  const filter = cuisineFilterExpr(presetKeywords, customKeyword);
  const query = `
[out:json][timeout:30];
(
  node(around:${radiusMeters},${lat},${lon})["amenity"="restaurant"]${filter ? `["cuisine"~"${presetKeywords.concat(customKeyword || "").join("|")}",i]` : ""};
  way(around:${radiusMeters},${lat},${lon})["amenity"="restaurant"]${filter ? `["cuisine"~"${presetKeywords.concat(customKeyword || "").join("|")}",i]` : ""};
  node(around:${radiusMeters},${lat},${lon})["amenity"="cafe"]${filter ? `["name"~"${presetKeywords.concat(customKeyword || "").join("|")}",i]` : ""};
  way(around:${radiusMeters},${lat},${lon})["amenity"="cafe"]${filter ? `["name"~"${presetKeywords.concat(customKeyword || "").join("|")}",i]` : ""};
);
out center tags;
`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: query,
  });
  const data = await res.json();

  const seen = new Set<string>();
  const results: Result[] = (data.elements || [])
    .map((el: any) => {
      const center = el.type === "node" ? { lat: el.lat, lon: el.lon } : el.center;
      if (!center) return null;
      const id = `${el.type}/${el.id}`;
      if (seen.has(id)) return null;
      seen.add(id);
      const name = el.tags?.name || "Unnamed place";
      const address =
        el.tags?.["addr:full"] ||
        [el.tags?.["addr:housenumber"], el.tags?.["addr:street"], el.tags?.["addr:city"]]
          .filter(Boolean)
          .join(" ");
      return {
        id,
        name,
        lat: center.lat,
        lon: center.lon,
        address,
        tags: el.tags ?? {},
        distanceMeters: haversineMeters(lat, lon, center.lat, center.lon),
      } as Result;
    })
    .filter(Boolean) as Result[];

  // If a custom filter was provided, also filter by name match
  const custom = (customKeyword || "").trim().toLowerCase();
  const keywordSet = new Set(
    (presetKeywords || []).map((k) => k.toLowerCase()).concat(custom ? [custom] : [])
  );

  const filtered = keywordSet.size
    ? results.filter((r) => {
        const name = (r.name || "").toLowerCase();
        const cuisine = (r.tags?.cuisine || "").toLowerCase();
        return [...keywordSet].some((kw) => name.includes(kw) || cuisine.includes(kw));
      })
    : results;

  return filtered.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function NearbyRestaurantsModal({ open, onOpenChange }: Props) {
  const [place, setPlace] = React.useState("");
  const [coords, setCoords] = React.useState<{ lat: number; lon: number } | null>(null);
  const [dist, setDist] = React.useState(DISTANCES[1].meters); // default 3 miles
  const [preset, setPreset] = React.useState("Any");
  const [custom, setCustom] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Result[]>([]);
  const [usingMsg, setUsingMsg] = React.useState<string>("");

  const presetKeywords = PRESET_CATEGORIES[preset] || [];

  const doGeocodeIfNeeded = React.useCallback(async () => {
    if (coords) return coords;
    if (!place.trim()) return null;
    const g = await geocodePlace(place.trim());
    if (!g) return null;
    setUsingMsg(`Using location: ${g.display_name}`);
    setCoords({ lat: g.lat, lon: g.lon });
    return { lat: g.lat, lon: g.lon };
  }, [place, coords]);

  const onUseMyLocation = async () => {
    setError(null);
    setBusy(true);
    try {
      await new Promise<void>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            setCoords({ lat: latitude, lon: longitude });
            setUsingMsg(`Using location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            resolve();
          },
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });

      // Reverse geocode to make the input pretty (City, State)
      if (coords?.lat && coords?.lon) {
        const nice = await reverseGeocode(coords.lat, coords.lon);
        setPlace(nice);
      } else {
        // we just set coords above; fetch again
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const r = await navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const nice = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
            setPlace(nice);
          },
          () => {}
        );
      }
    } catch (e: any) {
      setError(e?.message || "Couldn't access your location.");
    } finally {
      setBusy(false);
    }
  };

  const onSearch = async () => {
    setError(null);
    setBusy(true);
    setResults([]);
    try {
      const c = await doGeocodeIfNeeded();
      if (!c) {
        setError("Enter a city/ZIP or tap “Use my location”.");
        return;
      }
      const data = await overpassRestaurants(c.lat, c.lon, dist, presetKeywords, custom);
      setResults(data);
      setUsingMsg(`Using location: ${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`);
    } catch (e: any) {
      setError("Search failed. Try a different distance or try again.");
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    if (!open) {
      // reset on close to keep things snappy next time
      setBusy(false);
      setError(null);
      setResults([]);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Search nearby restaurants</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5" />
            <p>
              Pick a place (city or ZIP) and distance, optionally choose a category (e.g. Steakhouse).
              Find a spot, try it, then post your 3-second food clip!
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="City or ZIP (e.g., Chicago IL)"
              className="flex-1"
            />
            <Button onClick={onUseMyLocation} variant="outline">
              <MapPin className="h-4 w-4 mr-2" />
              Use my location
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Select
              value={String(dist)}
              onValueChange={(v) => setDist(parseInt(v, 10))}
            >
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Distance" />
              </SelectTrigger>
              <SelectContent>
                {DISTANCES.map((d) => (
                  <SelectItem key={d.meters} value={String(d.meters)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="sm:w-56">
                <SelectValue placeholder="Category (optional)" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(PRESET_CATEGORIES).map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Custom (e.g., steak, ramen)"
            />
          </div>

          {usingMsg && (
            <div className="text-xs text-muted-foreground">{usingMsg}</div>
          )}

          <div className="flex justify-end">
            <Button onClick={onSearch} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Search
            </Button>
          </div>

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto divide-y rounded-md border">
            {results.length === 0 && !busy && (
              <div className="p-4 text-sm text-muted-foreground">
                No results yet. Try a different distance or category.
              </div>
            )}

            {results.map((r) => (
              <div key={r.id} className="p-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.address || `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`}
                  </div>
                  {r.tags?.cuisine && (
                    <div className="text-xs text-muted-foreground">
                      Cuisine: {r.tags.cuisine}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {(r.distanceMeters / 1609).toFixed(1)} mi
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-muted-foreground">
            Tip: When you upload, mention the restaurant name in your description or drop it in the
            comments so others can find it.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
