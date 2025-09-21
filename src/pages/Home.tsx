// src/pages/Home.tsx (or Index.tsx if that's your home route)
import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SplikCard from "@/components/splik/SplikCard";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Make sure this exports a configured supabase client and (optionally) Splik type
import { supabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
};

type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string | null;
  thumbnail_url?: string | null;
  created_at?: string | null;
  mime_type?: string | null;
  // joined
  profile?: Profile | null;
};

export default function Home() {
  const [spliks, setSpliks] = useState<Splik[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);

        // If you only want *videos*, keep the OR below; otherwise remove .or(...)
        const { data, error } = await supabase
          .from("spliks")
          .select(
            `
            *,
            profile:profiles(*)
          `
          ) // assumes FK: spliks.user_id -> profiles.id
          .or("video_url.not.is.null,mime_type.ilike.video/%")
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (!mounted) return;

        // Ensure shape matches our Splik type
        const rows = (data || []).map((r: any) => ({
          ...r,
          profile: r.profile ?? null,
        })) as Splik[];

        setSpliks(rows);
      } catch (e) {
        console.error("Error fetching spliks:", e);
        toast({
          title: "Error",
          description: "Failed to load the feed. Please refresh.",
          variant: "destructive",
        });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="min-h-[calc(100vh-8rem)]">
        {/* Hero */}
        <div className="bg-gradient-to-b from-primary/10 to-background py-12 px-4">
          <div className="container max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-4">
              Short. Sweet. Viral.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8">
              Say it in 3 seconds. Share gesture loops that speak louder than words.
            </p>
          </div>
        </div>

        {/* Centered feed column – videos hug the middle with a small gutter */}
        <div className="container mx-auto py-8 px-4">
          <div className="max-w-[680px] mx-auto">
            {spliks.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-xl text-muted-foreground">No videos at the moment</p>
              </div>
            ) : (
              <div className="space-y-8">
                {spliks.map((splik) => (
                  <SplikCard
                    key={splik.id}
                    splik={splik}
                    onSplik={() => {}}
                    onReact={() => {}}
                    onShare={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
