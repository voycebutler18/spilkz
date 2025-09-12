// src/pages/Pulse.tsx
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import VibeComposer from "@/components/vibes/VibeComposer";
import VibeCard, { Vibe } from "@/components/vibes/VibeCard";

export default function Pulse() {
  const [rows, setRows] = React.useState<Vibe[]>([]);
  const [loading, setLoading] = React.useState(true);

  const hydrateProfile = React.useCallback(async (v: any): Promise<Vibe> => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, username, display_name, first_name, last_name, avatar_url")
      .eq("id", v.user_id)
      .maybeSingle();
    return { ...v, profile: prof || null } as Vibe;
  }, []);

  const fetchVibes = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vibes")
        .select("id, user_id, content, mood, created_at, image_url, media_url")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const hydrated = await Promise.all((data ?? []).map(hydrateProfile));
      setRows(hydrated);
    } finally {
      setLoading(false);
    }
  }, [hydrateProfile]);

  React.useEffect(() => {
    fetchVibes();
    const ch = supabase
      .channel("pulse-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibes" },
        async (payload) => {
          const hydrated = await hydrateProfile(payload.new);
          setRows((prev) => [hydrated, ...prev]);
        }
      )
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [fetchVibes, hydrateProfile]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-3xl">
        <h1 className="text-3xl font-bold mb-6">Pulse</h1>

        <div className="rounded-2xl border bg-card p-4 mb-6">
          <VibeComposer
            onPosted={async (newRow) => {
              if (newRow) {
                const next = (newRow as Vibe).profile
                  ? (newRow as Vibe)
                  : await hydrateProfile(newRow);
                setRows((prev) => [next, ...prev]);
              } else {
                await fetchVibes();
              }
            }}
          />
        </div>

        {loading ? (
          <div className="py-24 text-center text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-24 text-center text-muted-foreground">No posts yet</div>
        ) : (
          <div className="space-y-4">
            {rows.map((v) => (
              <div key={v.id} className="rounded-2xl border bg-card p-4">
                <VibeCard vibe={v} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
