import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import SplikCard from "@/components/splik/SplikCard";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Loader2, Utensils } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Profile = {
  id: string;
  username?: string | null;
  handle?: string | null;
  first_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type SplikRow = {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  likes_count: number | null;
  comments_count: number | null;
  created_at: string;
  is_food: boolean;
  boost_score?: number | null;
  profile?: Profile;
};

export default function Food() {
  const [spliks, setSpliks] = useState<SplikRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFood();
    // subscribe to counts so the page feels live
    const channel = supabase
      .channel("food-feed")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "spliks", filter: "is_food=eq.true" },
        (payload) => {
          setSpliks((prev) =>
            prev.map((s) =>
              s.id === (payload.new as any).id
                ? {
                    ...s,
                    likes_count: (payload.new as any).likes_count ?? 0,
                    comments_count: (payload.new as any).comments_count ?? 0,
                  }
                : s
            )
          );
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const fetchFood = async () => {
    setLoading(true);
    try {
      // Basic food list newest first
      const { data, error } = await supabase
        .from("spliks")
        .select("*")
        .eq("is_food", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // attach profiles
      const withProfiles = await Promise.all(
        (data || []).map(async (row: any) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", row.user_id)
            .maybeSingle();
          return { ...row, profile: profile || undefined } as SplikRow;
        })
      );

      setSpliks(withProfiles);
    } catch (e) {
      console.error("Failed to load food videos:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="w-full py-6 md:py-8">
        <div className="mx-auto max-w-7xl px-3 sm:px-4">
          <div className="mb-4 flex items-center gap-2">
            <Utensils className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Food</h1>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : spliks.length === 0 ? (
            <Card className="max-w-md mx-auto">
              <CardContent className="p-8 text-center">
                <Utensils className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No food videos yet</h3>
                <p className="text-muted-foreground">
                  Be the first to upload a delicious clip.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="w-full">
              <div className="max-w-[400px] sm:max-w-[500px] mx-auto space-y-4 md:space-y-6">
                {spliks.map((splik) => (
                  <SplikCard key={splik.id} splik={splik as any} />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
