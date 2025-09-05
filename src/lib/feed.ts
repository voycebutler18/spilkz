// src/lib/feed.ts
import { supabase } from "@/integrations/supabase/client";

/**
 * Simple deterministic shuffle so a user's order stays stable
 * until they refresh (we seed with a value stored in sessionStorage).
 */
function seedRandom(seed: number) {
  return () => {
    // Mulberry32
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function shuffleDeterministic<T>(arr: T[], seed: number): T[] {
  const rand = seedRandom(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type FeedOptions = {
  limit?: number;          // total items to return
  category?: "food" | null;
  forDiscover?: boolean;   // true = discovery weighting (slightly more trending)
};

type ProfileLite = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  created_at: string;
  views?: number | null;
  likes_count?: number | null;
  comments_count?: number | null;
  is_food?: boolean | null;
  profiles?: ProfileLite;
};

const DEFAULT_LIMIT = 24;

/**
 * Returns a blended, reshuffled feed:
 * - Recent window (last 48h) boosted
 * - Plus a trending window (last 7d)
 * - Deterministic shuffle per refresh using a session seed
 * - Optional category filter (e.g., food)
 */
export async function fetchBlendedFeed(opts: FeedOptions = {}): Promise<Splik[]> {
  const {
    limit = DEFAULT_LIMIT,
    category = null,
    forDiscover = false,
  } = opts;

  // keep the same ordering until the user refreshes the page
  const seedKey = forDiscover ? "__feed_seed_discover" : "__feed_seed_home";
  let seed = Number(sessionStorage.getItem(seedKey));
  if (!seed || Number.isNaN(seed)) {
    seed = Math.floor(Math.random() * 1_000_000_000);
    sessionStorage.setItem(seedKey, String(seed));
  }

  // Time windows
  const now = new Date();
  const recentCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(); // 48h
  const trendingCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7d

  // Filters
  const foodFilter = category === "food" ? { is_food: true as const } : {};
  const recentLimit = Math.ceil(limit * (forDiscover ? 0.55 : 0.7));   // Discover: 55% recent, Home: 70% recent
  const trendingLimit = limit * 2; // overfetch, we’ll blend & cut

  // --- 1) Recent (boost freshness), newest first
  const recentQuery = supabase
    .from("spliks")
    .select("*")
    .gte("created_at", recentCutoff)
    .match(foodFilter)
    .order("created_at", { ascending: false })
    .limit(recentLimit);

  const { data: recentRaw, error: recentErr } = await recentQuery;
  if (recentErr) {
    console.error("Recent query error:", recentErr);
  }

  // --- 2) Trending (last 7d), sort by a simple engagement score
  const trendingQuery = supabase
    .from("spliks")
    .select("*")
    .gte("created_at", trendingCutoff)
    .match(foodFilter)
    .order("created_at", { ascending: false }) // temp order; we’ll score & reorder in JS
    .limit(trendingLimit);

  const { data: trendingRaw, error: trendingErr } = await trendingQuery;
  if (trendingErr) {
    console.error("Trending query error:", trendingErr);
  }

  const recent = (recentRaw || []) as Splik[];
  const trendingScored = (trendingRaw || []).map((s) => {
    const views = s.views || 0;
    const likes = s.likes_count || 0;
    const comments = s.comments_count || 0;
    // quick score: likes double-weighted, light view weight
    const score = likes * 2 + comments * 1 + Math.min(views / 20, 15);
    return { ...s, __score: score } as Splik & { __score: number };
  });

  // sort trending by score desc, take a chunk
  const trendingTop = trendingScored
    .sort((a, b) => b.__score - a.__score)
    .slice(0, Math.ceil(limit * (forDiscover ? 0.45 : 0.3))); // Discover: 45% trending, Home: 30%

  // merge unique by id
  const mergedMap = new Map<string, Splik>();
  for (const s of recent) mergedMap.set(s.id, s);
  for (const s of trendingTop) if (!mergedMap.has(s.id)) mergedMap.set(s.id, s);

  // deterministic shuffle so order is stable for this session (until refresh)
  const shuffled = shuffleDeterministic(Array.from(mergedMap.values()), seed).slice(0, limit);

  // attach light profile to each splik for your VideoGrid
  if (shuffled.length) {
    const userIds = [...new Set(shuffled.map((s) => s.user_id))];
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id,username,display_name,avatar_url")
      .in("id", userIds);

    const map = new Map<string, ProfileLite>();
    if (!pErr) {
      (profiles || []).forEach((p: any) => {
        map.set(p.id, {
          username: p.username ?? null,
          display_name: p.display_name ?? null,
          avatar_url: p.avatar_url ?? null,
        });
      });
    }

    return shuffled.map((s) => ({
      ...s,
      profiles: map.get(s.user_id) || undefined,
    }));
  }

  return shuffled;
}
