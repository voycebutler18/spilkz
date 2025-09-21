// src/pages/Explore.tsx
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import SplikCard from "@/components/splik/SplikCard";

import { Loader2, RefreshCw, Sparkles, Camera, X } from "lucide-react";

// HomePage-named rails:
import { MomentsBar } from "@/components/moments/MomentsBar";
import { ActivityFeed } from "@/components/activity/ActivityFeed";

/* ──────────────────────────────────────────────────────────────────────────
   Config & helpers (UNCHANGED)
────────────────────────────────────────────────────────────────────────── */
const PHOTOS_BUCKET = import.meta.env.VITE_PHOTOS_BUCKET || "vibe_photos";
const isMobile =
  typeof window !== "undefined" && /iPhone|iPad|iPod|Android/i.test(window.navigator.userAgent);

const cRandom = () => {
  if (typeof crypto !== "undefined" && (crypto as any).getRandomValues) {
    const u = new Uint32Array(1);
    (crypto as any).getRandomValues(u);
    return u[0] / 2 ** 32;
  }
  return Math.random();
};

const shuffle = <T,>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(cRandom() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

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
    // @ts-ignore
    v.setAttribute("webkit-playsinline", "true");
    v.load();
    setTimeout(() => v.remove(), 4000);
  } catch {}
};

/* ──────────────────────────────────────────────────────────────────────────
   Types (UNCHANGED)
────────────────────────────────────────────────────────────────────────── */
type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  followers_count?: number | null;
};

type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string | null;
  thumbnail_url?: string | null;
  created_at?: string;
  trim_start?: number | null;
  trim_end?: number | null;
  likes_count?: number;
  tag?: string | null;
  boost_score?: number | null;
  mime_type?: string | null;
  profile?: Profile;
};

