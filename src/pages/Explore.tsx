// src/pages/Explore.tsx
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Loader2, RefreshCw, Sparkles } from "lucide-react";
import SplikCard from "@/components/splik/SplikCard";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ──────────────────────────────────────────────────────────────────────────
   Helpers
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

/* ──────────────────────────────────────────────────────────────────────────
   SPLIKZ PHOTOS RAIL (photos only)
   - Invisible scrollbar (scrolls up/down, bar hidden)
   - Realtime + optimistic insert
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
const slugFor = (p?: RailProfile | null) =>
  p?.username ? p.username : p?.id || "";

function RightPhotoRail({
  title = "Splikz Photos",
  maxListHeight = "calc(100vh - 220px)",
  limit = 60,
  reloadToken = 0,
}: {
  title?: string;
  maxListHeight?: string | number;
  limit?: number;
  reloadToken?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PhotoItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
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

        const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
        if (userIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select(
              "id, username, display_name, first_name, last_name, avatar_url"
            )
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

    // realtime inserts
    const ch = supabase
      .channel("rail-vibe-photos")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibe_photos" },
        () => load()
      )
      .subscribe();

    // optimistic insert from local upload
    const onOptimistic = async (e: Event) => {
      // @ts-ignore
      const { user_id, photo_url } = e.detail || {};
      if (!user_id || !photo_url) return;
      try {
        const { data: p } = await supabase
          .from("profiles")
          .select(
            "id, username, display_name, first_name, last_name, avatar_url"
          )
          .eq("id", user_id)
          .maybeSingle();
        setItems((prev) => [
          {
            id: `local-${Date.now()}`,
            user_id,
            photo_url,
            created_at: new Date().toISOString(),
            profile: (p as RailProfile) || null,
          },
          ...prev,
        ]);
      } catch {}
    };

    window.addEventListener(
      "vibe-photo-uploaded",
      onOptimistic as EventListener
    );

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
      window.removeEventListener(
        "vibe-photo-uploaded",
        onOptimistic as EventListener
      );
      cancelled = true;
    };
  }, [limit, reloadToken]);

  return (
    <aside className="space-y-4">
      <div className="bg-card/60 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <Camera className="h-4 w-4 text-muted-foreground" />
        </div>

        <div
          className="space-y-3 overflow-y-auto pr-1 hide-scroll"
          style={{
            maxHeight:
              typeof maxListHeight === "number"
                ? `${maxListHeight}px`
                : maxListHeight,
          }}
        >
          {loading && (
            <div className="py-10 text-center text-muted-foreground text-sm">
              Loading photos…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="py-10 text-center text-muted-foreground text-sm">
              No photos yet
            </div>
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

                {/* Creator avatar → profile with all content */}
                <Link
                  to={slug ? `/creator/${slug}` : "#"}
                  className="absolute top-2 left-2 w-9 h-9 rounded-full border border-white/30 overflow-hidden bg-background/60 backdrop-blur flex items-center justify-center"
                  title={name}
                >
                  {person?.avatar_url ? (
                    <img
                      src={person.avatar_url}
                      alt={name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white text-xs font-semibold">
                      {name?.charAt(0).toUpperCase()}
                    </span>
                  )}
                </Link>

                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-white text-xs font-medium truncate">
                      {name}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* invisible scrollbar */}
      <style>{`
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </aside>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   PAGE: Home feed (no Nearby) + Splikz Photos
   - Desktop: left feed + right photo rail
   - Mobile: stacked (same order)
────────────────────────────────────────────────────────────────────────── */
const Explore = () => {
  const [feedSpliks, setFeedSpliks] = useState<(Splik & { profile?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);

  // upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const { toast } = useToast();
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  // Fetch the main Home feed (no tabs, no location)
  const fetchHomeFeed = async (showRefreshToast = false) => {
    try {
      showRefreshToast ? setRefreshing(true) : setLoading(true);

      const { data: spliksData, error } = await supabase
        .from("spliks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      if (spliksData && spliksData.length) {
        // batch hydrate profiles
        const rows = spliksData as Splik[];
        const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
        let byId: Record<string, Profile> = {};
        if (userIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("*")
            .in("id", userIds);
          (profs || []).forEach((p: any) => (byId[p.id] = p));
        }
        const withProfiles = rows.map((r) => ({
          ...r,
          profile: byId[r.user_id],
        }));
        setFeedSpliks(withProfiles);
        preconnect(withProfiles[0]?.video_url);
        warmFirstVideoMeta(withProfiles[0]?.video_url);
      } else {
        setFeedSpliks([]);
      }

      if (showRefreshToast) {
        toast({
          title: "Feed updated",
          description: "Showing the latest videos",
        });
      }
    } catch (e) {
      console.error("Home feed load error:", e);
      toast({
        title: "Error",
        description: "Failed to load your feed",
        variant: "destructive",
      });
      setFeedSpliks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHomeFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // autoplay helpers (same logic, for this single feed)
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

      const allVideos = () =>
        Array.from(host.querySelectorAll("video")) as HTMLVideoElement[];

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

          if (
            currentPlayingVideo &&
            (videoVisibility.get(currentPlayingVideo) || 0) < 0.45
          ) {
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
            if (target.currentTime === 0 && target.duration > 0)
              target.currentTime = 0.1;

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
            videoVisibility.set(
              e.target as HTMLVideoElement,
              e.intersectionRatio
            );
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

  useAutoplayIn(feedRef, [feedSpliks]);

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
      toast({
        title: "Failed to share",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  // Upload → Storage 'vibe_photos' → insert into public.vibe_photos → optimistic update
  const uploadPhoto = async () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Log in to upload a photo",
        variant: "destructive",
      });
      return;
    }
    if (!file) {
      toast({
        title: "No file selected",
        description: "Choose a photo first",
        variant: "destructive",
      });
      return;
    }
    try {
      setUploading(true);

      const bucket = "vibe_photos"; // change if your bucket differs
      const path = `${user.id}/${Date.now()}-${file.name}`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      const photo_url = pub?.publicUrl;
      if (!photo_url) throw new Error("Failed to resolve public URL");

      const { error: insertErr } = await supabase
        .from("vibe_photos")
        .insert({ user_id: user.id, photo_url });
      if (insertErr) throw insertErr;

      // tell the rail to insert immediately
      window.dispatchEvent(
        new CustomEvent("vibe-photo-uploaded", {
          detail: { user_id: user.id, photo_url },
        })
      );
      setReloadToken((n) => n + 1);

      toast({
        title: "Photo posted!",
        description: "Your photo is live in Splikz Photos",
      });
      setFile(null);
      setUploadOpen(false);
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Upload failed",
        description: e?.message || "Please try a different image",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <div className="bg-gradient-to-b from-secondary/10 to-background py-8 px-4">
        <div className="container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Home</h1>
              <p className="text-muted-foreground">
                Your video feed • Splikz Photos on the side (invisible scroll)
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchHomeFeed(true)}
                disabled={refreshing || loading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                Update
              </Button>
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Camera className="h-4 w-4" />
                Upload Photo
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* GRID: Desktop side-by-side; Mobile stacked (same order) */}
      <div className="container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT / TOP: HOME FEED */}
          <div className="lg:col-span-9 space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Loading videos…</p>
              </div>
            ) : feedSpliks.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No videos yet</h3>
                  <p className="text-muted-foreground mb-4">
                    We’ll show the latest as soon as they’re posted.
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button onClick={() => fetchHomeFeed()} variant="outline">
                      Refresh
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div ref={feedRef} className="space-y-8">
                {feedSpliks.map((s) => (
                  <SplikCard
                    key={s.id}
                    splik={s}
                    onReact={() => {}}
                    onShare={() => handleShare(s.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* RIGHT (DESKTOP): PHOTOS RAIL */}
          <div className="lg:col-span-3 hidden lg:block">
            <RightPhotoRail title="Splikz Photos" />
          </div>
        </div>

        {/* MOBILE: Photos rail full-width */}
        <div className="mt-10 lg:hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Splikz Photos</h2>
            <Button size="sm" variant="secondary" onClick={() => setUploadOpen(true)}>
              <Camera className="h-4 w-4 mr-1" /> Upload
            </Button>
          </div>
          <RightPhotoRail title="Latest photos" maxListHeight="60vh" reloadToken={reloadToken} />
        </div>
      </div>

      {/* Upload Photo dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload a photo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="file">Choose image</Label>
              <Input
                id="file"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUploadOpen(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button onClick={uploadPhoto} disabled={uploading}>
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Camera className="h-4 w-4 mr-2" />
              )}
              Post Photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Explore;
