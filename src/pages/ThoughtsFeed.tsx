import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  X, Image as ImageIcon, Smile, ChevronLeft, ChevronRight,
  Heart, Flag, Trash2
} from "lucide-react";

/* minimal fallbacks so this file works without shadcn */
let Button:any, Card:any, Badge:any, Textarea:any, Input:any;
try {
  ({ Button } = require("@/components/ui/button"));
  ({ Card } = require("@/components/ui/card"));
  ({ Badge } = require("@/components/ui/badge"));
  ({ Textarea } = require("@/components/ui/textarea"));
  ({ Input } = require("@/components/ui/input"));
} catch {
  Button = ({ className="", ...p }: any) => <button className={`px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 ${className}`} {...p} />;
  Card = ({ className="", ...p }: any) => <div className={`rounded-2xl border border-neutral-800 bg-neutral-900 shadow-sm ${className}`} {...p} />;
  Badge = ({ className="", ...p }: any) => <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-neutral-800 text-neutral-200 ${className}`} {...p} />;
  const Base = (Tag:any) => ({ className="", ...p }: any) => <Tag className={`w-full border border-neutral-800 bg-neutral-900 text-neutral-100 rounded-xl px-4 py-3 placeholder:text-neutral-500 ${className}`} {...p} />;
  Textarea = Base("textarea");
  Input = Base("input");
}

/* ---- types ---- */
type Mood =
  | "Happy" | "Grateful" | "Blessed" | "Chill" | "Focused" | "Motivated"
  | "Tired" | "Anxious" | "Frustrated" | "Excited" | "Proud" | "Loved";

const MOODS: Mood[] = [
  "Happy","Grateful","Blessed","Chill","Focused","Motivated",
  "Tired","Anxious","Frustrated","Excited","Proud","Loved"
];

type DBPost = {
  id: string; user_id: string | null; text_content: string; mood: Mood | null;
  created_at: string; deleted_at: string | null;
};
type DBImage = { id: string; post_id: string; path: string; created_at: string };
type DBReaction = { id: string; post_id: string; user_id: string | null; type: string };
type DBComment = {
  id: string; post_id: string; user_id: string | null;
  text: string; created_at: string; deleted_at: string | null;
};

const BUCKET = "thoughts-images";
const PAGE_SIZE = 20;

export default function ThoughtsFeed() {
  const navigate = useNavigate();
  const { photoId } = useParams();
  const location = useLocation();

  /* ---- FIXED AUTH: pull the current user from Supabase here ---- */
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (mounted) setUser(data.user ?? null);
    };
    init();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // Composer
  const [text, setText] = useState("");
  const [mood, setMood] = useState<Mood | "">("");
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);

  // Feed
  const [posts, setPosts] = useState<DBPost[]>([]);
  const [imagesByPost, setImagesByPost] = useState<Record<string, { id: string; src: string }[]>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // Reactions cache
  const [likesCount, setLikesCount] = useState<Record<string, number>>({});
  const [myLikeId, setMyLikeId] = useState<Record<string, string | null>>({});

  // aggregated photos for rail/lightbox
  const allPhotos = useMemo(() => {
    const list: { id: string; src: string; postId: string }[] = [];
    for (const p of posts) {
      (imagesByPost[p.id] || []).forEach(img => list.push({ id: img.id, src: img.src, postId: p.id }));
    }
    return list;
  }, [posts, imagesByPost]);

  // Lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxOpen = lightboxIndex !== null;

  // initial page load
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
      if (entries[0].isIntersecting && !loadingMore && cursor) loadPage(cursor);
    }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadingMore]);

  async function loadPage(after: string | null) {
    setLoadingMore(true);
    let query = supabase
      .from("thoughts_posts")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (after) query = query.lt("created_at", after);

    const { data: page, error } = await query;
    if (error) { console.error(error); setLoadingMore(false); return; }
    if (!page || page.length === 0) { setCursor(null); setLoadingMore(false); return; }

    const typed = page as DBPost[];
    setPosts(prev => [...prev, ...typed]);
    const last = typed[typed.length - 1];
    setCursor(last.created_at);

    // images for these posts
    const ids = typed.map(p => p.id);
    const { data: imgs, error: imgErr } = await supabase
      .from("thoughts_images").select("*").in("post_id", ids).order("created_at", { ascending: true });
    if (imgErr) { console.error(imgErr); setLoadingMore(false); return; }

    const byPost: Record<string, { id: string; src: string }[]> = {};
    (imgs as DBImage[]).forEach(img => {
      const url = supabase.storage.from(BUCKET).getPublicUrl(img.path).data.publicUrl;
      (byPost[img.post_id] ||= []).push({ id: img.id, src: url });
    });
    setImagesByPost(prev => {
      const merged = { ...prev };
      for (const pid of Object.keys(byPost)) merged[pid] = [ ...(prev[pid] || []), ...byPost[pid] ];
      return merged;
    });

    // reaction counts + my like status
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
    const maxEachMB = 10, maxCount = 10;
    const arr = Array.from(list).slice(0, maxCount - files.length);
    const safe = arr.filter(f => f.type.startsWith("image/") && f.size <= maxEachMB * 1024 * 1024);
    setFiles(prev => [...prev, ...safe]);
  }
  function removeFile(i: number) { setFiles(prev => prev.filter((_, idx) => idx !== i)); }

  async function createPost() {
    if (!user?.id) { alert("Please log in to post."); return; }
    if (!text.trim() && files.length === 0) return;
    setPosting(true);

    const { data: post, error: postErr } = await supabase
      .from("thoughts_posts")
      .insert({ user_id: user.id, text_content: text.trim(), mood: mood || null })
      .select("*").single();
    if (postErr || !post) { console.error(postErr); setPosting(false); return; }

    const uploaded: { id: string; src: string }[] = [];
    for (const f of files) {
      const ext = f.name.split(".").pop() || "jpg";
      const key = `${post.user_id}/${post.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, f);
      if (upErr) continue;
      const { data: imgRow, error: imgErr } = await supabase
        .from("thoughts_images").insert({ post_id: post.id, path: key }).select("*").single();
      if (!imgErr && imgRow) {
        const url = supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
        uploaded.push({ id: imgRow.id, src: url });
      }
    }

    // optimistic update
    const typed = post as DBPost;
    setPosts(prev => [typed, ...prev]);
    setImagesByPost(prev => ({ ...prev, [typed.id]: uploaded }));
    setLikesCount(prev => ({ ...prev, [typed.id]: 0 }));
    setMyLikeId(prev => ({ ...prev, [typed.id]: null }));

    setText(""); setMood(""); setFiles([]); setPosting(false);
  }

  // LIKE (toggle)
  async function toggleLike(postId: string) {
    if (!user?.id) { alert("Please log in to react."); return; }
    const myId = myLikeId[postId];
    if (myId) {
      await supabase.from("thoughts_reactions").delete().eq("id", myId);
      setMyLikeId(prev => ({ ...prev, [postId]: null }));
      setLikesCount(prev => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 1) - 1) }));
    } else {
      const { data, error } = await supabase.from("thoughts_reactions")
        .insert({ post_id: postId, user_id: user.id, type: "like" })
        .select("id").single();
      if (!error && data) {
        setMyLikeId(prev => ({ ...prev, [postId]: data.id }));
        setLikesCount(prev => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
      }
    }
  }

  // POST soft delete
  async function softDeletePost(postId: string) {
    if (!user?.id) return;
    const post = posts.find(p => p.id === postId);
    if (!post || post.user_id !== user.id) return;
    await supabase.from("thoughts_posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  }

  // REPORT post toggle
  async function toggleReportPost(postId: string) {
    if (!user?.id) { alert("Please log in to report."); return; }
    const { data: exists } = await supabase
      .from("thoughts_post_reports")
      .select("id").eq("post_id", postId).eq("user_id", user.id).maybeSingle();
    if (exists) await supabase.from("thoughts_post_reports").delete().eq("id", exists.id);
    else await supabase.from("thoughts_post_reports").insert({ post_id: postId, user_id: user.id });
  }

  // LIGHTBOX: open from URL param
  useEffect(() => {
    if (!photoId || allPhotos.length === 0) return;
    const idx = allPhotos.findIndex(p => p.id === photoId);
    if (idx >= 0) setLightboxIndex(idx);
  }, [photoId, allPhotos.length]);

  function openLightboxFor(imageId: string) {
    const idx = allPhotos.findIndex(p => p.id === imageId);
    if (idx >= 0) {
      setLightboxIndex(idx);
      if (!location.pathname.includes("/thoughts/photos/")) {
        navigate(`/thoughts/photos/${imageId}`, { replace: false });
      }
    }
  }
  function closeLightbox() {
    setLightboxIndex(null);
    if (location.pathname.includes("/thoughts/photos/"))
      navigate("/thoughts", { replace: true });
  }
  const prevPhoto = () => setLightboxIndex(i => (i === null ? i : (i + allPhotos.length - 1) % allPhotos.length));
  const nextPhoto = () => setLightboxIndex(i => (i === null ? i : (i + 1) % allPhotos.length));

  // keyboard + swipe
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-[1400px] px-3 sm:px-4 md:px-6 py-4 grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] xl:grid-cols-[320px_1fr_340px] gap-6">

        {/* LEFT SIDEBAR - empty placeholder for nav or other content */}
        <aside className="hidden lg:block">
          <div className="sticky top-4">
            {/* Add navigation or other left sidebar content here if needed */}
          </div>
        </aside>

        {/* CENTER FEED - Facebook style */}
        <main className="space-y-4 md:space-y-5">
          {/* Composer */}
          <Card className="p-4 md:p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-500" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <Smile className="h-4 w-4 text-neutral-400" />
                  {/* Native select for bulletproof visibility in dark mode */}
                  <div className="relative">
                    <select
                      value={mood}
                      onChange={(e) => setMood(e.target.value as Mood | "")}
                      className="appearance-none rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 px-4 py-2.5 pr-10 text-sm"
                    >
                      <option value="">Choose mood (optional)</option>
                      {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">▼</span>
                  </div>
                </div>

                <Textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Share your thoughts…"
                  rows={4}
                  className="resize-y focus:ring-2 focus:ring-indigo-500/60"
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
                            className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1"
                            onClick={() => removeFile(i)} aria-label="Remove"
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
                    <span className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300">
                      <ImageIcon className="h-5 w-5" /><span className="text-sm sm:text-base">Add photo(s)</span>
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    {mood && <Badge className="bg-neutral-800 text-indigo-300">{mood}</Badge>}
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
              <Card key={p.id} className="p-4 md:p-5">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-rose-500 to-orange-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] sm:text-sm text-neutral-400">
                      <span className="font-medium text-neutral-100">User</span>
                      <span>· {timeAgo(new Date(p.created_at).getTime())}</span>
                      {p.mood && <Badge className="bg-neutral-800 text-neutral-200">{p.mood}</Badge>}
                    </div>

                    {p.text_content && <p className="mt-3 text-neutral-100 whitespace-pre-wrap text-[15px] sm:text-base leading-relaxed">{p.text_content}</p>}

                    {(imagesByPost[p.id]?.length ?? 0) > 0 && (
                      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {imagesByPost[p.id].map((img) => (
                          <button key={img.id} className="relative group" onClick={() => openLightboxFor(img.id)} aria-label="Open photo">
                            <img src={img.src} alt="" loading="lazy" className="rounded-xl object-cover w-full h-40 sm:h-48 hover:opacity-90 transition-opacity" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Reactions + actions */}
                    <div className="mt-4 flex items-center gap-6">
                      <button
                        className={`inline-flex items-center gap-1.5 text-sm hover:bg-neutral-800 px-2 py-1 rounded-lg transition-colors ${
                          myLikeId[p.id] ? "text-rose-400" : "text-neutral-300"
                        }`}
                        onClick={() => toggleLike(p.id)}
                        aria-label="Like"
                      >
                        <Heart className={`h-5 w-5 ${myLikeId[p.id] ? "fill-current" : ""}`} />
                        <span>{likesCount[p.id] || 0}</span>
                      </button>

                      <CommentsThread postId={p.id} currentUserId={user?.id} />

                      {/* Report post */}
                      <button
                        className="ml-auto inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800 px-2 py-1 rounded-lg transition-colors"
                        onClick={() => toggleReportPost(p.id)}
                        aria-label="Report post"
                      >
                        <Flag className="h-4 w-4" />
                      </button>

                      {/* Soft delete (owner only) */}
                      {user?.id === p.user_id && (
                        <button
                          className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800 px-2 py-1 rounded-lg transition-colors"
                          onClick={() => softDeletePost(p.id)}
                          aria-label="Delete post"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
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
        </main>

        {/* RIGHT PHOTO RAIL */}
        <aside className="hidden lg:block sticky top-4 h-[calc(100vh-2rem)] overflow-auto">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-neutral-200">Photos</h3>
              <span className="text-xs text-neutral-500">{allPhotos.length}</span>
            </div>

            {/* vertical bubble list */}
            <div className="flex flex-col gap-3">
              {allPhotos.length === 0 && (
                <p className="text-sm text-neutral-400">Photos you post will appear here.</p>
              )}
              {[...allPhotos].reverse().slice(0, 120).map((p) => (
                <button
                  key={p.id}
                  onClick={() => openLightboxFor(p.id)}
                  className="flex items-center gap-3 text-left hover:bg-neutral-800/50 rounded-lg p-2 -m-2 transition-colors"
                >
                  <img
                    src={p.src}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 rounded-full object-cover ring-2 ring-neutral-800"
                  />
                  <div className="flex-1 border-b border-neutral-800/70" />
                </button>
              ))}
            </div>
          </Card>
        </aside>
      </div>

      {/* LIGHTBOX (dark) */}
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

/* -------------------- Comments Thread (dark) -------------------- */
function CommentsThread({ postId, currentUserId }: { postId: string; currentUserId?: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DBComment[]>([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("thoughts_comments")
      .select("*")
      .eq("post_id", postId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (!error && data) setItems(data as DBComment[]);
    setLoading(false);
  }

  useEffect(() => { if (open && items.length === 0) load(); }, [open]);

  async function addComment() {
    if (!currentUserId) { alert("Please log in to comment."); return; }
    if (!text.trim()) return;
    setPosting(true);
    const { data, error } = await supabase
      .from("thoughts_comments")
      .insert({ post_id: postId, user_id: currentUserId, text: text.trim() })
      .select("*").single();
    if (!error && data) setItems(prev => [...prev, data as DBComment]);
    setText(""); setPosting(false);
  }

  async function removeComment(id: string) {
    const c = items.find(i => i.id === id);
    if (!c || c.user_id !== currentUserId) return;
    await supabase.from("thoughts_comments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function toggleReport(commentId: string) {
    if (!currentUserId) { alert("Please log in to report."); return; }
    const { data: existed } = await supabase
      .from("thoughts_comment_reports")
      .select("id").eq("comment_id", commentId).eq("user_id", currentUserId).maybeSingle();
    if (existed) await supabase.from("thoughts_comment_reports").delete().eq("id", existed.id);
    else await supabase.from("thoughts_comment_reports").insert({ comment_id: commentId, user_id: currentUserId });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 text-sm text-neutral-300 hover:bg-neutral-800 px-2 py-1 rounded-lg transition-colors"
        aria-expanded={open}
      >
        <span>{open ? "Hide comments" : "View comments"}</span>
      </button>
      {open && (
        <div className="mt-3 w-full">
          {loading && <div className="text-sm text-neutral-400">Loading comments…</div>}
          {!loading && (
            <div className="mt-2 space-y-3">
              {items.map(c => (
                <div key={c.id} className="flex items-start gap-2">
                  <div className="h-8 w-8 rounded-full bg-neutral-800" />
                  <div className="flex-1">
                    <div className="text-sm text-neutral-100">{c.text}</div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400">
                      <span>{timeAgo(new Date(c.created_at).getTime())}</span>
                      <button className="inline-flex items-center gap-1" onClick={() => toggleReport(c.id)}>
                        <Flag className="h-3.5 w-3.5" /> Report
                      </button>
                      {c.user_id === currentUserId && (
                        <button className="inline-flex items-center gap-1" onClick={() => removeComment(c.id)}>
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2">
                <Input
                  value={text}
                  onChange={(e:any) => setText(e.target.value)}
                  placeholder="Write a comment…"
                  className="flex-1"
                />
                <Button onClick={addComment} disabled={posting || !text.trim()}>
                  Post
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------- helpers -------------------- */
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

function useLightboxSwipe(
  enabled: boolean,
  onPrev: () => void,
  onNext: () => void,
  onClose: () => void
) {
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
