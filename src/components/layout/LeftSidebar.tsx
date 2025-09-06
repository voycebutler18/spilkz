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
    <aside
      className="
        hidden md:block
        sticky top-14
        h-[calc(100vh-56px)] w-[260px]
        flex-shrink-0
      "
      aria-label="Left navigation"
    >
      {/* Shell keeps borders; inner div provides its own scroll */}
      <div className="h-full border-r border-border/60 bg-background/40 backdrop-blur-sm overflow-hidden">
        <div
          className="
            h-full overflow-y-auto overscroll-contain
            px-3 py-3
            [scrollbar-width:thin]
            [scrollbar-color:theme(colors.muted.DEFAULT)_transparent]
          "
        >
          {/* Create a Splik */}
          <Card className="border-white/10 bg-gradient-to-b from-white/5 to-transparent">
            <CardContent className="p-4">
              <div className="mb-2 text-sm font-semibold">Create a Splik</div>
              <p className="text-xs text-muted-foreground">
                Share a 3-second mood. Keep it crisp.
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link to="/upload">Upload</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Browse */}
          <div className="mt-4 border-t border-border/60 pt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
            Browse
          </div>

          <nav className="mt-1 space-y-1">
            <Link
              to="/explore"
              className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 block"
            >
              Discover
            </Link>
            <Link
              to="/food"
              className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 block"
            >
              Food
            </Link>
            <Link
              to="/brands"
              className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 block"
            >
              For Brands
            </Link>
            <Link
              to="/help"
              className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 block"
            >
              Help
            </Link>
            <Link
              to="/about"
              className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 block"
            >
              About
            </Link>
          </nav>

          {/* Me */}
          {user && (
            <>
              <div className="mt-5 text-[11px] uppercase tracking-wide text-muted-foreground">
                Me
              </div>
              <nav className="mt-1 space-y-1">
                <Link
                  to="/dashboard/favorites"
                  className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 block"
                >
                  My Favorites
                </Link>
                <Link
                  to="/messages"
                  className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 block"
                >
                  Messages
                </Link>
                {/* Settings removed per request */}
              </nav>
            </>
          )}

          {/* bottom padding so last item isn't under the scrollbar edge */}
          <div className="pb-6" />
        </div>
      </div>
    </aside>
  );
};

export default LeftSidebar;
