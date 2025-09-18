// src/pages/CreatorProfile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Calendar, UserPlus, Check } from "lucide-react";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  city: string | null;
  created_at: string | null;
  avatar_url: string | null;
};

const formatJoined = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
};

const safeNumber = (v: number | null) => (typeof v === "number" ? v : 0);

/**
 * Creator Profile
 * - Loads profile by :slug (username, fallback to id)
 * - ✅ Correct follower/following counts using head+count queries
 * - Optional posts count from first table that exists: videos → spliks → posts
 * - Follow/Unfollow button with instant optimistic UI
 */
const CreatorProfile: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [followersCount, setFollowersCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [postsCount, setPostsCount] = useState<number>(0);

  const [meId, setMeId] = useState<string | null>(null);
  const [iFollow, setIFollow] = useState<boolean>(false);
  const [toggling, setToggling] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // who am I?
        const { data: auth } = await supabase.auth.getUser();
        if (alive) setMeId(auth?.user?.id ?? null);

        // find profile by username (slug) first, otherwise by id
        let userProfile: Profile | null = null;

        if (slug) {
          const { data: pByUsername } = await supabase
            .from("profiles")
            .select("id,username,display_name,bio,city,created_at,avatar_url")
            .eq("username", slug)
            .maybeSingle();

          userProfile = (pByUsername as Profile | null) ?? null;

          if (!userProfile) {
            const { data: pById } = await supabase
              .from("profiles")
              .select("id,username,display_name,bio,city,created_at,avatar_url")
              .eq("id", slug)
              .maybeSingle();
            userProfile = (pById as Profile | null) ?? null;
          }
        }

        if (!userProfile) {
          navigate("/home", { replace: true });
          return;
        }

        if (!alive) return;
        setProfile(userProfile);

        // ✅ follower/following counts (fast head requests)
        const [{ count: followers }, { count: following }] = await Promise.all([
          supabase
            .from("follows")
            .select("id", { count: "exact", head: true })
            .eq("following_id", userProfile.id),
          supabase
            .from("follows")
            .select("id", { count: "exact", head: true })
            .eq("follower_id", userProfile.id),
        ]);

        if (!alive) return;
        setFollowersCount(safeNumber(followers ?? 0));
        setFollowingCount(safeNumber(following ?? 0));

        // (Optional) posts/videos count — try common tables
        const tablesToTry = ["videos", "spliks", "posts"];
        let counted = 0;
        for (const t of tablesToTry) {
          try {
            const { count } = await supabase
              .from(t)
              .select("id", { count: "exact", head: true })
              .eq("user_id", userProfile.id);
            if (typeof count === "number") {
              counted = count;
              break;
            }
          } catch {
            // ignore if table doesn't exist
          }
        }
        if (!alive) return;
        setPostsCount(counted);

        // do I follow this profile?
        if (auth?.user?.id && auth.user.id !== userProfile.id) {
          const { data: rel } = await supabase
            .from("follows")
            .select("id")
            .eq("follower_id", auth.user.id)
            .eq("following_id", userProfile.id)
            .maybeSingle();
          if (!alive) return;
          setIFollow(!!rel);
        } else {
          setIFollow(false);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [slug, navigate]);

  const isMe = useMemo(() => meId && profile?.id && meId === profile.id, [meId, profile]);

  const toggleFollow = async () => {
    if (!meId || !profile || meId === profile.id) return;
    setToggling(true);
    try {
      if (iFollow) {
        // Unfollow
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", meId)
          .eq("following_id", profile.id);
        if (error) throw error;
        setIFollow(false);
        setFollowersCount((n) => Math.max(0, n - 1));
      } else {
        // Follow
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: meId, following_id: profile.id });
        if (error) throw error;
        setIFollow(true);
        setFollowersCount((n) => n + 1);
      }
    } catch (e) {
      console.error("Follow toggle error", e);
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-center text-muted-foreground">
        Profile not found.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Card className="bg-black/40 border-zinc-700">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-start gap-6">
            <div className="h-28 w-28 rounded-full overflow-hidden ring-2 ring-primary/30 shrink-0">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name || profile.username || "avatar"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Avatar className="h-28 w-28">
                  <AvatarImage />
                  <AvatarFallback className="bg-zinc-800 text-zinc-300 text-3xl">
                    {(profile.display_name || profile.username || "?").slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">
                  {profile.display_name || profile.username || "Creator"}
                </h1>
                {isMe && <Badge className="bg-primary/20 border-primary/40">You</Badge>}
              </div>
              {profile.username && (
                <div className="text-zinc-400">@{profile.username}</div>
              )}

              {profile.bio && (
                <p className="mt-3 text-zinc-200 whitespace-pre-line">{profile.bio}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-zinc-400">
                {profile.city && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {profile.city}
                  </div>
                )}
                {profile.created_at && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Joined {formatJoined(profile.created_at)}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col items-stretch gap-2">
              {isMe ? (
                <Link to="/dashboard">
                  <Button className="w-full">Edit Profile</Button>
                </Link>
              ) : meId ? (
                <Button
                  onClick={toggleFollow}
                  disabled={toggling}
                  className={iFollow ? "bg-zinc-800 hover:bg-zinc-700" : ""}
                  variant={iFollow ? "outline" : "default"}
                >
                  {iFollow ? (
                    <>
                      <Check className="h-4 w-4 mr-2" /> Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" /> Follow
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-3 gap-3 max-w-md">
            <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
              <div className="text-xl font-semibold text-white">{postsCount}</div>
              <div className="text-xs text-zinc-400 mt-1">Videos</div>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
              <div className="text-xl font-semibold text-white">{followersCount}</div>
              <div className="text-xs text-zinc-400 mt-1">Followers</div>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
              <div className="text-xl font-semibold text-white">{followingCount}</div>
              <div className="text-xs text-zinc-400 mt-1">Following</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Below here you can render tabs for Videos / About / Boosted, etc. */}
    </div>
  );
};

export default CreatorProfile;
