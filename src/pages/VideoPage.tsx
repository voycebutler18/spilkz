import * as React from "react";
import { useParams, Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { supabase } from "@/integrations/supabase/client";
import SplikCard from "@/components/splik/SplikCard"; // ← make sure this path matches your file

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const [splik, setSplik] = React.useState<any>(null);
  const [reason, setReason] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      setReason(null);

      // 1) get the video itself
      const { data: video, error: vErr } = await supabase
        .from("spliks")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (vErr) {
        setReason(vErr.message);
        setSplik(null);
        setLoading(false);
        return;
      }
      if (!video) {
        setReason("Not found or not public");
        setSplik(null);
        setLoading(false);
        return;
      }

      // 2) (best-effort) get the creator profile; page still renders if this fails
      let profile: any = null;
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", video.user_id)
        .maybeSingle();

      if (!pErr) profile = prof ?? null;

      setSplik({ ...video, profile });
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
          <p className="mb-1">Oops! This splik doesn’t exist or isn’t public.</p>
          {reason && (
            <p className="mb-4 text-xs text-muted-foreground">
              Reason: {reason}
            </p>
          )}
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
