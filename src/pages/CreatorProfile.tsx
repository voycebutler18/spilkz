// src/pages/CreatorProfile.tsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { VideoGrid } from "@/components/VideoGrid";
import FollowButton from "@/components/FollowButton";
import FollowersList from "@/components/FollowersList";
import { 
  MapPin, 
  Calendar, 
  Film, 
  Users, 
  TrendingUp, 
  Camera, 
  Play,
  Eye,
  Heart,
  MessageSquare,
  Share,
  Settings,
  Grid3X3,
  Bookmark,
  Link as LinkIcon,
  MoreHorizontal
} from "lucide-react";
import { toast } from "sonner";

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  bio: string | null;
  avatar_url: string | null;
  city: string | null;
  followers_count: number;
  following_count: number;
  spliks_count: number;
  is_private: boolean;
  created_at: string;
  followers_private?: boolean;
  following_private?: boolean;
}

interface PhotoItem {
  id: string;
  user_id: string;
  photo_url: string;
  created_at: string;
  description?: string | null;
  location?: string | null;
}

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

const PHOTOS_BUCKET = import.meta.env.VITE_PHOTOS_BUCKET || "vibe_photos";

export default function CreatorProfile() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [spliks, setSpliks] = useState<any[]>([]);
  const [boostedSpliks, setBoostedSpliks] = useState<any[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [boostedLoading, setBoostedLoading] = useState(false);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showFollowersList, setShowFollowersList] = useState(false);
  const [showFollowingList, setShowFollowingList] = useState(false);
  const [activeTab, setActiveTab] = useState("posts");

  const unsubRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Resolve profile slug
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const s = (slug || "").trim();

      if (!s) {
        const { data: session } = await supabase.auth.getSession();
        const uid = session?.session?.user?.id;
        if (uid) {
          const { data: me } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", uid)
            .maybeSingle();
          if (me?.username) {
            navigate(`/creator/${me.username}`, { replace: true });
          } else {
            navigate(`/creator/${uid}`, { replace: true });
          }
          return;
        }
        setLoading(false);
        setProfile(null);
        return;
      }

      setLoading(true);
      setProfile(null);
      setSpliks([]);
      setBoostedSpliks([]);
      setPhotos([]);

      try {
        let profileData: Profile | null = null;

        if (!isUuid(s)) {
          let { data } = await supabase
            .from("profiles")
            .select("*")
            .ilike("username", s)
            .maybeSingle<Profile>();

          if (!data) {
            const byLower = await supabase
              .from("profiles")
              .select("*")
              .eq("username", s.toLowerCase())
              .maybeSingle<Profile>();
            data = byLower.data || null;
          }
          profileData = data;
        }

        if (!profileData && isUuid(s)) {
          const byId = await supabase
            .from("profiles")
            .select("*")
            .eq("id", s)
            .maybeSingle<Profile>();
          profileData = byId.data || null;

          if (profileData?.username && s !== profileData.username) {
            navigate(`/creator/${profileData.username}`, { replace: true });
            return;
          }
        }

        if (!profileData && !isUuid(s)) {
          const { data } = await supabase
            .from("profiles")
            .select("*")
            .eq("username", s)
            .maybeSingle<Profile>();
          profileData = data;
        }

        if (!profileData) {
          if (!cancelled) {
            setProfile(null);
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;

        setProfile(profileData);
        await fetchSpliks(profileData.id, cancelled);
        await fetchBoostedSpliks(profileData.id, cancelled);
        await fetchPhotos(profileData.id, cancelled);
        await refreshCounts(profileData.id);
      } catch (e) {
        console.error("Error resolving profile:", e);
        if (!cancelled) {
          toast.error("Failed to load profile");
          setProfile(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [slug, navigate]);

  const refreshCounts = async (profileId: string) => {
    try {
      const [followersResult, followingResult, spliksResult] = await Promise.all([
        supabase
          .from("followers")
          .select("id", { count: "exact" })
          .eq("following_id", profileId),
        supabase
          .from("followers")
          .select("id", { count: "exact" })
          .eq("follower_id", profileId),
        supabase
          .from("spliks")
          .select("id", { count: "exact" })
          .eq("user_id", profileId)
          .eq("status", "active")
      ]);

      const followersCount = followersResult.count || 0;
      const followingCount = followingResult.count || 0;
      const spliksCount = spliksResult.count || 0;

      setProfile((prev) => (prev ? {
        ...prev,
        followers_count: followersCount,
        following_count: followingCount,
        spliks_count: spliksCount
      } as Profile : prev));

      await supabase
        .from("profiles")
        .update({
          followers_count: followersCount,
          following_count: followingCount,
          spliks_count: spliksCount
        })
        .eq("id", profileId);

    } catch (error) {
      console.error("Error refreshing counts:", error);
    }
  };

  const fetchSpliks = async (userId: string, cancelled?: boolean) => {
    try {
      const { data, error } = await supabase
        .from("spliks")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .not("video_url", "is", null) // Block photos from videos tab
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (cancelled) return;

      const spliksWithProfiles = await Promise.all(
        (data || []).map(async (s) => {
          const { data: p } = await supabase
            .from("profiles")
            .select("username, display_name, first_name, last_name, avatar_url")
            .eq("id", s.user_id)
            .maybeSingle();
          return { ...s, profiles: p || undefined };
        })
      );

      if (!cancelled) setSpliks(spliksWithProfiles);
    } catch (e) {
      console.error("Error fetching videos:", e);
      if (!cancelled) toast.error("Failed to load videos");
    }
  };

  const fetchBoostedSpliks = async (userId: string, cancelled?: boolean) => {
    try {
      setBoostedLoading(true);

      const { data: boostRows, error: boostsErr } = await supabase
        .from("boosts")
        .select("splik_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (boostsErr) throw boostsErr;

      if (!boostRows?.length) {
        if (!cancelled) setBoostedSpliks([]);
        return;
      }

      const ids = boostRows.map((r) => r.splik_id);

      const { data: splikRows, error: spliksErr } = await supabase
        .from("spliks")
        .select("*")
        .in("id", ids)
        .eq("status", "active");

      if (spliksErr) throw spliksErr;

      const withProfiles = await Promise.all(
        (splikRows || []).map(async (s) => {
          const { data: p } = await supabase
            .from("profiles")
            .select("username, display_name, first_name, last_name, avatar_url")
            .eq("id", s.user_id)
            .maybeSingle();
          return { ...s, profiles: p || undefined };
        })
      );

      const orderIndex: Record<string, number> = {};
      boostRows.forEach((r, i) => (orderIndex[r.splik_id] = i));
      withProfiles.sort((a, b) => (orderIndex[a.id] ?? 0) - (orderIndex[b.id] ?? 0));

      if (!cancelled) setBoostedSpliks(withProfiles);
    } catch (e) {
      console.error("Error fetching boosted videos:", e);
      if (!cancelled) toast.error("Failed to load boosted videos");
    } finally {
      if (!cancelled) setBoostedLoading(false);
    }
  };

  const fetchPhotos = async (userId: string, cancelled?: boolean) => {
    try {
      setPhotosLoading(true);

      // Fetch photos from spliks table (where photos are actually stored)
      const { data, error } = await supabase
        .from("spliks")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .is("video_url", null) // Photos have null video_url
        .not("thumbnail_url", "is", null) // But have thumbnail_url (the photo)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (cancelled) return;

      const photoItems: PhotoItem[] = (data || []).map((r: any) => ({
        id: String(r.id), // Use spliks table ID
        user_id: String(r.user_id),
        photo_url: String(r.thumbnail_url), // Photo is stored in thumbnail_url
        created_at: r.created_at || new Date().toISOString(),
        description: r.description || r.title || null,
        location: null, // Not stored in spliks table
      }));

      if (!cancelled) setPhotos(photoItems);
    } catch (e) {
      console.error("Error fetching photos:", e);
      if (!cancelled) toast.error("Failed to load photos");
    } finally {
      if (!cancelled) setPhotosLoading(false);
    }
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const displayName = (p?: Profile | null) => {
    if (!p) return "User";
    const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    return p.display_name?.trim() || full || p.username?.trim() || "User";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <div className="bg-gray-800 rounded-3xl p-12 border border-gray-700">
            <h2 className="text-3xl font-bold text-white mb-4">Profile not found</h2>
            <p className="text-gray-400 mb-8">
              The profile you're looking for doesn't exist or may have been removed.
            </p>
            <Button 
              onClick={() => navigate("/")}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const nameOrUsername = displayName(profile);

  // Mock posts based on spliks and photos for the grid display
  const mockPosts = [...spliks, ...photos].map((item, i) => ({
    id: item.id.toString(),
    thumbnail: item.thumbnail_url || item.photo_url || `/api/placeholder/300/300`,
    type: item.video_url ? "video" : "image",
    boosts: Math.floor(Math.random() * 1000),
    comments: Math.floor(Math.random() * 100),
  }));

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Profile Header */}
      <Card className="p-6 bg-card border-border shadow-card mb-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <Avatar className="w-32 h-32 border-4 border-primary/20">
              <AvatarImage src={profile.avatar_url || ""} />
              <AvatarFallback className="bg-gradient-primary text-white text-4xl font-bold">
                {nameOrUsername.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Profile Info */}
          <div className="flex-1">
            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{profile.username || nameOrUsername}</h1>
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  ✓ Verified
                </Badge>
              </div>
              
              <div className="flex gap-2">
                {currentUserId === profile.id ? (
                  <Button variant="outline" className="gap-2">
                    <Settings className="w-4 h-4" />
                    Edit Profile
                  </Button>
                ) : (
                  <FollowButton
                    profileId={profile.id}
                    username={profile.username || ""}
                    className="bg-primary hover:bg-primary/90"
                  />
                )}
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-6 mb-4">
              <div className="text-center">
                <div className="text-xl font-bold">{(profile.spliks_count || 0).toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Posts</div>
              </div>
              <button
                onClick={() => setShowFollowersList(true)}
                className="text-center hover:opacity-80 transition-opacity"
              >
                <div className="text-xl font-bold">{(profile.followers_count || 0).toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Followers</div>
              </button>
              <button
                onClick={() => setShowFollowingList(true)}
                className="text-center hover:opacity-80 transition-opacity"
              >
                <div className="text-xl font-bold">{(profile.following_count || 0).toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Following</div>
              </button>
              <div className="text-center">
                <div className="text-xl font-bold">{Math.floor(Math.random() * 15000 + 1000).toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Total Boosts</div>
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="mb-4 leading-relaxed">{profile.bio}</p>
            )}

            {/* Additional Info */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {profile.city && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {profile.city}
                </div>
              )}
              <div className="flex items-center gap-1">
                <LinkIcon className="w-4 h-4" />
                <span className="text-primary hover:underline">
                  {profile.username ? `${profile.username}.com` : "website.com"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Joined {formatDate(profile.created_at)}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="posts" className="gap-2">
            <Grid3X3 className="w-4 h-4" />
            Posts
          </TabsTrigger>
          <TabsTrigger value="saved" className="gap-2">
            <Bookmark className="w-4 h-4" />
            Saved
          </TabsTrigger>
          <TabsTrigger value="boosted" className="gap-2">
            <Heart className="w-4 h-4" />
            Boosted
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          <div className="grid grid-cols-3 md:grid-cols-4 gap-1">
            {mockPosts.map((post) => (
              <div
                key={post.id}
                className="relative aspect-square bg-muted rounded-lg overflow-hidden group cursor-pointer"
              >
                <img
                  src={post.thumbnail}
                  alt="Post"
                  className="w-full h-full object-cover transition-smooth group-hover:scale-105"
                />
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-smooth flex items-center justify-center">
                  <div className="flex items-center gap-4 text-white">
                    <div className="flex items-center gap-1">
                      <Heart className="w-5 h-5 fill-current" />
                      <span className="font-medium">{post.boosts}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-5 h-5" />
                      <span className="font-medium">{post.comments}</span>
                    </div>
                  </div>
                </div>

                {/* Video indicator */}
                {post.type === "video" && (
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-background/80 text-foreground text-xs">
                      3s
                    </Badge>
                  </div>
                )}
              </div>
            ))}
          </div>

          {mockPosts.length === 0 && (
            <div className="text-center py-12">
              <Grid3X3 className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
              <p className="text-muted-foreground">
                Start sharing your moments with the world
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="saved">
          <div className="text-center py-12">
            <Bookmark className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No saved posts</h3>
            <p className="text-muted-foreground">
              Posts you save will appear here
            </p>
          </div>
        </TabsContent>

        <TabsContent value="boosted">
          {boostedLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4" />
              <p className="text-muted-foreground">Loading boosted posts...</p>
            </div>
          ) : boostedSpliks.length > 0 ? (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-1">
              {boostedSpliks.map((splik) => (
                <div
                  key={splik.id}
                  className="relative aspect-square bg-muted rounded-lg overflow-hidden group cursor-pointer"
                >
                  <img
                    src={splik.thumbnail_url || `/api/placeholder/300/300`}
                    alt="Boosted Post"
                    className="w-full h-full object-cover transition-smooth group-hover:scale-105"
                  />
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-smooth flex items-center justify-center">
                    <div className="flex items-center gap-4 text-white">
                      <div className="flex items-center gap-1">
                        <Heart className="w-5 h-5 fill-current" />
                        <span className="font-medium">{Math.floor(Math.random() * 1000)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-5 h-5" />
                        <span className="font-medium">{Math.floor(Math.random() * 100)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Video indicator */}
                  {splik.video_url && (
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-background/80 text-foreground text-xs">
                        3s
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Heart className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No boosted posts</h3>
              <p className="text-muted-foreground">
                Posts you boost will appear here
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <FollowersList
        profileId={profile.id}
        isOpen={showFollowersList}
        onClose={() => setShowFollowersList(false)}
        type="followers"
        count={profile.followers_count}
        isPrivate={profile.followers_private || false}
        isOwnProfile={currentUserId === profile.id}
      />

      <FollowersList
        profileId={profile.id}
        isOpen={showFollowingList}
        onClose={() => setShowFollowingList(false)}
        type="following"
        count={profile.following_count}
        isPrivate={profile.following_private || false}
        isOwnProfile={currentUserId === profile.id}
      />
    </div>
  );
}
