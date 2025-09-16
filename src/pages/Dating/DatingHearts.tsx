import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, ArrowLeftRight, RefreshCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type HeartRow = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  avatar_url: string | null;
  video_intro_url: string | null;
  is_mutual: boolean;
  liked_at: string;
};

const DatingHearts: React.FC = () => {
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<HeartRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (uid: string) => {
    setRefreshing(true);

    // 1) my likes
    const { data: likes, error: likesErr } = await supabase
      .from("dating_likes")
      .select("liked_id, created_at")
      .eq("liker_id", uid)
      .eq("action", "like")
      .order("created_at", { ascending: false });

    if (likesErr) {
      console.error(likesErr);
      setRefreshing(false);
      setLoading(false);
      return;
    }

    const likedIds = likes?.map((l) => l.liked_id) ?? [];
    if (likedIds.length === 0) {
      setRows([]);
      setRefreshing(false);
      setLoading(false);
      return;
    }

    // 2) profiles (basic)
    const { data: p } = await supabase
      .from("profiles")
      .select("id, display_name, city, avatar_url")
      .in("id", likedIds);

    // 3) dating_profiles (video + overrides)
    const { data: dp } = await supabase
      .from("dating_profiles")
      .select("user_id, display_name, city, avatar_url, video_intro_url")
      .in("user_id", likedIds);

    // 4) who likes me back?
    const { data: backs } = await supabase
      .from("dating_likes")
      .select("liker_id")
      .in("liker_id", likedIds)
      .eq("liked_id", uid)
      .eq("action", "like");

    const backSet = new Set((backs ?? []).map((b) => b.liker_id));
    const dpMap = new Map((dp ?? []).map((d) => [d.user_id, d]));
    const pMap = new Map((p ?? []).map((x) => [x.id, x]));

    const merged: HeartRow[] = (likes ?? []).map((l) => {
      const bp = pMap.get(l.liked_id);
      const od = dpMap.get(l.liked_id);
      return {
        user_id: l.liked_id,
        display_name: (od?.display_name || bp?.display_name || "Someone") as string,
        city: (od?.city || bp?.city || null) as string | null,
        avatar_url: (od?.avatar_url || bp?.avatar_url || null) as string | null,
        video_intro_url: (od?.video_intro_url || null) as string | null,
        is_mutual: backSet.has(l.liked_id),
        liked_at: l.created_at,
      };
    });

    setRows(merged);
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    let ok = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      if (!ok) return;
      setMe(uid);
      if (uid) await load(uid);
      else setLoading(false);
    })();
    return () => { ok = false; };
  }, []);

  const empty = useMemo(() => rows.length === 0, [rows]);

  const unlike = async (otherId: string) => {
    if (!me) return;
    const { error } = await supabase
      .from("dating_likes")
      .delete()
      .eq("liker_id", me)
      .eq("liked_id", otherId)
      .eq("action", "like");
    if (error) {
      console.error(error);
      alert("Could not remove like.");
      return;
    }
    setRows((r) => r.filter((x) => x.user_id !== otherId));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-zinc-300">Loading your hearts…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-500 flex items-center justify-center">
            <Heart className="h-5 w-5 text-white" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/dating/discover">
            <Button variant="outline" className="border-zinc-700 text-zinc-300">
              Back to Discover
            </Button>
          </Link>
          <Button
            variant="outline"
            className="border-zinc-700 text-zinc-300"
            onClick={() => me && load(me)}
            disabled={refreshing}
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {empty ? (
        <Card className="max-w-3xl mx-auto bg-zinc-950 border-zinc-800">
          <CardContent className="p-10 text-center space-y-4">
            <div className="text-2xl">No hearts yet</div>
            <p className="text-zinc-400">
              When you heart someone in Discover, they’ll show up here.
              If they heart you back, it becomes a match!
            </p>
            <Link to="/dating/discover">
              <Button className="bg-gradient-to-r from-fuchsia-600 to-purple-600">
                Go to Discover
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-4">
          {rows.map((r) => (
            <Card key={r.user_id} className="bg-zinc-950 border-zinc-800 overflow-hidden">
              <div className="relative h-56 bg-black">
                {r.video_intro_url ? (
                  <video
                    src={r.video_intro_url}
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : r.avatar_url ? (
                  <img
                    src={r.avatar_url}
                    alt={r.display_name || "Match"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                    <Avatar className="h-20 w-20">
                      <AvatarImage />
                      <AvatarFallback className="bg-zinc-800 text-xl">
                        {(r.display_name || "?").charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}

                {r.is_mutual && (
                  <Badge className="absolute top-3 left-3 bg-green-600">
                    <ArrowLeftRight className="h-3 w-3 mr-1" />
                    It’s a match
                  </Badge>
                )}
              </div>

              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">
                  {r.display_name || "Someone"}
                </CardTitle>
                <p className="text-zinc-400 text-sm">{r.city || "Nearby"}</p>
              </CardHeader>

              <CardContent className="pb-5">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-zinc-500">
                    Liked on {new Date(r.liked_at).toLocaleDateString()}
                  </div>
                  <Button
                    variant="outline"
                    className="border-zinc-700 text-zinc-300"
                    onClick={() => unlike(r.user_id)}
                  >
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default DatingHearts;
