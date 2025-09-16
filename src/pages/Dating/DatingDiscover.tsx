// src/pages/Dating/DatingDiscover.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, Star, X, MapPin, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";

type Profile = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  bio: string | null;
  avatar_url: string | null;
  photo_urls: string[] | null;
  video_intro_url: string | null;
  show_age: boolean | null;
  dob: string | null;
};

const ageFromDob = (dob?: string | null) => {
  if (!dob) return "";
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a > 0 ? a : "";
};

const DatingDiscover: React.FC = () => {
  const navigate = useNavigate();
  const [me, setMe] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [matchWith, setMatchWith] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      if (!au?.user) {
        navigate("/login");
        return;
      }
      setMe(au.user.id);
      const { data } = await supabase
        .from("dating_profiles")
        .select(
          "user_id, display_name, city, bio, avatar_url, photo_urls, video_intro_url, show_age, dob"
        )
        .neq("user_id", au.user.id)
        .order("updated_at", { ascending: false });
      setProfiles(data || []);
      setLoading(false);
    })();
  }, [navigate]);

  const current = profiles[idx];

  const advance = () => setIdx((i) => Math.min(i + 1, profiles.length));

  const passProfile = async () => {
    if (!me || !current) return;
    await supabase.from("dating_likes").upsert(
      { from_user: me, to_user: current.user_id, status: "pass" },
      { onConflict: "from_user,to_user" }
    );
    advance();
  };

  const likeProfile = async () => {
    if (!me || !current) return;
    await supabase.from("dating_likes").upsert(
      { from_user: me, to_user: current.user_id, status: "like" },
      { onConflict: "from_user,to_user" }
    );

    // Mutual?
    const { data: reciprocal } = await supabase
      .from("dating_likes")
      .select("id")
      .eq("from_user", current.user_id)
      .eq("to_user", me)
      .eq("status", "like")
      .maybeSingle();

    if (reciprocal) {
      setMatchWith(current);
      // store a match record (idempotent)
      const users = [me, current.user_id].sort();
      await supabase
        .from("dating_matches")
        .upsert(
          { user_a: users[0], user_b: users[1], created_at: new Date().toISOString() },
          { onConflict: "user_a,user_b" }
        );
    }

    advance();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading…
      </div>
    );
  }

  if (!current) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4">
        <Sparkles className="h-10 w-10 text-fuchsia-500" />
        <p className="text-xl">You’re all caught up.</p>
        <p className="text-zinc-400">Check back later as more people join.</p>
        <div className="flex gap-3 mt-4">
          <Button asChild variant="outline" className="border-zinc-700 text-zinc-300">
            <Link to="/dating/hearts">View your Hearts</Link>
          </Button>
          <Button asChild className="bg-gradient-to-r from-fuchsia-600 to-purple-600">
            <Link to="/dating">Back to home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const mainMedia = current.video_intro_url || current.avatar_url || current.photo_urls?.[0];

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="bg-zinc-950 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="relative h-[500px] bg-black">
              {current.video_intro_url ? (
                <video
                  src={current.video_intro_url}
                  className="w-full h-full object-cover"
                  playsInline
                  autoPlay
                  loop
                  muted
                />
              ) : mainMedia ? (
                <img src={mainMedia} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                  No media
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">
                    {current.display_name || "Someone"}
                    {current.show_age && current.dob ? `, ${ageFromDob(current.dob)}` : ""}
                  </h3>
                  {current.city && (
                    <span className="text-sm text-zinc-300 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {current.city}
                    </span>
                  )}
                </div>
                {current.bio && (
                  <p className="text-sm text-zinc-300 mt-1 line-clamp-3">{current.bio}</p>
                )}
              </div>
            </div>

            <div className="p-4 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={passProfile}
                className="h-14 w-14 rounded-full border-zinc-700"
              >
                <X className="h-7 w-7" />
              </Button>

              <Button
                size="icon"
                onClick={likeProfile}
                className="h-16 w-16 rounded-full bg-gradient-to-r from-fuchsia-600 to-purple-600"
              >
                <Heart className="h-7 w-7 text-white" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="h-14 w-14 rounded-full border-zinc-700"
                onClick={likeProfile}
                title="Super like (same as like for now)"
              >
                <Star className="h-7 w-7" />
              </Button>
            </div>

            <div className="px-4 pb-4 text-center text-sm text-zinc-500">
              {idx + 1} / {profiles.length}
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-4">
          <Button asChild variant="outline" className="border-zinc-700 text-zinc-300">
            <Link to="/dating/hearts">Go to your Hearts</Link>
          </Button>
        </div>
      </div>

      {/* quick match popup */}
      {matchWith && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="bg-zinc-950 border-zinc-800 w-full max-w-sm">
            <CardContent className="p-6 text-center space-y-3">
              <Sparkles className="h-10 w-10 mx-auto text-fuchsia-500" />
              <h3 className="text-xl font-semibold">It’s a match!</h3>
              <p className="text-zinc-300">
                You and <span className="text-white font-medium">
                  {matchWith.display_name || "this person"}
                </span>{" "}
                liked each other.
              </p>
              <div className="flex gap-3 justify-center pt-2">
                <Button onClick={() => setMatchWith(null)}>Keep browsing</Button>
                <Button asChild variant="outline" className="border-zinc-700 text-zinc-300">
                  <Link to="/messages">Send a message</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default DatingDiscover;
