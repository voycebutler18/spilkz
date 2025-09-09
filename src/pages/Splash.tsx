import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useFeedStore } from "@/store/feedStore";
import { createHomeFeed } from "@/lib/feed";

// --------- helpers: seeded shuffle + anon id ----------
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
const getAnonId = () => {
  const KEY = "feed:anon-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id =
      (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? (crypto as any).randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
};
// -------------------------------------------------------

export default function Splash() {
  const navigate = useNavigate();
  const { setFeed, setLastFetchedAt } = useFeedStore();
  const [progress, setProgress] = useState(8);

  // treat a hard reload differently (new session seed)
  const isReload = useMemo(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === "reload";
  }, []);

  // session seed makes order change each full reload for this viewer
  const sessionSeed = useMemo(() => {
    const seed =
      typeof crypto !== "undefined" && (crypto as any).getRandomValues
        ? (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0)
        : (Math.random() * 2 ** 32) >>> 0;
    sessionStorage.setItem("feed:session-seed", String(seed));
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

        setProgress(20);

        // 1) Fetch spliks (recent first) + boosted subset in parallel
        const nowIso = new Date().toISOString();
        const [allResp, boostedResp] = await Promise.all([
          supabase
            .from("spliks")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(150),
          supabase
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
            .limit(15),
        ]);

        if (cancelled) return;
        if (allResp.error) throw allResp.error;
        if (boostedResp.error) throw boostedResp.error;

        setProgress(40);

        // 2) Build feed (fast; keep as-is)
        const feed = createHomeFeed(allResp.data || [], boostedResp.data || [], {
          userId: auth?.user?.id,
          feedType: "home",
          maxResults: 60,
        }) as any[];

        // 3) Personalized deterministic shuffle (per user/device, per reload)
        const seed = (strToSeed(viewerId) ^ sessionSeed) >>> 0;
        let shuffled = shuffleWithSeed(feed, seed);

        // 4) Newest stays pinned UNTIL this user performs a full page reload
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

        // 5) Attach profiles in ONE query (avoid N+1)
        const uniqueUserIds = Array.from(new Set(shuffled.map((s) => s.user_id)));
        const { data: profilesData, error: profileErr } = await supabase
          .from("profiles")
          .select("id, username, display_name, first_name, avatar_url")
          .in("id", uniqueUserIds);
        if (profileErr) throw profileErr;

        const pmap = new Map((profilesData || []).map((p: any) => [p.id, p]));
        const withProfiles = shuffled.map((s) => ({ ...s, profile: pmap.get(s.user_id) }));

        setProgress(78);

        // 6) Store for Index page + persist for SWR-like instant paint
        if (!cancelled) {
          setFeed(withProfiles);
          setLastFetchedAt(Date.now());
          sessionStorage.setItem("feed:cached", JSON.stringify(withProfiles));
        }

        setProgress(96);

        // 7) Let the splash show for a beat (no flash), then go
        setTimeout(() => {
          if (!cancelled) navigate("/home", { replace: true });
        }, 350);
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
        {/* Logo / mark */}
        <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center shadow-sm mb-4 animate-pulse">
          {/* replace with your SVG/Logo */}
          <span className="text-2xl font-black text-primary">S</span>
        </div>

        <h1 className="text-xl font-semibold mb-2">Splikz</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Warming up your personalized feed…
        </p>

        {/* progress bar */}
        <div className="w-full h-2 rounded-full bg-muted-foreground/10 overflow-hidden">
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        {/* tips / fun caption */}
        <p className="text-[11px] text-muted-foreground mt-3">
          Pro tip: videos start cached as you scroll ✨
        </p>
      </div>
    </div>
  );
}
