import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type HeartRow = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  avatar_url: string | null;
  video_intro_url: string | null;
  matched: boolean;
};

export default function DatingHearts() {
  const [me, setMe] = useState<string | null>(null);
  const [rows, setRows] = useState<HeartRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      setMe(uid);
      if (!uid) return;

      // people I liked
      const { data: likes } = await supabase
        .from("dating_likes")
        .select("liked_id, matched_at")
        .eq("liker_id", uid)
        .eq("status", "like");

      const ids = (likes || []).map((l: any) => l.liked_id);
      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // exclude anyone who skipped me
      const { data: skips } = await supabase
        .from("dating_likes")
        .select("liker_id")
        .in("liker_id", ids)
        .eq("liked_id", uid)
        .eq("status", "skip");

      const skippedMe = new Set((skips || []).map((s: any) => s.liker_id));
      const filtered = ids.filter((id: string) => !skippedMe.has(id));

      // get profile cards for remaining
      const { data: cards } = await supabase.rpc("dating_feed_cards", {
        p_user_id: uid, // function ignores users already actioned by *me*, but we only need data
      });

      const map: Record<string, any> = {};
      (cards || []).forEach((c: any) => (map[c.user_id] = c));

      // mark mutual
      const { data: reciprocals } = await supabase
        .from("dating_likes")
        .select("liker_id")
        .eq("liked_id", uid)
        .eq("status", "like");

      const mutual = new Set((reciprocals || []).map((r: any) => r.liker_id));

      const out: HeartRow[] = filtered
        .map((id: string) => {
          const c = map[id];
          if (!c) return null;
          return {
            ...c,
            matched: mutual.has(id),
          } as HeartRow;
        })
        .filter(Boolean) as HeartRow[];

      setRows(out);
      setLoading(false);
    })();
  }, []);

  if (loading)
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-fuchsia-500" />
      </div>
    );

  if (!rows.length)
    return (
      <div className="min-h-[50vh] grid place-items-center text-zinc-300">
        No hearts yet. Like someone from Discover!
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto p-4 grid md:grid-cols-2 gap-4">
      {rows.map((r) => (
        <Card key={r.user_id} className="bg-zinc-950 border-zinc-800 overflow-hidden">
          <div className="h-52 bg-black">
            {r.video_intro_url ? (
              <video src={r.video_intro_url} className="w-full h-full object-cover" muted loop playsInline />
            ) : r.avatar_url ? (
              <img src={r.avatar_url} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-items-center text-zinc-600">No media</div>
            )}
          </div>
          <div className="p-3 flex items-center justify-between">
            <div>
              <div className="text-white font-semibold">{r.display_name || "User"}</div>
              <div className="text-zinc-400 text-sm">{r.city || "—"}</div>
            </div>
            {r.matched ? (
              <Badge className="bg-green-600/20 text-green-300 border-green-600/30">
                <Heart className="h-3 w-3 mr-1" /> Match
              </Badge>
            ) : (
              <Badge className="bg-fuchsia-600/20 text-fuchsia-300 border-fuchsia-600/30">
                Hearted
              </Badge>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
