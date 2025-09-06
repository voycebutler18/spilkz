import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import SplikCard from "@/components/splik/SplikCard";

type MoodKey = "happy" | "chill" | "hype" | "romance" | "aww";

const MOODS: Array<{ key: MoodKey; label: string; dot: string }> = [
  { key: "happy", label: "Happy",   dot: "bg-yellow-400" },
  { key: "chill", label: "Chill",   dot: "bg-sky-400" },
  { key: "hype",  label: "Hype",    dot: "bg-fuchsia-400" },
  { key: "romance", label: "Romance", dot: "bg-rose-400" },
  { key: "aww",   label: "Aww",     dot: "bg-orange-400" },
];

export default function MoodPage() {
  const { mood } = useParams<{ mood?: MoodKey }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spliks, setSpliks] = useState<any[]>([]);

  const activeMood = useMemo<MoodKey | undefined>(() => {
    if (!mood) return undefined;
    const valid = MOODS.find((m) => m.key === mood.toLowerCase());
    return valid?.key;
  }, [mood]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  useEffect(() => {
    loadFeed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMood]);

  const loadFeed = async (showToast: boolean) => {
    showToast ? setRefreshing(true) : setLoading(true);
    try {
      // base query
      let query = supabase
        .from("spliks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);

      // filter by mood if present
      if (activeMood) {
        query = query.eq("mood", activeMood);
      }

      const { data, error } = await query;
      if (error) throw error;

      // attach profiles (best-effort)
      const withProfiles = await Promise.all(
        (data ?? []).map(async (s) => {
          const { data: p } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", s.user_id)
            .maybeSingle();
          return { ...s, profile: p || undefined };
        })
      );

      setSpliks(withProfiles);
      if (showToast) {
        toast({
          title: "Feed updated",
          description: activeMood
            ? `Showing latest ${MOODS.find(m => m.key === activeMood)?.label} vibes`
            : "Showing latest across all moods",
        });
      }
    } catch (e) {
      console.error(e);
      setSpliks([]);
      toast({
        title: "Error",
        description: "Failed to load the vibe feed.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const headerTitle = activeMood
    ? `${MOODS.find(m => m.key === activeMood)?.label} — Vibe Feed`
    : "Vibe Feed — Explore by Mood";

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{headerTitle}</title>
        <meta
          name="description"
          content="Watch 3-second Spliks by mood: Happy, Chill, Hype, Romance, and Aww."
        />
      </Helmet>

      {/* Top controls: mood chips */}
      <div className="mx-auto w-full max-w-6xl px-3 sm:px-4 pt-4">
        <div className="mb-3">
          <h1 className="text-xl font-semibold">Vibe Feed</h1>
          <p className="text-sm text-muted-foreground">
            Tap a mood to filter. Uploads are categorized by creator mood.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeMood ? "outline" : "default"}
            size="sm"
            onClick={() => navigate("/moods")}
          >
            All moods
          </Button>
          {MOODS.map((m) => (
            <Link key={m.key} to={`/moods/${m.key}`}>
              <Button
                size="sm"
                variant={activeMood === m.key ? "default" : "outline"}
                className="flex items-center gap-2"
              >
                <span className={`h-2 w-2 rounded-full ${m.dot}`} />
                {m.label}
              </Button>
            </Link>
          ))}
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => loadFeed(true)}
              disabled={refreshing || loading}
              className="text-xs text-muted-foreground hover:text-primary"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>
      </div>

      {/* Feed */}
      <main className="w-full py-4 md:py-6 flex justify-center">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground">
              Loading {activeMood ? `${MOODS.find(m => m.key === activeMood)?.label} ` : ""}vibes…
            </p>
          </div>
        ) : spliks.length === 0 ? (
          <Card className="max-w-md mx-auto mx-4">
            <CardContent className="p-8 text-center">
              <h3 className="text-lg font-semibold mb-2">No Spliks yet</h3>
              <p className="text-muted-foreground">
                {activeMood
                  ? "Be the first to post this mood!"
                  : "Be the first to post a Splik!"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="w-full px-2 sm:px-4">
            <div className="max-w-[400px] sm:max-w-[500px] mx-auto space-y-4 md:space-y-6">
              {spliks.map((s, i) => (
                <SplikCard
                  key={`${s.id}-${i}`}
                  splik={s}
                  onSplik={() => {}}
                  onReact={() => {}}
                  onShare={() => {
                    const url = `${window.location.origin}/video/${s.id}`;
                    navigator.clipboard.writeText(url);
                    toast({ title: "Link copied!" });
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
