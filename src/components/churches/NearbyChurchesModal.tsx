// src/components/churches/NearbyChurchesModal.tsx
import * as React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { MapPin, LocateFixed, Search as SearchIcon, ExternalLink, Loader2, Sparkles, X } from "lucide-react";

/* ---------------- Types ---------------- */
type DistanceKey = "1km" | "2km" | "5km" | "1mi" | "3mi" | "5mi";
const DISTANCE_OPTIONS: { key: DistanceKey; label: string; meters: number; unit: "km" | "mi" }[] = [
  { key: "1km", label: "1 km", meters: 1000, unit: "km" },
  { key: "2km", label: "2 km", meters: 2000, unit: "km" },
  { key: "5km", label: "5 km", meters: 5000, unit: "km" },
  { key: "1mi", label: "1 mile", meters: 1609.34, unit: "mi" },
  { key: "3mi", label: "3 miles", meters: 4828.03, unit: "mi" },
  { key: "5mi", label: "5 miles", meters: 8046.72, unit: "mi" },
];

type NearbyPlace = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  address?: string;
  tags?: Record<string, string>;
};

type FaithOption = {
  key: string;
  label: string;
  religionRegex: string;   // OSM "religion"
  denomRegex?: string;     // OSM "denomination" or in name/brand
};

