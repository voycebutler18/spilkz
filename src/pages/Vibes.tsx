// src/pages/Vibes.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import VibeComposer from "@/components/vibes/VibeComposer";
import VibeCard, { Vibe } from "@/components/vibes/VibeCard";
import { supabase } from "@/integrations/supabase/client";
import {
  Camera, Plus, Users, TrendingUp, X, ChevronUp, ChevronDown,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** ────────────────────────────────────────────────────────────────────────────
 * Inline Right-Side Vertical Photo Rail (NOT “stories”)
 * - Visible in right sidebar on desktop (lg+)
 * - MOBILE: floating button opens the same rail from the RIGHT as a slide-in
 * - Vertical scroll, small clickable profile avatars → /creator/:slug
 * - Fullscreen viewer with ArrowUp/ArrowDown
 * - Realtime inserts from vibe_photos or vibes
 * - No extra files created
 * ──────────────────────────────────────────────────────────────────────────── */
type ProfileLite = {
  id: string;
  username: string | null;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
};

type PhotoItem = {
  id: string;
  url: string;
  created_at: string;
  user_id: string;
  profile?: ProfileLite | null;
};

const nameOf = (p?: ProfileLite | null) => {
  if (!p) return "User";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.username?.trim() || "User";
};
const slugFor = (p?: ProfileLite | null) => (p?.username ? p.username : p?.id || "");

function RightPhotoRail({
  title = "Photo Reels",
  maxListHeight = "24rem",
  limit = 50,
}: {
  title?: string;
  maxListHeight?: string | number;
  limit?: number;
}) {
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<PhotoItem[]>([]);
  const [viewerIndex, setViewerIndex] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // 1) Preferred table: vibe_photos
      let photos: any[] = [];
      const { data: p1, error: e1 } = await supabase
        .from("vibe_photos")
        .select("id, user_id, photo_url, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!e1 && p1?.length) photos = p1;

      // 2) Fallback: vibes.* image fields
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

      // hydrate profiles
      const userIds = Array.from(new Set(mapped.map((m) => m.user_id)));
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, display_name, first_name, last_name, avatar_url")
          .in("id", userIds);
        const byId: Record<string, ProfileLite> = {};
        (profs || []).forEach((p: any) => (byId[p.id] = p));
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
  const close = () => setViewerIndex(null);
  const up = () => setViewerIndex((i) => (i === null || i <= 0 ? i : i - 1));
  const down = () =>
    setViewerIndex((i) => (i === null || i >= items.length - 1 ? i : i + 1));

  // Keys in viewer
  React.useEffect(() => {
    if (viewerIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") { e.preventDefault(); up(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); down(); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerIndex, items.length]);

  return (
    <>
      <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-200">{title}</h2>
          <Camera className="h-5 w-5 text-slate-400" />
        </div>

        {/* Optional: wire to your upload flow */}
        <div className="mb-4">
          <button className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-xl p-3 transition-all duration-300 group">
            <div className="flex items-center justify-center space-x-2">
              <Plus className="h-5 w-5 text-white" />
              <span className="text-white font-medium text-sm">Add Photo</span>
            </div>
          </button>
        </div>

        {/* Vertical list */}
        <div
          className="space-y-3 overflow-y-auto custom-scrollbar"
          style={{ maxHeight: typeof maxListHeight === "number" ? `${maxListHeight}px` : maxListHeight }}
        >
          {loading && (
            <div className="py-12 text-center text-slate-400">Loading photos…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="py-10 text-center text-slate-400">No photos yet</div>
          )}

          {items.map((ph, idx) => {
            const person = ph.profile;
            const display = nameOf(person);
            const slug = slugFor(person);
            return (
              <div
                key={ph.id}
                className="relative aspect-square bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-xl border border-slate-600/30 overflow-hidden group hover:from-slate-600/50 hover:to-slate-700/50 transition-all cursor-pointer"
                onClick={() => open(idx)}
              >
                <img
                  src={ph.url}
                  alt={display}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {/* Small avatar → creator profile (don’t open viewer) */}
                <Link
                  to={slug ? `/creator/${slug}` : "#"}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-2 left-2 w-9 h-9 rounded-full border border-white/20 overflow-hidden bg-white/10 backdrop-blur flex items-center justify-center"
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
              onClick={() => setViewerIndex(null)}
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
            <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
              <img
                src={items[viewerIndex].url}
                alt={nameOf(items[viewerIndex].profile)}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
              <div className="p-6 border-t border-slate-700/50">
                <div className="flex items-center space-x-3">
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
                    <p className="text-slate-400 text-xs">
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

      {/* Scoped scrollbar */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(51, 65, 85, 0.3); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.6); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(139, 92, 246, 0.8); }
      `}</style>
    </>
  );
}

export default function VibesPage() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<Vibe[]>([]);
  const railOpenRef = React.useRef(false); // to avoid stale closures for sheet
  const [railOpen, setRailOpen] = React.useState(false);
  railOpenRef.current = railOpen;

  const hydrateProfile = React.useCallback(async (v: any): Promise<Vibe> => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, username, display_name, first_name, last_name, avatar_url")
      .eq("id", v.user_id)
      .maybeSingle();
    return { ...v, profile: prof || null } as Vibe;
  }, []);

  const fetchVibes = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vibes")
        .select("id, user_id, content, mood, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const hydrated = await Promise.all((data ?? []).map(hydrateProfile));
      setRows(hydrated);
    } catch (e) {
      console.error("Failed to load vibes:", e);
    } finally {
      setLoading(false);
    }
  }, [hydrateProfile]);

  React.useEffect(() => {
    fetchVibes();
    const ch = supabase
      .channel("live-vibes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibes" },
        async (payload) => {
          const hydrated = await hydrateProfile(payload.new);
          setRows((prev) => [hydrated, ...prev]);
        }
      )
      .subscribe();
    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, [fetchVibes, hydrateProfile]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl"></div>
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
                      const next =
                        (newRow as Vibe).profile
                          ? (newRow as Vibe)
                          : await hydrateProfile(newRow);
                      setRows((prev) => [next, ...prev]);
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
                      <div className="h-12 w-12 border-2 border-slate-600 border-t-purple-400 rounded-full animate-spin"></div>
                      <div className="absolute inset-0 h-12 w-12 border-2 border-transparent border-b-blue-400 rounded-full animate-spin animation-delay-150"></div>
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
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-semibold text-slate-200">Latest Vibes</h2>
                      <div className="flex items-center space-x-2 text-sm text-slate-400">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span>Live</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {rows.map((v, index) => (
                        <div key={v.id} className="group" style={{ animationDelay: `${index * 50}ms` }}>
                          <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 hover:border-slate-600/70 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-purple-500/10 overflow-hidden">
                            <div className="p-6">
                              <VibeCard vibe={v} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Sidebar – Desktop only */}
            <div className="lg:col-span-3 space-y-6 hidden lg:block">
              <RightPhotoRail title="Photo Reels" maxListHeight="calc(100vh - 220px)" />
              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center space-x-3">
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

        {/* MOBILE: floating button → opens right-side sheet with the SAME rail */}
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
                Photo Reels
              </SheetTitle>
            </SheetHeader>
            <div className="p-4">
              <RightPhotoRail title="Photo Reels" maxListHeight="calc(100svh - 7.5rem)" />
            </div>
          </SheetContent>
        </Sheet>

        {/* Bottom spacer */}
        <div className="h-20" />
      </div>
    </div>
  );
}
