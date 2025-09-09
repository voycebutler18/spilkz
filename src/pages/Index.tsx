// src/pages/Index.tsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import VideoUploadModal from "@/components/dashboard/VideoUploadModal";
import SplikCard from "@/components/splik/SplikCard";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, RefreshCw, Play } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createHomeFeed, forceNewRotation } from "@/lib/feed";
import { useFeedStore } from "@/store/feedStore";

type SplikWithProfile = any;

// Rolling window: keep 7 videos “live”
const LOAD_WINDOW = 7;
const HALF = Math.floor(LOAD_WINDOW / 2);

// ---------- DEBUG HELPERS ----------
declare global {
  interface Window {
    __SPLIKZ_DEBUG?: boolean;
  }
}
const DEBUG = typeof window !== "undefined" ? (window.__SPLIKZ_DEBUG ?? true) : true;
const dlog = (...args: any[]) => DEBUG && console.log("[Index]", ...args);
const dwarn = (...args: any[]) => DEBUG && console.warn("[Index]", ...args);
const derror = (...args: any[]) => DEBUG && console.error("[Index]", ...args);
// -----------------------------------

const rand = () =>
  typeof crypto !== "undefined" && (crypto as any).getRandomValues
    ? (crypto.getRandomValues(new Uint32Array(1))[0] as number) / 2 ** 32
    : Math.random();

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pin the newest splik ONCE per user session, otherwise shuffle.
 * We remember the newest id in sessionStorage under a user-scoped key.
 */
function arrangeFeedOnce({
  feed,
  newestId,
  userId,
}: {
  feed: any[];
  newestId?: string | null;
  userId?: string | null;
}) {
  const key = `pinned:newestShown:${userId || "anon"}`;
  const already = sessionStorage.getItem(key);

  if (newestId && already !== newestId) {
    const a = feed.slice();
    const idx = a.findIndex((x) => x?.id === newestId);
    if (idx > 0) {
      const [it] = a.splice(idx, 1);
      a.unshift(it);
    }
    sessionStorage.setItem(key, newestId);
    return a;
  }

  return shuffle(feed);
}

