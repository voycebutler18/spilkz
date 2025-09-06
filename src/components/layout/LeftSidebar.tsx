// src/components/layout/LeftSidebar.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const LeftSidebar: React.FC = () => {
  const [user, setUser] = React.useState<any>(null);

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(data.user ?? null);
    };
    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-56px)] w-[240px] flex-shrink-0 border-r border-border/60 p-3 md:flex">
      <div className="flex w-full flex-col gap-4">
        {/* Create a Splik card */}
        <Card className="border-white/10 bg-gradient-to-b from-white/5 to-transparent">
          <CardContent className="p-4">
            <div className="mb-3 text-sm font-semibold">Create a Splik</div>
            <p className="text-xs text-muted-foreground">
              Share a 3-second mood. Keep it crisp.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link to="/upload">Upload</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Section label */}
        <div className="mt-1 border-t border-border/60 pt-3 text-xs uppercase tracking-wide text-muted-foreground">
          Browse
        </div>

        {/* Vibe Feed (consolidated moods hub) */}
        <Link
          to="/moods"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/5"
        >
          <span className="h-2 w-2 rounded-full bg-violet-400" />
          <span>Vibe Feed</span>
        </Link>

        {/* Core navigation */}
        <Link
          to="/explore"
          className="rounded-lg px-3 py-2 text-sm hover:bg-white/5"
        >
          Discover
        </Link>
        <Link
          to="/food"
          className="rounded-lg px-3 py-2 text-sm hover:bg-white/5"
        >
          Food
        </Link>
        <Link
          to="/brands"
          className="rounded-lg px-3 py-2 text-sm hover:bg-white/5"
        >
          For Brands
        </Link>
        <Link
          to="/help"
          className="rounded-lg px-3 py-2 text-sm hover:bg-white/5"
        >
          Help
        </Link>
        <Link
          to="/about"
          className="rounded-lg px-3 py-2 text-sm hover:bg-white/5"
        >
          About
        </Link>

        <div className="my-2 h-px bg-border/60" />

        {/* Authed-only items */}
        {user && (
          <>
            <Link
              to="/dashboard/favorites"
              className="rounded-lg px-3 py-2 text-sm hover:bg-white/5"
            >
              My Favorites
            </Link>
            <Link
              to="/messages"
              className="rounded-lg px-3 py-2 text-sm hover:bg-white/5"
            >
              Messages
            </Link>
            <Link
              to="/settings"
              className="rounded-lg px-3 py-2 text-sm hover:bg-white/5"
            >
              Settings
            </Link>
          </>
        )}
      </div>
    </aside>
  );
};

export default LeftSidebar;
