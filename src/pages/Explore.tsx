// src/pages/Explore.tsx
import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import SplikCard from "@/components/splik/SplikCard";

import { Camera, Loader2, RefreshCw, Sparkles, Trash2, X, Plus } from "lucide-react";

// ⬇️ NEW: bring in your right-rail component (activity list)
import RightActivityRail from "@/components/RightActivityRail";

/* ──────────────────────────────────────────────────────────────────────────
   Config & helpers (UNCHANGED)
────────────────────────────────────────────────────────────────────────── */
const PHOTOS_BUCKET = import.meta.env.VITE_PHOTOS_BUCKET || "vibe_photos";
const isMobile =
  typeof window !== "undefined" && /iPhone|iPad|iPod|Android/i.test(window.navigator.userAgent);

// crypto-safe shuffle etc. (unchanged)
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

const pathFromPublicUrl = (url: string) => {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const idx = parts.findIndex((p) => p === PHOTOS_BUCKET);
    if (idx >= 0) return decodeURIComponent(parts.slice(idx + 1).join("/"));
  } catch {}
  return null;
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

type RailProfile = Profile;

type PhotoItem = {
  id: string;
  user_id: string;
  photo_url: string;
  created_at: string;
  description?: string | null;
  location?: string | null;
  profile?: RailProfile | null;
};

type PhotoGroup = {
  user_id: string;
  profile: RailProfile | null;
  name: string;
  photos: PhotoItem[];
  latestAt: number;
};

/* ──────────────────────────────────────────────────────────────────────────
   Small helpers (UNCHANGED)
────────────────────────────────────────────────────────────────────────── */
const displayName = (p?: Profile | null) => {
  if (!p) return "User";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.username?.trim() || `user_${(p.id || "").slice(0, 6) || "anon"}`;
};

const slugFor = (p?: Profile | null) => (p?.username ? p.username : p?.id || "");

/* ──────────────────────────────────────────────────────────────────────────
   Photos rail (UNCHANGED)
────────────────────────────────────────────────────────────────────────── */
function PhotoRail({
  title = "Splikz Photos",
  limit = 60,
  reloadToken = 0,
  currentUserId,
}: {
  title?: string;
  limit?: number;
  reloadToken?: number;
  currentUserId?: string | null;
}) {
  // … (YOUR ENTIRE EXISTING PhotoRail IMPLEMENTATION UNCHANGED)
  // For brevity here, paste your PhotoRail code block exactly as you provided it.
  // —— BEGIN PASTE ——
  // [PASTE the full PhotoRail code from your message here without any edits]
  // —— END PASTE ——
  return null as any; // remove after pasting your PhotoRail implementation
}

