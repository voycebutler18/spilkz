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
import { FollowButton } from "@/components/FollowButton";
import { supabase, type Splik, type Profile } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

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
  const [locationPermission, setLocationPermission] =
    useState<"granted" | "denied" | "prompt">("prompt");
  const { toast } = useToast();

  // One feed container for autoplay (no nested scroller)
  const trendingFeedRef = useRef<HTMLDivElement | null>(null);
  const nearbyFeedRef = useRef<HTMLDivElement | null>(null);

  /** Fetch Trending + Rising */
  useEffect(() => {
    const fetchTrendingData = async () => {
      try {
        const { data: spliksData, error: spliksError } = await supabase
          .from("spliks")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30);

        if (!spliksError && spliksData) {
          const withProfiles = await Promise.all(
            spliksData.map(async (s) => {
              const { data: p } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", s.user_id)
                .maybeSingle();
              return { ...s, profile: p || undefined };
            })
          );
          setTrendingSpliks(withProfiles || []);
        }

        const { data: creatorsData, error: creatorsError } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(8);

        if (!creatorsError) setRisingCreators(creatorsData || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchTrendingData();
  }, [toast]);

  /** Fetch Nearby (placeholder: same as trending for now) */
  const fetchNearbySpliks = async () => {
    try {
      const { data: spliksData, error } = await supabase
        .from("spliks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);

      if (!error && spliksData) {
        const withProfiles = await Promise.all(
          spliksData.map(async (s) => {
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

  /**
   * ======= Autoplay manager (single page scroll, no nested scroller) =======
   * - Picks the most visible <video> in the feed and plays it (muted for autoplay).
   * - Pauses others. If current falls below ~45% visible, it pauses and switches.
   * - Works with videos inside your SplikCard (we observe any <video> under the feed).
   */
  const useAutoplayIn = (hostRef: React.RefObject<HTMLElement>, deps: any[] = []) => {
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      // Track visibility ratios for videos in this section
      const ratios = new Map<HTMLVideoElement, number>();
      let current: HTMLVideoElement | null = null;

      const getVideos = () =>
        Array.from(host.querySelectorAll("video")) as HTMLVideoElement[];

      const pauseAll = (except?: HTMLVideoElement | null) => {
        getVideos().forEach((v) => {
          if (v !== except && !v.paused) v.pause();
        });
      };

      const pickAndPlay = () => {
        const items = [...ratios.entries()].sort((a, b) => b[1] - a[1]);
        const top = items[0];
        const next = top && top[1] >= 0.6 ? top[0] : null;

        if (next && next !== current) {
          // Pause previous
          if (current) current.pause();

          // Ensure muted autoplay works, but don't re-mute if user unmuted
          if (!next.muted && next.paused) {
            // keep user's choice; if blocked, we'll try muted
          }
          next.playsInline = true;
          next.preload = "metadata";

          next
            .play()
            .catch(() => {
              // If autoplay blocked, try muted
              next.muted = true;
              return next.play().catch(() => {});
            })
            .finally(() => {
              current = next;
              pauseAll(next);
            });
        } else if (!next) {
          // No sufficiently visible video -> pause all
          pauseAll(null);
          current = null;
        }
      };

      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const vid = e.target as HTMLVideoElement;
            ratios.set(vid, e.intersectionRatio);

            // If current falls out, pause quickly
            if (vid === current && e.intersectionRatio < 0.45) {
              vid.pause();
              current = null;
            }
          }
          pickAndPlay();
        },
        { root: null, threshold: [0, 0.25, 0.5, 0.75, 1] }
      );

      // Observe current videos
      getVideos().forEach((v) => {
        // set muted initially so autoplay works; user can unmute via your SplikCard UI
        if (v.muted === undefined) v.muted = true;
        io.observe(v);
      });

      // If SplikCards render later, observe newly added videos too
      const mo = new MutationObserver(() => {
        getVideos().forEach((v) => {
          if (!ratios.has(v)) {
            v.muted = v.muted ?? true;
            io.observe(v);
          }
        });
      });
      mo.observe(host, { childList: true, subtree: true });

      // Cleanup
      return () => {
        io.disconnect();
        mo.disconnect();
        pauseAll(null);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
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

          {/* TRENDING — single page scroll, one card per row, autoplay managed by IntersectionObserver */}
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
                      : (s as any).tag?.toLowerCase().includes(selectedCategory)
                  )
                  .map((s) => (
                    <SplikCard
                      key={s.id}
                      splik={s}
                      onSplik={() => {}}
                      onReact={() => {}}
                      onShare={() => {}}
                    />
                  ))}
              </div>
            )}
          </TabsContent>

          {/* RISING creators (grid, no autoplay needed) */}
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
            )}
          </TabsContent>

          {/* NEARBY — single page scroll, autoplay same as Trending */}
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
                  <SplikCard
                    key={s.id}
                    splik={s}
                    onSplik={() => {}}
                    onReact={() => {}}
                    onShare={() => {}}
                  />
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
