// src/pages/Splash.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useFeedStore } from "@/store/feedStore";
import { createHomeFeed } from "@/lib/feed";

/* ---------- helpers: seeded shuffle + anon id ---------- */
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
/* ------------------------------------------------------- */

function warmPosters(urls: (string | null | undefined)[], limit = 6) {
  urls.filter(Boolean).slice(0, limit).forEach((u) => {
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.src = u as string;
  });
}
function warmFirstVideoMeta(url?: string | null) {
  if (!url) return;
  try {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    v.load();
    setTimeout(() => v.remove(), 5000);
  } catch {}
}
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

  // ensure we only navigate once
  const navigatedRef = useRef(false);
  const safeNavigateHome = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    navigate("/home", { replace: true });
  };

  // treat a hard reload differently (new session seed)
  const isReload = useMemo(() => {
    try {
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      return nav?.type === "reload";
    } catch {
      return false;
    }
  }, []);

  // per-session seed for deterministic shuffle
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

    // ⏱ hard cap: never sit on Splash > 3.5s
    const failSafe = setTimeout(() => {
      if (!navigatedRef.current) safeNavigateHome();
    }, 3500);

    const primeFromCacheIfAny = () => {
      try {
        const raw = sessionStorage.getItem("feed:cached");
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFeed(parsed);
          setLastFetchedAt(Date.now());
          // tiny beat to let the UI mount
          setTimeout(() => {
            if (!cancelled) safeNavigateHome();
          }, 60);
          return true;
        }
      } catch {}
      return false;
    };

    const go = async () => {
      try {
        setProgress(15);

        // if we already have cache, jump now and refresh in background
        const fastPathed = primeFromCacheIfAny();

        // fetch everything in parallel (no blocking)
        const nowIso = new Date().toISOString();
        const [{ data: auth }] = await Promise.all([supabase.auth.getUser()]);
        const viewerId = auth?.user?.id || getAnonId();

        setProgress((p) => Math.max(p, 25));

        const allReq = supabase
          .from("spliks")
          .select(
            `
            id, user_id, title, description, video_url, thumbnail_url,
            trim_start, trim_end, created_at, hype_count
          `
          )
          .order("created_at", { ascending: false })
          .limit(150);

        const boostedReq = supabase
          .from("spliks")
          .select(
            `
            *,
            boosted_videos!inner(
              boost_level,
              end_date,
              status
            )
          `
          )
          .gt("boost_score", 0)
          .eq("boosted_videos.status", "active")
          .gt("boosted_videos.end_date", nowIso)
          .order("boost_score", { ascending: false })
          .limit(15);

        const [allResp, boostedResp] = await Promise.allSettled([allReq, boostedReq]);

        if (cancelled) return;
        setProgress((p) => Math.max(p, 45));

        const allData =
          allResp.status === "fulfilled" && !allResp.value.error
            ? allResp.value.data || []
            : [];

        const boostedData =
          boostedResp.status === "fulfilled" && !boostedResp.value.error
            ? boostedResp.value.data || []
            : [];

        // build feed
        const feedBase = createHomeFeed(allData, boostedData, {
          userId: auth?.user?.id,
          feedType: "home",
          maxResults: 60,
        }) as any[];

        // deterministic shuffle
        const seed = (strToSeed(viewerId) ^ sessionSeed) >>> 0;
        let shuffled = shuffleWithSeed(feedBase, seed);

        // keep newest on top unless hard reload
        if (!isReload && allData[0]) {
          const newest = allData[0];
          const idx = shuffled.findIndex((x: any) => x.id === newest.id);
          if (idx > 0) {
            const [item] = shuffled.splice(idx, 1);
            shuffled = [item, ...shuffled];
          }
        }

        setProgress((p) => Math.max(p, 60));

        // attach profiles in one query
        const uniqueUserIds = Array.from(
          new Set(shuffled.map((s: any) => s.user_id).filter(Boolean))
        );
        let profilesData: any[] = [];
        if (uniqueUserIds.length > 0) {
          const { data, error: profileErr } = await supabase
            .from("profiles")
            .select("id, username, display_name, first_name, avatar_url")
            .in("id", uniqueUserIds);
          if (!profileErr && data) profilesData = data;
        }
        const pmap = new Map((profilesData || []).map((p: any) => [p.id, p]));
        let withProfiles = shuffled.map((s: any) => ({
          ...s,
          profile: pmap.get(s.user_id),
        }));

        setProgress((p) => Math.max(p, 72));

        // backfill hype_count if missing (best-effort)
        const missingCounts = withProfiles.some(
          (s: any) => typeof s.hype_count !== "number"
        );
        if (missingCounts) {
          const ids = withProfiles.map((s: any) => s.id);
          const map = new Map<string, number>();

          try {
            const { data } = await supabase
              .from("likes")
              .select("video_id")
              .in("video_id", ids);
            (data || []).forEach((r: any) =>
              map.set(r.video_id, (map.get(r.video_id) || 0) + 1)
            );
          } catch {}

          if (map.size === 0) {
            try {
              const { data } = await supabase
                .from("hypes")
                .select("video_id")
                .in("video_id", ids);
              (data || []).forEach((r: any) =>
                map.set(r.video_id, (map.get(r.video_id) || 0) + 1)
              );
            } catch {}
          }

          if (map.size) {
            withProfiles = withProfiles.map((s: any) =>
              typeof s.hype_count === "number"
                ? s
                : { ...s, hype_count: map.get(s.id) ?? 0 }
            );
          }
        }

        setProgress((p) => Math.max(p, 84));

        // warm cache for first item
        preconnect(withProfiles[0]?.video_url);
        warmPosters(withProfiles.map((s: any) => s.thumbnail_url));
        warmFirstVideoMeta(withProfiles[0]?.video_url);

        // store → feed store + session cache
        if (!cancelled) {
          setFeed(withProfiles);
          setLastFetchedAt(Date.now());
          try {
            sessionStorage.setItem("feed:cached", JSON.stringify(withProfiles));
            sessionStorage.setItem("feed:last", String(Date.now()));
          } catch {}
        }

        setProgress(100);

        // if we didn't fast-path earlier, navigate now
        if (!fastPathed && !cancelled) {
          setTimeout(() => safeNavigateHome(), 120);
        }
      } catch {
        // on any error, still proceed to home
        safeNavigateHome();
      }
    };

    go();

    return () => {
      cancelled = true;
      clearTimeout(failSafe);
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