/* ──────────────────────────────────────────────────────────────────────────
   MAIN PAGE — LAYOUT CHANGED ONLY
   Matches:
   - Main feed column with right margin on desktop
   - Fixed right sidebar (PhotoRail + RightActivityRail) on desktop
   - Small fixed right panel on mobile
────────────────────────────────────────────────────────────────────────── */
const Explore = () => {
  const navigate = useNavigate();
  const [feedSpliks, setFeedSpliks] = useState<(Splik & { profile?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);

  // guest CTA visibility
  const [showGuestCta, setShowGuestCta] = useState(false);

  // upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [photoDescription, setPhotoDescription] = useState("");
  const [photoLocation, setPhotoLocation] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const { toast } = useToast();
  const feedRef = useRef<HTMLDivElement | null>(null);

  /* auth (UNCHANGED) */
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  // guest CTA show/hide (UNCHANGED)
  useEffect(() => {
    const key = "hide-guest-cta";
    const hidden = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    if (!user && !hidden) {
      setShowGuestCta(true);
    } else {
      setShowGuestCta(false);
    }
  }, [user]);

  const dismissGuestCta = () => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("hide-guest-cta", "1");
      }
    } catch {}
    setShowGuestCta(false);
  };

  /* feed loader (UNCHANGED) */
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

      if (spliksData && spliksData.length) {
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

  /* autoplay controller (UNCHANGED) */
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
                } catch {
                  /* ignore */
                }
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
        { root: null, threshold: [0, 0, 0.25, 0.45, 0.6, 0.75, 1] }
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
    }, deps);
  };

  useAutoplayIn(feedRef, [feedSpliks]);

  /* upload (UNCHANGED) */
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

      const { error: upErr } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
      const photo_url = pub?.publicUrl;
      if (!photo_url) throw new Error("Failed to resolve public URL");

      const payload: Record<string, any> = {
        user_id: user.id,
        photo_url,
        description: photoDescription.trim(),
      };
      if (photoLocation.trim()) payload.location = photoLocation.trim();

      const { error: insertErr } = await supabase.from("vibe_photos").insert(payload);
      if (insertErr) throw insertErr;

      const title = photoDescription.trim().slice(0, 80) || "Photo";
      const mime = file.type || "image/jpeg";
      const splikPayload: any = {
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
      };
      const { data: newSplik, error: splikErr } = await supabase
        .from("spliks")
        .insert(splikPayload)
        .select("id, created_at")
        .single();
      if (splikErr) throw splikErr;

      try {
        await supabase.from("right_rail_feed").insert({
          user_id: user.id,
          type: "photo",
          media_url: photo_url,
          created_at: newSplik?.created_at ?? new Date().toISOString(),
        });
      } catch (e) {
        console.warn("right_rail_feed insert failed (non-fatal):", e);
      }

      window.dispatchEvent(
        new CustomEvent("vibe-photo-uploaded", {
          detail: {
            user_id: user.id,
            photo_url,
            description: photoDescription.trim(),
            location: photoLocation.trim() || null,
          },
        })
      );

      setReloadToken((n) => n + 1);
      toast({ title: "Photo posted!", description: "Your photo is live in Splikz Photos and on your profile." });
      setFile(null);
      setPhotoDescription("");
      setPhotoLocation("");
      setUploadOpen(false);

      navigate("/dashboard");
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || "";
      toast({
        title: "Upload failed",
        description:
          msg.includes("not found") || msg.includes("No such bucket")
            ? `Storage bucket "${PHOTOS_BUCKET}" not found.`
            : msg || "Please try again",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  /* ──────────────── RENDER with NEW LAYOUT ──────────────── */
  return (
    <div className="min-h-screen bg-background">
      {/* HEADER (unchanged) */}
      <div className="bg-gradient-to-b from-secondary/10 to-background py-4 md:py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-2">Home</h1>
              <p className="text-sm md:text-base text-muted-foreground">
                Your video feed • Splikz Photos
              </p>
            </div>
            <div className="flex gap-2">
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
          </div>

          {!user && showGuestCta && (
            <div className="relative mt-4 rounded-xl border border-primary/30 bg-primary/10 p-4">
              <button
                type="button"
                onClick={dismissGuestCta}
                className="absolute right-2 top-2 inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-primary/20 focus:outline-none"
                aria-label="Dismiss"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex flex-col md:flex-row md:items-center gap-3 pr-10">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <p className="text-sm md:text-base font-medium">
                    Join Splikz to follow creators, see full profiles, and post your own 3-second videos. All Profiles are hidden until you sign up.
                  </p>
                </div>
                <div className="flex gap-2 md:ml-auto">
                  <Button asChild>
                    <Link to="/signup">Create free account</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/login">Log in</Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NEW LAYOUT WRAPPER (matches your HomePage layout) */}
      <div className="max-w-7xl mx-auto px-4 pb-10">
        <div className="flex">
          {/* MAIN FEED — adds right margin when desktop rail is fixed */}
          <div className={`flex-1 ${!isMobile ? "mr-80" : ""}`}>
            <div className="max-w-2xl mx-auto p-0 md:p-2">
              <div ref={feedRef} className="space-y-6">
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
                        We'll show the latest as soon as they're posted.
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
                    <SplikCard
                      key={s.id}
                      splik={s}
                      onReact={() => {}}
                      onShare={() => {
                        const url = `${window.location.origin}/video/${s.id}`;
                        if ((navigator as any).share) {
                          (navigator as any).share({ title: "Check out this Splik!", url }).catch(() => {});
                        } else {
                          navigator.clipboard
                            .writeText(url)
                            .then(() =>
                              toast({ title: "Link copied!", description: "Copied to clipboard" })
                            )
                            .catch(() => {});
                        }
                      }}
                      onPromote={(id) => navigate(`/promote/${id}`)}
                    />
                  ))
                )}

                {/* Caught-up footer (kept to mirror your HomePage tone) */}
                {!loading && feedSpliks.length > 0 && (
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

          {/* RIGHT SIDEBAR — Desktop only (fixed) */}
          {!isMobile && (
            <div className="fixed right-0 top-14 h-[calc(100svh-56px)] w-80 bg-background border-l border-border p-4 overflow-y-auto">
              {/* “Moments” slot → your PhotoRail */}
              <PhotoRail title="Splikz Photos" currentUserId={user?.id} reloadToken={reloadToken} />

              {/* “Activity Feed” slot → your RightActivityRail */}
              <div className="mt-6">
                <RightActivityRail limit={60} />
              </div>
            </div>
          )}

          {/* MOBILE PANEL — small fixed right-side box */}
          {isMobile && (
            <div className="fixed right-2 top-24 w-20 h-96 bg-card/95 backdrop-blur-lg border border-border rounded-xl p-2 overflow-y-auto">
              <div className="space-y-3">
                {/* Quick “You / Upload” tile opens your existing dialog */}
                <button
                  className="w-full flex flex-col items-center gap-1 cursor-pointer hover:bg-muted/50 p-2 rounded-lg"
                  onClick={() => setUploadOpen(true)}
                  title="Upload a photo"
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-500 p-0.5">
                    <div className="w-full h-full rounded-full bg-background flex items-center justify-center">
                      <Plus className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                  <span className="text-xs text-center">Upload</span>
                </button>

                {/* A tiny “live” slot: show activity count tile */}
                <div className="text-[11px] text-muted-foreground p-2 text-center rounded-lg border border-border/50">
                  Activity • 24h
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Photo dialog (UNCHANGED) */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload a photo</DialogTitle>
            <DialogDescription>
              Write a short description (required). Add a location if you want.
            </DialogDescription>
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

            <div className="grid gap-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea
                id="desc"
                value={photoDescription}
                onChange={(e) => setPhotoDescription(e.target.value.slice(0, 200))}
                placeholder="Say something about this photo (max 200 chars)"
              />
              <div className="text-xs text-muted-foreground text-right">
                {photoDescription.length}/200
              </div>
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
    </div>
  );
};

export default Explore;
