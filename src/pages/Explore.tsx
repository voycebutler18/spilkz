// src/pages/Explore.tsx
import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  Users,
  MapPin,
  Flame,
  Music,
  Smile,
  Sparkles,
  Trophy,
  Loader2,
  RefreshCw,
  Camera,
} from "lucide-react";
import SplikCard from "@/components/splik/SplikCard";
import FollowButton from "@/components/FollowButton";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  createDiscoveryFeed,
  applySessionRotation,
  forceNewRotation,
  type SplikWithScore,
} from "@/lib/feed";

/* ──────────────────────────────────────────────────────────────────────────
   Helpers (kept from your original page)
────────────────────────────────────────────────────────────────────────── */
const preconnect = (url?: string | null) => {
  if (!url) return;
  try {
    const u = new URL(url);
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = `${u.protocol}//${u.host}`;
    link.crossOrigin = "";
    document.head.appendChild(link);
  } catch {}
};
const warmFirstVideoMeta = (url?: string | null) => {
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
};

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  followers_count?: number | null;
};

type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  created_at?: string;
  trim_start?: number | null;
  trim_end?: number | null;
  likes_count?: number;
  tag?: string | null;
  boost_score?: number | null;
  profile?: Profile;
};

const categories = [
  { id: "funny", label: "Funny", icon: Smile, color: "text-yellow-500" },
  { id: "dance", label: "Dance", icon: Music, color: "text-purple-500" },
  { id: "calm", label: "Calm", icon: Sparkles, color: "text-blue-500" },
  { id: "wow", label: "Wow", icon: Flame, color: "text-orange-500" },
  { id: "sports", label: "Sports", icon: Trophy, color: "text-green-500" },
];

/* ──────────────────────────────────────────────────────────────────────────
   RIGHT-SIDE VERTICAL PHOTO RAIL (photos only; no video feed posts)
   - Reads exclusively from public.vibe_photos (id, user_id, photo_url, created_at)
   - Hydrates uploader profile to show avatar + navigate to /creator/:slug
   - Vertical scroll in the right sidebar
────────────────────────────────────────────────────────────────────────── */
type RailProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
};
type PhotoItem = {
  id: string;
  user_id: string;
  photo_url: string;
  created_at: string;
  profile?: RailProfile | null;
};

const displayName = (p?: RailProfile | null) => {
  if (!p) return "User";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.username?.trim() || "User";
};
const slugFor = (p?: RailProfile | null) => (p?.username ? p.username : p?.id || "");

