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
} from "lucide-react";
import SplikCard from "@/components/splik/SplikCard";
import FollowButton from "@/components/FollowButton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

/* ---------- helpers (same “fresh but rotated” vibe as home) ---------- */

type ProfileLite = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  followers_count?: number | null;
};

type Splik = {
  id: string;
  user_id: string;
  created_at: string;
  tag?: string | null;
  // …other fields your SplikCard uses…
  profiles?: ProfileLite; // supabase relation alias
  profile?: ProfileLite;  // normalized for SplikCard
};

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function recentThenShuffle<T extends { created_at: string }>(rows: T[], limit: number): T[] {
  const sorted = rows
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const head = sorted.slice(0, Math.max(limit, 30));
  return shuffle(head).slice(0, limit);
}

/* -------------------------------------------------------------------- */

const categories = [
  { id: "funny", label: "Funny", icon: Smile, color: "text-yellow-500" },
  { id: "dance", label: "Dance", icon: Music, color: "text-purple-500" },
  { id: "calm", label: "Calm", icon: Sparkles, color: "text-blue-500" },
  { id: "wow", label: "Wow", icon: Flame, color: "text-orange-500" },
  { id: "sports", label: "Sports", icon: Trophy, color: "text-green-500" },
];

const FEED_LIMIT = 30;

