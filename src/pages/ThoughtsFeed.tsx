// src/components/highlights/RightSiteHighlights.tsx
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

type Highlight = {
  id: string;
  user_id: string | null;
  kind: "thought_post" | "thought_image" | "food_post" | "food_image" | "other";
  route: string;
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
  food_image: "food-images",
};

function publicUrl(bucket: string, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export default function RightSiteHighlights({
  includeKinds = ["thought_post", "thought_image"],
  limit = 120,
}: {
  includeKinds?: Highlight["kind"][];
  limit?: number;
}) {
  const navigate = useNavigate();
  const [items, setItems] = React.useState<Highlight[]>([]);
  const [lightIdx, setLightIdx] = React.useState<number | null>(null);

  const images = React.useMemo(
    () => items.filter(i => i.image_path && i.kind.endsWith("_image")),
    [items]
  );

  React.useEffect(() => {
    let alive = true;

    const loadFromHighlights = async () => {
      const { data, error } = await supabase
        .from("site_highlights_active")
        .select("*")
        .in("kind", includeKinds as any)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      if (!alive) return;
      setItems((data as Highlight[]) ?? []);
    };

    const fallbackFromThoughts = async () => {
      const sinceISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // recent photos
      const { data: photos } = await supabase
        .from("thoughts_images")
        .select("id, post_id, path, created_at")
        .gt("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(limit);

      // recent posts (text)
      const { data: posts } = await supabase
        .from("thoughts_posts")
        .select("id, text_content, mood, created_at")
        .gt("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(limit);

      const photoItems: Highlight[] =
        (photos ?? []).map((p: any) => ({
          id: p.id,
          user_id: null,
          kind: "thought_image",
          route: `/thoughts/photos/${p.id}`,
          ref_table: "thoughts_images",
          ref_id: p.id,
          image_path: p.path,
          text_preview: null,
          mood: null,
          created_at: p.created_at,
          expires_at: new Date(Date.parse(p.created_at) + 24 * 60 * 60 * 1000).toISOString(),
        }));

      const postItems: Highlight[] =
        (posts ?? [])
          .filter((t: any) => (t.text_content ?? "").trim().length > 0)
          .map((t: any) => ({
            id: t.id,
            user_id: null,
            kind: "thought_post",
            route: `/thoughts`,
            ref_table: "thoughts_posts",
            ref_id: t.id,
            image_path: null,
            text_preview: (t.text_content ?? "").slice(0, 160),
            mood: t.mood ?? null,
            created_at: t.created_at,
            expires_at: new Date(Date.parse(t.created_at) + 24 * 60 * 60 * 1000).toISOString(),
          }));

      if (!alive) return;
      setItems([...photoItems, ...postItems].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit));
    };

    (async () => {
      try {
        await loadFromHighlights();
      } catch {
        // table/view not ready — use fallback
        await fallbackFromThoughts();
      }
    })();

    const channel = supabase
      .channel("rail_highlights")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_highlights" }, () => {
        // refresh quietly
        (async () => {
          try { await loadFromHighlights(); } catch { await fallbackFromThoughts(); }
        })();
      })
      .subscribe();

    return () => { alive = false; supabase.removeChannel(channel); };
  }, [includeKinds, limit]);

  const openAtId = (id: string) => {
    const idx = images.findIndex(i => i.id === id);
    if (idx >= 0) setLightIdx(idx);
  };
  const close = () => setLightIdx(null);
  const prev  = () => setLightIdx(i => (i === null ? i : (i + images.length - 1) % images.length));
  const next  = () => setLightIdx(i => (i === null ? i : (i + 1) % images.length));

  return (
    <>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-200">Latest</h3>
          <span className="text-xs text-neutral-500">{items.length}</span>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {items.length === 0 && (
            <p className="text-sm text-neutral-400">
              New photos & status posts will appear here for 24 hours.
            </p>
          )}

          {items.map(h => {
            const isImage = !!h.image_path && h.kind.endsWith("_image");
            if (isImage) {
              const src = publicUrl(BUCKET_FOR_KIND[h.kind] ?? "thoughts-images", h.image_path!);
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
                  <div className="text-sm text-neutral-100 truncate max-w-[210px]">
                    {h.text_preview ?? "View post"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lightbox for image items */}
      {lightIdx !== null && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-3 sm:p-6">
          <button className="absolute top-4 right-4 text-white p-3 rounded-full bg-white/10 backdrop-blur" onClick={close} aria-label="Close">
            <X className="h-6 w-6" />
          </button>

          <button className="absolute left-2 sm:left-4 text-white p-3 rounded-full bg-white/10 backdrop-blur" onClick={prev} aria-label="Previous">
            <ChevronLeft className="h-7 w-7" />
          </button>

          <img
            src={publicUrl(BUCKET_FOR_KIND[images[lightIdx].kind] ?? "thoughts-images", images[lightIdx].image_path!)}
            alt=""
            className="max-h:[80vh] sm:max-h-[85vh] max-w-[92vw] object-contain rounded-xl shadow-2xl"
            onClick={next}
          />

          <button className="absolute right-2 sm:right-4 text-white p-3 rounded-full bg-white/10 backdrop-blur" onClick={next} aria-label="Next">
            <ChevronRight className="h-7 w-7" />
          </button>
        </div>
      )}
    </>
  );
}
