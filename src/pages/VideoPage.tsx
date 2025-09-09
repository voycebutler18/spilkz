// src/pages/VideoPage.tsx
import * as React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import SplikCard from "@/components/splik/SplikCard";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const [splik, setSplik] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    if (!id) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) Fetch the video row (active/public)
        const { data: v, error: vErr } = await supabase
          .from("spliks")
          .select("*")
          .eq("id", id)
          .eq("status", "active")
          .maybeSingle();

        if (vErr) throw vErr;
        if (!v) throw new Error("Video not found");

        // 2) Fetch profile (no FK requirement)
        const { data: p } = await supabase
          .from("profiles")
          .select("id, username, handle, display_name, first_name, avatar_url")
          .eq("id", v.user_id)
          .maybeSingle();

        if (!alive) return;
        setSplik({ ...v, profile: p || null });

        // Helpful tab title
        document.title = v.title ? `${v.title} — Splikz` : "Splikz Video";
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Failed to load video");
        setSplik(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  if (error || !splik) {
    return (
      <div className="min-h-screen grid place-items-center text-center p-6">
        <div>
          <h1 className="text-5xl font-bold mb-2">404</h1>
          <p className="mb-4">{error || "Oops! This Splik doesn’t exist or isn’t public."}</p>
          <Button asChild>
            <Link to="/home">Back to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Center the card so IntersectionObserver sees ≥70% (SplikCard autoplays correctly)
  return (
    <div className="min-h-[100svh] w-full flex items-center justify-center p-3">
      <div className="w-full max-w-[520px]">
        <SplikCard
          splik={splik}
          index={0}
          shouldLoad={true}
          onPrimaryVisible={() => {}}
          onSplik={() => {}}
          onReact={() => {}}
          onShare={() => {}}
        />
        <div className="mt-4 flex justify-center">
          <Button asChild variant="outline">
            <Link to="/home">Back to feed</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
