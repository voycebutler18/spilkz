// src/pages/Vibes.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import VibeComposer from "@/components/vibes/VibeComposer";
import VibeCard, { Vibe } from "@/components/vibes/VibeCard";
import { supabase } from "@/integrations/supabase/client";
import {
  Camera, Plus, Users, TrendingUp, X, ChevronUp, ChevronDown, Loader2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";

/* ──────────────────────────────────────────────────────────────────────
   Shared types / helpers
────────────────────────────────────────────────────────────────────── */
type ProfileLite = {
  id: string;
  username: string | null;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
};

const nameOf = (p?: ProfileLite | null) => {
  if (!p) return "User";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.username?.trim() || "User";
};
const slugFor = (p?: ProfileLite | null) => (p?.username ? p.username : p?.id || "");

// Very small module-scope cache to avoid refetching the same profile
const profileCache = new Map<string, ProfileLite | null>();
async function fetchProfileOnce(userId: string) {
  if (profileCache.has(userId)) return profileCache.get(userId) ?? null;
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, first_name, last_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  profileCache.set(userId, (data as ProfileLite) ?? null);
  return (data as ProfileLite) ?? null;
}

/* ──────────────────────────────────────────────────────────────────────
   Right-side vertical photo rail (photos only, with upload)
────────────────────────────────────────────────────────────────────── */
type PhotoItem = {
  id: string;
  url: string;
  created_at: string;
  user_id: string;
  profile?: ProfileLite | null;
};

// 🔧 your Storage bucket for photos
const PHOTO_BUCKET = "vibes";

function RightPhotoRail({
  title = "Splikz Photos",
  maxListHeight = "24rem",
  limit = 36,
}: {
  title?: string;
  maxListHeight?: string | number;
  limit?: number;
}) {
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<PhotoItem[]>([]);
  const [viewerIndex, setViewerIndex] = React.useState<number | null>(null);

  // upload UI
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // Preferred: table vibe_photos
      let photos: any[] = [];
      const { data: p1, error: e1 } = await supabase
        .from("vibe_photos")
        .select("id, user_id, photo_url, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!e1 && p1?.length) photos = p1;

      // Fallback: vibes.image_url/media_url
      if (!photos.length) {
        const { data: p2 } = await supabase
          .from("vibes")
          .select("id, user_id, image_url, media_url, created_at")
          .order("created_at", { ascending: false })
          .limit(limit);
        photos =
          (p2 || [])
            .map((r: any) => ({
              id: r.id,
              user_id: r.user_id,
              photo_url: r.image_url || r.media_url,
              created_at: r.created_at,
            }))
            .filter((r: any) => !!r.photo_url) || [];
      }

      const mapped: PhotoItem[] = (photos || []).map((r: any) => ({
        id: String(r.id),
        url: String(r.photo_url),
        created_at: r.created_at || new Date().toISOString(),
        user_id: String(r.user_id),
      }));

      // hydrate profiles in one batch
      const userIds = Array.from(new Set(mapped.map((m) => m.user_id)));
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, display_name, first_name, last_name, avatar_url")
          .in("id", userIds);
        const byId: Record<string, ProfileLite> = {};
        (profs || []).forEach((p: any) => {
          byId[p.id] = p;
          profileCache.set(p.id, p);
        });
        mapped.forEach((m) => (m.profile = byId[m.user_id] || null));
      }

      setItems(mapped);
    } catch (err) {
      console.error("RightPhotoRail load failed:", err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  React.useEffect(() => {
    load();
    const ch = supabase
      .channel("right-photo-rail")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibe_photos" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibes" },
        () => load()
      )
      .subscribe();
    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, [load]);

  const open = (i: number) => setViewerIndex(i);
  const closeViewer = () => {
    const img = document.querySelector("#vibes-viewer-img") as HTMLImageElement | null;
    if (img) img.src = "";
    setViewerIndex(null);
  };
  const up = () => setViewerIndex((i) => (i === null || i <= 0 ? i : i - 1));
  const down = () => setViewerIndex((i) => (i === null || i >= items.length - 1 ? i : i + 1));

  React.useEffect(() => {
    if (viewerIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") { e.preventDefault(); up(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); down(); }
      else if (e.key === "Escape") { e.preventDefault(); closeViewer(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerIndex, items.length]);

  const onPickFile = () => fileRef.current?.click();

  const handleFile = async (file: File) => {
    try {
      setIsUploading(true);

      if (!file.type.startsWith("image/")) return toast.error("Please upload an image file.");
      if (file.size > 12 * 1024 * 1024) return toast.error("Image is too large (max 12 MB).");

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return toast.error("Please log in to upload a photo.");

      // upload to Storage
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase
        .storage
        .from(PHOTO_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        console.error(upErr);
        return toast.error("Upload failed. Check bucket permissions.");
      }

      const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) return toast.error("Could not get public URL for image.");

      // add to text feed (vibes)
      {
        const { error } = await supabase
          .from("vibes")
          .insert([{ user_id: uid, content: "", image_url: publicUrl }]);
        if (error) {
          // try media_url fallback
          await supabase.from("vibes").insert([{ user_id: uid, content: "", media_url: publicUrl }]);
        }
      }
      // add to rail table (ignore if missing)
      {
        const { error } = await supabase
          .from("vibe_photos")
          .insert([{ user_id: uid, photo_url: publicUrl }]);
        if (error && !/relation .* does not exist/i.test(error.message)) {
          console.warn("Insert into vibe_photos failed:", error.message);
        }
      }

      // Optimistic update
      setItems((prev) => [
        {
          id: `tmp-${Date.now()}`,
          url: publicUrl,
          created_at: new Date().toISOString(),
          user_id: uid,
          profile: profileCache.get(uid) ?? undefined,
        },
        ...prev,
      ]);

      toast.success("Photo uploaded!");
    } catch (e) {
      console.error(e);
      toast.error("Something went wrong uploading your photo.");
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  };

  return (
    <>
      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

      <div className="bg-card/60 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Camera className="h-5 w-5 text-muted-foreground" />
        </div>

        {/* Upload Photo */}
        <div className="mb-4">
          <button
            onClick={onPickFile}
            disabled={isUploading}
            className="w-full rounded-xl p-3 transition-all duration-300 group
                       bg-gradient-to-r from-purple-600 to-blue-600
                       hover:from-purple-700 hover:to-blue-700
                       disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-center gap-2">
              {isUploading ? (
                <>
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                  <span className="text-white font-medium text-sm">Uploading…</span>
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5 text-white" />
                  <span className="text-white font-medium text-sm">Upload Photo</span>
                </>
              )}
            </div>
          </button>
        </div>

        {/* Vertical list */}
        <div
          className="space-y-3 overflow-y-auto custom-scrollbar pr-1"
          style={{
            maxHeight: typeof maxListHeight === "number" ? `${maxListHeight}px` : maxListHeight,
            contentVisibility: "auto",
            containIntrinsicSize: "1px 350px",
          }}
        >
          {loading && <div className="py-12 text-center text-muted-foreground">Loading photos…</div>}
          {!loading && items.length === 0 && <div className="py-10 text-center text-muted-foreground">No photos yet</div>}

          {items.map((ph, idx) => {
            const person = ph.profile;
            const display = nameOf(person);
            const slug = slugFor(person);
            return (
              <div
                key={ph.id}
                className="relative aspect-square bg-muted/40 rounded-xl border border-border/40 overflow-hidden group cursor-pointer"
                onClick={() => open(idx)}
              >
                <img
                  src={ph.url}
                  alt={display}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  sizes="(min-width:1024px) 280px, 45vw"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Small avatar → creator profile */}
                <Link
                  to={slug ? `/creator/${slug}` : "#"}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-2 left-2 w-9 h-9 rounded-full border border-white/30 overflow-hidden bg-background/60 backdrop-blur flex items-center justify-center"
                  title={display}
                >
                  {person?.avatar_url ? (
                    <img src={person.avatar_url} alt={display} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xs font-semibold">
                      {display.charAt(0).toUpperCase()}
                    </span>
                  )}
                </Link>

                {/* Name on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-white text-xs font-medium truncate">{display}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fullscreen viewer */}
      {viewerIndex !== null && items[viewerIndex] && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center">
          <div className="relative max-w-4xl max-h-screen p-4">
            {/* Close */}
            <button
              onClick={closeViewer}
              className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
              aria-label="Close viewer"
            >
              <X className="h-6 w-6 text-white" />
            </button>

            {/* Up/Down */}
            {viewerIndex > 0 && (
              <button
                onClick={up}
                className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                aria-label="Previous photo"
              >
                <ChevronUp className="h-6 w-6 text-white" />
              </button>
            )}
            {viewerIndex < items.length - 1 && (
              <button
                onClick={down}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                aria-label="Next photo"
              >
                <ChevronDown className="h-6 w-6 text-white" />
              </button>
            )}

            {/* Image */}
            <div className="bg-card/60 backdrop-blur-xl rounded-2xl border border-border/50 overflow-hidden">
              <img
                id="vibes-viewer-img"
                src={items[viewerIndex].url}
                alt={nameOf(items[viewerIndex].profile)}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
              <div className="p-6 border-t border-border/50">
                <div className="flex items-center gap-3">
                  <Link
                    to={`/creator/${slugFor(items[viewerIndex].profile)}`}
                    className="w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/20 flex items-center justify-center"
                  >
                    {items[viewerIndex].profile?.avatar_url ? (
                      <img
                        src={items[viewerIndex].profile!.avatar_url!}
                        alt={nameOf(items[viewerIndex].profile)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-white text-sm font-semibold">
                        {nameOf(items[viewerIndex].profile).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </Link>
                  <div>
                    <h3 className="text-white font-semibold">
                      {nameOf(items[viewerIndex].profile)}
                    </h3>
                    <p className="text-white/70 text-xs">
                      {new Date(items[viewerIndex].created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Counter */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm">
              {viewerIndex + 1} of {items.length}
            </div>
          </div>
        </div>
      )}

      {/* Tiny scrollbar styling scoped here */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148,163,184,.5); border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,.8); }
      `}</style>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Main page
────────────────────────────────────────────────────────────────────── */
export default function VibesPage() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<Vibe[]>([]);
  const [railOpen, setRailOpen] = React.useState(false);

  const fetchVibes = React.useCallback(async () => {
    setLoading(true);
    try {
      // Cap initial load to avoid huge memory usage
      const { data, error } = await supabase
        .from("vibes")
        .select("id, user_id, content, mood, created_at, image_url, media_url")
        .order("created_at", { ascending: false })
        .limit(60);

      if (error) throw error;

      const rows = data ?? [];
      // batch load profiles ONCE
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      let profMap = new Map<string, ProfileLite | null>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, display_name, first_name, last_name, avatar_url")
          .in("id", ids);
        (profs ?? []).forEach((p: any) => {
          profMap.set(p.id, p);
          profileCache.set(p.id, p);
        });
      }

      const hydrated = rows.map((r: any) => ({
        ...r,
        profile: profMap.get(r.user_id) ?? null,
      })) as Vibe[];

      setRows(hydrated);
    } catch (e) {
      console.error("Failed to load vibes:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchVibes();

    const ch = supabase
      .channel("live-vibes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibes" },
        async (payload) => {
          const v = payload.new as any;
          const prof = await fetchProfileOnce(v.user_id);
          const hydrated = { ...v, profile: prof } as Vibe;

          setRows((prev) => {
            if (prev.some((p) => p.id === hydrated.id)) return prev; // de-dupe
            const next = [hydrated, ...prev];
            return next.length > 80 ? next.slice(0, 80) : next; // hard cap to stop growth
          });
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, [fetchVibes]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Sidebar */}
            <div className="lg:col-span-3 space-y-6">
              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Your Stats</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="h-4 w-4 text-green-400" />
                      <span className="text-slate-300 text-sm">Total Hype</span>
                    </div>
                    <span className="text-white font-semibold">127</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-blue-400" />
                      <span className="text-slate-300 text-sm">Connections</span>
                    </div>
                    <span className="text-white font-semibold">342</span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Trending Moods</h3>
                <div className="space-y-3">
                  {[
                    { mood: "🔥 Hype", count: "1.2k vibes" },
                    { mood: "😄 Happy", count: "892 vibes" },
                    { mood: "🧘 Chill", count: "634 vibes" },
                    { mood: "🙏 Grateful", count: "428 vibes" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-700/30 hover:bg-slate-700/50 transition-colors cursor-pointer">
                      <span className="text-slate-200 font-medium">{item.mood}</span>
                      <span className="text-slate-400 text-sm">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Center Feed */}
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl p-6">
                <VibeComposer
                  onPosted={async (newRow) => {
                    if (newRow) {
                      const prof = await fetchProfileOnce((newRow as any).user_id);
                      const next = { ...(newRow as Vibe), profile: prof ?? null };
                      setRows((prev) => [next, ...prev].slice(0, 80));
                    } else {
                      await fetchVibes();
                    }
                  }}
                />
              </div>

              <div className="space-y-4">
                {loading ? (
                  <div className="py-24 flex flex-col items-center justify-center">
                    <div className="relative">
                      <div className="h-12 w-12 border-2 border-slate-600 border-t-purple-400 rounded-full animate-spin" />
                    </div>
                    <p className="mt-6 text-slate-400 font-light">Loading vibes...</p>
                  </div>
                ) : rows.length === 0 ? (
                  <div className="py-20 text-center">
                    <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 p-12">
                      <div className="mb-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full mx-auto flex items-center justify-center">
                          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </div>
                      </div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-2">No vibes yet</h3>
                      <p className="text-slate-400 font-light">Be the first to share your vibe!</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-xl font-semibold text-slate-200">Latest Vibes</h2>
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        <span>Live</span>
                      </div>
                    </div>

                    <div
                      className="space-y-4"
                      style={{ contentVisibility: "auto", containIntrinsicSize: "1px 800px" }}
                    >
                      {rows.map((v) => (
                        <div key={v.id} className="group">
                          <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 hover:border-slate-600/70 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-purple-500/10 overflow-hidden">
                            <div className="p-6">
                              <VibeCard vibe={v} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Right Sidebar – Desktop only */}
            <div className="lg:col-span-3 space-y-6 hidden lg:block">
              <RightPhotoRail title="Splikz Photos" maxListHeight="calc(100vh - 220px)" />
              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-medium">U</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-300 text-sm">
                          <span className="font-medium">User {i}</span> hyped your vibe
                        </p>
                        <p className="text-slate-500 text-xs">{i * 2} minutes ago</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* MOBILE: button → right sheet with photo rail */}
        <button
          aria-label="Open photos"
          onClick={() => setRailOpen(true)}
          className="lg:hidden fixed z-40 right-4 bottom-24 rounded-full px-4 py-3 shadow-lg
                     bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium
                     hover:from-purple-700 hover:to-blue-700 active:scale-[0.98] transition"
        >
          <span className="inline-flex items-center gap-2">
            <Camera className="h-5 w-5" /> Photos
          </span>
        </button>

        <Sheet open={railOpen} onOpenChange={setRailOpen}>
          <SheetContent
            side="right"
            className="lg:hidden w-[92vw] sm:w-[420px] p-0 bg-slate-950 border-l border-slate-800"
          >
            <SheetHeader className="p-4 border-b border-slate-800">
              <SheetTitle className="flex items-center gap-2 text-slate-200">
                <Camera className="h-5 w-5 text-slate-400" />
                Splikz Photos
              </SheetTitle>
            </SheetHeader>
            <div className="p-4">
              <RightPhotoRail title="Splikz Photos" maxListHeight="50vh" />
            </div>
          </SheetContent>
        </Sheet>

        {/* Bottom spacer */}
        <div className="h-20" />
      </div>
    </div>
  );
}
