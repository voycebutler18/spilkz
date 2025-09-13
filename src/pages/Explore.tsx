// src/pages/Explore.tsx
import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import SplikCard from "@/components/splik/SplikCard";

import { Camera, Loader2, RefreshCw, Sparkles, Trash2, X } from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────────
   Config & helpers
────────────────────────────────────────────────────────────────────────── */
const PHOTOS_BUCKET = import.meta.env.VITE_PHOTOS_BUCKET || "vibe_photos";
const isMobile =
  typeof window !== "undefined" && /iPhone|iPad|iPod|Android/i.test(window.navigator.userAgent);

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
   Types
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
  video_url: string | null;        // ← nullable: photos will be NULL here
  thumbnail_url?: string | null;
  created_at?: string;
  trim_start?: number | null;
  trim_end?: number | null;
  likes_count?: number;
  tag?: string | null;
  boost_score?: number | null;
  mime_type?: string | null;       // ← helps distinguish video vs photo
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
   Small display helpers
────────────────────────────────────────────────────────────────────────── */
const displayName = (p?: Profile | null) => {
  if (!p) return "User";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.username?.trim() || `user_${(p.id || "").slice(0, 6) || "anon"}`;
};

const slugFor = (p?: Profile | null) => (p?.username ? p.username : p?.id || "");

