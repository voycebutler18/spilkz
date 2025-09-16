// src/pages/Dating/DatingHearts.tsx
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

type LikeRow = { to_user: string };
type Profile = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  avatar_url: string | null;
  video_intro_url: string | null;
};

const DatingHearts: React.FC = () => {
  const [me, setMe] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (uid: string) => {
    const { data: likes } = await supabase
      .from("dating_likes")
      .select("to_user")
      .eq("from_user", uid)
      .eq("status", "like");

    const ids = (likes || []).map((l: LikeRow) => l.to_user);
    if (ids.length === 0) {
      setProfiles([]);
      setLoading(false);
      return;
    }

    const { data: profs } = await supabase
      .from("dating_profiles")
      .select("user_id, display_name, city, avatar_url, video_intro_url")
      .in("user_id", ids);

    setProfiles(profs || []);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      if (!au?.user) return;
      setMe(au.user.id);
      await load(au.user.id);

      // realtime: if someone X's me, remove them from my hearts
      supabase
        .channel("dating_likes_live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "dating_likes", filter: `to_user=eq.${au.user.id}` },
          async (payload) => {
            const row: any = payload.new;
            if (row?.status === "pass") {
              setProfiles((prev) => prev.filter((p) => p.user_id !== row.from_user));
            }
          }
        )
        .subscribe();
    })();

    return () => {
      try {
        supabase.removeAllChannels();
      } catch {}
    };
  }, []);

  const removeHeart = async (otherId: string) => {
    if (!me) return;
    await supabase
      .from("dating_likes")
      .upsert({ from_user: me, to_user: otherId, status: "pass" }, { onConflict: "from_user,to_user" });
    setProfiles((prev) => prev.filter((p) => p.user_id !== otherId));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Heart className="h-6 w-6 text-fuchsia-500" />
          <h1 className="text-2xl font-bold">Your Hearts</h1>
        </div>

        {profiles.length === 0 ? (
          <div className="text-center py-20">
            <Sparkles className="h-10 w-10 mx-auto text-fuchsia-500 mb-3" />
            <p className="text-lg">No hearts yet.</p>
            <p className="text-zinc-400 mb-4">Start browsing and tap the heart.</p>
            <Button asChild className="bg-gradient-to-r from-fuchsia-600 to-purple-600">
              <Link to="/dating/discover">Find people</Link>
            </Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((p) => (
              <Card key={p.user_id} className="bg-zinc-950 border-zinc-800 overflow-hidden">
                <CardContent className="p-0">
                  <div className="h-48 relative bg-black">
                    {p.video_intro_url ? (
                      <video src={p.video_intro_url} className="w-full h-full object-cover" autoPlay loop muted />
                    ) : p.avatar_url ? (
                      <img src={p.avatar_url} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        No media
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                      <div className="text-white font-semibold">
                        {p.display_name || "Someone"}
                      </div>
                      {p.city && <div className="text-xs text-zinc-300">{p.city}</div>}
                    </div>
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <Badge className="bg-fuchsia-500/20 text-fuchsia-300">Hearted</Badge>
                    <Button variant="outline" size="sm" className="border-zinc-700" onClick={() => removeHeart(p.user_id)}>
                      <X className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DatingHearts;
