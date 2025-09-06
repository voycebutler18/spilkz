import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import LeftSidebar from "@/components/layout/LeftSidebar";
import { supabase } from "@/integrations/supabase/client";
import SplikCard from "@/components/splik/SplikCard";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Splik = {
  id: string;
  title: string;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  user_id: string;
  created_at: string;
};

const MOODS: Record<
  string,
  { label: string; keywords: string[]; hue: number }
> = {
  happy:   { label: "Happy",   keywords: ["happy", "joy", "smile", "good vibes"], hue: 48 },
  chill:   { label: "Chill",   keywords: ["chill", "calm", "lofi", "relax"],      hue: 190 },
  hype:    { label: "Hype",    keywords: ["hype", "energy", "turn up", "wow"],    hue: 280 },
  romance: { label: "Romance", keywords: ["romance", "love", "date", "kiss"],     hue: 340 },
  aww:     { label: "Aww",     keywords: ["aww", "cute", "adorable", "wholesome"],hue: 20 },
};

export default function MoodPage() {
  const { slug = "happy" } = useParams();
  const mood = MOODS[slug.toLowerCase()] ?? MOODS.happy;

  const [spliks, setSpliks] = useState<Splik[]>([]);
  const [loading, setLoading] = useState(true);

  const orFilter = useMemo(() => {
    // Build a PostgREST OR filter across title/description for each keyword
    // e.g. title.ilike.%happy%,description.ilike.%happy%,title.ilike.%joy%,...
    return mood.keywords
      .map((k) => `title.ilike.%${k}%,description.ilike.%${k}%`)
      .join(",");
  }, [mood]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        // If your DB later has a dedicated "mood" column, swap to: .ilike('mood', mood.label)
        const { data, error } = await supabase
          .from("spliks")
          .select("id,title,description,video_url,thumbnail_url,user_id,created_at")
          .or(orFilter)
          .order("created_at", { ascending: false })
          .limit(60);

        if (error) throw error;
        if (!mounted) return;
        setSpliks(data || []);
      } catch (e) {
        console.error("Mood feed error:", e);
        if (!mounted) setSpliks([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [orFilter]);

  const MoodChip = ({ to, label, hue }: { to: string; label: string; hue: number }) => (
    <Link
      to={to}
      className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-foreground/80 hover:bg-white/10 hover:text-foreground transition"
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: `hsl(${hue} 90% 55%)` }} />
      <span>{label}</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="mx-auto grid max-w-7xl grid-cols-1 md:grid-cols-[224px_1fr]">
        <LeftSidebar />

        <main className="w-full px-3 sm:px-4 py-4 md:py-6">
          {/* Top strip: mood title + quick switcher */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: `hsl(${mood.hue} 90% 55%)` }}
              />
              <h1 className="text-xl font-semibold tracking-tight">{mood.label} — 3-Second Moods</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <MoodChip to="/moods/happy" label="Happy" hue={MOODS.happy.hue} />
              <MoodChip to="/moods/chill" label="Chill" hue={MOODS.chill.hue} />
              <MoodChip to="/moods/hype" label="Hype" hue={MOODS.hype.hue} />
              <MoodChip to="/moods/romance" label="Romance" hue={MOODS.romance.hue} />
              <MoodChip to="/moods/aww" label="Aww" hue={MOODS.aww.hue} />
            </div>
          </div>

          {/* Feed */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Loading {mood.label} videos…</p>
            </div>
          ) : spliks.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-background/40 p-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                Nothing tagged for <span className="font-semibold">{mood.label}</span> yet.
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button asChild>
                  <Link to="/upload">Upload a {mood.label} Splik</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/">Back to Home</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-w-[400px] sm:max-w-[500px] mx-auto space-y-4 md:space-y-6">
              {spliks.map((s) => (
                <SplikCard key={s.id} splik={s as any} />
              ))}
            </div>
          )}
        </main>
      </div>

      <Footer />
    </div>
  );
}
