// src/components/dashboard/CreatorDashboard.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import VideoUploadModal from "@/components/dashboard/VideoUploadModal";
import CreatorAnalytics from "@/components/dashboard/CreatorAnalytics";
import AvatarUploader from "@/components/profile/AvatarUploader";

import {
  Video,
  Users,
  TrendingUp,
  Settings,
  Heart,
  MessageCircle,
  Shield,
  Trash2,
  Plus,
  Eye,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

/* ----------------------------- Types ----------------------------- */
interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  followers_count: number;
  following_count: number;
  spliks_count: number;
  followers_private?: boolean;
  following_private?: boolean;
}

interface SplikRow {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  likes_count?: number | null;
  comments_count?: number | null;
  views_count?: number | null;
  trim_start?: number | null; // ✅ ensure 3s loop starts where the creator set it
  trim_end?: number | null;
  profile?: {
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

interface DashboardStats {
  totalSpliks: number;
  followers: number;
  totalReactions: number;
  avgReactionsPerVideo: number;
}

interface CommentRow {
  id: string;
  user_id: string;
  splik_id: string;
  body: string;
  created_at: string;
  // Optional denormalized/user-joined fields if you store them
  user_username?: string | null;
  user_display_name?: string | null;
  user_avatar_url?: string | null;
}

/* ----------------------------- Comments Manager ----------------------------- */
function CommentsManager({
  open,
  onClose,
  splik,
  onCountChange,
}: {
  open: boolean;
  onClose: () => void;
  splik: SplikRow;
  onCountChange?: (delta: number) => void; // update dashboard count after delete
}) {
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const unsubRef = useRef<() => void>();

  const fetchComments = async () => {
    try {
      setLoading(true);
      // If you have a "comments" view that joins user fields, use that.
      // Fallback: raw comments, and you can display user_id only.
      const { data, error } = await supabase
        .from("comments")
        .select("id, user_id, splik_id, body, created_at")
        .eq("splik_id", splik.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setComments((data || []) as CommentRow[]);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load comments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    fetchComments();

    // Realtime: reflect new/deleted comments live
    const ch = supabase
      .channel(`comments-${splik.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments", filter: `splik_id=eq.${splik.id}` },
        (payload) => {
          const row = payload.new as CommentRow;
          setComments((prev) => [row, ...prev]);
          onCountChange?.(1);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "comments", filter: `splik_id=eq.${splik.id}` },
        (payload) => {
          const deletedId = (payload.old as any)?.id as string;
          setComments((prev) => prev.filter((c) => c.id !== deletedId));
          onCountChange?.(-1);
        }
      )
      .subscribe();

    unsubRef.current = () => supabase.removeChannel(ch);

    return () => {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, splik.id]);

  const handleDelete = async (commentId: string) => {
    try {
      const { error } = await supabase.from("comments").delete().eq("id", commentId).eq("splik_id", splik.id);
      if (error) throw error;
      // Realtime will update list & count via channel
      toast.success("Comment deleted");
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete comment");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Comments — {splik.title || splik.id.slice(0, 6)}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : comments.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No comments yet</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="flex items-start gap-3 rounded-lg border p-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={c.user_avatar_url || undefined} />
                  <AvatarFallback>
                    {(c.user_display_name?.[0] || c.user_username?.[0] || "U").toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {c.user_display_name || c.user_username || c.user_id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 px-2"
                      onClick={() => handleDelete(c.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <p className="text-sm mt-2 whitespace-pre-wrap break-words">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Video Management Grid (Manual Play) ----------------------------- */
const VideoManagementGrid = ({
  spliks,
  onDelete,
  onCommentCountAdjust,
}: {
  spliks: SplikRow[];
  onDelete: (id: string) => void;
  onCommentCountAdjust: (splikId: string, delta: number) => void;
}) => {
  const [selectedVideos, setSelectedVideos] = useState(new Set<string>());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [hoveredVideo, setHoveredVideo] = useState<string | null>(null);

  const [commentsFor, setCommentsFor] = useState<SplikRow | null>(null);

  const handleBulkDelete = () => {
    selectedVideos.forEach((id) => onDelete(id));
    setSelectedVideos(new Set());
  };

  const handleSelectAll = () => {
    if (selectedVideos.size === spliks.length) {
      setSelectedVideos(new Set());
    } else {
      setSelectedVideos(new Set(spliks.map((s) => s.id)));
    }
  };

  function VideoItem({ s }: { s: SplikRow }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);

    const start = Math.max(0, Number(s.trim_start ?? 0));
    const loopEnd = start + 3;

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;

      v.playsInline = true;
      v.setAttribute("playsinline", "true");
      // @ts-expect-error
      v.setAttribute("webkit-playsinline", "true");
      v.muted = true;
      v.setAttribute("muted", "true");
      v.controls = false;
      v.preload = "metadata";
      v.disablePictureInPicture = true;
      // @ts-expect-error
      v.disableRemotePlayback = true;

      const onLoaded = () => {
        try {
          v.currentTime = start;
        } catch {}
      };
      const onTimeUpdate = () => {
        if (v.currentTime >= loopEnd || v.currentTime < start) {
          try {
            v.currentTime = start;
          } catch {}
        }
      };

      v.addEventListener("loadedmetadata", onLoaded);
      v.addEventListener("timeupdate", onTimeUpdate);
      return () => {
        v.removeEventListener("loadedmetadata", onLoaded);
        v.removeEventListener("timeupdate", onTimeUpdate);
        try {
          v.pause();
        } catch {}
      };
    }, [start, loopEnd]);

    const togglePlayPause = async () => {
      const v = videoRef.current;
      if (!v) return;

      if (isPlaying) {
        try {
          v.pause();
        } catch {}
        setIsPlaying(false);
      } else {
        try {
          v.currentTime = Math.max(start, Math.min(v.currentTime, loopEnd - 0.01));
        } catch {}
        v.muted = isMuted;
        if (isMuted) v.setAttribute("muted", "true");
        else v.removeAttribute("muted");
        try {
          await v.play(); // ✅ manual user gesture → should always start
          setIsPlaying(true);
        } catch (e) {
          console.error("Play failed:", e);
          setIsPlaying(false);
        }
      }
    };

    const toggleMute = (e: React.MouseEvent) => {
      e.stopPropagation(); // don’t toggle play
      const v = videoRef.current;
      if (!v) return;
      const next = !isMuted;
      v.muted = next;
      if (next) v.setAttribute("muted", "true");
      else v.removeAttribute("muted");
      setIsMuted(next);
    };

    return (
      <div
        key={s.id}
        className="group relative bg-gray-900 rounded-xl border border-gray-800 overflow-hidden hover:border-gray-600 transition-all duration-200"
        onMouseEnter={() => setHoveredVideo(s.id)}
        onMouseLeave={() => setHoveredVideo(null)}
      >
        {/* Video area (manual play only) */}
        <div className="relative aspect-[9/16] bg-black overflow-hidden">
          {s.video_url ? (
            <>
              <video
                ref={videoRef}
                src={s.video_url}
                poster={s.thumbnail_url || undefined}
                className="absolute inset-0 w-full h-full object-cover"
                muted
                playsInline
                // @ts-expect-error vendor attr
                webkit-playsinline="true"
                preload="metadata"
                controls={false}
                controlsList="nodownload noplaybackrate noremoteplayback"
                onClick={togglePlayPause} // ✅ tap anywhere to play/pause
              />
              {/* Visible PLAY/PAUSE button in the middle that actually works */}
              <button
                aria-label={isPlaying ? "Pause" : "Play"}
                onClick={togglePlayPause}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="bg-black/45 rounded-full p-4">
                  {isPlaying ? (
                    <svg className="h-10 w-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                    </svg>
                  ) : (
                    <svg className="h-10 w-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </div>
              </button>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <Video className="h-12 w-12 text-gray-600" />
            </div>
          )}

          {/* Top-left: Select checkbox (doesn't cancel play) */}
          <div
            className={`absolute top-3 left-3 transition-opacity duration-200 ${
              hoveredVideo === s.id || selectedVideos.has(s.id) ? "opacity-100" : "opacity-0"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className="w-5 h-5 rounded border-2 border-white bg-black/50 text-blue-500 focus:ring-blue-500"
              checked={selectedVideos.has(s.id)}
              onChange={(e) => {
                const next = new Set(selectedVideos);
                if (e.target.checked) next.add(s.id);
                else next.delete(s.id);
                setSelectedVideos(next);
              }}
            />
          </div>

          {/* Top-right: Delete (doesn't cancel play) */}
          <div
            className={`absolute top-3 right-3 transition-opacity duration-200 ${
              hoveredVideo === s.id ? "opacity-100" : "opacity-0"
            }`}
          >
            <Button
              size="sm"
              variant="destructive"
              className="h-8 w-8 p-0 bg-red-900 hover:bg-red-800 shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(s.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Bottom-right: Mute toggle (doesn't cancel play) */}
          <button
            onClick={toggleMute}
            className="absolute bottom-3 right-3 z-10 bg-black/60 hover:bg-black/70 rounded-full p-2 ring-1 ring-white/40 shadow-md"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="h-5 w-5 text-white" /> : <Volume2 className="h-5 w-5 text-white" />}
          </button>

          {/* Bottom overlay: stats and open comments manager */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
            <div className="flex items-center justify-between text-white text-sm">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  <span>{s.views_count || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Heart className="h-4 w-4" />
                  <span>{s.likes_count || 0}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCommentsFor(s);
                  }}
                  className="flex items-center gap-1 hover:opacity-80"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>{s.comments_count || 0}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="p-4">
          <h4 className="font-semibold text-white truncate mb-1">
            {s.title || `Video ${s.id.slice(0, 8)}`}
          </h4>
          {s.description && <p className="text-sm text-gray-400 line-clamp-2 mb-2">{s.description}</p>}
          <p className="text-xs text-gray-500">{new Date(s.created_at).toLocaleDateString()}</p>
          {/* Manage comments button (optional second entry point) */}
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCommentsFor(s)}
              className="gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              Manage comments
            </Button>
          </div>
        </div>

        {/* Comments Manager Modal for this card */}
        {commentsFor?.id === s.id && (
          <CommentsManager
            open={!!commentsFor}
            onClose={() => setCommentsFor(null)}
            splik={s}
            onCountChange={(delta) => onCommentCountAdjust(s.id, delta)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Management Header */}
      <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-xl border border-gray-800">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-white">Video Management</h3>
          <Badge variant="outline" className="bg-gray-800 text-gray-300 border-gray-700">
            {spliks.length} videos
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          {spliks.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
            >
              {selectedVideos.size === spliks.length ? "Deselect All" : "Select All"}
            </Button>
          )}

          {selectedVideos.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              className="bg-red-900 hover:bg-red-800"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete {selectedVideos.size} selected
            </Button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {spliks.map((s) => (
          <VideoItem key={s.id} s={s} />
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4 bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Delete Video</CardTitle>
              <CardDescription className="text-gray-400">
                Are you sure you want to delete this video? This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => {
                  onDelete(showDeleteConfirm);
                  setShowDeleteConfirm(null);
                }}
                className="flex-1 bg-red-900 hover:bg-red-800"
              >
                Delete
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

/* ----------------------------- Main Component ----------------------------- */
const CreatorDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [spliks, setSpliks] = useState<SplikRow[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalSpliks: 0,
    followers: 0,
    totalReactions: 0,
    avgReactionsPerVideo: 0,
  });

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    display_name: "",
    bio: "",
    avatar_url: "",
  });

  const channelCleanup = useRef<null | (() => void)>(null);

  /* ------------------------ Auth + initial load ------------------------ */
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id || null;
      if (!uid) {
        navigate("/login");
        return;
      }
      setCurrentUserId(uid);

      // admin check
      try {
        const { data: adminRow } = await supabase
          .from("admin_users")
          .select("user_id")
          .eq("user_id", uid)
          .maybeSingle();
        setIsAdmin(!!adminRow?.user_id);
      } catch {
        setIsAdmin(false);
      }

      await Promise.all([fetchProfile(uid), fetchSpliks(uid)]);
      setupRealtime(uid);
      setLoading(false);
    })();

    return () => {
      if (channelCleanup.current) {
        try {
          channelCleanup.current();
        } catch {}
        channelCleanup.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------- Realtime ---------------------------- */
  const setupRealtime = (uid: string) => {
    if (channelCleanup.current) {
      try {
        channelCleanup.current();
      } catch {}
      channelCleanup.current = null;
    }

    const ch = supabase
      .channel("creator-dashboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "spliks", filter: `user_id=eq.${uid}` },
        (payload) => {
          const row = payload.new as SplikRow;
          setSpliks((prev) => [{ ...row, profile: prev[0]?.profile ?? null }, ...prev]);
          recomputeStatsFromList((prev) => [{ ...row, profile: prev[0]?.profile ?? null }, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "spliks", filter: `user_id=eq.${uid}` },
        (payload) => {
          const row = payload.new as SplikRow;
          setSpliks((prev) => prev.map((s) => (s.id === row.id ? { ...s, ...row } : s)));
          recomputeStatsFromList((prev) => prev.map((s) => (s.id === row.id ? { ...s, ...row } : s)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "spliks", filter: `user_id=eq.${uid}` },
        (payload) => {
          const deletedId = (payload.old as any)?.id as string;
          setSpliks((prev) => prev.filter((s) => s.id !== deletedId));
          recomputeStatsFromList((prev) => prev.filter((s) => s.id !== deletedId));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments" },
        (_payload) => {
          // some video got a new comment — bump its count if we have it
          // (exact per-video bump handled in CommentsManager realtime too)
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "comments" },
        (_payload) => {
          // handled locally in CommentsManager for active video
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        (payload) => {
          const p = payload.new as Profile;
          setProfile(p);
          updateStatsFromProfile(p);
        }
      )
      .subscribe();

    channelCleanup.current = () => supabase.removeChannel(ch);
  };

  /* ----------------------------- Fetchers ----------------------------- */
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (error) throw error;

      setProfile(data as Profile);
      setFormData({
        username: data.username || "",
        display_name: data.display_name || "",
        bio: data.bio || "",
        avatar_url: data.avatar_url || "",
      });
      updateStatsFromProfile(data as Profile);
    } catch (e) {
      console.error("Error fetching profile:", e);
    }
  };

  const fetchSpliks = async (userId: string) => {
    try {
      const { data: rows, error } = await supabase
        .from("spliks")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      let prof: Profile | null = null;
      try {
        const { data } = await supabase
          .from("profiles")
          .select("username, display_name, avatar_url")
          .eq("id", userId)
          .single();
        prof = (data as any) || null;
      } catch {}

      const merged: SplikRow[] = (rows || []).map((r: any) => ({ ...(r as SplikRow), profile: prof }));
      setSpliks(merged);
      recomputeStatsFromList(merged);
    } catch (e) {
      console.error("Error fetching videos:", e);
    }
  };

  /* ------------------------- Stats helpers ------------------------- */
  const updateStatsFromProfile = (p: Profile) => {
    setStats((prev) => ({
      ...prev,
      followers: p.followers_count ?? 0,
      totalSpliks: p.spliks_count ?? 0,
    }));
  };

  const recomputeStatsFromList = (
    listOrUpdater: SplikRow[] | ((prev: SplikRow[]) => SplikRow[])
  ) => {
    setSpliks((prev) => {
      const list = typeof listOrUpdater === "function" ? (listOrUpdater as any)(prev) : listOrUpdater;
      const totalReactions =
        list.reduce((acc, s) => acc + (s.likes_count || 0) + (s.comments_count || 0), 0) || 0;
      const totalSpliks = list.length;
      const avgReactionsPerVideo = totalSpliks > 0 ? Math.round(totalReactions / totalSpliks) : 0;

      setStats((st) => ({
        ...st,
        totalSpliks,
        totalReactions,
        avgReactionsPerVideo,
      }));
      return list;
    });
  };

  /* ------------------------- Comments count adjust ------------------------- */
  const handleCommentCountAdjust = (splikId: string, delta: number) => {
    setSpliks((prev) =>
      prev.map((s) =>
        s.id === splikId ? { ...s, comments_count: Math.max(0, (s.comments_count ?? 0) + delta) } : s
      )
    );
  };

  /* ------------------------- Delete video ------------------------- */
  const handleDeleteVideo = async (videoId: string) => {
    if (!currentUserId) return;

    try {
      const { error } = await supabase.from("spliks").delete().eq("id", videoId).eq("user_id", currentUserId);
      if (error) throw error;
      toast.success("Video deleted successfully");
      // Realtime will handle UI update
    } catch (error) {
      console.error("Error deleting video:", error);
      toast.error("Failed to delete video");
    }
  };

  /* ------------------------- Profile update ------------------------- */
  const handleProfileUpdate = async () => {
    if (!currentUserId) return;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username: formData.username,
          display_name: formData.display_name,
          bio: formData.bio,
          avatar_url: formData.avatar_url,
        })
        .eq("id", currentUserId);
      if (error) throw error;

      toast.success("Profile updated successfully");
      setEditingProfile(false);
      fetchProfile(currentUserId);
    } catch (error: any) {
      if (error.message?.includes("duplicate key")) {
        toast.error("Username already taken");
      } else {
        toast.error("Failed to update profile");
      }
    }
  };

  const togglePrivacy = async (field: "followers_private" | "following_private") => {
    if (!currentUserId || !profile) return;
    const newValue = !profile[field];
    try {
      const { error } = await supabase.from("profiles").update({ [field]: newValue }).eq("id", currentUserId);
      if (error) throw error;

      setProfile({ ...profile, [field]: newValue });
      toast.success(`${field === "followers_private" ? "Followers" : "Following"} privacy updated`);
    } catch (e) {
      console.error("Error updating privacy:", e);
      toast.error("Failed to update privacy settings");
    }
  };

  /* ------------------------------ UI ------------------------------ */
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            {/* Profile Info */}
            <div className="flex items-center gap-6">
              <Avatar className="h-20 w-20 ring-4 ring-blue-500/20">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-gray-800 text-2xl">
                  {profile?.display_name?.[0] || profile?.username?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  {profile?.display_name || "Creator Dashboard"}
                </h1>
                <p className="text-gray-400 mt-1">@{profile?.username || "username"}</p>
                {profile?.bio && <p className="text-gray-300 mt-2 max-w-md">{profile.bio}</p>}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setUploadModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 gap-2"
              >
                <Plus className="h-4 w-4" />
                Upload Video
              </Button>

              {isAdmin && (
                <Button
                  variant="outline"
                  className="gap-2 bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                  onClick={() => navigate("/admin")}
                >
                  <Shield className="h-4 w-4" />
                  Admin
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">Total Videos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-white">{stats.totalSpliks}</div>
                <div className="p-3 bg-blue-500/10 rounded-full">
                  <Video className="h-6 w-6 text-blue-400" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">Videos uploaded</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">Total Reactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-white">{stats.totalReactions}</div>
                <div className="flex items-center gap-2 p-3 bg-pink-500/10 rounded-full">
                  <Heart className="h-6 w-6 text-pink-400" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">Likes + comments</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">Followers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-white">{stats.followers}</div>
                <div className="p-3 bg-green-500/10 rounded-full">
                  <Users className="h-6 w-6 text-green-400" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">Your community</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">Avg Reactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-white">{stats.avgReactionsPerVideo}</div>
                <div className="p-3 bg-purple-500/10 rounded-full">
                  <TrendingUp className="h-6 w-6 text-purple-400" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">Per video</p>
            </CardContent>
          </Card>
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="videos" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-gray-900 border-gray-800">
            <TabsTrigger value="videos" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white">
              My Videos
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white">
              Analytics
            </TabsTrigger>
            <TabsTrigger value="profile" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white">
              Profile Settings
            </TabsTrigger>
          </TabsList>

          {/* My Videos */}
          <TabsContent value="videos" className="mt-8">
            {spliks.length > 0 ? (
              <VideoManagementGrid
                spliks={spliks}
                onDelete={handleDeleteVideo}
                onCommentCountAdjust={handleCommentCountAdjust}
              />
            ) : (
              <Card className="p-12 text-center bg-gray-900 border-gray-800">
                <Video className="h-16 w-16 mx-auto text-gray-600 mb-6" />
                <h3 className="text-xl font-semibold text-white mb-2">No videos yet</h3>
                <p className="text-gray-400 mb-6">Start building your content library</p>
                <Button onClick={() => setUploadModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 gap-2">
                  <Plus className="h-4 w-4" />
                  Upload Your First Video
                </Button>
              </Card>
            )}
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics" className="mt-8">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Performance Overview</CardTitle>
                <CardDescription className="text-gray-400">Track your content performance and growth</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-400">This Week's Reactions</p>
                    <p className="text-2xl font-bold text-white">{stats.totalReactions}</p>
                  </div>
                  <Badge variant="secondary" className="bg-green-900 text-green-300">
                    Live
                  </Badge>
                </div>

                <CreatorAnalytics spliks={spliks} stats={stats} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Profile Settings */}
          <TabsContent value="profile" className="mt-8">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Profile Settings</CardTitle>
                <CardDescription className="text-gray-400">Manage your creator profile</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Keep your existing profile editing UI here.
                    Below is a compact version to match your original structure. */}
                <div className="space-y-6">
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Profile Photo</p>
                    <AvatarUploader
                      value={formData.avatar_url || profile?.avatar_url}
                      onChange={(url) => setFormData((f) => ({ ...f, avatar_url: url }))}
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      JPG/PNG recommended. We'll compress for faster loading.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="username" className="text-gray-300">Username</Label>
                    <Input
                      id="username"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="@username"
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>

                  <div>
                    <Label htmlFor="display_name" className="text-gray-300">Display Name</Label>
                    <Input
                      id="display_name"
                      value={formData.display_name}
                      onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                      placeholder="Your display name"
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>

                  <div>
                    <Label htmlFor="bio" className="text-gray-300">Bio</Label>
                    <Textarea
                      id="bio"
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      placeholder="Tell us about yourself"
                      rows={4}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleProfileUpdate} className="bg-blue-600 hover:bg-blue-700">
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setEditingProfile(false)}
                      className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                    >
                      Cancel
                    </Button>
                  </div>

                  <div className="border-t border-gray-800 pt-6 space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg">
                      <div>
                        <p className="font-medium text-white text-sm">Followers List</p>
                        <p className="text-xs text-gray-400">
                          {profile?.followers_private
                            ? "Private — Only you can see your followers"
                            : "Public — Anyone can see your followers"}
                        </p>
                      </div>
                      <Switch
                        checked={profile?.followers_private || false}
                        onCheckedChange={() => togglePrivacy("followers_private")}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg">
                      <div>
                        <p className="font-medium text-white text-sm">Following List</p>
                        <p className="text-xs text-gray-400">
                          {profile?.following_private
                            ? "Private — Only you can see who you follow"
                            : "Public — Anyone can see who you follow"}
                        </p>
                      </div>
                      <Switch
                        checked={profile?.following_private || false}
                        onCheckedChange={() => togglePrivacy("following_private")}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Upload modal */}
      <VideoUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadComplete={() => {
          if (currentUserId) fetchSpliks(currentUserId);
          setUploadModalOpen(false);
        }}
      />
    </div>
  );
};

export default CreatorDashboard;