/* ──────────────────────────────────────────────────────────────────────────
   Photos rail (mobile-friendly)
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
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [active, setActive] = useState<PhotoItem | null>(null);
  const { toast } = useToast();

  const openViewer = (ph: PhotoItem) => {
    setActive(ph);
    setViewerOpen(true);
  };
  const closeViewer = () => {
    setViewerOpen(false);
    setTimeout(() => setActive(null), 180);
  };
  const removeLocally = (id: string) => setItems((prev) => prev.filter((p) => p.id !== id));

  const deleteActive = async () => {
    if (!active || !currentUserId) return;
    try {
      const { data: existing, error: findErr } = await supabase
        .from("vibe_photos")
        .select("id")
        .eq("user_id", currentUserId)
        .eq("photo_url", active.photo_url)
        .limit(1)
        .maybeSingle();
      if (findErr) throw findErr;

      const deleteId = existing?.id || active.id;

      const { error: delErr } = await supabase
        .from("vibe_photos")
        .delete()
        .eq("id", deleteId)
        .eq("user_id", currentUserId);
      if (delErr) throw delErr;

      const path = pathFromPublicUrl(active.photo_url);
      if (path) await supabase.storage.from(PHOTOS_BUCKET).remove([path]);

      removeLocally(active.id);
      if (existing?.id && existing.id !== active.id) removeLocally(existing.id);

      closeViewer();
      // @ts-ignore
      toast({ title: "Deleted", description: "Your photo was removed." });
    } catch (e: any) {
      console.error(e);
      // @ts-ignore
      toast({ title: "Delete failed", description: e?.message || "Please try again", variant: "destructive" });
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("vibe_photos")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) throw error;

        const rows = (data || []).map((r: any) => ({
          id: String(r.id),
          user_id: String(r.user_id),
          photo_url: String(r.photo_url),
          created_at: r.created_at || new Date().toISOString(),
          description: r.description ?? r.caption ?? null,
          location: r.location ?? null,
        })) as PhotoItem[];

        const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
        if (userIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, username, display_name, first_name, last_name, avatar_url")
            .in("id", userIds);
          const byId: Record<string, Profile> = {};
          (profs || []).forEach((p: any) => (byId[p.id] = p));
          rows.forEach((r) => (r.profile = byId[r.user_id] || null));
        }

        if (!cancelled) setItems(rows);
      } catch (e) {
        console.error("PhotoRail load error:", e);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    const ch = supabase
      .channel("rail-vibe-photos")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vibe_photos" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "vibe_photos" }, load)
      .subscribe();

    const onOptimistic = async (e: Event) => {
      // @ts-ignore
      const { user_id, photo_url, description, location } = e.detail || {};
      if (!user_id || !photo_url) return;
      try {
        const { data: p } = await supabase
          .from("profiles")
          .select("id, username, display_name, first_name, last_name, avatar_url")
          .eq("id", user_id)
          .maybeSingle();
        setItems((prev) => [
          {
            id: `local-${Date.now()}`,
            user_id,
            photo_url,
            created_at: new Date().toISOString(),
            description: description || null,
            location: location || null,
            profile: (p as Profile) || null,
          },
          ...prev,
        ]);
      } catch {}
    };

    window.addEventListener("vibe-photo-uploaded", onOptimistic as EventListener);

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
      window.removeEventListener("vibe-photo-uploaded", onOptimistic as EventListener);
      cancelled = true;
    };
  }, [limit, reloadToken]);

  const groups: PhotoGroup[] = useMemo(() => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const map = new Map<string, PhotoGroup>();

    for (const it of items) {
      const ts = new Date(it.created_at).getTime();
      if (isNaN(ts) || ts < dayAgo) continue;

      const key = it.user_id;
      const name = displayName(it.profile);
      if (!map.has(key)) {
        map.set(key, {
          user_id: it.user_id,
          profile: it.profile ?? null,
          name,
          photos: [],
          latestAt: ts,
        });
      }
      const g = map.get(key)!;
      g.photos.push(it);
      if (ts > g.latestAt) g.latestAt = ts;
    }

    const arr = Array.from(map.values()).map((g) => ({
      ...g,
      photos: g.photos.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    }));
    arr.sort((a, b) => b.latestAt - a.latestAt);
    return arr;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="bg-card/60 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <Camera className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto pr-1 hide-scroll">
          {loading && (
            <div className="py-10 text-center text-muted-foreground text-sm">Loading photos…</div>
          )}

          {!loading && groups.length === 0 && (
            <div className="py-10 text-center text-muted-foreground text-sm">No recent photos</div>
          )}

          {groups.map((g) => {
            const slug = slugFor(g.profile);
            const avatar = g.profile?.avatar_url || null;
            return (
              <div key={`grp_${g.user_id}`} className="rounded-xl border border-border/40 bg-muted/30 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Link
                    to={slug ? `/creator/${slug}` : "#"}
                    className="shrink-0 w-8 h-8 rounded-full border border-white/40 overflow-hidden bg-background/60 backdrop-blur flex items-center justify-center"
                    title={g.name}
                  >
                    {avatar ? (
                      <img src={avatar} alt={g.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-xs font-semibold">
                        {g.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </Link>
                  <div className="min-w-0">
                    <p className="text-xs text-white/95 font-medium truncate">{g.name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 md:flex md:gap-2 md:overflow-x-auto md:hide-scroll md:snap-x">
                  {g.photos.slice(0, 4).map((ph) => (
                    <button
                      key={ph.id}
                      type="button"
                      onClick={() => openViewer(ph)}
                      className="snap-start shrink-0 w-full aspect-square md:w-[120px] md:h-[120px] rounded-lg border border-border/40 overflow-hidden bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary"
                      title="Open photo"
                    >
                      <img
                        src={ph.photo_url}
                        alt={g.name}
                        loading="lazy"
                        className="w-full h-full object-cover pointer-events-none"
                      />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Photo Viewer */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
          {!!active && (
            <div className="relative">
              <div className="absolute top-2 right-2 z-10 flex gap-2">
                {currentUserId && active.user_id === currentUserId && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={deleteActive}
                    title="Delete photo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={() => setViewerOpen(false)}
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <img
                src={active.photo_url}
                alt={displayName(active.profile)}
                className="w-full max-h-[75vh] object-contain bg-black"
              />

              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                <div className="flex items-end gap-3">
                  <Link
                    to={slugFor(active.profile) ? `/creator/${slugFor(active.profile)}` : "#"}
                    className="shrink-0 w-10 h-10 rounded-full border border-white/40 overflow-hidden bg-background/60 backdrop-blur flex items-center justify-center"
                    title={displayName(active.profile)}
                  >
                    {active.profile?.avatar_url ? (
                      <img
                        src={active.profile.avatar_url}
                        alt={displayName(active.profile)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-white text-sm font-semibold">
                        {displayName(active.profile).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </Link>

                  <div className="min-w-0">
                    <p className="text-sm text-white/95 font-semibold truncate">
                      {displayName(active.profile)}
                    </p>
                    {active.description && (
                      <p className="text-[12px] text-white/90 break-words line-clamp-3">
                        {active.description}
                      </p>
                    )}
                    {active.location && (
                      <p className="text-[11px] text-white/70 mt-1 truncate">📍 {active.location}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <style>{`
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   MAIN PAGE (no Activity rail)
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
  const [photoDescription, setPhotoDescription] = useState("");
  the const [photoLocation, setPhotoLocation] = useState("");
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

  /* feed */
  const fetchHomeFeed = async (showRefreshToast = false) => {
    try {
      showRefreshToast ? setRefreshing(true) : setLoading(true);

      const limit = isMobile ? 30 : 100; // lighter payload for mobile stability

      // 🔴 IMPORTANT: fetch only *videos* for the main feed
      // Either video_url is NOT NULL OR mime_type starts with 'video/'
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

        const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
        const byId: Record<string, Profile> = {};
        if (userIds.length) {
          const { data: profs } = await supabase.from("profiles").select("*").in("id", userIds);
          (profs || []).forEach((p: any) => (byId[p.id] = p));
        }
        const withProfiles = rows.map((r) => ({ ...r, profile: byId[r.user_id] }));

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

  /* mobile-safe, single-video autoplay controller */
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
      toast({ title: "Photo posted!", description: "Your photo is live in Splikz Photos" });
      setFile(null);
      setPhotoDescription("");
      setPhotoLocation("");
      setUploadOpen(false);
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

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
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
              <Button size="sm" onClick={() => setUploadOpen(true)} aria-label="Upload Photo">
                <Camera className="h-4 w-4" />
                <span className="hidden md:inline ml-2">Upload Photo</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* LAYOUT */}
      <div className="max-w-7xl mx-auto py-4 md:py-8 px-4">
        <div className="flex flex-col lg:flex-row lg:gap-8">
          {/* MAIN FEED (videos only) */}
          <div className="flex-1 lg:max-w-3xl space-y-6">
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
              <div ref={feedRef} className="space-y-6">
                {feedSpliks.map((s) => (
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
                  />
                ))}
              </div>
            )}
          </div>

          {/* RIGHT RAIL (desktop): Photos only */}
          <div className="hidden lg:flex lg:w-80 lg:flex-col lg:gap-6 lg:flex-shrink-0">
            <PhotoRail title="Splikz Photos" currentUserId={user?.id} reloadToken={reloadToken} />
          </div>

          {/* MOBILE: Photos section stacked */}
          <div className="lg:hidden mt-8">
            <PhotoRail title="Splikz Photos" currentUserId={user?.id} reloadToken={reloadToken} />
          </div>
        </div>
      </div>

      {/* Upload Photo dialog */}
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
