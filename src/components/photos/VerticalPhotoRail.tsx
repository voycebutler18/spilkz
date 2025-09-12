// src/components/photos/VerticalPhotoRail.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Camera, ChevronUp, ChevronDown, X } from "lucide-react";

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

type VerticalPhotoRailProps = {
  /** Optional: section title (default: "Photo Reels") */
  title?: string;
  /** Panel classname for layout tuning */
  className?: string;
  /** Inner list height (default: 24rem) */
  maxListHeight?: string | number;
  /** How many photos to load (default: 50) */
  limit?: number;
};

const nameOf = (p?: ProfileLite | null) => {
  if (!p) return "User";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.username?.trim() || "User";
};

const slugFor = (p?: ProfileLite | null) => (p?.username ? p.username : p?.id || "");

export default function VerticalPhotoRail({
  title = "Photo Reels",
  className = "",
  maxListHeight = "24rem",
  limit = 50,
}: VerticalPhotoRailProps) {
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<PhotoItem[]>([]);
  const [viewerIndex, setViewerIndex] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // 1) Try a dedicated table/view first: vibe_photos(photo_url)
      let photos: any[] = [];
      const { data: p1, error: e1 } = await supabase
        .from("vibe_photos")
        .select("id, user_id, photo_url, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!e1 && p1?.length) photos = p1;

      // 2) Fallback: vibes.* with image columns if you store photo posts there
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
              photo_url: r.image_url || r.media_url, // use whichever you have
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

      // hydrate uploader profiles
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
      console.error("VerticalPhotoRail load failed:", err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  React.useEffect(() => {
    load();

    // live inserts (both possible sources)
    const ch = supabase
      .channel("vertical-photo-rail")
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

  // ArrowUp/Down/Escape keyboard in viewer
  React.useEffect(() => {
    if (viewerIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        up();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        down();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerIndex, items.length]);

  return (
    <div
      className={[
        "bg-gradient-to-br from-slate-800/60 to-slate-900/60",
        "backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl",
        "p-6", className,
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-200">{title}</h2>
        <Camera className="h-5 w-5 text-slate-400" />
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
          <div className="py-10 text-center text-slate-400">
            No photos yet
          </div>
        )}

        {items.map((ph, idx) => {
          const person = ph.profile;
          const display = nameOf(person);
          const slug = slugFor(person);

          return (
            <div
              key={ph.id}
              className="relative aspect-square bg-slate-800/40 rounded-xl border border-slate-600/30 overflow-hidden group cursor-pointer"
              onClick={() => open(idx)}
            >
              <img
                src={ph.url}
                alt={display}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />

              {/* Avatar (click → creator profile). Prevent tile click from opening viewer */}
              <Link
                to={slug ? `/creator/${slug}` : "#"}
                onClick={(e) => e.stopPropagation()}
                className="absolute top-2 left-2 w-9 h-9 rounded-full border border-white/20 overflow-hidden bg-white/10 backdrop-blur flex items-center justify-center"
                title={display}
              >
                {person?.avatar_url ? (
                  <img
                    src={person.avatar_url}
                    alt={display}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white text-xs font-semibold">
                    {display.charAt(0).toUpperCase()}
                  </span>
                )}
              </Link>

              {/* Bottom label on hover */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-2 left-2 right-2">
                  <p className="text-white text-xs font-medium truncate">{display}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Viewer */}
      {viewerIndex !== null && items[viewerIndex] && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center">
          <div className="relative max-w-4xl max-h-screen p-4">
            {/* Close */}
            <button
              onClick={close}
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
                    {/* Time could be formatted if needed */}
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

      {/* Scoped scrollbar styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(51, 65, 85, 0.3); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.6); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(139, 92, 246, 0.8); }
      `}</style>
    </div>
  );
}
