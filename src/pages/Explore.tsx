// src/pages/Explore.tsx
import { useState, useEffect, useRef, useMemo } from "react";
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
  Volume2,
  VolumeX,
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

/* ------------------------------------------------------------------ */
/*  Minimal vertical autoplay feed (TikTok-style) just for Trending   */
/* ------------------------------------------------------------------ */
function AutoplayVerticalFeed({ items }: { items: Array<{
  id: string;
  video_url: string;
  thumbnail_url?: string | null;
  trim_start?: number | null;
}> }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState<Record<number, boolean>>({});

  // dense thresholds (0..1 step .05) so we can pick the most-visible section
  const thresholds = useMemo(
    () => Array.from({ length: 21 }, (_, i) => i / 20),
    []
  );

  // Observe visibility of each section; pick most visible (>= 0.55)
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const vis: Record<number, number> = {};
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const idx = Number((e.target as HTMLElement).dataset.index);
          vis[idx] = e.intersectionRatio;
        });

        let best = active;
        let bestR = vis[best] ?? 0;
        for (const [k, v] of Object.entries(vis)) {
          const i = Number(k);
          if (v > bestR) {
            best = i;
            bestR = v;
          }
        }
        if (bestR >= 0.55 && best !== active) setActive(best);
      },
      { root, threshold: thresholds }
    );

    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-index]"));
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length, thresholds]); // re-init when items change

  // Only play the active one; pause others. Loop exact 3s from trim_start.
  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === active) {
        const startAt = Number(items[i]?.trim_start ?? 0);
        const onTime = () => {
          if (v.currentTime - startAt >= 3) v.currentTime = startAt;
        };
        v.removeEventListener("timeupdate", onTime);
        v.addEventListener("timeupdate", onTime);

        v.muted = muted[i] ?? true;
        v.playsInline = true;
        if (startAt > 0) v.currentTime = startAt;

        v.play().catch(() => {
          if (!v.muted) {
            v.muted = true;
            // reflect in UI state
            setMuted((m) => ({ ...m, [i]: true }));
            v.play().catch(() => {});
          }
        });
      } else {
        if (!v.paused) v.pause();
      }
    });
  }, [active, items, muted]);

  const scrollTo = (i: number) => {
    const root = containerRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-index="${i}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleMute = (i: number) => {
    const v = videoRefs.current[i];
    if (!v) return;
    const next = !(muted[i] ?? true);
    v.muted = next;
    setMuted((m) => ({ ...m, [i]: next }));
  };

  return (
    <div
      ref={containerRef}
      className="h-[100svh] overflow-y-auto snap-y snap-mandatory scroll-smooth rounded-lg"
    >
      {items.map((s, i) => (
        <section
          key={s.id}
          data-index={i}
          className="snap-start min-h-[100svh] w-full flex items-center justify-center"
        >
          <div className="relative bg-black aspect-[9/16] w-full max-w-lg mx-auto rounded-xl overflow-hidden">
            <video
              ref={(el) => (videoRefs.current[i] = el)}
              src={s.video_url}
              poster={s.thumbnail_url ?? undefined}
              className="w-full h-full object-cover"
              playsInline
              muted={muted[i] ?? true}
              onEnded={() => scrollTo(Math.min(i + 1, items.length - 1))}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMute(i);
              }}
              className="absolute bottom-3 right-3 bg-black/50 rounded-full p-2 z-20"
            >
              {muted[i] ? (
                <VolumeX className="h-4 w-4 text-white" />
              ) : (
                <Volume2 className="h-4 w-4 text-white" />
              )}
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}

const Explore = () => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [trendingSpliks, setTrendingSpliks] = useState<Splik[]>([]);
  const [risingCreators, setRisingCreators] = useState<Profile[]>([]);
  const [nearbySpliks, setNearbySpliks] = useState<Splik[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const { toast } = useToast();

  useEffect(() => {
    const fetchTrendingData = async () => {
      try {
        const { data: spliksData, error: spliksError } = await supabase
          .from('spliks')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);

        if (spliksError) {
          console.error('Spliks error:', spliksError);
        } else if (spliksData) {
          // join profile data manually
          const spliksWithProfiles = await Promise.all(
            spliksData.map(async (splik) => {
              const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', splik.user_id)
                .maybeSingle();
              return { ...splik, profile: profileData || undefined };
            })
          );
          setTrendingSpliks(spliksWithProfiles || []);
        }

        const { data: creatorsData, error: creatorsError } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(6);

        if (creatorsError) console.error('Creators error:', creatorsError);
        setRisingCreators(creatorsData || []);
      } catch (error) {
        console.error('Error fetching trending data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrendingData();
  }, [toast]);

  // Request location permission
  const requestLocationPermission = async () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserLocation(location);
          setLocationPermission('granted');
          localStorage.setItem('userLocation', JSON.stringify(location));
          await fetchNearbySpliks(location);
          toast({ title: "Location enabled", description: "Now showing spliks from creators near you" });
        },
        (error) => {
          console.error('Location error:', error);
          setLocationPermission('denied');
          toast({
            title: "Location access denied",
            description: "Enable location in your browser settings to see nearby content",
            variant: "destructive",
          });
        }
      );
    } else {
      toast({
        title: "Location not supported",
        description: "Your browser doesn't support location services",
        variant: "destructive",
      });
    }
  };

  // Fetch spliks from nearby creators (placeholder: fetch recent)
  const fetchNearbySpliks = async (_location: { lat: number; lng: number }) => {
    try {
      const { data: spliksData, error } = await supabase
        .from('spliks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Nearby error:', error);
      } else if (spliksData) {
        const spliksWithProfiles = await Promise.all(
          spliksData.map(async (splik) => {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', splik.user_id)
              .maybeSingle();
            return { ...splik, profile: profileData || undefined };
          })
        );
        setNearbySpliks(spliksWithProfiles || []);
      }
    } catch (err) {
      console.error('Error fetching nearby spliks:', err);
    }
  };

  // stored location
  useEffect(() => {
    const storedLocation = localStorage.getItem('userLocation');
    if (storedLocation) {
      const location = JSON.parse(storedLocation);
      setUserLocation(location);
      setLocationPermission('granted');
      fetchNearbySpliks(location);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Header */}
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
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <Badge
                  key={category.id}
                  variant={selectedCategory === category.id ? "default" : "outline"}
                  className="cursor-pointer py-2 px-3 text-sm"
                  onClick={() =>
                    setSelectedCategory(selectedCategory === category.id ? null : category.id)
                  }
                >
                  <Icon className={`h-4 w-4 mr-1 ${category.color}`} />
                  {category.label}
                </Badge>
              );
            })}
          </div>

          {/* -------- Trending: now vertical autoplay feed -------- */}
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
              <AutoplayVerticalFeed
                items={trendingSpliks.filter(
                  (s) => !selectedCategory || s.tag?.toLowerCase().includes(selectedCategory)
                )}
              />
            )}
          </TabsContent>

          {/* Rising: unchanged grid */}
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {risingCreators.map((creator, i) => (
                  <Card key={creator.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                    <CardContent className="p-4">
                      <Link
                        to={`/creator/${creator.username || creator.handle || creator.id}`}
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
                              @{creator.username || creator.handle || "unknown"}
                            </p>
                          </div>
                        </div>
                      </Link>
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">{creator.followers_count || 0} followers</Badge>
                        <FollowButton
                          profileId={creator.id}
                          username={creator.username || creator.handle}
                          size="sm"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Nearby: keep your existing UX; you can swap in the feed later if you want */}
          <TabsContent value="nearby" className="space-y-6">
            {locationPermission !== 'granted' ? (
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {nearbySpliks.map((splik) => (
                  <SplikCard
                    key={splik.id}
                    splik={splik}
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
