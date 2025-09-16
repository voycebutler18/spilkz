import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, X, Loader2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Candidate = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  avatar_url: string | null;
  video_intro_url: string | null;
};

export default function DatingDiscover() {
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<Candidate[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      setMe(uid);
      if (!uid) return;

      const { data: feed, error } = await supabase.rpc("dating_feed_cards", {
        p_user_id: uid,
      });
      if (!error && feed) setCards(feed as Candidate[]);
      setLoading(false);
    })();
  }, []);

  const advance = () => setIdx((i) => Math.min(i + 1, cards.length));

  const act = async (targetId: string, status: "like" | "skip") => {
    if (!me) return;
    await supabase
      .from("dating_likes")
      .upsert(
        { liker_id: me, liked_id: targetId, status },
        { onConflict: "liker_id,liked_id" }
      );

    // If you liked, check for mutual
    if (status === "like") {
      const { data: reciprocal } = await supabase
        .from("dating_likes")
        .select("id")
        .eq("liker_id", targetId)
        .eq("liked_id", me)
        .eq("status", "like")
        .maybeSingle();

      if (reciprocal) {
        // optional: mark matched_at on both rows (best-effort)
        const now = new Date().toISOString();
        await supabase
          .from("dating_likes")
          .update({ matched_at: now })
          .or(
            `and(liker_id.eq.${me},liked_id.eq.${targetId}),and(liker_id.eq.${targetId},liked_id.eq.${me})`
          );
        // You can toast “It’s a match!” here.
      }
    }
    advance();
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-fuchsia-500" />
      </div>
    );
  }

  if (idx >= cards.length) {
    return (
      <div className="min-h-[60vh] grid place-items-center text-zinc-300">
        You’re all caught up. Check back later for more people.
      </div>
    );
  }

  const c = cards[idx];

  return (
    <div className="max-w-lg mx-auto p-4">
      <Card className="bg-zinc-950 border-zinc-800 overflow-hidden">
        <div className="h-96 bg-black">
          {c.video_intro_url ? (
            <video
              src={c.video_intro_url}
              className="w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : c.avatar_url ? (
            <img
              src={c.avatar_url}
              alt={c.display_name || "profile"}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-zinc-500">
              No media yet
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-semibold text-lg">
                {c.display_name || "Someone interesting"}
              </div>
              <div className="text-zinc-400 text-sm flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {c.city || "Somewhere"}
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                size="icon"
                variant="outline"
                className="h-12 w-12 border-zinc-700"
                onClick={() => act(c.user_id, "skip")}
              >
                <X className="h-6 w-6" />
              </Button>
              <Button
                size="icon"
                className="h-12 w-12 bg-gradient-to-r from-fuchsia-600 to-purple-600"
                onClick={() => act(c.user_id, "like")}
              >
                <Heart className="h-6 w-6 text-white" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
