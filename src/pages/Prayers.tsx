// src/pages/Prayers.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPrayers, Prayer } from "@/lib/prayers";
import PrayerComposer from "@/components/prayers/PrayerComposer";
import PrayerCard from "@/components/prayers/PrayerCard";
import PrayerMediaUpload, { PrayerMediaItem } from "@/components/prayers/PrayerMediaUpload";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

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
import {
  MapPin,
  LocateFixed,
  Search as SearchIcon,
  ExternalLink,
  Loader2,
  Sparkles,
  X,
  Plus,
  Trash2,
} from "lucide-react";

/* =================== Helpers for media rail =================== */
const PRAYER_BUCKET = import.meta.env.VITE_PRAYERS_BUCKET || "prayers_media";
const pathFromPublicUrl = (url: string) => {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const idx = parts.findIndex((p) => p === PRAYER_BUCKET);
    if (idx >= 0) return decodeURIComponent(parts.slice(idx + 1).join("/"));
  } catch {}
  return null;
};

/* =================== Prayers Media Rail =================== */
function PrayersMediaRail({ currentUserId }: { currentUserId?: string | null }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PrayerMediaItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("prayer_media")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(60);
        if (error) throw error;
        if (!alive) return;
        const rows = (data || []).map((r: any) => ({
          id: String(r.id),
          user_id: r.user_id as string,
          kind: (r.kind as "photo" | "video") || "photo",
          url: r.url as string,
          thumbnail_url: r.thumbnail_url ?? null,
          duration: r.duration ?? null,
          description: r.description ?? null,
          created_at: r.created_at as string,
        })) as PrayerMediaItem[];
        setItems(rows);
      } catch (e) {
        console.error("prayer_media load error", e);
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();

    const ch = supabase
      .channel("prayers-media-rail")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "prayer_media" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "prayer_media" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      alive = false;
    };
  }, []);

  const onDelete = async (item: PrayerMediaItem) => {
    if (!currentUserId || currentUserId !== item.user_id) return;
    setDeletingId(item.id);
    try {
      const { error: delErr } = await supabase
        .from("prayer_media")
        .delete()
        .eq("id", item.id)
        .eq("user_id", currentUserId);
      if (delErr) throw delErr;

      const p = pathFromPublicUrl(item.url);
      if (p) await supabase.storage.from(PRAYER_BUCKET).remove([p]);

      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="surface p-3 md:p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm md:text-base font-semibold">Prayers — Recent Photos & Videos</h3>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">
          Nothing posted yet. Be the first to share a prayer photo or 3-sec video.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
          {items.map((it) => (
            <div key={it.id} className="relative group rounded-lg overflow-hidden border border-border/40 bg-muted/30">
              {it.kind === "photo" ? (
                <img
                  src={it.url}
                  alt={it.description || "Prayer photo"}
                  className="w-full h-36 md:h-40 object-cover"
                  loading="lazy"
                />
              ) : (
                <video
                  src={it.url}
                  className="w-full h-36 md:h-40 object-cover"
                  muted
                  playsInline
                  preload="metadata"
                  controls
                />
              )}

              {currentUserId === it.user_id && (
                <button
                  onClick={() => onDelete(it)}
                  disabled={deletingId === it.id}
                  className="absolute top-2 right-2 inline-flex items-center justify-center h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/75"
                  title="Delete"
                >
                  {deletingId === it.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================= PRAYERS FEED + FINDER ============================= */

export default function PrayersPage() {
  const [items, setItems] = useState<Prayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  // uploader modal
  const [uploadOpen, setUploadOpen] = useState(false);

  // who am I? (for delete controls in rail)
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, session) =>
      setUserId(session?.user?.id ?? null)
    );
    return () => data.subscription.unsubscribe();
  }, []);

  const load = async (append = false) => {
    try {
      setError(null);
      setLoading(true);
      const currentCursor = append ? items[items.length - 1]?.created_at : undefined;
      const list = (await fetchPrayers({ cursor: currentCursor })) || [];
      setItems((prev) => {
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

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Prayer[]>();
    for (const p of items) {
      const key = format(new Date(p.created_at), "MMM d, yyyy");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries());
  }, [items]);

  /* ============================= CHURCH FINDER POPUP ============================= */

  type DistanceKey = "1mi" | "3mi" | "5mi" | "10mi";
  const DISTANCE_OPTIONS: { key: DistanceKey; label: string; meters: number }[] = [
    { key: "1mi", label: "1 mile", meters: 1609.34 },
    { key: "3mi", label: "3 miles", meters: 4828.03 },
    { key: "5mi", label: "5 miles", meters: 8046.72 },
    { key: "10mi", label: "10 miles", meters: 16093.44 },
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

  type FaithOption = {
    key: string;
    label: string;
    religionRegex: string;
    denomRegex?: string;
  };

  const FAITH_OPTIONS: FaithOption[] = [
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

    { key: "muslim_any", label: "Muslim (Any)", religionRegex: "muslim|islam" },
    { key: "muslim_sunni", label: "Muslim – Sunni", religionRegex: "muslim|islam", denomRegex: "sunni" },
    { key: "muslim_shia", label: "Muslim – Shia", religionRegex: "muslim|islam", denomRegex: "shia|shi[_ ]?ite" },
    { key: "muslim_ahmadiyya", label: "Muslim – Ahmadiyya", religionRegex: "muslim|islam", denomRegex: "ahmadi" },
    { key: "muslim_sufi", label: "Muslim – Sufi", religionRegex: "muslim|islam", denomRegex: "sufi" },

    { key: "jewish_any", label: "Jewish (Any)", religionRegex: "jewish|judaism" },
    { key: "jewish_orthodox", label: "Jewish – Orthodox", religionRegex: "jewish|judaism", denomRegex: "orthodox|chabad|hasidic|haredi|modern[_ ]orthodox" },
    { key: "jewish_conservative", label: "Jewish – Conservative", religionRegex: "jewish|judaism", denomRegex: "conservative" },
    { key: "jewish_reform", label: "Jewish – Reform", religionRegex: "jewish|judaism", denomRegex: "reform" },
    { key: "jewish_reconstructionist", label: "Jewish – Reconstructionist", religionRegex: "jewish|judaism", denomRegex: "reconstructionist" },

    { key: "hindu", label: "Hindu", religionRegex: "hindu" },
    { key: "buddhist_any", label: "Buddhist (Any)", religionRegex: "buddhist" },
    { key: "buddhist_theravada", label: "Buddhist – Theravada", religionRegex: "buddhist", denomRegex: "theravada" },
    { key: "buddhist_mahayana", label: "Buddhist – Mahayana", religionRegex: "buddhist", denomRegex: "mahayana|chan|zen|pure[_ ]land|tiantai" },
    { key: "buddhist_vajrayana", label: "Buddhist – Vajrayana", religionRegex: "buddhist", denomRegex: "vajrayana|tibetan|gelug|kagyu|nyingma|saky[aā]" },
    { key: "sikh", label: "Sikh", religionRegex: "sikh" },
    { key: "jain", label: "Jain", religionRegex: "jain" },
    { key: "taoist", label: "Taoist", religionRegex: "taoist|daoist" },
    { key: "shinto", label: "Shinto", religionRegex: "shinto" },
    { key: "bahai", label: "Bahá'í", religionRegex: "bahai|bahá" },
    { key: "zoroastrian", label: "Zoroastrian", religionRegex: "zoroastrian|parsi" },
    { key: "spiritualist", label: "Spiritualist", religionRegex: "spiritualist" },
    { key: "animist", label: "Traditional / Animist", religionRegex: "animist|traditional|ethnic" },
    { key: "african_religions", label: "African Traditional", religionRegex: "yoruba|ifa|orisha|akan|vodou|voodoo|igbo|bantu|santeria" },
    { key: "other", label: "Other (General Place of Worship)", religionRegex: ".*" },
  ];

  // dialog state
  const [finderOpen, setFinderOpen] = useState(false);
  const [locStage, setLocStage] = useState<"idle" | "asking" | "have" | "error">("idle");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [distanceKey, setDistanceKey] = useState<DistanceKey>("5mi");
  const [faithFilter, setFaithFilter] = useState<string>("christian_any");
  const [faithSearch, setFaithSearch] = useState("");

  const [fetchingNearby, setFetchingNearby] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [nearby, setNearby] = useState<NearbyChurch[]>([]);
  const [broadenNote, setBroadenNote] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);

  // scroll plumbing
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const resultsAnchorRef = useRef<HTMLDivElement | null>(null);

  const metersForDistanceKey = useMemo(
    () => DISTANCE_OPTIONS.find((d) => d.key === distanceKey)?.meters || 8046.72,
    [distanceKey]
  );
  const prettyDistance = (km: number) => `${(km * 0.621371).toFixed(1)} mi`;

  const filteredFaithOptions = useMemo(() => {
    const q = faithSearch.trim().toLowerCase();
    if (!q) return FAITH_OPTIONS;
    return FAITH_OPTIONS.filter((o) => o.label.toLowerCase().includes(q));
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
    setBroadenNote(null);
    setFetchingNearby(false);
    setEnriching(false);
    setDistanceKey("5mi");
    setFaithFilter("christian_any");
    setFaithSearch("");
  };

  /* ------------ Address + name helpers ------------ */
  const normalizeName = (tags: Record<string, string> | undefined) => {
    if (!tags) return "Place of Worship";
    return (
      tags["name"] ||
      tags["name:en"] ||
      tags["official_name"] ||
      tags["brand"] ||
      tags["operator"] ||
      "Place of Worship"
    );
  };

  const assembleAddressFromTags = (tags: Record<string, string> | undefined) => {
    if (!tags) return "";
    if (tags["addr:full"]) return tags["addr:full"];
    const parts: string[] = [];
    const houseNum = tags["addr:housenumber"] || tags["addr:housename"];
    const street = tags["addr:street"] || tags["addr:road"];
    if (houseNum && street) parts.push(`${houseNum} ${street}`);
    else if (street) parts.push(street);
    const neighborhood = tags["addr:neighbourhood"] || tags["addr:suburb"];
    if (neighborhood && !parts.some((p) => p.includes(neighborhood))) parts.push(neighborhood);
    const city = tags["addr:city"] || tags["addr:town"] || tags["addr:village"];
    if (city) parts.push(city);
    const state = tags["addr:state"];
    if (state) parts.push(state);
    const zip = tags["addr:postcode"];
    if (zip) parts.push(zip);
    const fullAddress = parts.join(", ");
    return fullAddress || "";
  };

  async function reverseGeocodeAddress(lat: number, lon: number): Promise<string | null> {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("zoom", "18");
      const res = await fetch(url.toString(), {
        headers: { "Accept-Language": "en", "User-Agent": "SplikzApp/1.0" },
      });
      if (!res.ok) return null;
      const j = (await res.json()) as any;
      const a = j.address || {};
      const parts: string[] = [];
      if (a.house_number && (a.road || a.street)) parts.push(`${a.house_number} ${a.road || a.street}`);
      else if (a.road || a.street) parts.push(a.road || a.street);
      if (a.neighbourhood || a.suburb) parts.push(a.neighbourhood || a.suburb);
      const city = a.city || a.town || a.village || a.municipality;
      if (city) parts.push(city);
      if (a.state) parts.push(a.state);
      if (a.postcode) parts.push(a.postcode);
      const full = parts.join(", ");
      if (full.length > 10) return full;
      if (j.display_name) {
        const displayName = j.display_name.split(",")[0];
        return displayName.length > 5 ? displayName : j.display_name;
      }
      return null;
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      return null;
    }
  }

  async function ensureAddressesForAll(list: NearbyChurch[]) {
    setEnriching(true);
    try {
      const need = list.filter(
        (x) =>
          !x.address ||
          x.address === "Address not available" ||
          (x.address ?? "").startsWith("Near ") ||
          x.address.length < 10
      );
      for (const item of need) {
        try {
          const addr = await reverseGeocodeAddress(item.lat, item.lon);
          if (addr && addr.length > 5) {
            setNearby((prev) => prev.map((p) => (p.id === item.id ? { ...p, address: addr } : p)));
          }
          await new Promise((r) => setTimeout(r, 450));
        } catch {}
      }
    } finally {
      setEnriching(false);
    }
  }

  /* ----------------- Nominatim helpers ----------------- */
  async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
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
  }

  async function geocodeToCoords(q: string): Promise<{ lat: number; lon: number } | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "us");
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
  }

  /* ---------------- Overpass (mirrors + resilient) ---------------- */
  const OVERPASS_ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
  ];

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
            Accept: "application/json",
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
    for (const ep of [...OVERPASS_ENDPOINTS].sort(() => Math.random() - 0.5)) {
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

  const haversineKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const buildQuery = (
    center: { lat: number; lon: number },
    radiusMeters: number,
    religionRegex: string,
    denomRegex?: string,
    nodesOnly = false
  ) => {
    const around = `(around:${Math.round(radiusMeters)},${center.lat},${center.lon})`;
    const base = `["amenity"="place_of_worship"]`;
    const rel = religionRegex ? `["religion"~"${religionRegex}",i]` : "";
    const den = denomRegex ? `["denomination"~"${denomRegex}",i]` : "";
    const nameFallback = denomRegex ? `["name"~"${denomRegex}",i]` : "";
    const brandFallback = denomRegex ? `["brand"~"${denomRegex}",i]` : "";

    const nodePart = `
      node${base}${rel}${den}${around};
      node${base}${rel}${nameFallback}${around};
      node${base}${rel}${brandFallback}${around};
    `;

    const restPart = `
      way${base}${rel}${den}${around};
      way${base}${rel}${nameFallback}${around};
      way${base}${rel}${brandFallback}${around};
      relation${base}${rel}${den}${around};
      relation${base}${rel}${nameFallback}${around};
      relation${base}${rel}${brandFallback}${around};
    `;

    return `
      [out:json][timeout:${nodesOnly ? 25 : 30}];
      ( ${nodePart} ${nodesOnly ? "" : restPart} );
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
      setBroadenNote(null);
      setEnriching(false);
      setFetchingNearby(true);
      setNearby([]);

      let center = coords;
      if (!center) {
        if (!locationQuery.trim()) {
          setNearbyError("Enter a city or ZIP, or use your location.");
          setFetchingNearby(false);
          return;
        }
        const gc = await geocodeToCoords(locationQuery.trim());
        if (!gc) {
          setNearbyError("Couldn't find that place. Try a different city or ZIP code.");
          setFetchingNearby(false);
          return;
        }
        center = gc;
        setCoords(gc);
        setLocStage("have");
      }

      const faith = FAITH_OPTIONS.find((f) => f.key === faithFilter) || FAITH_OPTIONS[0];

      // 1) nodes-only
      let json = await overpassFetch(
        buildQuery(center!, metersForDistanceKey, faith.religionRegex, faith.denomRegex, true)
      );
      let elements: any[] = json.elements || [];

      // 2) broaden to full if empty
      if (!elements.length) {
        json = await overpassFetch(
          buildQuery(center!, metersForDistanceKey, faith.religionRegex, faith.denomRegex, false)
        );
        elements = json.elements || [];
      }

      // 3) if still empty & denominational → broaden to religion-only
      if (!elements.length && faith.denomRegex) {
        setBroadenNote(
          `No exact matches for "${faith.label}". Broadened to ${
            faith.religionRegex === "christian" ? "Christian (Any)" : "religion only"
          }.`
        );
        json = await overpassFetch(
          buildQuery(center!, metersForDistanceKey, faith.religionRegex, undefined, true)
        );
        elements = json.elements || [];
        if (!elements.length) {
          json = await overpassFetch(
            buildQuery(center!, metersForDistanceKey, faith.religionRegex, undefined, false)
          );
          elements = json.elements || [];
        }
      }

      const mapped: NearbyChurch[] = elements
        .map((el) => {
          const name = normalizeName(el.tags);
          const rLat = el.lat ?? el.center?.lat;
          const rLon = el.lon ?? el.center?.lon;
          if (typeof rLat !== "number" || typeof rLon !== "number") return null;

          const distanceKm = haversineKm(center!, { lat: rLat, lon: rLon });
          const maxDistanceKm = metersForDistanceKey / 1000 + 0.1;
          if (distanceKm > maxDistanceKm) return null;

          const addrFromTags = assembleAddressFromTags(el.tags);
          let address = addrFromTags;
          if (!address || address.length < 5) {
            address = `Near ${rLat.toFixed(4)}, ${rLon.toFixed(4)}`;
          }

          return {
            id: `${el.type}/${el.id}`,
            name,
            lat: rLat,
            lon: rLon,
            distanceKm,
            address,
            tags: el.tags || {},
          } as NearbyChurch;
        })
        .filter(Boolean) as NearbyChurch[];

      // dedupe & sort
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

      await ensureAddressesForAll(byDistance);

      if (byDistance.length === 0) {
        setNearbyError("No results found. Try a larger radius or a different denomination.");
      }
    } catch (err: any) {
      console.error("Church search error:", err);
      setNearbyError(err.message || "Couldn't load places of worship. Please try again.");
    } finally {
      setFetchingNearby(false);
    }
  };

  const coordsPretty = useMemo(
    () => (coords ? `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}` : ""),
    [coords]
  );

  const buildGoogleMapsUrl = (place: NearbyChurch) => {
    const addr = place.address ?? "";
    const hasGoodAddress = addr && !addr.startsWith("Near ");
    const q = hasGoodAddress ? `${place.name}, ${addr}` : `${place.lat},${place.lon}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  };

  /* ================================== RENDER ================================== */

  return (
    <div className="mx-auto max-w-3xl px-3 sm:px-4 py-4 space-y-4">
      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-center items-start gap-3">
        <h1 className="text-[22px] sm:text-2xl leading-snug font-semibold">
          Daily Prayers <span className="sm:inline block">and Testimonies</span>
        </h1>

        <div className="flex gap-2 sm:ml-auto w-full sm:w-auto">
          <Button
            onClick={() => setUploadOpen(true)}
            className="bg-primary text-primary-foreground hover:opacity-90 rounded-xl w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Post photo/video
          </Button>

          <Button
            onClick={openFinder}
            className="group relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 hover:from-purple-700 hover:via-pink-700 hover:to-red-700 border-0 text-white font-semibold rounded-xl shadow-2xl
                       w-full sm:w-auto min-h-11 px-4 sm:px-4"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex items-center justify-center gap-2">
              <MapPin className="h-[18px] w-[18px]" />
              <span className="sm:hidden">Find churches</span>
              <span className="hidden sm:inline">Find local churches near you</span>
            </div>
          </Button>
        </div>
      </div>

      {/* media rail */}
      <PrayersMediaRail currentUserId={userId} />

      {/* composer */}
      <PrayerComposer onPosted={(p: Prayer) => setItems((cur) => [p, ...cur])} />

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!error && !loading && items.length === 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          No posts yet. If you've added some and don't see them, check env vars and RLS.
        </div>
      )}

      {grouped.map(([day, list]) => (
        <div key={day} className="space-y-3">
          <div className="sticky top-14 z-10 bg-background/80 backdrop-blur py-2">
            <h2 className="text-xs sm:text-sm font-medium text-muted-foreground">{day}</h2>
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
        <Button
          variant="outline"
          className="text-sm sm:text-base"
          onClick={() => load(true)}
          disabled={loading || !cursor}
        >
          {cursor ? (loading ? "Loading…" : "Load more") : "No more"}
        </Button>
      </div>

      {/* Finder dialog */}
      <Dialog open={finderOpen} onOpenChange={setFinderOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden bg-slate-900/95 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-3xl">
          <button
            aria-label="Close"
            onClick={() => setFinderOpen(false)}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 z-50"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-pink-900/20 pointer-events-none"></div>

          <DialogHeader className="relative z-10 space-y-4 pb-6 border-b border-white/10">
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
            <DialogDescription className="text-gray-300 text-lg">
              Search by location, distance, and denomination.
            </DialogDescription>
          </DialogHeader>

          <div ref={scrollAreaRef} className="relative z-10 h-[70vh] overflow-y-auto">
            <div className="px-4 sm:px-6 py-5 space-y-6 pb-24">
              {/* Location */}
              <div className="space-y-3">
                <label className="text-white font-semibold text-base sm:text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-yellow-400" />
                  Where are we searching?
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    placeholder="City or ZIP (e.g., Chicago, 60601)"
                    value={locationQuery}
                    onChange={(e) => {
                      setLocationQuery(e.target.value);
                      if (e.target.value.trim() && coords) {
                        setCoords(null);
                        setLocStage("idle");
                      }
                    }}
                    disabled={fetchingNearby}
                    className="bg-white/10 border-white/20 text-white placeholder-gray-400 rounded-xl px-4 py-3 text-base"
                  />
                  <Button
                    variant="outline"
                    onClick={requestLocation}
                    disabled={fetchingNearby || locStage === "asking"}
                    className="w-full sm:w-auto px-6 py-3 text-base bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 border-0 text-white font-semibold rounded-xl"
                  >
                    <LocateFixed className="h-4 w-4 mr-2" />
                    {locStage === "asking" ? "Locating…" : "Use location"}
                  </Button>
                </div>
                {locStage === "asking" && (
                  <div className="flex items-center gap-3 text-blue-200 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Requesting location permission…
                  </div>
                )}
                {coords && (
                  <div className="text-green-300 text-sm">
                    Location confirmed: <span className="font-mono">{coordsPretty}</span>
                  </div>
                )}
              </div>

              {/* Distance + Faith */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <label className="text-white font-semibold text-base">Search radius</label>
                  <Select
                    value={distanceKey}
                    onValueChange={(v) => setDistanceKey(v as DistanceKey)}
                    disabled={fetchingNearby}
                  >
                    <SelectTrigger className="bg-white/10 border-white/20 text-white rounded-xl py-3 text-base">
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

                <div className="lg:col-span-2 space-y-2">
                  <label className="text-white font-semibold text-base">Faith / Denomination</label>
                  <div className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-xl p-3">
                    <Input
                      placeholder="Search (e.g., Non-Denominational, Baptist, Sunni, Orthodox)…"
                      value={faithSearch}
                      onChange={(e) => setFaithSearch(e.target.value)}
                      className="mb-3 bg-white/10 border-white/20 text-white placeholder-gray-400 text-base py-3"
                    />
                    <div className="max-h-48 overflow-y-auto">
                      <div className="grid grid-cols-1 gap-2">
                        {filteredFaithOptions.map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setFaithFilter(opt.key)}
                            className={`text-left px-3 py-3 rounded-lg border text-sm sm:text-base transition-all duration-200 ${
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

              {/* Search Button */}
              <div className="flex justify-center pt-2">
                <Button
                  onClick={runNearbySearch}
                  disabled={fetchingNearby || (!coords && !locationQuery.trim())}
                  className="group relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 hover:from-purple-700 hover:via-pink-700 hover:to-red-700 border-0 text-white font-semibold
                             w-full sm:w-auto px-6 py-4 text-base rounded-2xl shadow-2xl min-h-[52px]"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative flex items-center gap-3 justify-center">
                    <SearchIcon className="h-5 w-5" />
                    <span>{fetchingNearby ? "Searching…" : "Find Churches Near You"}</span>
                  </div>
                </Button>
              </div>

              {/* Auto-scroll anchor */}
              <div ref={resultsAnchorRef} />

              {/* Status Messages */}
              {broadenNote && !nearbyError && (
                <div className="p-3 rounded-xl bg-amber-900/20 border border-amber-500/30 text-amber-200 text-sm">
                  {broadenNote}
                </div>
              )}

              {nearbyError && (
                <div className="p-4 rounded-xl bg-red-900/20 border border-red-500/30 text-red-200 text-sm sm:text-base">
                  {nearbyError}
                </div>
              )}

              {(fetchingNearby || enriching) && (
                <div className="flex items-center gap-3 text-purple-200 text-sm sm:text-base justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {fetchingNearby ? "Searching for places of worship…" : "Adding street addresses…"}
                </div>
              )}

              {/* Results */}
              {!fetchingNearby && nearby.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-white text-lg sm:text-xl font-semibold">
                    Found {nearby.length} nearby
                  </h3>
                  <div className="rounded-2xl border border-white/20 bg-white/5 backdrop-blur-xl overflow-hidden">
                    <div className="max-h-[50vh] sm:max_h-[65vh] overflow-y-auto">
                      {nearby.map((place, index) => (
                        <div
                          key={place.id}
                          className={`flex items-start sm:items-center justify-between gap-3 p-4 hover:bg-white/5 transition-all duration-300 ${
                            index !== nearby.length - 1 ? "border-b border-white/10" : ""
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-white font-semibold text-base sm:text-lg mb-1 line-clamp-2">
                              {place.name}
                            </div>
                            <div className="text-gray-300 text-sm leading-relaxed mb-2">
                              {place.address || "Loading address…"}
                            </div>
                            <div className="text-yellow-300 text-sm font-medium">
                              {prettyDistance(place.distanceKm)} away
                            </div>
                          </div>
                          <a
                            href={buildGoogleMapsUrl(place)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 flex items-center gap-2 px-4 py-3 text-sm bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-xl shadow-lg min-h-[44px]"
                            title={`Open ${place.name} in Google Maps`}
                          >
                            <span className="hidden sm:inline">View</span>
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!fetchingNearby && nearby.length === 0 && (coords || locationQuery.trim()) && !nearbyError && (
                <div className="text-center p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl text-gray-300 text-base">
                  No results found. Try a larger radius or a different denomination.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload modal — rail auto-updates via realtime */}
      <PrayerMediaUpload
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => {}}
      />
    </div>
  );
}
