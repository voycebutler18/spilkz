// src/pages/ThoughtsFeed.tsx
import * as React from "react";
import { useState, useMemo, useEffect } from "react";
import { X, Image as ImageIcon, Smile, ChevronLeft, ChevronRight } from "lucide-react";

/* -------- optional shadcn fallbacks so this file just works -------- */
let Button:any, Card:any, Badge:any, Select:any, SelectTrigger:any, SelectContent:any, SelectItem:any, SelectValue:any, Input:any, Textarea:any;
try {
  ({ Button } = require("@/components/ui/button"));
  ({ Card } = require("@/components/ui/card"));
  ({ Badge } = require("@/components/ui/badge"));
  ({ Select, SelectTrigger, SelectContent, SelectItem, SelectValue } = require("@/components/ui/select"));
  ({ Input } = require("@/components/ui/input"));
  ({ Textarea } = require("@/components/ui/textarea"));
} catch {
  Button = ({ className="", ...p }: any) => <button className={`px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50 ${className}`} {...p} />;
  Card = ({ className="", ...p }: any) => <div className={`rounded-2xl border border-zinc-200 bg-white shadow-sm ${className}`} {...p} />;
  Badge = ({ className="", ...p }: any) => <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-zinc-100 ${className}`} {...p} />;
  const Base = (Tag:any) => ({ className="", ...p }: any) => <Tag className={`w-full border rounded-xl px-4 py-3 ${className}`} {...p} />;
  Input = Base("input"); Textarea = Base("textarea");
  Select = ({ value, onValueChange, children }: any) => <div data-value={value}>{children(onValueChange)}</div>;
  SelectTrigger = ({ className="", children, ...p }: any) => <div className={`w-full border rounded-xl px-4 py-3 cursor-pointer ${className}`} {...p}>{children}</div>;
  SelectContent = ({ children }: any) => <div className="mt-2 border rounded-xl bg-white shadow-lg">{children}</div>;
  SelectItem = ({ value, onClick, children }: any) => <div className="px-4 py-2.5 hover:bg-zinc-50 cursor-pointer" onClick={() => onClick?.(value)}>{children}</div>;
  SelectValue = ({ placeholder }: any) => <span className="text-zinc-500">{placeholder}</span>;
}
/* ------------------------------------------------------------------ */

type Mood =
  | "Happy" | "Grateful" | "Blessed" | "Chill" | "Focused" | "Motivated"
  | "Tired" | "Anxious" | "Frustrated" | "Excited" | "Proud" | "Loved";

const MOODS: Mood[] = [
  "Happy","Grateful","Blessed","Chill","Focused","Motivated",
  "Tired","Anxious","Frustrated","Excited","Proud","Loved"
];

type Post = {
  id: string;
  text: string;
  mood?: Mood | null;
  images: string[];
  createdAt: number;
};

export default function ThoughtsFeed() {
  const [text, setText] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectOpen, setSelectOpen] = useState(false);

  // photos aggregated from posts (this page only)
  const allPhotos = useMemo(
    () => posts.flatMap(p => p.images.map(src => ({ src, postId: p.id }))),
    [posts]
  );

  // lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxOpen = lightboxIndex !== null;

  // pick images (local object URLs for Step 1)
  const onPickImages = (files: FileList | null) => {
    if (!files) return;
    const urls = Array.from(files).map(f => URL.createObjectURL(f));
    setImages(prev => [...prev, ...urls]);
  };

  // create a post for this page only
  const createPost = () => {
    if (!text.trim() && images.length === 0) return;
    const newPost: Post = {
      id: crypto.randomUUID(),
      text: text.trim(),
      mood,
      images,
      createdAt: Date.now(),
    };
    setPosts(prev => [newPost, ...prev]);
    setText("");
    setMood(null);
    setImages([]);
  };

  // cleanup object URLs
  useEffect(() => {
    return () => {
      posts.forEach(p => p.images.forEach(u => URL.revokeObjectURL(u)));
      images.forEach(u => URL.revokeObjectURL(u));
    };
  }, [posts, images]);

  // open/close and nav
  const openLightboxFor = (src: string) => {
    const idx = allPhotos.findIndex(p => p.src === src);
    if (idx >= 0) setLightboxIndex(idx);
  };
  const closeLightbox = () => setLightboxIndex(null);
  const prevPhoto = () => setLightboxIndex(i => (i === null ? i : (i + allPhotos.length - 1) % allPhotos.length));
  const nextPhoto = () => setLightboxIndex(i => (i === null ? i : (i + 1) % allPhotos.length));

  // keyboard support
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

  // touch swipe for lightbox (mobile)
  useLightboxSwipe(lightboxOpen, prevPhoto, nextPhoto, closeLightbox);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* page container with responsive grid */}
      <div className="mx-auto max-w-[110rem] px-3 sm:px-4 md:px-6 py-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 md:gap-6">

        {/* MAIN COLUMN */}
        <div className="space-y-4 md:space-y-5">
          {/* composer */}
          <Card className="p-3 sm:p-4 md:p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Smile className="h-4 w-4 text-zinc-500" />
                  <div className="relative w-full xs:w-56 sm:w-64">
                    {Select ? (
                      <Select value={mood ?? ""} onValueChange={(v: Mood) => setMood(v)}>
                        {(onValueChange: any) => (
                          <>
                            <SelectTrigger onClick={() => setSelectOpen(v => !v)}>
                              <SelectValue placeholder={mood ?? "Choose mood (optional)"} />
                            </SelectTrigger>
                            {selectOpen && (
                              <SelectContent>
                                {MOODS.map(m => (
                                  <SelectItem key={m} value={m} onClick={(v: Mood) => { onValueChange?.(v); setMood(v); setSelectOpen(false); }}>
                                    {m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            )}
                          </>
                        )}
                      </Select>
                    ) : null}
                </div>
              </div>

                <Textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Share your thoughts…"
                  rows={4}
                  className="resize-y focus:ring-2 focus:ring-indigo-500 text-base md:text-[15px]"
                />

                {/* selected images preview */}
                {images.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {images.map((src, i) => (
                      <div key={i} className="relative group">
                        <img src={src} alt="" className="h-24 w-full object-cover rounded-lg" />
                        <button
                          className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                          onClick={() => setImages(prev => prev.filter(u => u !== src))}
                          aria-label="Remove image"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => onPickImages(e.target.files)}
                    />
                    <span className="inline-flex items-center gap-2 text-indigo-600 hover:underline">
                      <ImageIcon className="h-5 w-5" />
                      <span className="text-sm sm:text-base">Add photo(s)</span>
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    {mood && <Badge className="bg-indigo-50 text-indigo-700">{mood}</Badge>}
                    <Button onClick={createPost} disabled={!text.trim() && images.length === 0} className="rounded-xl">
                      Post
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* FEED */}
          <div className="space-y-3 md:space-y-4">
            {posts.map(post => (
              <Card key={post.id} className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-rose-500 to-orange-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] sm:text-sm text-zinc-500">
                      <span className="font-medium text-zinc-900">You</span>
                      <span>· {timeAgo(post.createdAt)}</span>
                      {post.mood && <Badge className="bg-zinc-100 text-zinc-700">{post.mood}</Badge>}
                    </div>
                    {post.text && <p className="mt-2 text-zinc-900 whitespace-pre-wrap text-[15px] sm:text-base">{post.text}</p>}
                    {post.images.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-2">
                        {post.images.map((src, i) => (
                          <button key={i} className="relative group" onClick={() => openLightboxFor(src)} aria-label="Open photo">
                            <img src={src} alt="" className="rounded-xl object-cover w-full h-40 sm:h-48" />
                            <span className="absolute inset-0 rounded-xl focus-visible:ring-4 ring-indigo-500/30" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
            {posts.length === 0 && (
              <Card className="p-6 text-center text-zinc-500">
                Your new thoughts feed is empty. Share something to get it started.
              </Card>
            )}
          </div>

          {/* MOBILE PHOTO CAROUSEL (visible < lg) */}
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

        {/* RIGHT PHOTO RAIL (desktop & large tablets) */}
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
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-3 sm:p-6"
          aria-modal="true"
          role="dialog"
        >
          <button
            className="absolute top-[env(safe-area-inset-top,0)+1rem] right-[env(safe-area-inset-right,0)+1rem] text-white p-3 rounded-full bg-white/10 backdrop-blur"
            onClick={closeLightbox}
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          <button
            className="absolute left-2 sm:left-4 text-white p-3 rounded-full bg-white/10 backdrop-blur"
            onClick={prevPhoto}
            aria-label="Previous"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>

          <img
            src={allPhotos[lightboxIndex!].src}
            alt=""
            className="max-h-[80vh] sm:max-h-[85vh] max-w-[92vw] object-contain rounded-xl shadow-2xl"
            onClick={nextPhoto}
          />

          <button
            className="absolute right-2 sm:right-4 text-white p-3 rounded-full bg-white/10 backdrop-blur"
            onClick={nextPhoto}
            aria-label="Next"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        </div>
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

/** adds swipe gestures for the lightbox on touch devices */
function useLightboxSwipe(
  enabled: boolean,
  onPrev: () => void,
  onNext: () => void,
  onClose: () => void
) {
  useEffect(() => {
    if (!enabled) return;
    let startX = 0, startY = 0, dx = 0, dy = 0, touching = false;

    const onTouchStart = (e: TouchEvent) => {
      touching = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!touching) return;
      dx = e.touches[0].clientX - startX;
      dy = e.touches[0].clientY - startY;
    };
    const onTouchEnd = () => {
      if (!touching) return;
      touching = false;
      const absX = Math.abs(dx), absY = Math.abs(dy);
      if (absX > 40 && absX > absY) {
        if (dx > 0) onPrev(); else onNext();
      } else if (absY < 10 && absX < 10) {
        onClose(); // tap to close
      }
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
