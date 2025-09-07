// src/lib/feed.ts
// Complete feed utilities: typed fetchers (from spliks_feed) + session-based rotation

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/** SQL view row from Step 4 */
export type FeedItem = Database["public"]["Views"]["spliks_feed"]["Row"];

/** Optional runtime flags/fields for client-side ranking */
export interface SplikWithScore extends FeedItem {
  likes_count?: number | null;
  comments_count?: number | null;
  boost_score?: number | null;
  tag?: string;           // e.g., "food", "funny" — used by your category filter
  isBoosted?: boolean;    // client flag
  isFresh?: boolean;      // client flag (created within 24h)
}

interface FeedOptions {
  userId?: string;
  category?: string | null;
  feedType?: "home" | "discovery" | "nearby";
  maxResults?: number;
}

/* =============================================================================
   1) Typed fetch helpers (Step 5B)
   ========================================================================== */

/** Latest feed (view already returns ready video_url / thumb_url) */
export async function fetchFeed(limit = 50): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from("spliks_feed")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data || []) as FeedItem[];
}

/** One clip by id */
export async function fetchClipById(id: string): Promise<FeedItem> {
  const { data, error } = await supabase
    .from("spliks_feed")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data as FeedItem;
}

/** Only food clips (if you use `is_food` in the view) */
export async function fetchFoodFeed(limit = 50): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from("spliks_feed")
    .select("*")
    .eq("is_food", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data || []) as FeedItem[];
}

/**
 * Cursor pagination via keyset on (created_at, id).
 * Pass the last item’s {created_at, id} as cursor to get next page.
 */