/* ---------------- Full catalog ---------------- */
const FAITH_OPTIONS: FaithOption[] = [
  // Christianity
  { key: "christian_any", label: "Christian (Any)", religionRegex: "christian" },
  { key: "christian_nondenom", label: "Christian – Non-Denominational", religionRegex: "christian", denomRegex: "non[-_ ]?denominational|nondenominational" },
  { key: "christian_catholic", label: "Christian – Catholic", religionRegex: "christian", denomRegex: "catholic|roman(_|-)?catholic" },
  { key: "christian_orthodox", label: "Christian – Orthodox (Eastern/Oriental)", religionRegex: "christian", denomRegex: "orthodox|antiochian|syriac|coptic|armenian|ethiopian|eritrean" },
  { key: "christian_anglican", label: "Christian – Anglican / Episcopal", religionRegex: "christian", denomRegex: "anglican|episcopal" },
  { key: "christian_lutheran", label: "Christian – Lutheran", religionRegex: "christian", denomRegex: "lutheran" },
  { key: "christian_presbyterian", label: "Christian – Presbyterian", religionRegex: "christian", denomRegex: "presbyterian" },
  { key: "christian_methodist", label: "Christian – Methodist", religionRegex: "christian", denomRegex: "methodist" },
  { key: "christian_baptist", label: "Christian – Baptist", religionRegex: "christian", denomRegex: "baptist" },
  { key: "christian_pentecostal", label: "Christian – Pentecostal", religionRegex: "christian", denomRegex: "pentecostal|assembl(?:y|ies)\\s?of\\s?god" },
  { key: "christian_evangelical", label: "Christian – Evangelical", religionRegex: "christian", denomRegex: "evangelical" },
  { key: "christian_reformed", label: "Christian – Reformed / Calvinist", religionRegex: "christian", denomRegex: "reformed|calvinist" },
  { key: "christian_adventist", label: "Christian – Seventh-day Adventist", religionRegex: "christian", denomRegex: "adventist|seventh[_ -]?day" },
  { key: "christian_mennonite", label: "Christian – Mennonite / Anabaptist", religionRegex: "christian", denomRegex: "mennonite|anabaptist|amish|hutterite" },
  { key: "christian_church_of_christ", label: "Christian – Church of Christ / Restoration", religionRegex: "christian", denomRegex: "church[_ ]of[_ ]christ|restoration" },
  { key: "christian_quaker", label: "Christian – Quaker (Friends)", religionRegex: "christian", denomRegex: "quaker|friends" },
  { key: "christian_salvation_army", label: "Christian – Salvation Army", religionRegex: "christian", denomRegex: "salvation[_ ]army" },
  { key: "christian_christian_science", label: "Christian – Christian Science", religionRegex: "christian", denomRegex: "christian[_ ]science" },
  { key: "christian_unitarian", label: "Christian – Unitarian Universalist", religionRegex: "christian|unitarian", denomRegex: "unitarian|uu" },
  { key: "christian_lds", label: "Christian – Latter-day Saints (Mormon)", religionRegex: "christian|mormon", denomRegex: "lds|latter[_ ]day|mormon" },
  { key: "christian_jehovah", label: "Christian – Jehovah's Witnesses", religionRegex: "christian", denomRegex: "jehovah" },

  // Islam
  { key: "muslim_any", label: "Muslim (Any)", religionRegex: "muslim|islam" },
  { key: "muslim_sunni", label: "Muslim – Sunni", religionRegex: "muslim|islam", denomRegex: "sunni" },
  { key: "muslim_shia", label: "Muslim – Shia", religionRegex: "muslim|islam", denomRegex: "shia|shi[_ ]?ite" },
  { key: "muslim_ahmadiyya", label: "Muslim – Ahmadiyya", religionRegex: "muslim|islam", denomRegex: "ahmadi" },
  { key: "muslim_sufi", label: "Muslim – Sufi", religionRegex: "muslim|islam", denomRegex: "sufi" },

  // Judaism
  { key: "jewish_any", label: "Jewish (Any)", religionRegex: "jewish|judaism" },
  { key: "jewish_orthodox", label: "Jewish – Orthodox", religionRegex: "jewish|judaism", denomRegex: "orthodox|chabad|hasidic|haredi|modern[_ ]orthodox" },
  { key: "jewish_conservative", label: "Jewish – Conservative", religionRegex: "jewish|judaism", denomRegex: "conservative" },
  { key: "jewish_reform", label: "Jewish – Reform", religionRegex: "jewish|judaism", denomRegex: "reform" },
  { key: "jewish_reconstructionist", label: "Jewish – Reconstructionist", religionRegex: "jewish|judaism", denomRegex: "reconstructionist" },

  // Indian religions
  { key: "hindu", label: "Hindu", religionRegex: "hindu" },
  { key: "buddhist_any", label: "Buddhist (Any)", religionRegex: "buddhist" },
  { key: "buddhist_theravada", label: "Buddhist – Theravada", religionRegex: "buddhist", denomRegex: "theravada" },
  { key: "buddhist_mahayana", label: "Buddhist – Mahayana", religionRegex: "buddhist", denomRegex: "mahayana|chan|zen|pure[_ ]land|tiantai" },
  { key: "buddhist_vajrayana", label: "Buddhist – Vajrayana", religionRegex: "buddhist", denomRegex: "vajrayana|tibetan|gelug|kagyu|nyingma|saky[aā]" },
  { key: "sikh", label: "Sikh", religionRegex: "sikh" },
  { key: "jain", label: "Jain", religionRegex: "jain" },

  // East Asian
  { key: "taoist", label: "Taoist", religionRegex: "taoist|daoist" },
  { key: "shinto", label: "Shinto", religionRegex: "shinto" },

  // Other / Global
  { key: "bahai", label: "Bahá'í", religionRegex: "bahai|bahá" },
  { key: "zoroastrian", label: "Zoroastrian", religionRegex: "zoroastrian|parsi" },
  { key: "spiritualist", label: "Spiritualist", religionRegex: "spiritualist" },
  { key: "animist", label: "Traditional / Animist", religionRegex: "animist|traditional|ethnic" },
  { key: "african_religions", label: "African Traditional", religionRegex: "yoruba|ifa|orisha|akan|vodou|voodoo|igbo|bantu|santeria" },
  { key: "other", label: "Other (General Place of Worship)", religionRegex: ".*" },
];

/* ---------------- Overpass mirrors ---------------- */
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

