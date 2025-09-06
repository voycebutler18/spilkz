import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SplikCard from "@/components/splik/SplikCard";
import { Loader2 } from "lucide-react";

type Splik = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  created_at: string;
  likes_count?: number | null;
  comments_count?: number | null;
  trim_start?: number | null;
  mood?: string | null;
  profile?: any;
};

const MOODS = ["happy", "chill", "hype", "romance", "aww", "funny", "excited", "relaxed", "inspired", "nostalgic", "motivated", "surprised", "sad", "angry", "cozy", "neutral"] as const;

export default function MoodPage() {
  const params = useParams<{ mood: string }>();
  const moodParam = (params.mood || "").toLowerCase();

  const [loading, setLoading] = useState(true);
  const [spliks, setSpliks] = useState<Splik[]>([]);

  const pretty = useMemo(() => {
    const found = MOODS.find((m) => m === moodParam);
    if (!found) return moodParam.charAt(0).toUpperCase() + moodParam.slice(1);
    // nice label for "neutral"
    return found === "neutral" ? "Neutral / Natural" : found.charAt(0).toUpperCase() + found.slice(1);
  }, [moodParam]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        // 1) fetch spliks by mood
        const { data: base, error } = await supabase
          .from("spliks")
          .select("*")
          .eq("status", "active")
          .eq("mood", moodParam)
          .order("created_at", { ascending: false })
          .limit(60);
        if (error) throw error;

        const rows = base || [];
        if (rows.length === 0) {
          setSpliks([]);
          return;
        }

        // 2) fetch profiles in one round trip
        const ids = Array.from(new Set(rows.map((r) => r.user_id)));
        const { data: profiles } = await supabase
          .from("profiles")
          .select("*")
          .in("id", ids);

        const map = new Map((profiles || []).map((p) => [p.id, p]));
        const withProfiles: Splik[] = rows.map((r) => ({ ...r, profile: map.get(r.user_id) }));
        if (mounted) setSpliks(withProfiles);
      } catch (e) {
        console.error(e);
        if (mounted) setSpliks([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [moodParam]);

  return (
    <div className="min-h-screen">
      <Helmet>
        <title>{pretty} — Mood • Splikz</title>
        <meta name="description" content={`Watch 3-second ${pretty} videos on Splikz`} />
      </Helmet>

      {/* Mood switcher quick links */}
      <div className="sticky top-[56px] z-20 bg-background/80 backdrop-blur border-b">
        <div className="mx-auto max-w-7xl px-3 py-2 flex gap-2 overflow-x-auto">
          {MOODS.map((m) => {
            const label = m === "neutral" ? "Neutral / Natural" : m.charAt(0).toUpperCase() + m.slice(1);
            const active = m === moodParam;
            return (
              <Button
                key={m}
                asChild
                size="sm"
                variant={active ? "default" : "outline"}
                className={active ? "" : "bg-background"}
              >
                <Link to={`/mood/${m}`}>{label}</Link>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-3 sm:px-4 py-6">
        <h1 className="text-2xl font-semibold mb-2">{pretty} mood</h1>
        <p className="text-sm text-muted-foreground mb-6">3-second clips tagged “{pretty}”.</p>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : spliks.length === 0 ? (
          <Card className="max-w-md">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">No videos yet for this mood.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="mx-auto max-w-[400px] sm:max-w-[500px] space-y-4 md:space-y-6">
            {spliks.map((s) => (
              <SplikCard key={s.id} splik={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
