// src/components/moments/MomentsBar.tsx
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, X, Camera } from "lucide-react";

const PHOTOS_BUCKET = import.meta.env.VITE_PHOTOS_BUCKET || "vibe_photos";

/* ───────── helpers from your Explore file ───────── */
const displayName = (p?: Profile | null) => {
  if (!p) return "User";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.username?.trim() || `user_${(p.id || "").slice(0, 6) || "anon"}`;
};
const slugFor = (p?: Profile | null) => (p?.username ? p.username : p?.id || "");

const pathFromPublicUrl = (url: string) => {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const idx = parts.findIndex((p) => p === PHOTOS_BUCKET);
    if (idx >= 0) return decodeURIComponent(parts.slice(idx + 1).join("/"));
  } catch {}
  return null;
};

/* ───────── types (same as your Explore) ───────── */
type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
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

/* ───────── COMPONENT (your PhotoRail, unchanged logic) ───────── */
export function MomentsBar({
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
        console.error("MomentsBar load error:", e);
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

export default MomentsBar;
