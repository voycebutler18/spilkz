// src/pages/ThoughtsFeed.tsx
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  X, Image, Smile, ChevronLeft, ChevronRight,
  Heart, Flag, Trash2, MessageCircle, Share, MoreHorizontal
} from "lucide-react";

/* Light UI shims if shadcn isn't available */
let Button: any, Card: any, Badge: any, Textarea: any, Input: any;
try {
  ({ Button } = require("@/components/ui/button"));
  ({ Card } = require("@/components/ui/card"));
  ({ Badge } = require("@/components/ui/badge"));
  ({ Textarea } = require("@/components/ui/textarea"));
  ({ Input } = require("@/components/ui/input"));
} catch {
  Button = ({ className = "", ...p }: any) => (
    <button className={`rounded-xl px-4 py-2 font-medium bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:opacity-90 disabled:opacity-50 ${className}`} {...p} />
  );
  Card = ({ className = "", ...p }: any) => (
    <div className={`rounded-2xl border border-neutral-800/60 bg-neutral-900/70 backdrop-blur-sm ${className}`} {...p} />
  );
  Badge = ({ className = "", ...p }: any) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs border border-purple-500/40 text-purple-300 bg-purple-500/10 ${className}`} {...p} />
  );
  const base = (Tag: any) => ({ className = "", ...p }: any) => (
    <Tag className={`w-full rounded-xl border border-neutral-700/60 bg-neutral-800/50 px-4 py-3 text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 ${className}`} {...p} />
  );
  Textarea = base("textarea");
  Input = base("input");
}

/* Types */
type Mood =
  | "Happy" | "Grateful" | "Blessed" | "Chill" | "Focused" | "Motivated"
  | "Tired" | "Anxious" | "Frustrated" | "Excited" | "Proud" | "Loved";

const MOODS: Mood[] = [
  "Happy","Grateful","Blessed","Chill","Focused","Motivated",
  "Tired","Anxious","Frustrated","Excited","Proud","Loved"
];

type DBPost = { id: string; user_id: string | null; text_content: string; mood: Mood | null; created_at: string; deleted_at: string | null; };
type DBImage = { id: string; post_id: string; path: string; created_at: string };
type DBReaction = { id: string; post_id: string; user_id: string | null; type: string };
type DBComment = { id: string; post_id: string; user_id: string | null; text: string; created_at: string; deleted_at: string | null; };

const BUCKET = "thoughts-images";
const PAGE_SIZE = 20;

export default function ThoughtsFeed() {
  const navigate = useNavigate();
  const { photoId } = useParams();
  const location = useLocation();

  // auth
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => mounted && setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // composer
  const [text, setText] = useState("");
  const [mood, setMood] = useState<Mood | "">("");
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);

  // feed
  const [posts, setPosts] = useState<DBPost[]>([]);
  const [imagesByPost, setImagesByPost] = useState<Record<string, { id: string; src: string }[]>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // reactions
  const [likesCount, setLikesCount] = useState<Record<string, number>>({});
  const [myLikeId, setMyLikeId] = useState<Record<string, string | null>>({});

  // photos for lightbox
  const allPhotos = useMemo(() => {
    const out: { id: string; src: string; postId: string }[] = [];
    for (const p of posts) (imagesByPost[p.id] || []).forEach(img => out.push({ id: img.id, src: img.src, postId: p.id }));
    return out;
  }, [posts, imagesByPost]);

  // lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxOpen = lightboxIndex !== null;

  // load page 1
  useEffect(() => { (async () => { await loadPage(null); setInitialLoading(false); })(); }, []);

  // infinite
  useEffect(() => {
    const el = moreRef.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore && cursor) loadPage(cursor);
    }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadingMore]);

  async function loadPage(after: string | null) {
    setLoadingMore(true);
    let q = supabase.from("thoughts_posts")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (after) q = q.lt("created_at", after);

    const { data: page, error } = await q;
    if (error) { console.error(error); setLoadingMore(false); return; }
    if (!page || page.length === 0) { setCursor(null); setLoadingMore(false); return; }

    const typed = page as DBPost[];
    setPosts(prev => [...prev, ...typed]);
    setCursor(typed[typed.length - 1].created_at);

    // images for these posts
    const ids = typed.map(p => p.id);
    const { data: imgs } = await supabase
      .from("thoughts_images").select("*").in("post_id", ids).order("created_at", { ascending: true });

    if (imgs) {
      const by: Record<string, { id: string; src: string }[]> = {};
      (imgs as DBImage[]).forEach(img => {
        const url = supabase.storage.from(BUCKET).getPublicUrl(img.path).data.publicUrl;
        (by[img.post_id] ||= []).push({ id: img.id, src: url });
      });
      setImagesByPost(prev => {
        const merged = { ...prev };
        for (const pid of Object.keys(by)) merged[pid] = [...(prev[pid] || []), ...by[pid]];
        return merged;
      });
    }

    // likes & mine
    const { data: reactions } = await supabase
      .from("thoughts_reactions")
      .select("id, post_id, user_id, type")
      .in("post_id", ids);
    const counts: Record<string, number> = {};
    const mine: Record<string, string | null> = {};
    (reactions as DBReaction[] | null)?.forEach(r => {
      if (r.type === "like") counts[r.post_id] = (counts[r.post_id] || 0) + 1;
      if (user?.id && r.user_id === user.id && r.type === "like") mine[r.post_id] = r.id;
    });
    setLikesCount(prev => ({ ...prev, ...counts }));
    setMyLikeId(prev => ({ ...prev, ...mine }));
    setLoadingMore(false);
  }

  function onPickFiles(list: FileList | null) {
    if (!list) return;
    const maxMB = 10, maxCount = 10;
    const chosen = Array.from(list).slice(0, maxCount - files.length)
      .filter(f => f.type.startsWith("image/") && f.size <= maxMB * 1024 * 1024);
    setFiles(prev => [...prev, ...chosen]);
  }
  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  async function createPost() {
    if (!user?.id) { alert("Please log in to post."); return; }
    if (!text.trim() && files.length === 0) return;
    setPosting(true);

    // 1) create post
    const { data: post, error: postErr } = await supabase
      .from("thoughts_posts")
      .insert({ user_id: user.id, text_content: text.trim(), mood: mood || null })
      .select("*").single();
    if (postErr || !post) { console.error(postErr); setPosting(false); return; }

    // 2) upload images (+ DB rows)
    const uploaded: { id: string; src: string; path: string }[] = [];
    for (const f of files) {
      const ext = f.name.split(".").pop() || "jpg";
      const key = `${post.user_id}/${post.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("thoughts-images").upload(key, f);
      if (upErr) continue;
      const { data: imgRow } = await supabase.from("thoughts_images").insert({ post_id: post.id, path: key }).select("*").single();
      if (imgRow) {
        const url = supabase.storage.from("thoughts-images").getPublicUrl(key).data.publicUrl;
        uploaded.push({ id: imgRow.id, src: url, path: key });
      }
    }

    // 3) optimistic feed update
    const typed = post as DBPost;
    setPosts(prev => [typed, ...prev]);
    setImagesByPost(prev => ({ ...prev, [typed.id]: uploaded.map(u => ({ id: u.id, src: u.src })) }));
    setLikesCount(prev => ({ ...prev, [typed.id]: 0 }));
    setMyLikeId(prev => ({ ...prev, [typed.id]: null }));

    // 4) push to 24h rail (best-effort)
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    try {
      if (typed.text_content?.trim()) {
        await supabase.from("site_highlights").insert({
          kind: "thought_post",
          route: `/thoughts`,
          ref_table: "thoughts_posts",
          ref_id: typed.id,
          image_path: null,
          text_preview: typed.text_content.slice(0, 160),
          mood: typed.mood,
          expires_at: expires,
        });
      }
      if (uploaded.length) {
        await supabase.from("site_highlights").insert(
          uploaded.map(u => ({
            kind: "thought_image",
            route: `/thoughts/photos/${u.id}`,
            ref_table: "thoughts_images",
            ref_id: u.id,
            image_path: u.path,
            text_preview: typed.text_content?.slice(0, 160) ?? null,
            mood: typed.mood,
            expires_at: expires,
          }))
        );
      }
    } catch { /* table might not exist; global rail has fallback */ }

    // 5) reset
    setText(""); setMood(""); setFiles([]); setPosting(false);
  }

  // like toggle
  async function toggleLike(postId: string) {
    if (!user?.id) { alert("Please log in to react."); return; }
    const mine = myLikeId[postId];
    if (mine) {
      await supabase.from("thoughts_reactions").delete().eq("id", mine);
      setMyLikeId(prev => ({ ...prev, [postId]: null }));
      setLikesCount(prev => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 1) - 1) }));
    } else {
      const { data } = await supabase.from("thoughts_reactions")
        .insert({ post_id: postId, user_id: user.id, type: "like" })
        .select("id").single();
      if (data) {
        setMyLikeId(prev => ({ ...prev, [postId]: data.id }));
        setLikesCount(prev => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
      }
    }
  }

  // delete/report
  async function softDeletePost(postId: string) {
    const p = posts.find(x => x.id === postId);
    if (!user?.id || !p || p.user_id !== user.id) return;
    await supabase.from("thoughts_posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId);
    setPosts(prev => prev.filter(x => x.id !== postId));
  }
  async function toggleReportPost(postId: string) {
    if (!user?.id) { alert("Please log in to report."); return; }
    const { data: exists } = await supabase
      .from("thoughts_post_reports").select("id").eq("post_id", postId).eq("user_id", user.id).maybeSingle();
    if (exists) await supabase.from("thoughts_post_reports").delete().eq("id", exists.id);
    else await supabase.from("thoughts_post_reports").insert({ post_id: postId, user_id: user.id });
  }

  // lightbox
  useEffect(() => {
    if (!photoId || allPhotos.length === 0) return;
    const idx = allPhotos.findIndex(p => p.id === photoId);
    if (idx >= 0) setLightboxIndex(idx);
  }, [photoId, allPhotos.length]);

  const openLightboxFor = (imageId: string) => {
    const idx = allPhotos.findIndex(p => p.id === imageId);
    if (idx >= 0) {
      setLightboxIndex(idx);
      if (!location.pathname.includes("/thoughts/photos/")) {
        navigate(`/thoughts/photos/${imageId}`, { replace: false });
      }
    }
  };
  const closeLightbox = () => {
    setLightboxIndex(null);
    if (location.pathname.includes("/thoughts/photos/")) navigate("/thoughts", { replace: true });
  };
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
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950">
      <div className="mx-auto max-w-[900px] px-3 sm:px-4 md:px-6 py-6 space-y-6">
        {/* COMPOSER */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 grid place-items-center text-white font-bold">
              {(user?.email?.[0] || "U").toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="bg-neutral-800/30 rounded-2xl p-4 mb-4 border border-neutral-700/30">
                <Textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={3}
                  className="resize-none text-lg"
                />
              </div>

              {!!mood && <div className="mb-4"><Badge><Smile className="h-4 w-4 mr-1" />Feeling {mood}</Badge></div>}

              {files.length > 0 && (
                <div className="mb-4 p-4 bg-neutral-800/20 rounded-2xl border border-neutral-700/30">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {files.map((f, i) => {
                      const url = URL.createObjectURL(f);
                      return (
                        <div key={i} className="relative group">
                          <img src={url} alt="" className="h-32 w-full object-cover rounded-xl" />
                          <button className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition" onClick={() => removeFile(i)} aria-label="Remove">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-purple-400 hover:text-purple-300">
                    <input type="file" accept="image/*" multiple className="hidden" onChange={e => onPickFiles(e.target.files)} />
                    <Image className="h-6 w-6" />
                    <span className="font-medium">Add photo(s)</span>
                  </label>

                  <div className="relative">
                    <select
                      value={mood}
                      onChange={(e) => setMood(e.target.value as Mood | "")}
                      className="appearance-none bg-transparent text-green-400 hover:text-green-300 cursor-pointer font-medium"
                    >
                      <option value="" className="bg-neutral-800 text-neutral-200">😊 Mood</option>
                      {MOODS.map(m => (
                        <option key={m} value={m} className="bg-neutral-800 text-neutral-200">{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <Button onClick={createPost} disabled={posting || (!text.trim() && files.length === 0)}>
                  {posting ? "Posting..." : "Post"}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* FEED */}
        <div className="space-y-6">
          {posts.map(p => (
            <Card key={p.id} className="overflow-hidden">
              <div className="p-6 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-rose-500 to-orange-500 grid place-items-center text-white font-bold">U</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-neutral-100">User</h3>
                      {p.mood && <Badge className="text-xs"><Smile className="h-3 w-3 mr-1" />{p.mood}</Badge>}
                    </div>
                    <p className="text-sm text-neutral-400">{timeAgo(new Date(p.created_at).getTime())} • 🌍</p>
                  </div>
                  <button className="p-2 hover:bg-neutral-800 rounded-full"><MoreHorizontal className="h-5 w-5 text-neutral-400" /></button>
                </div>
              </div>

              {p.text_content && (
                <div className="px-6 pb-4">
                  <p className="text-neutral-100 text-base leading-relaxed whitespace-pre-wrap">{p.text_content}</p>
                </div>
              )}

              {(imagesByPost[p.id]?.length ?? 0) > 0 && (
                <div className="relative">
                  {imagesByPost[p.id].length === 1 ? (
                    <button onClick={() => openLightboxFor(imagesByPost[p.id][0].id)} className="w-full">
                      <img src={imagesByPost[p.id][0].src} alt="" loading="lazy" className="w-full h-96 object-cover hover:opacity-95 transition-opacity cursor-pointer" />
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-1">
                      {imagesByPost[p.id].slice(0, 4).map((img, i) => (
                        <button key={img.id} onClick={() => openLightboxFor(img.id)} className="relative">
                          <img src={img.src} alt="" loading="lazy" className="w-full h-48 object-cover hover:opacity-95 transition-opacity cursor-pointer" />
                          {i === 3 && imagesByPost[p.id].length > 4 && (
                            <div className="absolute inset-0 bg-black/60 grid place-items-center">
                              <span className="text-white text-2xl font-bold">+{imagesByPost[p.id].length - 4}</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="p-6 pt-4">
                {(likesCount[p.id] || 0) > 0 && (
                  <div className="flex items-center gap-2 mb-3 text-sm text-neutral-400">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-r from-red-500 to-pink-500 grid place-items-center text-white text-xs">❤️</div>
                    <span>{likesCount[p.id]} {likesCount[p.id] === 1 ? "like" : "likes"}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
                  <button
                    onClick={() => toggleLike(p.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium hover:bg-neutral-800/50 ${myLikeId[p.id] ? "text-red-400" : "text-neutral-300 hover:text-red-400"}`}
                  >
                    <Heart className={`h-5 w-5 ${myLikeId[p.id] ? "fill-current" : ""}`} />
                    <span>Like</span>
                  </button>

                  <CommentsThread postId={p.id} currentUserId={user?.id} />

                  <button className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-neutral-300 hover:text-green-400 hover:bg-neutral-800/50">
                    <Share className="h-5 w-5" />
                    <span>Share</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button className="p-2 text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800 rounded-lg" onClick={() => toggleReportPost(p.id)} aria-label="Report post">
                      <Flag className="h-4 w-4" />
                    </button>
                    <button className="p-2 text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800 rounded-lg" onClick={() => softDeletePost(p.id)} aria-label="Delete post">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          <div ref={moreRef} />
          {initialLoading && <Card className="p-6 text-center text-neutral-400">Loading…</Card>}
          {!initialLoading && posts.length === 0 && <Card className="p-6 text-center text-neutral-400">No posts yet. Be the first!</Card>}
          {loadingMore && <Card className="p-4 text-center text-neutral-400">Loading more…</Card>}
        </div>
      </div>

      {/* LIGHTBOX */}
      {lightboxOpen && lightboxIndex !== null && (
        <div className="fixed inset-0 bg-black/95 z-50 grid place-items-center p-2 sm:p-4" onClick={closeLightbox}>
          <button className="absolute top-2 right-2 sm:top-4 sm:right-4 text-white p-2 sm:p-3 rounded-full bg-black/50 backdrop-blur hover:bg-black/70" onClick={closeLightbox} aria-label="Close">
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
          <button className="absolute left-2 sm:left-4 text-white p-2 sm:p-3 rounded-full bg-black/50 backdrop-blur hover:bg-black/70" onClick={() => setLightboxIndex((i) => (i! + allPhotos.length - 1) % allPhotos.length)} aria-label="Previous">
            <ChevronLeft className="h-6 w-6 sm:h-7 sm:w-7" />
          </button>
          <img src={allPhotos[lightboxIndex].src} alt="" className="max-h-[85vh] max-w-[90vw] sm:max-h-[90vh] sm:max-w-[90vw] object-contain rounded-lg sm:rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button className="absolute right-2 sm:right-4 text-white p-2 sm:p-3 rounded-full bg-black/50 backdrop-blur hover:bg-black/70" onClick={() => setLightboxIndex((i) => (i! + 1) % allPhotos.length)} aria-label="Next">
            <ChevronRight className="h-6 w-6 sm:h-7 sm:w-7" />
          </button>
          <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 text-white/90 bg-black/60 backdrop-blur px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm">
            {lightboxIndex + 1} / {allPhotos.length}
          </div>
        </div>
      )}
    </div>
  );
}

/* Comments */
function CommentsThread({ postId, currentUserId }: { postId: string; currentUserId?: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DBComment[]>([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => { if (open && items.length === 0) void load(); }, [open]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("thoughts_comments").select("*")
      .eq("post_id", postId).is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (data) setItems(data as DBComment[]);
    setLoading(false);
  }

  async function addComment() {
    if (!currentUserId) { alert("Please log in to comment."); return; }
    if (!text.trim()) return;
    setPosting(true);
    const { data } = await supabase
      .from("thoughts_comments")
      .insert({ post_id: postId, user_id: currentUserId, text: text.trim() })
      .select("*").single();
    if (data) setItems(prev => [...prev, data as DBComment]);
    setText(""); setPosting(false);
  }

  async function removeComment(id: string) {
    const c = items.find(i => i.id === id);
    if (!c || c.user_id !== currentUserId) return;
    await supabase.from("thoughts_comments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  return (
    <div className="flex flex-col">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-neutral-300 hover:text-blue-400 hover:bg-neutral-800/50" aria-expanded={open}>
        <MessageCircle className="h-5 w-5" />
        <span>Comment</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3 pl-4 border-l-2 border-neutral-800">
          {loading && <div className="text-sm text-neutral-400">Loading comments…</div>}
          {!loading && (
            <>
              {items.map(c => (
                <div key={c.id} className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 grid place-items-center text-white text-sm font-medium">U</div>
                  <div className="flex-1 bg-neutral-800/30 rounded-2xl p-3">
                    <div className="text-sm font-medium text-neutral-200 mb-1">User</div>
                    <div className="text-sm text-neutral-100">{c.text}</div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-neutral-400">
                      <span>{timeAgo(new Date(c.created_at).getTime())}</span>
                      {c.user_id === currentUserId && (
                        <button className="inline-flex items-center gap-1 hover:text-neutral-300" onClick={() => removeComment(c.id)}>
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 grid place-items-center text-white text-sm font-medium">Y</div>
                <Input
                  value={text}
                  onChange={(e: any) => setText(e.target.value)}
                  placeholder="Write a comment…"
                  className="flex-1 h-10"
                  onKeyDown={(e: any) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); }
                  }}
                />
                <Button onClick={addComment} disabled={posting || !text.trim()} className="px-3 py-2 text-sm">
                  {posting ? "..." : "Post"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); return `${d}d`;
}

function useLightboxSwipe(enabled: boolean, onPrev: () => void, onNext: () => void, onClose: () => void) {
  useEffect(() => {
    if (!enabled) return;
    let startX = 0, startY = 0, dx = 0, dy = 0, touching = false;
    const onStart = (e: TouchEvent) => { touching = true; startX = e.touches[0].clientX; startY = e.touches[0].clientY; };
    const onMove = (e: TouchEvent) => { if (!touching) return; dx = e.touches[0].clientX - startX; dy = e.touches[0].clientY - startY; };
    const onEnd = () => {
      if (!touching) return; touching = false;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax > 40 && ax > ay) dx > 0 ? onPrev() : onNext(); else if (ax < 10 && ay < 10) onClose();
      startX = startY = dx = dy = 0;
    };
    const root = document.documentElement;
    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: true });
    root.addEventListener("touchend", onEnd);
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
    };
  }, [enabled, onPrev, onNext, onClose]);
}
