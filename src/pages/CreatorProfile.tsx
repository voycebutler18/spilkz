import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { VideoGrid } from "@/components/VideoGrid";
import FollowButton from "@/components/FollowButton";
import FollowersList from "@/components/FollowersList";
import { MapPin, Calendar, Film, Users, Eye, MessageSquare, Heart } from "lucide-react";
import { toast } from "sonner";

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
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

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export function CreatorProfile() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [spliks, setSpliks] = useState<any[]>([]);
  const [likedVideos, setLikedVideos] = useState<any[]>([]);
  const [loadingLikedVideos, setLoadingLikedVideos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showFollowersList, setShowFollowersList] = useState(false);
  const [showFollowingList, setShowFollowingList] = useState(false);

  // keep a single live subscription; clean up when profile id changes or on unmount
  const unsubRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Resolve the slug to a profile (username first, then id). Canonicalize to /creator/:username.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // If the router hasn't provided the param yet, don't do anything.
      if (!slug || !slug.trim()) {
        setLoading(false);
        setProfile(null);
        setSpliks([]);
        return;
      }

      setLoading(true);
      setProfile(null);
      setSpliks([]);

      try {
        // 1) try username
        let { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("username", slug)
          .maybeSingle<Profile>();

        // 2) if not found and slug looks like a UUID, try id
        if (!data && isUuid(slug)) {
          const byId = await supabase
            .from("profiles")
            .select("*")
            .eq("id", slug)
            .maybeSingle<Profile>();
          data = byId.data || null;

          // redirect to canonical /creator/:username when we can
          if (data?.username && slug !== data.username) {
            navigate(`/creator/${data.username}`, { replace: true });
            return;
          }
        }

        if (!data || error) {
          if (!cancelled) {
            setProfile(null);
          }
          return;
        }

        if (cancelled) return;

        setProfile(data);
        await fetchSpliks(data.id, cancelled);
      } catch (e) {
        console.error("Error resolving profile:", e);
        if (!cancelled) toast.error("Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Setup realtime only when we actually have a profile id; clean up old one first
  useEffect(() => {
    // clean previous subscription
    if (unsubRef.current) {
      try {
        unsubRef.current();
      } catch {}
      unsubRef.current = null;
    }
    if (!profile?.id) return;

    const channel = supabase
      .channel(`creator-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `id=eq.${profile.id}` },
        (payload) => setProfile(payload.new as Profile)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "spliks", filter: `user_id=eq.${profile.id}` },
        () => fetchSpliks(profile.id)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "followers" },
        () => refreshCounts(profile.id)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "likes" },
        () => {
          // Refresh liked videos when likes change
          if (currentUserId === profile.id) {
            fetchLikedVideos();
          }
        }
      )
      .subscribe();

    unsubRef.current = () => {
      supabase.removeChannel(channel);
    };

    return () => {
      if (unsubRef.current) {
        try {
          unsubRef.current();
        } finally {
          unsubRef.current = null;
        }
      }
    };
  }, [profile?.id, currentUserId]);

  const refreshCounts = async (profileId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("followers_count, following_count, spliks_count")
      .eq("id", profileId)
      .maybeSingle();
    if (data) {
      setProfile((prev) => (prev ? ({ ...prev, ...data } as Profile) : prev));
    }
  };

  const fetchSpliks = async (userId: string, cancelled?: boolean) => {
    try {
      const { data, error } = await supabase
        .from("spliks")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (cancelled) return;

      const spliksWithProfiles = await Promise.all(
        (data || []).map(async (s) => {
          const { data: p } = await supabase
            .from("profiles")
            .select("username, display_name, avatar_url")
            .eq("id", s.user_id)
            .maybeSingle();
          return { ...s, profiles: p || undefined };
        })
      );

      if (!cancelled) setSpliks(spliksWithProfiles);
    } catch (e) {
      console.error("Error fetching videos:", e);
      toast.error("Failed to load videos");
    }
  };

  const fetchLikedVideos = async () => {
    if (!currentUserId) return;
    
    setLoadingLikedVideos(true);
    try {
      // Fetch likes with the associated spliks and creator profiles
      const { data: likes, error } = await supabase
        .from("likes")
        .select(`
          id,
          created_at,
          spliks (
            *,
            profiles:user_id (
              username,
              display_name,
              avatar_url
            )
          )
        `)
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Transform the data to match the expected format
      const likedVideosData = likes
        ?.filter(like => like.spliks) // Filter out any likes where the splik was deleted
        .map(like => ({
          ...like.spliks,
          profiles: like.spliks?.profiles
        })) || [];

      setLikedVideos(likedVideosData);
    } catch (e) {
      console.error("Error fetching liked videos:", e);
      toast.error("Failed to load liked videos");
    } finally {
      setLoadingLikedVideos(false);
    }
  };

  // Fetch liked videos when the tab might be accessed and user is viewing their own profile
  useEffect(() => {
    if (currentUserId === profile?.id) {
      fetchLikedVideos();
    }
  }, [currentUserId, profile?.id]);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <h2 className="text-2xl font-semibold mb-4">Profile not found</h2>
          <Button onClick={() => navigate("/")}>Go Home</Button>
        </div>
        <Footer />
      </div>
    );
  }

  // Only show the liked tab if the user is viewing their own profile
  const isOwnProfile = currentUserId === profile.id;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="mb-8 p-6">
          <div className="flex flex-col md:flex-row gap-6">
            <Avatar className="h-32 w-32">
              <AvatarImage src={profile.avatar_url || ""} />
              <AvatarFallback className="text-3xl">
                {profile.display_name?.charAt(0) || profile.username?.charAt(0) || "?"}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-3xl font-bold">
                    {profile.display_name || profile.username}
                  </h1>
                  <p className="text-muted-foreground">@{profile.username}</p>
                </div>

                {currentUserId !== profile.id && (
                  <FollowButton
                    profileId={profile.id}
                    username={profile.username || ""}
                    className="ml-4"
                  />
                )}
              </div>

              {profile.bio && <p className="mb-4">{profile.bio}</p>}

              {currentUserId !== profile.id && (
                <div className="mb-4">
                  <Button
                    variant="secondary"
                    className="flex items-center gap-2"
                    onClick={() => navigate(`/messages/${profile.id}`)}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Message
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                {profile.city && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {profile.city}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Joined {formatDate(profile.created_at)}
                </div>
              </div>

              <div className="flex gap-8">
                <div className="text-center min-w-[80px]">
                  <p className="text-2xl font-bold">{profile.spliks_count || 0}</p>
                  <p className="text-sm text-muted-foreground">Videos</p>
                </div>
                <button
                  onClick={() => setShowFollowersList(true)}
                  className="text-center min-w-[80px] hover:bg-accent rounded-lg p-2 -m-2 transition-colors"
                >
                  <p className="text-2xl font-bold">
                    {profile.followers_private && currentUserId !== profile.id
                      ? 0
                      : profile.followers_count || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Followers</p>
                </button>
                <button
                  onClick={() => setShowFollowingList(true)}
                  className="text-center min-w-[80px] hover:bg-accent rounded-lg p-2 -m-2 transition-colors"
                >
                  <p className="text-2xl font-bold">
                    {profile.following_private && currentUserId !== profile.id
                      ? 0
                      : profile.following_count || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Following</p>
                </button>
              </div>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="videos" className="w-full">
          <TabsList className={`grid w-full ${isOwnProfile ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="videos">Videos</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
            {isOwnProfile && <TabsTrigger value="liked">Liked</TabsTrigger>}
          </TabsList>

          <TabsContent value="videos" className="mt-6">
            {spliks.length > 0 ? (
              <VideoGrid
                spliks={spliks}
                showCreatorInfo={false}
                onDeleteComment={
                  currentUserId === profile.id
                    ? async (commentId) => {
                        const { error } = await supabase.from("comments").delete().eq("id", commentId);
                        if (!error) toast.success("Comment deleted");
                      }
                    : undefined
                }
              />
            ) : (
              <Card className="p-12 text-center">
                <Film className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No videos yet</p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="about" className="mt-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">
                About {profile.display_name || profile.username}
              </h3>
              <div className="space-y-4">
                {profile.bio && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Bio</p>
                    <p>{profile.bio}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Stats</p>
                  <div className="flex gap-4">
                    <Badge variant="secondary">
                      <Film className="mr-1 h-3 w-3" />
                      {profile.spliks_count} Videos
                    </Badge>
                    <Badge variant="secondary">
                      <Users className="mr-1 h-3 w-3" />
                      {profile.followers_count} Followers
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Member Since</p>
                  <p>{formatDate(profile.created_at)}</p>
                </div>
              </div>
            </Card>
          </TabsContent>

          {isOwnProfile && (
            <TabsContent value="liked" className="mt-6">
              {loadingLikedVideos ? (
                <Card className="p-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading liked videos...</p>
                </Card>
              ) : likedVideos.length > 0 ? (
                <VideoGrid
                  spliks={likedVideos}
                  showCreatorInfo={true}
                  onDeleteComment={async (commentId) => {
                    const { error } = await supabase.from("comments").delete().eq("id", commentId);
                    if (!error) toast.success("Comment deleted");
                  }}
                />
              ) : (
                <Card className="p-12 text-center">
                  <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-2">No liked videos yet</p>
                  <p className="text-sm text-muted-foreground">
                    Videos you like will appear here
                  </p>
                </Card>
              )}
            </TabsContent>
          )}
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

      <Footer />
    </div>
  );
}

export default CreatorProfile;
