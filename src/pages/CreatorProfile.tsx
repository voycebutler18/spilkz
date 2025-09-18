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
import { MapPin, Calendar, Film, Users, TrendingUp, Play, Eye, Heart } from "lucide-react";
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

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export default function CreatorProfile() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [spliks, setSpliks] = useState<any[]>([]);
  const [boostedSpliks, setBoostedSpliks] = useState<any[]>([]);
  const [boostedLoading, setBoostedLoading] = useState(false);
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

  // Resolve profile slug (username or uuid); redirect /creator -> own profile when logged in
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
        
        // Fetch fresh counts to ensure accuracy
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, navigate]);

  // Realtime subscriptions for this profile
  useEffect(() => {
    if (unsubRef.current) {
      try { unsubRef.current(); } catch {}
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
      // refresh the "Boosted" tab on boosts
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "boosts", filter: `user_id=eq.${profile.id}` },
        () => fetchBoostedSpliks(profile.id)
      )
      .subscribe();

    unsubRef.current = () => supabase.removeChannel(channel);
    return () => {
      if (unsubRef.current) {
        try { unsubRef.current(); } finally { unsubRef.current = null; }
      }
    };
  }, [profile?.id]);

  const refreshCounts = async (profileId: string) => {
    try {
      // Get actual follower counts from the followers table
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

      // Update the profile state with fresh counts
      setProfile((prev) => (prev ? {
        ...prev,
        followers_count: followersCount,
        following_count: followingCount,
        spliks_count: spliksCount
      } as Profile : prev));

      // Also update the database to keep it in sync
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

  // Boosted tab uses boosts table instead of hype_reactions
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

  // Deep link: ?video=<id>
  useEffect(() => {
    const deepId = searchParams.get("video");
    if (!deepId || !spliks.length) return;

    let cancelled = false;
    let tries = 0;
    const maxTries = 14;

    const tryPlayUnmuted = (vid: HTMLVideoElement) => {
      try {
        vid.muted = false;
        const p = vid.play();
        if (p && typeof (p as any).catch === "function") {
          (p as Promise<void>).catch(() => {
            vid.muted = true;
            vid.play().catch(() => {});
          });
        }
      } catch {}
    };

    const attempt = () => {
      if (cancelled) return;
      const selectors = [
        `[data-splik-id="${deepId}"]`,
        `#splik-${deepId}`,
        `[data-video-id="${deepId}"]`,
        `[data-id="${deepId}"]`,
      ];
      let host: HTMLElement | null = null;
      for (const s of selectors) {
        const el = document.querySelector<HTMLElement>(s);
        if (el) { host = el; break; }
      }
      if (host) {
        host.scrollIntoView({ behavior: "smooth", block: "center" });
        const vid = host.querySelector("video") as HTMLVideoElement | null;
        if (vid) setTimeout(() => tryPlayUnmuted(vid), 80);
        return;
      }
      if (tries++ < maxTries) setTimeout(attempt, 120);
    };

    attempt();
    return () => { cancelled = true; };
  }, [searchParams, spliks.length]);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <div className="bg-black/20 backdrop-blur-xl rounded-3xl p-12 border border-white/10">
            <h2 className="text-3xl font-bold text-white mb-4">Profile not found</h2>
            <p className="text-gray-300 mb-8">
              The profile you're looking for doesn't exist or may have been removed.
            </p>
            <Button 
              onClick={() => navigate("/")}
              className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500"
            >
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Strong fallback: display_name → full_name → first+last → username → "User"
  const joinedFirstLast = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  const nameOrUsername =
    profile.display_name?.trim() ||
    profile.full_name?.trim() ||
    (joinedFirstLast || undefined) ||
    profile.username?.trim() ||
    "User";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      {/* Hero Section */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900/50" />
        <div className="relative max-w-6xl mx-auto px-4 pt-8 pb-16">
          {/* Profile Header */}
          <div className="bg-black/20 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl">
            <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
              {/* Avatar */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-violet-500 rounded-full blur-sm opacity-50" />
                <Avatar className="relative h-40 w-40 border-4 border-white/20 shadow-2xl">
                  <AvatarImage src={profile.avatar_url || ""} className="object-cover" />
                  <AvatarFallback className="text-4xl font-bold bg-gradient-to-br from-purple-600 to-violet-600 text-white">
                    {nameOrUsername.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>

              {/* Profile Info */}
              <div className="flex-1 text-center lg:text-left">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                  <div>
                    <h1 className="text-4xl lg:text-5xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text">
                      {nameOrUsername}
                    </h1>
                    {profile.username && (
                      <p className="text-xl text-purple-300 font-medium">@{profile.username}</p>
                    )}
                  </div>
                  
                  {currentUserId !== profile.id && (
                    <FollowButton
                      profileId={profile.id}
                      username={profile.username || ""}
                      className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 border-0 px-8 py-3 text-lg font-semibold shadow-lg"
                    />
                  )}
                </div>

                {profile.bio && (
                  <p className="text-gray-300 text-lg leading-relaxed mb-6 max-w-2xl">
                    {profile.bio}
                  </p>
                )}

                {/* Location and Join Date */}
                <div className="flex flex-wrap justify-center lg:justify-start gap-6 text-gray-400 mb-8">
                  {profile.city && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-purple-400" />
                      <span className="text-gray-300">{profile.city}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-purple-400" />
                    <span className="text-gray-300">Joined {formatDate(profile.created_at)}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex justify-center lg:justify-start gap-8">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white mb-1">{profile.spliks_count || 0}</div>
                    <div className="text-gray-400 font-medium">Videos</div>
                  </div>
                  <button
                    onClick={() => setShowFollowersList(true)}
                    className="text-center group hover:bg-white/5 rounded-lg p-3 -m-3 transition-all duration-200"
                  >
                    <div className="text-3xl font-bold text-white mb-1 group-hover:text-purple-300 transition-colors">
                      {profile.followers_count || 0}
                    </div>
                    <div className="text-gray-400 font-medium group-hover:text-purple-400 transition-colors">Followers</div>
                  </button>
                  <button
                    onClick={() => setShowFollowingList(true)}
                    className="text-center group hover:bg-white/5 rounded-lg p-3 -m-3 transition-all duration-200"
                  >
                    <div className="text-3xl font-bold text-white mb-1 group-hover:text-purple-300 transition-colors">
                      {profile.following_count || 0}
                    </div>
                    <div className="text-gray-400 font-medium group-hover:text-purple-400 transition-colors">Following</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Tabs */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        <Tabs defaultValue="videos" className="w-full">
          <div className="bg-black/20 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
            <TabsList className="w-full grid grid-cols-3 bg-transparent border-b border-white/10 rounded-none p-0">
              <TabsTrigger 
                value="videos" 
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-violet-600 data-[state=active]:text-white text-gray-300 py-4 text-lg font-semibold border-0 rounded-none"
              >
                <Play className="h-5 w-5 mr-2" />
                Videos
              </TabsTrigger>
              <TabsTrigger 
                value="about" 
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-violet-600 data-[state=active]:text-white text-gray-300 py-4 text-lg font-semibold border-0 rounded-none"
              >
                <Users className="h-5 w-5 mr-2" />
                About
              </TabsTrigger>
              <TabsTrigger 
                value="boosted" 
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-violet-600 data-[state=active]:text-white text-gray-300 py-4 text-lg font-semibold border-0 rounded-none"
              >
                <TrendingUp className="h-5 w-5 mr-2" />
                Boosted
              </TabsTrigger>
            </TabsList>

            <TabsContent value="videos" className="p-6 m-0">
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
                  <div className="w-24 h-24 mx-auto bg-gradient-to-br from-purple-600 to-violet-600 rounded-full flex items-center justify-center mb-6">
                    <Film className="h-12 w-12 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">No videos yet</h3>
                  <p className="text-gray-400">This creator hasn't posted any videos</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="about" className="p-6 m-0">
              <div className="max-w-3xl mx-auto">
                <h3 className="text-2xl font-bold text-white mb-8 text-center">
                  About {nameOrUsername}
                </h3>
                <div className="space-y-8">
                  {profile.bio && (
                    <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                      <h4 className="text-lg font-semibold text-purple-300 mb-3">Bio</h4>
                      <p className="text-gray-300 leading-relaxed">{profile.bio}</p>
                    </div>
                  )}
                  <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <h4 className="text-lg font-semibold text-purple-300 mb-4">Stats</h4>
                    <div className="flex flex-wrap gap-4">
                      <Badge className="bg-gradient-to-r from-purple-600 to-violet-600 text-white px-4 py-2 text-sm">
                        <Film className="mr-2 h-4 w-4" />
                        {profile.spliks_count} Videos
                      </Badge>
                      <Badge className="bg-gradient-to-r from-purple-600 to-violet-600 text-white px-4 py-2 text-sm">
                        <Users className="mr-2 h-4 w-4" />
                        {profile.followers_count} Followers
                      </Badge>
                      <Badge className="bg-gradient-to-r from-purple-600 to-violet-600 text-white px-4 py-2 text-sm">
                        <Heart className="mr-2 h-4 w-4" />
                        {profile.following_count} Following
                      </Badge>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <h4 className="text-lg font-semibold text-purple-300 mb-3">Member Since</h4>
                    <p className="text-gray-300">{formatDate(profile.created_at)}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="boosted" className="p-6 m-0">
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
                  <div className="w-24 h-24 mx-auto bg-gradient-to-br from-purple-600 to-violet-600 rounded-full flex items-center justify-center mb-6">
                    <TrendingUp className="h-12 w-12 text-white" />
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
