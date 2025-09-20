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
  const [totalBoosts, setTotalBoosts] = useState(0);

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
        await fetchTotalBoosts(profileData.id, cancelled);
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

  const fetchTotalBoosts = async (userId: string, cancelled?: boolean) => {
    try {
      const { count, error } = await supabase
        .from("boosts")
        .select("id", { count: "exact" })
        .eq("user_id", userId);

      if (error) throw error;
      if (!cancelled) setTotalBoosts(count || 0);
    } catch (e) {
      console.error("Error fetching total boosts:", e);
      if (!cancelled) setTotalBoosts(0);
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

  // Combine all posts for the grid display
  const allPosts = [...spliks, ...photos].map((item) => ({
    id: item.id.toString(),
    thumbnail: item.thumbnail_url || item.photo_url || `/api/placeholder/300/300`,
    type: item.video_url ? "video" : "image",
    boosts: Math.floor(Math.random() * 1000),
    comments: Math.floor(Math.random() * 100),
    splik: item
  }));

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Profile Header Section */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row items-start gap-8">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <Avatar className="w-32 h-32 lg:w-40 lg:h-40">
              <AvatarImage src={profile.avatar_url || ""} className="object-cover" />
              <AvatarFallback className="text-4xl font-bold bg-purple-600 text-white">
                {(profile.username || nameOrUsername).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Profile Info */}
          <div className="flex-1 min-w-0">
            {/* Username and Follow Button */}
            <div className="flex items-center gap-4 mb-6">
              <h1 className="text-2xl lg:text-3xl font-normal text-white">
                {profile.username || nameOrUsername}
              </h1>
              {currentUserId !== profile.id && (
                <FollowButton
                  profileId={profile.id}
                  username={profile.username || ""}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-1.5 rounded-md text-sm font-medium"
                />
              )}
            </div>

            {/* Stats Row */}
            <div className="flex gap-8 mb-6">
              <div className="text-center">
                <div className="text-lg font-semibold text-white">{profile.spliks_count || 0}</div>
                <div className="text-sm text-gray-400">Posts</div>
              </div>
              <button
                onClick={() => setShowFollowersList(true)}
                className="text-center hover:opacity-80 transition-opacity"
              >
                <div className="text-lg font-semibold text-white">{profile.followers_count || 0}</div>
                <div className="text-sm text-gray-400">Followers</div>
              </button>
              <button
                onClick={() => setShowFollowingList(true)}
                className="text-center hover:opacity-80 transition-opacity"
              >
                <div className="text-lg font-semibold text-white">{profile.following_count || 0}</div>
                <div className="text-sm text-gray-400">Following</div>
              </button>
              <div className="text-center">
                <div className="text-lg font-semibold text-white">{totalBoosts.toLocaleString()}</div>
                <div className="text-sm text-gray-400">Total Boosts</div>
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="text-white mb-4 leading-relaxed max-w-lg">
                {profile.bio}
              </p>
            )}

            {/* Location and Join Date */}
            <div className="flex flex-col gap-1 text-sm text-gray-400">
              {profile.city && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{profile.city}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4" />
                <span className="text-purple-400">{profile.username ? `${profile.username}.com` : "website.com"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Joined {formatDate(profile.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Tabs */}
      <div className="max-w-4xl mx-auto px-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Tab Navigation */}
          <div className="border-b border-gray-700 mb-8">
            <TabsList className="bg-transparent p-0 h-auto">
              <TabsTrigger 
                value="posts" 
                className="bg-transparent border-b-2 border-transparent data-[state=active]:border-white data-[state=active]:bg-transparent text-gray-400 data-[state=active]:text-white py-4 px-8 rounded-none font-medium hover:text-white transition-colors"
              >
                <Grid3X3 className="w-4 h-4 mr-2" />
                Posts
              </TabsTrigger>
              
              <TabsTrigger 
                value="saved" 
                className="bg-transparent border-b-2 border-transparent data-[state=active]:border-white data-[state=active]:bg-transparent text-gray-400 data-[state=active]:text-white py-4 px-8 rounded-none font-medium hover:text-white transition-colors"
              >
                <Bookmark className="w-4 h-4 mr-2" />
                Saved
              </TabsTrigger>
              
              <TabsTrigger 
                value="boosted" 
                className="bg-transparent border-b-2 border-transparent data-[state=active]:border-white data-[state=active]:bg-transparent text-gray-400 data-[state=active]:text-white py-4 px-8 rounded-none font-medium hover:text-white transition-colors"
              >
                <Heart className="w-4 h-4 mr-2" />
                Boosted
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab Content */}
          <TabsContent value="posts" className="m-0">
            {allPosts.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {allPosts.map((post) => (
                  <div
                    key={post.id}
                    className="relative aspect-square bg-gray-800 cursor-pointer group"
                    onClick={() => {
                      if (post.type === "video") {
                        // Handle video click - navigate to video player or open modal
                        console.log("Playing video:", post.splik);
                      }
                    }}
                  >
                    <img
                      src={post.thumbnail}
                      alt="Post"
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Video indicator */}
                    {post.type === "video" && (
                      <div className="absolute top-2 right-2">
                        <div className="bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                          3s
                        </div>
                      </div>
                    )}

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="flex items-center gap-6 text-white">
                        <div className="flex items-center gap-1">
                          <Heart className="w-5 h-5 fill-current" />
                          <span className="font-medium">{post.boosts}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-5 h-5" />
                          <span className="font-medium">{post.comments}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <div className="w-24 h-24 mx-auto bg-gray-800 rounded-full flex items-center justify-center mb-6">
                  <Camera className="h-12 w-12 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">No posts yet</h3>
                <p className="text-gray-400">When this person shares photos and videos, they'll appear here.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="saved" className="m-0">
            <div className="text-center py-20">
              <div className="w-24 h-24 mx-auto bg-gray-800 rounded-full flex items-center justify-center mb-6">
                <Bookmark className="h-12 w-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No saved posts</h3>
              <p className="text-gray-400">Posts you save will appear here</p>
            </div>
          </TabsContent>

          <TabsContent value="boosted" className="m-0">
            {boostedLoading ? (
              <div className="text-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mx-auto mb-4" />
                <p className="text-gray-400">Loading boosted posts...</p>
              </div>
            ) : boostedSpliks.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {boostedSpliks.map((splik) => (
                  <div
                    key={splik.id}
                    className="relative aspect-square bg-gray-800 cursor-pointer group"
                    onClick={() => {
                      if (splik.video_url) {
                        console.log("Playing boosted video:", splik);
                      }
                    }}
                  >
                    <img
                      src={splik.thumbnail_url || `/api/placeholder/300/300`}
                      alt="Boosted Post"
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Video indicator */}
                    {splik.video_url && (
                      <div className="absolute top-2 right-2">
                        <div className="bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                          3s
                        </div>
                      </div>
                    )}

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="flex items-center gap-6 text-white">
                        <div className="flex items-center gap-1">
                          <Heart className="w-5 h-5 fill-current" />
                          <span className="font-medium">{Math.floor(Math.random() * 1000)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-5 h-5" />
                          <span className="font-medium">{Math.floor(Math.random() * 100)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <div className="w-24 h-24 mx-auto bg-gray-800 rounded-full flex items-center justify-center mb-6">
                  <Heart className="h-12 w-12 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">No boosted posts</h3>
                <p className="text-gray-400">Posts you boost will appear here</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

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
