// src/pages/CreatorProfile.tsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
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
  Share
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

      const { data, error } = await supabase
        .from("vibe_photos")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (cancelled) return;

      const photoItems: PhotoItem[] = (data || []).map((r: any) => ({
        id: String(r.id),
        user_id: String(r.user_id),
        photo_url: String(r.photo_url),
        created_at: r.created_at || new Date().toISOString(),
        description: r.description ?? r.caption ?? null,
        location: r.location ?? null,
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

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header Section - YouTube Style */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Profile Header */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <Avatar className="h-32 w-32 lg:h-40 lg:w-40 border-4 border-gray-700">
                <AvatarImage src={profile.avatar_url || ""} className="object-cover" />
                <AvatarFallback className="text-4xl font-bold bg-purple-600 text-white">
                  {nameOrUsername.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Profile Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2 truncate">
                    {nameOrUsername}
                  </h1>
                  {profile.username && (
                    <p className="text-lg text-gray-400 mb-3">@{profile.username}</p>
                  )}
                  
                  {/* Stats Row */}
                  <div className="flex flex-wrap gap-6 text-sm text-gray-400 mb-4">
                    <span>{profile.spliks_count || 0} videos</span>
                    <button
                      onClick={() => setShowFollowersList(true)}
                      className="hover:text-white transition-colors"
                    >
                      {profile.followers_count || 0} followers
                    </button>
                    <button
                      onClick={() => setShowFollowingList(true)}
                      className="hover:text-white transition-colors"
                    >
                      {profile.following_count || 0} following
                    </button>
                    <span>{photos.length} photos</span>
                  </div>

                  {/* Bio and Details */}
                  {profile.bio && (
                    <p className="text-gray-300 mb-3 max-w-2xl leading-relaxed">
                      {profile.bio}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                    {profile.city && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        <span>{profile.city}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>Joined {formatDate(profile.created_at)}</span>
                    </div>
                  </div>
                </div>
                
                {/* Follow Button */}
                {currentUserId !== profile.id && (
                  <div className="flex-shrink-0">
                    <FollowButton
                      profileId={profile.id}
                      username={profile.username || ""}
                      className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 font-semibold"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Tabs - YouTube Style */}
      <div className="max-w-7xl mx-auto">
        <Tabs defaultValue="videos" className="w-full">
          {/* Tab Navigation */}
          <div className="border-b border-gray-700 px-4">
            <TabsList className="bg-transparent p-0 h-auto space-x-8">
              <TabsTrigger 
                value="videos" 
                className="bg-transparent border-b-2 border-transparent data-[state=active]:border-white data-[state=active]:bg-transparent text-gray-400 data-[state=active]:text-white py-4 px-0 rounded-none font-semibold hover:text-white transition-colors"
              >
                <Play className="h-4 w-4 mr-2" />
                Videos
              </TabsTrigger>
              
              <TabsTrigger 
                value="photos" 
                className="bg-transparent border-b-2 border-transparent data-[state=active]:border-white data-[state=active]:bg-transparent text-gray-400 data-[state=active]:text-white py-4 px-0 rounded-none font-semibold hover:text-white transition-colors"
              >
                <Camera className="h-4 w-4 mr-2" />
                Photos
              </TabsTrigger>
              
              <TabsTrigger 
                value="about" 
                className="bg-transparent border-b-2 border-transparent data-[state=active]:border-white data-[state=active]:bg-transparent text-gray-400 data-[state=active]:text-white py-4 px-0 rounded-none font-semibold hover:text-white transition-colors"
              >
                <Users className="h-4 w-4 mr-2" />
                About
              </TabsTrigger>
              
              <TabsTrigger 
                value="boosted" 
                className="bg-transparent border-b-2 border-transparent data-[state=active]:border-white data-[state=active]:bg-transparent text-gray-400 data-[state=active]:text-white py-4 px-0 rounded-none font-semibold hover:text-white transition-colors"
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                Boosted
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab Content */}
          <div className="px-4 py-6">
            <TabsContent value="videos" className="m-0">
              {spliks.length > 0 ? (
                <VideoGrid
                  spliks={spliks}
                  showCreatorInfo={false}
                  onDeleteComment={
                    currentUserId === profile.id
                      ? async (commentId) => {
                          const { error } = await supabase
                            .from("comments")
                            .delete()
                            .eq("id", commentId);
                          if (!error) toast.success("Comment deleted");
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="text-center py-20">
                  <div className="w-24 h-24 mx-auto bg-gray-800 rounded-full flex items-center justify-center mb-6">
                    <Film className="h-12 w-12 text-gray-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">No videos yet</h3>
                  <p className="text-gray-400">This creator hasn't posted any videos</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="photos" className="m-0">
              {photosLoading ? (
                <div className="text-center py-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mx-auto mb-4" />
                  <p className="text-gray-400">Loading photos...</p>
                </div>
              ) : photos.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {photos.map((photo) => (
                    <div key={photo.id} className="aspect-square group cursor-pointer">
                      <div className="w-full h-full rounded-lg overflow-hidden bg-gray-800 relative">
                        <img
                          src={photo.photo_url}
                          alt={photo.description || "Photo"}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <div className="w-24 h-24 mx-auto bg-gray-800 rounded-full flex items-center justify-center mb-6">
                    <Camera className="h-12 w-12 text-gray-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">No photos yet</h3>
                  <p className="text-gray-400">This creator hasn't posted any photos</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="about" className="m-0">
              <div className="max-w-4xl">
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-semibold text-white mb-4">About {nameOrUsername}</h3>
                      {profile.bio ? (
                        <p className="text-gray-300 leading-relaxed">{profile.bio}</p>
                      ) : (
                        <p className="text-gray-500">No bio available.</p>
                      )}
                    </div>
                    
                    <div>
                      <h4 className="text-lg font-semibold text-white mb-3">Details</h4>
                      <div className="space-y-2 text-sm">
                        {profile.city && (
                          <div className="flex items-center gap-2 text-gray-300">
                            <MapPin className="h-4 w-4 text-gray-400" />
                            <span>{profile.city}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-gray-300">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span>Joined {formatDate(profile.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-3">Stats</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between py-2">
                        <span className="text-gray-400">Videos</span>
                        <span className="text-white font-semibold">{profile.spliks_count || 0}</span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-gray-400">Photos</span>
                        <span className="text-white font-semibold">{photos.length}</span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-gray-400">Followers</span>
                        <span className="text-white font-semibold">{profile.followers_count || 0}</span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-gray-400">Following</span>
                        <span className="text-white font-semibold">{profile.following_count || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="boosted" className="m-0">
              {boostedLoading ? (
                <div className="text-center py-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mx-auto mb-4" />
                  <p className="text-gray-400">Loading boosted videos...</p>
                </div>
              ) : boostedSpliks.length > 0 ? (
                <VideoGrid
                  spliks={boostedSpliks}
                  showCreatorInfo={true}
                  onDeleteComment={
                    currentUserId === profile.id
                      ? async (commentId) => {
                          const { error } = await supabase
                            .from("comments")
                            .delete()
                            .eq("id", commentId);
                          if (!error) toast.success("Comment deleted");
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="text-center py-20">
                  <div className="w-24 h-24 mx-auto bg-gray-800 rounded-full flex items-center justify-center mb-6">
                    <TrendingUp className="h-12 w-12 text-gray-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">No boosted videos</h3>
                  <p className="text-gray-400">This creator hasn't boosted any videos yet</p>
                </div>
              )}
            </TabsContent>
          </div>
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
