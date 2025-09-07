import * as React from "react";
import { useParams, Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { supabase } from "@/integrations/supabase/client";
import SplikCard from "@/components/SplikCard";

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const [splik, setSplik] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("spliks")
        .select("*, profile:profiles(*)")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("VideoPage select error:", error);
        setError(error.message);
      }
      setSplik(data ?? null);
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
          <p className="mb-2">Oops! This splik doesn’t exist or isn’t public.</p>
          {error && <p className="text-xs text-muted-foreground">Reason: {error}</p>}
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
