// src/pages/Explore.tsx
// Used as the new Home page.
// NOTE: Header/Footer are intentionally NOT imported — AppLayout renders the global chrome.

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
} from "lucide-react";
import SplikCard from "@/components/splik/SplikCard";
import { FollowButton } from "@/components/FollowButton";
import { supabase, type Splik, type Profile } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "react-router-dom";
import {
  createDiscoveryFeed,
  applySessionRotation,
  forceNewRotation,
  type SplikWithScore,
} from "@/lib/feed";

const categories = [
  { id: "funny", label: "Funny", icon: Smile, color: "text-yellow-500" },
  { id: "dance", label: "Dance", icon: Music, color: "text-purple-500" },
  { id: "calm", label: "Calm", icon: Sparkles, color: "text-blue-500" },
  { id: "wow", label: "Wow", icon: Flame, color: "text-orange-500" },
  { id: "sports", label: "Sports", icon: Trophy, color: "text-green-500" },
];

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

  // Refs for autoplay management
  const trendingFeedRef = useRef<HTMLDivElement | null>(null);
  const nearbyFeedRef = useRef<HTMLDivElement | null>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  /** Fetch Trending with Session-Based Dynamic Rotation */
  const fetchTrendingData = async (
    showRefreshToast: boolean = false,
    forceNewShuffle: boolean = false
  ) => {
    try {
      if (showRefreshToast) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      if (forceNewShuffle) {
        forceNewRotation();
      }

      const { data: allSpliks, error: spliksError } = await supabase
        .from("spliks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (!spliksError && allSpliks) {
        const rotatedSpliks = createDiscoveryFeed(allSpliks as SplikWithScore[], {
          userId: user?.id,
          category: selectedCategory,
          feedType: "discovery",
          maxResults: 40,
        });

        const withProfiles = await Promise.all(
          rotatedSpliks.slice(0, 30).map(async (s) => {
            const { data: p } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", s.user_id)
              .maybeSingle();

            return {
              ...s,
              profile: p || undefined,
            };
          })
        );
        setTrendingSpliks(withProfiles || []);
      }

      const { data: allCreators, error: creatorsError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);

      if (!creatorsError && allCreators) {
        const rotatedCreators = applySessionRotation(
          allCreators.map((c) => ({
            ...c,
            likes_count: c.followers_count || 0,
            comments_count: 0,
            boost_score: 0,
            tag: "",
            user_id: c.id,
          })) as SplikWithScore[],
          {
            userId: user?.id,
            feedType: "discovery",
            maxResults: 15,
          }
        );

        setRisingCreators(rotatedCreators.slice(0, 12));
      }

      if (showRefreshToast) {
        toast({
          title: forceNewShuffle ? "Discovery reshuffled!" : "Discovery refreshed!",
          description: forceNewShuffle
            ? "Showing you a completely new mix"
            : "Updated with latest trending content",
        });
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: "Failed to load trending content",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrendingData();
  }, [user, selectedCategory]);

  /** Fetch Nearby with session rotation */
  const fetchNearbySpliks = async (forceNewShuffle: boolean = false) => {
    try {
      if (forceNewShuffle) {
        forceNewRotation();
      }

      const { data: spliksData, error } = await supabase
        .from("spliks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!error && spliksData) {
        const rotatedSpliks = applySessionRotation(spliksData as SplikWithScore[], {
          userId: user?.id,
          feedType: "nearby",
          maxResults: 30,
        });

        const withProfiles = await Promise.all(
          rotatedSpliks.map(async (s) => {
            const { data: p } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", s.user_id)
              .maybeSingle();
            return { ...s, profile: p || undefined };
          })
        );
        setNearbySpliks(withProfiles || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  /** Location permission */
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

  const handleRefresh = () => {
    fetchTrendingData(true, true);
    if (locationPermission === "granted") {
      fetchNearbySpliks(true);
    }
  };

  const handleUpdate = () => {
    fetchTrendingData(true, false);
    if (locationPermission === "granted") {
      fetchNearbySpliks(false);
    }
  };

  /**
   * ======= AUTOPLAY MANAGER (unchanged) =======
   */
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

        video.addEventListener(
          "loadeddata",
          () => {
            if (video.currentTime === 0) {
              video.currentTime = 0.1;
            }
          },
          { once: true }
        );
      };

      const getAllVideos = () => Array.from(host.querySelectorAll("video")) as HTMLVideoElement[];

      const pauseAllVideos = (exceptVideo?: HTMLVideoElement) => {
        getAllVideos().forEach((video) => {
          if (video !== exceptVideo && !video.paused) {
            video.pause();
          }
        });
      };

      const findMostVisibleVideo = (): HTMLVideoElement | null => {
        const visibilityEntries = Array.from(videoVisibility.entries());
        if (visibilityEntries.length === 0) return null;

        const sortedVideos = visibilityEntries.sort((a, b) => b[1] - a[1]);
        const mostVisible = sortedVideos[0];

        return mostVisible && mostVisible[1] >= 0.6 ? mostVisible[0] : null;
      };

      const handleVideoPlayback = async () => {
        if (isProcessing) return;
        isProcessing = true;

        try {
          const targetVideo = findMostVisibleVideo();

          if (currentPlayingVideo && (videoVisibility.get(currentPlayingVideo) || 0) < 0.45) {
            currentPlayingVideo.pause();
            currentPlayingVideo = null;
          }

          if (targetVideo && targetVideo !== currentPlayingVideo) {
            pauseAllVideos(targetVideo);
            setupVideoForMobile(targetVideo);

            if (targetVideo.readyState < 2) {
              targetVideo.load();
              await new Promise((resolve) => setTimeout(resolve, 100));
            }

            if (targetVideo.currentTime === 0 && targetVideo.duration > 0) {
              targetVideo.currentTime = 0.1;
            }

            try {
              await targetVideo.play();
              currentPlayingVideo = targetVideo;
            } catch (playError) {
              if (!targetVideo.muted) {
                targetVideo.muted = true;
                try {
                  await targetVideo.play();
                  currentPlayingVideo = targetVideo;
                } catch {
                  if (targetVideo.currentTime === 0) {
                    targetVideo.currentTime = 0.1;
                  }
                }
              } else if (targetVideo.currentTime === 0) {
                targetVideo.currentTime = 0.1;
              }
            }
          } else if (!targetVideo && currentPlayingVideo) {
            currentPlayingVideo.pause();
            currentPlayingVideo = null;
          }
        } finally {
          isProcessing = false;
        }
      };

      const intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const video = entry.target as HTMLVideoElement;
            videoVisibility.set(video, entry.intersectionRatio);
          }

          handleVideoPlayback();
        },
        {
          root: null,
          threshold: [0, 0.25, 0.45, 0.6, 0.75, 1.0],
          rootMargin: "10px",
        }
      );

      const initializeVideos = () => {
        getAllVideos().forEach((video) => {
          if (!video.hasAttribute("data-mobile-initialized")) {
            setupVideoForMobile(video);
            video.setAttribute("data-mobile-initialized", "true");
          }

          if (!videoVisibility.has(video)) {
            videoVisibility.set(video, 0);
            intersectionObserver.observe(video);
          }
        });
      };

      const mutationObserver = new MutationObserver((mutations) => {
        let hasNewVideos = false;

        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              const videos = element.querySelectorAll ? element.querySelectorAll("video") : [];
              if (videos.length > 0) {
                hasNewVideos = true;
              }
            }
          });
        });

        if (hasNewVideos) {
          setTimeout(initializeVideos, 100);
        }
      });

      setTimeout(initializeVideos, 100);
      mutationObserver.observe(host, {
        childList: true,
        subtree: true,
      });

      return () => {
        intersectionObserver.disconnect();
        mutationObserver.disconnect();
        pauseAllVideos();
        videoVisibility.clear();
      };
    }, deps);
  };

  // Apply autoplay to each section
  useAutoplayIn(trendingFeedRef, [trendingSpliks, selectedCategory]);
  useAutoplayIn(nearbyFeedRef, [nearbySpliks, locationPermission]);

  const handleSplik = (splikId: string) => {
    console.log("Splik:", splikId);
  };

  const handleReact = async (splikId: string) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to react to videos",
        variant: "default",
      });
      return;
    }

    setTrendingSpliks((prev) =>
      prev.map((splik) =>
        splik.id === splikId
          ? { ...splik, likes_count: (splik.likes_count || 0) + 1, user_has_liked: true }
          : splik
      )
    );
    setNearbySpliks((prev) =>
      prev.map((splik) =>
        splik.id === splikId
          ? { ...splik, likes_count: (splik.likes_count || 0) + 1, user_has_liked: true }
          : splik
      )
    );

    try {
      await supabase.rpc("handle_like", { splik_id: splikId });
    } catch (error) {
      console.error("Error liking splik:", error);
      setTrendingSpliks((prev) =>
        prev.map((splik) =>
          splik.id === splikId
            ? { ...splik, likes_count: Math.max(0, (splik.likes_count || 0) - 1), user_has_liked: false }
            : splik
        )
      );
      setNearbySpliks((prev) =>
        prev.map((splik) =>
          splik.id === splikId
            ? { ...splik, likes_count: Math.max(0, (splik.likes_count || 0) - 1), user_has_liked: false }
            : splik
        )
      );
    }
  };

  const handleShare = async (splikId: string) => {
    const url = `${window.location.origin}/video/${splikId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Check out this trending Splik!", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied!", description: "The video link has been copied to your clipboard" });
      }
    } catch {
      toast({ title: "Failed to share", description: "Please try again", variant: "destructive" });
    }
  };

  return (
    <>
      {/* Top header with updated controls */}
      <div className="bg-gradient-to-b from-secondary/10 to-background py-8 px-4">
        <div className="container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Home</h1>
              <p className="text-muted-foreground">
                Find trending splikz and rising creators • New shuffle each refresh
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUpdate}
                disabled={refreshing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Update
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Shuffle
              </Button>
            </div>
          </div>
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
                  <p className="text-muted-foreground mb-4">
                    {selectedCategory
                      ? `No ${selectedCategory} videos found. Try a different category!`
                      : "Be the first to post a trending splik!"}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button onClick={handleUpdate} variant="outline" disabled={refreshing}>
                      {refreshing ? "Updating..." : "Get Latest"}
                    </Button>
                    <Button onClick={handleRefresh} disabled={refreshing}>
                      {refreshing ? "Shuffling..." : "Shuffle Discovery"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="text-center text-sm text-muted-foreground mb-4">
                  Showing {trendingSpliks.length} trending videos • New shuffle each refresh
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
                        onSplik={() => handleSplik(s.id)}
                        onReact={() => handleReact(s.id)}
                        onShare={() => handleShare(s.id)}
                      />
                    ))}
                </div>
                <div className="text-center py-6 border-t border-border/40">
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button
                      onClick={handleUpdate}
                      variant="outline"
                      disabled={refreshing}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                      {refreshing ? "Updating..." : "Get Latest"}
                    </Button>
                    <Button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                      {refreshing ? "Shuffling..." : "Shuffle Discovery"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* RISING */}
          <TabsContent value="rising" className="space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Finding rising creators...</p>
              </div>
            ) : risingCreators.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Rising Creators</h3>
                  <p className="text-muted-foreground mb-4">Join now to become a rising star!</p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button onClick={handleUpdate} variant="outline" disabled={refreshing}>
                      {refreshing ? "Updating..." : "Get Latest"}
                    </Button>
                    <Button onClick={handleRefresh} disabled={refreshing}>
                      {refreshing ? "Shuffling..." : "Shuffle Creators"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="text-center text-sm text-muted-foreground mb-4">
                  Discover {risingCreators.length} rising creators • New shuffle each refresh
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {risingCreators.map((creator, i) => (
                    <Card key={creator.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                      <CardContent className="p-4">
                        <Link
                          to={`/creator/${creator.username || (creator as any).handle || creator.id}`}
                          className="block mb-3"
                        >
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
                                @{creator.username || (creator as any).handle || "unknown"}
                              </p>
                            </div>
                          </div>
                        </Link>
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary">{creator.followers_count || 0} followers</Badge>
                          <FollowButton
                            profileId={creator.id}
                            username={creator.username || (creator as any).handle}
                            size="sm"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="text-center py-4">
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button onClick={handleUpdate} variant="outline" disabled={refreshing}>
                      Get Latest Creators
                    </Button>
                    <Button onClick={handleRefresh} disabled={refreshing}>
                      Shuffle Creators
                    </Button>
                  </div>
                </div>
              </>
            )}
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
            ) : loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Finding nearby content...</p>
              </div>
            ) : nearbySpliks.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Nearby Splikz</h3>
                  <p className="text-muted-foreground mb-4">No videos from creators near you yet</p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button onClick={handleUpdate} variant="outline" disabled={refreshing}>
                      {refreshing ? "Updating..." : "Get Latest"}
                    </Button>
                    <Button onClick={handleRefresh} disabled={refreshing}>
                      {refreshing ? "Shuffling..." : "Shuffle Nearby"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="text-center text-sm text-muted-foreground mb-4">
                  Showing {nearbySpliks.length} nearby videos • New shuffle each refresh
                </div>
                <div ref={nearbyFeedRef} className="space-y-8">
                  {nearbySpliks.map((s) => (
                    <SplikCard
                      key={s.id}
                      splik={s}
                      onSplik={() => handleSplik(s.id)}
                      onReact={() => handleReact(s.id)}
                      onShare={() => handleShare(s.id)}
                    />
                  ))}
                </div>
                <div className="text-center py-6 border-t border-border/40">
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button
                      onClick={handleUpdate}
                      variant="outline"
                      disabled={refreshing}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                      {refreshing ? "Updating..." : "Get Latest"}
                    </Button>
                    <Button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                      {refreshing ? "Shuffling..." : "Shuffle Nearby"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default Explore;
