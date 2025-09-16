import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, X, MapPin, Play, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type FeedCard = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  avatar_url: string | null;
  video_intro_url: string | null;
};

const DatingDiscover: React.FC = () => {
  const nav = useNavigate();
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<FeedCard[]>([]);
  const [busy, setBusy] = useState(false);

  // load current user + feed
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      if (!uid) return nav("/login");
      if (!alive) return;
      setMe(uid);

      // pull cards from RPC (make sure the SQL func exists)
      const { data: rows, error } = await supabase
        .rpc("dating_feed_cards", { p_user_id: uid });
      if (!alive) return;
      if (error) {
        console.error(error);
      } else {
        setCards(rows ?? []);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [nav]);

  const current = cards[0] ?? null;
  const name = useMemo(
    () => (current?.display_name?.trim() || "Someone"),
    [current]
  );

  const act = async (type: "like" | "pass") => {
    if (!me || !current) return;
    if (busy) return;
    setBusy(true);

    try {
      // save action
      const { error } = await supabase.from("dating_likes").insert({
        liker_id: me,
        liked_id: current.user_id,
        action: type,
      });
      if (error) throw error;

      // if LIKE, check for match
      if (type === "like") {
        const { data: back } = await supabase
          .from("dating_likes")
          .select("id")
          .eq("liker_id", current.user_id)
          .eq("liked_id", me)
          .eq("action", "like")
          .maybeSingle();

        if (back) {
          alert(`It's a match with ${name}! 🎉`);
          // (optionally) jump to hearts
          // nav("/dating/hearts");
        }
      }

      // drop this card and move on
      setCards((old) => old.slice(1));
    } catch (e) {
      console.error(e);
      alert("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-zinc-300">Loading people near you…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-500 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Discover</h1>
            <p className="text-sm text-zinc-400">Swipe through 3-sec vibes</p>
          </div>
        </div>

        <Link to="/dating/hearts">
          <Button variant="outline" className="border-zinc-700 text-zinc-300">
            My Hearts
          </Button>
        </Link>
      </div>

      {!current ? (
        <Card className="max-w-2xl mx-auto bg-zinc-950 border-zinc-800">
          <CardContent className="p-10 text-center space-y-4">
            <div className="text-2xl">You’re all caught up 🎉</div>
            <p className="text-zinc-400">
              No more cards right now. Check your{" "}
              <Link to="/dating/hearts" className="underline">
                Hearts
              </Link>{" "}
              or come back later.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="max-w-2xl mx-auto">
          <Card className="bg-zinc-950 border-zinc-800 overflow-hidden">
            <div className="relative h-[520px] bg-black">
              {current.video_intro_url ? (
                <video
                  src={current.video_intro_url}
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : current.avatar_url ? (
                <img
                  src={current.avatar_url}
                  alt={name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                  <Avatar className="h-32 w-32">
                    <AvatarImage />
                    <AvatarFallback className="text-3xl bg-zinc-800">
                      {name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}

              {current.video_intro_url && (
                <Badge className="absolute top-4 left-4 bg-fuchsia-600">
                  <Play className="h-3 w-3 mr-1" />
                  3s intro
                </Badge>
              )}

              <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/70 to-transparent">
                <div className="text-white text-xl font-semibold">
                  {name}
                </div>
                <div className="text-zinc-300 text-sm flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {current.city || "Nearby"}
                </div>
              </div>
            </div>

            <CardContent className="p-5">
              <div className="flex items-center justify-center gap-6">
                <Button
                  size="lg"
                  disabled={busy}
                  onClick={() => act("pass")}
                  className="h-14 w-14 rounded-full bg-white/10 border border-white/20 hover:bg-white/20"
                  variant="outline"
                  title="Pass"
                >
                  <X className="h-6 w-6 text-white" />
                </Button>

                <Button
                  size="lg"
                  disabled={busy}
                  onClick={() => act("like")}
                  className="h-16 w-16 rounded-full bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 shadow-lg shadow-fuchsia-500/25"
                  title="Heart"
                >
                  <Heart className="h-7 w-7 text-white" />
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