/* ──────────────────────────────────────────────────────────────────────────
   MAIN PAGE — HomePage layout, NO Header.tsx here
────────────────────────────────────────────────────────────────────────── */
const Explore = () => {
  const navigate = useNavigate();
  const [feedSpliks, setFeedSpliks] = useState<(Splik & { profile?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);

  // guest CTA
  const [showGuestCta, setShowGuestCta] = useState(false);

  // upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [photoDescription, setPhotoDescription] = useState("");
  const [photoLocation, setPhotoLocation] = useState("");

  // lets MomentsBar refresh immediately after uploads
  const [reloadToken, setReloadToken] = useState(0);

  const { toast } = useToast();
  const feedRef = useRef<HTMLDivElement | null>(null);

  /* auth */
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  // guest CTA persistence
  useEffect(() => {
    const key = "hide-guest-cta";
    const hidden = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    setShowGuestCta(!user && !hidden);
  }, [user]);

  const dismissGuestCta = () => {
    try {
      window?.localStorage?.setItem?.("hide-guest-cta", "1");
    } catch {}
    setShowGuestCta(false);
  };

  /* feed loader */
  const fetchHomeFeed = async (showRefreshToast = false) => {
    try {
      showRefreshToast ? setRefreshing(true) : setLoading(true);

      const limit = isMobile ? 30 : 100;

      const { data: spliksData, error } = await supabase
        .from("spliks")
        .select("*")
        .or("video_url.not.is.null,mime_type.ilike.video/%")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      if (spliksData?.length) {
        const rows = (spliksData as Splik[]).filter(
          (r) => !!r.video_url || (r.mime_type?.startsWith("video/") ?? false)
        );

        const shuffledRows = shuffle(
          rows.map((item) => ({
            ...item,
            likes_count: item.likes_count || 0,
            boost_score: item.boost_score || 0,
          }))
        );

        const userIds = Array.from(new Set(shuffledRows.map((r) => r.user_id)));
        const byId: Record<string, Profile> = {};
        if (userIds.length) {
          const { data: profs } = await supabase.from("profiles").select("*").in("id", userIds);
          (profs || []).forEach((p: any) => (byId[p.id] = p));
        }
        const withProfiles = shuffledRows.map((r) => ({ ...r, profile: byId[r.user_id] }));

        setFeedSpliks(withProfiles);
        preconnect(withProfiles[0]?.video_url || null);
        warmFirstVideoMeta(withProfiles[0]?.video_url || null);
      } else {
        setFeedSpliks([]);
      }

      if (showRefreshToast) {
        toast({ title: "Feed updated", description: "Showing the latest videos" });
      }
    } catch (e) {
      console.error("Home feed load error:", e);
      toast({ title: "Error", description: "Failed to load your feed", variant: "destructive" });
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

  /* mobile-safe autoplay controller (single playing) */
  useEffect(() => {
    const host = feedRef.current;
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
          try {
            await target.play();
            currentPlayingVideo = target;
          } catch {
            if (!target.muted) {
              target.muted = true;
              try {
                await target.play();
                currentPlayingVideo = target;
              } catch {}
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
        queueMicrotask(drive);
      },
      { root: null, threshold: [0, 0.25, 0.45, 0.6, 0.75, 1] }
    );

    const init = () => {
      for (const v of Array.from(host.querySelectorAll("video")) as HTMLVideoElement[]) {
        if (!v.hasAttribute("data-mobile-init")) {
          setup(v);
          v.setAttribute("data-mobile-init", "1");
        }
        if (!videoVisibility.has(v)) {
          videoVisibility.set(v, 0);
          io.observe(v);
        }
      }
    };

    const mo = new MutationObserver(() => setTimeout(init, 80));
    setTimeout(init, 80);
    mo.observe(host, { childList: true, subtree: true });

    const onVisibility = () => {
      if (document.hidden) {
        pauseAll();
        currentPlayingVideo = null;
      } else {
        drive();
      }
    };
    document.addEventListener("visibilitychange", onVisibility, { passive: true });

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      io.disconnect();
      mo.disconnect();
      pauseAll();
      videoVisibility.clear();
      currentPlayingVideo = null;
    };
  }, [feedSpliks]);

  /* upload */
  const uploadPhoto = async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Log in to upload a photo", variant: "destructive" });
      return;
    }
    if (!file) {
      toast({ title: "No file selected", description: "Choose a photo first", variant: "destructive" });
      return;
    }
    if (!photoDescription.trim()) {
      toast({ title: "Add a description", description: "Please enter a brief description", variant: "destructive" });
      return;
    }
    try {
      setUploading(true);
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${user.id}/${Date.now()}-${safeName}`;

      // 1) upload to photos bucket
      const { error: upErr } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
      const photo_url = pub?.publicUrl;
      if (!photo_url) throw new Error("Failed to resolve public URL");

      // 2) insert into vibe_photos (rail)
      const payload: Record<string, any> = {
        user_id: user.id,
        photo_url,
        description: photoDescription.trim(),
      };
      if (photoLocation.trim()) payload.location = photoLocation.trim();

      const { error: insertErr } = await supabase.from("vibe_photos").insert(payload);
      if (insertErr) throw insertErr;

      // 3) also insert as a photo post in 'spliks'
      const title = photoDescription.trim().slice(0, 80) || "Photo";
      const mime = file.type || "image/jpeg";
      const { error: splikErr } = await supabase.from("spliks").insert({
        user_id: user.id,
        title,
        description: photoDescription.trim(),
        duration: 0,
        file_size: file.size,
        mime_type: mime,
        status: "active",
        trim_start: null,
        trim_end: null,
        is_food: false,
        video_path: null,
        video_url: null,
        thumbnail_url: photo_url,
        cover_time: 0,
      });
      if (splikErr) throw splikErr;

      // Let MomentsBar refresh immediately
      setReloadToken((n) => n + 1);

      toast({ title: "Photo posted!", description: "Your photo is live." });
      setFile(null);
      setPhotoDescription("");
      setPhotoLocation("");
      setUploadOpen(false);
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Upload failed",
        description: e?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  /* ──────────────── RENDER — HomePage layout only ──────────────── */
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="flex">
        {/* Main Content (center feed) */}
        <div className={`flex-1 ${!isMobile ? "mr-80" : ""}`}>
          {/* ↓↓↓ remove horizontal padding so videos can hug the column */}
          <div className="max-w-2xl mx-auto px-0 py-4">
            {/* Top inside-feed bar (refresh + guest CTA) */}
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-bold">Home</h1>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchHomeFeed(true)}
                disabled={refreshing || loading}
                aria-label="Refresh feed"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden md:inline ml-2">Update</span>
              </Button>
            </div>

            {!user && showGuestCta && (
              <div className="relative mb-4 rounded-xl border border-primary/30 bg-primary/10 p-4">
                <button
                  type="button"
                  onClick={dismissGuestCta}
                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-primary/20"
                  aria-label="Dismiss"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex items-start gap-2 pr-8">
                  <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                  <p className="text-sm">
                    Join Splikz to follow creators and post your own 3-second videos.
                  </p>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button asChild><Link to="/signup">Create free account</Link></Button>
                  <Button asChild variant="outline"><Link to="/login">Log in</Link></Button>
                </div>
              </div>
            )}

            {/* Feed */}
            <div
              ref={feedRef}
              className="space-y-6 max-w-full overflow-x-hidden feed-fullbleed"
            >
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
                feedSpliks.map((s) => (
                  <div key={s.id} className="w-full">
                    <SplikCard
                      splik={s}
                      onReact={() => {}}
                      onShare={() => {
                        const url = `${window.location.origin}/video/${s.id}`;
                        if ((navigator as any).share) {
                          (navigator as any).share({ title: "Check out this Splik!", url }).catch(() => {});
                        } else {
                          navigator.clipboard
                            .writeText(url)
                            .then(() => toast({ title: "Link copied!", description: "Copied to clipboard" }))
                            .catch(() => {});
                        }
                      }}
                      onPromote={(id) => navigate(`/promote/${id}`)}
                    />
                  </div>
                ))
              )}

              {!loading && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">You're all caught up! 🎉</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Check back later for more amazing content
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar — Photos + Activity */}
        {!isMobile && (
          <div className="fixed right-0 top-0 h-full w-80 bg-background border-l border-border p-4 pt-20 overflow-y-auto hide-scroll">
            <MomentsBar title="Splikz Photos" currentUserId={user?.id} reloadToken={reloadToken} />
            <div className="mt-6">
              <ActivityFeed limit={60} />
            </div>
          </div>
        )}
      </div>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload a photo</DialogTitle>
            <DialogDescription>Write a short description (required). Add a location if you want.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="file">Choose image</Label>
              <Input id="file" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea
                id="desc"
                value={photoDescription}
                onChange={(e) => setPhotoDescription(e.target.value.slice(0, 200))}
                placeholder="Say something about this photo (max 200 chars)"
              />
              <div className="text-xs text-muted-foreground text-right">{photoDescription.length}/200</div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="loc">Location (optional)</Label>
              <Input
                id="loc"
                value={photoLocation}
                onChange={(e) => setPhotoLocation(e.target.value.slice(0, 80))}
                placeholder="City, venue, etc."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={uploadPhoto} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
              Post Photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Utility to hide scrollbars wherever .hide-scroll is used + make videos full-width */}
      <style>{`
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scroll::-webkit-scrollbar { display: none; }

        /* Make any video inside the feed span the full column width */
        .feed-fullbleed video {
          width: 100% !important;
          height: auto;
          display: block;
        }
      `}</style>
    </div>
  );
};

export default Explore;
