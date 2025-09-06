// src/pages/moods/MoodPage.tsx
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import LeftSidebar from "@/components/layout/LeftSidebar";
import VideoFeed from "@/components/ui/VideoFeed";
import { supabase } from "@/integrations/supabase/client";

const MOODS = [
  { key: "happy",   label: "Happy" },
  { key: "chill",   label: "Chill" },
  { key: "hype",    label: "Hype" },
  { key: "romance", label: "Romance" },
  { key: "aww",     label: "Aww" },
];

export default function MoodPage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user ?? null));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Vibe Feed — Splikz</title>
        <meta name="description" content="Browse Splikz videos by mood in the Vibe Feed." />
      </Helmet>

      <Header />

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 md:grid-cols-[260px_1fr] gap-0">
        {/* Left, fixed rail */}
        <LeftSidebar />

        {/* Center content */}
        <main className="w-full px-3 md:px-6 py-4 md:py-6">
          <div className="max-w-[560px] mx-auto mb-4">
            <h1 className="text-xl md:text-2xl font-semibold">Vibe Feed</h1>
            <p className="text-sm text-muted-foreground">
              Pick a mood to shape your feed. (Filtering by mood is coming next.)
            </p>
          </div>

          {/* Mood chips (links keep UX consistent; we'll wire filtering next) */}
          <div className="max-w-[560px] mx-auto mb-5 flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <Link
                key={m.key}
                to={`/moods?m=${m.key}`}
                className="rounded-full border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5 transition"
              >
                {m.label}
              </Link>
            ))}
          </div>

          {/* Reuse your existing vertical feed component */}
          <div className="max-w-[560px] mx-auto">
            <VideoFeed user={user} />
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}