function RightPhotoRail({
  title = "Splikz Photos",  // was "Photo Rail"
  maxListHeight = "calc(100vh - 220px)",
  limit = 60,
}: {
  title?: string;
  maxListHeight?: string | number;
  limit?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PhotoItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        // 👉 ONLY from vibe_photos (does NOT touch video feed tables)
        const { data, error } = await supabase
          .from("vibe_photos")
          .select("id, user_id, photo_url, created_at")
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) throw error;

        const rows = (data || []).map((r) => ({
          id: String(r.id),
          user_id: String(r.user_id),
          photo_url: String(r.photo_url),
          created_at: r.created_at || new Date().toISOString(),
        })) as PhotoItem[];

        // hydrate uploader profiles
        const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
        if (userIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, username, display_name, first_name, last_name, avatar_url")
            .in("id", userIds);
          const byId: Record<string, RailProfile> = {};
          (profs || []).forEach((p: any) => (byId[p.id] = p));
          rows.forEach((r) => (r.profile = byId[r.user_id] || null));
        }

        if (!cancelled) setItems(rows);
      } catch (e) {
        console.error("RightPhotoRail load error:", e);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    // Realtime: refresh on new photos only (still not touching videos)
    const ch = supabase
      .channel("rail-vibe-photos")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibe_photos" },
        () => load()
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(ch); } catch {}
      cancelled = true;
    };
  }, [limit]);

  return (
    <aside className="space-y-4">
      <div className="bg-card/60 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold"> {title} </h3>
          <Camera className="h-4 w-4 text-muted-foreground" />
        </div>

        <div
          className="space-y-3 overflow-y-auto custom-scrollbar pr-1"
          style={{ maxHeight: typeof maxListHeight === "number" ? `${maxListHeight}px` : maxListHeight }}
        >
          {loading && (
            <div className="py-10 text-center text-muted-foreground text-sm">Loading photos…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="py-10 text-center text-muted-foreground text-sm">No photos yet</div>
          )}

          {items.map((ph) => {
            const person = ph.profile;
            const name = displayName(person);
            const slug = slugFor(person);
            return (
              <div
                key={ph.id}
                className="relative aspect-square bg-muted/40 rounded-xl border border-border/40 overflow-hidden group"
              >
                <img
                  src={ph.photo_url}
                  alt={name}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Small avatar → creator profile */}
                <Link
                  to={slug ? `/creator/${slug}` : "#"}
                  className="absolute top-2 left-2 w-9 h-9 rounded-full border border-white/30 overflow-hidden bg-background/60 backdrop-blur flex items-center justify-center"
                  title={name}
                >
                  {person?.avatar_url ? (
                    <img src={person.avatar_url} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xs font-semibold">
                      {name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </Link>

                {/* Name on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-white text-xs font-medium truncate">{name}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* tiny scrollbar styling scoped here */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148,163,184,.5); border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,.8); }
      `}</style>
    </aside>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   EXPLORE PAGE (existing functionality, wrapped in a responsive grid)
────────────────────────────────────────────────────────────────────────── */
const Explore = () => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [trendingSpliks, setTrendingSpliks] = useState<(Splik & { profile?: Profile })[]>([]);
  const [risingCreators, setRisingCreators] = useState<Profile[]>([]);
  const [nearbySpliks, setNearbySpliks] = useState<(Splik & { profile?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [locationPermission, setLocationPermission] =
    useState<"granted" | "denied" | "prompt">("prompt");
  const { toast } = useToast();

  const trendingFeedRef = useRef<HTMLDivElement | null>(null);
  const nearbyFeedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  /** TRENDING (unchanged logic) */
  const fetchTrendingData = async (showRefreshToast = false, forceNewShuffle = false) => {
    try {
      showRefreshToast ? setRefreshing(true) : setLoading(true);

      if (forceNewShuffle) forceNewRotation();

      const { data: allSpliks, error: spliksError } = await supabase
        .from("spliks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (spliksError) throw spliksError;

      if (allSpliks && allSpliks.length) {
        const rotated = createDiscoveryFeed(allSpliks as SplikWithScore[], {
          userId: user?.id,
          category: selectedCategory,
          feedType: "discovery",
          maxResults: 40,
        });

        const withProfiles: (Splik & { profile?: Profile })[] = await Promise.all(
          rotated.slice(0, 30).map(async (s: any) => {
            const { data: p } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", s.user_id)
              .maybeSingle();
            return { ...(s as Splik), profile: (p as Profile) || undefined };
          })
        );

        setTrendingSpliks(withProfiles);
        preconnect(withProfiles[0]?.video_url);
        warmFirstVideoMeta(withProfiles[0]?.video_url);
      } else {
        setTrendingSpliks([]);
      }

      // Rising creators (unchanged)
      const { data: allCreators } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);

      if (allCreators) {
        const rotatedCreators = applySessionRotation(
          allCreators.map((c) => ({
            ...c,
            likes_count: c.followers_count || 0,
            comments_count: 0,
            boost_score: 0,
            tag: "",
            user_id: c.id,
          })) as SplikWithScore[],
          { userId: user?.id, feedType: "discovery", maxResults: 15 }
        );
        setRisingCreators(rotatedCreators.slice(0, 12) as any);
      } else {
        setRisingCreators([]);
      }

      if (showRefreshToast) {
        toast({
          title: forceNewShuffle ? "Discovery reshuffled!" : "Discovery refreshed!",
          description: forceNewShuffle
            ? "Showing you a completely new mix"
            : "Updated with the latest trending content",
        });
      }
    } catch (e) {
      console.error("Trending load error:", e);
      toast({
        title: "Error",
        description: "Failed to load trending content",
        variant: "destructive",
      });
      setTrendingSpliks([]);
      setRisingCreators([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrendingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedCategory]);

  /** Nearby (unchanged) */
  const fetchNearbySpliks = async (forceNewShuffle = false) => {
    try {
      if (forceNewShuffle) forceNewRotation();

      const { data: spliksData } = await supabase
        .from("spliks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (spliksData) {
        const rotated = applySessionRotation(spliksData as SplikWithScore[], {
          userId: user?.id,
          feedType: "nearby",
          maxResults: 30,
        });

        const withProfiles = await Promise.all(
          rotated.map(async (s: any) => {
            const { data: p } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", s.user_id)
              .maybeSingle();
            return { ...(s as Splik), profile: (p as Profile) || undefined };
          })
        );
        setNearbySpliks(withProfiles);
        preconnect(withProfiles[0]?.video_url);
        warmFirstVideoMeta(withProfiles[0]?.video_url);
      } else {
        setNearbySpliks([]);
      }
    } catch (e) {
      console.error("Nearby load error:", e);
      setNearbySpliks([]);
    }
  };

  const requestLocationPermission = async () => {
    if (!("geolocation" in navigator)) {
      toast({
        title: "Location not supported",
        description: "Your browser doesn't support location services",
        variant: "destructive",
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async () => {
        setLocationPermission("granted");
        await fetchNearbySpliks();
        toast({
          title: "Location enabled",
          description: "Now showing spliks from creators near you",
        });
      },
      () => {
        setLocationPermission("denied");
        toast({
          title: "Location access denied",
          description: "Enable location to see nearby content",
          variant: "destructive",
        });
      }
    );
  };

  // Autoplay manager (unchanged)
  const useAutoplayIn = (hostRef: React.RefObject<HTMLElement>, deps: any[] = []) => {
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const videoVisibility = new Map<HTMLVideoElement, number>();
      let currentPlayingVideo: HTMLVideoElement | null = null;
      let isProcessing = false;

      const setup = (video: HTMLVideoElement) => {
        video.muted = true;
        video.playsInline = true;
        // @ts-ignore
        video.setAttribute("webkit-playsinline", "true");
        video.preload = "metadata";
        video.load();
        video.addEventListener(
          "loadeddata",
          () => {
            if (video.currentTime === 0) video.currentTime = 0.1;
          },
          { once: true }
        );
      };

      const allVideos = () => Array.from(host.querySelectorAll("video")) as HTMLVideoElement[];

      const pauseAll = (except?: HTMLVideoElement) => {
        allVideos().forEach((v) => {
          if (v !== except && !v.paused) v.pause();
        });
      };

      const mostVisible = (): HTMLVideoElement | null => {
        const entries = Array.from(videoVisibility.entries());
        if (!entries.length) return null;
        const [vid, ratio] = entries.sort((a, b) => b[1] - a[1])[0];
        return ratio >= 0.6 ? vid : null;
      };

      const drive = async () => {
        if (isProcessing) return;
        isProcessing = true;
        try {
          const target = mostVisible();

          if (currentPlayingVideo && (videoVisibility.get(currentPlayingVideo) || 0) < 0.45) {
            currentPlayingVideo.pause();
            currentPlayingVideo = null;
          }

          if (target && target !== currentPlayingVideo) {
            pauseAll(target);
            setup(target);

            if (target.readyState < 2) {
              target.load();
              await new Promise((r) => setTimeout(r, 100));
            }
            if (target.currentTime === 0 && target.duration > 0) target.currentTime = 0.1;

            try {
              await target.play();
              currentPlayingVideo = target;
            } catch {
              if (!target.muted) {
                target.muted = true;
                try {
                  await target.play();
                  currentPlayingVideo = target;
                } catch {
                  if (target.currentTime === 0) target.currentTime = 0.1;
                }
              } else {
                if (target.currentTime === 0) target.currentTime = 0.1;
              }
            }
          } else if (!target && currentPlayingVideo) {
            currentPlayingVideo.pause();
            currentPlayingVideo = null;
          }
        } finally {
          isProcessing = false;
        }
      };

      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            videoVisibility.set(e.target as HTMLVideoElement, e.intersectionRatio);
          });
          drive();
        },
        { root: null, threshold: [0, 0.25, 0.45, 0.6, 0.75, 1] }
      );

      const init = () => {
        allVideos().forEach((v) => {
          if (!v.hasAttribute("data-mobile-init")) {
            setup(v);
            v.setAttribute("data-mobile-init", "1");
          }
          if (!videoVisibility.has(v)) {
            videoVisibility.set(v, 0);
            io.observe(v);
          }
        });
      };

      const mo = new MutationObserver(() => setTimeout(init, 80));
      setTimeout(init, 80);
      mo.observe(host, { childList: true, subtree: true });

      return () => {
        io.disconnect();
        mo.disconnect();
        pauseAll();
        videoVisibility.clear();
        currentPlayingVideo = null;
      };
    }, deps);
  };

  useAutoplayIn(trendingFeedRef, [trendingSpliks, selectedCategory]);
  useAutoplayIn(nearbyFeedRef, [nearbySpliks, locationPermission]);

  const handleReact = async (_splikId: string) => {
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

  const handleRefresh = () => {
    fetchTrendingData(true, true);
    if (locationPermission === "granted") fetchNearbySpliks(true);
  };
  const handleUpdate = () => {
    fetchTrendingData(true, false);
    if (locationPermission === "granted") fetchNearbySpliks(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top header (kept) */}
      <div className="bg-gradient-to-b from-secondary/10 to-background py-8 px-4">
        <div className="container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Discover</h1>
              <p className="text-muted-foreground">
                Find trending splikz and rising creators • New shuffle each refresh
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleUpdate} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Update
              </Button>
              <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Shuffle
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* NEW: grid with right photo rail */}
      <div className="container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main content (unchanged Explore tabs) */}
          <div className="lg:col-span-9">
            <Tabs defaultValue="trending" className="space-y-6">
              <TabsList className="grid w-full max-w-md grid-cols-3">
                <TabsTrigger value="trending" className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Trending
                </TabsTrigger>
                <TabsTrigger value="rising" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Rising
                </TabsTrigger>
                <TabsTrigger value="nearby" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Nearby
                </TabsTrigger>
              </TabsList>

              {/* categories */}
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const Icon = c.icon;
                  return (
                    <Badge
                      key={c.id}
                      variant={selectedCategory === c.id ? "default" : "outline"}
                      className="cursor-pointer py-2 px-3 text-sm"
                      onClick={() => setSelectedCategory(selectedCategory === c.id ? null : c.id)}
                    >
                      <Icon className={`h-4 w-4 mr-1 ${c.color}`} />
                      {c.label}
                    </Badge>
                  );
                })}
              </div>

              {/* TRENDING */}
              <TabsContent value="trending" className="space-y-6">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                    <p className="text-sm text-muted-foreground">Discovering trending content...</p>
                  </div>
                ) : trendingSpliks.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Trending Splikz</h3>
                      <p className="text-muted-foreground mb-4">Try shuffling again.</p>
                      <div className="flex gap-2 justify-center">
                        <Button onClick={handleUpdate} variant="outline" disabled={refreshing}>
                          Get Latest
                        </Button>
                        <Button onClick={handleRefresh} disabled={refreshing}>
                          Shuffle Discovery
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="text-center text-sm text-muted-foreground mb-4">
                      Showing {trendingSpliks.length} trending videos
                      {selectedCategory && (
                        <span className="ml-1">
                          in {categories.find((c) => c.id === selectedCategory)?.label}
                        </span>
                      )}
                    </div>
                    <div ref={trendingFeedRef} className="space-y-8">
                      {trendingSpliks
                        .filter((s) =>
                          !selectedCategory ? true : (s as any).tag?.toLowerCase().includes(selectedCategory)
                        )
                        .map((s) => (
                          <SplikCard
                            key={s.id}
                            splik={s}
                            onReact={() => {/* optimistic like optional */}}
                            onShare={() => handleShare(s.id)}
                          />
                        ))}
                    </div>
                  </>
                )}
              </TabsContent>

              {/* RISING */}
              <TabsContent value="rising" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                  {risingCreators.map((creator, i) => (
                    <Card key={creator.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                      <CardContent className="p-4">
                        <Link to={`/creator/${creator.username || creator.id}`} className="block mb-3">
                          <div className="flex items-center space-x-3">
                            <div className="relative">
                              <img
                                src={
                                  creator.avatar_url ||
                                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${
                                    creator.username || creator.id
                                  }`
                                }
                                alt={creator.display_name || creator.username || "User"}
                                className="h-12 w-12 rounded-full ring-2 ring-primary/20"
                              />
                              <Badge className="absolute -bottom-1 -right-1 h-5 w-5 p-0 flex items-center justify-center">
                                {i + 1}
                              </Badge>
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold hover:text-primary transition-colors">
                                {creator.display_name || creator.username || "Unknown"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                @{creator.username || "unknown"}
                              </p>
                            </div>
                          </div>
                        </Link>
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary">{creator.followers_count || 0} followers</Badge>
                          <FollowButton
                            profileId={creator.id}
                            username={creator.username || undefined}
                            size="sm"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* NEARBY */}
              <TabsContent value="nearby" className="space-y-6">
                {locationPermission !== "granted" ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Enable Location</h3>
                      <p className="text-muted-foreground mb-4">
                        Discover spliks from creators in your city (location is never precise)
                      </p>
                      <Button onClick={requestLocationPermission}>Enable Location</Button>
                    </CardContent>
                  </Card>
                ) : nearbySpliks.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Nearby Splikz</h3>
                      <p className="text-muted-foreground mb-4">No videos near you yet</p>
                      <div className="flex gap-2 justify-center">
                        <Button onClick={() => fetchNearbySpliks(false)} variant="outline">
                          Get Latest
                        </Button>
                        <Button onClick={() => fetchNearbySpliks(true)}>Shuffle Nearby</Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div ref={nearbyFeedRef} className="space-y-8">
                    {nearbySpliks.map((s) => (
                      <SplikCard
                        key={s.id}
                        splik={s}
                        onReact={() => {/* optimistic like optional */}}
                        onShare={() => handleShare(s.id)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* RIGHT SIDEBAR: Vertical photo rail (photos only) */}
          <div className="lg:col-span-3">
            <RightPhotoRail title="Splikz Photos" />  {/* was "Photo Rail" */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Explore;
