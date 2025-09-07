import * as React from "react";
import { useParams, Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { supabase } from "@/integrations/supabase/client";
import SplikCard from "@/components/splik/SplikCard";

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const [splik, setSplik] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id) return;

    (async () => {
      // 1) fetch the video
      const { data: v, error: vErr } = await supabase
        .from("spliks")
        .select("*")
        .eq("id", id)
        .eq("status", "active")
        .maybeSingle();

      if (vErr || !v) {
        setSplik(null);
        setLoading(false);
        return;
      }

      // 2) fetch the profile separately (no FK/relationship required)
      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", v.user_id)
        .maybeSingle();

      setSplik({ ...v, profile: p || null });
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center">Loading…</div>;
  }

  if (!splik) {
    return (
      <div className="min-h-screen grid place-items-center text-center p-6">
        <div>
          <h1 className="text-5xl font-bold mb-2">404</h1>
          <p className="mb-4">Oops! This splik doesn’t exist or isn’t public.</p>
          <Link to="/" className="underline">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="container py-6">
        <SplikCard splik={splik} />
      </main>
      <Footer />
    </>
  );
}
