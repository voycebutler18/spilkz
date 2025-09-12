// src/pages/Explore.tsx
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Camera,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ───────────────────────────────────────────────────────────────────────────
// Config
// ───────────────────────────────────────────────────────────────────────────
const PHOTOS_BUCKET =
  import.meta.env.VITE_PHOTOS_BUCKET || "vibe_photos";

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
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

// ───────────────────────────────────────────────────────────────────────────
// Splikz Photos rail
// ───────────────────────────────────────────────────────────────────────────
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
  description?: string | null;
  location?: string | null;
  profile?: RailProfile | null;
};

const displayName = (p?: RailProfile | null) => {
  if (!p) return "User";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.username?.trim() || "User";
};
const slugFor = (p?: RailProfile | null) =>
  p?.username ? p.username : p?.id || "";

const pathFromPublicUrl = (url: string) => {
  try {
    const u = new URL(url);
    // Common public URL formats:
    // .../storage/v1/object/public/<bucket>/<path>
    // .../object/public/<bucket>/<path>
    const parts = u.pathname.split("/");
    const idx = parts.findIndex((p) => p === PHOTOS_BUCKET);
    if (idx >= 0) {
      return decodeURIComponent(parts.slice(idx + 1).join("/"));
    }
  } catch {}
  return null;
};

function timeAgo(iso?: string) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Activity card (right side, above photos)
function ActivityCard({ userId }: { userId?: string | null }) {
  const [items, setItems] = useState<PhotoItem[]>([]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("vibe_photos")
        .select("id,user_id,created_at,description")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (!cancelled) setItems((data || []) as any);
    };
    load();

    const ch = supabase
      .channel("activity-photos")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vibe_photos",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const r: any = payload.new || {};
          setItems((prev) =>
            [{ id: r.id, user_id: r.user_id, created_at: r.created_at, description: r.description }, ...prev].slice(0, 5)
          );
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(ch); } catch {}
      cancelled = true;
    };
  }, [userId]);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Activity</h3>
        </div>
        {(!items || items.length === 0) ? (
          <p className="text-sm text-muted-foreground">
            New videos and Daily Prayers updates will show up here.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((a) => (
              <li key={a.id} className="text-sm">
                <span className="font-medium">You posted a photo</span>
                {a.description ? (
                  <>
                    : <span className="text-muted-foreground">{a.description.slice(0, 60)}</span>
                  </>
                ) : null}
                <span className="ml-2 text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RightPhotoRail({
  title = "Splikz Photos",
  maxListHeight = "calc(100vh - 220px)",
  limit = 60,
  reloadToken = 0,
  currentUserId,
}: {
  title?: string;
  maxListHeight?: string | number;
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
    setTimeout(() => setActive(null), 200);
  };

  const removeLocally = (id: string) =>
    setItems((prev) => prev.filter((p) => p.id !== id));

  const deleteActive = async () => {
    if (!active || !currentUserId) return;
    if (active.user_id !== currentUserId) return;

    try {
      // remove DB row
      const { error } = await supabase
        .from("vibe_photos")
        .delete()
        .eq("id", active.id)
        .eq("user_id", currentUserId);
      if (error) throw error;

      // remove storage file (best-effort)
      const path = pathFromPublicUrl(active.photo_url);
      if (path) {
        await supabase.storage.from(PHOTOS_BUCKET).remove([path]);
      }

      removeLocally(active.id);
      closeViewer();
      toast({ title: "Deleted", description: "Your photo was removed." });
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Delete failed",
        description: e?.message || "Please try again",
        variant: "destructive",
      });
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
      const { user_id, photo_url, description, location } = e.detail || {};
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
            description: description || null,
            location: location || null,
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
              <button
                key={ph.id}
                onClick={() => openViewer(ph)}
                className="relative aspect-square bg-muted/40 rounded-xl border border-border/40 overflow-hidden group text-left"
                title="Open photo"
              >
                <img
                  src={ph.photo_url}
                  alt={name}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Bottom caption row (avatar + name + desc) */}
                <div className="absolute inset-x-0 bottom-0 px-2 pb-2 pt-10 bg-gradient-to-t from-black/60 via-black/10 to-transparent">
                  <div className="flex items-end gap-2">
                    <Link
                      to={slug ? `/creator/${slug}` : "#"}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 w-8 h-8 rounded-full border border-white/40 overflow-hidden bg-background/60 backdrop-blur flex items-center justify-center"
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
                    <div className="min-w-0">
                      <p className="text-xs text-white/95 font-medium truncate">
                        {name}
                      </p>
                      {ph.description && (
                        <p className="text-[11px] leading-tight text-white/90 line-clamp-2 break-words">
                          {ph.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Photo Viewer */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
          {!!active && (
            <div className="relative">
              {/* Top-right close & delete */}
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
                  onClick={closeViewer}
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

              {/* Bottom bar: avatar + name + desc + location */}
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                <div className="flex items-end gap-3">
                  <Link
                    to={
                      slugFor(active.profile)
                        ? `/creator/${slugFor(active.profile)}`
                        : "#"
                    }
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
                      <p className="text-[11px] text-white/70 mt-1 truncate">
                        📍 {active.location}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* invisible scrollbar */}
      <style>{`
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </aside>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// PAGE: Home feed (no Nearby) + Activity + Splikz Photos
// ───────────────────────────────────────────────────────────────────────────
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
  const [photoLocation, setPhotoLocation] = useState("");
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

  // Fetch the main Home feed
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
        const rows = spliksData as Splik[];
        const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
        let byId: Record<string, Profile> = {};
        if (userIds.length) {
          const { data: profs } = await supabase.from("profiles").select("*").in("id", userIds);
          (profs || []).forEach((p: any) => (byId[p.id] = p));
        }
        const withProfiles = rows.map((r) => ({ ...r, profile: byId[r.user_id] }));
        setFeedSpliks(withProfiles);
        preconnect(withProfiles[0]?.video_url);
        warmFirstVideoMeta(withProfiles[0]?.video_url);
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

  // autoplay for the feed
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
          entries.forEach((e) => {
            videoVisibility.set(e.target as HTMLVideoElement, e.intersectionRatio);
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
      toast({ title: "Failed to share", description: "Please try again", variant: "destructive" });
    }
  };

  // Upload → Storage + DB (with description/location)
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

      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
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

      // Optimistic update to the rail + will trigger ActivityCard via realtime
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
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
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

      {/* GRID: Desktop side-by-side; Mobile stacked */}
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

          {/* RIGHT (DESKTOP): Activity + PHOTOS RAIL */}
          <div className="lg:col-span-3 hidden lg:flex lg:flex-col lg:gap-6">
            <ActivityCard userId={user?.id} />
            <RightPhotoRail
              title="Splikz Photos"
              currentUserId={user?.id}
              reloadToken={reloadToken}
            />
          </div>
        </div>

        {/* MOBILE: Photos rail full-width below feed */}
        <div className="mt-10 lg:hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Splikz Photos</h2>
            <Button size="sm" variant="secondary" onClick={() => setUploadOpen(true)}>
              <Camera className="h-4 w-4 mr-1" /> Upload
            </Button>
          </div>
          <RightPhotoRail
            title="Latest photos"
            maxListHeight="60vh"
            reloadToken={reloadToken}
            currentUserId={user?.id}
          />
        </div>
      </div>

      {/* Upload Photo dialog */}
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
    </div>
  );
};

export default Explore;