const Index = () => {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [localSpliks, setLocalSpliks] = useState<SplikWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0); // who’s mostly visible
  const [shuffleEpoch, setShuffleEpoch] = useState(0);

  const feedStore = useFeedStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Global error hooks (helps catch runtime breaks that cause black screens)
  useEffect(() => {
    const onErr = (event: ErrorEvent) => {
      derror("Global error:", {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        col: event.colno,
        stack: event.error?.stack,
      });
    };
    const onRej = (event: PromiseRejectionEvent) => {
      derror("Unhandled rejection:", event.reason);
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  useEffect(() => {
    document.title = "Splikz - Short Video Platform";
    dlog("Mounted Index");
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      dlog("supabase.auth.getUser()", { hasUser: !!user });
      setUser(user);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      dlog("onAuthStateChange", {
        event: _event,
        hasSession: !!session,
        userId: session?.user?.id,
      });
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // On mount, try to use preloaded store or session cache for instant paint,
  // but always re-arrange (pin-once or shuffle) so refresh isn't identical.
  useEffect(() => {
    const cached = feedStore.feed.length
      ? feedStore.feed
      : (() => {
          try {
            const raw = sessionStorage.getItem("feed:cached");
            return raw ? JSON.parse(raw) : [];
          } catch (e) {
            dwarn("failed to parse session cached feed", e);
            return [];
          }
        })();

    if (cached.length) {
      dlog("Using cached feed (preloaded or session)", { count: cached.length });
      const arranged = arrangeFeedOnce({ feed: cached, newestId: null, userId: user?.id });
      setLocalSpliks(arranged);
      setLoading(false);
      setShuffleEpoch(Date.now());
    } else {
      dlog("No cached feed, fetching fresh…");
      fetchDynamicFeed(false, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If Splash populated after this page mounted, we still re-arrange to avoid identical first item
  useEffect(() => {
    if (feedStore.feed.length) {
      dlog("feedStore.feed updated", { count: feedStore.feed.length });
      const arranged = arrangeFeedOnce({ feed: feedStore.feed, newestId: null, userId: user?.id });
      setLocalSpliks(arranged);
      setLoading(false);
      setShuffleEpoch(Date.now());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedStore.feed]);

  const fetchDynamicFeed = async (showToast = false, forceNewShuffle = false) => {
    if (showToast) setRefreshing(true);
    else setLoading(true);

    dlog("fetchDynamicFeed:start", { showToast, forceNewShuffle });

    try {
      if (forceNewShuffle) {
        try {
          forceNewRotation();
          dlog("forceNewRotation ok");
        } catch (e) {
          dwarn("forceNewRotation failed:", e);
        }
      }

      const nowIso = new Date().toISOString();

      // --- Fetch spliks (must succeed) ---
      const allResp = await supabase
        .from("spliks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150);

      if (allResp.error) {
        derror("All spliks query failed:", allResp.error);
        throw allResp.error; // no feed without this
      }
      const allSpliks = allResp.data || [];
      dlog("allSpliks count", allSpliks.length);

      // --- Fetch boosted (optional, never fatal) ---
      let boostedSpliks: any[] = [];
      try {
        const boostedResp = await supabase
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

        if (boostedResp.error) throw boostedResp.error;
        boostedSpliks = boostedResp.data || [];
        dlog("boostedSpliks count", boostedSpliks.length);
      } catch (e) {
        dwarn("Boosted query failed (continuing without boosted):", e);
        boostedSpliks = [];
      }

      // --- Build feed (guard helper) ---
      let feed: any[] = [];
      try {
        feed = createHomeFeed(allSpliks, boostedSpliks, {
          userId: user?.id,
          feedType: "home",
          maxResults: 60,
        }) as any[];
        dlog("createHomeFeed ok", { count: feed.length });
      } catch (e) {
        dwarn("createHomeFeed failed; using allSpliks:", e);
        feed = allSpliks.slice(0, 60);
      }

      // --- Attach profiles in ONE query (optional) ---
      const ids = Array.from(new Set(feed.map((s: any) => s.user_id).filter(Boolean)));
      let withProfiles = feed;
      if (ids.length > 0) {
        try {
          const { data: profilesData, error: pErr } = await supabase
            .from("profiles")
            .select("id, username, display_name, first_name, avatar_url")
            .in("id", ids);
          if (pErr) throw pErr;

          const pmap = new Map((profilesData || []).map((p: any) => [p.id, p]));
          withProfiles = feed.map((s: any) => ({ ...s, profile: pmap.get(s.user_id) }));
          dlog("profiles attached", { profiles: profilesData?.length ?? 0 });
        } catch (e) {
          dwarn("Profiles batch fetch failed; proceeding without profiles:", e);
          withProfiles = feed;
        }
      }

      // --- Arrange: pin newest ONCE per session, else shuffle ---
      const newestId = allSpliks?.[0]?.id ?? null;
      const arranged = arrangeFeedOnce({ feed: withProfiles, newestId, userId: user?.id || null });

      setShuffleEpoch(Date.now());
      setLocalSpliks(arranged);
      setActiveIndex(0);

      // keep store + cache fresh for instant paints
      try {
        useFeedStore.getState().setFeed(arranged);
        useFeedStore.getState().setLastFetchedAt(Date.now());
        sessionStorage.setItem("feed:cached", JSON.stringify(arranged));
      } catch (e) {
        dwarn("Caching feed failed (store/sessionStorage):", e);
      }

      // Fire-and-forget impressions; never fail the fetch
      try {
        arranged
          .filter((s: any) => s.isBoosted)
          .forEach((s: any) =>
            supabase
              .rpc("increment_boost_impression", { p_splik_id: s.id })
              .catch(() => {})
          );
      } catch (e) {
        dwarn("Impression RPC failed (ignored):", e);
      }

      if (showToast) {
        toast({
          title: forceNewShuffle ? "Feed reshuffled!" : "Feed refreshed!",
          description: forceNewShuffle
            ? "Showing you a completely new mix"
            : "Updated with latest content",
        });
      }

      dlog("fetchDynamicFeed:done", { arranged: arranged.length });
    } catch (e: any) {
      derror("fetchDynamicFeed fatal:", e);
      toast({
        title: "Error",
        description: e?.message || "Failed to load videos. Please try again.",
        variant: "destructive",
      });
      setLocalSpliks((prev) => prev ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshFeed = () => fetchDynamicFeed(true, true);
  const refreshContent = () => fetchDynamicFeed(true, false);

  const handleUploadClick = () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to upload videos",
        variant: "destructive",
      });
      return;
    }
    setUploadModalOpen(true);
  };

  const handleSplik = async (_id: string) => {};
  const handleReact = async (_id: string) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to react to videos",
        variant: "default",
      });
      return;
    }
  };
  const handleShare = async (splikId: string) => {
    const url = `${window.location.origin}/video/${splikId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Check out this Splik!", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied!", description: "Copied to clipboard" });
      }
    } catch {
      toast({ title: "Failed to share", description: "Please try again", variant: "destructive" });
    }
  };

  // compute which indices should have a real <video src=...> attached
  const shouldLoadIndex = (i: number) => {
    if (!localSpliks.length) return false;
    if (activeIndex <= HALF) return i <= Math.min(localSpliks.length - 1, LOAD_WINDOW - 1);
    const start = Math.max(0, activeIndex - HALF);
    const end = Math.min(localSpliks.length - 1, activeIndex + HALF);
    return i >= start && i <= end;
  };

  // Debug breadcrumbs
  useEffect(() => {
    dlog("state:update", {
      loading,
      refreshing,
      userId: user?.id ?? null,
      localSpliks: localSpliks.length,
      activeIndex,
    });
  }, [loading, refreshing, user?.id, localSpliks.length, activeIndex]);

  return (
    <div className="w-full">
      {/* top controls */}
      <div className="w-full pt-2 pb-2">
        <div className="flex justify-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshContent}
            disabled={refreshing || loading}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Updating..." : "Update"}
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshFeed}
            disabled={refreshing || loading}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Shuffling..." : "Shuffle"}
          </Button>
        </div>
      </div>

      {/* Feed */}
      <section className="w-full py-2 md:py-4 flex justify-center">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground">Loading your personalized feed...</p>
          </div>
        ) : localSpliks.length === 0 ? (
          <Card className="max-w-md mx-auto mx-4">
            <CardContent className="p-8 text-center">
              <Play className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Splikz Yet</h3>
              <p className="text-muted-foreground mb-4">Be the first to post a splik!</p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button onClick={refreshContent} variant="outline" disabled={refreshing}>
                  {refreshing ? "Loading..." : "Get Latest"}
                </Button>
                <Button onClick={refreshFeed} disabled={refreshing}>
                  {refreshing ? "Shuffling..." : "Shuffle Feed"}
                </Button>
                <Button onClick={handleUploadClick} variant="default">
                  Upload
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="w-full px-2 sm:px-4">
            <div className="max-w-[400px] sm:max-w-[500px] mx-auto mb-4">
              <p className="text-xs text-center text-muted-foreground">
                Showing {localSpliks.length} videos • Personalized & cached
              </p>
            </div>

            <div className="max-w-[400px] sm:max-w-[500px] mx-auto space-y-4 md:space-y-6">
              {localSpliks.map((splik: any, index: number) => (
                <div key={`${splik.id}-${shuffleEpoch}`} className="relative">
                  <SplikCard
                    index={index}
                    shouldLoad={shouldLoadIndex(index)}
                    onPrimaryVisible={(i) => setActiveIndex(i)}
                    splik={splik}
                    onSplik={() => {}}
                    onReact={() => {}}
                    onShare={() => {}}
                  />
                </div>
              ))}

              <div className="text-center py-6 border-t border-border/40">
                <p className="text-sm text-muted-foreground mb-3">Want to see more?</p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button
                    onClick={refreshContent}
                    variant="outline"
                    disabled={refreshing}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Loading..." : "Get Latest"}
                  </Button>
                  <Button onClick={refreshFeed} disabled={refreshing} className="flex items-center gap-2">
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Shuffling..." : "Shuffle Feed"}
                  </Button>
                  <Button onClick={handleUploadClick}>Upload</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Upload Modal */}
      {user && (
        <VideoUploadModal
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onUploadComplete={() => {
            setUploadModalOpen(false);
            // refresh but keep instant paint
            fetchDynamicFeed();
            toast({
              title: "Upload successful!",
              description: "Your video is now live (pinned once), then joins the shuffle.",
            });
          }}
        />
      )}
    </div>
  );
};

export default Index;
