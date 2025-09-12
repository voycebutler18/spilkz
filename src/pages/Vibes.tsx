// src/pages/Vibes.tsx
import * as React from "react";
import VibeComposer from "@/components/vibes/VibeComposer";
import VibeCard, { Vibe } from "@/components/vibes/VibeCard";
import { supabase } from "@/integrations/supabase/client";

export default function VibesPage() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<Vibe[]>([]);

  // helper: attach the author's profile to a vibe
  const hydrateProfile = React.useCallback(async (v: any): Promise<Vibe> => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, username, display_name, first_name, last_name, avatar_url") // ✅ include first/last
      .eq("id", v.user_id)
      .maybeSingle();
    return { ...v, profile: prof || null } as Vibe;
  }, []);

  const fetchVibes = React.useCallback(async () => {
    setLoading(true);
    try {
      // fetch latest vibes
      const { data, error } = await supabase
        .from("vibes")
        .select("id, user_id, content, mood, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const hydrated = await Promise.all((data ?? []).map(hydrateProfile));
      setRows(hydrated);
    } catch (e) {
      console.error("Failed to load vibes:", e);
    } finally {
      setLoading(false);
    }
  }, [hydrateProfile]);

  // initial load + realtime inserts
  React.useEffect(() => {
    fetchVibes();

    const ch = supabase
      .channel("live-vibes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibes" },
        async (payload) => {
          const hydrated = await hydrateProfile(payload.new);
          setRows((prev) => [hydrated, ...prev]);
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [fetchVibes, hydrateProfile]);

  return (
    <div className="min-h-screen bg-background">
      {/* ✅ No local Header/Footer here — AppLayout already provides them */}

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Composer */}
        <VibeComposer
          onPosted={async (newRow) => {
            if (newRow) {
              // Composer usually attaches profile; if not, hydrate it.
              const next =
                (newRow as Vibe).profile
                  ? (newRow as Vibe)
                  : await hydrateProfile(newRow);
              setRows((prev) => [next, ...prev]);
            } else {
              await fetchVibes();
            }
          }}
        />

        {/* Feed */}
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No vibes yet. Be the first!
          </div>
        ) : (
          <div className="grid gap-4">
            {rows.map((v) => (
              <VibeCard key={v.id} vibe={v} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
