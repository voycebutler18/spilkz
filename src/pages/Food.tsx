// src/pages/Food.tsx
import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import SplikCard from "@/components/splik/SplikCard";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Loader2, Utensils, RefreshCw, MapPin, LocateFixed, Search as SearchIcon, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { applySessionRotation, forceNewRotation, type SplikWithScore } from "@/lib/feed";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Profile = {
  id: string;
  username?: string | null;
  handle?: string | null;
  first_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type SplikRow = {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  likes_count: number | null;
  comments_count: number | null;
  created_at: string;
  is_food: boolean;
  boost_score?: number | null;
  profile?: Profile;
};

type NearbyRestaurant = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  address?: string;
  cuisine?: string;
};

export default function Food() {
  const [spliks, setSpliks] = useState<SplikRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();

  // Autoplay ref
  const foodFeedRef = useRef<HTMLDivElement | null>(null);

  // Nearby restaurants modal state
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [locStage, setLocStage] = useState<"idle" | "asking" | "have" | "error">("idle");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [fetchingNearby, setFetchingNearby] = useState(false);
  const [nearby, setNearby] = useState<NearbyRestaurant[]>([]);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState("");

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetchFood();

    // Realtime updates for food likes/comments
    const channel = supabase
      .channel("food-feed")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "spliks", filter: "is_food=eq.true" },
        (payload) => {
          setSpliks((prev) =>
            prev.map((s) =>
              s.id === (payload.new as any).id
                ? {
                    ...s,
                    likes_count: (payload.new as any).likes_count ?? 0,
                    comments_count: (payload.new as any).comments_count ?? 0,
                  }
                : s
            )
          );
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const fetchFood = async (showRefreshToast: boolean = false, forceNewShuffle: boolean = false) => {
    try {
      if (showRefreshToast) setRefreshing(true);
      else setLoading(true);

      if (forceNewShuffle) forceNewRotation();

      const { data, error } = await supabase
        .from("spliks")
        .select("*")
        .eq("is_food", true)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      if (data?.length) {
        const rotated = applySessionRotation(
          data.map((item) => ({
            ...item,
            likes_count: item.likes_count || 0,
            comments_count: item.comments_count || 0,
            boost_score: item.boost_score || 0,
            tag: "food",
          })) as SplikWithScore[],
          {
            userId: user?.id,
            category: "food",
            feedType: "discovery" as const,
            maxResults: 50,
          }
        );

        const withProfiles = await Promise.all(
          rotated.map(async (row: any) => {
            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", row.user_id)
              .maybeSingle();
            return { ...row, profile: profile || undefined } as SplikRow;
          })
        );

        setSpliks(withProfiles);
      } else {
        setSpliks([]);
      }

      if (showRefreshToast) {
        toast({
          title: forceNewShuffle ? "Food feed reshuffled!" : "Food feed refreshed!",
          description: forceNewShuffle
            ? "Showing you a completely new mix of food videos"
            : "Updated with latest food content",
        });
      }
    } catch (e) {
      console.error("Failed to load food videos:", e);
      toast({
        title: "Error",
        description: "Failed to load food videos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ===== Nearby Restaurants =====

  const openNearby = () => {
    setNearbyOpen(true);
    setLocStage("idle");
    setNearby([]);
    setNearbyError(null);
  };

  const requestLocation = () => {
    setLocStage("asking");
    if (!("geolocation" in navigator)) {
      setLocStage("error");
      setNearbyError("Geolocation is not available on this device.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const c = { lat: Number(latitude), lon: Number(longitude) };
        setCoords(c);
        setLocStage("have");
        void fetchNearbyByCoords(c);
      },
      (err) => {
        console.error("Geolocation error:", err);
        setLocStage("error");
        setNearbyError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. You can search by city instead."
            : "Unable to get your location. Try again or search by city."
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const haversineKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(la1) * Math.cos(la2) * sinDLon * sinDLon;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  // Overpass helper
  const overpassFetch = async (query: string) => {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: query,
    });
    if (!res.ok) throw new Error(`Overpass error ${res.status}`);
    return (await res.json()) as any;
  };

  const fetchNearbyByCoords = async ({ lat, lon }: { lat: number; lon: number }) => {
    setFetchingNearby(true);
    setNearbyError(null);
    try {
      // 2km radius for tight, relevant results (tweakable)
      const radius = 2000;
      const q = `
        [out:json][timeout:25];
        node["amenity"="restaurant"](around:${radius},${lat},${lon});
        out tags center;
      `;
      const json = await overpassFetch(q);
      const elements: any[] = json.elements || [];
      const mapped: NearbyRestaurant[] = elements
        .map((el) => {
          const name = el.tags?.name || "Unnamed Restaurant";
          const rLat = el.lat ?? el.center?.lat;
          const rLon = el.lon ?? el.center?.lon;
          if (typeof rLat !== "number" || typeof rLon !== "number") return null;
          const distanceKm = haversineKm({ lat, lon }, { lat: rLat, lon: rLon });
          const addressParts = [
            el.tags?.["addr:housenumber"],
            el.tags?.["addr:street"],
            el.tags?.["addr:city"],
          ].filter(Boolean);
          return {
            id: `${el.type}/${el.id}`,
            name,
            lat: rLat,
            lon: rLon,
            distanceKm,
            address: addressParts.join(" "),
            cuisine: el.tags?.cuisine,
          } as NearbyRestaurant;
        })
        .filter(Boolean) as NearbyRestaurant[];

      const byDistance = mapped.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 25);
      setNearby(byDistance);
    } catch (err: any) {
      console.error(err);
      setNearbyError("Couldn’t load restaurants nearby. Please try again.");
    } finally {
      setFetchingNearby(false);
    }
  };

  // Fallback: simple city/address -> coords via Nominatim, then reuse Overpass
  const searchByCity = async () => {
    if (!manualQuery.trim()) return;
    setFetchingNearby(true);
    setNearbyError(null);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", manualQuery);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      const res = await fetch(url.toString(), {
        headers: { "Accept-Language": "en" },
      });
      const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (!arr.length) {
        setNearbyError("Couldn’t find that place. Try a city name or address.");
        setFetchingNearby(false);
        return;
      }
      const c = { lat: Number(arr[0].lat), lon: Number(arr[0].lon) };
      setCoords(c);
      setLocStage("have");
      await fetchNearbyByCoords(c);
    } catch (err) {
      console.error(err);
      setNearbyError("Search failed. Please try a different city.");
    } finally {
      setFetchingNearby(false);
    }
  };

  const handleRefresh = () => fetchFood(true, true);
  const handleUpdate = () => fetchFood(true, false);

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
    setSpliks((prev) =>
      prev.map((s) =>
        s.id === splikId
          ? { ...s, likes_count: (s.likes_count || 0) + 1, user_has_liked: true as any }
          : s
      )
    );
    try {
      await supabase.rpc("handle_like", { splik_id: splikId });
    } catch (error) {
      console.error("Error liking splik:", error);
      setSpliks((prev) =>
        prev.map((s) =>
          s.id === splikId
            ? { ...s, likes_count: Math.max(0, (s.likes_count || 0) - 1), user_has_liked: false as any }
            : s
        )
      );
    }
  };

  const handleShare = async (splikId: string) => {
    const url = `${window.location.origin}/video/${splikId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Check out this delicious food video!", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied!", description: "The video link has been copied" });
      }
    } catch {
      toast({ title: "Failed to share", description: "Please try again", variant: "destructive" });
    }
  };

  // ===== Autoplay manager (unchanged) =====
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
            if (video.currentTime === 0) video.currentTime = 0.1;
          },
          { once: true }
        );
      };

      const getAllVideos = () => Array.from(host.querySelectorAll("video")) as HTMLVideoElement[];

      const pauseAllVideos = (exceptVideo?: HTMLVideoElement) => {
        getAllVideos().forEach((video) => {
          if (video !== exceptVideo && !video.paused) video.pause();
        });
      };

      const findMostVisibleVideo = (): HTMLVideoElement | null => {
        const entries = Array.from(videoVisibility.entries());
        if (!entries.length) return null;
        const [top] = entries.sort((a, b) => b[1] - a[1]);
        return top && top[1] >= 0.6 ? top[0] : null;
        ;
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
              await new Promise((r) => setTimeout(r, 100));
            }
            if (targetVideo.currentTime === 0 && targetVideo.duration > 0) {
              targetVideo.currentTime = 0.1;
            }

            try {
              await targetVideo.play();
              currentPlayingVideo = targetVideo;
            } catch (err) {
              if (!targetVideo.muted) {
                targetVideo.muted = true;
                try {
                  await targetVideo.play();
                  currentPlayingVideo = targetVideo;
                } catch {}
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
        { root: null, threshold: [0, 0.25, 0.45, 0.6, 0.75, 1.0], rootMargin: "10px" }
      );

      const initializeVideos = () => {
        const vids = getAllVideos();
        vids.forEach((video) => {
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
        let changed = false;
        mutations.forEach((m) =>
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1 && (n as Element).querySelectorAll?.("video").length) changed = true;
          })
        );
        if (changed) setTimeout(initializeVideos, 100);
      });

      setTimeout(initializeVideos, 100);
      mutationObserver.observe(host, { childList: true, subtree: true });

      return () => {
        intersectionObserver.disconnect();
        mutationObserver.disconnect();
        videoVisibility.clear();
        currentPlayingVideo = null;
      };
    }, deps);
  };

  useAutoplayIn(foodFeedRef, [spliks]);

  // UI helpers
  const coordsPretty = useMemo(() => {
    if (!coords) return "";
    return `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
  }, [coords]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Page header */}
      <div className="bg-gradient-to-b from-secondary/10 to-background py-8 px-4">
        <div className="container">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Utensils className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">Food</h1>
                <p className="text-muted-foreground">
                  Delicious 3-second clips • New shuffle each refresh
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {/* NEW: Nearby restaurants CTA */}
              <Button
                variant="outline"
                size="sm"
                onClick={openNearby}
                className="gap-2"
                title="Find restaurants near you"
              >
                <MapPin className="h-4 w-4" />
                Nearby restaurants
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleUpdate}
                disabled={refreshing}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Update
              </Button>
              <Button
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Shuffle
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main feed */}
      <main className="w-full py-6 md:py-8">
        <div className="mx-auto max-w-7xl px-3 sm:px-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Loading delicious content...</p>
            </div>
          ) : spliks.length === 0 ? (
            <Card className="max-w-md mx-auto">
              <CardContent className="p-8 text-center">
                <Utensils className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No food videos yet</h3>
                <p className="text-muted-foreground mb-4">
                  Be the first to upload a delicious clip.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button onClick={handleUpdate} variant="outline" disabled={refreshing}>
                    {refreshing ? "Updating..." : "Get Latest"}
                  </Button>
                  <Button onClick={handleRefresh} disabled={refreshing}>
                    {refreshing ? "Shuffling..." : "Shuffle Food"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="text-center text-sm text-muted-foreground mb-4">
                Showing {spliks.length} food videos • New shuffle each refresh
              </div>
              <div className="w-full">
                <div
                  ref={foodFeedRef}
                  className="max-w-[400px] sm:max-w-[500px] mx-auto space-y-4 md:space-y-6"
                >
                  {spliks.map((splik) => (
                    <SplikCard
                      key={splik.id}
                      splik={splik as any}
                      onSplik={() => handleSplik(splik.id)}
                      onReact={() => handleReact(splik.id)}
                      onShare={() => handleShare(splik.id)}
                    />
                  ))}
                </div>
              </div>
              <div className="text-center py-6 border-t border-border/40 mt-8">
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button onClick={handleUpdate} variant="outline" disabled={refreshing} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Updating..." : "Get Latest"}
                  </Button>
                  <Button onClick={handleRefresh} disabled={refreshing} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Shuffling..." : "Shuffle Food"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Nearby Restaurants Modal */}
      <Dialog open={nearbyOpen} onOpenChange={setNearbyOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Search nearby restaurants
            </DialogTitle>
            <DialogDescription>
              Find a spot, go try it, then post your 3-second food clip. Tip: include the restaurant
              name in your description or comments so others can find it.
            </DialogDescription>
          </DialogHeader>

          {/* Ask permission first */}
          {locStage === "idle" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <LocateFixed className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                We’ll use your current location to show nearby restaurants.
              </p>
              <Button onClick={requestLocation} className="gap-2">
                <LocateFixed className="h-4 w-4" />
                Use my location
              </Button>
              <div className="text-xs text-muted-foreground">or search by city</div>
              <div className="flex w-full items-center gap-2">
                <Input
                  placeholder="City or address"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                />
                <Button variant="outline" onClick={searchByCity} className="gap-2">
                  <SearchIcon className="h-4 w-4" />
                  Search
                </Button>
              </div>
            </div>
          )}

          {locStage === "asking" && (
            <div className="flex items-center gap-3 py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Requesting location…</p>
            </div>
          )}

          {(locStage === "have" || locStage === "error") && (
            <div className="space-y-4">
              {/* If we have coords, show them lightly */}
              {coords && (
                <p className="text-xs text-muted-foreground">
                  Using location: <span className="font-mono">{coordsPretty}</span>
                </p>
              )}

              {/* Manual search row (always available at this stage) */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search a city instead (optional)"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                />
                <Button variant="outline" onClick={searchByCity} className="gap-2">
                  <SearchIcon className="h-4 w-4" />
                  Search
                </Button>
              </div>

              {nearbyError && (
                <div className="text-sm text-red-500">{nearbyError}</div>
              )}

              {fetchingNearby ? (
                <div className="flex items-center gap-3 py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Finding restaurants near you…</p>
                </div>
              ) : nearby.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {locStage === "error"
                    ? "Location blocked. Try searching by city."
                    : "No nearby results yet. Hit “Use my location” or search a city."}
                </div>
              ) : (
                <div className="max-h-[50vh] overflow-y-auto rounded-md border">
                  {nearby.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 hover:bg-accent/40"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.address || "Address unavailable"}
                          {r.cuisine ? ` • ${r.cuisine}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">{r.distanceKm.toFixed(1)} km away</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                          href={`https://www.google.com/maps?q=${r.lat},${r.lon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent"
                          title="Open in Google Maps"
                        >
                          Maps <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Reminder: When you upload, feel free to mention the restaurant name in your description
                or drop it in the comments.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
