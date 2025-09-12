import * as React from "react";
import { Link } from "react-router-dom";
import VibeComposer from "@/components/vibes/VibeComposer";
import VibeCard, { Vibe } from "@/components/vibes/VibeCard";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Plus, Users, TrendingUp, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

/* ─────────────────────────────────────────────
   Shared types + small helpers
────────────────────────────────────────────── */
type ProfileLite = {
  id: string;
  username: string | null;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
};

const PROFILE_FIELDS =
  "id, username, display_name, first_name, last_name, avatar_url";

const nameOf = (p?: ProfileLite | null) => {
  if (!p) return "User";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.username?.trim() || "User";
};
const slugFor = (p?: ProfileLite | null) => (p?.username ? p.username : p?.id || "");

/* ─────────────────────────────────────────────
   Right-side vertical photo rail (with upload)
────────────────────────────────────────────── */
type PhotoItem = {
  id: string;
  url: string;
  created_at: string;
  user_id: string;
  profile?: ProfileLite | null;
};

const PHOTO_BUCKET = "vibes"; // your existing bucket

function RightPhotoRail({
  title = "Splikz Photos",
  limit = 36,
  maxListHeight = "calc(100vh - 220px)",
}: {
  title?: string;
  limit?: number;
  maxListHeight?: string | number;
}) {
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<PhotoItem[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // Prefer dedicated table
      let photos: any[] = [];
      const { data: p1 } = await supabase
        .from("vibe_photos")
        .select("id, user_id, photo_url, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (p1?.length) photos = p1;
      // Fallback to vibes.* URLs
      if (!photos.length) {
        const { data: p2 } = await supabase
          .from("vibes")
          .select("id, user_id, image_url, media_url, created_at")
          .order("created_at", { ascending: false })
          .limit(limit);
        photos =
          (p2 || [])
            .map((r) => ({
              id: r.id,
              user_id: r.user_id,
              photo_url: r.image_url || r.media_url,
              created_at: r.created_at,
            }))
            .filter((r) => !!r.photo_url) || [];
      }

      const mapped: PhotoItem[] = (photos || []).map((r) => ({
        id: String(r.id),
        url: String(r.photo_url),
        created_at: r.created_at || new Date().toISOString(),
        user_id: String(r.user_id),
      }));

      // Batch hydrate profiles
      const ids = Array.from(new Set(mapped.map((m) => m.user_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select(PROFILE_FIELDS)
          .in("id", ids);
        const byId: Record<string, ProfileLite> = {};
        (profs || []).forEach((p: any) => (byId[p.id] = p));
        mapped.forEach((m) => (m.profile = byId[m.user_id] || null));
      }

      setItems(mapped);
    } catch (e) {
      console.error("rail load", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  React.useEffect(() => {
    load();
    const ch = supabase
      .channel("pulse-photos")
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

  const pickFile = () => fileRef.current?.click();
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleUpload(f);
  };

  const handleUpload = async (file: File) => {
    try {
      setIsUploading(true);
      if (!file.type.startsWith("image/")) return toast.error("Upload an image.");
      if (file.size > 12 * 1024 * 1024) return toast.error("Max 12MB.");

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return toast.error("Please sign in.");

      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase
        .storage
        .from(PHOTO_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        console.error(upErr);
        return toast.error("Upload failed.");
      }

      const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) return toast.error("No public URL.");

      // 1) add to text feed
      const { error: vErr } = await supabase
        .from("vibes")
        .insert([{ user_id: uid, content: "", image_url: publicUrl }]);
      if (vErr) {
        await supabase.from("vibes").insert([{ user_id: uid, content: "", media_url: publicUrl }]);
      }
      // 2) add to rail (ignore if table missing)
      const { error: rErr } = await supabase
        .from("vibe_photos")
        .insert([{ user_id: uid, photo_url: publicUrl }]);
      if (rErr && !/relation .* does not exist/i.test(rErr.message)) {
        console.warn("vibe_photos insert", rErr.message);
      }

      toast.success("Photo uploaded!");
      await load(); // refresh
    } catch (e) {
      console.error(e);
      toast.error("Upload error.");
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

    <div className="bg-card/60 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Camera className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Upload */}
      <div className="mb-4">
        <button
          onClick={pickFile}
          disabled={isUploading}
          className="w-full rounded-xl p-3 transition-all duration-300 group
                     bg-gradient-to-r from-purple-600 to-blue-600
                     hover:from-purple-700 hover:to-blue-700
                     disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span className="inline-flex items-center gap-2 text-white font-medium text-sm">
            {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            {isUploading ? "Uploading…" : "Upload Photo"}
          </span>
        </button>
      </div>

      {/* Vertical list */}
      <div
        className="space-y-3 overflow-y-auto pr-1"
        style={{
          maxHeight: typeof maxListHeight === "number" ? `${maxListHeight}px` : maxListHeight,
          contentVisibility: "auto",
          containIntrinsicSize: "1px 350px",
        }}
      >
        {loading && <div className="py-10 text-center text-muted-foreground text-sm">Loading photos…</div>}
        {!loading && items.length === 0 && (
          <div className="py-10 text-center text-muted-foreground text-sm">No photos yet</div>
        )}

        {items.map((ph) => {
          const person = ph.profile;
          const display = nameOf(person);
          const slug = slugFor(person);
          return (
            <div
              key={ph.id}
              className="relative aspect-square bg-muted/40 rounded-xl border border-border/40 overflow-hidden group"
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

              {/* Avatar → profile */}
              <Link
                to={slug ? `/creator/${slug}` : "#"}
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
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}

/* ─────────────────────────────────────────────
   New lightweight page
────────────────────────────────────────────── */
export default function Pulse() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<Vibe[]>([]);
  const [openPhotos, setOpenPhotos] = React.useState(false);

  const loadFeed = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vibes")
        .select("id, user_id, content, mood, created_at, image_url, media_url")
        .order("created_at", { ascending: false })
        .limit(50); // light cap

      if (error) throw error;

      const base = data ?? [];
      const ids = Array.from(new Set(base.map((r) => r.user_id)));
      let profMap = new Map<string, ProfileLite | null>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select(PROFILE_FIELDS)
          .in("id", ids);
        (profs || []).forEach((p: any) => profMap.set(p.id, p));
      }

      const hydrated = base.map((r: any) => ({
        ...r,
        profile: profMap.get(r.user_id) ?? null,
      })) as Vibe[];

      setRows(hydrated);
    } catch (e) {
      console.error("pulse feed", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadFeed();
    const ch = supabase
      .channel("pulse-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibes" },
        async (payload) => {
          const v = payload.new as any;
          const { data: prof } = await supabase
            .from("profiles")
            .select(PROFILE_FIELDS)
            .eq("id", v.user_id)
            .maybeSingle();
          const hydrated = { ...v, profile: (prof as ProfileLite) ?? null } as Vibe;
          setRows((prev) => {
            if (prev.some((p) => p.id === hydrated.id)) return prev;
            const next = [hydrated, ...prev];
            return next.length > 70 ? next.slice(0, 70) : next; // keep it lean
          });
        }
      )
      .subscribe();
    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, [loadFeed]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Pulse</h1>
            <p className="text-muted-foreground">Fresh vibes + photos, lightweight & fast.</p>
          </div>
          <button
            onClick={() => setOpenPhotos(true)}
            className="lg:hidden inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-primary text-primary-foreground"
          >
            <Camera className="h-4 w-4" />
            Photos
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left mini-stats */}
          <div className="lg:col-span-3 space-y-6">
            <div className="rounded-2xl border p-6 bg-card">
              <h3 className="text-lg font-semibold mb-4">Your Stats</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Total Hype</span>
                  </div>
                  <span className="font-semibold">127</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">Connections</span>
                  </div>
                  <span className="font-semibold">342</span>
                </div>
              </div>
            </div>
          </div>

          {/* Center feed */}
          <div className="lg:col-span-6 space-y-6">
            <div className="rounded-2xl border p-6 bg-card">
              <VibeComposer
                onPosted={async (newRow) => {
                  if (newRow) {
                    const { data: prof } = await supabase
                      .from("profiles")
                      .select(PROFILE_FIELDS)
                      .eq("id", (newRow as any).user_id)
                      .maybeSingle();
                    const next = { ...(newRow as Vibe), profile: (prof as ProfileLite) ?? null };
                    setRows((prev) => [next, ...prev].slice(0, 70));
                  } else {
                    await loadFeed();
                  }
                }}
              />
            </div>

            {loading ? (
              <div className="py-20 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 mx-auto mb-3 animate-spin" />
                Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl border p-12 text-center bg-card">
                No vibes yet. Be the first to post!
              </div>
            ) : (
              <div
                className="space-y-4"
                style={{ contentVisibility: "auto", containIntrinsicSize: "1px 800px" }}
              >
                {rows.map((v) => (
                  <div key={v.id} className="rounded-2xl border bg-card">
                    <div className="p-6">
                      <VibeCard vibe={v} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right rail (desktop) */}
          <div className="lg:col-span-3 hidden lg:block">
            <RightPhotoRail />
          </div>
        </div>
      </div>

      {/* Mobile photo sheet */}
      <Sheet open={openPhotos} onOpenChange={setOpenPhotos}>
        <SheetContent side="right" className="lg:hidden w-[92vw] sm:w-[420px] p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Splikz Photos
            </SheetTitle>
          </SheetHeader>
          <div className="p-4">
            <RightPhotoRail maxListHeight="65vh" />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
