// src/components/search/SearchOmni.tsx
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type ProfileHit = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type VideoHit = {
  id: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
};

const DEBOUNCE_MS = 220;

const SearchOmni: React.FC = () => {
  const navigate = useNavigate();
  const [q, setQ] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [profiles, setProfiles] = React.useState<ProfileHit[]>([]);
  const [videos, setVideos] = React.useState<VideoHit[]>([]);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<number | undefined>(undefined);

  // Close panel when clicking outside
  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounced fetch
  React.useEffect(() => {
    window.clearTimeout(timerRef.current);
    if (!q || q.trim().length < 2) {
      setProfiles([]);
      setVideos([]);
      return;
    }
    timerRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        // Profiles by username/display name
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
          .limit(5);

        setProfiles((profs as any) || []);

        // Videos by title/description
        const { data: vids } = await supabase
          .from("spliks")
          .select("id, title, description, thumbnail_url")
          .eq("status", "active")
          .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
          .order("created_at", { ascending: false })
          .limit(6);

        setVideos((vids as any) || []);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const goSearch = (query: string) => {
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    setFocused(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && q.trim()) {
      goSearch(q);
    }
    if (e.key === "Escape") {
      setFocused(false);
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={onKeyDown}
        placeholder="Search people and videos"
        aria-label="Search people and videos"
        className="pl-8"
      />

      {/* Suggestions panel */}
      {focused && (q.trim().length >= 2 || loading) && (
        <div className="absolute left-0 right-0 mt-1 rounded-lg border bg-popover text-popover-foreground shadow-lg overflow-hidden">
          <div className="max-h-[60vh] overflow-auto">
            <section className="p-2">
              <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Profiles
              </p>
              {profiles.length === 0 && !loading && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No matching profiles
                </div>
              )}
              {profiles.map((p) => (
                <button
                  key={p.id}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent rounded-md text-left"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => navigate(`/creator/${p.username ?? p.id}`)}
                >
                  <Avatar className="h-8 w-8">
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
                </button>
              ))}
            </section>

            <div className="h-px bg-border" />

            <section className="p-2">
              <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Videos
              </p>
              {videos.length === 0 && !loading && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No matching videos
                </div>
              )}
              {videos.map((v) => (
                <button
                  key={v.id}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent rounded-md text-left"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => navigate(`/video/${v.id}`)}
                >
                  <div className="h-10 w-16 rounded bg-muted overflow-hidden flex-shrink-0">
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
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {v.title || "Untitled"}
                    </div>
                    {v.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {v.description}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </section>

            {q.trim() && (
              <>
                <div className="h-px bg-border" />
                <button
                  className="w-full px-3 py-2 text-sm hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => goSearch(q)}
                >
                  Search all for “{q.trim()}”
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchOmni;
