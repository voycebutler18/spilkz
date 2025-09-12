// src/pages/Food.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Camera, Plus, Loader2, ChevronUp, ChevronDown, X, Utensils, RefreshCw, Images,
} from "lucide-react";
import SplikCard from "@/components/splik/SplikCard";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
};

type Splik = {
  id: string;
  user_id: string;
  video_url: string;
  thumbnail_url?: string | null;
  title?: string | null;
  description?: string | null;
  created_at?: string;
  tag?: string | null;
  // if your schema has this it will appear, otherwise stays undefined
  is_food?: boolean;
  profile?: Profile | null;
};

type PhotoItem = {
  id: string;
  user_id: string;
  url: string;
  created_at: string;
  // if your schema has this it will appear, otherwise stays undefined
  category?: string | null;
  profile?: Profile | null;
};

type CombinedItem =
  | { kind: "video"; created_at: string; video: Splik }
  | { kind: "photo"; created_at: string; photo: PhotoItem };

const FOOD_BUCKET = "food"; // separate Storage bucket

const displayName = (p?: Profile | null) => {
  if (!p) return "User";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.username?.trim() || "User";
};
const slugFor = (p?: Profile | null) => (p?.username ? p.username : p?.id || "");

/* ────────────────────────────────────────────────────────────────────────────
   Right Food Photo Rail (vertical)
──────────────────────────────────────────────────────────────────────────── */
function RightFoodRail({
  title = "Splikz Food Photos",
  maxListHeight = "calc(100vh - 220px)",
  limit = 80,
  showUploader = true,
}: {
  title?: string;
  maxListHeight?: string | number;
  limit?: number;
  showUploader?: boolean;
}) {
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<PhotoItem[]>([]);
  const [viewerIndex, setViewerIndex] = React.useState<number | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const hydrateProfiles = async (rows: PhotoItem[]) => {
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    if (!userIds.length) return rows;
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, display_name, first_name, last_name, avatar_url")
      .in("id", userIds);
    const byId: Record<string, Profile> = {};
    (profs || []).forEach((p: any) => (byId[p.id] = p));
    return rows.map((r) => ({ ...r, profile: byId[r.user_id] || null }));
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // fetch latest photos, filter Food on the client so this still works if 'category' column isn't there yet
      const { data, error } = await supabase
        .from("vibe_photos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;

      const mapped: PhotoItem[] = (data || []).map((r: any) => ({
        id: String(r.id),
        user_id: String(r.user_id),
        url: String(r.photo_url),
        created_at: r.created_at || new Date().toISOString(),
        category: r.category ?? null,
      }));

      // keep only food: either explicit category OR served from the /food/ bucket path
      const onlyFood = mapped.filter(
        (r) =>
          (r.category && String(r.category).toLowerCase() === "food") ||
          r.url.includes("/storage/v1/object/public/food/") ||
          r.url.includes("/food/")
      );

      setItems(await hydrateProfiles(onlyFood));
    } catch (e) {
      console.error("Food rail load failed:", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  React.useEffect(() => {
    load();

    // Realtime: reload when a new vibe_photos row is inserted
    const ch = supabase
      .channel("food-rail")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibe_photos" },
        (payload) => {
          const row: any = payload.new;
          if (
            (row.category && String(row.category).toLowerCase() === "food") ||
            String(row.photo_url || "").includes("/food/")
          ) {
            load();
          }
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [load]);

  const open = (i: number) => setViewerIndex(i);
  const close = () => setViewerIndex(null);
  const up = () => setViewerIndex((i) => (i === null || i <= 0 ? i : i - 1));
  const down = () =>
    setViewerIndex((i) => (i === null || i >= items.length - 1 ? i : i + 1));

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

  const onPickFile = () => fileRef.current?.click();

  const handleFile = async (file: File) => {
    try {
      setIsUploading(true);

      if (!file.type.startsWith("image/")) {
        toast.error("Please upload an image file.");
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        toast.error("Image is too large (max 12 MB).");
        return;
      }

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        toast.error("Please log in to upload a photo.");
        return;
      }

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${uid}/${Date.now()}.${ext}`;

      // upload to the FOOD bucket
      const { error: upErr } = await supabase
        .storage
        .from(FOOD_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        console.error(upErr);
        toast.error("Upload failed. Check bucket permissions.");
        return;
      }

      const { data: pub } = supabase.storage.from(FOOD_BUCKET).getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) {
        toast.error("Could not get public URL for image.");
        return;
      }

      // Insert into vibe_photos with explicit category=food
      const { error: vpErr } = await supabase
        .from("vibe_photos")
        .insert([{ user_id: uid, photo_url: publicUrl, category: "food" }]);
      if (vpErr) {
        console.warn("insert vibe_photos error:", vpErr.message);
      }

      // Optional activity row (vibes) — tries image_url then media_url for compatibility
      const { error: vib1 } = await supabase
        .from("vibes")
        .insert([{ user_id: uid, content: "", image_url: publicUrl, mood: "food" }]);
      if (vib1) {
        await supabase
          .from("vibes")
          .insert([{ user_id: uid, content: "", media_url: publicUrl, mood: "food" }]);
      }

      // Optimistic add
      setItems((prev) => [
        {
          id: `tmp-${Date.now()}`,
          url: publicUrl,
          created_at: new Date().toISOString(),
          user_id: uid,
          category: "food",
          profile: prev.find((p) => p.user_id === uid)?.profile ?? undefined,
        },
        ...prev,
      ]);

      toast.success("Photo uploaded to Food!");
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
      {/* hidden file input */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

      <div className="bg-card/60 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Utensils className="h-4 w-4" /> {title}
          </h3>
          <Images className="h-4 w-4 text-muted-foreground" />
</div>

        {showUploader && (
          <div className="mb-4">
            <Button onClick={onPickFile} disabled={isUploading} className="w-full">
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" /> Upload Food Photo
                </>
              )}
            </Button>
          </div>
        )}

        <div
          className="space-y-3 overflow-y-auto custom-scrollbar pr-1"
          style={{ maxHeight: typeof maxListHeight === "number" ? `${maxListHeight}px` : maxListHeight }}
        >
          {loading && (
            <div className="py-10 text-center text-muted-foreground text-sm">Loading photos…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="py-10 text-center text-muted-foreground text-sm">No food photos yet</div>
          )}

          {items.map((ph, idx) => {
            const person = ph.profile;
            const name = displayName(person);
            const slug = slugFor(person);
            return (
              <div
                key={ph.id}
                className="relative aspect-square bg-muted/40 rounded-xl border border-border/40 overflow-hidden group cursor-pointer"
                onClick={() => setViewerIndex(idx)}
              >
                <img
                  src={ph.url}
                  alt={name}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Small avatar → creator profile (don’t open viewer on click) */}
                <Link
                  to={slug ? `/creator/${slug}` : "#"}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-2 left-2 w-9 h-9 rounded-full border border-white/30 overflow-hidden bg-background/60 backdrop-blur flex items-center justify-center"
                  title={name}
                >
                  {person?.avatar_url ? (
                    <img src={person.avatar_url} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xs font-semibold">
                      {name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </Link>

                {/* Name on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-white text-xs font-medium truncate">{name}</p>
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
            <button
              onClick={() => setViewerIndex(null)}
              className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
              aria-label="Close viewer"
            >
              <X className="h-6 w-6 text-white" />
            </button>

            {viewerIndex > 0 && (
              <button
                onClick={() => setViewerIndex((i) => (i ? Math.max(0, i - 1) : i))}
                className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                aria-label="Previous photo"
              >
                <ChevronUp className="h-6 w-6 text-white" />
              </button>
            )}
            {viewerIndex < items.length - 1 && (
              <button
                onClick={() => setViewerIndex((i) => (i === null ? i : Math.min(items.length - 1, i + 1)))}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                aria-label="Next photo"
              >
                <ChevronDown className="h-6 w-6 text-white" />
              </button>
            )}

            <div className="bg-card/60 backdrop-blur-xl rounded-2xl border border-border/50 overflow-hidden">
              <img
                src={items[viewerIndex].url}
                alt={displayName(items[viewerIndex].profile)}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
              <div className="p-6 border-t border-border/50">
                <div className="flex items-center space-x-3">
                  <Link
                    to={`/creator/${slugFor(items[viewerIndex].profile)}`}
                    className="w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/20 flex items-center justify-center"
                  >
                    {items[viewerIndex].profile?.avatar_url ? (
                      <img
                        src={items[viewerIndex].profile!.avatar_url!}
                        alt={displayName(items[viewerIndex].profile)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-white text-sm font-semibold">
                        {displayName(items[viewerIndex].profile).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </Link>
                  <div>
                    <h3 className="text-white font-semibold">
                      {displayName(items[viewerIndex].profile)}
                    </h3>
                    <p className="text-slate-400 text-xs">
                      {new Date(items[viewerIndex].created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm">
              {viewerIndex + 1} of {items.length}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148,163,184,.5); border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,.8); }
      `}</style>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Food Photo Card (for photos in the center mixed feed)
──────────────────────────────────────────────────────────────────────────── */
function FoodPhotoCard({ item }: { item: PhotoItem }) {
  const person = item.profile;
  const display = displayName(person);
  const slug = slugFor(person);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="p-4 flex items-center gap-3">
          <Link to={`/creator/${slug}`} className="w-10 h-10 rounded-full overflow-hidden border">
            {person?.avatar_url ? (
              <img src={person.avatar_url} alt={display} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted text-sm font-semibold">
                {display.charAt(0).toUpperCase()}
              </div>
            )}
          </Link>
          <div className="min-w-0">
            <p className="font-semibold leading-tight truncate">{display}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(item.created_at).toLocaleString()}
            </p>
          </div>
          <Badge className="ml-auto" variant="secondary">
            <Utensils className="h-3 w-3 mr-1" /> Food
          </Badge>
        </div>
        <div className="w-full">
          <img src={item.url} alt={display} className="w-full h-auto object-contain" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   FOOD PAGE
   - Center feed mixes Food videos + Food photos
   - Right rail shows Food photos + upload
   - Mobile: toggle to open the rail
──────────────────────────────────────────────────────────────────────────── */
export default function FoodPage() {
  const [loading, setLoading] = React.useState(true);
  const [showMobileRail, setShowMobileRail] = React.useState(false);
  const [videos, setVideos] = React.useState<Splik[]>([]);
  const [photos, setPhotos] = React.useState<PhotoItem[]>([]);
  const [feed, setFeed] = React.useState<CombinedItem[]>([]);

  const hydrateProfile = async (user_id: string): Promise<Profile | null> => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, username, display_name, first_name, last_name, avatar_url")
      .eq("id", user_id)
      .maybeSingle();
    return (prof as Profile) || null;
  };

  const loadVideos = React.useCallback(async () => {
    // Grab latest videos then filter to "food" client-side so we don't depend on an is_food column.
    const { data, error } = await supabase
      .from("spliks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const rows = (data || []) as Splik[];
    // keep videos that look like "food": explicit is_food === true OR tag/title/description contains "food"
    const onlyFood = rows.filter((r) => {
      const t = `${r.tag || ""} ${r.title || ""} ${r.description || ""}`.toLowerCase();
      return (r as any).is_food === true || t.includes("food");
    });

    const withProfiles = await Promise.all(
      onlyFood.map(async (s) => ({ ...s, profile: await hydrateProfile(s.user_id) }))
    );
    setVideos(withProfiles);
  }, []);

  const loadPhotos = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("vibe_photos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const mapped: PhotoItem[] = await Promise.all(
      (data || []).map(async (r: any) => ({
        id: String(r.id),
        user_id: String(r.user_id),
        url: String(r.photo_url),
        created_at: r.created_at || new Date().toISOString(),
        category: r.category ?? null,
        profile: await hydrateProfile(String(r.user_id)),
      }))
    );

    const onlyFood = mapped.filter(
      (r) =>
        (r.category && String(r.category).toLowerCase() === "food") ||
        r.url.includes("/storage/v1/object/public/food/") ||
        r.url.includes("/food/")
    );

    setPhotos(onlyFood);
  }, []);

  const buildFeed = React.useCallback(() => {
    const combined: CombinedItem[] = [
      ...videos
        .filter((v) => !!v.created_at)
        .map((v) => ({ kind: "video", created_at: v.created_at!, video: v })),
      ...photos.map((p) => ({ kind: "photo", created_at: p.created_at, photo: p })),
    ].sort((a, b) => (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    setFeed(combined);
  }, [videos, photos]);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadVideos(), loadPhotos()]);
      } catch (e) {
        console.error("Food load error:", e);
      } finally {
        setLoading(false);
      }
    })();

    // Realtime updates: photos INSERT & spliks INSERT
    const ch = supabase
      .channel("food-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibe_photos" },
        (payload) => {
          const row: any = payload.new;
          if (
            (row.category && String(row.category).toLowerCase() === "food") ||
            String(row.photo_url || "").includes("/food/")
          ) {
            loadPhotos();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "spliks" },
        (payload) => {
          const r: any = payload.new;
          const text = `${r.tag || ""} ${r.title || ""} ${r.description || ""}`.toLowerCase();
          if (r.is_food === true || text.includes("food")) loadVideos();
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, [loadVideos, loadPhotos]);

  React.useEffect(() => {
    buildFeed();
  }, [videos, photos, buildFeed]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-b from-secondary/10 to-background py-8 px-4">
        <div className="container">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Utensils className="h-8 w-8" />
              <div>
                <h1 className="text-3xl md:text-4xl font-bold mb-1">Food</h1>
                <p className="text-muted-foreground">
                  Upload food pics on the right • Latest food videos + photos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Mobile toggle to open the rail */}
              <Button
                variant="outline"
                className="lg:hidden"
                onClick={() => setShowMobileRail((v) => !v)}
              >
                <Camera className="h-4 w-4 mr-2" />
                {showMobileRail ? "Hide Splikz Photos" : "Splikz Food Photos"}
              </Button>
              <Button onClick={() => window.location.reload()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Center Feed */}
          <div className="lg:col-span-9 space-y-6">
            {/* Mobile rail (collapsible) */}
            {showMobileRail && (
              <div className="lg:hidden">
                <RightFoodRail maxListHeight="50vh" />
              </div>
            )}

            <Tabs defaultValue="latest" className="space-y-6">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="latest">Latest</TabsTrigger>
                <TabsTrigger value="videos">Videos Only</TabsTrigger>
              </TabsList>

              <TabsContent value="latest" className="space-y-6">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                    <p className="text-sm text-muted-foreground">Loading food feed…</p>
                  </div>
                ) : feed.length === 0 ? (
                  <Card>
                    <CardContent className="p-10 text-center">
                      <Utensils className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <h3 className="text-lg font-semibold mb-1">Nothing yet</h3>
                      <p className="text-muted-foreground">
                        Be the first to upload a food photo!
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    {feed.map((it, i) =>
                      it.kind === "video" ? (
                        <SplikCard key={`v-${it.video.id}-${i}`} splik={it.video} />
                      ) : (
                        <FoodPhotoCard key={`p-${it.photo.id}-${i}`} item={it.photo} />
                      )
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="videos" className="space-y-6">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                    <p className="text-sm text-muted-foreground">Loading food videos…</p>
                  </div>
                ) : videos.length === 0 ? (
                  <Card>
                    <CardContent className="p-10 text-center">
                      <Utensils className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <h3 className="text-lg font-semibold mb-1">No food videos</h3>
                      <p className="text-muted-foreground">
                        Try uploading or tagging your video as food.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    {videos.map((v) => (
                      <SplikCard key={v.id} splik={v} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Sidebar – Desktop */}
          <div className="lg:col-span-3 hidden lg:block">
            <RightFoodRail />
          </div>
        </div>
      </div>
    </div>
  );
}
