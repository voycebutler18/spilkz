// src/pages/Vibes.tsx (or VibesPage.tsx if that's your filename)
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
    const { data, error } = await supabase
      .from("vibes")
      .select(`
        id, user_id, content, mood, created_at,
        profile:profiles(id, username, display_name, avatar_url)
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && data) setRows(data as any);
    setLoading(false);
  }, []);

  // ✅ If the composer ever gives us the new row, append immediately; otherwise refresh.
  const handlePosted = React.useCallback(
    (maybeRow?: Partial<Vibe>) => {
      if (maybeRow && (maybeRow as any).id) {
        const next = maybeRow as Vibe;
        setRows((prev) => (prev.some((v) => v.id === next.id) ? prev : [next, ...prev]));
      } else {
        fetchVibes();
      }
    },
    [fetchVibes]
  );

  React.useEffect(() => {
    fetchVibes();

    // ✅ Realtime: append new insert immediately (with profile), no full refetch
    const ch = supabase
      .channel("live-vibes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibes" },
        async (payload) => {
          const r = payload.new as {
            id: string;
            user_id: string;
            content: string;
            mood?: string | null;
            created_at: string;
          };

          // hydrate profile so the card can render names/avatars right away
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .eq("id", r.user_id)
            .maybeSingle();

          const newVibe: Vibe = {
            id: r.id,
            user_id: r.user_id,
            content: r.content,
            mood: r.mood ?? null,
            created_at: r.created_at,
            // @ts-ignore (VibeCard expects this shape)
            profile: prof ?? null,
          };

          setRows((prev) => (prev.some((v) => v.id === newVibe.id) ? prev : [newVibe, ...prev]));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchVibes]);

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

        {/* ⬇️ was: onPosted={fetchVibes} — now a wrapper that still calls fetch if needed */}
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
