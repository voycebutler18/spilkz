
// src/pages/VideoPage.tsx
import * as React from "react";
import { useParams, Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { supabase } from "@/integrations/supabase/client";
import SplikCard from "@/components/splik/SplikCard";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  avatar_url?: string | null;
};

type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  created_at: string;
  trim_start?: number | null;
  trim_end?: number | null;
  status?: string | null;
  profile?: Profile | null; // attached after fetch
};

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const [splik, setSplik] = React.useState<Splik | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id) return;

    let cancelled = false;
    (async () => {
      setLoading(true);

      // 1) Fetch the video row (public/active only)
      const { data: v, error: vErr } = await supabase
        .from("spliks")
        .select(
          "id,user_id,title,description,video_url,thumbnail_url,created_at,trim_start,trim_end,status"
        )
        .eq("id", id)
        .eq("status", "active")
        .maybeSingle<Splik>();

      if (cancelled) return;

      if (vErr || !v) {
        setSplik(null);
        setLoading(false);
        return;
      }

      // 2) Fetch creator profile (minimal fields)
      const { data: p } = await supabase
        .from("profiles")
        .select("id,username,display_name,first_name,avatar_url")
        .eq("id", v.user_id)
        .maybeSingle<Profile>();

      if (cancelled) return;

      setSplik({ ...v, profile: p || null });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!splik) {
    return (
      <div className="min-h-screen grid place-items-center text-center p-6">
        <div>
          <h1 className="text-5xl font-bold mb-2">404</h1>
          <p className="mb-4">Oops! This video doesn’t exist or isn’t public.</p>
          <Link to="/home" className="underline">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="container py-6">
        {/* SplikCard: comments-removed version (hype / share / save) */}
        <SplikCard splik={splik} />
      </main>
      <Footer />
    </>
  );
}
