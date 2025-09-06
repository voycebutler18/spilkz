import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import SplikCard from "@/components/splik/SplikCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

type Profile = {
  id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
};

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
  isBoosted?: boolean;
  boost_score?: number | null;
  mood?: string | null;
  profile?: Profile;
};

const MOODS = [
  { key: "all", label: "All" },
  { key: "Happy", label: "Happy" },
  { key: "Chill", label: "Chill" },
  { key: "Hype", label: "Hype" },
  { key: "Romance", label: "Romance" },
  { key: "Aww", label: "Aww" },
] as const;

export default function MoodsIndex() {
  const [loading, setLoading] = React.useState(true);
  const [spliks, setSpliks] = React.useState<Splik[]>([]);
  const [activeMood, setActiveMood] = React.useState<(typeof MOODS)[number]["key"]>("all");

  const fetchFeed = React.useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("spliks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);

      if (activeMood !== "all") {
        query = query.eq("mood", activeMood);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = data || [];

      // attach profiles
      const withProfiles: Splik[] = await Promise.all(
        rows.map(async (row: any) => {
          const { data: p } = await supabase
            .from("profiles")
            .select("id, username, first_name, last_name, avatar_url")
            .eq("id", row.user_id)
            .maybeSingle();
          return { ...row, profile: (p as Profile) || undefined };
        })
      );

      setSpliks(withProfiles);
    } finally {
      setLoading(false);
    }
  }, [activeMood]);

  React.useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  return (
    <div className="mx-auto w-full max-w-[520px] px-2 sm:px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Vibe Feed</h1>
        <p className="text-sm text-muted-foreground">
          Watch 3-second videos by mood. Pick your vibe 👇
        </p>
      </div>

      {/* Mood chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {MOODS.map((m) => (
          <Button
            key={m.key}
            size="sm"
            variant={activeMood === m.key ? "default" : "outline"}
            onClick={() => setActiveMood(m.key)}
          >
            {m.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
          <p className="text-sm text-muted-foreground">Loading {activeMood} vibes…</p>
        </div>
      ) : spliks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No videos yet for <span className="font-semibold">{activeMood}</span>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {spliks.map((s, i) => (
            <div key={`${s.id}-${i}`} className="relative">
              {/* optional pills (Fresh/Sponsored) could be added here if you set flags */}
              <SplikCard
                splik={s}
                onSplik={() => {}}
                onReact={() => {}}
                onShare={() => {
                  const url = `${window.location.origin}/video/${s.id}`;
                  navigator.clipboard.writeText(url);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