const Explore = () => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [trendingSpliks, setTrendingSpliks] = useState<(Splik & { profile?: ProfileLite })[]>([]);
  const [risingCreators, setRisingCreators] = useState<ProfileLite[]>([]);
  const [nearbySpliks, setNearbySpliks] = useState<(Splik & { profile?: ProfileLite })[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationPermission, setLocationPermission] =
    useState<"granted" | "denied" | "prompt">("prompt");
  const { toast } = useToast();

  // One feed container per section for autoplay (no nested scroller)
  const trendingFeedRef = useRef<HTMLDivElement | null>(null);
  const nearbyFeedRef = useRef<HTMLDivElement | null>(null);

  /* -------------------------- load Trending + Rising -------------------------- */
  useEffect(() => {
    const fetchTrendingData = async () => {
      setLoading(true);
      try {
        // Pull spliks with JOINed profiles to avoid N+1
        const { data: spliksData, error: spliksError } = await supabase
          .from("spliks")
          .select(
            `
            *,
            profiles:profiles (
              id, username, display_name, avatar_url, followers_count
            )
          `
          )
          .order("created_at", { ascending: false })
          .limit(200);

        if (spliksError) throw spliksError;

        const normalized = (spliksData || []).map((s: Splik) => ({
          ...s,
          profile: s.profiles ?? undefined,
        }));

        // “latest but rotated”
        setTrendingSpliks(recentThenShuffle(normalized, FEED_LIMIT));

        // Rising creators: newest accounts w/ follower count
        const { data: creatorsData, error: creatorsError } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, followers_count")
          .order("created_at", { ascending: false })
          .limit(12);

        if (creatorsError) throw creatorsError;

        setRisingCreators((creatorsData || []) as ProfileLite[]);
      } catch (e) {
        console.error(e);
        toast({
          title: "Error",
          description: "Failed to load Explore",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchTrendingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------- load Nearby (placeholder) -------------------------- */
  const fetchNearbySpliks = async () => {
    try {
      const { data, error } = await supabase
        .from("spliks")
        .select(
          `
          *,
          profiles:profiles (
            id, username, display_name, avatar_url, followers_count
          )
        `
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      const normalized = (data || []).map((s: Splik) => ({
        ...s,
        profile: s.profiles ?? undefined,
      }));

      setNearbySpliks(recentThenShuffle(normalized, FEED_LIMIT));
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: "Failed to load nearby videos",
        variant: "destructive",
      });
    }
  };

  /* -------------------------- location permission -------------------------- */
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
          description: "Enable location in your browser settings to see nearby content",
          variant: "destructive",
        });
      }
    );
  };

  /* -------------------------- Autoplay manager (with mobile fixes) -------------------------- */
  const useAutoplayIn = (hostRef: React.RefObject<HTMLElement>, deps: any[] = []) => {
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const videoVisibility = new Map<HTMLVideoElement, number>();
      let currentPlayingVideo: HTMLVideoElement | null = null;
      let isProcessing = false;

      const setupVideoForMobile = (video: HTMLVideoElement) => {
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("webkit-playsinline", "true");
        video.preload = "metadata";
        video.load();
        const onLoaded = () => {
          if (video.currentTime === 0) video.currentTime = 0.1;
        };
        video.addEventListener("loadeddata", onLoaded, { once: true });
      };

      const getAllVideos = () =>
        Array.from(host.querySelectorAll("video")) as HTMLVideoElement[];

      const pauseAllVideos = (exceptVideo?: HTMLVideoElement) => {
        getAllVideos().forEach((v) => {
          if (v !== exceptVideo && !v.paused) v.pause();
        });
      };

      const findMostVisibleVideo = (): HTMLVideoElement | null => {
        const pairs = Array.from(videoVisibility.entries());
        if (!pairs.length) return null;
        pairs.sort((a, b) => b[1] - a[1]);
        const [video, ratio] = pairs[0];
        return ratio >= 0.6 ? video : null;
      };

      const handleVideoPlayback = async () => {
        if (isProcessing) return;
        isProcessing = true;
        try {
          const target = findMostVisibleVideo();

          if (currentPlayingVideo && (videoVisibility.get(currentPlayingVideo) || 0) < 0.45) {
            currentPlayingVideo.pause();
            currentPlayingVideo = null;
          }

          if (target && target !== currentPlayingVideo) {
            pauseAllVideos(target);
            setupVideoForMobile(target);

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
          for (const entry of entries) {
            const video = entry.target as HTMLVideoElement;
            videoVisibility.set(video, entry.intersectionRatio);
          }
          handleVideoPlayback();
        },
        {
          root: null,
          threshold: [0, 0.25, 0.45, 0.6, 0.75, 1],
          rootMargin: "10px",
        }
      );

      const init = () => {
        getAllVideos().forEach((video) => {
          if (!video.hasAttribute("data-mobile-initialized")) {
            setupVideoForMobile(video);
            video.setAttribute("data-mobile-initialized", "true");
          }
          if (!videoVisibility.has(video)) {
            videoVisibility.set(video, 0);
            io.observe(video);
          }
        });
      };

      const mo = new MutationObserver(() => {
        setTimeout(init, 100);
      });

      setTimeout(init, 100);
      mo.observe(host, { childList: true, subtree: true });

      return () => {
        io.disconnect();
        mo.disconnect();
        pauseAllVideos();
        videoVisibility.clear();
        currentPlayingVideo = null;
      };
    }, deps);
  };

  // Apply autoplay to each section feed independently
  useAutoplayIn(trendingFeedRef, [trendingSpliks, selectedCategory]);
  useAutoplayIn(nearbyFeedRef, [nearbySpliks, locationPermission]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Top header */}
      <div className="bg-gradient-to-b from-secondary/10 to-background py-8 px-4">
        <div className="container">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Discover</h1>
          <p className="text-muted-foreground">Find trending splikz and rising creators</p>
        </div>
      </div>

      <div className="container py-8">
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

          {/* Categories */}
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const Icon = c.icon;
              const active = selectedCategory === c.id;
              return (
                <Badge
                  key={c.id}
                  variant={active ? "default" : "outline"}
                  className="cursor-pointer py-2 px-3 text-sm"
                  onClick={() => setSelectedCategory(active ? null : c.id)}
                >
                  <Icon className={`h-4 w-4 mr-1 ${c.color}`} />
                  {c.label}
                </Badge>
              );
            })}
          </div>

          {/* TRENDING — single column list with autoplay */}
          <TabsContent value="trending" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : trendingSpliks.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Splikz Yet</h3>
                  <p className="text-muted-foreground">Be the first to post a splik!</p>
                </CardContent>
              </Card>
            ) : (
              <div ref={trendingFeedRef} className="space-y-8">
                {trendingSpliks
                  .filter((s) =>
                    !selectedCategory
                      ? true
                      : (s.tag || "").toLowerCase().includes(selectedCategory)
                  )
                  .map((s) => (
                    <SplikCard key={s.id} splik={s} onSplik={() => {}} onReact={() => {}} onShare={() => {}} />
                  ))}
              </div>
            )}
          </TabsContent>

          {/* RISING creators (grid) */}
          <TabsContent value="rising" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : risingCreators.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Creators Yet</h3>
                  <p className="text-muted-foreground">Join now to become a rising star!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {risingCreators.map((creator, i) => (
                  <Card key={creator.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                    <CardContent className="p-4">
                      <Link
                        to={`/creator/${creator.username || creator.id}`}
                        className="block mb-3"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            <img
                              src={
                                creator.avatar_url ||
                                `https://api.dicebear.com/7.x/avataaars/svg?seed=${creator.username || creator.id}`
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
            )}
          </TabsContent>

          {/* NEARBY — single column list with autoplay (after enabling location) */}
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
            ) : loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : nearbySpliks.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Nearby Splikz</h3>
                  <p className="text-muted-foreground">No videos from creators near you yet</p>
                </CardContent>
              </Card>
            ) : (
              <div ref={nearbyFeedRef} className="space-y-8">
                {nearbySpliks.map((s) => (
                  <SplikCard key={s.id} splik={s} onSplik={() => {}} onReact={() => {}} onShare={() => {}} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Footer />
    </div>
  );
};

export default Explore;
