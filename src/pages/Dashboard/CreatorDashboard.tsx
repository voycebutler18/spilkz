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

import VideoUploadModal from "@/components/dashboard/VideoUploadModal";
import CreatorAnalytics from "@/components/dashboard/CreatorAnalytics";
import AvatarUploader from "@/components/profile/AvatarUploader";

import { Video, Users, TrendingUp, Settings, Heart, MessageCircle, Shield, Eye, Trash2, MoreVertical, Play } from "lucide-react";
import { toast } from "sonner";

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

/* ----------------------------- Enhanced Video Grid Component ----------------------------- */
const EnhancedVideoGrid = ({ spliks, onDelete }: { spliks: SplikRow[], onDelete: (id: string) => void }) => {
  const [selectedVideos, setSelectedVideos] = useState(new Set<string>());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num?.toString() || "0";
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const handleBulkDelete = () => {
    selectedVideos.forEach(id => onDelete(id));
    setSelectedVideos(new Set());
  };

  const VideoCard = ({ splik }: { splik: SplikRow }) => (
    <div className="group relative bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 transition-colors">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted">
        {splik.thumbnail_url ? (
          <img 
            src={splik.thumbnail_url} 
            alt={splik.title || "Video thumbnail"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Video className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        
        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
          <div className="bg-primary rounded-full p-3">
            <Play className="h-6 w-6 text-primary-foreground fill-current ml-1" />
          </div>
        </div>

        {/* View count */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 text-white text-xs px-2 py-1 rounded">
          <Eye className="h-3 w-3" />
          <span>{formatNumber(splik.views_count || 0)}</span>
        </div>

        {/* Selection checkbox */}
        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-2 border-white bg-black/50"
            checked={selectedVideos.has(splik.id)}
            onChange={(e) => {
              const newSelected = new Set(selectedVideos);
              if (e.target.checked) {
                newSelected.add(splik.id);
              } else {
                newSelected.delete(splik.id);
              }
              setSelectedVideos(newSelected);
            }}
          />
        </div>

        {/* Delete button */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="destructive"
            className="h-8 w-8 p-0"
            onClick={() => setShowDeleteConfirm(splik.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-medium text-sm mb-2 line-clamp-2">
          {splik.title || "Untitled"}
        </h3>
        
        {splik.description && (
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
            {splik.description}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Heart className="h-3 w-3" />
              <span>{splik.likes_count || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              <span>{splik.comments_count || 0}</span>
            </div>
          </div>
          <span>{formatDate(splik.created_at)}</span>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm === splik.id && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Delete Video</CardTitle>
              <CardDescription>
                Are you sure you want to delete "{splik.title || 'this video'}"? This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button 
                variant="destructive" 
                onClick={() => {
                  onDelete(splik.id);
                  setShowDeleteConfirm(null);
                }}
                className="flex-1"
              >
                Delete
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1"
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Bulk actions */}
      {selectedVideos.size > 0 && (
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <Badge variant="secondary">{selectedVideos.size} selected</Badge>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={handleBulkDelete}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Selected
          </Button>
        </div>
      )}

      {/* Video grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {spliks.map((splik) => (
          <VideoCard key={splik.id} splik={splik} />
        ))}
      </div>
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
          setSpliks((prev) =>
            prev.map((s) => (s.id === row.id ? { ...s, ...row } : s))
          );
          recomputeStatsFromList((prev) =>
            prev.map((s) => (s.id === row.id ? { ...s, ...row } : s))
          );
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

      const merged: SplikRow[] =
        rows?.map((r) => ({ ...(r as SplikRow), profile: prof })) ?? [];

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

  const recomputeStatsFromList = (listOrUpdater: SplikRow[] | ((prev: SplikRow[]) => SplikRow[])) => {
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

  /* ------------------------- Delete Functions ------------------------- */
  const handleDeleteVideo = async (videoId: string) => {
    if (!currentUserId) return;
    
    try {
      const { error } = await supabase
        .from("spliks")
        .delete()
        .eq("id", videoId)
        .eq("user_id", currentUserId);
      
      if (error) throw error;
      
      toast.success("Video deleted successfully");
      // Realtime will handle the UI update
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
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Title row */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Creator Dashboard
          </h1>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => navigate("/admin")}
                title="Open Admin Console"
              >
                <Shield className="h-4 w-4" />
                Admin
              </Button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Videos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{stats.totalSpliks}</div>
                <Video className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Videos uploaded</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Reactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{stats.totalReactions}</div>
                <div className="flex items-center gap-2 text-primary">
                  <Heart className="h-5 w-5" />
                  <MessageCircle className="h-5 w-5" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Likes + comments across all videos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Followers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{stats.followers}</div>
                <Users className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Build your community</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Reactions / Video</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{stats.avgReactionsPerVideo}</div>
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Average engagement per post</p>
            </CardContent>
          </Card>
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="videos" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="videos">My Videos</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="profile">Profile Settings</TabsTrigger>
          </TabsList>

          {/* My Videos */}
          <TabsContent value="videos" className="mt-6">
            {spliks.length > 0 ? (
              <EnhancedVideoGrid spliks={spliks} onDelete={handleDeleteVideo} />
            ) : (
              <Card className="p-12 text-center">
                <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No videos uploaded yet</p>
                <Button onClick={() => setUploadModalOpen(true)}>Upload Your First Video</Button>
              </Card>
            )}
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Overview</CardTitle>
                <CardDescription>Track your content performance and growth</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-accent/50 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">This Week's Reactions</p>
                    <p className="text-2xl font-bold">{stats.totalReactions}</p>
                  </div>
                  <Badge variant="secondary">Live</Badge>
                </div>

                <CreatorAnalytics spliks={spliks} stats={stats} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Profile Settings */}
          <TabsContent value="profile" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>Manage your creator profile</CardDescription>
              </CardHeader>
              <CardContent>
                {editingProfile ? (
                  <div className="space-y-6">
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Profile Photo</p>
                      <AvatarUploader
                        value={formData.avatar_url || profile?.avatar_url}
                        onChange={(url) => setFormData((f) => ({ ...f, avatar_url: url }))}
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        JPG/PNG recommended. We'll compress for faster loading.
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        placeholder="@username"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        This will be your unique identifier
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="display_name">Display Name</Label>
                      <Input
                        id="display_name"
                        value={formData.display_name}
                        onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                        placeholder="Your display name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="bio">Bio</Label>
                      <Textarea
                        id="bio"
                        value={formData.bio}
                        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                        placeholder="Tell us about yourself"
                        rows={4}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handleProfileUpdate}>Save Changes</Button>
                      <Button variant="outline" onClick={() => setEditingProfile(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-16 w-16 ring-2 ring-primary/20">
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback>
                          {profile?.display_name?.[0] || profile?.username?.[0] || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm text-muted-foreground">Signed in as</p>
                        <p className="font-medium">@{profile?.username || "Not set"}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">Display Name</p>
                      <p className="font-medium">{profile?.display_name || "Not set"}</p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">Bio</p>
                      <p className="font-medium break-words">{profile?.bio || "No bio yet"}</p>
                    </div>

                    {profile?.username && (
                      <div>
                        <p className="text-sm text-muted-foreground">Public Profile</p>
                        <a
                          href={`/creator/${profile.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          View Public Profile
                        </a>
                      </div>
                    )}

                    <div className="border-t pt-4 mt-2 space-y-4">
                      <h3 className="font-semibold text-sm">Privacy Settings</h3>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-medium text-sm">Followers List</p>
                            <p className="text-xs text-muted-foreground">
                              {profile?.followers_private
                                ? "Private — Only you can see"
                                : "Public — Anyone can see"}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={profile?.followers_private || false}
                          onCheckedChange={() => togglePrivacy("followers_private")}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-medium text-sm">Following List</p>
                            <p className="text-xs text-muted-foreground">
                              {profile?.following_private
                                ? "Private — Only you can see"
                                : "Public — Anyone can see"}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={profile?.following_private || false}
                          onCheckedChange={() => togglePrivacy("following_private")}
                        />
                      </div>
                    </div>

                    <Button onClick={() => setEditingProfile(true)}>
                      <Settings className="mr-2 h-4 w-4" />
                      Edit Profile
                    </Button>
                  </div>
                )}
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
