// src/pages/Search.tsx
import * as React from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

type VideoRow = {
  id: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  status?: string | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

const SearchPage: React.FC = () => {
  const [params] = useSearchParams();
  const q = (params.get("q") || "").trim();

  const [loading, setLoading] = React.useState(true);
  const [videos, setVideos] = React.useState<VideoRow[]>([]);
  const [profiles, setProfiles] = React.useState<ProfileRow[]>([]);

  React.useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const [vRes, pRes] = await Promise.all([
          supabase
            .from("spliks")
            .select("id, title, description, thumbnail_url, status")
            .eq("status", "active")
            .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
            .order("created_at", { ascending: false })
            .limit(36),
          supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
            .limit(24),
        ]);

        setVideos(((vRes.data as any) || []) as VideoRow[]);
        setProfiles(((pRes.data as any) || []) as ProfileRow[]);
      } finally {
        setLoading(false);
      }
    };

    if (q.length >= 1) run();
    else {
      setVideos([]);
      setProfiles([]);
      setLoading(false);
    }
  }, [q]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">
          Search results for <span className="text-primary">“{q || "…" }”</span>
        </h1>

        {loading && (
          <div className="py-12 text-muted-foreground">Searching…</div>
        )}

        {!loading && q && (
          <>
            {/* Videos */}
            <section className="mb-10">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Videos</h2>
                <span className="text-sm text-muted-foreground">
                  {videos.length}
                </span>
              </div>

              {videos.length === 0 ? (
                <Card className="p-8 text-sm text-muted-foreground">
                  No videos matched your search.
                </Card>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {videos.map((v) => (
                    <Link
                      key={v.id}
                      to={`/video/${v.id}`}
                      className="group rounded-lg overflow-hidden border hover:shadow-md transition-shadow"
                    >
                      <div className="aspect-[9/16] bg-muted">
                        {v.thumbnail_url ? (
                          <img
                            src={v.thumbnail_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full bg-gradient-to-br from-muted to-muted-foreground/20" />
                        )}
                      </div>
                      <div className="p-2">
                        <div className="text-xs font-medium truncate">
                          {v.title || "Untitled"}
                        </div>
                        {v.description && (
                          <div className="text-[11px] text-muted-foreground truncate">
                            {v.description}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Creators */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Creators</h2>
                <span className="text-sm text-muted-foreground">
                  {profiles.length}
                </span>
              </div>

              {profiles.length === 0 ? (
                <Card className="p-8 text-sm text-muted-foreground">
                  No creators matched your search.
                </Card>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {profiles.map((p) => (
                    <Link
                      key={p.id}
                      to={`/creator/${p.username ?? p.id}`}
                      className="flex items-center gap-3 rounded-lg border p-3 hover:shadow transition-shadow"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={p.avatar_url ?? undefined} />
                        <AvatarFallback>
                          {(p.display_name?.[0] || p.username?.[0] || "U").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {p.display_name || p.username || "User"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          @{p.username ?? "unknown"}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {!loading && !q && (
          <Card className="p-8 text-sm text-muted-foreground">
            Type something in the search box.
          </Card>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default SearchPage;
