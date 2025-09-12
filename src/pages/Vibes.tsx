import * as React from "react";
import VibeComposer from "@/components/vibes/VibeComposer";
import VibeCard, { Vibe } from "@/components/vibes/VibeCard";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function VibesPage() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<Vibe[]>([]);

  const fetchVibes = React.useCallback(async () => {
    setLoading(true);
    try {
      // 1) Get vibes without a join (can’t be blocked by profiles RLS)
      const { data: vibes, error } = await supabase
        .from("vibes")
        .select("id, user_id, content, mood, created_at")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      const base: Vibe[] =
        (vibes ?? []).map((v: any) => ({ ...v, profile: null })) as Vibe[];

      // 2) Hydrate profiles in a separate query
      const userIds = Array.from(new Set(base.map((v) => v.user_id))).filter(Boolean);
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", userIds);

        const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
        base.forEach((v) => {
          (v as any).profile = map.get(v.user_id) ?? null;
        });
      }

      setRows(base);
    } catch (e) {
      console.error("vibes fetch failed:", e);
      setRows([]); // don’t leave stale UI
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchVibes();

    // Live inserts → prepend
    const ch = supabase
      .channel("live-vibes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibes" },
        async (payload) => {
          const v = payload.new as any;
          // hydrate just this profile
          let profile: any = null;
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .eq("id", v.user_id)
            .maybeSingle();
          if (prof) profile = prof;

          setRows((prev) => [{ ...v, profile }, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchVibes]);

  // Optimistic append from composer (works even if realtime is slow)
  const handlePosted = (newRow?: Vibe) => {
    if (newRow) {
      setRows((prev) => [newRow, ...prev]);
    } else {
      fetchVibes();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Vibes</h1>
          <p className="text-sm text-muted-foreground">
            Share how you're feeling — text only, separate from videos.
          </p>
        </div>

        {/* composer now passes the new row back so the list updates immediately */}
        <VibeComposer onPosted={handlePosted} />

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Loading vibes…</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No vibes yet. Be the first!</div>
        ) : (
          <div className="grid gap-4">
            {rows.map((v) => (
              <VibeCard key={v.id} vibe={v} />
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
