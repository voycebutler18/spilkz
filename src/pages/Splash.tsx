// src/pages/Splash.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useFeedStore } from "@/store/feedStore";
import { createHomeFeed } from "@/lib/feed";

/* --------- helpers: seeded shuffle + anon id ---------- */
const strToSeed = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};
const mulberry32 = (a: number) => () => {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffleWithSeed = <T,>(arr: T[], seed: number) => {
  const a = arr.slice();
  const rand = mulberry32(seed >>> 0);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
/** session-scoped anon id (so reload reshuffles) */
const getAnonId = () => {
  const KEY = "feed:anon-id";
  try {
    const store = window.sessionStorage;
    let id = store.getItem(KEY);
    if (!id) {
      id =
        (typeof crypto !== "undefined" && "randomUUID" in crypto)
          ? (crypto as any).randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      store.setItem(KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
};
/* ----------------------------------------------------- */

/** warm a few poster images in the HTTP cache */
function warmPosters(urls: (string | null | undefined)[], limit = 6) {
  urls.filter(Boolean).slice(0, limit).forEach((u) => {
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.src = u as string;
  });
}

/** warm metadata for the FIRST video (no heavy download) */
function warmFirstVideoMeta(url?: string | null) {
  if (!url) return;
  try {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    // kick the network request
    v.load();
    // cleanup in a few seconds
    setTimeout(() => v.remove(), 5000);
  } catch {}
}

/** optional: preconnect to CDN/origin of media */
function preconnect(url?: string | null) {
  if (!url) return;
  try {
    const u = new URL(url);
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = `${u.protocol}//${u.host}`;
    link.crossOrigin = "";
    document.head.appendChild(link);
  } catch {}
}

export default function Splash() {
  const navigate = useNavigate();
  const { setFeed, setLastFetchedAt } = useFeedStore();
  const [progress, setProgress] = useState(8);

  // treat a hard reload differently (new session seed)
  const isReload = useMemo(() => {
    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return nav?.type === "reload";
    } catch {
      return false;
    }
  }, []);

  // session seed makes order change each full reload for this viewer
  const sessionSeed = useMemo(() => {
    const seed =
      typeof crypto !== "undefined" && (crypto as any).getRandomValues
        ? (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0)
        : (Math.random() * 2 ** 32) >>> 0;
    try {
      sessionStorage.setItem("feed:session-seed", String(seed));
    } catch {}
    return seed;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const go = async () => {
      try {
        setProgress(12);

        // Signed in user?
        const { data: auth } = await supabase.auth.getUser();
        const viewerId = auth?.user?.id || getAnonId();

        setProgress(22);

        // 1) Fetch base spliks (limit generously to let feed pick top N)
        const nowIso = new Date().toISOString();

        const allResp = await supabase
          .from("spliks")
          .select(`
            id, user_id, title, description, video_url, thumbnail_url,
            trim_start, trim_end, created_at, hype_count
          `)
          .order("created_at", { ascending: false })
          .limit(150);

        // Boosted (optional)
        let boostedData: any[] = [];
        try {
          const boostedResp = await supabase
            .from("spliks")
            .select(`
              *,
              boosted_videos!inner(
                boost_level,
                end_date,
                status
              )
            `)
            .gt("boost_score", 0)
            .eq("boosted_videos.status", "active")
            .gt("boosted_videos.end_date", nowIso)
            .order("boost_score", { ascending: false })
            .limit(15);
          if (boostedResp.data) boostedData = boostedResp.data;
        } catch {
          boostedData = [];
        }

        if (cancelled) return;
        if (allResp.error) throw allResp.error;

        setProgress(40);

        // 2) Build personalized feed
        const feedBase = createHomeFeed(allResp.data || [], boostedData, {
          userId: auth?.user?.id,
          feedType: "home",
          maxResults: 60,
        }) as any[];

        // 3) Deterministic shuffle (per user/device, per reload)
        const seed = (strToSeed(viewerId) ^ sessionSeed) >>> 0;
        let shuffled = shuffleWithSeed(feedBase, seed);

        // Keep newest pinned unless this is a hard reload
        if (!isReload) {
          const newest = (allResp.data || [])[0];
          if (newest) {
            const idx = shuffled.findIndex((x) => x.id === newest.id);
            if (idx > 0) {
              const [item] = shuffled.splice(idx, 1);
              shuffled = [item, ...shuffled];
            }
          }
        }

        setProgress(55);

        // 4) Attach profiles in ONE query
        const uniqueUserIds = Array.from(new Set(shuffled.map((s) => s.user_id).filter(Boolean)));
        let profilesData: any[] = [];
        if (uniqueUserIds.length > 0) {
          const { data, error: profileErr } = await supabase
            .from("profiles")
            .select("id, username, display_name, first_name, avatar_url")
            .in("id", uniqueUserIds);
          if (profileErr) throw profileErr;
          profilesData = data || [];
        }
        const pmap = new Map((profilesData || []).map((p: any) => [p.id, p]));
        let withProfiles = shuffled.map((s) => ({ ...s, profile: pmap.get(s.user_id) }));

        setProgress(68);

        // 5) Attach hype_count if the column isn't populated
        const missingCounts = withProfiles.some((s: any) => typeof s.hype_count !== "number");
        if (missingCounts) {
          const ids = withProfiles.map((s: any) => s.id);
          const map = new Map<string, number>();

          // try "likes"
          try {
            const { data } = await supabase.from("likes").select("video_id").in("video_id", ids);
            (data || []).forEach((r: any) => {
              map.set(r.video_id, (map.get(r.video_id) || 0) + 1);
            });
          } catch {}

          // fallback "hypes"
          if (map.size === 0) {
            try {
              const { data } = await supabase.from("hypes").select("video_id").in("video_id", ids);
              (data || []).forEach((r: any) => {
                map.set(r.video_id, (map.get(r.video_id) || 0) + 1);
              });
            } catch {}
          }

          if (map.size) {
            withProfiles = withProfiles.map((s: any) =>
              typeof s.hype_count === "number" ? s : { ...s, hype_count: map.get(s.id) ?? 0 }
            );
          }
        }

        setProgress(80);

        // 6) Warm the cache for a smoother first frame
        preconnect(withProfiles[0]?.video_url);
        warmPosters(withProfiles.map((s: any) => s.thumbnail_url));
        warmFirstVideoMeta(withProfiles[0]?.video_url);

        // 7) Store for Index page + persist for instant paint
        if (!cancelled) {
          setFeed(withProfiles);
          setLastFetchedAt(Date.now());
          try {
            sessionStorage.setItem("feed:cached", JSON.stringify(withProfiles));
          } catch {}
        }

        setProgress(96);

        // 8) Navigate after a tiny beat (no flash)
        setTimeout(() => {
          if (!cancelled) navigate("/home", { replace: true });
        }, 250);
      } catch {
        // If anything fails, still move on—Index will fallback fetch.
        navigate("/home", { replace: true });
      }
    };

    go();
    return () => {
      cancelled = true;
    };
  }, [navigate, isReload, sessionSeed, setFeed, setLastFetchedAt]);

  return (
    <div className="min-h-[100svh] w-full bg-gradient-to-b from-background to-muted flex items-center justify-center">
      <div className="max-w-sm w-[90%] text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center shadow-sm mb-4 animate-pulse">
          <span className="text-2xl font-black text-primary">S</span>
        </div>

        <h1 className="text-xl font-semibold mb-2">Splikz</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Warming up your personalized feed…
        </p>

        <div className="w-full h-2 rounded-full bg-muted-foreground/10 overflow-hidden">
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        <p className="text-[11px] text-muted-foreground mt-3">
          Preloading videos & posters for an instant feed ✨
        </p>
      </div>
    </div>
  );
}