/* ---------------- Helpers ---------------- */
function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor((Math.random?.() ?? 0.5) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function overpassFetch(query: string) {
  const tryOnce = async (endpoint: string, attempt: number) => {
    const controller = new AbortController();
    const timeoutMs = 12000 + attempt * 2000;
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
          "User-Agent": "SplikzApp/1.0 (church-finder)",
          "Accept": "application/json",
        },
        body: query,
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        if ([429, 502, 503, 504].includes(res.status)) throw new Error(`Transient ${res.status}`);
        const text = await res.text().catch(() => "");
        throw new Error(`Overpass error ${res.status}: ${text || res.statusText}`);
      }
      return await res.json();
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  };

  let lastErr: any = null;
  for (const ep of shuffle(OVERPASS_ENDPOINTS)) {
    try {
      return await tryOnce(ep, lastErr ? 1 : 0);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    String(lastErr?.message || "").includes("abort")
      ? "Search timed out. Please try again."
      : `All Overpass mirrors failed. Please try again in a moment. (${lastErr?.message || "Unknown error"})`
  );
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function buildQueryLight(center: { lat: number; lon: number }, radius: number, relRe: string, denRe?: string) {
  const around = `(around:${Math.round(radius)},${center.lat},${center.lon})`;
  const base = `["amenity"="place_of_worship"]`;
  const rel = relRe ? `["religion"~"${relRe}",i]` : "";
  const den = denRe ? `["denomination"~"${denRe}",i]` : "";
  const nameFallback = denRe ? `["name"~"${denRe}",i]` : "";
  const brandFallback = denRe ? `["brand"~"${denRe}",i]` : "";
  return `
    [out:json][timeout:25];
    (
      node${base}${rel}${den}${around};
      node${base}${rel}${nameFallback}${around};
      node${base}${rel}${brandFallback}${around};
    );
    out center tags;
  `;
}

function buildQueryFull(center: { lat: number; lon: number }, radius: number, relRe: string, denRe?: string) {
  const around = `(around:${Math.round(radius)},${center.lat},${center.lon})`;
  const base = `["amenity"="place_of_worship"]`;
  const rel = relRe ? `["religion"~"${relRe}",i]` : "";
  const den = denRe ? `["denomination"~"${denRe}",i]` : "";
  const nameFallback = denRe ? `["name"~"${denRe}",i]` : "";
  const brandFallback = denRe ? `["brand"~"${denRe}",i]` : "";
  return `
    [out:json][timeout:30];
    (
      node${base}${rel}${den}${around};
      node${base}${rel}${nameFallback}${around};
      node${base}${rel}${brandFallback}${around};
      way${base}${rel}${den}${around};
      way${base}${rel}${nameFallback}${around};
      way${base}${rel}${brandFallback}${around};
      relation${base}${rel}${den}${around};
      relation${base}${rel}${nameFallback}${around};
      relation${base}${rel}${brandFallback}${around};
    );
    out center tags;
  `;
}

/* ---------- Address helpers ---------- */
function buildAddressFromTags(tags: Record<string, string> | undefined) {
  if (!tags) return "";
  const full = tags["addr:full"];
  if (full) return full;

  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ").trim();
  const city = tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || tags["addr:hamlet"] || "";
  const state = tags["addr:state"] || tags["addr:province"] || "";
  const postcode = tags["addr:postcode"] || "";

  const line1 = street && city ? `${street}, ${city}` : (street || city);
  const line2 = [state, postcode].filter(Boolean).join(" ");
  return [line1, line2].filter(Boolean).join(", ");
}

const reverseCache = new Map<string, string>();
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (reverseCache.has(key)) return reverseCache.get(key)!;

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
    const a = j.address ?? {};
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    const city = a.city || a.town || a.village || a.hamlet;
    const state = a.state || a.region;
    const postcode = a.postcode;
    const addr = [street, city, state, postcode].filter(Boolean).join(", ") || j.display_name || null;
    if (addr) reverseCache.set(key, addr);
    return addr;
  } catch {
    return null;
  }
}

