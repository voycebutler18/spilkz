// src/store/feedStore.ts
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createHomeFeed } from "@/lib/feed";

/* ---------- types ---------- */
export type Splik = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  created_at: string;
  trim_start?: number | null;
  trim_end?: number | null;
  hype_count?: number | null;
  profile?: {
    id?: string;
    username?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

type FeedState = {
  feed: Splik[];
  status: "idle" | "loading" | "ready" | "error";
  lastFetchedAt: number;
};

/* ---------- internal state ---------- */
const state: FeedState = { feed: [], status: "idle", lastFetchedAt: 0 };
const listeners = new Set<() => void>();
let inflight: Promise<Splik[]> | undefined;

const TTL_MS = 60_000; // consider data "fresh" for 60s
const CACHE_KEY = "feed:cached";
const CACHE_TS_KEY = "feed:last";

/* ---------- helpers ---------- */
function emit() {
  for (const l of Array.from(listeners)) l();
}

function readCache(): { rows: Splik[]; ts: number } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    const tsRaw = sessionStorage.getItem(CACHE_TS_KEY);
    if (!raw || !tsRaw) return null;
    const rows = JSON.parse(raw) as Splik[];
    const ts = Number(tsRaw) || 0;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return { rows, ts };
  } catch {
    return null;
  }
}

function writeCache(rows: Splik[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(rows));
    sessionStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  } catch {}
}

function setFeed(items: Splik[]) {
  state.feed = items;
  state.status = "ready";
  state.lastFetchedAt = Date.now();
  writeCache(items);
  emit();
}

function setLastFetchedAt(ts: number) {
  state.lastFetchedAt = ts;
  emit();
}

/* ---------- the one true loader ---------- */
async function loadFromNetwork(): Promise<Splik[]> {
  state.status = "loading";
  emit();

  // fetch base + boosted in parallel (matches your Splash logic)
  const nowIso = new Date().toISOString();
  const allReq = supabase
    .from("spliks")
    .select(
      "id,user_id,title,description,video_url,thumbnail_url,trim_start,trim_end,created_at,hype_count"
    )
    .order("created_at", { ascending: false })
    .limit(150);

  const boostedReq = supabase
    .from("spliks")
    .select(`*, boosted_videos!inner(boost_level,end_date,status)`)
    .gt("boost_score", 0)
    .eq("boosted_videos.status", "active")
    .gt("boosted_videos.end_date", nowIso)
    .order("boost_score", { ascending: false })
    .limit(15);

  const [{ data: base = [] }, { data: boosted = [] }] = await Promise.all([
    allReq,
    boostedReq,
  ] as any);

  // build feed and stitch profiles once
  const built = createHomeFeed(base, boosted, {
    feedType: "home",
    maxResults: 60,
  }) as Splik[];

  const userIds = [...new Set(built.map((r) => r.user_id))];
  let byId: Record<string, any> = {};
  if (userIds.length) {
    const { data: profs = [] } = await supabase
      .from("profiles")
      .select("id,username,display_name,first_name,last_name,avatar_url")
      .in("id", userIds);
    (profs as any[]).forEach((p) => (byId[p.id] = p));
  }

  const stitched = built.map((r) => ({ ...r, profile: byId[r.user_id] || null }));
  setFeed(stitched);
  return stitched;
}

/**
 * Public: ensureFeed()
 * - Returns cached data if fresh
 * - Dedupes concurrent loads
 * - Populates state from session cache immediately when present
 */
async function ensureFeed(): Promise<Splik[]> {
  // 1) If we already have fresh data in memory, return it.
  if (state.status === "ready" && state.feed.length && Date.now() - state.lastFetchedAt < TTL_MS) {
    return state.feed;
  }

  // 2) If there is a session cache and the in-memory state is empty, hydrate fast.
  if (state.feed.length === 0) {
    const cached = readCache();
    if (cached && cached.rows.length) {
      state.feed = cached.rows;
      state.status = "ready";
      state.lastFetchedAt = cached.ts;
      emit();

      // If cache is stale, refresh in background without blanking UI.
      if (Date.now() - cached.ts < TTL_MS) return state.feed;
    }
  }

  // 3) Deduplicate concurrent callers.
  if (inflight) return inflight;

  // 4) Load from network.
  inflight = loadFromNetwork()
    .catch((e) => {
      state.status = "error";
      emit();
      throw e;
    })
    .finally(() => {
      inflight = undefined;
    });

  return inflight;
}

/* ---------- hook API (unchanged usage) ---------- */
export function useFeedStore() {
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };
  const getSnapshot = () => state;
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    feed: s.feed,
    status: s.status,
    lastFetchedAt: s.lastFetchedAt,
    // new
    ensureFeed,
    // legacy setters (you can stop using these)
    setFeed,
    setLastFetchedAt,
  };
}
