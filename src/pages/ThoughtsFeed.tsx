import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  X, Image, Smile, ChevronLeft, ChevronRight,
  Heart, Flag, Trash2, MessageCircle, Share, MoreHorizontal,
  Camera, Video, MapPin, Calendar
} from "lucide-react";

/* Enhanced UI Components with better styling */
let Button: any, Card: any, Badge: any, Textarea: any, Input: any;
try {
  ({ Button } = require("@/components/ui/button"));
  ({ Card } = require("@/components/ui/card"));
  ({ Badge } = require("@/components/ui/badge"));
  ({ Textarea } = require("@/components/ui/textarea"));
  ({ Input } = require("@/components/ui/input"));
} catch {
  // Enhanced fallback components with better styling
  Button = ({ className = "", variant = "primary", size = "md", ...p }: any) => {
    const variants = {
      primary: "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg",
      secondary: "bg-neutral-800/80 hover:bg-neutral-700 text-neutral-200 border border-neutral-700",
      ghost: "hover:bg-neutral-800/50 text-neutral-300"
    };
    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2",
      lg: "px-6 py-3 text-lg"
    };
    return (
      <button 
        className={`rounded-xl font-medium transition-all duration-200 disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`} 
        {...p} 
      />
    );
  };
  
  Card = ({ className = "", ...p }: any) => (
    <div className={`rounded-2xl border border-neutral-800/50 bg-neutral-900/80 backdrop-blur-sm shadow-xl ${className}`} {...p} />
  );
  
  Badge = ({ className = "", ...p }: any) => (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-gradient-to-r from-purple-600/20 to-blue-600/20 text-purple-300 border border-purple-500/30 ${className}`} {...p} />
  );
  
  const BaseInput = (Tag: any) => ({ className = "", ...p }: any) => (
    <Tag className={`w-full border border-neutral-700/50 bg-neutral-800/50 text-neutral-100 rounded-xl px-4 py-3 placeholder:text-neutral-500 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all ${className}`} {...p} />
  );
  
  Textarea = BaseInput("textarea");
  Input = BaseInput("input");
}

/* Types */
type Mood =
  | "Happy" | "Grateful" | "Blessed" | "Chill" | "Focused" | "Motivated"
  | "Tired" | "Anxious" | "Frustrated" | "Excited" | "Proud" | "Loved";

const MOODS: Mood[] = [
  "Happy", "Grateful", "Blessed", "Chill", "Focused", "Motivated",
  "Tired", "Anxious", "Frustrated", "Excited", "Proud", "Loved"
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

  /* Authentication */
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
      for (const pid of Object.keys(byPost)) merged[pid] = [...(prev[pid] || []), ...byPost[pid]];
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
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950">
      <div className="mx-auto max-w-[1400px] px-3 sm:px-4 md:px-6 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] xl:grid-cols-[320px_1fr_360px] gap-6">

        {/* LEFT SIDEBAR - Enhanced */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-4">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg">
                  {user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-100">
                    {user?.email?.split('@')[0] || 'User'}
                  </h3>
                  <p className="text-sm text-neutral-400">View your activity</p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-neutral-100 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-neutral-800/50 transition-colors text-left">
                  <Camera className="h-5 w-5 text-purple-400" />
                  <span className="text-neutral-200">Create Story</span>
                </button>
                <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-neutral-800/50 transition-colors text-left">
                  <Video className="h-5 w-5 text-blue-400" />
                  <span className="text-neutral-200">Go Live</span>
                </button>
                <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-neutral-800/50 transition-colors text-left">
                  <Calendar className="h-5 w-5 text-green-400" />
                  <span className="text-neutral-200">Create Event</span>
                </button>
              </div>
            </Card>
          </div>
        </aside>

        {/* CENTER FEED - Enhanced Facebook style */}
        <main className="space-y-6">
          {/* Enhanced Composer */}
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="bg-neutral-800/30 rounded-2xl p-4 mb-4 border border-neutral-700/30">
                  <Textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="What's on your mind?"
                    rows={3}
                    className="resize-none focus:outline-none text-lg"
                  />
                </div>

                {/* Enhanced Mood Selector */}
                {mood && (
                  <div className="mb-4">
                    <Badge className="text-sm">
                      <Smile className="h-4 w-4 mr-1" />
                      Feeling {mood}
                    </Badge>
                  </div>
                )}

                {/* Enhanced files preview */}
                {files.length > 0 && (
                  <div className="mb-4 p-4 bg-neutral-800/20 rounded-2xl border border-neutral-700/30">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {files.map((f, i) => {
                        const url = URL.createObjectURL(f);
                        return (
                          <div key={i} className="relative group">
                            <img 
                              src={url} 
                              alt="" 
                              className="h-32 w-full object-cover rounded-xl shadow-lg" 
                            />
                            <button
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-600"
                              onClick={() => removeFile(i)}
                              aria-label="Remove"
                            >
                              <X className="h-4 w-4" />
                            </button>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-all duration-200" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Enhanced Action Bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-purple-400 hover:text-purple-300 transition-colors">
                      <input type="file" accept="image/*" multiple className="hidden" onChange={e => onPickFiles(e.target.files)} />
                      <Image className="h-6 w-6" />
                      <span className="font-medium">Photo</span>
                    </label>

                    <button className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors">
                      <Video className="h-6 w-6" />
                      <span className="font-medium">Video</span>
                    </button>

                    <div className="relative">
                      <select
                        value={mood}
                        onChange={(e) => setMood(e.target.value as Mood | "")}
                        className="appearance-none bg-transparent text-green-400 hover:text-green-300 cursor-pointer font-medium"
                      >
                        <option value="" className="bg-neutral-800 text-neutral-200">😊 Mood</option>
                        {MOODS.map(m => (
                          <option key={m} value={m} className="bg-neutral-800 text-neutral-200">
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <Button 
                    onClick={createPost} 
                    disabled={posting || (!text.trim() && files.length === 0)}
                    className="min-w-[100px]"
                  >
                    {posting ? "Posting..." : "Post"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Enhanced FEED */}
          <div className="space-y-6">
            {posts.map(p => (
              <Card key={p.id} className="overflow-hidden">
                {/* Enhanced Post Header */}
                <div className="p-6 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center text-white font-bold text-lg">
                      U
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-neutral-100">User</h3>
                        {p.mood && (
                          <Badge className="text-xs">
                            <Smile className="h-3 w-3 mr-1" />
                            {p.mood}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-neutral-400">
                        {timeAgo(new Date(p.created_at).getTime())} • 🌍
                      </p>
                    </div>
                    <button className="p-2 hover:bg-neutral-800 rounded-full transition-colors">
                      <MoreHorizontal className="h-5 w-5 text-neutral-400" />
                    </button>
                  </div>
                </div>

                {/* Post Content */}
                {p.text_content && (
                  <div className="px-6 pb-4">
                    <p className="text-neutral-100 text-base leading-relaxed whitespace-pre-wrap">
                      {p.text_content}
                    </p>
                  </div>
                )}

                {/* Enhanced Post Images */}
                {(imagesByPost[p.id]?.length ?? 0) > 0 && (
                  <div className="relative">
                    {imagesByPost[p.id].length === 1 ? (
                      <button 
                        onClick={() => openLightboxFor(imagesByPost[p.id][0].id)}
                        className="w-full"
                      >
                        <img 
                          src={imagesByPost[p.id][0].src} 
                          alt="" 
                          loading="lazy"
                          className="w-full h-96 object-cover hover:opacity-95 transition-opacity cursor-pointer" 
                        />
                      </button>
                    ) : (
                      <div className="grid grid-cols-2 gap-1">
                        {imagesByPost[p.id].slice(0, 4).map((img, i) => (
                          <button
                            key={img.id}
                            onClick={() => openLightboxFor(img.id)}
                            className="relative"
                          >
                            <img 
                              src={img.src} 
                              alt="" 
                              loading="lazy"
                              className="w-full h-48 object-cover hover:opacity-95 transition-opacity cursor-pointer" 
                            />
                            {i === 3 && imagesByPost[p.id].length > 4 && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <span className="text-white text-2xl font-bold">
                                  +{imagesByPost[p.id].length - 4}
                                </span>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Enhanced Reactions + actions */}
                <div className="p-6 pt-4">
                  {/* Reaction Summary */}
                  {(likesCount[p.id] || 0) > 0 && (
                    <div className="flex items-center gap-2 mb-3 text-sm text-neutral-400">
                      <div className="flex -space-x-1">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-r from-red-500 to-pink-500 flex items-center justify-center text-white text-xs">
                          ❤️
                        </div>
                      </div>
                      <span>{likesCount[p.id]} {likesCount[p.id] === 1 ? 'person likes' : 'people like'} this</span>
                    </div>
                  )}

                  {/* Enhanced Action Buttons */}
                  <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
                    <button 
                      onClick={() => toggleLike(p.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all hover:bg-neutral-800/50 ${
                        myLikeId[p.id] 
                          ? 'text-red-400' 
                          : 'text-neutral-300 hover:text-red-400'
                      }`}
                    >
                      <Heart className={`h-5 w-5 ${myLikeId[p.id] ? 'fill-current' : ''}`} />
                      <span>Like</span>
                    </button>

                    <CommentsThread postId={p.id} currentUserId={user?.id} />

                    <button className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-neutral-300 hover:text-green-400 hover:bg-neutral-800/50 transition-all">
                      <Share className="h-5 w-5" />
                      <span>Share</span>
                    </button>

                    {/* Report + Delete in dropdown */}
                    <div className="flex items-center gap-2">
                      <button
                        className="p-2 text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800 rounded-lg transition-colors"
                        onClick={() => toggleReportPost(p.id)}
                        aria-label="Report post"
                      >
                        <Flag className="h-4 w-4" />
                      </button>

                      {user?.id === p.user_id && (
                        <button
                          className="p-2 text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800 rounded-lg transition-colors"
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

        {/* RIGHT PHOTO RAIL - Enhanced */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 h-[calc(100vh-2rem)] overflow-auto">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-neutral-100">Photos</h3>
                <span className="text-sm text-neutral-400 bg-neutral-800 px-2 py-1 rounded-full">
                  {allPhotos.length}
                </span>
              </div>

              {allPhotos.length === 0 ? (
                <div className="text-center py-8">
                  <Image className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
                  <p className="text-sm text-neutral-400">
                    Photos you share will appear here
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {[...allPhotos].reverse().slice(0, 120).map((photo, i) => (
                    <button
                      key={photo.id}
                      onClick={() => openLightboxFor(photo.id)}
                      className="relative group aspect-square"
                    >
                      <img
                        src={photo.src}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover rounded-lg group-hover:opacity-90 transition-opacity"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-all duration-200" />
                    </button>
                  ))}
                </div>
              )}
              
              {allPhotos.length > 120 && (
                <button className="w-full mt-3 text-center text-purple-400 hover:text-purple-300 font-medium text-sm">
                  View all photos ({allPhotos.length})
                </button>
              )}
            </Card>
          </div>
        </aside>
      </div>

      {/* Mobile-Optimized LIGHTBOX */}
      {lightboxOpen && lightboxIndex !== null && (
        <div 
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-2 sm:p-4" 
          onClick={closeLightbox}
          style={{ touchAction: 'manipulation' }}
        >
          <button
            className="absolute top-2 right-2 sm:top-4 sm:right-4 text-white p-2 sm:p-3 rounded-full bg-black/50 backdrop-blur hover:bg-black/70 transition-colors z-10 text-lg sm:text-xl"
            onClick={closeLightbox}
            aria-label="Close"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>

          <button 
            className="absolute left-2 sm:left-4 text-white p-2 sm:p-3 rounded-full bg-black/50 backdrop-blur hover:bg-black/70 transition-colors z-10 text-lg sm:text-xl" 
            onClick={prevPhoto}
            aria-label="Previous"
          >
            <ChevronLeft className="h-6 w-6 sm:h-7 sm:w-7" />
          </button>

          <img
            src={allPhotos[lightboxIndex].src}
            alt=""
            className="max-h-[85vh] max-w-[90vw] sm:max-h-[90vh] sm:max-w-[90vw] object-contain rounded-lg sm:rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
            style={{ touchAction: 'manipulation' }}
          />

          <button 
            className="absolute right-2 sm:right-4 text-white p-2 sm:p-3 rounded-full bg-black/50 backdrop-blur hover:bg-black/70 transition-colors z-10 text-lg sm:text-xl" 
            onClick={nextPhoto}
            aria-label="Next"
          >
            <ChevronRight className="h-6 w-6 sm:h-7 sm:w-7" />
          </button>

          {/* Mobile-Friendly Photo Counter */}
          <div className="absolute bottom-2 sm:bottom-4 left-1/2 transform -translate-x-1/2 text-white bg-black/70 backdrop-blur px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm z-10 font-medium">
            {lightboxIndex + 1} / {allPhotos.length}
          </div>
        </div>
      )}-4" onClick={closeLightbox}>
          <button
            className="absolute top-4 right-4 text-white p-3 rounded-full bg-black/50 backdrop-blur hover:bg-black/70 transition-colors z-10"
            onClick={closeLightbox}
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          <button 
            className="absolute left-4 text-white p-3 rounded-full bg-black/50 backdrop-blur hover:bg-black/70 transition-colors z-10" 
            onClick={prevPhoto}
            aria-label="Previous"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>

          <img
            src={allPhotos[lightboxIndex].src}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />

          <button 
            className="absolute right-4 text-white p-3 rounded-full bg-black/50 backdrop-blur hover:bg-black/70 transition-colors z-10" 
            onClick={nextPhoto}
            aria-label="Next"
          >
            <ChevronRight className="h-7 w-7" />
          </button>

          {/* Photo counter */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white bg-black/50 backdrop-blur px-3 py-1 rounded-full text-sm z-10">
            {lightboxIndex + 1} / {allPhotos.length}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------- Enhanced Comments Thread -------------------- */
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
    <div className="flex flex-col">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-neutral-300 hover:text-blue-400 hover:bg-neutral-800/50 transition-all"
        aria-expanded={open}
      >
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
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                    U
                  </div>
                  <div className="flex-1 bg-neutral-800/30 rounded-2xl p-3">
                    <div className="text-sm font-medium text-neutral-200 mb-1">User</div>
                    <div className="text-sm text-neutral-100">{c.text}</div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-neutral-400">
                      <span>{timeAgo(new Date(c.created_at).getTime())}</span>
                      <button 
                        className="inline-flex items-center gap-1 hover:text-neutral-300" 
                        onClick={() => toggleReport(c.id)}
                      >
                        <Flag className="h-3 w-3" /> Report
                      </button>
                      {c.user_id === currentUserId && (
                        <button 
                          className="inline-flex items-center gap-1 hover:text-neutral-300" 
                          onClick={() => removeComment(c.id)}
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-medium">
                  Y
                </div>
                <Input
                  value={text}
                  onChange={(e: any) => setText(e.target.value)}
                  placeholder="Write a comment…"
                  className="flex-1 h-10"
                  onKeyPress={(e: any) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), addComment())}
                />
                <Button 
                  onClick={addComment} 
                  disabled={posting || !text.trim()}
                  size="sm"
                >
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

/* -------------------- Helper Functions -------------------- */
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
        dx > 0 ? onPrev() : onNext(); 
      } else if (absY < 10 && absX < 10) { 
        onClose(); 
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