/* ---------------- Component ---------------- */
type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export default function NearbyChurchesModal({ open, onOpenChange }: Props) {
  const [locStage, setLocStage] = React.useState<"idle" | "asking" | "have" | "error">("idle");
  const [coords, setCoords] = React.useState<{ lat: number; lon: number } | null>(null);
  const [locationQuery, setLocationQuery] = React.useState("");
  const [distanceKey, setDistanceKey] = React.useState<DistanceKey>("2km");

  const [faithFilter, setFaithFilter] = React.useState<string>("christian_nondenom");
  const [faithSearch, setFaithSearch] = React.useState("");
  const [fetchingNearby, setFetchingNearby] = React.useState(false);
  const [nearbyError, setNearbyError] = React.useState<string | null>(null);
  const [nearby, setNearby] = React.useState<NearbyPlace[]>([]);

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

  const filteredFaithOptions = React.useMemo(() => {
    const q = faithSearch.trim().toLowerCase();
    if (!q) return FAITH_OPTIONS;
    return FAITH_OPTIONS.filter(o => o.label.toLowerCase().includes(q));
  }, [faithSearch]);

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
        const nice = await reverseGeocode(c.lat, c.lon);
        setLocationQuery(nice ?? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`);
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

  async function geocodeToCoords(q: string): Promise<{ lat: number; lon: number } | null> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000);
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
      clearTimeout(id);
      if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
      const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (!arr.length) return null;
      return { lat: Number(arr[0].lat), lon: Number(arr[0].lon) };
    } catch (e: any) {
      clearTimeout(id);
      if (e.name === "AbortError") throw new Error("Location search timed out. Please try again.");
      throw e;
    }
  }

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

      const faith = FAITH_OPTIONS.find(f => f.key === faithFilter) || FAITH_OPTIONS[0];

      // 1) nodes only (faster)
      let json = await overpassFetch(buildQueryLight(center!, metersForDistanceKey, faith.religionRegex, faith.denomRegex));
      let elements: any[] = json.elements || [];

      // 2) full query if empty
      if (!elements.length) {
        json = await overpassFetch(buildQueryFull(center!, metersForDistanceKey, faith.religionRegex, faith.denomRegex));
        elements = json.elements || [];
      }

      const mapped: NearbyPlace[] = elements
        .map((el) => {
          const name = el.tags?.name || el.tags?.brand || "Unnamed Place of Worship";
          const rLat = el.lat ?? el.center?.lat;
          const rLon = el.lon ?? el.center?.lon;
          if (typeof rLat !== "number" || typeof rLon !== "number") return null;
          const distanceKm = haversineKm(center!, { lat: rLat, lon: rLon });
          const maxDistanceKm = metersForDistanceKey / 1000 + 0.1;
          if (distanceKm > maxDistanceKm) return null;

          const addrFromTags = buildAddressFromTags(el.tags);
          return {
            id: `${el.type}/${el.id}`,
            name,
            lat: rLat,
            lon: rLon,
            distanceKm,
            address: addrFromTags || undefined,
            tags: el.tags || {},
          } as NearbyPlace;
        })
        .filter(Boolean) as NearbyPlace[];

      // dedupe
      const unique = mapped.reduce((acc, item) => {
        const existing = acc.find(
          (r) =>
            r.name === item.name &&
            Math.abs(r.lat - item.lat) < 0.0001 &&
            Math.abs(r.lon - item.lon) < 0.0001
        );
        if (!existing) acc.push(item);
        return acc;
      }, [] as NearbyPlace[]);

      const byDistance = unique.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 100);
      setNearby(byDistance);

      // fill a few missing addresses via reverse geocode (polite, throttled)
      const toFill = byDistance.filter(x => !x.address).slice(0, 20);
      for (const p of toFill) {
        const addr = await reverseGeocode(p.lat, p.lon);
        if (addr) {
          setNearby(prev => prev.map(it => (it.id === p.id ? { ...it, address: addr } : it)));
        }
        await new Promise(r => setTimeout(r, 250));
      }

      if (byDistance.length === 0) {
        setNearbyError("No results found. Try a bigger radius or a different faith/denomination.");
      }
    } catch (err: any) {
      console.error("Church search error:", err);
      setNearbyError(err.message || "Couldn't load places of worship. Please try again.");
    } finally {
      setFetchingNearby(false);
    }
  };

  const coordsPretty = React.useMemo(() => {
    if (!coords) return "";
    return `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
  }, [coords]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          max-w-3xl
          max-h-[90vh]
          flex flex-col
          bg-slate-900/95 backdrop-blur-2xl
          border border-white/20 shadow-2xl rounded-3xl
          p-0
        "
      >
        {/* soft gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-pink-900/20 pointer-events-none" />

        {/* Top-right close */}
        <button
          aria-label="Close"
          onClick={() => onOpenChange(false)}
          className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-slate-800/60 hover:bg-slate-800/90 text-white/90 hover:text-white transition"
        >
          <X className="h-5 w-5" />
        </button>

        <DialogHeader className="relative z-10 space-y-4 pb-4 px-6 pt-6 border-b border-white/10 flex-shrink-0">
          <DialogTitle className="flex items-center gap-3 text-2xl">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl blur-lg opacity-60" />
              <div className="relative rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 p-3">
                <MapPin className="h-6 w-6 text-white" />
              </div>
            </div>
            <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent font-bold">
              Find Places of Worship Near You
            </span>
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            Search by location, distance, and denomination. Privacy-friendly and simple.
          </DialogDescription>
        </DialogHeader>

        {/* Body with proper scrolling */}
        <div className="relative z-10 flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Location */}
          <div className="space-y-3">
            <label className="text-white font-semibold text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-400" />
              Where are we searching?
            </label>
            <div className="flex gap-3">
              <Input
                placeholder="City, neighborhood, or ZIP (e.g., Dallas TX, 75201)"
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
            {locStage === "asking" && (
              <div className="flex items-center gap-3 text-blue-200">
                <Loader2 className="h-4 w-4 animate-spin" /> Requesting location permission…
              </div>
            )}
            {coords && (
              <div className="text-green-300 text-sm">
                Location confirmed: <span className="font-mono">{coordsPretty}</span>
              </div>
            )}
          </div>

          {/* Distance + Faith selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-white font-semibold">Search radius</label>
              <Select value={distanceKey} onValueChange={(v) => setDistanceKey(v as DistanceKey)} disabled={fetchingNearby}>
                <SelectTrigger className="bg-white/10 backdrop-blur-xl border border-white/20 text-white rounded-xl py-3">
                  <SelectValue placeholder="Distance" />
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

            <div className="md:col-span-2 space-y-2">
              <label className="text-white font-semibold">Faith / Denomination</label>
              <div className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-xl p-3">
                <Input
                  placeholder="Search denominations (e.g., Non-Denominational, Baptist, Sunni, Orthodox)…"
                  value={faithSearch}
                  onChange={(e) => setFaithSearch(e.target.value)}
                  className="mb-3 bg-white/10 border-white/20 text-white placeholder-gray-400"
                />
                <div className="max-h-64 overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filteredFaithOptions.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setFaithFilter(opt.key)}
                        className={`text-left px-3 py-2 rounded-lg border ${
                          faithFilter === opt.key
                            ? "border-purple-400 bg-purple-400/20 text-white"
                            : "border-white/10 hover:bg-white/10 text-gray-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Search button */}
          <div className="flex justify-center pt-2">
            <Button
              onClick={runNearbySearch}
              disabled={fetchingNearby || (!coords && !locationQuery.trim())}
              className="group relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 hover:from-purple-700 hover:via-pink-700 hover:to-red-700 border-0 text-white font-semibold px-8 py-4 rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-300 text-lg"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative flex items-center gap-3">
                <SearchIcon className="h-5 w-5" />
                <span>{fetchingNearby ? "Searching…" : "Find Churches Near You"}</span>
              </div>
            </Button>
          </div>

          {/* Errors */}
          {nearbyError && (
            <div className="p-4 rounded-xl bg-red-900/20 border border-red-500/30 text-red-200">
              {nearbyError}
            </div>
          )}

          {/* Loading */}
          {fetchingNearby && (
            <div className="flex items-center gap-3 text-purple-200">
              <Loader2 className="h-5 w-5 animate-spin" /> Searching for places of worship…
            </div>
          )}

          {/* Results */}
          {!fetchingNearby && nearby.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-white text-lg font-semibold">Found {nearby.length} nearby</h3>
              <div className="max-h-96 overflow-y-auto rounded-2xl border border-white/20 bg-white/5 backdrop-blur-xl">
                {nearby.map((place) => (
                  <div
                    key={place.id}
                    className="flex items-center justify-between p-4 border-b border-white/10 last:border-b-0 hover:bg-white/5 transition-all duration-300"
                  >
                    <div className="min-w-0">
                      <div className="text-white font-semibold truncate">{place.name}</div>
                      <div className="text-gray-300 text-sm truncate">
                        {place.address || "Address not available"}
                      </div>
                      <div className="text-yellow-300 text-sm font-medium mt-1">
                        {prettyDistance(place.distanceKm)} away
                      </div>
                    </div>
                    <a
                      href={`https://www.google.com/maps?q=${encodeURIComponent(
                        place.name + " " + (place.address || "")
                      )}&ll=${place.lat},${place.lon}`}
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

          {/* Empty state */}
          {!fetchingNearby && nearby.length === 0 && (coords || locationQuery.trim()) && !nearbyError && (
            <div className="text-center p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl text-gray-300">
              No places found. Try a larger radius or a different denomination.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
