// src/pages/Food.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SplikCard from "@/components/splik/SplikCard";

import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { Loader2, Utensils, RefreshCw, MapPin, Flame, Shield } from "lucide-react";
import {
  applySessionRotation,
  forceNewRotation,
  type SplikWithScore,
} from "@/lib/feed";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  prefer_food?: boolean | null; // optional column
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
  // optional geo fields
  geo_lat?: number | null;
  geo_lng?: number | null;
  location_name?: string | null;
  profile?: Profile;
};

export default function Food() {
  const { toast } = useToast();
  const navigate = useNavigate();

  // user/auth
  const [user, setUser] = useState<any>(null);

  // feed state
  const [spliks, setSpliks] = useState<SplikRow[]>([]);
  const [rawFood, setRawFood] = useState<SplikRow[]>([]); // for nearby/top creator calcs
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // autoplay container
  const feedRef = useRef<HTMLDivElement | null>(null);

  // prefer food toggle (persist)
  const [preferFood, setPreferFood] = useState<boolean>(() => {
    const ls = localStorage.getItem("prefer_food");
    return ls === "1";
  });

  // nearby (requires explicit consent)
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [geoConsent, setGeoConsent] = useState<boolean>(() => localStorage.getItem("food_geo_consent") === "1");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [nearby, setNearby] = useState<SplikRow[]>([]);
  const [nearbyRadiusKm] = useState(35); // fixed for simplicity

  // top creators this week
  const [topCreators, setTopCreators] = useState<
    { user_id: string; score: number; uploads: number; likes: number; comments: number; profile?: Profile | null }[]
  >([]);

  // ---------- auth boot ----------
  useEffect(() => {
    const boot = async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user ?? null;
      setUser(u);

      // try to hydrate prefer_food from profile if present
      if (u) {
        const { data: p } = await supabase
          .from("profiles")
          .select("id, prefer_food")
          .eq("id", u.id)
          .maybeSingle();
        if (p && typeof p.prefer_food === "boolean") {
          setPreferFood(!!p.prefer_food);
          localStorage.setItem("prefer_food", p.prefer_food ? "1" : "0");
        }
      }

      void fetchFood();
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });

    boot();
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // ---------- feed fetch ----------
  const fetchFood = async (notify = false, newShuffle = false) => {
    try {
      if (notify) setRefreshing(true);
      else setLoading(true);

      if (newShuffle) forceNewRotation();

      const { data, error } = await supabase
        .from("spliks")
        .select("*")
        .eq("is_food", true)
        .order("created_at", { ascending: false })
        .limit(150);

      if (error) throw error;

      const sane = (data || []).map((r) => ({
        ...r,
        likes_count: r.likes_count || 0,
        comments_count: r.comments_count || 0,
        boost_score: r.boost_score || 0,
      })) as SplikRow[];

      // Rotation for variety
      const rotated = applySessionRotation(
        sane.map((row) => ({ ...row, tag: "food" })) as unknown as SplikWithScore[],
        { userId: user?.id, category: "food", feedType: "discovery", maxResults: 60 }
      );

      // attach profiles (simple batched loop)
      const withProfiles = await Promise.all(
        rotated.map(async (row: any) => {
          const { data: p } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .eq("id", row.user_id)
            .maybeSingle();
          return { ...row, profile: p || undefined } as SplikRow;
        })
      );

      setSpliks(withProfiles);
      setRawFood(sane);

      if (notify) {
        toast({
          title: newShuffle ? "Shuffled Food feed!" : "Updated Food feed!",
          description: newShuffle
            ? "Enjoy a brand-new mix of 3-second bites."
            : "Fresh food clips just arrived.",
        });
      }
    } catch (err) {
      console.error(err);
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

  // ---------- prefer food toggle ----------
  const handlePreferFood = async (checked: boolean) => {
    setPreferFood(checked);
    localStorage.setItem("prefer_food", checked ? "1" : "0");
    // your home feed can read this and weight food higher
    localStorage.setItem("feed_pref_food", checked ? "boost" : "off");

    if (user) {
      // try to save on profile (safe if column doesn't exist)
      const { error } = await supabase.from("profiles").update({ prefer_food: checked }).eq("id", user.id);
      if (error) {
        // ignore if column missing
        console.debug("profiles.prefer_food update skipped:", error.message);
      }
    }

    toast({
      title: checked ? "You'll see more Food in Home" : "Food preference turned off",
      description: checked ? "You can change this anytime." : "Back to a balanced Home feed.",
    });
  };

  // ---------- location / nearby ----------
  const askForLocation = () => setShowLocationDialog(true);

  const enableLocation = () => {
    // user explicitly confirmed in dialog
    localStorage.setItem("food_geo_consent", "1");
    setGeoConsent(true);

    if (!("geolocation" in navigator)) {
      toast({ title: "Location unavailable", description: "Your browser does not support geolocation." });
      setShowLocationDialog(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast({ title: "Location enabled", description: "Showing nearby food spliks." });
      },
      (err) => {
        console.warn("geo denied", err);
        toast({ title: "Location denied", description: "We won’t show nearby items without your location." });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );

    setShowLocationDialog(false);
  };

  const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  useEffect(() => {
    // build nearby list whenever we have rawFood + geo
    if (!geo) {
      setNearby([]);
      return;
    }
    const candidates = rawFood.filter(
      (r) => typeof r.geo_lat === "number" && typeof r.geo_lng === "number"
    );
    const top = candidates
      .map((r) => ({
        row: r,
        dist: haversineKm(geo, { lat: r.geo_lat as number, lng: r.geo_lng as number }),
      }))
      .filter((x) => x.dist <= nearbyRadiusKm)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 10)
      .map((x) => x.row);
    setNearby(top);
  }, [geo, rawFood, nearbyRadiusKm]);

  const nearbyWithDistance = useMemo(() => {
    if (!geo) return [];
    return nearby.map((r) => ({
      row: r,
      km: Math.round(haversineKm(geo, { lat: r.geo_lat!, lng: r.geo_lng! }) * 10) / 10,
    }));
  }, [nearby, geo]);

  // ---------- top creators this week ----------
  useEffect(() => {
    const run = async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const recent = rawFood.filter((r) => r.created_at >= since);
      const map = new Map<string, { uploads: number; likes: number; comments: number }>();

      for (const r of recent) {
        const rec = map.get(r.user_id) || { uploads: 0, likes: 0, comments: 0 };
        rec.uploads += 1;
        rec.likes += r.likes_count || 0;
        rec.comments += r.comments_count || 0;
        map.set(r.user_id, rec);
      }

      const list = Array.from(map.entries())
        .map(([user_id, m]) => ({
          user_id,
          uploads: m.uploads,
          likes: m.likes,
          comments: m.comments,
          score: m.likes + m.comments + m.uploads * 2,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      const withProfiles = await Promise.all(
        list.map(async (row) => {
          const { data: p } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .eq("id", row.user_id)
            .maybeSingle();
          return { ...row, profile: p || null };
        })
      );

      setTopCreators(withProfiles);
    };

    void run();
  }, [rawFood]);

  // ---------- autoplay (same pattern you use elsewhere) ----------
  const useAutoplayIn = (hostRef: React.RefObject<HTMLElement>, deps: any[] = []) => {
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const vis = new Map<HTMLVideoElement, number>();
      let current: HTMLVideoElement | null = null;
      let busy = false;

      const getVids = () => Array.from(host.querySelectorAll("video")) as HTMLVideoElement[];
      const pauseAll = (except?: HTMLVideoElement) =>
        getVids().forEach((v) => (v !== except && !v.paused ? v.pause() : null));

      const best = () => {
        const sorted = Array.from(vis.entries()).sort((a, b) => b[1] - a[1]);
        const top = sorted[0];
        return top && top[1] >= 0.6 ? top[0] : null;
      };

      const drive = async () => {
        if (busy) return;
        busy = true;
        try {
          const target = best();
          if (current && (vis.get(current) || 0) < 0.45) {
            current.pause();
            current = null;
          }
          if (target && target !== current) {
            pauseAll(target);
            target.muted = true;
            target.playsInline = true;
            target.setAttribute("webkit-playsinline", "true");
            try {
              await target.play();
              current = target;
            } catch {
              /* ignore */
            }
          } else if (!target && current) {
            current.pause();
            current = null;
          }
        } finally {
          busy = false;
        }
      };

      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            vis.set(e.target as HTMLVideoElement, e.intersectionRatio);
          }
          void drive();
        },
        { threshold: [0, 0.25, 0.45, 0.6, 0.75, 1] }
      );

      const init = () =>
        getVids().forEach((v) => {
          if (!v.hasAttribute("data-mobile-init")) {
            v.muted = true;
            v.preload = "metadata";
            v.setAttribute("data-mobile-init", "1");
          }
          io.observe(v);
        });

      const mo = new MutationObserver(() => setTimeout(init, 80));
      setTimeout(init, 80);
      mo.observe(host, { childList: true, subtree: true });

      return () => {
        io.disconnect();
        mo.disconnect();
        pauseAll();
        vis.clear();
      };
    }, deps);
  };

  useAutoplayIn(feedRef, [spliks]);

  // ---------- UI helpers ----------
  const handleUpdate = () => fetchFood(true, false);
  const handleShuffle = () => fetchFood(true, true);

  const avatarInitial = (p?: Profile) =>
    p?.display_name?.[0] || p?.username?.[0] || "U";

  const nearbyEmpty = geoConsent && geo && nearbyWithDistance.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-b from-secondary/15 to-transparent border-b">
        <div className="mx-auto max-w-7xl px-4 py-8 md:py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500">
                <Utensils className="h-5 w-5 text-white" />
              </span>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">
                  Food — 3-second bites that make you hungry
                </h1>
                <p className="text-sm text-muted-foreground">
                  Auto-looping, fast-discovering food moments. Post yours and get featured.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleUpdate} disabled={refreshing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Update
              </Button>
              <Button size="sm" onClick={handleShuffle} disabled={refreshing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Shuffle
              </Button>
              <Button onClick={() => navigate(user ? "/upload" : "/login")} size="sm">
                Post a Food Splik
              </Button>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-3 sm:px-4 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CENTER FEED */}
          <div className="lg:col-span-8">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Loading delicious content…</p>
              </div>
            ) : spliks.length === 0 ? (
              <Card className="max-w-md mx-auto">
                <CardContent className="p-8 text-center">
                  <Utensils className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No food videos yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Be the first to upload a tasty 3-second bite.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button onClick={handleUpdate} variant="outline" disabled={refreshing}>
                      {refreshing ? "Updating…" : "Get Latest"}
                    </Button>
                    <Button onClick={handleShuffle} disabled={refreshing}>
                      {refreshing ? "Shuffling…" : "Shuffle Food"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="text-center text-sm text-muted-foreground mb-4">
                  Showing {spliks.length} food spliks
                </div>

                <div ref={feedRef} className="max-w-[500px] mx-auto space-y-4 md:space-y-6">
                  {spliks.map((s) => (
                    <SplikCard key={s.id} splik={s as any} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* RIGHT RAIL */}
          <aside className="lg:col-span-4 space-y-6">
            {/* Prefer Food */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Prefer Food content</h3>
                    <p className="text-xs text-muted-foreground">
                      We’ll show you <strong>more Food</strong> on the Home feed. This is saved to your
                      browser and, if you’re signed in, to your profile. You can turn it off anytime.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="prefer-food" className="text-xs">{preferFood ? "On" : "Off"}</Label>
                    <Switch id="prefer-food" checked={preferFood} onCheckedChange={handlePreferFood} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Nearby Food Spliks */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">Nearby Food Spliks</h3>
                </div>

                {!geoConsent ? (
                  <div className="text-sm text-muted-foreground">
                    See food posted around you. We’ll ask for permission first and only use your
                    location to find nearby content — it’s not stored.
                  </div>
                ) : !geo ? (
                  <div className="text-sm text-muted-foreground">
                    Location enabled — looking for tasty clips near you…
                  </div>
                ) : null}

                {!geoConsent ? (
                  <Button onClick={askForLocation} size="sm" className="w-full">
                    Enable location
                  </Button>
                ) : nearbyWithDistance.length > 0 ? (
                  <div className="space-y-2">
                    {nearbyWithDistance.map(({ row, km }) => (
                      <Link
                        key={row.id}
                        to={`/video/${row.id}`}
                        className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent transition-colors"
                      >
                        <div className="h-12 w-10 rounded-md overflow-hidden bg-black/10 flex items-center justify-center">
                          {row.thumbnail_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.thumbnail_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Utensils className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{row.title || "Untitled"}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.location_name ? `${row.location_name} • ` : ""}{km} km away
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : geoConsent && geo && nearbyEmpty ? (
                  <div className="text-sm text-muted-foreground">
                    No nearby food spliks within {nearbyRadiusKm} km yet — check back soon!
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* Top Food Creators this week */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">Top Food Creators (7d)</h3>
                </div>

                {topCreators.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nobody’s topped the charts (yet).</div>
                ) : (
                  <div className="space-y-2">
                    {topCreators.map((c, idx) => (
                      <Link
                        key={c.user_id}
                        to={`/creator/${c.profile?.username || c.user_id}`}
                        className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent transition-colors"
                      >
                        <Badge variant="secondary" className="w-6 justify-center">{idx + 1}</Badge>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={c.profile?.avatar_url || undefined} />
                          <AvatarFallback>{avatarInitial(c.profile || undefined)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {c.profile?.display_name || c.profile?.username || "Creator"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Score {c.score} · {c.uploads} uploads · {c.likes} ❤️ · {c.comments} 💬
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Creator callout: why post here */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">Why food creators love Splikz</h3>
                </div>
                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                  <li>3-second loop — your dish gets instant attention.</li>
                  <li>Dedicated Food page + “Nearby” spotlight.</li>
                  <li>Weekly Top Food Creators board.</li>
                  <li>Optional Promote to jump the line when launching.</li>
                </ul>
                <Button onClick={() => navigate(user ? "/upload" : "/login")} className="w-full">
                  Post your 3-sec bite
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>

      <Footer />

      {/* LOCATION CONSENT DIALOG */}
      <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Show nearby food videos?</DialogTitle>
            <DialogDescription>
              We’ll use your current location <strong>one time</strong> to find food spliks posted near you.
              We don’t store your location. You can change this choice anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowLocationDialog(false)}>
              Not now
            </Button>
            <Button onClick={enableLocation}>Allow location</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
