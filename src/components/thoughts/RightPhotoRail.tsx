import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

type Highlight = {
  id: string;
  user_id: string | null;
  kind: "thought_post" | "thought_image" | "food_post" | "food_image" | "other";
  route: string;        // where to navigate when it's a text-only post
  ref_table: string;
  ref_id: string;
  image_path: string | null;
  text_preview: string | null;
  mood: string | null;
  created_at: string;
  expires_at: string;
};

const BUCKET_FOR_KIND: Record<string, string> = {
  thought_image: "thoughts-images",
  food_image: "food-images", // future-proof — add this bucket when you wire Food
};

function getImageUrl(kind: Highlight["kind"], path: string) {
  const bucket = BUCKET_FOR_KIND[kind] ?? "thoughts-images";
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Site-wide right rail: shows highlights (photos + text posts) for 24h, no videos. */
export default function RightSiteHighlights({
  // optional filter if you ever want a page to show only one domain
  includeKinds = ["thought_post", "thought_image", "food_post", "food_image"],
  limit = 120,
}: {
  includeKinds?: Highlight["kind"][];
  limit?: number;
}) {
  const navigate = useNavigate();

  const [items, setItems] = React.useState<Highlight[]>([]);
  const [lightIdx, setLightIdx] = React.useState<number | null>(null); // image-only
  const lightOpen = lightIdx !== null;

  // derived list of JUST images for lightbox nav
  const imageItems = React.useMemo(
    () => items.filter(i => i.image_path && (i.kind.endsWith("_image"))),
    [items]
  );

  React.useEffect(() => {
    let alive = true;

    const load = async () => {
      // read from the active view (only non-expired)
      let query = supabase
        .from("site_highlights_active")
        .select("*")
        .in("kind", includeKinds as any)
        .order("created_at", { ascending: false })
        .limit(limit);

      const { data, error } = await query;
      if (error || !alive) { console.error(error); return; }

      const mapped = (data as Highlight[]).map(h => ({
        ...h,
        // normalize empty strings -> null
        image_path: h.image_path || null,
        text_preview: h.text_preview || null,
      }));
      setItems(mapped);
    };

    load();

    // realtime: new highlights / expiry updates
    const channel = supabase.channel("rail_highlights")
      .on("postgres_changes",
          { event: "*", schema: "public", table: "site_highlights" },
          (_payload) => load())
      .subscribe();

    return () => { alive = false; supabase.removeChannel(channel); };
  }, [includeKinds, limit]);

  const openAtId = (id: string) => {
    const idx = imageItems.findIndex(i => i.id === id);
    if (idx >= 0) setLightIdx(idx);
  };
  const close = () => setLightIdx(null);
  const prev = () => setLightIdx(i => (i === null ? i : (i + imageItems.length - 1) % imageItems.length));
  const next = () => setLightIdx(i => (i === null ? i : (i + 1) % imageItems.length));

  // keyboard nav for lightbox
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!lightOpen) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightOpen]);

  return (
    <aside className="hidden lg:block sticky top-4 h-[calc(100vh-2rem)] overflow-auto">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-200">Latest</h3>
          <span className="text-xs text-neutral-500">{items.length}</span>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {items.length === 0 && (
            <p className="text-sm text-neutral-400">New photos & status posts will appear here for 24 hours.</p>
          )}

          {items.map(h => {
            const isImage = !!h.image_path && h.kind.endsWith("_image");
            if (isImage) {
              const src = getImageUrl(h.kind, h.image_path!);
              return (
                <button
                  key={h.id}
                  onClick={() => openAtId(h.id)}
                  className="flex items-center gap-3 text-left group"
                  aria-label="Open photo"
                >
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    className="h-14 w-14 rounded-full object-cover ring-2 ring-neutral-800 group-hover:ring-indigo-500/60 transition"
                  />
                  <div className="flex-1 border-b border-neutral-800/70" />
                </button>
              );
            }

            // text-only status/thought
            return (
              <button
                key={h.id}
                onClick={() => navigate(h.route)}
                className="flex items-center gap-3 text-left rounded-xl px-2 py-2 hover:bg-white/5 transition"
                aria-label="Open post"
              >
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-500 ring-2 ring-neutral-800" />
                <div className="min-w-0">
                  <div className="text-[12px] text-neutral-400">
                    {h.mood ? `Feeling ${h.mood}` : "Status"}
                  </div>
                  <div className="text-sm text-neutral-100 truncate max-w-[210px]">{h.text_preview ?? "View post"}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lightbox */}
      {lightOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-3 sm:p-6">
          <button
            className="absolute top-[env(safe-area-inset-top,0)+1rem] right-[env(safe-area-inset-right,0)+1rem] text-white p-3 rounded-full bg-white/10 backdrop-blur"
            onClick={close} aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          <button className="absolute left-2 sm:left-4 text-white p-3 rounded-full bg-white/10 backdrop-blur" onClick={prev} aria-label="Previous">
            <ChevronLeft className="h-7 w-7" />
          </button>

          <img
            src={getImageUrl(imageItems[lightIdx!].kind, imageItems[lightIdx!].image_path!)}
            alt=""
            className="max-h:[80vh] sm:max-h-[85vh] max-w-[92vw] object-contain rounded-xl shadow-2xl"
            onClick={next}
          />

          <button className="absolute right-2 sm:right-4 text-white p-3 rounded-full bg-white/10 backdrop-blur" onClick={next} aria-label="Next">
            <ChevronRight className="h-7 w-7" />
          </button>
        </div>
      )}
    </aside>
  );
}
