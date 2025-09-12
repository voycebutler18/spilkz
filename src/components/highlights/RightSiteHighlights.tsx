// src/components/highlights/RightSiteHighlights.tsx
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, Heart, Trash2 } from "lucide-react";

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

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type LocalItem = Highlight & { post_id?: string | null; owner_id?: string | null };

const BUCKET_FOR_KIND: Record<string, string> = {
  thought_image: "thoughts-images",
  food_image: "food-images",
};

const publicUrl = (bucket: string, path: string) =>
  supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

export default function RightSiteHighlights({
  includeKinds = ["thought_post", "thought_image"],
  limit = 120,
}: {
  includeKinds?: Highlight["kind"][];
  limit?: number;
}) {
  const navigate = useNavigate();

  const [items, setItems] = React.useState<LocalItem[]>([]);
  const [profiles, setProfiles] = React.useState<Record<string, Profile>>({});
  const [user, setUser] = React.useState<any>(null);

  // lightbox
  const [lightIdx, setLightIdx] = React.useState<number | null>(null);
  const images = React.useMemo(
    () => items.filter((i) => i.image_path && i.kind.endsWith("_image")),
    [items]
  );
  const isOpen = lightIdx !== null;
  const current = lightIdx !== null ? images[lightIdx] : null;

  // hype
  const [hypeCounts, setHypeCounts] = React.useState<Record<string, number>>({});
  const [myHypeId, setMyHypeId] = React.useState<Record<string, string | null>>({});

  // auth
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);

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
      await hydrate((data as Highlight[]) ?? []);
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

      // map photo -> post.owner (user_id)
      const photoPostIds = Array.from(new Set((photos ?? []).map((p: any) => p.post_id)));
      let ownerByPost: Record<string, string | null> = {};
      if (photoPostIds.length) {
        const { data: photoPosts } = await supabase
          .from("thoughts_posts")
          .select("id, user_id")
          .in("id", photoPostIds);
        (photoPosts ?? []).forEach((pp: any) => {
          ownerByPost[pp.id] = pp.user_id ?? null;
        });
      }

      // recent text posts
      const { data: posts } = await supabase
        .from("thoughts_posts")
        .select("id, user_id, text_content, mood, created_at")
        .gt("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(limit);

      const photoItems: LocalItem[] = (photos ?? []).map((p: any) => ({
        id: p.id,
        user_id: null, // use owner_id below for images
        kind: "thought_image",
        route: `/thoughts/photos/${p.id}`,
        ref_table: "thoughts_images",
        ref_id: p.id,
        image_path: p.path,
        text_preview: null,
        mood: null,
        created_at: p.created_at,
        expires_at: new Date(Date.parse(p.created_at) + 86400000).toISOString(),
        post_id: p.post_id,
        owner_id: ownerByPost[p.post_id] ?? null, // ✅ ensure creator on photos
      }));

      const postItems: LocalItem[] = (posts ?? [])
        .filter((t: any) => (t.text_content ?? "").trim().length > 0)
        .map((t: any) => ({
          id: t.id,
          user_id: t.user_id,
          kind: "thought_post",
          route: `/thoughts`,
          ref_table: "thoughts_posts",
          ref_id: t.id,
          image_path: null,
          text_preview: (t.text_content ?? "").slice(0, 160),
          mood: t.mood ?? null,
          created_at: t.created_at,
          expires_at: new Date(Date.parse(t.created_at) + 86400000).toISOString(),
          post_id: t.id,
          owner_id: t.user_id,
        }));

      await hydrate(
        [...photoItems, ...postItems]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, limit)
      );
    };

    (async () => {
      try {
        await loadFromHighlights();
      } catch {
        await fallbackFromThoughts();
      }
    })();

    // 🔁 realtime refresh for both highlight and fallback sources
    const channel = supabase
      .channel("rail_highlights")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "site_highlights" },
        () => {
          (async () => {
            try {
              await loadFromHighlights();
            } catch {
              await fallbackFromThoughts();
            }
          })();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "thoughts_images" },
        () => {
          (async () => {
            try {
              await loadFromHighlights();
            } catch {
              await fallbackFromThoughts();
            }
          })();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "thoughts_posts" },
        () => {
          (async () => {
            try {
              await loadFromHighlights();
            } catch {
              await fallbackFromThoughts();
            }
          })();
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [includeKinds, limit]);

  async function hydrate(raw: Highlight[]) {
    // base items
    let locals: LocalItem[] = raw.map((r) => ({ ...r }));
    setItems(locals);

    // for image items, map to post + owner
    const imageIds = locals
      .filter((i) => i.kind.endsWith("_image"))
      .map((i) => i.ref_id);
    let postMap: Record<string, { post_id: string; owner_id: string | null }> = {};
    if (imageIds.length) {
      const { data: imgRows } = await supabase
        .from("thoughts_images")
        .select("id, post_id")
        .in("id", imageIds);
      const postIds = (imgRows ?? []).map((r) => r.post_id);
      const { data: posts } = await supabase
        .from("thoughts_posts")
        .select("id, user_id")
        .in("id", postIds);
      const ownerByPost: Record<string, string | null> = {};
      (posts ?? []).forEach((p) => (ownerByPost[p.id] = p.user_id));
      (imgRows ?? []).forEach(
        (r) => (postMap[r.id] = { post_id: r.post_id, owner_id: ownerByPost[r.post_id] ?? null })
      );
    }

    // ensure owner_id exists on images (fallback to user_id if present)
    locals = locals.map((i) =>
      i.kind.endsWith("_image")
        ? {
            ...i,
            post_id: postMap[i.ref_id]?.post_id,
            owner_id: postMap[i.ref_id]?.owner_id ?? i.user_id ?? null,
          }
        : i
    );

    // gather owner profiles
    const userIds = Array.from(
      new Set(locals.map((i) => i.owner_id || i.user_id).filter(Boolean) as string[])
    );
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", userIds);
      const map: Record<string, Profile> = {};
      (profs ?? []).forEach((p) => (map[p.id] = p as Profile));
      setProfiles(map);
    }

    setItems(locals);

    // hydrate hype counts
    const postIds = Array.from(new Set(locals.map((i) => i.post_id).filter(Boolean) as string[]));
    if (postIds.length) {
      const { data: reacts } = await supabase
        .from("thoughts_reactions")
        .select("id, post_id, user_id, type")
        .in("post_id", postIds);

      const counts: Record<string, number> = {};
      const mine: Record<string, string | null> = {};

      (reacts ?? []).forEach((r: any) => {
        if (r.type === "like") counts[r.post_id] = (counts[r.post_id] || 0) + 1;
        if (user?.id && r.user_id === user.id && r.type === "like") mine[r.post_id] = r.id;
      });

      setHypeCounts(counts);
      setMyHypeId(mine);
    }
  }

  // open / close / nav
  const openAtId = (id: string) => {
    const idx = images.findIndex((i) => i.id === id);
    if (idx >= 0) setLightIdx(idx);
  };
  const close = () => setLightIdx(null);
  const prev = () =>
    setLightIdx((i) => (i === null ? i : (i + images.length - 1) % images.length));
  const next = () =>
    setLightIdx((i) => (i === null ? i : (i + 1) % images.length));

  // HYPE toggle
  async function toggleHype(postId?: string | null) {
    if (!postId || !user?.id) {
      alert("Please sign in to hype.");
      return;
    }
    const mine = myHypeId[postId];
    if (mine) {
      await supabase.from("thoughts_reactions").delete().eq("id", mine);
      setMyHypeId((prev) => ({ ...prev, [postId]: null }));
      setHypeCounts((prev) => ({
        ...prev,
        [postId]: Math.max(0, (prev[postId] || 1) - 1),
      }));
    } else {
      const { data } = await supabase
        .from("thoughts_reactions")
        .insert({ post_id: postId, user_id: user.id, type: "like" })
        .select("id")
        .single();
      if (data) {
        setMyHypeId((prev) => ({ ...prev, [postId]: data.id }));
        setHypeCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
      }
    }
  }

  // ✅ unified delete helper (used by rail thumbnail + lightbox)
  async function deletePhotoById(imageId: string, ownerId?: string | null) {
    if (!user?.id) return;
    if (ownerId && ownerId !== user.id) return;

    const { data: img } = await supabase
      .from("thoughts_images")
      .select("id, path")
      .eq("id", imageId)
      .single();
    if (!img) return;

    await supabase
      .storage
      .from(BUCKET_FOR_KIND["thought_image"] ?? "thoughts-images")
      .remove([img.path]);

    await supabase.from("thoughts_images").delete().eq("id", imageId);
    await supabase.from("site_highlights").delete().match({ ref_table: "thoughts_images", ref_id: imageId });

    // update UI
    setItems((prev) => prev.filter((i) => !(i.kind === "thought_image" && i.id === imageId)));
    setLightIdx(null);
  }

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

          {items.map((h) => {
            const isImage = !!h.image_path && h.kind.endsWith("_image");
            const owner = h.owner_id || h.user_id || null;
            const prof = owner ? profiles[owner] : undefined;
            const name = prof?.username || prof?.display_name || "User";
            const avatar = prof?.avatar_url || "";

            if (isImage) {
              const src = publicUrl(BUCKET_FOR_KIND[h.kind] ?? "thoughts-images", h.image_path!);
              const isOwner = owner === user?.id;

              return (
                <div key={h.id} className="flex items-center gap-3">
                  <div className="relative">
                    <button
                      onClick={() => openAtId(h.id)}
                      className="group"
                      aria-label="Open photo"
                      title={name}
                    >
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        className="h-14 w-14 rounded-full object-cover ring-2 ring-neutral-800 group-hover:ring-indigo-500/60 transition"
                      />
                    </button>

                    {isOwner && (
                      <button
                        className="absolute -top-1 -right-1 p-1.5 rounded-full bg-black/70 text-white hover:bg-black/85"
                        title="Delete"
                        aria-label="Delete photo"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePhotoById(h.id, owner);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex-1 border-b border-neutral-800/70" />
                </div>
              );
            }

            // status item
            return (
              <button
                key={h.id}
                onClick={() => navigate(h.route)}
                className="flex items-center gap-3 text-left rounded-xl px-2 py-2 hover:bg-white/5 transition"
                aria-label="Open post"
              >
                <div className="h-10 w-10 rounded-full overflow-hidden bg-gradient-to-br from-fuchsia-500 to-indigo-500 ring-2 ring-neutral-800">
                  {avatar ? (
                    <img src={avatar} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
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
      {isOpen && current && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-3 sm:p-6"
          onClick={close}
        >
          {/* top bar with creator */}
          <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex items-center gap-3">
            <button
              className="h-10 w-10 rounded-full overflow-hidden ring-2 ring-white/20"
              onClick={(e) => {
                e.stopPropagation();
                if (current.owner_id)
                  navigate(
                    `/creator/${profiles[current.owner_id]?.username || current.owner_id}`
                  );
              }}
            >
              {current.owner_id && profiles[current.owner_id]?.avatar_url ? (
                <img
                  src={profiles[current.owner_id]!.avatar_url!}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-white/20" />
              )}
            </button>
            <button
              className="text-white/90 font-medium hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                if (current.owner_id)
                  navigate(
                    `/creator/${profiles[current.owner_id]?.username || current.owner_id}`
                  );
              }}
            >
              {current.owner_id
                ? profiles[current.owner_id]?.username ||
                  profiles[current.owner_id]?.display_name ||
                  "User"
                : "User"}
            </button>
          </div>

          <button
            className="absolute top-3 right-3 sm:top-4 sm:right-4 text-white p-3 rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          {current.owner_id === user?.id && current.kind === "thought_image" && (
            <button
              className="absolute top-3 right-16 sm:top-4 sm:right-20 text-white p-3 rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                deletePhotoById(current.id, current.owner_id);
              }}
              title="Delete photo"
              aria-label="Delete photo"
            >
              <Trash2 className="h-6 w-6" />
            </button>
          )}

          {/* nav */}
          <button
            className="absolute left-2 sm:left-4 text-white p-3 rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="Previous"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>

          <img
            src={publicUrl(
              BUCKET_FOR_KIND[current.kind] ?? "thoughts-images",
              current.image_path!
            )}
            alt=""
            className="max-h-[85vh] max-w-[92vw] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          <button
            className="absolute right-2 sm:right-4 text-white p-3 rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="Next"
          >
            <ChevronRight className="h-7 w-7" />
          </button>

          {/* Hype control */}
          <div className="absolute bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/10 backdrop-blur rounded-full px-4 py-2">
            <button
              className={`flex items-center gap-2 px-2 py-1 rounded-lg ${
                myHypeId[current.post_id || ""] ? "text-pink-300" : "text-white/90"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                toggleHype(current.post_id);
              }}
            >
              <Heart
                className={`h-5 w-5 ${
                  myHypeId[current.post_id || ""] ? "fill-current" : ""
                }`}
              />
              <span className="text-sm">Hype</span>
            </button>
            <span className="text-white/90 text-sm">
              {hypeCounts[current.post_id || ""] || 0}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
