// src/pages/ThoughtsFeed.tsx
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Image as ImageIcon, Smile, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Optional auth hook. If absent, we fallback to undefined user.
let useAuth: any;
try { ({ useAuth } = require("@/hooks/useAuth")); } catch { useAuth = () => ({ user: undefined }); }

/* --------- shadcn fallbacks so this file just runs ---------- */
let Button:any, Card:any, Badge:any, Select:any, SelectTrigger:any, SelectContent:any, SelectItem:any, SelectValue:any, Textarea:any;
try {
  ({ Button } = require("@/components/ui/button"));
  ({ Card } = require("@/components/ui/card"));
  ({ Badge } = require("@/components/ui/badge"));
  ({ Select, SelectTrigger, SelectContent, SelectItem, SelectValue } = require("@/components/ui/select"));
  ({ Textarea } = require("@/components/ui/textarea"));
} catch {
  Button = ({ className="", ...p }: any) => <button className={`px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50 ${className}`} {...p} />;
  Card = ({ className="", ...p }: any) => <div className={`rounded-2xl border border-zinc-200 bg-white shadow-sm ${className}`} {...p} />;
  Badge = ({ className="", ...p }: any) => <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-zinc-100 ${className}`} {...p} />;
  const Base = (Tag:any) => ({ className="", ...p }: any) => <Tag className={`w-full border rounded-xl px-4 py-3 ${className}`} {...p} />;
  Textarea = Base("textarea");
  Select = ({ value, onValueChange, children }: any) => <div data-value={value}>{children(onValueChange)}</div>;
  SelectTrigger = ({ className="", children, ...p }: any) => <div className={`w-full border rounded-xl px-4 py-3 cursor-pointer ${className}`} {...p}>{children}</div>;
  SelectContent = ({ children }: any) => <div className="mt-2 border rounded-xl bg-white shadow-lg">{children}</div>;
  SelectItem = ({ value, onClick, children }: any) => <div className="px-4 py-2.5 hover:bg-zinc-50 cursor-pointer" onClick={() => onClick?.(value)}>{children}</div>;
  SelectValue = ({ placeholder }: any) => <span className="text-zinc-500">{placeholder}</span>;
}
/* ------------------------------------------------------------ */

type Mood =
  | "Happy" | "Grateful" | "Blessed" | "Chill" | "Focused" | "Motivated"
  | "Tired" | "Anxious" | "Frustrated" | "Excited" | "Proud" | "Loved";

const MOODS: Mood[] = [
  "Happy","Grateful","Blessed","Chill","Focused","Motivated",
  "Tired","Anxious","Frustrated","Excited","Proud","Loved"
];

type DBPost = {
  id: string;
  user_id: string | null;
  text_content: string;
  mood: Mood | null;
  created_at: string;
};

type DBImage = { id: string; post_id: string; path: string; created_at: string };

const BUCKET = "thoughts-images";
const PAGE_SIZE = 20;

export default function ThoughtsFeed() {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);

  // feed state
  const [posts, setPosts] = useState<DBPost[]>([]);
  const [imagesByPost, setImagesByPost] = useState<Record<string, string[]>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // aggregated photos for the rail + lightbox
  const allPhotos = useMemo(() => {
    const list: { src: string; postId: string }[] = [];
    for (const p of posts) {
      const imgs = imagesByPost[p.id] || [];
      imgs.forEach(src => list.push({ src, postId: p.id }));
    }
    return list;
  }, [posts, imagesByPost]);

  // initial load
  useEffect(() => {
    (async () => {
      await loadPage(null);
      setInitialLoading(false);
    })();
  }, []);

  // infinite scroll
  useEffect(() => {
    const el = moreRef.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore && cursor) {
        loadPage(cursor);
      }
    }, { rootMargin: "800px 0px 800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadingMore]);

  async function loadPage(after: string | null) {
    setLoadingMore(true);
    // get posts page
    let query = supabase
      .from("thoughts_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    // keyset pagination using created_at
    if (after) {
      query = query.lt("created_at", after);
    }

    const { data: page, error } = await query;
    if (error) { console.error(error); setLoadingMore(false); return; }
    if (!page || page.length === 0) { setCursor(null); setLoadingMore(false); return; }

    // merge
    setPosts(prev => [...prev, ...page as DBPost[]]);

    // next cursor
    const last = page[page.length - 1] as DBPost;
    setCursor(last.created_at);

    // fetch images for these posts
    const postIds = (page as DBPost[]).map(p => p.id);
    const { data: imgs, error: imgErr } = await supabase
      .from("thoughts_images")
      .select("*")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (imgErr) { console.error(imgErr); setLoadingMore(false); return; }

    // map to public URLs
    const byPost: Record<string, string[]> = {};
    (imgs as DBImage[]).forEach(img => {
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(img.path);
      const url = pub?.publicUrl ?? "";
      if (!byPost[img.post_id]) byPost[img.post_id] = [];
      byPost[img.post_id].push(url);
    });

    setImagesByPost(prev => {
      const merged = { ...prev };
      for (const id of postIds) {
        merged[id] = [...(prev[id] || []), ...(byPost[id] || [])];
      }
      return merged;
    });

    setLoadingMore(false);
  }

  function onPickFiles(list: FileList | null) {
    if (!list) return;
    setFiles(prev => [...prev, ...Array.from(list)]);
  }
  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function createPost() {
    if (!text.trim() && files.length === 0) return;
    setPosting(true);

    // 1) insert post
    const { data: post, error: postErr } = await supabase
      .from("thoughts_posts")
      .insert({
        user_id: user?.id ?? null,
        text_content: text.trim(),
        mood: mood ?? null
      })
      .select("*")
      .single();

    if (postErr || !post) { console.error(postErr); setPosting(false); return; }

    // 2) upload files (if any)
    const uploadedPaths: string[] = [];
    for (const f of files) {
      const ext = f.name.split(".").pop() || "jpg";
      const key = `${post.user_id ?? "anon"}/${post.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, f, { upsert: false });
      if (!upErr) uploadedPaths.push(key);
    }

    // 3) create image rows
    if (uploadedPaths.length > 0) {
      const rows = uploadedPaths.map(p => ({ post_id: post.id, path: p }));
      const { error: imgErr } = await supabase.from("thoughts_images").insert(rows);
      if (imgErr) console.error(imgErr);
    }

    // 4) optimistic add to UI (top)
    const newPost: DBPost = post as DBPost;
    setPosts(prev => [newPost, ...prev]);

    if (uploadedPaths.length > 0) {
      const urls = uploadedPaths.map(p => supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl);
      setImagesByPost(prev => ({ ...prev, [newPost.id]: urls }));
    } else {
      setImagesByPost(prev => ({ ...prev, [newPost.id]: [] }));
    }

    // reset composer
    setText("");
    setMood(null);
    setFiles([]);
    setPosting(false);
  }

  // Lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxOpen = lightboxIndex !== null;
  const openLightboxFor = (src: string) => {
    const idx = allPhotos.findIndex(p => p.src === src);
    if (idx >= 0) setLightboxIndex(idx);
  };
  const closeLightbox = () => setLightboxIndex(null);
  const prevPhoto = () => setLightboxIndex(i => (i === null ? i : (i + allPhotos.length - 1) % allPhotos.length));
  const nextPhoto = () => setLightboxIndex(i => (i === null ? i : (i + 1) % allPhotos.length));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!lightboxOpen) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") prevPhoto();
      if (e.key === "ArrowRight") nextPhoto();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  useLightboxSwipe(lightboxOpen, prevPhoto, nextPhoto, closeLightbox);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-[110rem] px-3 sm:px-4 md:px-6 py-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 md:gap-6">

        {/* MAIN */}
        <div className="space-y-4 md:space-y-5">
          {/* Composer */}
          <Card className="p-3 sm:p-4 md:p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Smile className="h-4 w-4 text-zinc-500" />
                  <MoodSelect value={mood} onChange={setMood} />
                </div>

                <Textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Share your thoughts…"
                  rows={4}
                  className="resize-y focus:ring-2 focus:ring-indigo-500 text-base md:text-[15px]"
                />

                {/* files preview */}
                {files.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {files.map((f, i) => {
                      const url = URL.createObjectURL(f);
                      return (
                        <div key={i} className="relative group">
                          <img src={url} alt="" className="h-24 w-full object-cover rounded-lg" />
                          <button
                            className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                            onClick={() => removeFile(i)}
                            aria-label="Remove image"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="file" accept="image/*" multiple className="hidden" onChange={e => onPickFiles(e.target.files)} />
                    <span className="inline-flex items-center gap-2 text-indigo-600 hover:underline">
                      <ImageIcon className="h-5 w-5" />
                      <span className="text-sm sm:text-base">Add photo(s)</span>
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    {mood && <Badge className="bg-indigo-50 text-indigo-700">{mood}</Badge>}
                    <Button onClick={createPost} disabled={posting || (!text.trim() && files.length === 0)} className="rounded-xl">
                      {posting ? "Posting…" : "Post"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* FEED */}
          <div className="space-y-3 md:space-y-4">
            {posts.map(p => (
              <Card key={p.id} className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-rose-500 to-orange-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] sm:text-sm text-zinc-500">
                      <span className="font-medium text-zinc-900">User</span>
                      <span>· {timeAgo(new Date(p.created_at).getTime())}</span>
                      {p.mood && <Badge className="bg-zinc-100 text-zinc-700">{p.mood}</Badge>}
                    </div>
                    {p.text_content && <p className="mt-2 text-zinc-900 whitespace-pre-wrap text-[15px] sm:text-base">{p.text_content}</p>}
                    {(imagesByPost[p.id]?.length ?? 0) > 0 && (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-2">
                        {imagesByPost[p.id].map((src, i) => (
                          <button key={i} className="relative group" onClick={() => openLightboxFor(src)} aria-label="Open photo">
                            <img src={src} alt="" className="rounded-xl object-cover w-full h-40 sm:h-48" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}

            {/* loader & sentinel */}
            <div ref={moreRef} />
            {initialLoading && <Card className="p-6 text-center text-zinc-500">Loading…</Card>}
            {!initialLoading && posts.length === 0 && (
              <Card className="p-6 text-center text-zinc-500">Your new thoughts feed is empty. Share something to get it started.</Card>
            )}
            {loadingMore && <Card className="p-4 text-center text-zinc-500">Loading more…</Card>}
          </div>

          {/* MOBILE PHOTO CAROUSEL */}
          <Card className="p-3 sm:p-4 lg:hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-700">Latest Photos</h3>
              <span className="text-xs text-zinc-400">{allPhotos.length}</span>
            </div>
            <div className="mt-3 -mx-1 overflow-x-auto no-scrollbar">
              <div className="px-1 flex gap-2">
                {[...allPhotos].reverse().slice(0, 120).map((p, i) => (
                  <button key={i} onClick={() => openLightboxFor(p.src)} className="shrink-0" aria-label={`Open photo ${i+1}`}>
                    <img src={p.src} alt="" className="h-24 w-24 sm:h-28 sm:w-28 object-cover rounded-xl" />
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT PHOTO RAIL (lg+) */}
        <aside className="hidden lg:block sticky top-4 h-[calc(100vh-2rem)] overflow-auto">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-700">Latest Photos</h3>
              <span className="text-xs text-zinc-400">{allPhotos.length}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {allPhotos.length === 0 && (
                <p className="col-span-3 text-sm text-zinc-500">Photos you post here will appear on the right.</p>
              )}
              {[...allPhotos].reverse().slice(0, 120).map((p, i) => (
                <button key={i} onClick={() => openLightboxFor(p.src)} className="focus:outline-none">
                  <img src={p.src} alt="" className="h-24 w-full object-cover rounded-lg" />
                </button>
              ))}
            </div>
          </Card>
        </aside>
      </div>

      {/* LIGHTBOX */}
      {lightboxOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-3 sm:p-6" aria-modal="true" role="dialog">
          <button
            className="absolute top-[env(safe-area-inset-top,0)+1rem] right-[env(safe-area-inset-right,0)+1rem] text-white p-3 rounded-full bg-white/10 backdrop-blur"
            onClick={closeLightbox}
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          <button className="absolute left-2 sm:left-4 text-white p-3 rounded-full bg-white/10 backdrop-blur" onClick={prevPhoto} aria-label="Previous">
            <ChevronLeft className="h-7 w-7" />
          </button>

          <img
            src={allPhotos[lightboxIndex!].src}
            alt=""
            className="max-h:[80vh] sm:max-h-[85vh] max-w-[92vw] object-contain rounded-xl shadow-2xl"
            onClick={nextPhoto}
          />

          <button className="absolute right-2 sm:right-4 text-white p-3 rounded-full bg-white/10 backdrop-blur" onClick={nextPhoto} aria-label="Next">
            <ChevronRight className="h-7 w-7" />
          </button>
        </div>
      )}
    </div>
  );
}

function MoodSelect({ value, onChange }: { value: Mood | null; onChange: (m: Mood | null) => void }) {
  const [open, setOpen] = useState(false as boolean);
  return (
    <div className="relative w-full xs:w-56 sm:w-64">
      {Select && (
        <Select value={value ?? ""} onValueChange={(v: Mood) => onChange(v)}>
          {(onValueChange: any) => (
            <>
              <SelectTrigger onClick={() => setOpen(v => !v)}>
                <SelectValue placeholder={value ?? "Choose mood (optional)"} />
              </SelectTrigger>
              {open && (
                <SelectContent>
                  {MOODS.map(m => (
                    <SelectItem key={m} value={m} onClick={(v: Mood) => { onValueChange?.(v); onChange(v); setOpen(false); }}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              )}
            </>
          )}
        </Select>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */
function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/** swipe gestures for lightbox */
function useLightboxSwipe(enabled: boolean, onPrev: () => void, onNext: () => void, onClose: () => void) {
  useEffect(() => {
    if (!enabled) return;
    let startX = 0, startY = 0, dx = 0, dy = 0, touching = false;
    const onTouchStart = (e: TouchEvent) => { touching = true; startX = e.touches[0].clientX; startY = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => { if (!touching) return; dx = e.touches[0].clientX - startX; dy = e.touches[0].clientY - startY; };
    const onTouchEnd = () => {
      if (!touching) return; touching = false;
      const absX = Math.abs(dx), absY = Math.abs(dy);
      if (absX > 40 && absX > absY) { dx > 0 ? onPrev() : onNext(); }
      else if (absY < 10 && absX < 10) { onClose(); }
      startX = startY = dx = dy = 0;
    };
    const root = document.documentElement;
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: true });
    root.addEventListener("touchend", onTouchEnd);
    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, onPrev, onNext, onClose]);
}
