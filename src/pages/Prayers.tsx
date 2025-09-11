// src/pages/Prayers.tsx
import { useEffect, useMemo, useState } from "react";
import { fetchPrayers, Prayer } from "@/lib/prayers";
import PrayerComposer from "@/components/prayers/PrayerComposer";
import PrayerCard from "@/components/prayers/PrayerCard";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

/* ===== UI bits used for the popup (same shadcn set you use on Food) ===== */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { MapPin, LocateFixed, Search as SearchIcon, ExternalLink, Loader2, Sparkles } from "lucide-react";

/* ============================= EXISTING PRAYERS PAGE ============================= */

export default function PrayersPage() {
  const [items, setItems] = useState<Prayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const load = async (append = false) => {
    try {
      setError(null);
      setLoading(true);
      const currentCursor = append ? items[items.length - 1]?.created_at : undefined;
      const list = (await fetchPrayers({ cursor: currentCursor })) || [];
      setItems(prev => {
        const newList = append ? [...prev, ...list] : list;
        setCursor(newList.length ? newList[newList.length - 1].created_at : undefined);
        return newList;
      });
    } catch (e: any) {
      console.error("fetchPrayers failed", e);
      setError(e?.message || "Failed to load prayers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(false); /* eslint-disable-next-line */ }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Prayer[]>();
    for (const p of items) {
      const key = format(new Date(p.created_at), "MMM d, yyyy");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries());
  }, [items]);

  /* ============================= NEW: CHURCH FINDER POPUP ============================= */

  type DistanceKey = "1km" | "2km" | "5km" | "1mi" | "3mi" | "5mi";
  const DISTANCE_OPTIONS: { key: DistanceKey; label: string; meters: number; unit: "km" | "mi" }[] = [
    { key: "1km", label: "1 km", meters: 1000, unit: "km" },
    { key: "2km", label: "2 km", meters: 2000, unit: "km" },
    { key: "5km", label: "5 km", meters: 5000, unit: "km" },
    { key: "1mi", label: "1 mile", meters: 1609.34, unit: "mi" },
    { key: "3mi", label: "3 miles", meters: 4828.03, unit: "mi" },
    { key: "5mi", label: "5 miles", meters: 8046.72, unit: "mi" },
  ];

  type NearbyChurch = {
    id: string;
    name: string;
    lat: number;
    lon: number;
    distanceKm: number;
    address?: string;
    tags?: Record<string, string>;
  };

  /** Religion / Denomination catalog (broad, no custom entry, searchable dropdown) */
  type FaithOption = {
    key: string;
    label: string;
    religionRegex: string;    // matches OSM "religion"
    denomRegex?: string;      // matches OSM "denomination" or name/brand if present
  };

  // Includes Christian (Non-Denominational) explicitly, plus many common families.
  const FAITH_OPTIONS: FaithOption[] = [
    // Christianity – umbrella
    { key: "christian_any", label: "Christian (Any)", religionRegex: "christian" },
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
    { key: "christian_jehovah", label: "Christian – Jehovah’s Witnesses", religionRegex: "christian", denomRegex: "jehovah" },
    { key: "christian_nondenom", label: "Christian – Non-Denominational", religionRegex: "christian", denomRegex: "non[-_ ]?denominational|nondenominational" },

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
    { key: "bahai", label: "Bahá’í", religionRegex: "bahai|bahá" },
    { key: "zoroastrian", label: "Zoroastrian", religionRegex: "zoroastrian|parsi" },
    { key: "spiritualist", label: "Spiritualist", religionRegex: "spiritualist" },
    { key: "animist", label: "Traditional / Animist", religionRegex: "animist|traditional|ethnic" },
    { key: "african_religions", label: "African Traditional", religionRegex: "yoruba|ifa|orisha|akan|vodou|voodoo|igbo|bantu|santeria" },
    { key: "other", label: "Other (General Place of Worship)", religionRegex: ".*" },
  ];

  // Popup state
  const [finderOpen, setFinderOpen] = useState(false);
  const [locStage, setLocStage] = useState<"idle" | "asking" | "have" | "error">("idle");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [distanceKey, setDistanceKey] = useState<DistanceKey>("2km");

  const [faithFilter, setFaithFilter] = useState<string>("christian_nondenom");
  const [faithSearch, setFaithSearch] = useState("");
  const [fetchingNearby, setFetchingNearby] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [nearby, setNearby] = useState<NearbyChurch[]>([]);

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

  const filteredFaithOptions = useMemo(() => {
    const q = faithSearch.trim().toLowerCase();
    if (!q) return FAITH_OPTIONS;
    return FAITH_OPTIONS.filter(o => o.label.toLowerCase().includes(q));
  }, [faithSearch]);

  const openFinder = () => {
    setFinderOpen(true);
    resetFinder();
  };
  const resetFinder = () => {
    setLocStage("idle");
    setCoords(null);
    setLocationQuery("");
    setNearby([]);
    setNearbyError(null);
    setFetchingNearby(false);
    setDistanceKey("2km");
    setFaithFilter("christian_nondenom");
    setFaithSearch("");
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

  /* ---------------- Overpass mirrors + resilient fetch ---------------- */
  const OVERPASS_ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
  ];

  async function overpassFetch(query: string) {
    const tryOnce = async (endpoint: string, attempt: number) => {
      const controller = new AbortController();
      const timeoutMs = 12000 + attempt * 2000; // 12s → 18s
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
          if ([429, 502, 503, 504].includes(res.status)) {
            throw new Error(`Transient ${res.status}`);
          }
          const text = await res.text().catch(() => "");
          throw new Error(`Overpass error ${res.status}: ${text || res.statusText}`);
        }
        return await res.json();
      } catch (err) {
        clearTimeout(t);
        throw err;
      }
    };

    const endpoints = [...OVERPASS_ENDPOINTS].sort(() => Math.random() - 0.5);
    let lastError: any = null;
    for (let i = 0; i < endpoints.length; i++) {
      const ep = endpoints[i];
      try {
        if (i > 0) await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
        return await tryOnce(ep, i);
      } catch (e: any) {
        lastError = e;
      }
    }
    throw new Error(
      lastError?.message?.includes("abort")
        ? "Search timed out. Please try again."
        : `All Overpass mirrors failed. Please try again in a moment. (${lastError?.message || "Unknown error"})`
    );
  }

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

  // Light (nodes only) and Full (nodes + ways + relations) query builders
  const buildOverpassAroundQueryLight = (
    center: { lat: number; lon: number },
    radiusMeters: number,
    religionRegex: string,
    denomRegex?: string
  ) => {
    const around = `(around:${Math.round(radiusMeters)},${center.lat},${center.lon})`;
    const base = `["amenity"="place_of_worship"]`;
    const rel = religionRegex ? `["religion"~"${religionRegex}",i]` : "";
    const denom = denomRegex ? `["denomination"~"${denomRegex}",i]` : "";
    const nameFallback = denomRegex ? `["name"~"${denomRegex}",i]` : "";
    const brandFallback = denomRegex ? `["brand"~"${denomRegex}",i]` : "";

    return `
      [out:json][timeout:25];
      (
        node${base}${rel}${denom}${around};
        node${base}${rel}${nameFallback}${around};
        node${base}${rel}${brandFallback}${around};
      );
      out center tags;
    `;
  };

  const buildOverpassAroundQuery = (
    center: { lat: number; lon: number },
    radiusMeters: number,
    religionRegex: string,
    denomRegex?: string
  ) => {
    const around = `(around:${Math.round(radiusMeters)},${center.lat},${center.lon})`;
    const base = `["amenity"="place_of_worship"]`;
    const rel = religionRegex ? `["religion"~"${religionRegex}",i]` : "";
    const denom = denomRegex ? `["denomination"~"${denomRegex}",i]` : "";
    const nameFallback = denomRegex ? `["name"~"${denomRegex}",i]` : "";
    const brandFallback = denomRegex ? `["brand"~"${denomRegex}",i]` : "";

    return `
      [out:json][timeout:30];
      (
        node${base}${rel}${denom}${around};
        node${base}${rel}${nameFallback}${around};
        node${base}${rel}${brandFallback}${around};
        way${base}${rel}${denom}${around};
        way${base}${rel}${nameFallback}${around};
        way${base}${rel}${brandFallback}${around};
        relation${base}${rel}${denom}${around};
        relation${base}${rel}${nameFallback}${around};
        relation${base}${rel}${brandFallback}${around};
      );
      out center tags;
    `;
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

      // 1) FAST: nodes-only
      const lightQ = buildOverpassAroundQueryLight(center!, metersForDistanceKey, faith.religionRegex, faith.denomRegex);
      let json = await overpassFetch(lightQ);
      let elements: any[] = json.elements || [];

      // 2) If empty, try full query (ways + relations too)
      if (!elements.length) {
        const fullQ = buildOverpassAroundQuery(center!, metersForDistanceKey, faith.religionRegex, faith.denomRegex);
        json = await overpassFetch(fullQ);
        elements = json.elements || [];
      }

      const mapped: NearbyChurch[] = elements
        .map((el) => {
          const name = el.tags?.name || el.tags?.brand || "Unnamed Place of Worship";
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
            tags: el.tags || {},
          } as NearbyChurch;
        })
        .filter(Boolean) as NearbyChurch[];

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
      }, [] as NearbyChurch[]);

      const byDistance = unique.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 100);
      setNearby(byDistance);

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

  const coordsPretty = useMemo(() => {
    if (!coords) return "";
    return `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
  }, [coords]);

  /* ================================== RENDER ================================== */

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Daily Prayers and Testimonies</h1>
        {/* NEW: Finder button in the Prayers page header */}
        <Button
          onClick={openFinder}
          className="group relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 hover:from-purple-700 hover:via-pink-700 hover:to-red-700 border-0 text-white font-semibold px-4 py-2 rounded-xl shadow-2xl"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="relative flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span>Find local churches near you</span>
          </div>
        </Button>
      </div>

      {/* Prepend new post instantly */}
      <PrayerComposer onPosted={(p) => setItems((cur) => [p as Prayer, ...cur])} />

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!error && !loading && items.length === 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          No posts yet. If you’ve added some and don’t see them, check env vars and RLS.
        </div>
      )}

      {grouped.map(([day, list]) => (
        <div key={day} className="space-y-3">
          <div className="sticky top-14 z-10 bg-background/80 backdrop-blur py-2">
            <h2 className="text-sm font-medium text-muted-foreground">{day}</h2>
          </div>
          {list.map((p) => (
            <PrayerCard
              key={p.id}
              item={p}
              onDeleted={(id) => setItems((cur) => cur.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      ))}

      <div className="flex justify-center py-4">
        <Button variant="outline" onClick={() => load(true)} disabled={loading || !cursor}>
          {cursor ? (loading ? "Loading…" : "Load more") : "No more"}
        </Button>
      </div>

      {/* ===================== CHURCH FINDER DIALOG ===================== */}
      <Dialog
        open={finderOpen}
        onOpenChange={(open) => {
          setFinderOpen(open);
          if (!open) resetFinder();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden bg-slate-900/95 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-3xl">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-pink-900/20"></div>

          <DialogHeader className="relative z-10 space-y-4 pb-4 border-b border-white/10">
            <DialogTitle className="flex items-center gap-3 text-2xl">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl blur-lg opacity-60"></div>
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

          <div className="relative z-10 overflow-y-auto max-h-[70vh] pr-2">
            <div className="space-y-6 py-6">
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

                {/* Faith dropdown with search box (no custom option) */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-white font-semibold">Faith / Denomination</label>
                  <div className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-xl p-3">
                    <Input
                      placeholder="Search denominations (e.g., Non-Denominational, Baptist, Sunni, Orthodox)…"
                      value={faithSearch}
                      onChange={(e) => setFaithSearch(e.target.value)}
                      className="mb-3 bg-white/10 border-white/20 text-white placeholder-gray-400"
                    />
                    <div className="max-h-52 overflow-y-auto pr-1">
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
                  <div className="max-h-80 overflow-y-auto rounded-2xl border border-white/20 bg-white/5 backdrop-blur-xl">
                    {nearby.map((place) => (
                      <div
                        key={place.id}
                        className="flex items-center justify-between p-4 border-b border-white/10 last:border-b-0 hover:bg-white/5 transition-all duration-300"
                      >
                        <div className="min-w-0">
                          <div className="text-white font-semibold truncate">{place.name}</div>
                          <div className="text-gray-300 text-sm truncate">
                            {place.address}
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