export async function fetchFeedPage(opts: {
  limit?: number;
  cursor?: { created_at: string; id: string } | null;
  onlyFood?: boolean;
}): Promise<{ items: FeedItem[]; nextCursor: { created_at: string; id: string } | null }> {
  const { limit = 20, cursor = null, onlyFood = false } = opts;

  let query = supabase
    .from("spliks_feed")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (onlyFood) query = query.eq("is_food", true);

  if (cursor) {
    // WHERE created_at < cursor.created_at
    //   OR (created_at = cursor.created_at AND id < cursor.id)
    query = query.or(
      `and(created_at.lt.${cursor.created_at}),and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
    );
  }

  query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const items = (data || []) as FeedItem[];
  const next =
    items.length === limit
      ? { created_at: items[items.length - 1].created_at, id: items[items.length - 1].id }
      : null;

  return { items, nextCursor: next };
}

/**
 * (Optional) Fetch currently boosted spliks.
 * We treat rows in boosted_videos with status='active' and date window.
 * Then we fetch their full feed rows from spliks_feed.
 */
export async function fetchBoostedNow(): Promise<FeedItem[]> {
  const nowISO = new Date().toISOString();

  const { data: boosted, error: bErr } = await supabase
    .from("boosted_videos")
    .select("splik_id")
    .eq("status", "active")
    .lte("start_date", nowISO)
    .gte("end_date", nowISO);

  if (bErr) throw new Error(bErr.message);
  const ids = (boosted || []).map((b) => b.splik_id);
  if (!ids.length) return [];

  const { data: items, error: fErr } = await supabase
    .from("spliks_feed")
    .select("*")
    .in("id", ids);

  if (fErr) throw new Error(fErr.message);
  return (items || []) as FeedItem[];
}

/* =============================================================================
   2) Session-based rotation utilities (corrected & SSR-safe)
   ========================================================================== */

/** Cheap non-crypto hash (stable across refresh for the same string) */
const stringHash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0; // unsigned
};

/** Mulberry32 PRNG — fast, decent distribution for UI shuffling */
const mulberry32 = (seed: number) => {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** SSR-safe session seed stored in sessionStorage (falls back to in-memory) */
const SESSION_SEED_KEY = "__feedRotationSeed";
let memorySeed: number | null = null;

const isBrowser = typeof window !== "undefined";

const getSessionSeed = (): number => {
  if (!isBrowser) {
    // On server, generate once per process (best-effort; client will re-shuffle)
    if (memorySeed == null) {
      memorySeed = Date.now() ^ Math.floor(Math.random() * 1e9);
    }
    return memorySeed;
  }

  try {
    const raw = sessionStorage.getItem(SESSION_SEED_KEY);
    if (raw) return Number(raw);

    // New seed (use crypto if available)
    let seed = Date.now();
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      seed ^= buf[0] >>> 0;
    } else {
      seed ^= Math.floor(Math.random() * 1e9);
    }

    sessionStorage.setItem(SESSION_SEED_KEY, String(seed));
    return seed;
  } catch {
    // sessionStorage blocked? fall back to window prop or memory
    const anyWin = window as any;
    if (!anyWin[SESSION_SEED_KEY]) {
      anyWin[SESSION_SEED_KEY] = Date.now() ^ Math.floor(Math.random() * 1e9);
    }
    return anyWin[SESSION_SEED_KEY];
  }
};

/** Fisher–Yates using seeded RNG */
const shuffleWithSeed = <T>(array: T[], seed: number): T[] => {
  const a = array.slice();
  const rand = mulberry32(seed >>> 0);
  for (let i = a.length - 1; i > 0; i++) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Reset session rotation */
export const forceNewRotation = (): void => {
  if (!isBrowser) {
    memorySeed = null;
    return;
  }
  try {
    sessionStorage.removeItem(SESSION_SEED_KEY);
  } catch {
    delete (window as any)[SESSION_SEED_KEY];
  }
};

/** Debug info */
export const getRotationInfo = () => ({
  sessionSeed:
    (isBrowser && (() => {
      try {
        return sessionStorage.getItem(SESSION_SEED_KEY) || (window as any)[SESSION_SEED_KEY] || "Not set";
      } catch {
        return (window as any)[SESSION_SEED_KEY] || "Not set";
      }
    })()) || memorySeed || "Not set (SSR)",
  nextRotationOn: "Page refresh",
});

/* =============================================================================
   3) Rotation + feed builders
   ========================================================================== */

/** Apply session-based rotation with optional category filter & maxResults */
export const applySessionRotation = <T extends SplikWithScore>(
  items: T[],
  options: FeedOptions
): T[] => {
  if (!items.length) return items;

  const sessionSeed = getSessionSeed();

  // Salt by user (stable per user) — use a hash so we never get NaN
  const userSalt = options.userId ? stringHash(options.userId) : 0;
  const finalSeed = (sessionSeed ^ userSalt) >>> 0;

  const shuffled = shuffleWithSeed(items, finalSeed);

  // Optional category filter: check tag first, then description/title fallback
  const cat = options.category?.toLowerCase().trim();
  const filtered = cat
    ? shuffled.filter((item) => {
        if (item.tag && item.tag.toLowerCase().includes(cat)) return true;
        if (item.description && item.description.toLowerCase().includes(cat)) return true;
        if (item.title && item.title.toLowerCase().includes(cat)) return true;
        return false;
      })
    : shuffled;

  return filtered.slice(0, options.maxResults || 30);
};

/** Mark content fresh if within last 24h */
const markFresh = <T extends FeedItem>(rows: T[]): (T & { isFresh: boolean })[] => {
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;
  return rows.map((r) => ({
    ...r,
    isFresh: new Date(r.created_at).getTime() > cutoff,
  }));
};

/** Ensure unique by id (keep first occurrence) */
const dedupeById = <T extends { id: string }>(rows: T[]): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
};

/** (Optional) Interleave boosted items at an interval, preserving order otherwise */
const interleaveBoosted = <T extends SplikWithScore>(items: T[], every = 5): T[] => {
  const boosted = items.filter((i) => i.isBoosted);
  const organic = items.filter((i) => !i.isBoosted);

  if (!boosted.length) return items;

  const out: T[] = [];
  let b = 0, o = 0, count = 0;

  while (o < organic.length || b < boosted.length) {
    if (count % every === 0 && b < boosted.length) {
      out.push(boosted[b++]);
    } else if (o < organic.length) {
      out.push(organic[o++]);
    } else if (b < boosted.length) {
      out.push(boosted[b++]);
    }
    count++;
  }

  return out;
};

/** Build a "home" feed from data you already have in memory */
export const createHomeFeed = (
  allSpliks: FeedItem[],
  boostedSpliks: FeedItem[] = [],
  options: FeedOptions = {}
): SplikWithScore[] => {
  if (!allSpliks.length) return [];

  const boostedMarked: SplikWithScore[] = boostedSpliks.map((s) => ({
    ...s,
    isBoosted: true,
  }));

  const freshMarked: SplikWithScore[] = markFresh(allSpliks);

  const combined = dedupeById<SplikWithScore>([...boostedMarked, ...freshMarked]);

  // First rotate, then (optionally) promote boosted evenly
  const rotated = applySessionRotation(combined, options);
  const promoted = interleaveBoosted(rotated, 5); // every 5 items, adjust as needed
  return promoted;
};

/** Discovery feed = rotation only (no boosting rules) */
export const createDiscoveryFeed = (
  allSpliks: FeedItem[],
  options: FeedOptions = {}
): SplikWithScore[] => {
  if (!allSpliks.length) return [];
  return applySessionRotation(allSpliks as SplikWithScore[], options);
};

/** Back-compat alias used by some pages */
export const applyDiscoveryFeedRotation = applySessionRotation;

/* =============================================================================
   4) Convenience: Remote builders (fetch + build)
   ========================================================================== */

/** Fetch latest + boosted-now, then build home feed */
export async function fetchHomeFeed(options: FeedOptions = {}): Promise<SplikWithScore[]> {
  const [latest, boosted] = await Promise.all([fetchFeed(200), fetchBoostedNow()]);
  return createHomeFeed(latest, boosted, options);
}

/** Fetch discovery (latest) and rotate */
export async function fetchDiscoveryFeed(options: FeedOptions = {}): Promise<SplikWithScore[]> {
  const latest = await fetchFeed(200);
  return createDiscoveryFeed(latest, options);
}

/** Fetch food-only and rotate */
export async function fetchFoodDiscovery(options: FeedOptions = {}): Promise<SplikWithScore[]> {
  const foods = await fetchFoodFeed(200);
  return createDiscoveryFeed(foods, options);
}

/* =============================================================================
   5) Utilities you might already be using
   ========================================================================== */

/** Create a time-based seed if you want periodic rotations (legacy helper) */
export const createTimeBasedSeed = (intervalMinutes: number = 60): number => {
  const now = new Date();
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(now.getTime() / intervalMs);
};
